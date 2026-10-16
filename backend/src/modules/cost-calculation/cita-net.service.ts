import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { currentCatalogCache, withCatalogCache } from '../../data-store/firestore-catalog-cache';
import { DataStoreConfig } from '../../data-store/data-store.config';
import { FirestoreDocumentStore } from '../../data-store/firestore.document-store';
import { decimalToString, toDecimal } from '../../common/decimal/decimal.util';
import {
  calculateCitaCutRuleNet,
  citaMaterialCodeForThickness,
  CITA_NET_FORBIDDEN_MATERIAL_CODES,
  CITA_NET_PRODUCT_CODE,
  integerMmOrNull,
  parseCitaLengthMm,
  parseCitaThicknessMm,
  parseCitaWidthMm,
  type CitaNetSource,
} from '../../calculation-engine/calculators/cita-net-calculator';
import { CITA_CUT_RULE, CITA_SHEET_MM } from '../products/cita-cut-rule.fixture';
import { CITA_PRODUCT_GROUP_SEED, CITA_PRODUCT_SEED } from '../products/cita-product-seed';
import { PrismaService } from '../../prisma/prisma.service';
import type { CitaNetQueryDto } from './dto/cita-net-query.dto';

export type CitaNetResult = {
  productCode: typeof CITA_NET_PRODUCT_CODE;
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  rawMaterial: {
    code: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
  };
  bladeAllowanceMm: number;
  countSideMm: number;
  effectiveCutPitchMm: string;
  netQty: number;
  source: CitaNetSource;
};

@Injectable()
export class CitaNetService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly dataStore?: DataStoreConfig,
    @Optional() private readonly firestoreStore?: FirestoreDocumentStore,
  ) {}

  /**
   * Aktif CITA product-scoped MASTER varsa onu kullanır; yoksa cut rule.
   * Custom ölçü ProductSize / ProductionYield / Recipe yazmaz.
   */
  async resolveNet(query: CitaNetQueryDto): Promise<CitaNetResult> {
    if (this.dataStore?.isFirestore() && this.firestoreStore && !currentCatalogCache()) {
      return withCatalogCache(this.firestoreStore, () => this.resolveNet(query));
    }
    const thicknessMm = parseCitaThicknessMm(query.thicknessMm);
    const widthMm = parseCitaWidthMm(query.widthMm);
    const lengthMm = parseCitaLengthMm(query.lengthMm);
    const cut = calculateCitaCutRuleNet(widthMm);
    const materialCode = citaMaterialCodeForThickness(thicknessMm);

    const { product, material } = await this.requireCitaContext(materialCode);

    const masterNetQty = await this.findActiveProductMasterNetQty({
      productId: product.id,
      rawMaterialId: material.id,
      materialCode: material.code,
      widthMm,
    });

    const source: CitaNetSource =
      masterNetQty == null ? 'CALCULATED_CUT_RULE' : 'MASTER';
    const netQty = masterNetQty ?? cut.netQty;

    return {
      productCode: CITA_NET_PRODUCT_CODE,
      thicknessMm: decimalToString(toDecimal(thicknessMm)),
      widthMm: decimalToString(widthMm),
      lengthMm: decimalToString(lengthMm),
      rawMaterial: {
        code: material.code,
        sheetWidthMm: material.sheetWidthMm,
        sheetLengthMm: material.sheetLengthMm,
      },
      bladeAllowanceMm: cut.bladeAllowanceMm,
      countSideMm: cut.countSideMm,
      effectiveCutPitchMm: decimalToString(cut.effectiveCutPitchMm),
      netQty,
      source,
    };
  }

  private async requireCitaContext(materialCode: string) {
    const { sourceGroupByCode, sourceProductByGroupCode, sourceMaterialByCodeExact } = await import(
      '../../data-store/firestore-source-bridge'
    );
    const group = await sourceGroupByCode(this.prisma, CITA_PRODUCT_GROUP_SEED.code);
    const product = group
      ? await sourceProductByGroupCode(this.prisma, group.id, CITA_PRODUCT_SEED.code)
      : null;

    if (!group?.isActive || !product?.isActive) {
      throw new NotFoundException('Aktif CITA ürünü bulunamadı.');
    }

    const material = await sourceMaterialByCodeExact(this.prisma, materialCode);
    if (!material?.isActive) {
      throw new NotFoundException(`Aktif ham madde bulunamadı: ${materialCode}`);
    }
    if (
      (CITA_NET_FORBIDDEN_MATERIAL_CODES as readonly string[]).includes(
        material.code,
      )
    ) {
      throw new BadRequestException(
        `Çıta bu ham maddeyi kullanmaz: ${material.code}`,
      );
    }
    if (
      material.sheetWidthMm !== CITA_SHEET_MM.widthMm ||
      material.sheetLengthMm !== CITA_SHEET_MM.lengthMm
    ) {
      throw new BadRequestException(
        `Çıta yalnız ${CITA_SHEET_MM.widthMm}×${CITA_SHEET_MM.lengthMm} mm MDF kullanır. ` +
          `${material.code} tabakası ${material.sheetWidthMm}×${material.sheetLengthMm} mm.`,
      );
    }

    return { product, material };
  }

  private async findActiveProductMasterNetQty(input: {
    productId: string;
    rawMaterialId: string;
    materialCode: string;
    widthMm: ReturnType<typeof parseCitaWidthMm>;
  }): Promise<number | null> {
    const pieceWidthMm = integerMmOrNull(input.widthMm);
    if (pieceWidthMm == null) {
      return null;
    }

    const { currentCatalogCache } = await import('../../data-store/firestore-catalog-cache');
    const cache = currentCatalogCache();
    const masters = cache
      ? cache
          .productYields(input.productId)
          .filter(
            (row) =>
              row.rawMaterialId === input.rawMaterialId &&
              Number(row.pieceWidthMm) === pieceWidthMm &&
              Number(row.pieceLengthMm) === CITA_CUT_RULE.pieceLengthMm,
          )
      : await this.prisma.productionYield.findMany({
          where: {
            productId: input.productId,
            rawMaterialId: input.rawMaterialId,
            pieceWidthMm,
            pieceLengthMm: CITA_CUT_RULE.pieceLengthMm,
            isActive: true,
          },
        });

    if (masters.length > 1) {
      throw new BadRequestException(
        `CITA için aynı ham madde ve ölçüde birden fazla aktif MASTER var: ` +
          `${input.materialCode} / ${pieceWidthMm}×${CITA_CUT_RULE.pieceLengthMm}.`,
      );
    }

    const master = masters[0];
    if (!master) {
      return null;
    }
    const netQty = Number(master.netQty);
    if (!Number.isInteger(netQty) || netQty < 1) {
      throw new BadRequestException(
        `CITA MASTER NET adedi geçersiz: ${input.materialCode} / ${pieceWidthMm}×${CITA_CUT_RULE.pieceLengthMm}.`,
      );
    }
    return netQty;
  }
}
