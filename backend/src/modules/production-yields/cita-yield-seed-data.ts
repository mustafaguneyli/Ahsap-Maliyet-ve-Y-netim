import { PrismaClient } from '@prisma/client';
import {
  CITA_CUT_RULE,
  CITA_STANDARD_FALLBACK_NET,
} from '../products/cita-cut-rule.fixture';
import {
  CITA_PRODUCT_GROUP_SEED,
  CITA_PRODUCT_SEED,
} from '../products/cita-product-seed';

export type CitaYieldSeedSource = 'CALCULATED_CUT_RULE';

export type CitaYieldSeedRow = {
  materialCode: string;
  pieceWidthMm: number;
  pieceLengthMm: 2800;
  netQty: number;
  source: CitaYieldSeedSource;
};

/**
 * Çıta ProductionYield ham madde eşleşmeleri.
 * 18 mm yalnız ZIMPARALI; NEOPAN / Membranlık yok.
 * 22 mm yalnız aktif ZIMPARALI; MDF-22-UI-TEST yok.
 */
export const CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM = {
  10: 'MDF-10-2100X2800-ZIMPARALI',
  12: 'MDF-12-2100X2800-ZIMPARALI',
  14: 'MDF-14-2100X2800-ZIMPARALI',
  16: 'MDF-16-2100X2800-ZIMPARALI',
  18: 'MDF-18-2100X2800-ZIMPARALI',
  22: 'MDF-22-2100X2800-ZIMPARALI',
  30: 'MDF-30-2100X2800-ZIMPARALI',
} as const;

export const CITA_YIELD_FORBIDDEN_MATERIAL_CODES = [
  'MDF-18-2100X2800-ZIMPARALI-NEOPAN',
  'MDF-18-2100X2800-TEK-YUZ-MEMBRANLIK-4',
  'MDF-22-UI-TEST',
] as const;

export const CITA_YIELD_NET_SET = [150, 87, 61, 47, 38, 32, 28, 25] as const;

/**
 * Kaynak: kullanıcı doğrulamalı fiziksel kesim kuralı (Excel MASTER yok).
 * source alanı ProductionYield şemasına yazılmaz.
 *
 * effectiveCutPitchMm = widthMm + 4
 * netQty = FLOOR(2100 / effectiveCutPitchMm)
 *
 * Yalnız standart 1–8 cm ProductSize. Custom en (35/47/65 mm) seed edilmez.
 */
export function buildCitaProductionYieldSeedRows(): CitaYieldSeedRow[] {
  const rows: CitaYieldSeedRow[] = [];
  for (const materialCode of Object.values(
    CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM,
  )) {
    for (const net of CITA_STANDARD_FALLBACK_NET) {
      rows.push({
        materialCode,
        pieceWidthMm: net.widthMm,
        pieceLengthMm: CITA_CUT_RULE.pieceLengthMm,
        netQty: net.netQty,
        source: 'CALCULATED_CUT_RULE',
      });
    }
  }
  return rows;
}

export const CITA_PRODUCTION_YIELD_SEEDS = buildCitaProductionYieldSeedRows();

export type CitaYieldSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    materialCode: string;
    pieceWidthMm: number;
    pieceLengthMm: number;
    seedNetQty: number;
    existingNetQty: number;
  }>;
  missingMaterials: string[];
  missingProduct: boolean;
  totalExpected: number;
};

/**
 * Çıta product-scoped NET seed'i.
 *
 * Tüm kayıtlar productId=CITA. Generic (productId=null) yazılmaz.
 * Aynı aktif anahtar varsa aynı NET skip, farklı NET conflict; overwrite yok.
 * Inactive geçmiş silinmez. Custom en oluşturulmaz.
 */
export async function seedCitaProductionYields(
  prisma: PrismaClient,
): Promise<CitaYieldSeedReport> {
  const rows = CITA_PRODUCTION_YIELD_SEEDS;
  const report: CitaYieldSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingMaterials: [],
    missingProduct: false,
    totalExpected: rows.length,
  };

  const group = await prisma.productGroup.findUnique({
    where: { code: CITA_PRODUCT_GROUP_SEED.code },
  });
  const product = group
    ? await prisma.product.findUnique({
        where: {
          productGroupId_code: {
            productGroupId: group.id,
            code: CITA_PRODUCT_SEED.code,
          },
        },
      })
    : null;

  if (!group?.isActive || !product?.isActive) {
    report.missingProduct = true;
    return report;
  }

  const materialCache = new Map<string, string | null>();

  for (const row of rows) {
    if (!materialCache.has(row.materialCode)) {
      const material = await prisma.rawMaterial.findUnique({
        where: { code: row.materialCode },
      });
      if (!material?.isActive) {
        materialCache.set(row.materialCode, null);
        report.missingMaterials.push(row.materialCode);
      } else {
        materialCache.set(row.materialCode, material.id);
      }
    }

    const materialId = materialCache.get(row.materialCode);
    if (!materialId) {
      continue;
    }

    const active = await prisma.productionYield.findFirst({
      where: {
        productId: product.id,
        rawMaterialId: materialId,
        pieceWidthMm: row.pieceWidthMm,
        pieceLengthMm: row.pieceLengthMm,
        isActive: true,
      },
    });

    if (active) {
      if (active.netQty === row.netQty) {
        report.unchanged += 1;
      } else {
        report.conflicts.push({
          materialCode: row.materialCode,
          pieceWidthMm: row.pieceWidthMm,
          pieceLengthMm: row.pieceLengthMm,
          seedNetQty: row.netQty,
          existingNetQty: active.netQty,
        });
      }
      continue;
    }

    await prisma.productionYield.create({
      data: {
        productId: product.id,
        rawMaterialId: materialId,
        pieceWidthMm: row.pieceWidthMm,
        pieceLengthMm: row.pieceLengthMm,
        netQty: row.netQty,
        isActive: true,
      },
    });
    report.created += 1;
  }

  return report;
}
