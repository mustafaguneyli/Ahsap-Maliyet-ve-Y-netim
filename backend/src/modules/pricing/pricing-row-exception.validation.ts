import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export type PricingRowExceptionInput = {
  productId: string | null | undefined;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  profitRate: string | number | null | undefined;
  decorativePremiumRate?: string | number | null | undefined;
  adjustmentAmount: string | number | null | undefined;
  cardSaleEnabled?: boolean | null;
  effectiveFrom: Date;
  effectiveTo: Date | null | undefined;
  productIsActive?: boolean | null;
};

function isProvided(value: string | number | null | undefined): boolean {
  return value != null && value !== '';
}

function assertPositiveInt(fieldName: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(
      `${fieldName} pozitif tam sayı (mm) olmalıdır; verilen değer: ${String(value)}.`,
    );
  }
}

function parseDecimalField(fieldName: string, value: string | number): ReturnType<typeof toDecimal> {
  try {
    return toDecimal(value);
  } catch {
    throw new BadRequestException(
      `${fieldName} geçerli bir Decimal olmalıdır; verilen değer: ${String(value)}.`,
    );
  }
}

/**
 * Satır istisnası doğrulaması.
 * profitRate, decorativePremiumRate, adjustmentAmount veya cardSaleEnabled'dan
 * en az biri dolu olmalı.
 * İleride dönem kapatma ExtraCostValue / PricingSetting ile aynı transaction+audit kalıbını kullanır.
 */
export function assertPricingRowException(input: PricingRowExceptionInput): void {
  if (input.productId == null || input.productId === '') {
    throw new BadRequestException('Satır istisnası için productId zorunludur.');
  }

  assertPositiveInt('thicknessMm', input.thicknessMm);
  assertPositiveInt('widthMm', input.widthMm);
  assertPositiveInt('lengthMm', input.lengthMm);

  const hasProfit = isProvided(input.profitRate);
  const hasDecorativePremium = isProvided(input.decorativePremiumRate);
  const hasAdjustment = isProvided(input.adjustmentAmount);
  const hasCardSaleEnabled = input.cardSaleEnabled != null;
  if (!hasProfit && !hasDecorativePremium && !hasAdjustment && !hasCardSaleEnabled) {
    throw new BadRequestException(
      'Satır istisnasında profitRate, decorativePremiumRate, adjustmentAmount veya cardSaleEnabled alanlarından en az biri dolu olmalıdır.',
    );
  }

  if (hasProfit) {
    const profit = parseDecimalField('profitRate', input.profitRate as string | number);
    if (profit.isNegative()) {
      throw new BadRequestException(
        `profitRate negatif olamaz; verilen değer: ${String(input.profitRate)}.`,
      );
    }
  }

  if (hasDecorativePremium) {
    const premium = parseDecimalField(
      'decorativePremiumRate',
      input.decorativePremiumRate as string | number,
    );
    if (premium.isNegative()) {
      throw new BadRequestException(
        `decorativePremiumRate negatif olamaz; verilen değer: ${String(
          input.decorativePremiumRate,
        )}.`,
      );
    }
  }

  if (hasAdjustment) {
    parseDecimalField('adjustmentAmount', input.adjustmentAmount as string | number);
  }

  if (input.effectiveTo != null) {
    if (!(input.effectiveTo > input.effectiveFrom)) {
      throw new BadRequestException(
        'effectiveTo varsa effectiveFrom tarihinden sonra olmalıdır (effectiveTo > effectiveFrom).',
      );
    }
  }

  if (input.productIsActive === false) {
    throw new BadRequestException(
      `Ürün (${input.productId}) aktif değil. Pasif ürüne satır istisnası atanamaz.`,
    );
  }
}
