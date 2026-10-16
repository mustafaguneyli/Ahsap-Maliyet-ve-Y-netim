import { MaterialPriceType, Prisma } from '@prisma/client';
import { isCurrentlyEffective } from '../../firebase/firestore-dates';

/** Üretim maliyeti ham madde alış tipi. Env ile değiştirilmez. */
export const COST_MATERIAL_PRICE_TYPE = MaterialPriceType.CARD_INSTALLMENT;

export const MISSING_COST_MATERIAL_PRICE =
  'MDF kart/taksitli alış fiyatı tanımlı değil';

export type MaterialPriceRow = {
  id: string;
  priceType: MaterialPriceType;
  price: Prisma.Decimal | { toString(): string };
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
};

/**
 * Şu an geçerli ham madde alış fiyatı:
 * effectiveFrom <= now
 * AND (effectiveTo IS NULL OR effectiveTo > now)
 * AND isActive = true
 *
 * Birden fazla eşleşirse en yeni effectiveFrom tercih edilir.
 * Gelecek tarihli (effectiveFrom > now) fiyatlar erken yansımaz.
 */
export function selectCurrentMaterialPrice(
  prices: MaterialPriceRow[],
  priceType: MaterialPriceType,
  now: Date = new Date(),
): MaterialPriceRow | null {
  const candidates = prices
    .filter(
      (p) =>
        p.isActive &&
        p.priceType === priceType &&
        isCurrentlyEffective(p.effectiveFrom, p.effectiveTo, now),
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  return candidates[0] ?? null;
}

/** Üretim maliyeti için daima CARD_INSTALLMENT. CASH kaydına düşmez. */
export function resolveCostMaterialPrice(
  prices: MaterialPriceRow[],
  now: Date = new Date(),
): MaterialPriceRow | null {
  return selectCurrentMaterialPrice(prices, COST_MATERIAL_PRICE_TYPE, now);
}
