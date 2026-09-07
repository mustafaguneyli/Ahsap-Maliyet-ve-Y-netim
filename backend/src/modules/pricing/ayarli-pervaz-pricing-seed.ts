import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';
import { assertPricingSetting } from './pricing-setting.validation';

const PRODUCT_GROUP_CODE = 'PERVAZ';
const PRODUCT_CODE = 'AYARLI_PERVAZ';

/**
 * Excel AYARLI_PERVAZ default kâr oranı. Product-level.
 * vatRate / cardMarkupRate bu aşamada NULL (KDV ve kart yok).
 * Grup-level yazılmaz; Dekoratif ürünlere sızmaz.
 * 16 mm 10×250 %20 ve +1 bu seed’de yoktur.
 */
export const AYARLI_PERVAZ_PRICING_SEED = {
  profitRate: '15',
  vatRate: null,
  cardMarkupRate: null,
} as const;

export type AyarliPervazPricingSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    field: string;
    seedValue: string;
    existingValue: string;
  }>;
  missingProductGroup: boolean;
  missingProduct: boolean;
};

function rateLabel(value: { toString(): string } | null | undefined): string {
  return value == null ? 'null' : value.toString();
}

function rateEquals(
  existing: { toString(): string } | null | undefined,
  seed: string | null,
): boolean {
  if (seed == null) {
    return existing == null;
  }
  if (existing == null) {
    return false;
  }
  return toDecimal(existing.toString()).equals(toDecimal(seed));
}

export async function seedAyarliPervazPricingSettings(
  prisma: PrismaClient,
): Promise<AyarliPervazPricingSeedReport> {
  const report: AyarliPervazPricingSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingProductGroup: false,
    missingProduct: false,
  };

  const group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP_CODE },
  });
  if (!group || !group.isActive) {
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
  if (!product || !product.isActive) {
    report.missingProduct = true;
    return report;
  }

  const active = await prisma.pricingSetting.findFirst({
    where: {
      productId: product.id,
      productGroupId: null,
      isActive: true,
    },
  });

  if (active) {
    const sameProfit = rateEquals(active.profitRate, AYARLI_PERVAZ_PRICING_SEED.profitRate);
    const sameVat = rateEquals(active.vatRate, AYARLI_PERVAZ_PRICING_SEED.vatRate);
    const sameCard = rateEquals(active.cardMarkupRate, AYARLI_PERVAZ_PRICING_SEED.cardMarkupRate);

    if (sameProfit && sameVat && sameCard) {
      report.unchanged += 1;
      return report;
    }

    if (!sameProfit) {
      report.conflicts.push({
        field: 'profitRate',
        seedValue: AYARLI_PERVAZ_PRICING_SEED.profitRate,
        existingValue: rateLabel(active.profitRate),
      });
    }
    if (!sameVat) {
      report.conflicts.push({
        field: 'vatRate',
        seedValue: 'null',
        existingValue: rateLabel(active.vatRate),
      });
    }
    if (!sameCard) {
      report.conflicts.push({
        field: 'cardMarkupRate',
        seedValue: 'null',
        existingValue: rateLabel(active.cardMarkupRate),
      });
    }
    return report;
  }

  assertPricingSetting({
    productGroupId: null,
    productId: product.id,
    vatRate: AYARLI_PERVAZ_PRICING_SEED.vatRate,
    profitRate: AYARLI_PERVAZ_PRICING_SEED.profitRate,
    cardMarkupRate: AYARLI_PERVAZ_PRICING_SEED.cardMarkupRate,
    productIsActive: product.isActive,
  });

  await prisma.pricingSetting.create({
    data: {
      productGroupId: null,
      productId: product.id,
      vatRate: null,
      profitRate: new Decimal(AYARLI_PERVAZ_PRICING_SEED.profitRate),
      cardMarkupRate: null,
      isActive: true,
    },
  });
  report.created += 1;

  return report;
}
