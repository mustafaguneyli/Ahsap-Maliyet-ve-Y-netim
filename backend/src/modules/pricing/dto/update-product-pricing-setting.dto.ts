import { IsIn, IsNotEmpty, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Oranlar yüzde değeri string Decimal (örn. %20 → "20").
 * Number/float kullanılmaz.
 */
export class UpdateProductPricingSettingDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['door_frame'], { message: 'productGroup şu an yalnızca door_frame olabilir.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'door_frame';

  @IsNotEmpty({ message: 'KDV oranı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'KDV oranı geçerli bir Decimal olmalıdır (örn. 0 veya 10).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(',', '.') : value))
  vatRate!: string;

  @IsNotEmpty({ message: 'Kâr oranı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Kâr oranı geçerli bir Decimal olmalıdır (örn. 20).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(',', '.') : value))
  profitRate!: string;

  @IsNotEmpty({ message: 'Kredi kartı farkı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Kredi kartı farkı geçerli bir Decimal olmalıdır (örn. 20).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(',', '.') : value))
  cardMarkupRate!: string;
}
