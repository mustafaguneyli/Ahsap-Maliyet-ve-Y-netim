import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional } from 'class-validator';
import { CITA_MATERIAL_PRICE_TYPES } from '../../../calculation-engine/calculators/cita-mdf-calculator';

function trimQuery(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** GET /cost-calculation/cita/list — alış türü yoksa CARD_INSTALLMENT. */
export class CitaListQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimQuery(value))
  @IsIn(CITA_MATERIAL_PRICE_TYPES, {
    message: 'materialPriceType CASH veya CARD_INSTALLMENT olmalıdır.',
  })
  materialPriceType?: (typeof CITA_MATERIAL_PRICE_TYPES)[number];
}

/** GET /cost-calculation/cita/net, /cita/mdf ve /cita — internal ölçüler mm. */
export class CitaNetQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimQuery(value))
  @IsIn(CITA_MATERIAL_PRICE_TYPES, {
    message: 'materialPriceType CASH veya CARD_INSTALLMENT olmalıdır.',
  })
  materialPriceType?: (typeof CITA_MATERIAL_PRICE_TYPES)[number];

  @IsNotEmpty({ message: 'thicknessMm zorunludur.' })
  @Transform(({ value }) => trimQuery(value))
  thicknessMm!: string;

  @IsNotEmpty({ message: 'widthMm zorunludur.' })
  @Transform(({ value }) => trimQuery(value))
  widthMm!: string;

  @IsNotEmpty({ message: 'lengthMm zorunludur.' })
  @Transform(({ value }) => trimQuery(value))
  lengthMm!: string;
}
