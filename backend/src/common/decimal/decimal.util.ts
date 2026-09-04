import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

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
