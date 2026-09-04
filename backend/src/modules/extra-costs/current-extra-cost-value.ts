import { Prisma } from '@prisma/client';

export type ExtraCostValueRow = {
  id: string;
  amount: Prisma.Decimal | { toString(): string };
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
};

/**
 * Şu an geçerli ek maliyet değeri:
 * effectiveFrom <= now
 * AND (effectiveTo IS NULL OR effectiveTo > now)
 * AND isActive = true
 *
 * Birden fazla eşleşirse en yeni effectiveFrom tercih edilir.
 * Gelecek tarihli değer erken uygulanmaz.
 */
export function selectCurrentExtraCostValue(
  values: ExtraCostValueRow[],
  now: Date = new Date(),
): ExtraCostValueRow | null {
  const candidates = values
    .filter(
      (v) =>
        v.isActive &&
        v.effectiveFrom.getTime() <= now.getTime() &&
        (v.effectiveTo == null || v.effectiveTo.getTime() > now.getTime()),
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  return candidates[0] ?? null;
}
