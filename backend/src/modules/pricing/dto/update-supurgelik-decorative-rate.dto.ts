import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, Matches, Min } from 'class-validator';

/** SUPURGELIK grup + kalınlık dekoratif oranı. Katalogda görünen eksik kalınlıklar da yazılabilir. */
export class UpdateSupurgelikDecorativeRateDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['SUPURGELIK'], {
    message: 'productGroup Süpürgelik için SUPURGELIK olmalıdır.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'SUPURGELIK';

  @Type(() => Number)
  @IsInt({ message: 'thicknessMm tam sayı olmalıdır.' })
  @Min(1, { message: 'thicknessMm pozitif tam sayı (mm) olmalıdır.' })
  thicknessMm!: number;

  @IsNotEmpty({ message: 'Dekoratif oran zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Dekoratif oran geçerli bir Decimal olmalıdır (örn. 25).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  rate!: string;
}
