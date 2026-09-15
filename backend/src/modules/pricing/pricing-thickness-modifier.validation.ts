import { BadRequestException } from '@nestjs/common';
import { PricingModifierType } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';

export type PricingThicknessModifierInput = {
  productGroupId: string | null | undefined;
  modifierType: PricingModifierType;
  thicknessMm: number;
  rate: string | number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  productGroupIsActive?: boolean | null;
};

/** Grup + kalınlık scope'undaki ticari modifier için uygulama katmanı doğrulaması. */
export function assertPricingThicknessModifier(
  input: PricingThicknessModifierInput,
): void {
  if (input.productGroupId == null || input.productGroupId === '') {
    throw new BadRequestException(
      'Kalınlık bazlı pricing modifier için productGroupId zorunludur.',
    );
  }
  if (input.modifierType !== PricingModifierType.DECORATIVE) {
    throw new BadRequestException('Desteklenmeyen pricing modifier türü.');
  }
  if (!Number.isInteger(input.thicknessMm) || input.thicknessMm <= 0) {
    throw new BadRequestException('thicknessMm pozitif tam sayı (mm) olmalıdır.');
  }

  let rate;
  try {
    rate = toDecimal(input.rate);
  } catch {
    throw new BadRequestException('Dekoratif oran geçerli bir Decimal olmalıdır.');
  }
  if (rate.isNegative()) {
    throw new BadRequestException('Dekoratif oran negatif olamaz.');
  }

  if (input.effectiveTo != null && !(input.effectiveTo > input.effectiveFrom)) {
    throw new BadRequestException(
      'effectiveTo varsa effectiveFrom tarihinden sonra olmalıdır.',
    );
  }
  if (input.productGroupIsActive === false) {
    throw new BadRequestException('Pasif ürün grubuna pricing modifier atanamaz.');
  }
}
