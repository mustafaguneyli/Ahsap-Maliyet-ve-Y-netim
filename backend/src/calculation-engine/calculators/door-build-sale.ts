import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import {
  applyPercentCardSale,
  CARD_MARKUP_RATE_MISSING_TR,
} from '../pricing/percent-card-sale';

/**
 * Kapı İmalatı nihai satış — Kapı Kasası formülünden bağımsızdır.
 * Sıra: productionBase → kâr → KDV → nakit → kart.
 * ROUNDUP uygulanmaz (doğrulanmadı).
 */

export const DOOR_BUILD_SALE_MISSING_PROFIT =
  'Kâr oranı girilmedi; nihai satış fiyatı hesaplanmadı.';
export const DOOR_BUILD_SALE_MISSING_VAT =
  'KDV oranı girilmedi; nihai satış fiyatı hesaplanmadı.';
export const DOOR_BUILD_SALE_MISSING_PRODUCTION_BASE =
  'Katsayı sonrası üretim maliyeti yok; nihai satış hesaplanamaz.';
export const DOOR_BUILD_CARD_MARKUP_MISSING_TR =
  'Kapı İmalatı için kart/taksit oranı tanımlı değil.';

export type DoorBuildSalePriceComputed = {
  status: 'COMPUTED';
  productionBase: string;
  profitRate: string;
  profitAmount: string;
  beforeVat: string;
  vatRate: string;
  vatAmount: string;
  cashSale: string;
  cardMarkupRate: string | null;
  cardSale: string | null;
  cardStatusMessage: string | null;
};

export type DoorBuildSalePriceSkipped = {
  status: 'NOT_COMPUTED';
  productionBase: string | null;
  profitRate: string | null;
  profitAmount: null;
  beforeVat: null;
  vatRate: string | null;
  vatAmount: null;
  cashSale: null;
  cardMarkupRate: string | null;
  cardSale: null;
  cardStatusMessage: string | null;
  reason: string;
};

export type DoorBuildSalePriceResult =
  | DoorBuildSalePriceComputed
  | DoorBuildSalePriceSkipped;

function isBlank(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === '';
}

function parseNonNegativeRate(
  value: string,
  label: string,
): ReturnType<typeof toDecimal> {
  let rate;
  try {
    rate = toDecimal(String(value).replace(',', '.'));
  } catch {
    throw new BadRequestException(`${label} geçerli bir Decimal olmalıdır.`);
  }
  if (!rate.isFinite() || rate.isNegative()) {
    throw new BadRequestException(`${label} 0 veya pozitif olmalıdır.`);
  }
  return rate;
}

/**
 * Nihai satış. profitRate veya vatRate boşsa hesaplanmaz (0 ≠ boş).
 * cardMarkupRate boşsa cash kalır, card null.
 * cardMarkupRate 0 ise card = cash.
 */
export function calculateDoorBuildSalePrice(input: {
  productionBase: string | null | undefined;
  profitRate: string | null | undefined;
  vatRate: string | null | undefined;
  cardMarkupRate: string | null | undefined;
}): DoorBuildSalePriceResult {
  const profitBlank = isBlank(input.profitRate);
  const vatBlank = isBlank(input.vatRate);
  const cardBlank = isBlank(input.cardMarkupRate);

  if (isBlank(input.productionBase)) {
    return {
      status: 'NOT_COMPUTED',
      productionBase: null,
      profitRate: profitBlank ? null : String(input.profitRate).trim(),
      profitAmount: null,
      beforeVat: null,
      vatRate: vatBlank ? null : String(input.vatRate).trim(),
      vatAmount: null,
      cashSale: null,
      cardMarkupRate: cardBlank ? null : String(input.cardMarkupRate).trim(),
      cardSale: null,
      cardStatusMessage: null,
      reason: DOOR_BUILD_SALE_MISSING_PRODUCTION_BASE,
    };
  }

  if (profitBlank) {
    return {
      status: 'NOT_COMPUTED',
      productionBase: toDecimal(input.productionBase!).toFixed(),
      profitRate: null,
      profitAmount: null,
      beforeVat: null,
      vatRate: vatBlank ? null : String(input.vatRate).trim(),
      vatAmount: null,
      cashSale: null,
      cardMarkupRate: cardBlank ? null : String(input.cardMarkupRate).trim(),
      cardSale: null,
      cardStatusMessage: null,
      reason: DOOR_BUILD_SALE_MISSING_PROFIT,
    };
  }

  if (vatBlank) {
    return {
      status: 'NOT_COMPUTED',
      productionBase: toDecimal(input.productionBase!).toFixed(),
      profitRate: String(input.profitRate).trim(),
      profitAmount: null,
      beforeVat: null,
      vatRate: null,
      vatAmount: null,
      cashSale: null,
      cardMarkupRate: cardBlank ? null : String(input.cardMarkupRate).trim(),
      cardSale: null,
      cardStatusMessage: null,
      reason: DOOR_BUILD_SALE_MISSING_VAT,
    };
  }

  const productionBase = toDecimal(input.productionBase!);
  if (!productionBase.isFinite() || productionBase.lt(0)) {
    throw new BadRequestException('Üretim maliyeti geçersiz.');
  }

  const profitRate = parseNonNegativeRate(
    String(input.profitRate),
    'Kâr oranı',
  );
  const vatRate = parseNonNegativeRate(String(input.vatRate), 'KDV oranı');

  const profitAmount = productionBase.times(profitRate).div(100);
  const beforeVat = productionBase.plus(profitAmount);
  const vatAmount = beforeVat.times(vatRate).div(100);
  const cashSale = beforeVat.plus(vatAmount);

  const card = applyPercentCardSale({
    cashPrice: cashSale.toFixed(),
    cardMarkupRate: cardBlank ? null : String(input.cardMarkupRate),
    rounding: 'none',
  });

  return {
    status: 'COMPUTED',
    productionBase: productionBase.toFixed(),
    profitRate: profitRate.toFixed(),
    profitAmount: profitAmount.toFixed(),
    beforeVat: beforeVat.toFixed(),
    vatRate: vatRate.toFixed(),
    vatAmount: vatAmount.toFixed(),
    cashSale: cashSale.toFixed(),
    cardMarkupRate: card.cardMarkupRate,
    cardSale: card.cardSalePrice,
    cardStatusMessage:
      card.statusMessage === CARD_MARKUP_RATE_MISSING_TR
        ? DOOR_BUILD_CARD_MARKUP_MISSING_TR
        : card.statusMessage,
  };
}
