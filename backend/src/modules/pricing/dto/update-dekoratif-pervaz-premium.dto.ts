import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, Matches, Min } from 'class-validator';

export const DEKORATIF_PERVAZ_PREMIUM_PRODUCT_CODES = [
  'DEKORATIF_PERVAZ',
  'DEKORATIF_PERVAZ_GENIS_KILCIK',
] as const;

export type DekoratifPervazPremiumProductCode =
  (typeof DEKORATIF_PERVAZ_PREMIUM_PRODUCT_CODES)[number];

/** Pervaz dekoratif farkı: mevcut PricingRowException satır scope'u. */
export class UpdateDekoratifPervazPremiumDto {
  @Type(() => Number)
  @IsInt({ message: 'thicknessMm tam sayı olmalıdır.' })
  @Min(1, { message: 'thicknessMm pozitif tam sayı (mm) olmalıdır.' })
  thicknessMm!: number;

  @Type(() => Number)
  @IsInt({ message: 'widthMm tam sayı olmalıdır.' })
  @Min(1, { message: 'widthMm pozitif tam sayı (mm) olmalıdır.' })
  widthMm!: number;

  @Type(() => Number)
  @IsInt({ message: 'lengthMm tam sayı olmalıdır.' })
  @Min(1, { message: 'lengthMm pozitif tam sayı (mm) olmalıdır.' })
  lengthMm!: number;

  @IsNotEmpty({ message: 'Dekoratif fark oranı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Dekoratif fark oranı geçerli bir Decimal olmalıdır (örn. 50).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  rate!: string;
}
