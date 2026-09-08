import { PrismaClient } from '@prisma/client';
import { AYARLI_PERVAZ_KILCIK_MATERIAL_CODE } from './ayarli-pervaz-kilcik-yield-seed';
import { assertPervazKilcikYield } from './pervaz-kilcik-yield.validation';

const PRODUCT_GROUP_CODE = 'PERVAZ';
const PRODUCT_CODE = 'DEKORATIF_PERVAZ_GENIS_KILCIK';
const WIDE_CODE = 'WIDE';
const EXCEL_CUT_WIDTH_MM = 55;

/** Excel AC96–AC97: WIDE nominal 55 mm, maliyet master NET her iki boyda 40. */
export const DEKORATIF_GENIS_KILCIK_YIELD_SEEDS = [
  { pervazThicknessMm: 12, pieceLengthMm: 2200, netQty: 40 },
  { pervazThicknessMm: 12, pieceLengthMm: 2300, netQty: 40 },
] as const;

export type DekoratifGenisKilcikYieldSeedReport = {
  created: number;
  unchanged: number;
  conflicts: number;
  missingProduct: boolean;
  missingMaterial: boolean;
  missingWideType: boolean;
  totalExpected: number;
};

export async function seedDekoratifGenisKilcikYields(
  prisma: PrismaClient,
): Promise<DekoratifGenisKilcikYieldSeedReport> {
  const report: DekoratifGenisKilcikYieldSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: 0,
    missingProduct: false,
    missingMaterial: false,
    missingWideType: false,
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
    where: { code: AYARLI_PERVAZ_KILCIK_MATERIAL_CODE },
  });
  if (!material?.isActive) {
    report.missingMaterial = true;
    return report;
  }
  const wideType = await prisma.kilcikType.findUnique({
    where: { code: WIDE_CODE },
  });
  if (!wideType?.isActive) {
    report.missingWideType = true;
    return report;
  }

  for (const row of DEKORATIF_GENIS_KILCIK_YIELD_SEEDS) {
    assertPervazKilcikYield({
      productId: product.id,
      productIsActive: product.isActive,
      productGroupCode: group.code,
      pervazThicknessMm: row.pervazThicknessMm,
      source: 'EXCEL_MASTER',
      kilcikTypeCode: wideType.code,
      kilcikTypeIsActive: wideType.isActive,
      rawMaterialId: material.id,
      rawMaterialIsActive: material.isActive,
      pieceLengthMm: row.pieceLengthMm,
      netQty: row.netQty,
      excelCutWidthMm: EXCEL_CUT_WIDTH_MM,
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
        active.kilcikTypeId === wideType.id &&
        active.rawMaterialId === material.id &&
        active.excelCutWidthMm === EXCEL_CUT_WIDTH_MM
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
        kilcikTypeId: wideType.id,
        rawMaterialId: material.id,
        pieceLengthMm: row.pieceLengthMm,
        netQty: row.netQty,
        source: 'EXCEL_MASTER',
        excelCutWidthMm: EXCEL_CUT_WIDTH_MM,
        isActive: true,
      },
    });
    report.created += 1;
  }

  return report;
}
