import { NotFoundException } from '@nestjs/common';
import type { CitaMaterialPriceType } from '../../calculation-engine/calculators/cita-mdf-calculator';

export const SUPURGELIK_DECORATIVE_RATE_MISSING =
  'DECORATIVE_RATE_MISSING' as const;

export function supurgelikDecorativeRateMissingMessage(thicknessMm: number): string {
  return `Doğrulanmış Süpürgelik dekoratif oranı bulunamadı: ${thicknessMm} mm`;
}

export function supurgelikPpWrappingCostMissingMessage(): string {
  return 'PP sarma maliyeti tanımlı değil';
}

export class SupurgelikRawMaterialPriceMissingException extends NotFoundException {
  readonly errorCode = 'RAW_MATERIAL_PRICE_MISSING' as const;

  constructor(
    readonly rawMaterialCode: string,
    readonly materialPriceType: CitaMaterialPriceType = 'CARD_INSTALLMENT',
  ) {
    super(
      `Aktif MDF fiyatı bulunamadı: ${rawMaterialCode} / ${materialPriceType}`,
    );
  }
}
