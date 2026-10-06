import { IsIn, IsNotEmpty, IsOptional, Matches } from 'class-validator';

const RATE = /^\d+([.,]\d+)?$/;

/**
 * Kapı İmalatı group-scope PricingSetting.
 * 0 oran kabul; boş alan PATCH’te “değiştirme” değil — zorunlu alanlar dolu olmalı.
 */
export class UpdateDoorBuildPricingSettingDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['KAPI_IMALATI'], {
    message: 'productGroup Kapı İmalatı için KAPI_IMALATI olmalıdır.',
  })
  productGroup!: 'KAPI_IMALATI';

  @IsNotEmpty({ message: 'Kâr oranı zorunludur.' })
  @Matches(RATE, { message: 'Kâr oranı geçerli bir sayı olmalıdır.' })
  profitRate!: string;

  @IsNotEmpty({ message: 'KDV oranı zorunludur.' })
  @Matches(RATE, { message: 'KDV oranı geçerli bir sayı olmalıdır.' })
  vatRate!: string;

  /** Boş/omit → kart oranı null (nakit var, kart yok). 0 → card = cash. */
  @IsOptional()
  @Matches(RATE, { message: 'Kart/taksit oranı geçerli bir sayı olmalıdır.' })
  cardMarkupRate?: string;
}
