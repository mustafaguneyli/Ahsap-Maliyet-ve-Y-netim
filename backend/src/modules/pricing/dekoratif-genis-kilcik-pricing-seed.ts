import { PrismaClient } from '@prisma/client';
import {
  seedDekoratifProductPricing,
  type DekoratifPervazPricingSeedReport,
} from './dekoratif-pervaz-pricing-seed';

/** Excel AC96–AC97: normal Dekoratif oranına ek değil, tek toplam fark %30. */
export const DEKORATIF_GENIS_KILCIK_PREMIUM_SEEDS = [
  { thicknessMm: 12, widthMm: 90, lengthMm: 2200, rate: '30' },
  { thicknessMm: 12, widthMm: 90, lengthMm: 2300, rate: '30' },
] as const;

export function seedDekoratifGenisKilcikPricing(
  prisma: PrismaClient,
): Promise<DekoratifPervazPricingSeedReport> {
  return seedDekoratifProductPricing(
    prisma,
    'DEKORATIF_PERVAZ_GENIS_KILCIK',
    DEKORATIF_GENIS_KILCIK_PREMIUM_SEEDS,
  );
}
