import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, Min } from 'class-validator';

function toPositiveInt(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return value;
  }
  return Number(value);
}

/**
 * GET /cost-calculation/pervaz/mdf
 * Internal ölçüler mm.
 */
export class AyarliPervazMdfQueryDto {
  @IsNotEmpty({ message: 'productCode zorunludur.' })
  @IsIn(['AYARLI_PERVAZ'], {
    message: 'Bu aşamada productCode yalnız AYARLI_PERVAZ olabilir.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productCode!: 'AYARLI_PERVAZ';

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
