import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, Matches } from 'class-validator';

/**
 * Pervaz product-level profitRate + group-scope cardMarkupRate.
 * cardFixedSurchargeAmount opsiyonel legacy alandır; kart satışı yüzde ile üretilir.
 */
export class UpdateAyarliPervazPricingSettingDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['PERVAZ'], { message: 'productGroup Ayarlı Pervaz için PERVAZ olmalıdır.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'PERVAZ';

  @IsNotEmpty({ message: 'Kâr oranı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Kâr oranı geçerli bir Decimal olmalıdır (örn. 15).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  profitRate!: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Kart / taksit farkı geçerli bir Decimal olmalıdır (örn. 20 veya 18.5).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  cardMarkupRate?: string;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Kart/taksit sabit farkı geçerli bir Decimal olmalıdır (örn. 2).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  cardFixedSurchargeAmount?: string;
}
