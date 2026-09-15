import { PrismaClient } from '@prisma/client';

export type SupurgelikYieldSeedSource =
  | 'EXCEL_MASTER'
  | 'CALCULATED_CUT_RULE';

export type SupurgelikYieldSeedRow = {
  materialCode: string;
  pieceWidthMm: number;
  pieceLengthMm: 2800;
  netQty: number;
  source: SupurgelikYieldSeedSource;
};

/**
 * Süpürgelik temel NET masterları.
 *
 * AC104, AC105, AC107 ve AC108 doğrulanmış Excel MASTER satırlarıdır.
 * 8/9/10 mm satırları kullanıcı tarafından doğrulanan 2100×2800 MDF eşleşmesi ve
 * FLOOR(2100 / effectiveCutWidthMm) kuralından gelir; Excel MASTER değildir.
 * Kalan calculated satırlar da aynı doğrulanmış kesim kuralından gelir.
 * `source`, ProductionYield şemasına yazılmaz; kaynağı fixture/test seviyesinde korur.
 * 9 mm / 2100×2800 malzemenin fiyatı bilinçli olarak yoktur. İleride calculator,
 * eksik fiyatı 0 veya 2200×2800 fiyatıyla tamamlamamalıdır.
 */
export const SUPURGELIK_PRODUCTION_YIELD_SEEDS = [
  {
    materialCode: 'MDF-8-2100X2800-ZIMPARALI',
    pieceWidthMm: 80,
    pieceLengthMm: 2800,
    netQty: 25,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-8-2100X2800-ZIMPARALI',
    pieceWidthMm: 90,
    pieceLengthMm: 2800,
    netQty: 22,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-8-2100X2800-ZIMPARALI',
    pieceWidthMm: 100,
    pieceLengthMm: 2800,
    netQty: 20,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-8-2100X2800-ZIMPARALI',
    pieceWidthMm: 120,
    pieceLengthMm: 2800,
    netQty: 17,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-8-2100X2800-ZIMPARALI',
    pieceWidthMm: 150,
    pieceLengthMm: 2800,
    netQty: 13,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-9-2100X2800-ZIMPARALI',
    pieceWidthMm: 80,
    pieceLengthMm: 2800,
    netQty: 25,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-9-2100X2800-ZIMPARALI',
    pieceWidthMm: 90,
    pieceLengthMm: 2800,
    netQty: 22,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-9-2100X2800-ZIMPARALI',
    pieceWidthMm: 100,
    pieceLengthMm: 2800,
    netQty: 20,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-9-2100X2800-ZIMPARALI',
    pieceWidthMm: 120,
    pieceLengthMm: 2800,
    netQty: 17,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-9-2100X2800-ZIMPARALI',
    pieceWidthMm: 150,
    pieceLengthMm: 2800,
    netQty: 13,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-10-2100X2800-ZIMPARALI',
    pieceWidthMm: 80,
    pieceLengthMm: 2800,
    netQty: 25,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-10-2100X2800-ZIMPARALI',
    pieceWidthMm: 90,
    pieceLengthMm: 2800,
    netQty: 22,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-10-2100X2800-ZIMPARALI',
    pieceWidthMm: 100,
    pieceLengthMm: 2800,
    netQty: 20,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-10-2100X2800-ZIMPARALI',
    pieceWidthMm: 120,
    pieceLengthMm: 2800,
    netQty: 17,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-10-2100X2800-ZIMPARALI',
    pieceWidthMm: 150,
    pieceLengthMm: 2800,
    netQty: 13,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-12-2100X2800-ZIMPARALI',
    pieceWidthMm: 80,
    pieceLengthMm: 2800,
    netQty: 25,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-12-2100X2800-ZIMPARALI',
    pieceWidthMm: 90,
    pieceLengthMm: 2800,
    netQty: 22,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-12-2100X2800-ZIMPARALI',
    pieceWidthMm: 100,
    pieceLengthMm: 2800,
    netQty: 20,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-12-2100X2800-ZIMPARALI',
    pieceWidthMm: 120,
    pieceLengthMm: 2800,
    netQty: 16,
    source: 'EXCEL_MASTER',
  },
  {
    materialCode: 'MDF-12-2100X2800-ZIMPARALI',
    pieceWidthMm: 150,
    pieceLengthMm: 2800,
    netQty: 13,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-14-2100X2800-ZIMPARALI',
    pieceWidthMm: 80,
    pieceLengthMm: 2800,
    netQty: 25,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-14-2100X2800-ZIMPARALI',
    pieceWidthMm: 90,
    pieceLengthMm: 2800,
    netQty: 22,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-14-2100X2800-ZIMPARALI',
    pieceWidthMm: 100,
    pieceLengthMm: 2800,
    netQty: 20,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-14-2100X2800-ZIMPARALI',
    pieceWidthMm: 120,
    pieceLengthMm: 2800,
    netQty: 16,
    source: 'EXCEL_MASTER',
  },
  {
    materialCode: 'MDF-14-2100X2800-ZIMPARALI',
    pieceWidthMm: 150,
    pieceLengthMm: 2800,
    netQty: 13,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-18-2100X2800-ZIMPARALI',
    pieceWidthMm: 80,
    pieceLengthMm: 2800,
    netQty: 25,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-18-2100X2800-ZIMPARALI',
    pieceWidthMm: 90,
    pieceLengthMm: 2800,
    netQty: 22,
    source: 'CALCULATED_CUT_RULE',
  },
  {
    materialCode: 'MDF-18-2100X2800-ZIMPARALI',
    pieceWidthMm: 100,
    pieceLengthMm: 2800,
    netQty: 20,
    source: 'EXCEL_MASTER',
  },
  {
    materialCode: 'MDF-18-2100X2800-ZIMPARALI',
    pieceWidthMm: 120,
    pieceLengthMm: 2800,
    netQty: 16,
    source: 'EXCEL_MASTER',
  },
  {
    materialCode: 'MDF-18-2100X2800-ZIMPARALI',
    pieceWidthMm: 150,
    pieceLengthMm: 2800,
    netQty: 13,
    source: 'CALCULATED_CUT_RULE',
  },
] as const satisfies readonly SupurgelikYieldSeedRow[];

export type SupurgelikYieldSeedReport = {
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
  totalExpected: number;
};

/**
 * Generic Süpürgelik NET seed'i.
 *
 * Aynı aktif generic anahtar varsa aynı NET atlanır, farklı NET conflict olarak
 * raporlanır. Mevcut değer güncellenmez ve inactive geçmişe dokunulmaz.
 */
export async function seedSupurgelikProductionYields(
  prisma: PrismaClient,
): Promise<SupurgelikYieldSeedReport> {
  const report: SupurgelikYieldSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingMaterials: [],
    totalExpected: SUPURGELIK_PRODUCTION_YIELD_SEEDS.length,
  };

  const materialCache = new Map<string, string | null>();

  for (const row of SUPURGELIK_PRODUCTION_YIELD_SEEDS) {
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
        productId: null,
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
        productId: null,
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
