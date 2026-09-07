import { PrismaClient } from '@prisma/client';

/**
 * Ayarlı Pervaz — yalnızca PERVAZ parçası NET master datası.
 * Kaynak: Excel PERVAZ FİYATI HESAPLAMA F sütunu (ROUNDDOWN). Teorik adetten türetilmez.
 * Kılçık yield bu seed'de yoktur.
 */

export type AyarliPervazYieldSeedRow = {
  materialCode: string;
  pieceWidthMm: number;
  pieceLengthMm: number;
  netQty: number;
};

const cm = (value: number): number => value * 10;

const M9_220 = 'MDF-9-2200X2800-ZIMPARALI';
const M12_220 = 'MDF-12-2200X2800-ZIMPARALI';
const M12_210 = 'MDF-12-2100X2800-ZIMPARALI';
const M14_210 = 'MDF-14-2100X2800-ZIMPARALI';
const M16_210 = 'MDF-16-2100X2800-ZIMPARALI';
const M18_220 = 'MDF-18-2200X2800-ZIMPARALI';

/** Excel NET (F sütunu). wCm × lCm ürün/parça ölçüsü. */
const AYARLI_PERVAZ_PIECE_YIELDS: Array<{
  materialCode: string;
  wCm: number;
  lCm: number;
  net: number;
}> = [
  { materialCode: M9_220, wCm: 7, lCm: 220, net: 40 },
  { materialCode: M9_220, wCm: 8, lCm: 220, net: 35 },
  { materialCode: M9_220, wCm: 8, lCm: 230, net: 27 },
  { materialCode: M9_220, wCm: 9, lCm: 220, net: 31 },
  { materialCode: M9_220, wCm: 9, lCm: 250, net: 24 },
  { materialCode: M9_220, wCm: 10, lCm: 220, net: 28 },
  { materialCode: M9_220, wCm: 10, lCm: 255, net: 22 },
  { materialCode: M9_220, wCm: 12, lCm: 220, net: 23 },
  { materialCode: M12_220, wCm: 7, lCm: 220, net: 40 },
  { materialCode: M12_220, wCm: 8, lCm: 220, net: 35 },
  { materialCode: M12_220, wCm: 9, lCm: 220, net: 31 },
  { materialCode: M12_220, wCm: 10, lCm: 220, net: 28 },
  { materialCode: M12_210, wCm: 10, lCm: 250, net: 22 },
  { materialCode: M14_210, wCm: 10, lCm: 220, net: 21 },
  { materialCode: M14_210, wCm: 10, lCm: 250, net: 21 },
  { materialCode: M16_210, wCm: 10, lCm: 220, net: 21 },
  { materialCode: M16_210, wCm: 10, lCm: 250, net: 21 },
  { materialCode: M18_220, wCm: 10, lCm: 220, net: 28 },
  { materialCode: M18_220, wCm: 8, lCm: 220, net: 35 },
  { materialCode: M18_220, wCm: 10, lCm: 250, net: 21 },
];

export function buildAyarliPervazYieldSeedRows(): AyarliPervazYieldSeedRow[] {
  return AYARLI_PERVAZ_PIECE_YIELDS.map((row) => ({
    materialCode: row.materialCode,
    pieceWidthMm: cm(row.wCm),
    pieceLengthMm: cm(row.lCm),
    netQty: row.net,
  }));
}

export type AyarliPervazYieldSeedReport = {
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

export async function seedAyarliPervazProductionYields(
  prisma: PrismaClient,
): Promise<AyarliPervazYieldSeedReport> {
  const rows = buildAyarliPervazYieldSeedRows();

  const report: AyarliPervazYieldSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingMaterials: [],
    totalExpected: rows.length,
  };

  const materialCache = new Map<string, string>();

  for (const row of rows) {
    let materialId = materialCache.get(row.materialCode);
    if (!materialId) {
      const material = await prisma.rawMaterial.findUnique({
        where: { code: row.materialCode },
      });
      if (!material) {
        report.missingMaterials.push(row.materialCode);
        continue;
      }
      materialId = material.id;
      materialCache.set(row.materialCode, materialId);
    }

    const active = await prisma.productionYield.findFirst({
      where: {
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
