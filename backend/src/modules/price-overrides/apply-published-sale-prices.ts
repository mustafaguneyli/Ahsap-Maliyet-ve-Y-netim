import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import {
  applyPercentCardSale,
  CARD_MARKUP_RATE_MISSING,
  CARD_MARKUP_RATE_MISSING_TR,
} from '../../calculation-engine/pricing/percent-card-sale';

export type CashOverrideSnapshot = {
  id: string;
  cashPrice: string;
  reason: string | null;
};

export type PublishedSalePrices = {
  calculatedCashPrice: string;
  cashOverride: CashOverrideSnapshot | null;
  publishedCashPrice: string;
  publishedCardPrice: string | null;
  cardStatusCode: typeof CARD_MARKUP_RATE_MISSING | null;
  cardStatusMessage: string | null;
};

/**
 * Ticari yayın katmanı. Hesaplanan nakit fiyatı değiştirmez.
 * publishedCashPrice = override.cashPrice ?? calculatedCashPrice
 * publishedCardPrice = ROUNDUP(publishedCashPrice * (1 + cardMarkupRate/100), 0)
 * cardMarkupRate yoksa kart null; nakit yine yayımlanır.
 */
export function applyPublishedSalePrices(
  calculatedCashPrice: string,
  cardMarkupRateRaw: string | null | undefined,
  override: CashOverrideSnapshot | null,
): PublishedSalePrices {
  const calculated = parsePositiveMoney(calculatedCashPrice, 'calculatedCashPrice');

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

  const card = applyPercentCardSale({
    cashPrice: publishedCash.toFixed(),
    cardMarkupRate: cardMarkupRateRaw,
    rounding: 'roundUpWholeTl',
  });

  return {
    calculatedCashPrice: calculated.toFixed(),
    cashOverride,
    publishedCashPrice: publishedCash.toFixed(),
    publishedCardPrice: card.cardSalePrice,
    cardStatusCode: card.statusCode,
    cardStatusMessage: card.statusMessage,
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

export { CARD_MARKUP_RATE_MISSING, CARD_MARKUP_RATE_MISSING_TR };
