import { NotFoundException } from '@nestjs/common';
import type { CitaMaterialPriceType } from '../../calculation-engine/calculators/cita-mdf-calculator';
import {
  COST_MATERIAL_PRICE_TYPE,
  missingCostMaterialPriceMessage,
} from './cost-material-price';

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

  readonly materialPriceType = COST_MATERIAL_PRICE_TYPE;

  constructor(
    readonly rawMaterialCode: string,
    _materialPriceType?: CitaMaterialPriceType,
  ) {
    super(missingCostMaterialPriceMessage(rawMaterialCode));
  }
}
