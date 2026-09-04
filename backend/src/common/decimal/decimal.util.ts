import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

/**
 * Decimal bölme artığı için ROUNDUP öncesi eşik.
 * 0.0001 TL gibi gerçek kesirler korunur; ~1e-28 türü artıkları yok sayar.
 */
const WHOLE_TL_RESIDUE_EPSILON = new Decimal('1e-10');

export function toDecimal(value: Decimal.Value | Prisma.Decimal): Decimal {
  if (value instanceof Prisma.Decimal) {
    return new Decimal(value.toString());
  }

  return new Decimal(value);
}

export function decimalToString(value: Decimal): string {
  return value.toFixed();
}

export function decimalToPrisma(value: Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

/**
 * Decimal hesap kaynaklı çok küçük artıkları en yakın tam TL'ye çeker.
 * Ara maliyetleri erken yuvarlamaz; yalnızca tam sayıya ε kadar yakın değerleri normalize eder.
 *
 * Örn. 655.000…0001 → 655, 655.0001 → değişmez, 300.276… → değişmez.
 */
export function normalizeNearWholeTl(value: Decimal.Value | Prisma.Decimal): Decimal {
  const amount = toDecimal(value);
  if (!amount.isFinite()) {
    return amount;
  }

  const floored = amount.toDecimalPlaces(0, Decimal.ROUND_FLOOR);
  const fraction = amount.minus(floored);

  if (fraction.isZero()) {
    return floored;
  }

  if (fraction.gt(0) && fraction.lt(WHOLE_TL_RESIDUE_EPSILON)) {
    return floored;
  }

  const distanceToCeil = floored.plus(1).minus(amount);
  if (distanceToCeil.gt(0) && distanceToCeil.lt(WHOLE_TL_RESIDUE_EPSILON)) {
    return floored.plus(1);
  }

  return amount;
}

/**
 * Excel ROUNDUP(value, 0) eşdeğeri — pozitif tutarı bir üst tam TL'ye yuvarlar.
 * Önce Decimal artığını normalize eder. Math.ceil / Number kullanılmaz.
 */
export function roundUpToWholeTl(value: Decimal.Value | Prisma.Decimal): Decimal {
  return normalizeNearWholeTl(value).toDecimalPlaces(0, Decimal.ROUND_UP);
}
