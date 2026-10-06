import { IsNotEmpty, Matches } from 'class-validator';

/** Para string olarak alınır; Number/float dönüşümü yapılmaz. */
export class UpdateCashPriceDto {
  @IsNotEmpty({ message: 'Nakit alış fiyatı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Nakit alış fiyatı geçerli bir Decimal olmalıdır (örn. 1600.00).',
  })
  price!: string;
}
