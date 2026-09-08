import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, Matches } from 'class-validator';

/**
 * Pervaz product-level PricingSetting.
 * profitRate zorunlu. cardFixedSurchargeAmount opsiyonel; yoksa mevcut değer korunur.
 * cardMarkupRate yazılmaz.
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
    message: 'Kart/taksit sabit farkı geçerli bir Decimal olmalıdır (örn. 2).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  cardFixedSurchargeAmount?: string;
}
