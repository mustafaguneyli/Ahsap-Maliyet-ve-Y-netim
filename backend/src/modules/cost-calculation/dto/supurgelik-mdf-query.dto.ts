import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, Min } from 'class-validator';
import {
  SUPURGELIK_PRODUCT_CODES,
  type SupurgelikProductCode,
} from '../../../calculation-engine/calculators/supurgelik-mdf-calculator';

function toPositiveInt(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return value;
  }
  return Number(value);
}

/** GET /cost-calculation/supurgelik/mdf — internal ölçüler mm. */
export class SupurgelikMdfQueryDto {
  @IsNotEmpty({ message: 'productCode zorunludur.' })
  @IsIn(SUPURGELIK_PRODUCT_CODES, {
    message: 'productCode geçerli bir Süpürgelik ürünü olmalıdır.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productCode!: SupurgelikProductCode;

  @Transform(({ value }) => toPositiveInt(value))
  @IsInt({ message: 'thicknessMm tam mm olmalıdır.' })
  @Min(1, { message: 'thicknessMm pozitif olmalıdır.' })
  thicknessMm!: number;

  @Transform(({ value }) => toPositiveInt(value))
  @IsInt({ message: 'widthMm tam mm olmalıdır.' })
  @Min(1, { message: 'widthMm pozitif olmalıdır.' })
  widthMm!: number;

  @Transform(({ value }) => toPositiveInt(value))
  @IsInt({ message: 'lengthMm tam mm olmalıdır.' })
  @Min(1, { message: 'lengthMm pozitif olmalıdır.' })
  lengthMm!: number;
}
