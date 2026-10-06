import {
  applyPercentCardSale,
  CARD_MARKUP_RATE_MISSING,
  CARD_MARKUP_RATE_MISSING_TR,
} from '../pricing/percent-card-sale';

export type PervazCardPricingType = 'PERCENT_MARKUP' | 'NONE';

export type PervazCardSaleBreakdown = {
  cardSaleAvailable: boolean;
  cardPricingType: PervazCardPricingType;
  cardMarkupRate: string | null;
  cardSalePrice: string | null;
  cardStatusCode: typeof CARD_MARKUP_RATE_MISSING | null;
  cardStatusMessage: string | null;
};

/**
 * Pervaz kart/taksit: publishedCashPrice × (1 + cardMarkupRate/100).
 * Kartta ek ROUNDUP yoktur. Oran yoksa kart null; nakit durur.
 */
export function applyPervazPercentCardSale(input: {
  publishedCashPrice: string;
  cardMarkupRate?: string | null;
  cardSaleAvailable: boolean;
}): PervazCardSaleBreakdown {
  if (!input.cardSaleAvailable) {
    return {
      cardSaleAvailable: false,
      cardPricingType: 'NONE',
      cardMarkupRate: null,
      cardSalePrice: null,
      cardStatusCode: null,
      cardStatusMessage: null,
    };
  }

  const card = applyPercentCardSale({
    cashPrice: input.publishedCashPrice,
    cardMarkupRate: input.cardMarkupRate,
    rounding: 'none',
  });

  return {
    cardSaleAvailable: true,
    cardPricingType: card.cardSalePrice != null ? 'PERCENT_MARKUP' : 'NONE',
    cardMarkupRate: card.cardMarkupRate,
    cardSalePrice: card.cardSalePrice,
    cardStatusCode: card.statusCode,
    cardStatusMessage: card.statusMessage,
  };
}

export { CARD_MARKUP_RATE_MISSING, CARD_MARKUP_RATE_MISSING_TR };
