import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';
import { assertPricingSetting } from './pricing-setting.validation';

const PRODUCT_GROUP_CODE = 'PERVAZ';
const PRODUCT_CODE = 'AYARLI_PERVAZ';

/**
 * Excel AYARLI_PERVAZ default kâr + FİYAT LİSTESİ kart kuralı (nakit + 2 TL).
 * cardMarkupRate yüzde değildir; Kapı Kasası %20 buraya yazılmaz.
 */
export const AYARLI_PERVAZ_PRICING_SEED = {
  profitRate: '15',
  vatRate: null,
  cardMarkupRate: null,
  cardFixedSurchargeAmount: '2',
} as const;

export type AyarliPervazPricingSeedReport = {
  created: number;
  unchanged: number;
  cardFixedBackfilled: number;
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
    cardFixedBackfilled: 0,
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
    const sameCardMarkup = rateEquals(
      active.cardMarkupRate,
      AYARLI_PERVAZ_PRICING_SEED.cardMarkupRate,
    );
    const sameCardFixed = rateEquals(
      active.cardFixedSurchargeAmount,
      AYARLI_PERVAZ_PRICING_SEED.cardFixedSurchargeAmount,
    );

    if (sameProfit && sameVat && sameCardMarkup && sameCardFixed) {
      report.unchanged += 1;
      return report;
    }

    if (
      active.cardFixedSurchargeAmount == null &&
      active.cardMarkupRate == null
    ) {
      const vatRate = active.vatRate?.toString() ?? null;
      const profitRate =
        active.profitRate?.toString() ?? AYARLI_PERVAZ_PRICING_SEED.profitRate;
      assertPricingSetting({
        productGroupId: null,
        productId: product.id,
        vatRate,
        profitRate,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: AYARLI_PERVAZ_PRICING_SEED.cardFixedSurchargeAmount,
        productIsActive: product.isActive,
      });
      await prisma.pricingSetting.update({
        where: { id: active.id },
        data: { isActive: false },
      });
      await prisma.pricingSetting.create({
        data: {
          productGroupId: null,
          productId: product.id,
          vatRate: vatRate == null ? null : new Decimal(vatRate),
          profitRate: new Decimal(profitRate),
          cardMarkupRate: null,
          cardFixedSurchargeAmount: new Decimal(
            AYARLI_PERVAZ_PRICING_SEED.cardFixedSurchargeAmount,
          ),
          isActive: true,
        },
      });
      report.cardFixedBackfilled += 1;
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
    if (!sameCardMarkup) {
      report.conflicts.push({
        field: 'cardMarkupRate',
        seedValue: 'null',
        existingValue: rateLabel(active.cardMarkupRate),
      });
    }
    if (!sameCardFixed) {
      report.conflicts.push({
        field: 'cardFixedSurchargeAmount',
        seedValue: AYARLI_PERVAZ_PRICING_SEED.cardFixedSurchargeAmount,
        existingValue: rateLabel(active.cardFixedSurchargeAmount),
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
    cardFixedSurchargeAmount: AYARLI_PERVAZ_PRICING_SEED.cardFixedSurchargeAmount,
    productIsActive: product.isActive,
  });

  await prisma.pricingSetting.create({
    data: {
      productGroupId: null,
      productId: product.id,
      vatRate: null,
      profitRate: new Decimal(AYARLI_PERVAZ_PRICING_SEED.profitRate),
      cardMarkupRate: null,
      cardFixedSurchargeAmount: new Decimal(
        AYARLI_PERVAZ_PRICING_SEED.cardFixedSurchargeAmount,
      ),
      isActive: true,
    },
  });
  report.created += 1;

  return report;
}
