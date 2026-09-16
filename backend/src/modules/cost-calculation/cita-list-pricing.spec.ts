import { BadRequestException } from '@nestjs/common';
import { CITA_PUBLISHED_PRICE_MISSING } from '../pricing/cita-published-price-band-data';
import { citaPublishedPriceBandViewsFromSeeds } from '../pricing/cita-published-price-band-data';
import {
  attachCitaClassifiedPricing,
  attachCitaListPricing,
  loadCitaPublishedPriceBandViews,
  resolveCitaClassifiedPricing,
  resolveCitaListPricing,
} from './cita-list-pricing';

const bands = citaPublishedPriceBandViewsFromSeeds();

describe('resolveCitaListPricing', () => {
  it('DB bandındaki bağımsız nakit/kart değerlerini döner', () => {
    expect(resolveCitaListPricing(bands, { widthMm: 10, thicknessMm: 12 })).toEqual({
      pricingAvailable: true,
      priceBand: { minWidthMm: 10, maxWidthMm: 20 },
      publishedCashPrice: '115',
      publishedCardPrice: '138',
      statusCode: null,
    });
  });

  it('kapsam dışı kombinasyonda CITA_PUBLISHED_PRICE_MISSING döner', () => {
    expect(resolveCitaListPricing(bands, { widthMm: 10, thicknessMm: 18 })).toEqual({
      pricingAvailable: false,
      priceBand: null,
      publishedCashPrice: null,
      publishedCardPrice: null,
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
  });

  it('aynı width+thickness için birden fazla aktif bandı sessiz seçmez', () => {
    const duplicates = [
      ...bands,
      {
        ...bands[0],
        cashPrice: '999',
        cardPrice: '999',
      },
    ];
    expect(() =>
      resolveCitaListPricing(duplicates, { widthMm: 10, thicknessMm: 12 }),
    ).toThrow(BadRequestException);
  });

  it('inactive bandı kullanmaz', () => {
    const withInactive = [
      {
        minWidthMm: 10,
        maxWidthMm: 20,
        cashPrice: '1',
        cardPrice: '2',
        thicknessMm: [12],
        isActive: false,
        effectiveTo: null,
      },
      ...bands,
    ];
    expect(
      resolveCitaListPricing(withInactive, { widthMm: 10, thicknessMm: 12 })
        .publishedCashPrice,
    ).toBe('115');
  });
});

describe('attachCitaListPricing', () => {
  it('1 cm ve 2 cm satırlarını aynı 10–20 bandına bağlar', () => {
    const first = attachCitaListPricing(
      { thicknessMm: '12', widthMm: '10' },
      bands,
    );
    const second = attachCitaListPricing(
      { thicknessMm: '12', widthMm: '20' },
      bands,
    );
    expect(first.pricing.publishedCashPrice).toBe('115');
    expect(second.pricing.publishedCashPrice).toBe('115');
    expect(first.pricing.priceBand).toEqual({ minWidthMm: 10, maxWidthMm: 20 });
  });
});

describe('loadCitaPublishedPriceBandViews', () => {
  it('aynı açık min/max için duplicate aktif bandı reddeder', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'g-cita', isActive: true }),
      },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([
          {
            minWidthMm: 10,
            maxWidthMm: 20,
            cashPrice: { toString: () => '115' },
            cardPrice: { toString: () => '138' },
            isActive: true,
            effectiveTo: null,
            thicknesses: [{ thicknessMm: 12 }],
          },
          {
            minWidthMm: 10,
            maxWidthMm: 20,
            cashPrice: { toString: () => '116' },
            cardPrice: { toString: () => '139' },
            isActive: true,
            effectiveTo: null,
            thicknesses: [{ thicknessMm: 12 }],
          },
        ]),
      },
    };

    await expect(
      loadCitaPublishedPriceBandViews(
        prisma as never,
        new Date('2026-09-16T12:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('resolveCitaClassifiedPricing', () => {
  it('custom golden enleri DB master fiyatıyla eşler', () => {
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '15', thicknessMm: 12 })).toEqual({
      pricingAvailable: true,
      priceBand: {
        minWidthMm: 10,
        maxWidthMm: 20,
        displayName: '1–2 cm',
      },
      publishedCashPrice: '115',
      publishedCardPrice: '138',
      statusCode: null,
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '25', thicknessMm: 14 })).toMatchObject({
      publishedCashPrice: '145',
      publishedCardPrice: '174',
      priceBand: { minWidthMm: 30, maxWidthMm: 40, displayName: '3–4 cm' },
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '35', thicknessMm: 14 })).toMatchObject({
      publishedCashPrice: '145',
      publishedCardPrice: '174',
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '47', thicknessMm: 16 })).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
      priceBand: { minWidthMm: 50, maxWidthMm: 60, displayName: '5–6 cm' },
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '63', thicknessMm: 12 })).toMatchObject({
      publishedCashPrice: '215',
      publishedCardPrice: '258',
      priceBand: { displayName: '7–8 cm', minWidthMm: 70, maxWidthMm: 80 },
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '47', thicknessMm: 18 })).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });
  });

  it('25 mm exact list lookup missing iken classified 3–4 masterını kullanır', () => {
    expect(resolveCitaListPricing(bands, { widthMm: 25, thicknessMm: 14 })).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '25', thicknessMm: 14 })).toMatchObject({
      publishedCashPrice: '145',
      publishedCardPrice: '174',
    });
  });

  it('standart 14/30 classified ve list aynı fiyatı verir', () => {
    const listed = resolveCitaListPricing(bands, { widthMm: 30, thicknessMm: 14 });
    const quoted = resolveCitaClassifiedPricing(bands, { widthMm: '30', thicknessMm: 14 });
    expect(listed.publishedCashPrice).toBe('145');
    expect(quoted.publishedCashPrice).toBe('145');
    expect(quoted.publishedCardPrice).toBe(listed.publishedCardPrice);
  });

  it('thickness kapsamı olmayan custom ölçü missing döner', () => {
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '35', thicknessMm: 18 })).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
      pricingAvailable: false,
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '70', thicknessMm: 18 })).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '35', thicknessMm: 10 })).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '55', thicknessMm: 22 })).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '75', thicknessMm: 30 })).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '85', thicknessMm: 14 })).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
  });

  it('sınır Decimal width değerlerini doğru banda bağlar', () => {
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '20', thicknessMm: 12 })).toMatchObject({
      publishedCashPrice: '115',
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '20.1', thicknessMm: 12 })).toMatchObject({
      publishedCashPrice: '145',
      priceBand: { displayName: '3–4 cm' },
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '40.1', thicknessMm: 12 })).toMatchObject({
      publishedCashPrice: '185',
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '60.1', thicknessMm: 12 })).toMatchObject({
      publishedCashPrice: '215',
    });
    expect(resolveCitaClassifiedPricing(bands, { widthMm: '80.1', thicknessMm: 12 })).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
  });

  it('kartı nakit × 1.20 hesaplamaz; saklanan cardPrice döner', () => {
    const independent = bands.map((band) =>
      band.minWidthMm === 30
        ? { ...band, cashPrice: '100', cardPrice: '999' }
        : band,
    );
    expect(
      resolveCitaClassifiedPricing(independent, { widthMm: '35', thicknessMm: 14 }),
    ).toMatchObject({
      publishedCashPrice: '100',
      publishedCardPrice: '999',
    });
  });
});

describe('attachCitaClassifiedPricing', () => {
  it('35 mm satırına 3–4 cm displayName ekler', () => {
    const row = attachCitaClassifiedPricing(
      { thicknessMm: '14', widthMm: '35' },
      bands,
    );
    expect(row.pricing.priceBand).toEqual({
      minWidthMm: 30,
      maxWidthMm: 40,
      displayName: '3–4 cm',
    });
  });
});
