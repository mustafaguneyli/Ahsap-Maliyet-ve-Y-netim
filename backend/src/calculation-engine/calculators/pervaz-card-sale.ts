import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export type PervazCardPricingType = 'FIXED_SURCHARGE' | 'NONE';

export type PervazCardSaleBreakdown = {
  cardSaleAvailable: boolean;
  cardPricingType: PervazCardPricingType;
  cardFixedSurchargeAmount: string | null;
  cardSalePrice: string | null;
};

function parseOptionalNonNegativeAmount(
  value: string | null | undefined,
): string | null {
  if (value == null || value === '') {
    return null;
  }
  let amount;
  try {
    amount = toDecimal(value);
  } catch {
    throw new BadRequestException(
      `Pervaz cardFixedSurchargeAmount geçersiz: ${value}`,
    );
  }
  if (amount.isNegative()) {
    throw new BadRequestException(
      `Pervaz cardFixedSurchargeAmount negatif olamaz: ${value}`,
    );
  }
  return amount.toFixed();
}

/**
 * Pervaz kart/taksit: publishedCashPrice + cardFixedSurchargeAmount.
 * Yüzde kart farkı kullanılmaz. Kartta ROUNDUP yoktur.
 */
export function applyPervazFixedCardSale(input: {
  publishedCashPrice: string;
  cardFixedSurchargeAmount?: string | null;
  cardSaleAvailable: boolean;
}): PervazCardSaleBreakdown {
  const amount = parseOptionalNonNegativeAmount(input.cardFixedSurchargeAmount);
  if (!input.cardSaleAvailable) {
    return {
      cardSaleAvailable: false,
      cardPricingType: 'NONE',
      cardFixedSurchargeAmount: amount,
      cardSalePrice: null,
    };
  }
  if (amount == null) {
    throw new BadRequestException(
      'Pervaz kart satışı açık ama cardFixedSurchargeAmount eksik.',
    );
  }
  const publishedCashPrice = toDecimal(input.publishedCashPrice);
  return {
    cardSaleAvailable: true,
    cardPricingType: 'FIXED_SURCHARGE',
    cardFixedSurchargeAmount: amount,
    cardSalePrice: publishedCashPrice.plus(toDecimal(amount)).toFixed(),
  };
}
