import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { resolveCostMaterialPriceType } from './cost-material-price';
import { currentCatalogCache, withCatalogCache } from '../../data-store/firestore-catalog-cache';
import { DataStoreConfig } from '../../data-store/data-store.config';
import { FirestoreDocumentStore } from '../../data-store/firestore.document-store';
import { MaterialPriceType } from '@prisma/client';
import {
  calculateCitaMdfCost,
  type CitaMaterialPriceType,
} from '../../calculation-engine/calculators/cita-mdf-calculator';
import { CitaNetService } from './cita-net.service';
import { CitaRawMaterialPriceMissingException } from './cita-mdf.errors';
import { resolveCostMaterialPrice } from './current-material-price';
import type { CitaNetQueryDto } from './dto/cita-net-query.dto';
import { PrismaService } from '../../prisma/prisma.service';

/** Üretim maliyeti daima CARD_INSTALLMENT. CASH parametresi fiyata düşmez. */
export function resolveCitaMaterialPriceType(
  value?: string | null,
): CitaMaterialPriceType {
  return resolveCostMaterialPriceType(value);
}

@Injectable()
export class CitaMdfService {
  constructor(
    private readonly citaNetService: CitaNetService,
    private readonly prisma: PrismaService,
    @Optional() private readonly dataStore?: DataStoreConfig,
    @Optional() private readonly firestoreStore?: FirestoreDocumentStore,
  ) {}

  /**
   * NET resolver'ı reuse eder; seçilen aktif alış fiyatını / netQty ekler.
   * materialPriceType yoksa CARD_INSTALLMENT. Diğer türe düşülmez.
   * Custom ölçü ve fiyat değişimi DB master'ına yazılmaz.
   */
  async getMdfCost(query: CitaNetQueryDto, now: Date = new Date()) {
    if (this.dataStore?.isFirestore() && this.firestoreStore && !currentCatalogCache()) {
      return withCatalogCache(this.firestoreStore, () => this.computeMdfCost(query, now));
    }
    return this.computeMdfCost(query, now);
  }

  private async computeMdfCost(query: CitaNetQueryDto, now: Date) {
    const materialPriceType = resolveCitaMaterialPriceType(query.materialPriceType);
    const net = await this.citaNetService.resolveNet(query);

    const { sourceMaterialWithPrices } = await import('../../data-store/firestore-source-bridge');
    const material = await sourceMaterialWithPrices(
      this.prisma,
      net.rawMaterial.code,
      materialPriceType as MaterialPriceType,
    );
    if (!material?.isActive) {
      throw new NotFoundException(
        `Aktif ham madde bulunamadı: ${net.rawMaterial.code}`,
      );
    }

    const currentPrice = resolveCostMaterialPrice(material.prices, now);
    if (!currentPrice) {
      throw new CitaRawMaterialPriceMissingException(
        material.code,
        materialPriceType,
      );
    }

    return calculateCitaMdfCost({
      productCode: net.productCode,
      thicknessMm: net.thicknessMm,
      widthMm: net.widthMm,
      lengthMm: net.lengthMm,
      rawMaterial: {
        code: material.code,
        thicknessMm: material.thicknessMm.toString(),
        sheetWidthMm: material.sheetWidthMm,
        sheetLengthMm: material.sheetLengthMm,
      },
      cut: {
        bladeAllowanceMm: net.bladeAllowanceMm,
        countSideMm: net.countSideMm,
        effectiveCutPitchMm: net.effectiveCutPitchMm,
      },
      productionYield: {
        netQty: net.netQty,
        source: net.source,
      },
      sheetPrice: {
        priceType: materialPriceType,
        amount: currentPrice.price.toString(),
      },
    });
  }
}
