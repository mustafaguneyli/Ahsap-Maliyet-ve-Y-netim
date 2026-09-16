import { NotFoundException } from '@nestjs/common';

export const CITA_RAW_MATERIAL_PRICE_MISSING =
  'RAW_MATERIAL_PRICE_MISSING' as const;

export class CitaRawMaterialPriceMissingException extends NotFoundException {
  readonly errorCode = CITA_RAW_MATERIAL_PRICE_MISSING;

  constructor(readonly rawMaterialCode: string) {
    super(`Aktif MDF fiyatı bulunamadı: ${rawMaterialCode} / CARD_INSTALLMENT`);
  }
}
