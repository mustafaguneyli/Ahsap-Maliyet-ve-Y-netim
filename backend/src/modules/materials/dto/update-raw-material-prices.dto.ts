import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, Matches } from 'class-validator';

/**
 * Para alanları string olarak alınır; Number/float kullanılmaz.
 * Örn: "3750.00"
 */
export class UpdateRawMaterialPricesDto {
  @IsNotEmpty({ message: 'Peşin fiyat zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Peşin fiyat geçerli bir Decimal olmalıdır (örn. 3750.00).',
  })
  cashPrice!: string;

  @IsNotEmpty({ message: 'K.Kartı fiyatı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'K.Kartı fiyatı geçerli bir Decimal olmalıdır (örn. 4400.00).',
  })
  cardInstallmentPrice!: string;

  @IsDateString({}, { message: 'Geçerlilik tarihi geçerli bir tarih olmalıdır (YYYY-MM-DD).' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  effectiveFrom!: string;
}
