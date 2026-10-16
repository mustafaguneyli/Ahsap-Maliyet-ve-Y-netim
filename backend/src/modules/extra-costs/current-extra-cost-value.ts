import { Prisma } from '@prisma/client';
import { isCurrentlyEffective } from '../../firebase/firestore-dates';

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
        v.isActive && isCurrentlyEffective(v.effectiveFrom, v.effectiveTo, now),
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  return candidates[0] ?? null;
}
