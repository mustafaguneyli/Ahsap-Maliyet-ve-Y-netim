import { BadRequestException } from '@nestjs/common';
import { assertPricingRowException } from './pricing-row-exception.validation';

const from = new Date('2026-03-01T00:00:00.000Z');

describe('assertPricingRowException', () => {
  it('profitRate veya adjustmentAmount ile geçerli satırı kabul eder', () => {
    expect(() =>
      assertPricingRowException({
        productId: 'p-ayarli',
        thicknessMm: 16,
        widthMm: 100,
        lengthMm: 2500,
        profitRate: '20',
        adjustmentAmount: null,
        effectiveFrom: from,
        effectiveTo: null,
        productIsActive: true,
      }),
    ).not.toThrow();

    expect(() =>
      assertPricingRowException({
        productId: 'p-ayarli',
        thicknessMm: 18,
        widthMm: 80,
        lengthMm: 2200,
        profitRate: null,
        adjustmentAmount: '1',
        effectiveFrom: from,
        effectiveTo: null,
        productIsActive: true,
      }),
    ).not.toThrow();
  });

  it('ikisi de null ise reddeder', () => {
    expect(() =>
      assertPricingRowException({
        productId: 'p-ayarli',
        thicknessMm: 16,
        widthMm: 100,
        lengthMm: 2500,
        profitRate: null,
        adjustmentAmount: null,
        effectiveFrom: from,
        effectiveTo: null,
        productIsActive: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('negatif profitRate reddeder; negatif adjustment Decimal olarak kabul edilir', () => {
    expect(() =>
      assertPricingRowException({
        productId: 'p-ayarli',
        thicknessMm: 16,
        widthMm: 100,
        lengthMm: 2500,
        profitRate: '-1',
        adjustmentAmount: null,
        effectiveFrom: from,
        effectiveTo: null,
        productIsActive: true,
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      assertPricingRowException({
        productId: 'p-ayarli',
        thicknessMm: 18,
        widthMm: 100,
        lengthMm: 2200,
        profitRate: null,
        adjustmentAmount: '-1',
        effectiveFrom: from,
        effectiveTo: null,
        productIsActive: true,
      }),
    ).not.toThrow();
  });

  it('ölçü <= 0 veya productId boş reddeder', () => {
    expect(() =>
      assertPricingRowException({
        productId: '',
        thicknessMm: 16,
        widthMm: 100,
        lengthMm: 2500,
        profitRate: '20',
        adjustmentAmount: null,
        effectiveFrom: from,
        effectiveTo: null,
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      assertPricingRowException({
        productId: 'p-ayarli',
        thicknessMm: 0,
        widthMm: 100,
        lengthMm: 2500,
        profitRate: '20',
        adjustmentAmount: null,
        effectiveFrom: from,
        effectiveTo: null,
      }),
    ).toThrow(BadRequestException);
  });

  it('pasif ürüne exception atanamaz', () => {
    expect(() =>
      assertPricingRowException({
        productId: 'p-ayarli',
        thicknessMm: 16,
        widthMm: 100,
        lengthMm: 2500,
        profitRate: '20',
        adjustmentAmount: null,
        effectiveFrom: from,
        effectiveTo: null,
        productIsActive: false,
      }),
    ).toThrow(BadRequestException);
  });
});
