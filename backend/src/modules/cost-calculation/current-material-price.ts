import { MaterialPriceType, Prisma } from '@prisma/client';

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
        p.effectiveFrom.getTime() <= now.getTime() &&
        (p.effectiveTo == null || p.effectiveTo.getTime() > now.getTime()),
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  return candidates[0] ?? null;
}
