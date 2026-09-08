import { PrismaClient } from '@prisma/client';

/**
 * Dekoratif Pervaz ana parça Excel master'ı (AC / PERVAZ FİYATI HESAPLAMA).
 * NET değerler Excel F sütunundandır; geometrik formülle türetilmez.
 */
export const DEKORATIF_PERVAZ_YIELD_SEEDS = [
  {
    materialCode: 'MDF-12-2200X2800-ZIMPARALI',
    thicknessMm: 12,
    pieceWidthMm: 100,
    pieceLengthMm: 2200,
    netQty: 28,
  },
  {
    materialCode: 'MDF-12-2200X2800-ZIMPARALI',
    thicknessMm: 12,
    pieceWidthMm: 100,
    pieceLengthMm: 2500,
    netQty: 22,
  },
  {
    materialCode: 'MDF-14-2100X2800-ZIMPARALI',
    thicknessMm: 14,
    pieceWidthMm: 100,
    pieceLengthMm: 2200,
    netQty: 21,
  },
  {
    materialCode: 'MDF-14-2100X2800-ZIMPARALI',
    thicknessMm: 14,
    pieceWidthMm: 100,
    pieceLengthMm: 2500,
    netQty: 21,
  },
  {
    materialCode: 'MDF-18-2200X2800-ZIMPARALI',
    thicknessMm: 18,
    pieceWidthMm: 100,
    pieceLengthMm: 2200,
    netQty: 28,
  },
  {
    materialCode: 'MDF-18-2100X2800-ZIMPARALI',
    thicknessMm: 18,
    pieceWidthMm: 100,
    pieceLengthMm: 2500,
    netQty: 21,
  },
] as const;

export type DekoratifPervazYieldSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    materialCode: string;
    pieceWidthMm: number;
    pieceLengthMm: number;
    excelNetQty: number;
    existingNetQty: number;
  }>;
  missingMaterials: string[];
  totalExpected: number;
};

export async function seedDekoratifPervazProductionYields(
  prisma: PrismaClient,
): Promise<DekoratifPervazYieldSeedReport> {
  const report: DekoratifPervazYieldSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingMaterials: [],
    totalExpected: DEKORATIF_PERVAZ_YIELD_SEEDS.length,
  };
  const materialIds = new Map<string, string>();

  for (const row of DEKORATIF_PERVAZ_YIELD_SEEDS) {
    let materialId = materialIds.get(row.materialCode);
    if (!materialId) {
      const material = await prisma.rawMaterial.findUnique({
        where: { code: row.materialCode },
      });
      if (!material) {
        report.missingMaterials.push(row.materialCode);
        continue;
      }
      materialId = material.id;
      materialIds.set(row.materialCode, materialId);
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
          excelNetQty: row.netQty,
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
