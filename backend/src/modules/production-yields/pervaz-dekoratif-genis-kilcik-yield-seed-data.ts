import { PrismaClient } from '@prisma/client';

const PRODUCT_GROUP_CODE = 'PERVAZ';
const PRODUCT_CODE = 'DEKORATIF_PERVAZ_GENIS_KILCIK';

/** Yalnız Excel AC96–AC97 doğrulanmış ana Pervaz NET master'ı. */
export const DEKORATIF_GENIS_KILCIK_YIELD_SEEDS = [
  {
    materialCode: 'MDF-12-2200X2800-ZIMPARALI',
    thicknessMm: 12,
    pieceWidthMm: 90,
    pieceLengthMm: 2200,
    netQty: 24,
  },
  {
    materialCode: 'MDF-12-2200X2800-ZIMPARALI',
    thicknessMm: 12,
    pieceWidthMm: 90,
    pieceLengthMm: 2300,
    netQty: 23,
  },
] as const;

export type DekoratifGenisKilcikYieldSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    pieceWidthMm: number;
    pieceLengthMm: number;
    excelNetQty: number;
    existingNetQty: number;
  }>;
  missingProduct: boolean;
  missingMaterial: boolean;
  totalExpected: number;
};

export async function seedDekoratifGenisKilcikProductionYields(
  prisma: PrismaClient,
): Promise<DekoratifGenisKilcikYieldSeedReport> {
  const report: DekoratifGenisKilcikYieldSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingProduct: false,
    missingMaterial: false,
    totalExpected: DEKORATIF_GENIS_KILCIK_YIELD_SEEDS.length,
  };
  const group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP_CODE },
  });
  const product = group
    ? await prisma.product.findUnique({
        where: {
          productGroupId_code: {
            productGroupId: group.id,
            code: PRODUCT_CODE,
          },
        },
      })
    : null;
  if (!group?.isActive || !product?.isActive) {
    report.missingProduct = true;
    return report;
  }
  const material = await prisma.rawMaterial.findUnique({
    where: { code: DEKORATIF_GENIS_KILCIK_YIELD_SEEDS[0].materialCode },
  });
  if (!material?.isActive) {
    report.missingMaterial = true;
    return report;
  }

  for (const row of DEKORATIF_GENIS_KILCIK_YIELD_SEEDS) {
    const active = await prisma.productionYield.findFirst({
      where: {
        productId: product.id,
        rawMaterialId: material.id,
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
        productId: product.id,
        rawMaterialId: material.id,
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
