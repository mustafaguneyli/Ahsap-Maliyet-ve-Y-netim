import { NotFoundException } from '@nestjs/common';
import type { CitaMaterialPriceType } from '../../calculation-engine/calculators/cita-mdf-calculator';

export const CITA_RAW_MATERIAL_PRICE_MISSING =
  'RAW_MATERIAL_PRICE_MISSING' as const;

export class CitaRawMaterialPriceMissingException extends NotFoundException {
  readonly errorCode = CITA_RAW_MATERIAL_PRICE_MISSING;

  constructor(
    readonly rawMaterialCode: string,
    readonly materialPriceType: CitaMaterialPriceType = 'CARD_INSTALLMENT',
  ) {
    super({
      message: `Aktif MDF fiyatı bulunamadı: ${rawMaterialCode} / ${materialPriceType}`,
      errorCode: CITA_RAW_MATERIAL_PRICE_MISSING,
      materialPriceType,
      rawMaterialCode,
    });
  }
}
