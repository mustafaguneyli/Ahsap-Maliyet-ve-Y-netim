import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';
import { assertPricingRowException } from './pricing-row-exception.validation';

const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');
const PRODUCT_GROUP_CODE = 'PERVAZ';
const PRODUCT_CODE = 'AYARLI_PERVAZ';

/**
 * Excel AYARLI_PERVAZ satır istisnaları.
 * Default %15 burada yoktur. Calculator / ROUNDUP bu seed’de bağlanmaz.
 */
export const AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS = [
  {
    thicknessMm: 16,
    widthMm: 100,
    lengthMm: 2500,
    profitRate: '20',
    adjustmentAmount: null,
  },
  {
    thicknessMm: 18,
    widthMm: 100,
    lengthMm: 2200,
    profitRate: null,
    adjustmentAmount: '1',
  },
  {
    thicknessMm: 18,
    widthMm: 80,
    lengthMm: 2200,
    profitRate: null,
    adjustmentAmount: '1',
  },
] as const;

export type AyarliPervazPricingRowExceptionSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
    field: string;
    seedValue: string;
    existingValue: string;
  }>;
  missingProductGroup: boolean;
  missingProduct: boolean;
  totalExpected: number;
};

function decimalLabel(value: { toString(): string } | null | undefined): string {
  return value == null ? 'null' : value.toString();
}

function decimalEquals(
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

export async function seedAyarliPervazPricingRowExceptions(
  prisma: PrismaClient,
): Promise<AyarliPervazPricingRowExceptionSeedReport> {
  const report: AyarliPervazPricingRowExceptionSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingProductGroup: false,
    missingProduct: false,
    totalExpected: AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS.length,
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

  for (const seed of AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS) {
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
      const sameProfit = decimalEquals(active.profitRate, seed.profitRate);
      const sameAdjustment = decimalEquals(active.adjustmentAmount, seed.adjustmentAmount);
      if (sameProfit && sameAdjustment) {
        report.unchanged += 1;
        continue;
      }

      if (!sameProfit) {
        report.conflicts.push({
          thicknessMm: seed.thicknessMm,
          widthMm: seed.widthMm,
          lengthMm: seed.lengthMm,
          field: 'profitRate',
          seedValue: seed.profitRate ?? 'null',
          existingValue: decimalLabel(active.profitRate),
        });
      }
      if (!sameAdjustment) {
        report.conflicts.push({
          thicknessMm: seed.thicknessMm,
          widthMm: seed.widthMm,
          lengthMm: seed.lengthMm,
          field: 'adjustmentAmount',
          seedValue: seed.adjustmentAmount ?? 'null',
          existingValue: decimalLabel(active.adjustmentAmount),
        });
      }
      continue;
    }

    assertPricingRowException({
      productId: product.id,
      thicknessMm: seed.thicknessMm,
      widthMm: seed.widthMm,
      lengthMm: seed.lengthMm,
      profitRate: seed.profitRate,
      adjustmentAmount: seed.adjustmentAmount,
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
        profitRate: seed.profitRate == null ? null : new Decimal(seed.profitRate),
        adjustmentAmount:
          seed.adjustmentAmount == null ? null : new Decimal(seed.adjustmentAmount),
        isActive: true,
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: null,
      },
    });
    report.created += 1;
  }

  return report;
}
