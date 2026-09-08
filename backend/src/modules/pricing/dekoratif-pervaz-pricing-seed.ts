import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';
import { assertPricingRowException } from './pricing-row-exception.validation';
import { assertPricingSetting } from './pricing-setting.validation';

const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');
const PRODUCT_GROUP_CODE = 'PERVAZ';
const DEFAULT_PROFIT_RATE = '15';

export const DEKORATIF_PERVAZ_PREMIUM_SEEDS = [
  { thicknessMm: 12, widthMm: 100, lengthMm: 2200, rate: '50' },
  { thicknessMm: 12, widthMm: 100, lengthMm: 2500, rate: '50' },
  { thicknessMm: 14, widthMm: 100, lengthMm: 2200, rate: '50' },
  { thicknessMm: 14, widthMm: 100, lengthMm: 2500, rate: '50' },
  { thicknessMm: 18, widthMm: 100, lengthMm: 2200, rate: '75' },
  { thicknessMm: 18, widthMm: 100, lengthMm: 2500, rate: '75' },
] as const;

export type DekoratifPervazPricingSeedReport = {
  settingCreated: boolean;
  settingUnchanged: boolean;
  cardFixedBackfilled: boolean;
  premiumCreated: number;
  premiumUnchanged: number;
  conflicts: number;
  missingProduct: boolean;
  totalPremiumExpected: number;
};

function decimalEquals(
  value: { toString(): string } | null | undefined,
  expected: string | null,
): boolean {
  return expected == null
    ? value == null
    : value != null && toDecimal(value.toString()).equals(expected);
}

export async function seedDekoratifPervazPricing(
  prisma: PrismaClient,
): Promise<DekoratifPervazPricingSeedReport> {
  return seedDekoratifProductPricing(
    prisma,
    'DEKORATIF_PERVAZ',
    DEKORATIF_PERVAZ_PREMIUM_SEEDS,
    '2',
  );
}

export async function seedDekoratifProductPricing(
  prisma: PrismaClient,
  productCode: string,
  premiumSeeds: ReadonlyArray<{
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
    rate: string;
  }>,
  cardFixedSurchargeAmount: string | null = null,
): Promise<DekoratifPervazPricingSeedReport> {
  const report: DekoratifPervazPricingSeedReport = {
    settingCreated: false,
    settingUnchanged: false,
    cardFixedBackfilled: false,
    premiumCreated: 0,
    premiumUnchanged: 0,
    conflicts: 0,
    missingProduct: false,
    totalPremiumExpected: premiumSeeds.length,
  };
  const group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP_CODE },
  });
  const product = group
    ? await prisma.product.findUnique({
        where: {
          productGroupId_code: {
            productGroupId: group.id,
            code: productCode,
          },
        },
      })
    : null;
  if (!group?.isActive || !product?.isActive) {
    report.missingProduct = true;
    return report;
  }

  const activeSetting = await prisma.pricingSetting.findFirst({
    where: {
      productId: product.id,
      productGroupId: null,
      isActive: true,
    },
  });
  if (activeSetting) {
    const sameProfit = decimalEquals(activeSetting.profitRate, DEFAULT_PROFIT_RATE);
    const sameVat = activeSetting.vatRate == null;
    const sameMarkup = activeSetting.cardMarkupRate == null;
    const sameCardFixed = decimalEquals(
      activeSetting.cardFixedSurchargeAmount,
      cardFixedSurchargeAmount,
    );
    if (sameProfit && sameVat && sameMarkup && sameCardFixed) {
      report.settingUnchanged = true;
    } else if (
      cardFixedSurchargeAmount != null &&
      activeSetting.cardFixedSurchargeAmount == null &&
      activeSetting.cardMarkupRate == null
    ) {
      const vatRate = activeSetting.vatRate?.toString() ?? null;
      const profitRate = activeSetting.profitRate?.toString() ?? DEFAULT_PROFIT_RATE;
      assertPricingSetting({
        productGroupId: null,
        productId: product.id,
        vatRate,
        profitRate,
        cardMarkupRate: null,
        cardFixedSurchargeAmount,
        productIsActive: product.isActive,
      });
      await prisma.pricingSetting.update({
        where: { id: activeSetting.id },
        data: { isActive: false },
      });
      await prisma.pricingSetting.create({
        data: {
          productId: product.id,
          productGroupId: null,
          vatRate: vatRate == null ? null : new Decimal(vatRate),
          profitRate: new Decimal(profitRate),
          cardMarkupRate: null,
          cardFixedSurchargeAmount: new Decimal(cardFixedSurchargeAmount),
          isActive: true,
        },
      });
      report.cardFixedBackfilled = true;
    } else {
      report.conflicts += 1;
    }
  } else {
    assertPricingSetting({
      productGroupId: null,
      productId: product.id,
      vatRate: null,
      profitRate: DEFAULT_PROFIT_RATE,
      cardMarkupRate: null,
      cardFixedSurchargeAmount,
      productIsActive: product.isActive,
    });
    await prisma.pricingSetting.create({
      data: {
        productId: product.id,
        productGroupId: null,
        vatRate: null,
        profitRate: new Decimal(DEFAULT_PROFIT_RATE),
        cardMarkupRate: null,
        cardFixedSurchargeAmount:
          cardFixedSurchargeAmount == null
            ? null
            : new Decimal(cardFixedSurchargeAmount),
        isActive: true,
      },
    });
    report.settingCreated = true;
  }

  for (const seed of premiumSeeds) {
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
      if (
        decimalEquals(active.decorativePremiumRate, seed.rate) &&
        active.profitRate == null &&
        active.adjustmentAmount == null
      ) {
        report.premiumUnchanged += 1;
      } else {
        report.conflicts += 1;
      }
      continue;
    }

    assertPricingRowException({
      productId: product.id,
      thicknessMm: seed.thicknessMm,
      widthMm: seed.widthMm,
      lengthMm: seed.lengthMm,
      profitRate: null,
      decorativePremiumRate: seed.rate,
      adjustmentAmount: null,
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
        decorativePremiumRate: new Decimal(seed.rate),
        adjustmentAmount: null,
        isActive: true,
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: null,
      },
    });
    report.premiumCreated += 1;
  }

  return report;
}
