import { PrismaClient } from '@prisma/client';
import { assertPricingRowException } from './pricing-row-exception.validation';

const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');
const PRODUCT_GROUP_CODE = 'PERVAZ';
const PRODUCT_CODE = 'AYARLI_PERVAZ';

/**
 * FİYAT LİSTESİ’nde K.KARTI TAKSİT = nakit + 2 doğrulanmış AYARLI satırlar.
 * Liste dışı 8 ölçü burada yoktur; kart uydurulmaz.
 * Kaynak: FİYAT LİSTESİ D/E → AC!S66,67,69,70,71,74,75,76,77,78,83,85.
 */
export const AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS = [
  { thicknessMm: 9, widthMm: 70, lengthMm: 2200 },
  { thicknessMm: 9, widthMm: 80, lengthMm: 2200 },
  { thicknessMm: 9, widthMm: 90, lengthMm: 2200 },
  { thicknessMm: 9, widthMm: 90, lengthMm: 2500 },
  { thicknessMm: 9, widthMm: 100, lengthMm: 2200 },
  { thicknessMm: 12, widthMm: 70, lengthMm: 2200 },
  { thicknessMm: 12, widthMm: 80, lengthMm: 2200 },
  { thicknessMm: 12, widthMm: 90, lengthMm: 2200 },
  { thicknessMm: 12, widthMm: 100, lengthMm: 2200 },
  { thicknessMm: 12, widthMm: 100, lengthMm: 2500 },
  { thicknessMm: 18, widthMm: 100, lengthMm: 2200 },
  { thicknessMm: 18, widthMm: 100, lengthMm: 2500 },
] as const;

/** FİYAT LİSTESİ’nde olmayan doğrulanmış nakit satırları; kart master’ı yok. */
export const AYARLI_PERVAZ_CARD_SALE_UNLISTED_MEASURES = [
  { thicknessMm: 9, widthMm: 80, lengthMm: 2300 },
  { thicknessMm: 9, widthMm: 100, lengthMm: 2550 },
  { thicknessMm: 9, widthMm: 120, lengthMm: 2200 },
  { thicknessMm: 14, widthMm: 100, lengthMm: 2200 },
  { thicknessMm: 14, widthMm: 100, lengthMm: 2500 },
  { thicknessMm: 16, widthMm: 100, lengthMm: 2200 },
  { thicknessMm: 16, widthMm: 100, lengthMm: 2500 },
  { thicknessMm: 18, widthMm: 80, lengthMm: 2200 },
] as const;

export type AyarliPervazCardSaleEnabledSeedReport = {
  created: number;
  unchanged: number;
  backfilled: number;
  conflicts: Array<{
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
    existingValue: string;
  }>;
  missingProductGroup: boolean;
  missingProduct: boolean;
  totalExpected: number;
};

export async function seedAyarliPervazCardSaleEnabled(
  prisma: PrismaClient,
): Promise<AyarliPervazCardSaleEnabledSeedReport> {
  const report: AyarliPervazCardSaleEnabledSeedReport = {
    created: 0,
    unchanged: 0,
    backfilled: 0,
    conflicts: [],
    missingProductGroup: false,
    missingProduct: false,
    totalExpected: AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS.length,
  };

  const group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP_CODE },
  });
  if (!group?.isActive) {
    report.missingProductGroup = true;
    return report;
  }
  const product = await prisma.product.findUnique({
    where: {
      productGroupId_code: {
        productGroupId: group.id,
        code: PRODUCT_CODE,
      },
    },
  });
  if (!product?.isActive) {
    report.missingProduct = true;
    return report;
  }

  for (const seed of AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS) {
    const active = await prisma.pricingRowException.findFirst({
      where: {
        productId: product.id,
        thicknessMm: seed.thicknessMm,
        widthMm: seed.widthMm,
        lengthMm: seed.lengthMm,
        isActive: true,
        effectiveTo: null,
      },
    });

    if (active) {
      if (active.cardSaleEnabled === true) {
        report.unchanged += 1;
        continue;
      }
      if (active.cardSaleEnabled === false) {
        report.conflicts.push({
          thicknessMm: seed.thicknessMm,
          widthMm: seed.widthMm,
          lengthMm: seed.lengthMm,
          existingValue: 'false',
        });
        continue;
      }
      await prisma.pricingRowException.update({
        where: { id: active.id },
        data: { cardSaleEnabled: true },
      });
      report.backfilled += 1;
      continue;
    }

    assertPricingRowException({
      productId: product.id,
      thicknessMm: seed.thicknessMm,
      widthMm: seed.widthMm,
      lengthMm: seed.lengthMm,
      profitRate: null,
      decorativePremiumRate: null,
      adjustmentAmount: null,
      cardSaleEnabled: true,
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      productIsActive: product.isActive,
    });
    await prisma.pricingRowException.create({
      data: {
        productId: product.id,
        thicknessMm: seed.thicknessMm,
        widthMm: seed.widthMm,
        lengthMm: seed.lengthMm,
        profitRate: null,
        decorativePremiumRate: null,
        adjustmentAmount: null,
        cardSaleEnabled: true,
        isActive: true,
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: null,
      },
    });
    report.created += 1;
  }

  return report;
}
