import { BadRequestException } from '@nestjs/common';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';

export const CARD_MARKUP_RATE_MISSING = 'CARD_MARKUP_RATE_MISSING' as const;
export const CARD_MARKUP_RATE_MISSING_TR = 'Kart/taksit oranı tanımlı değil';

export type PercentCardRounding = 'none' | 'roundUpWholeTl';

export type PercentCardSaleResult = {
  cardMarkupRate: string | null;
  cardPriceRaw: string | null;
  cardSalePrice: string | null;
  statusCode: typeof CARD_MARKUP_RATE_MISSING | null;
  statusMessage: string | null;
};

export function parseOptionalCardMarkupRate(
  value: string | null | undefined,
) {
  if (value == null || value === '') {
    return null;
  }

  let rate;
  try {
    rate = toDecimal(value);
  } catch {
    throw new BadRequestException(
      `Kart/taksit oranı (cardMarkupRate) geçersiz: ${value}`,
    );
  }
  if (!rate.isFinite() || rate.isNegative()) {
    throw new BadRequestException(
      `Kart/taksit oranı (cardMarkupRate) negatif olamaz: ${value}`,
    );
  }
  return rate;
}

/**
 * Kart satış = nakit × (1 + cardMarkupRate / 100).
 * Oran yoksa 0 uydurmaz; cardSalePrice null döner.
 */
export function applyPercentCardSale(input: {
  cashPrice: string;
  cardMarkupRate: string | null | undefined;
  rounding: PercentCardRounding;
}): PercentCardSaleResult {
  const rate = parseOptionalCardMarkupRate(input.cardMarkupRate);
  if (rate == null) {
    return {
      cardMarkupRate: null,
      cardPriceRaw: null,
      cardSalePrice: null,
      statusCode: CARD_MARKUP_RATE_MISSING,
      statusMessage: CARD_MARKUP_RATE_MISSING_TR,
    };
  }

  const cash = toDecimal(input.cashPrice);
  const cardPriceRaw = cash.times(toDecimal(1).plus(rate.div(100)));
  const cardSalePrice =
    input.rounding === 'roundUpWholeTl'
      ? roundUpToWholeTl(cardPriceRaw)
      : cardPriceRaw;

  return {
    cardMarkupRate: rate.toFixed(),
    cardPriceRaw: cardPriceRaw.toFixed(),
    cardSalePrice: cardSalePrice.toFixed(),
    statusCode: null,
    statusMessage: null,
  };
}
