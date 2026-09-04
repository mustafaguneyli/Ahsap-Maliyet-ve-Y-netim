import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export type PricingSettingInput = {
  productGroupId: string | null | undefined;
  productId: string | null | undefined;
  vatRate: string | number | null | undefined;
  profitRate: string | number | null | undefined;
  cardMarkupRate: string | number | null | undefined;
  /** productGroupId doluysa ilgili ProductGroup.isActive */
  productGroupIsActive?: boolean | null;
  /** productId doluysa ilgili Product.isActive */
  productIsActive?: boolean | null;
};

function assertNonNegativeRate(
  fieldName: string,
  value: string | number | null | undefined,
): void {
  if (value == null || value === '') {
    return;
  }

  try {
    const decimal = toDecimal(value);
    if (decimal.isNegative()) {
      throw new BadRequestException(
        `${fieldName} negatif olamaz; verilen değer: ${String(value)}.`,
      );
    }
  } catch (err) {
    if (err instanceof BadRequestException) {
      throw err;
    }
    throw new BadRequestException(
      `${fieldName} geçerli bir Decimal değer olmalıdır; verilen değer: ${String(value)}.`,
    );
  }
}

function isRateProvided(value: string | number | null | undefined): boolean {
  return value != null && value !== '';
}

/**
 * PricingSetting doğrulaması.
 *
 * - Oranlar negatif olamaz (Decimal ile kontrol)
 * - Aynı kayıtta vatRate, profitRate, cardMarkupRate hepsi null olamaz
 * - productGroupId ve productId aynı anda dolu olamaz
 * - İkisi de boş = global ayar (izinli)
 * - productGroupId doluysa ProductGroup aktif olmalı
 * - productId doluysa Product aktif olmalı
 *
 * Not: Üst sınır (%100 vb.) kullanıcı doğrulamadığı için uygulanmaz.
 * Aktif kayıt tekilliği DB partial unique index ile korunur.
 */
export function assertPricingSetting(input: PricingSettingInput): void {
  const hasGroup = input.productGroupId != null && input.productGroupId !== '';
  const hasProduct = input.productId != null && input.productId !== '';

  if (hasGroup && hasProduct) {
    throw new BadRequestException(
      'Fiyatlandırma ayarı aynı anda hem productGroupId hem productId kapsamasında olamaz. ' +
        'Yalnızca birini seçin (veya global için ikisini de boş bırakın).',
    );
  }

  if (
    !isRateProvided(input.vatRate) &&
    !isRateProvided(input.profitRate) &&
    !isRateProvided(input.cardMarkupRate)
  ) {
    throw new BadRequestException(
      'PricingSetting kaydında vatRate, profitRate veya cardMarkupRate alanlarından en az biri dolu olmalıdır.',
    );
  }

  assertNonNegativeRate('vatRate', input.vatRate);
  assertNonNegativeRate('profitRate', input.profitRate);
  assertNonNegativeRate('cardMarkupRate', input.cardMarkupRate);

  if (hasGroup && input.productGroupIsActive === false) {
    throw new BadRequestException(
      `Ürün grubu (${input.productGroupId}) aktif değil. Pasif gruba fiyatlandırma ayarı atanamaz.`,
    );
  }

  if (hasProduct && input.productIsActive === false) {
    throw new BadRequestException(
      `Ürün (${input.productId}) aktif değil. Pasif ürüne fiyatlandırma ayarı atanamaz.`,
    );
  }
}
