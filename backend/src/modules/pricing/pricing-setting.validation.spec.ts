import { BadRequestException } from '@nestjs/common';
import { assertPricingSetting } from './pricing-setting.validation';

describe('assertPricingSetting', () => {
  const rates = { vatRate: '0', profitRate: '20', cardMarkupRate: null as string | null };

  it('global ayarı (group ve product boş) kabul eder', () => {
    expect(() =>
      assertPricingSetting({
        productGroupId: null,
        productId: null,
        ...rates,
      }),
    ).not.toThrow();
  });

  it('yalnızca productGroup kapsamını kabul eder', () => {
    expect(() =>
      assertPricingSetting({
        productGroupId: 'group-1',
        productId: null,
        productGroupIsActive: true,
        ...rates,
      }),
    ).not.toThrow();
  });

  it('yalnızca aktif product kapsamını kabul eder', () => {
    expect(() =>
      assertPricingSetting({
        productGroupId: null,
        productId: 'product-34',
        productIsActive: true,
        vatRate: '0',
        profitRate: '20',
        cardMarkupRate: null,
      }),
    ).not.toThrow();
  });

  it('productGroupId ve productId aynı anda doluysa reddeder', () => {
    expect(() =>
      assertPricingSetting({
        productGroupId: 'group-1',
        productId: 'product-34',
        productGroupIsActive: true,
        productIsActive: true,
        ...rates,
      }),
    ).toThrow(BadRequestException);
  });

  it('pasif ürüne product-level ayar atanamaz', () => {
    expect(() =>
      assertPricingSetting({
        productGroupId: null,
        productId: 'product-34',
        productIsActive: false,
        ...rates,
      }),
    ).toThrow(BadRequestException);
  });

  it('pasif gruba group-level ayar atanamaz', () => {
    expect(() =>
      assertPricingSetting({
        productGroupId: 'group-1',
        productId: null,
        productGroupIsActive: false,
        ...rates,
      }),
    ).toThrow(BadRequestException);
  });
});
