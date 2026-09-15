import { BadRequestException } from '@nestjs/common';
import { PricingModifierType } from '@prisma/client';
import { assertPricingThicknessModifier } from './pricing-thickness-modifier.validation';

describe('assertPricingThicknessModifier', () => {
  const input = {
    productGroupId: 'group-supurgelik',
    modifierType: PricingModifierType.DECORATIVE,
    thicknessMm: 12,
    rate: '25',
    effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    effectiveTo: null,
    productGroupIsActive: true,
  };

  it('geçerli grup + kalınlık dekoratif oranını kabul eder', () => {
    expect(() => assertPricingThicknessModifier(input)).not.toThrow();
  });

  it.each([
    [{ ...input, productGroupId: '' }, 'productGroupId'],
    [{ ...input, thicknessMm: 0 }, 'thicknessMm'],
    [{ ...input, rate: '-1' }, 'negatif'],
    [{ ...input, rate: 'abc' }, 'Decimal'],
    [
      {
        ...input,
        effectiveTo: new Date('2026-02-28T00:00:00.000Z'),
      },
      'effectiveTo',
    ],
    [{ ...input, productGroupIsActive: false }, 'Pasif'],
  ] as const)('geçersiz girdiyi reddeder: %s', (invalid, message) => {
    expect(() => assertPricingThicknessModifier(invalid)).toThrow(
      BadRequestException,
    );
    expect(() => assertPricingThicknessModifier(invalid)).toThrow(message);
  });
});
