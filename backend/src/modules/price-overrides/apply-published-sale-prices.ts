import { BadRequestException } from '@nestjs/common';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';

export type CashOverrideSnapshot = {
  id: string;
  cashPrice: string;
  reason: string | null;
};

export type PublishedSalePrices = {
  calculatedCashPrice: string;
  cashOverride: CashOverrideSnapshot | null;
  publishedCashPrice: string;
  publishedCardPrice: string;
};

/**
 * Ticari yayın katmanı. Hesaplanan nakit fiyatı değiştirmez.
 * publishedCashPrice = override.cashPrice ?? calculatedCashPrice
 * publishedCardPrice = ROUNDUP(publishedCashPrice * (1 + cardMarkupRate/100), 0)
 */
export function applyPublishedSalePrices(
  calculatedCashPrice: string,
  cardMarkupRateRaw: string,
  override: CashOverrideSnapshot | null,
): PublishedSalePrices {
  const calculated = parsePositiveMoney(calculatedCashPrice, 'calculatedCashPrice');
  const cardMarkupRate = parseNonNegativeRate(cardMarkupRateRaw);

  let publishedCash = calculated;
  let cashOverride: CashOverrideSnapshot | null = null;

  if (override != null) {
    publishedCash = parsePositiveMoney(override.cashPrice, 'cashOverride.cashPrice');
    cashOverride = {
      id: override.id,
      cashPrice: publishedCash.toFixed(),
      reason: override.reason,
    };
  }

  const hundred = toDecimal(100);
  const one = toDecimal(1);
  const publishedCardBefore = publishedCash.times(one.plus(cardMarkupRate.div(hundred)));

  return {
    calculatedCashPrice: calculated.toFixed(),
    cashOverride,
    publishedCashPrice: publishedCash.toFixed(),
    publishedCardPrice: roundUpToWholeTl(publishedCardBefore).toFixed(),
  };
}

function parsePositiveMoney(value: string, fieldName: string) {
  if (value == null || value === '') {
    throw new BadRequestException(`${fieldName} eksik.`);
  }
  let amount;
  try {
    amount = toDecimal(value);
  } catch {
    throw new BadRequestException(`${fieldName} geçersiz: ${value}`);
  }
  if (!amount.isFinite() || amount.lte(0)) {
    throw new BadRequestException(`${fieldName} 0'dan büyük olmalıdır.`);
  }
  return amount;
}

function parseNonNegativeRate(value: string) {
  if (value == null || value === '') {
    throw new BadRequestException('Kredi kartı farkı (cardMarkupRate) eksik.');
  }
  let rate;
  try {
    rate = toDecimal(value);
  } catch {
    throw new BadRequestException(`Kredi kartı farkı (cardMarkupRate) geçersiz: ${value}`);
  }
  if (rate.isNegative()) {
    throw new BadRequestException('Kredi kartı farkı (cardMarkupRate) negatif olamaz.');
  }
  return rate;
}
