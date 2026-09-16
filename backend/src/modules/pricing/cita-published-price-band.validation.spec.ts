import { BadRequestException } from '@nestjs/common';
import {
  assertCitaPublishedPriceBand,
  citaPublishedWidthRangesOverlap,
} from './cita-published-price-band.validation';

const valid = {
  productGroupId: 'g-cita',
  minWidthMm: 10,
  maxWidthMm: 20,
  cashPrice: '115',
  cardPrice: '138',
  thicknessMm: [12, 14, 16],
  effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
  effectiveTo: null as Date | null,
  productGroupIsActive: true,
};

describe('assertCitaPublishedPriceBand', () => {
  it('doğrulanmış 1–2 cm bandını kabul eder', () => {
    expect(() => assertCitaPublishedPriceBand(valid)).not.toThrow();
  });

  it.each(['0', '-1', 'abc'])('geçersiz cashPrice %s reddedilir', (cashPrice) => {
    expect(() =>
      assertCitaPublishedPriceBand({ ...valid, cashPrice }),
    ).toThrow(BadRequestException);
  });

  it.each(['0', '-5'])('geçersiz cardPrice %s reddedilir', (cardPrice) => {
    expect(() =>
      assertCitaPublishedPriceBand({ ...valid, cardPrice }),
    ).toThrow(BadRequestException);
  });

  it('ondalıklı bağımsız kart fiyatını kabul eder', () => {
    expect(() =>
      assertCitaPublishedPriceBand({
        ...valid,
        cashPrice: '115.50',
        cardPrice: '200.25',
      }),
    ).not.toThrow();
  });

  it('maxWidthMm < minWidthMm reddedilir', () => {
    expect(() =>
      assertCitaPublishedPriceBand({ ...valid, minWidthMm: 20, maxWidthMm: 10 }),
    ).toThrow(BadRequestException);
  });

  it('boş veya duplicate thickness reddedilir', () => {
    expect(() =>
      assertCitaPublishedPriceBand({ ...valid, thicknessMm: [] }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertCitaPublishedPriceBand({ ...valid, thicknessMm: [12, 12] }),
    ).toThrow(BadRequestException);
  });

  it('pasif grup reddedilir', () => {
    expect(() =>
      assertCitaPublishedPriceBand({ ...valid, productGroupIsActive: false }),
    ).toThrow(BadRequestException);
  });
});

describe('citaPublishedWidthRangesOverlap', () => {
  it('1–2 cm ile 3–4 cm çakışmaz', () => {
    expect(
      citaPublishedWidthRangesOverlap(
        { minWidthMm: 10, maxWidthMm: 20 },
        { minWidthMm: 30, maxWidthMm: 40 },
      ),
    ).toBe(false);
  });

  it('aynı aralık çakışır', () => {
    expect(
      citaPublishedWidthRangesOverlap(
        { minWidthMm: 10, maxWidthMm: 20 },
        { minWidthMm: 10, maxWidthMm: 20 },
      ),
    ).toBe(true);
  });
});
