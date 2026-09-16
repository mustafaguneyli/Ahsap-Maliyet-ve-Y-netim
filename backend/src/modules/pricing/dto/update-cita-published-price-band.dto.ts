import { Transform } from 'class-transformer';
import { IsNotEmpty, Matches } from 'class-validator';

/**
 * Yalnız nakit/kart master tutarları. min/max en ve thickness bu DTO’da yoktur.
 * Kart, nakit × 1.20 olarak üretilmez.
 */
export class UpdateCitaPublishedPriceBandDto {
  @IsNotEmpty({ message: 'cashPrice zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'cashPrice geçerli bir Decimal olmalıdır (örn. 145).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  cashPrice!: string;

  @IsNotEmpty({ message: 'cardPrice zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'cardPrice geçerli bir Decimal olmalıdır (örn. 174).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  cardPrice!: string;
}
