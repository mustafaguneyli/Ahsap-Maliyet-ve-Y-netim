import {
  CITA_PUBLISHED_PRICE_BAND_SEEDS,
  CITA_PUBLISHED_PRICE_MISSING,
  CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM,
  citaPublishedPriceBandViewsFromSeeds,
  selectCitaPublishedPrice,
} from './cita-published-price-band-data';

const bands = citaPublishedPriceBandViewsFromSeeds();

describe('CITA_PUBLISHED_PRICE_BAND_SEEDS', () => {
  it('dört bağımsız nakit/kart bandını doğrulanmış matrisle tutar', () => {
    expect(CITA_PUBLISHED_PRICE_BAND_SEEDS).toEqual([
      {
        minWidthMm: 10,
        maxWidthMm: 20,
        cashPrice: '115',
        cardPrice: '138',
        thicknessMm: [12, 14, 16],
      },
      {
        minWidthMm: 30,
        maxWidthMm: 40,
        cashPrice: '145',
        cardPrice: '174',
        thicknessMm: [12, 14, 16],
      },
      {
        minWidthMm: 50,
        maxWidthMm: 60,
        cashPrice: '185',
        cardPrice: '222',
        thicknessMm: [12, 14, 16, 18],
      },
      {
        minWidthMm: 70,
        maxWidthMm: 80,
        cashPrice: '215',
        cardPrice: '258',
        thicknessMm: [12, 14, 16],
      },
    ]);
    expect(CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM).toEqual([
      10, 22, 30,
    ]);
  });

  it('18 mm yalnız 5–6 cm bandındadır', () => {
    const with18 = CITA_PUBLISHED_PRICE_BAND_SEEDS.filter((seed) =>
      seed.thicknessMm.some((value) => value === 18),
    );
    expect(with18).toEqual([
      expect.objectContaining({
        minWidthMm: 50,
        maxWidthMm: 60,
        cashPrice: '185',
        cardPrice: '222',
      }),
    ]);
  });

  it('10/22/30 mm hiçbir bantta yoktur', () => {
    const covered = new Set<number>(
      CITA_PUBLISHED_PRICE_BAND_SEEDS.flatMap((seed) => [...seed.thicknessMm]),
    );
    for (const thicknessMm of CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM) {
      expect(covered.has(thicknessMm)).toBe(false);
    }
  });
});

describe('selectCitaPublishedPrice', () => {
  it('1 cm ve 2 cm aynı 1–2 cm fiyatına bağlanır', () => {
    expect(selectCitaPublishedPrice(bands, { widthMm: 10, thicknessMm: 12 })).toEqual({
      cashPrice: '115',
      cardPrice: '138',
      statusCode: null,
      minWidthMm: 10,
      maxWidthMm: 20,
    });
    expect(selectCitaPublishedPrice(bands, { widthMm: 20, thicknessMm: 12 })).toEqual({
      cashPrice: '115',
      cardPrice: '138',
      statusCode: null,
      minWidthMm: 10,
      maxWidthMm: 20,
    });
  });

  it('3–4 / 5–6 / 7–8 bantlarını kalınlık kapsamıyla eşler', () => {
    expect(selectCitaPublishedPrice(bands, { widthMm: 30, thicknessMm: 14 })).toMatchObject({
      cashPrice: '145',
      cardPrice: '174',
    });
    expect(selectCitaPublishedPrice(bands, { widthMm: 60, thicknessMm: 18 })).toMatchObject({
      cashPrice: '185',
      cardPrice: '222',
    });
    expect(selectCitaPublishedPrice(bands, { widthMm: 80, thicknessMm: 16 })).toMatchObject({
      cashPrice: '215',
      cardPrice: '258',
    });
  });

  it('kaynak fiyatı olmayan kombinasyonlar CITA_PUBLISHED_PRICE_MISSING döner', () => {
    const missing = [
      { widthMm: 10, thicknessMm: 10 },
      { widthMm: 50, thicknessMm: 22 },
      { widthMm: 80, thicknessMm: 30 },
      { widthMm: 10, thicknessMm: 18 },
      { widthMm: 40, thicknessMm: 18 },
      { widthMm: 70, thicknessMm: 18 },
    ];
    for (const query of missing) {
      expect(selectCitaPublishedPrice(bands, query)).toEqual({
        cashPrice: null,
        cardPrice: null,
        statusCode: CITA_PUBLISHED_PRICE_MISSING,
      });
    }
  });

  it('kart fiyatını nakit × 1.20 olarak hesaplamaz; saklanan cardPrice döner', () => {
    const independent = [
      {
        minWidthMm: 10,
        maxWidthMm: 20,
        cashPrice: '100',
        cardPrice: '999',
        thicknessMm: [12],
        isActive: true,
        effectiveTo: null,
      },
    ];
    expect(
      selectCitaPublishedPrice(independent, { widthMm: 10, thicknessMm: 12 }),
    ).toMatchObject({
      cashPrice: '100',
      cardPrice: '999',
    });
  });
});
