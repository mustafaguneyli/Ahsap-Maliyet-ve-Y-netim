import { PrismaClient } from '@prisma/client';
import { getExcelKilcikCutWidthMm } from './excel-kilcik-cut-profile';
import { AYARLI_PERVAZ_KILCIK_MATERIAL_CODE } from './ayarli-pervaz-kilcik-yield-seed';
import { assertPervazKilcikYield } from './pervaz-kilcik-yield.validation';

const PRODUCT_GROUP_CODE = 'PERVAZ';
const PRODUCT_CODE = 'DEKORATIF_PERVAZ';

/** Excel G sütunu: yalnız bu fazdaki altı doğrulanmış Dekoratif Pervaz satırı. */
export const DEKORATIF_PERVAZ_KILCIK_YIELD_SEEDS = [
  { pervazThicknessMm: 12, pieceLengthMm: 2200, netQty: 66 },
  { pervazThicknessMm: 12, pieceLengthMm: 2500, netQty: 52 },
  { pervazThicknessMm: 14, pieceLengthMm: 2200, netQty: 62 },
  { pervazThicknessMm: 14, pieceLengthMm: 2500, netQty: 48 },
  { pervazThicknessMm: 18, pieceLengthMm: 2200, netQty: 50 },
  { pervazThicknessMm: 18, pieceLengthMm: 2500, netQty: 40 },
] as const;

export type DekoratifPervazKilcikYieldSeedReport = {
  created: number;
  unchanged: number;
  conflicts: number;
  missingProduct: boolean;
  missingMaterial: boolean;
  totalExpected: number;
};

export async function seedDekoratifPervazKilcikYields(
  prisma: PrismaClient,
): Promise<DekoratifPervazKilcikYieldSeedReport> {
  const report: DekoratifPervazKilcikYieldSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: 0,
    missingProduct: false,
    missingMaterial: false,
    totalExpected: DEKORATIF_PERVAZ_KILCIK_YIELD_SEEDS.length,
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
  if (!group || !product) {
    report.missingProduct = true;
    return report;
  }

  const material = await prisma.rawMaterial.findUnique({
    where: { code: AYARLI_PERVAZ_KILCIK_MATERIAL_CODE },
  });
  if (!material) {
    report.missingMaterial = true;
    return report;
  }

  for (const row of DEKORATIF_PERVAZ_KILCIK_YIELD_SEEDS) {
    const excelCutWidthMm = getExcelKilcikCutWidthMm(row.pervazThicknessMm);
    assertPervazKilcikYield({
      productId: product.id,
      productIsActive: product.isActive,
      productGroupCode: group.code,
      pervazThicknessMm: row.pervazThicknessMm,
      source: 'EXCEL_MASTER',
      kilcikTypeCode: null,
      rawMaterialId: material.id,
      rawMaterialIsActive: material.isActive,
      pieceLengthMm: row.pieceLengthMm,
      netQty: row.netQty,
      excelCutWidthMm,
    });

    const active = await prisma.pervazKilcikYield.findFirst({
      where: {
        productId: product.id,
        pervazThicknessMm: row.pervazThicknessMm,
        pieceLengthMm: row.pieceLengthMm,
        source: 'EXCEL_MASTER',
        isActive: true,
      },
    });
    if (active) {
      if (
        active.netQty === row.netQty &&
        active.excelCutWidthMm === excelCutWidthMm &&
        active.rawMaterialId === material.id
      ) {
        report.unchanged += 1;
      } else {
        report.conflicts += 1;
      }
      continue;
    }

    await prisma.pervazKilcikYield.create({
      data: {
        productId: product.id,
        pervazThicknessMm: row.pervazThicknessMm,
        kilcikTypeId: null,
        rawMaterialId: material.id,
        pieceLengthMm: row.pieceLengthMm,
        netQty: row.netQty,
        source: 'EXCEL_MASTER',
        excelCutWidthMm,
        isActive: true,
      },
    });
    report.created += 1;
  }

  return report;
}
