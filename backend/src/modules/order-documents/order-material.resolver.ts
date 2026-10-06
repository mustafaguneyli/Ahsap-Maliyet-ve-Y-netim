import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CitaNetService } from '../cost-calculation/cita-net.service';
import { AYARLI_PERVAZ_KILCIK_MATERIAL_CODE } from '../pervaz/ayarli-pervaz-kilcik-yield-seed';
import { PervazQtyService } from '../pervaz/pervaz-qty.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpsertOrderDocumentDto } from './dto/upsert-order-document.dto';
import {
  doorFrameMaterialCodes,
  type MaterialComponent,
} from './order-material-plan';

type LineInput = UpsertOrderDocumentDto['lines'][number];

@Injectable()
export class OrderMaterialResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly citaNetService: CitaNetService,
    private readonly pervazQtyService: PervazQtyService,
  ) {}

  async resolve(
    tx: Prisma.TransactionClient,
    line: LineInput,
  ): Promise<MaterialComponent[] | null> {
    if (line.kind !== 'CATALOG' || !line.productId) return null;
    const product = await tx.product.findFirst({
      where: { id: line.productId, isActive: true },
      include: { productGroup: true },
    });
    if (!product) return null;

    const widthMm = integerMm(line.widthMm);
    const lengthMm = integerMm(line.lengthMm);
    const recipe = await this.recipeComponents(tx, product.id, widthMm, lengthMm);
    if (recipe) return recipe;

    if (product.productGroup.code === 'door_frame' && widthMm != null && lengthMm != null) {
      return this.doorFrameComponents(tx, product.code, widthMm, lengthMm);
    }
    if (product.productGroup.code === 'PERVAZ' && widthMm != null && lengthMm != null) {
      return this.pervazComponents(tx, product, line.thicknessMm, widthMm, lengthMm);
    }
    if (product.productGroup.code === 'SUPURGELIK' && widthMm != null && lengthMm != null) {
      return this.supurgelikComponents(tx, line.thicknessMm, widthMm, lengthMm);
    }
    if (product.productGroup.code === 'CITA' && widthMm != null && lengthMm != null && line.thicknessMm) {
      return this.citaComponents(line.thicknessMm, widthMm, lengthMm);
    }
    return null;
  }

  private async recipeComponents(
    tx: Prisma.TransactionClient,
    productId: string,
    widthMm: number | null,
    lengthMm: number | null,
  ): Promise<MaterialComponent[] | null> {
    if (widthMm == null || lengthMm == null) return null;
    const size = await tx.productSize.findUnique({
      where: { widthMm_lengthMm: { widthMm, lengthMm } },
    });
    if (!size) return null;
    const recipe = await tx.recipe.findFirst({
      where: { productId, productSizeId: size.id, isActive: true },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { rawMaterial: true, productionYield: true },
        },
      },
    });
    if (!recipe || recipe.items.length === 0) return null;
    return recipe.items.map((item) => ({
      role: 'RECETE',
      rawMaterialId: item.rawMaterialId,
      materialName: item.rawMaterial.name,
      thicknessMm: item.rawMaterial.thicknessMm.toString(),
      sheetWidthMm: item.rawMaterial.sheetWidthMm,
      sheetLengthMm: item.rawMaterial.sheetLengthMm,
      surfaceType: item.rawMaterial.surfaceType,
      piecesPerUnit: item.quantity.toString(),
      netQty: item.productionYield?.isActive ? item.productionYield.netQty : null,
    }));
  }

  private async doorFrameComponents(
    tx: Prisma.TransactionClient,
    productCode: string,
    widthMm: number,
    lengthMm: number,
  ): Promise<MaterialComponent[] | null> {
    const codes = doorFrameMaterialCodes(productCode, widthMm, lengthMm);
    if (!codes) return null;
    const components: MaterialComponent[] = [];
    for (const part of codes) {
      const material = await tx.rawMaterial.findUnique({ where: { code: part.materialCode } });
      if (!material?.isActive) return null;
      const yieldRow = await tx.productionYield.findFirst({
        where: {
          productId: null,
          isActive: true,
          rawMaterialId: material.id,
          pieceWidthMm: widthMm,
          pieceLengthMm: lengthMm,
        },
      });
      components.push(componentFromMaterial(material, part.role, '1', yieldRow?.netQty ?? null));
    }
    return components.length > 0 ? components : null;
  }

  private async pervazComponents(
    tx: Prisma.TransactionClient,
    product: { id: string; code: string },
    thicknessRaw: string | undefined,
    widthMm: number,
    lengthMm: number,
  ): Promise<MaterialComponent[] | null> {
    const thickness = integerMm(thicknessRaw);
    if (thickness == null) return null;
    const main = await this.uniqueMaterialForSize(tx, thickness, widthMm, lengthMm);
    const kilcik = await tx.rawMaterial.findUnique({
      where: { code: AYARLI_PERVAZ_KILCIK_MATERIAL_CODE },
    });
    if (!main && !kilcik?.isActive) return null;

    const components: MaterialComponent[] = [];
    if (main) {
      let mainNet: number | null = null;
      try {
        const mainQty = await this.pervazQtyService.resolvePervazPiece({
          productId: product.id,
          rawMaterialId: main.id,
          sheetWidthMm: main.sheetWidthMm,
          sheetLengthMm: main.sheetLengthMm,
          pieceWidthMm: widthMm,
          pieceLengthMm: lengthMm,
        });
        mainNet = mainQty.netQty;
      } catch {
        mainNet = null;
      }
      components.push(componentFromMaterial(main, 'ANA_PARCA', '1', mainNet));
    }
    if (kilcik?.isActive) {
      let kilcikNet: number | null = null;
      try {
        const kilcikQty = await this.pervazQtyService.resolveKilcik({
          productId: product.id,
          pervazThicknessMm: thickness,
          pieceLengthMm: lengthMm,
          sheetWidthMm: kilcik.sheetWidthMm,
          sheetLengthMm: kilcik.sheetLengthMm,
        });
        kilcikNet = kilcikQty.netQty;
      } catch {
        kilcikNet = null;
      }
      components.push(componentFromMaterial(kilcik, 'KILCIK', '1', kilcikNet));
    }
    return components;
  }

  private async supurgelikComponents(
    tx: Prisma.TransactionClient,
    thicknessRaw: string | undefined,
    widthMm: number,
    lengthMm: number,
  ): Promise<MaterialComponent[] | null> {
    const thickness = integerMm(thicknessRaw);
    if (thickness == null) return null;
    const material = await this.uniqueMaterialForSize(tx, thickness, widthMm, lengthMm);
    if (!material) return null;
    const yieldRow = await tx.productionYield.findFirst({
      where: {
        productId: null,
        isActive: true,
        rawMaterialId: material.id,
        pieceWidthMm: widthMm,
        pieceLengthMm: lengthMm,
      },
    });
    return [componentFromMaterial(material, 'ANA_PARCA', '1', yieldRow?.netQty ?? null)];
  }

  private async citaComponents(
    thicknessRaw: string,
    widthMm: number,
    lengthMm: number,
  ): Promise<MaterialComponent[] | null> {
    try {
      const net = await this.citaNetService.resolveNet({
        thicknessMm: thicknessRaw,
        widthMm: String(widthMm),
        lengthMm: String(lengthMm),
      });
      const material = await this.prisma.rawMaterial.findUnique({
        where: { code: net.rawMaterial.code },
      });
      if (!material?.isActive) return null;
      return [componentFromMaterial(material, 'ANA_PARCA', '1', net.netQty)];
    } catch {
      return null;
    }
  }

  private async uniqueMaterialForSize(
    tx: Prisma.TransactionClient,
    thicknessMm: number,
    widthMm: number,
    lengthMm: number,
  ) {
    const yields = await tx.productionYield.findMany({
      where: {
        productId: null,
        isActive: true,
        pieceWidthMm: widthMm,
        pieceLengthMm: lengthMm,
        rawMaterial: { isActive: true, thicknessMm },
      },
      include: { rawMaterial: true },
    });
    if (yields.length === 1) return yields[0].rawMaterial;
    if (yields.length > 1) return null;
    const candidates = await tx.rawMaterial.findMany({
      where: { isActive: true, thicknessMm },
    });
    if (candidates.length === 1) return candidates[0];
    return null;
  }
}

function integerMm(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  if (!Number.isInteger(value) || value <= 0 || value > 20000) return null;
  return value;
}

function componentFromMaterial(
  material: {
    id: string;
    name: string;
    thicknessMm: Prisma.Decimal;
    sheetWidthMm: number;
    sheetLengthMm: number;
    surfaceType: string | null;
  },
  role: string,
  piecesPerUnit: string,
  netQty: number | null,
): MaterialComponent {
  return {
    role,
    rawMaterialId: material.id,
    materialName: material.name,
    thicknessMm: material.thicknessMm.toString(),
    sheetWidthMm: material.sheetWidthMm,
    sheetLengthMm: material.sheetLengthMm,
    surfaceType: material.surfaceType,
    piecesPerUnit,
    netQty,
  };
}
