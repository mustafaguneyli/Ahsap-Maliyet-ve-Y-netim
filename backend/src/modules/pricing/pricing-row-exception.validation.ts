import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export type PricingRowExceptionInput = {
  productId: string | null | undefined;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  profitRate: string | number | null | undefined;
  adjustmentAmount: string | number | null | undefined;
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
 * profitRate veya adjustmentAmount'dan en az biri dolu olmalı.
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
  const hasAdjustment = isProvided(input.adjustmentAmount);
  if (!hasProfit && !hasAdjustment) {
    throw new BadRequestException(
      'Satır istisnasında profitRate veya adjustmentAmount alanlarından en az biri dolu olmalıdır.',
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
