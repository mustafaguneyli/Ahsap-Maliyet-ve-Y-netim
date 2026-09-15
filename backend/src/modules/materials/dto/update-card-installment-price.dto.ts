import { IsNotEmpty, Matches } from 'class-validator';

/** Para string olarak alınır; Number/float dönüşümü yapılmaz. */
export class UpdateCardInstallmentPriceDto {
  @IsNotEmpty({ message: 'Kart / Taksit fiyatı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message:
      'Kart / Taksit fiyatı geçerli bir Decimal olmalıdır (örn. 1900.00).',
  })
  price!: string;
}
