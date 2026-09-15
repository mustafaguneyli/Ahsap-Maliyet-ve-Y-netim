import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, Matches } from 'class-validator';

/** SUPURGELIK group-scope normal baz fiyat kâr oranı. */
export class UpdateSupurgelikPricingSettingDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['SUPURGELIK'], {
    message: 'productGroup Süpürgelik için SUPURGELIK olmalıdır.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'SUPURGELIK';

  @IsNotEmpty({ message: 'Kâr oranı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Kâr oranı geçerli bir Decimal olmalıdır (örn. 20).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  profitRate!: string;
}
