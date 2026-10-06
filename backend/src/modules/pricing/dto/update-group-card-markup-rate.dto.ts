import { Transform } from 'class-transformer';
import { IsNotEmpty, Matches } from 'class-validator';

/** Aktif ürün grubunun group-scope kart/taksit oranı (%). */
export class UpdateGroupCardMarkupRateDto {
  @IsNotEmpty({ message: 'Ürün grubu zorunludur.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: string;

  @IsNotEmpty({ message: 'Kart / taksit farkı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Kart / taksit farkı geçerli bir Decimal olmalıdır (örn. 20 veya 18.5).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  cardMarkupRate!: string;
}
