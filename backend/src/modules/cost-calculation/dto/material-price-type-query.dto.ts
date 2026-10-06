import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { CITA_MATERIAL_PRICE_TYPES } from '../../../calculation-engine/calculators/cita-mdf-calculator';

function trimQuery(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Liste ve tek ölçü sorgularında isteğe bağlı MDF alış türü. Yoksa CARD_INSTALLMENT. */
export class MaterialPriceTypeQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimQuery(value))
  @IsIn(CITA_MATERIAL_PRICE_TYPES, {
    message: 'materialPriceType CASH veya CARD_INSTALLMENT olmalıdır.',
  })
  materialPriceType?: (typeof CITA_MATERIAL_PRICE_TYPES)[number];
}
