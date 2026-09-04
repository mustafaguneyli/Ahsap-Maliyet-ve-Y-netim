import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export type ExtraCostValueScopeInput = {
  productGroupId: string | null | undefined;
  productId: string | null | undefined;
  amount: string | number;
  effectiveFrom: Date;
  effectiveTo: Date | null | undefined;
  /** productId doluysa ilgili Product.isActive */
  productIsActive?: boolean | null;
  /** productGroupId doluysa ilgili ProductGroup.isActive */
  productGroupIsActive?: boolean | null;
};

/**
 * ExtraCostValue kapsam ve dönem doğrulaması.
 *
 * 1. productGroupId ve productId aynı anda dolu olamaz
 * 2. En az biri dolu olmak zorunda
 * 3. amount >= 0
 * 4. effectiveTo varsa effectiveTo > effectiveFrom
 * 5. productId doluysa Product aktif olmalı
 * 6. productGroupId doluysa ProductGroup aktif olmalı
 */
export function assertExtraCostValueScope(input: ExtraCostValueScopeInput): void {
  const hasGroup = input.productGroupId != null && input.productGroupId !== '';
  const hasProduct = input.productId != null && input.productId !== '';

  if (hasGroup && hasProduct) {
    throw new BadRequestException(
      'Ek maliyet kaydı aynı anda hem productGroupId hem productId kapsamasında olamaz. ' +
        'Yalnızca birini seçin.',
    );
  }

  if (!hasGroup && !hasProduct) {
    throw new BadRequestException(
      'Ek maliyet kaydı için productGroupId veya productId zorunludur. ' +
        'Kapsam belirsiz bırakılamaz.',
    );
  }

  try {
    if (toDecimal(input.amount).isNegative()) {
      throw new BadRequestException(
        `Ek maliyet tutarı (amount) 0 veya pozitif olmalıdır; verilen değer: ${String(input.amount)}.`,
      );
    }
  } catch (err) {
    if (err instanceof BadRequestException) {
      throw err;
    }
    throw new BadRequestException(
      `Ek maliyet tutarı (amount) geçerli bir sayı olmalıdır; verilen değer: ${String(input.amount)}.`,
    );
  }

  if (input.effectiveTo != null) {
    if (!(input.effectiveTo > input.effectiveFrom)) {
      throw new BadRequestException(
        'effectiveTo varsa effectiveFrom tarihinden sonra olmalıdır (effectiveTo > effectiveFrom).',
      );
    }
  }

  if (hasProduct && input.productIsActive === false) {
    throw new BadRequestException(
      `Ürün (${input.productId}) aktif değil. Pasif ürüne ek maliyet atanamaz.`,
    );
  }

  if (hasGroup && input.productGroupIsActive === false) {
    throw new BadRequestException(
      `Ürün grubu (${input.productGroupId}) aktif değil. Pasif gruba ek maliyet atanamaz.`,
    );
  }
}
