import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, Matches } from 'class-validator';

/**
 * Yalnız nakit master tutarı. min/max en ve thickness bu DTO’da yoktur.
 * cardPrice legacy kolonu korumak için opsiyoneldir; runtime kart kaynağı değildir.
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

  @IsOptional()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'cardPrice geçerli bir Decimal olmalıdır (örn. 174).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  cardPrice?: string;
}
