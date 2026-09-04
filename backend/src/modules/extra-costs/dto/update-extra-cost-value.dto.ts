import { IsDateString, IsIn, IsNotEmpty, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Para alanı string Decimal; Number/float kullanılmaz.
 * Örn: "10.00"
 */
export class UpdateExtraCostValueDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['door_frame'], { message: 'productGroup şu an yalnızca door_frame olabilir.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'door_frame';

  @IsNotEmpty({ message: 'Yeni tutar zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Tutar geçerli bir Decimal olmalıdır (örn. 10.00).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(',', '.') : value))
  amount!: string;

  @IsDateString({}, { message: 'Geçerlilik tarihi geçerli bir tarih olmalıdır (YYYY-MM-DD).' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  effectiveFrom!: string;
}
