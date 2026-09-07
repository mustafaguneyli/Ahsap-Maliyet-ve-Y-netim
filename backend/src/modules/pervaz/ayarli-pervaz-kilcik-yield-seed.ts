import { PrismaClient } from '@prisma/client';
import { getExcelKilcikCutWidthMm } from './excel-kilcik-cut-profile';
import { assertPervazKilcikYield } from './pervaz-kilcik-yield.validation';

const PRODUCT_GROUP_CODE = 'PERVAZ';
const PRODUCT_CODE = 'AYARLI_PERVAZ';
export const AYARLI_PERVAZ_KILCIK_MATERIAL_CODE = 'MDF-4-2200X2800-ZIMPARALI';

/**
 * Excel Ayarlı Pervaz kılçık NET (G sütunu). Teorik cutPitch'ten türetilmez.
 * 2800 mm Excel'de doğrulanmış satır yoktur; bu seed master yazmaz.
 */
export const AYARLI_PERVAZ_KILCIK_YIELD_SEEDS = [
  { pervazThicknessMm: 9, pieceLengthMm: 2200, netQty: 66 },
  { pervazThicknessMm: 9, pieceLengthMm: 2300, netQty: 52 },
  { pervazThicknessMm: 9, pieceLengthMm: 2500, netQty: 52 },
  { pervazThicknessMm: 9, pieceLengthMm: 2550, netQty: 52 },
  { pervazThicknessMm: 12, pieceLengthMm: 2200, netQty: 66 },
  { pervazThicknessMm: 12, pieceLengthMm: 2500, netQty: 52 },
  { pervazThicknessMm: 14, pieceLengthMm: 2200, netQty: 62 },
  { pervazThicknessMm: 14, pieceLengthMm: 2500, netQty: 48 },
  { pervazThicknessMm: 16, pieceLengthMm: 2200, netQty: 56 },
  { pervazThicknessMm: 16, pieceLengthMm: 2500, netQty: 44 },
  { pervazThicknessMm: 18, pieceLengthMm: 2200, netQty: 50 },
  { pervazThicknessMm: 18, pieceLengthMm: 2500, netQty: 40 },
] as const;

/**
 * Eski model kalıntısı: AYARLI_PERVAZ 14/18 mm WIDE + excelCutWidthMm=null.
 * Yalnız bu 4 kayıt kontrollü normalize edilir; genel tip/cut güncellemesi yapılmaz.
 */
const LEGACY_WIDE_EXCEL_MASTER_RESIDUES = [
  { pervazThicknessMm: 14, pieceLengthMm: 2200, netQty: 62, excelCutWidthMm: 45 },
  { pervazThicknessMm: 14, pieceLengthMm: 2500, netQty: 48, excelCutWidthMm: 45 },
  { pervazThicknessMm: 18, pieceLengthMm: 2200, netQty: 50, excelCutWidthMm: 55 },
  { pervazThicknessMm: 18, pieceLengthMm: 2500, netQty: 40, excelCutWidthMm: 55 },
] as const;

export type AyarliPervazKilcikYieldSeedReport = {
  created: number;
  unchanged: number;
  normalized: number;
  conflicts: Array<{
    pervazThicknessMm: number;
    pieceLengthMm: number;
    excelNetQty: number;
    existingNetQty: number;
    excelCutWidthMm: number;
    existingExcelCutWidthMm: number | null;
  }>;
  missingProduct: boolean;
  missingMaterial: boolean;
  totalExpected: number;
};

function excelCutWidthFor(pervazThicknessMm: number): number {
  return getExcelKilcikCutWidthMm(pervazThicknessMm);
}

function isLegacyWideResidue(active: {
  pervazThicknessMm: number;
  pieceLengthMm: number;
  netQty: number;
  kilcikTypeId: string | null;
  excelCutWidthMm: number | null;
}): boolean {
  const legacy = LEGACY_WIDE_EXCEL_MASTER_RESIDUES.find(
    (row) =>
      row.pervazThicknessMm === active.pervazThicknessMm &&
      row.pieceLengthMm === active.pieceLengthMm &&
      row.netQty === active.netQty,
  );
  if (!legacy) {
    return false;
  }
  if (active.kilcikTypeId == null) {
    return false;
  }
  return active.excelCutWidthMm == null || active.excelCutWidthMm === legacy.excelCutWidthMm;
}

export async function seedAyarliPervazKilcikYields(
  prisma: PrismaClient,
): Promise<AyarliPervazKilcikYieldSeedReport> {
  const report: AyarliPervazKilcikYieldSeedReport = {
    created: 0,
    unchanged: 0,
    normalized: 0,
    conflicts: [],
    missingProduct: false,
    missingMaterial: false,
    totalExpected: AYARLI_PERVAZ_KILCIK_YIELD_SEEDS.length,
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

  for (const row of AYARLI_PERVAZ_KILCIK_YIELD_SEEDS) {
    const excelCutWidthMm = excelCutWidthFor(row.pervazThicknessMm);

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
      if (isLegacyWideResidue(active)) {
        await prisma.pervazKilcikYield.update({
          where: { id: active.id },
          data: {
            kilcikTypeId: null,
            excelCutWidthMm,
          },
        });
        report.normalized += 1;
        continue;
      }

      if (active.netQty === row.netQty && active.excelCutWidthMm === excelCutWidthMm) {
        report.unchanged += 1;
      } else {
        report.conflicts.push({
          pervazThicknessMm: row.pervazThicknessMm,
          pieceLengthMm: row.pieceLengthMm,
          excelNetQty: row.netQty,
          existingNetQty: active.netQty,
          excelCutWidthMm,
          existingExcelCutWidthMm: active.excelCutWidthMm,
        });
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
