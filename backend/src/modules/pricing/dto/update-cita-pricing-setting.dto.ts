import { IsIn, IsNotEmpty, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { transformDecimalString } from '../pricing-setting.validation';

/** CITA group-scope kart/taksit oranı (%). */
export class UpdateCitaPricingSettingDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['CITA'], { message: 'productGroup Çıta için CITA olmalıdır.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'CITA';

  @IsNotEmpty({ message: 'Kart / taksit farkı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Kart / taksit farkı geçerli bir Decimal olmalıdır (örn. 20 veya 18.5).',
  })
  @Transform(transformDecimalString)
  cardMarkupRate!: string;
}
