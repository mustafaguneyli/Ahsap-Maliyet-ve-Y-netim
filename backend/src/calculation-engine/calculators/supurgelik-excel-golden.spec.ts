import {
  SUPURGELIK_PRODUCT_CODES,
  SupurgelikMdfCalculator,
  type SupurgelikMdfInput,
  type SupurgelikProductCode,
} from './supurgelik-mdf-calculator';
import {
  SUPURGELIK_EXCEL_GOLDEN_COUNTS,
  SUPURGELIK_EXCEL_GOLDEN_INPUTS,
  SUPURGELIK_EXCEL_GOLDEN_ROWS,
  SUPURGELIK_EXCEL_GOLDEN_SPOTLIGHTS,
  SUPURGELIK_PP_WRAPPING_TEST,
  SUPURGELIK_SOURCE_DELTA_GOLDEN,
  type SupurgelikExcelGoldenRow,
} from './fixtures/supurgelik-excel-golden.fixture';
import { SUPURGELIK_PRODUCTION_YIELD_SEEDS } from '../../modules/production-yields/supurgelik-yield-seed-data';

const calculator = new SupurgelikMdfCalculator();
const I = SUPURGELIK_EXCEL_GOLDEN_INPUTS;

function extraCosts() {
  return [
    { code: 'CUTTING', name: 'Kesim', amount: I.extras.cutting },
    { code: 'LABOR', name: 'İşçilik', amount: I.extras.labor },
  ];
}

function baseInput(
  golden: SupurgelikExcelGoldenRow,
  productCode: SupurgelikProductCode,
): Omit<SupurgelikMdfInput, 'pricing'> {
  if (golden.sheetPrice == null) {
    throw new Error(
      `Golden calculator girdisi fiyatı olmayan satır için üretilemez: ${golden.thicknessMm}/${golden.widthMm}`,
    );
  }
  return {
    productCode,
    thicknessMm: golden.thicknessMm,
    widthMm: golden.widthMm,
    lengthMm: golden.lengthMm,
    rawMaterial: {
      code: golden.rawMaterialCode,
      thicknessMm: String(golden.thicknessMm),
      sheetWidthMm: I.sheetWidthMm,
      sheetLengthMm: I.sheetLengthMm,
    },
    sheetPrice: {
      priceType: 'CARD_INSTALLMENT',
      amount: golden.sheetPrice,
    },
    productionYield: {
      netQty: golden.netQty,
      scope: 'GENERIC',
    },
    extraCosts: extraCosts(),
  };
}

function findGolden(thicknessMm: number, widthMm: number): SupurgelikExcelGoldenRow {
  const golden = SUPURGELIK_EXCEL_GOLDEN_ROWS.find(
    (row) => row.thicknessMm === thicknessMm && row.widthMm === widthMm,
  );
  if (!golden) {
    throw new Error(`Golden satır yok: ${thicknessMm}/${widthMm}`);
  }
  return golden;
}

function assertContract(actual: {
  productionYield: { netQty: number; productId: null };
  sheetPrice: { amount: string } | { amount: string };
  mdfUnitCost: string | null;
  extraCostsTotal: string;
  productionCost: string | null;
  pricing?: {
    profitRate?: string;
    publishedCashPrice?: string | null;
    decorativeRate?: string | null;
    statusCode?: string | null;
  };
}): void {
  expect(actual.productionYield).toEqual(
    expect.objectContaining({ netQty: expect.any(Number), productId: null }),
  );
  expect(actual).toHaveProperty('sheetPrice');
  expect(actual).toHaveProperty('mdfUnitCost');
  expect(actual).toHaveProperty('extraCostsTotal');
  expect(actual).toHaveProperty('productionCost');
  expect(actual.pricing).toEqual(
    expect.objectContaining({
      publishedCashPrice: expect.anything(),
    }),
  );
}

/**
 * Süpürgelik Excel golden regression — merkezi formül kilidi (DB yok).
 * Source wiring / history / audit ayrı rollback spec’lerde; beklenen sayılar
 * `supurgelik-excel-golden.fixture.ts` içindedir.
 */
describe('SupurgelikMdfCalculator Excel golden regression (DB yok)', () => {
  it(`${SUPURGELIK_EXCEL_GOLDEN_COUNTS.rows} standart NET master kilidi; productId=null`, () => {
    expect(SUPURGELIK_EXCEL_GOLDEN_ROWS).toHaveLength(SUPURGELIK_EXCEL_GOLDEN_COUNTS.rows);
    expect(SUPURGELIK_PRODUCTION_YIELD_SEEDS).toHaveLength(30);
    expect(SUPURGELIK_EXCEL_GOLDEN_ROWS.filter((row) => row.netSource === 'EXCEL_MASTER')).toHaveLength(
      SUPURGELIK_EXCEL_GOLDEN_COUNTS.excelMaster,
    );

    expect(
      SUPURGELIK_EXCEL_GOLDEN_ROWS.map((row) => ({
        materialCode: row.rawMaterialCode,
        pieceWidthMm: row.widthMm,
        pieceLengthMm: row.lengthMm,
        netQty: row.netQty,
        source: row.netSource,
      })),
    ).toEqual(
      SUPURGELIK_PRODUCTION_YIELD_SEEDS.map((row) => ({
        materialCode: row.materialCode,
        pieceWidthMm: row.pieceWidthMm,
        pieceLengthMm: row.pieceLengthMm,
        netQty: row.netQty,
        source: row.source,
      })),
    );

    expect(SUPURGELIK_EXCEL_GOLDEN_ROWS.every((row) => row.productId === null)).toBe(true);
    expect(SUPURGELIK_EXCEL_GOLDEN_ROWS.every((row) => row.lengthMm === 2800)).toBe(true);

    const netsByThickness = new Map<number, number[]>();
    for (const row of SUPURGELIK_EXCEL_GOLDEN_ROWS) {
      const nets = netsByThickness.get(row.thicknessMm) ?? [];
      nets.push(row.netQty);
      netsByThickness.set(row.thicknessMm, nets);
    }
    expect([...netsByThickness.entries()]).toEqual(
      Object.entries(SUPURGELIK_EXCEL_GOLDEN_COUNTS.netsByThickness).map(
        ([thicknessMm, nets]) => [Number(thicknessMm), [...nets]],
      ),
    );

    const excel = [
      findGolden(12, 120),
      findGolden(14, 120),
      findGolden(18, 100),
      findGolden(18, 120),
    ];
    expect(excel.map((row) => row.netQty)).toEqual([16, 16, 20, 16]);
    expect(excel.every((row) => row.netSource === 'EXCEL_MASTER')).toBe(true);
  });

  it('yalnız 2100×2800 zımparalı MDF kodlarını kullanır; 9 mm 2200 yasaktır', () => {
    expect(
      [...new Set(SUPURGELIK_EXCEL_GOLDEN_ROWS.map((row) => row.rawMaterialCode))],
    ).toEqual(Object.values(I.rawMaterialCodes));
    expect(
      SUPURGELIK_EXCEL_GOLDEN_ROWS.some(
        (row) => row.rawMaterialCode === I.forbiddenRawMaterialCode,
      ),
    ).toBe(false);
    expect(I.sheetPrices[9]).toBeNull();
  });

  it('aktif CARD_INSTALLMENT fiyatlarıyla MDF maliyetini ara yuvarlamadan üretir', () => {
    const priced = SUPURGELIK_EXCEL_GOLDEN_ROWS.filter((row) => row.priceAvailable);
    expect(priced.length).toBe(25);

    for (const golden of priced) {
      const actual = calculator.calculate({
        ...baseInput(golden, 'DUZ_SUPURGELIK'),
        pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
      });
      expect(actual.mdfUnitCost).toBe(golden.mdfUnitCost);
      expect(actual.sheetPrice.amount).toBe(golden.sheetPrice);
      expect(actual.extraCosts.map((item) => item.code)).toEqual(['CUTTING', 'LABOR']);
      expect(actual.extraCostsTotal).toBe(I.extraTotal);
      expect(actual.productionCost).toBe(golden.productionCost);
    }

    const s = SUPURGELIK_EXCEL_GOLDEN_SPOTLIGHTS;
    expect(findGolden(s.eightBy80.thicknessMm, s.eightBy80.widthMm).mdfUnitCost).toBe(
      s.eightBy80.mdfUnitCost,
    );
    expect(findGolden(s.twelveBy120.thicknessMm, s.twelveBy120.widthMm)).toMatchObject({
      mdfUnitCost: s.twelveBy120.mdfUnitCost,
      productionCost: s.twelveBy120.productionCost,
    });
    expect(findGolden(s.fourteenBy120.thicknessMm, s.fourteenBy120.widthMm).mdfUnitCost).toBe(
      s.fourteenBy120.mdfUnitCost,
    );
    expect(findGolden(s.eighteenBy100.thicknessMm, s.eighteenBy100.widthMm).mdfUnitCost).toBe(
      s.eighteenBy100.mdfUnitCost,
    );
    expect(findGolden(s.tenBy150.thicknessMm, s.tenBy150.widthMm).mdfUnitCost).toBe(
      s.tenBy150.mdfUnitCost,
    );
  });

  it('SUPURGELIK ortak gideri yalnız CUTTING=4 + LABOR=12; GLUE/OTHER yok', () => {
    expect(I.extras).toEqual({ cutting: '4', labor: '12' });
    expect(I.extraTotal).toBe('16');
    const actual = calculator.calculate({
      ...baseInput(findGolden(12, 120), 'DUZ_SUPURGELIK'),
      pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
    });
    expect(actual.extraCosts.map((item) => item.code)).toEqual(['CUTTING', 'LABOR']);
    expect(actual.extraCosts.map((item) => item.amount)).toEqual(['4', '12']);
    expect(actual.extraCostsTotal).toBe('16');
    expect(actual.mdfUnitCost).toBe('136.5625');
    expect(actual.productionCost).toBe('152.5625');
  });

  it('Düz %20 kâr + ROUNDUP nakit fiyatlarını üretir; vatRate yoktur', () => {
    expect(I.vatRate).toBeNull();
    const priced = SUPURGELIK_EXCEL_GOLDEN_ROWS.filter((row) => row.priceAvailable);

    for (const golden of priced) {
      const actual = calculator.calculate({
        ...baseInput(golden, 'DUZ_SUPURGELIK'),
        pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
      });
      expect(actual.pricing).toMatchObject({
        profitRate: I.profitRate,
        profitAmount: golden.profitAmount,
        priceBeforeRounding: golden.priceBeforeRounding,
        publishedCashPrice: golden.publishedCashPrice,
      });
      expect(actual.pricing).not.toHaveProperty('vatRate');
      assertContract(actual);
    }

    const twelve = findGolden(12, 120);
    expect(twelve).toMatchObject(SUPURGELIK_EXCEL_GOLDEN_SPOTLIGHTS.twelveBy120);
    expect(findGolden(14, 120).publishedCashPrice).toBe(
      SUPURGELIK_EXCEL_GOLDEN_SPOTLIGHTS.fourteenBy120.publishedCashPrice,
    );
    expect(findGolden(18, 100)).toMatchObject({
      productionCost: '156',
      publishedCashPrice: '188',
    });
    expect(findGolden(18, 120)).toMatchObject({
      productionCost: '191',
      publishedCashPrice: '230',
    });
  });

  it('Dekoratif modifier productionCost’a eklenmez; ikinci ROUNDUP nakit üretir', () => {
    const decorative = SUPURGELIK_EXCEL_GOLDEN_ROWS.filter(
      (row) => row.priceAvailable && row.decorativeRate != null,
    );
    expect(decorative).toHaveLength(15);

    for (const golden of decorative) {
      const actual = calculator.calculate({
        ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
        pricing: {
          profitRate: I.profitRate,
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: golden.decorativeRate,
          decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
        },
      });
      expect(actual.productionCost).toBe(golden.productionCost);
      expect(actual.pricing).toMatchObject({
        basePublishedCashPrice: golden.publishedCashPrice,
        decorativeRate: golden.decorativeRate,
        decorativeAmount: golden.decorativeAmount,
        priceBeforeDecorativeRounding: golden.priceBeforeDecorativeRounding,
        publishedCashPrice: golden.decorativePublishedCashPrice,
        statusCode: null,
      });
    }

    expect(findGolden(12, 120)).toMatchObject({
      publishedCashPrice: '184',
      decorativeRate: '25',
      decorativePublishedCashPrice: '230',
    });
    expect(findGolden(14, 120)).toMatchObject({
      publishedCashPrice: '217',
      decorativeRate: '25',
      priceBeforeDecorativeRounding: '271.25',
      decorativePublishedCashPrice: '272',
    });
    expect(findGolden(18, 120)).toMatchObject({
      publishedCashPrice: '230',
      decorativeRate: '45',
      priceBeforeDecorativeRounding: '333.5',
      decorativePublishedCashPrice: '334',
    });
  });

  it('8/10 mm dekoratif oran yoktur; sahte oran uygulanmaz, nakit null', () => {
    const missing = SUPURGELIK_EXCEL_GOLDEN_ROWS.filter(
      (row) => row.errorCode === 'DECORATIVE_RATE_MISSING',
    );
    expect(missing).toHaveLength(SUPURGELIK_EXCEL_GOLDEN_COUNTS.missingDecorativeRate);
    expect(missing.map((row) => row.thicknessMm).every((mm) => mm === 8 || mm === 10)).toBe(
      true,
    );

    for (const golden of missing) {
      const actual = calculator.calculate({
        ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
        pricing: {
          profitRate: I.profitRate,
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: null,
          decorativeRateSource: null,
        },
      });
      expect(actual.productionCost).toBe(golden.productionCost);
      expect(actual.pricing).toMatchObject({
        basePublishedCashPrice: golden.publishedCashPrice,
        decorativeRate: null,
        publishedCashPrice: null,
        statusCode: 'DECORATIVE_RATE_MISSING',
      });
    }
  });

  it('9 mm 2100×2800 fiyatı yok: maliyet/kâr/nakit null, RAW_MATERIAL_PRICE_MISSING öncelikli', () => {
    const missing = SUPURGELIK_EXCEL_GOLDEN_ROWS.filter(
      (row) => row.errorCode === 'RAW_MATERIAL_PRICE_MISSING',
    );
    expect(missing).toHaveLength(SUPURGELIK_EXCEL_GOLDEN_COUNTS.missingMdfPrice);
    expect(missing.every((row) => row.thicknessMm === 9)).toBe(true);
    for (const golden of missing) {
      expect(golden.priceAvailable).toBe(false);
      expect(golden.sheetPrice).toBeNull();
      expect(golden.mdfUnitCost).toBeNull();
      expect(golden.productionCost).toBeNull();
      expect(golden.profitAmount).toBeNull();
      expect(golden.publishedCashPrice).toBeNull();
      expect(golden.decorativePublishedCashPrice).toBeNull();
      expect(golden.errorCode).toBe('RAW_MATERIAL_PRICE_MISSING');
    }
  });

  it.each(['DUZ_PP_SARMA_SUPURGELIK', 'DEKORATIF_PP_SARMA_SUPURGELIK'] as const)(
    '%s temel maliyeti hesaplar, PP maliyeti yokken nakit üretmez',
    (productCode) => {
      const priced = SUPURGELIK_EXCEL_GOLDEN_ROWS.filter((row) => row.priceAvailable);
      for (const golden of priced) {
        const actual = calculator.calculate({
          ...baseInput(golden, productCode),
          pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
          ppWrappingCost: null,
        });
        expect(actual.mdfUnitCost).toBe(golden.mdfUnitCost);
        expect(actual.extraCostsTotal).toBe(I.extraTotal);
        expect(actual.productionCost).toBe(golden.productionCost);
        expect(actual.pricing).toMatchObject({
          baseProductionCost: golden.productionCost,
          ppWrappingCost: null,
          ppProductionCost: null,
          publishedCashPrice: null,
          statusCode: 'PP_WRAPPING_COST_MISSING',
        });
        expect(actual.pricing).not.toHaveProperty('decorativeRate');
      }
    },
  );

  it('12/120 PP wrapping 80 Düz 280, dekoratif %25 ile 350 üretir (test değeri, seed değil)', () => {
    const golden = findGolden(12, 120);
    const pp = SUPURGELIK_PP_WRAPPING_TEST.twelveBy120;
    const duzPp = calculator.calculate({
      ...baseInput(golden, 'DUZ_PP_SARMA_SUPURGELIK'),
      pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
      ppWrappingCost: SUPURGELIK_PP_WRAPPING_TEST.amount80,
    });
    expect(duzPp.productionCost).toBe(pp.baseProductionCost);
    expect(duzPp.pricing).toMatchObject({
      ppWrappingCost: pp.wrapping80.ppWrappingCost,
      ppProductionCost: pp.wrapping80.ppProductionCost,
      profitAmount: pp.wrapping80.profitAmount,
      priceBeforeRounding: pp.wrapping80.priceBeforeRounding,
      publishedCashPrice: pp.wrapping80.publishedCashPrice,
    });
    expect(duzPp.pricing).not.toHaveProperty('decorativeRate');

    const decorativePp = calculator.calculate({
      ...baseInput(golden, 'DEKORATIF_PP_SARMA_SUPURGELIK'),
      pricing: {
        profitRate: I.profitRate,
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: pp.wrapping80.decorativeRate,
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
      ppWrappingCost: SUPURGELIK_PP_WRAPPING_TEST.amount80,
    });
    expect(decorativePp.productionCost).toBe(pp.baseProductionCost);
    expect(decorativePp.pricing).toMatchObject({
      basePublishedCashPrice: pp.wrapping80.publishedCashPrice,
      decorativeRate: pp.wrapping80.decorativeRate,
      publishedCashPrice: pp.wrapping80.decorativePublishedCashPrice,
    });
  });

  it('dört ürün kodu golden kapsamındadır; sıralama thickness/width/length ASC', () => {
    expect(SUPURGELIK_PRODUCT_CODES).toHaveLength(
      SUPURGELIK_EXCEL_GOLDEN_COUNTS.productCodes,
    );
    expect(SUPURGELIK_PRODUCT_CODES).toEqual([
      'DUZ_SUPURGELIK',
      'DEKORATIF_SUPURGELIK',
      'DUZ_PP_SARMA_SUPURGELIK',
      'DEKORATIF_PP_SARMA_SUPURGELIK',
    ]);
    const keys = SUPURGELIK_EXCEL_GOLDEN_ROWS.map(
      (row) => `${row.thicknessMm}/${row.widthMm}/${row.lengthMm}`,
    );
    expect(keys).toEqual([...keys].sort((left, right) => {
      const [lt, lw, ll] = left.split('/').map(Number);
      const [rt, rw, rl] = right.split('/').map(Number);
      return lt - rt || lw - rw || ll - rl;
    }));
  });

  it('4 ürün × 25 fiyatlı satır: ortak maliyet aynı, ürün kuralı ayrışır', () => {
    const priced = SUPURGELIK_EXCEL_GOLDEN_ROWS.filter((row) => row.priceAvailable);
    expect(priced).toHaveLength(SUPURGELIK_EXCEL_GOLDEN_COUNTS.pricedRows);

    for (const golden of priced) {
      const duz = calculator.calculate({
        ...baseInput(golden, 'DUZ_SUPURGELIK'),
        pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
      });
      const decorative = calculator.calculate({
        ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
        pricing: {
          profitRate: I.profitRate,
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: golden.decorativeRate,
          decorativeRateSource:
            golden.decorativeRate == null
              ? null
              : 'GROUP_THICKNESS_PRICING_MODIFIER',
        },
      });
      const duzPp = calculator.calculate({
        ...baseInput(golden, 'DUZ_PP_SARMA_SUPURGELIK'),
        pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
        ppWrappingCost: null,
      });
      const decorativePp = calculator.calculate({
        ...baseInput(golden, 'DEKORATIF_PP_SARMA_SUPURGELIK'),
        pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
        ppWrappingCost: null,
      });

      for (const actual of [duz, decorative, duzPp, decorativePp]) {
        expect(actual.mdfUnitCost).toBe(golden.mdfUnitCost);
        expect(actual.extraCostsTotal).toBe(I.extraTotal);
        expect(actual.productionCost).toBe(golden.productionCost);
        expect(actual.extraCosts.map((item) => item.code)).toEqual(['CUTTING', 'LABOR']);
        expect(actual.pricing).not.toHaveProperty('vatRate');
      }

      expect(duz.pricing).toMatchObject({
        publishedCashPrice: golden.publishedCashPrice,
      });
      expect(duz.pricing).not.toHaveProperty('ppWrappingCost');
      expect(duz.pricing).not.toHaveProperty('decorativeRate');

      if (golden.decorativeRate == null) {
        expect(decorative.pricing).toMatchObject({
          publishedCashPrice: null,
          statusCode: 'DECORATIVE_RATE_MISSING',
        });
      } else {
        expect(decorative.pricing).toMatchObject({
          publishedCashPrice: golden.decorativePublishedCashPrice,
          statusCode: null,
        });
      }

      expect(duzPp.pricing).toMatchObject({
        baseProductionCost: golden.productionCost,
        ppWrappingCost: null,
        ppProductionCost: null,
        publishedCashPrice: null,
        statusCode: 'PP_WRAPPING_COST_MISSING',
      });
      expect(duzPp.pricing).not.toHaveProperty('decorativeRate');
      expect(decorativePp.pricing).toMatchObject({
        baseProductionCost: golden.productionCost,
        ppWrappingCost: null,
        ppProductionCost: null,
        publishedCashPrice: null,
        statusCode: 'PP_WRAPPING_COST_MISSING',
      });
      expect(decorativePp.pricing).not.toHaveProperty('decorativeRate');
    }
  });

  it('PP wrapping 80→90 yalnız PP downstream değişir; NET/MDF/CUTTING/LABOR/base aynı', () => {
    const golden = findGolden(12, 120);
    const pp = SUPURGELIK_PP_WRAPPING_TEST.twelveBy120;
    const baseline = {
      ...baseInput(golden, 'DUZ_PP_SARMA_SUPURGELIK' as const),
      pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' as const },
    };
    const at80 = calculator.calculate({
      ...baseline,
      ppWrappingCost: SUPURGELIK_PP_WRAPPING_TEST.amount80,
    });
    const at90 = calculator.calculate({
      ...baseline,
      ppWrappingCost: SUPURGELIK_PP_WRAPPING_TEST.amount90,
    });

    expect(at80.productionYield.netQty).toBe(pp.netQty);
    expect(at90.productionYield.netQty).toBe(at80.productionYield.netQty);
    expect(at90.mdfUnitCost).toBe(at80.mdfUnitCost);
    expect(at90.extraCostsTotal).toBe(at80.extraCostsTotal);
    expect(at90.productionCost).toBe(at80.productionCost);
    expect(at80.pricing).toMatchObject({
      baseProductionCost: pp.baseProductionCost,
      publishedCashPrice: pp.wrapping80.publishedCashPrice,
    });
    expect(at90.pricing).toMatchObject({
      baseProductionCost: pp.baseProductionCost,
      ppWrappingCost: pp.wrapping90.ppWrappingCost,
      ppProductionCost: pp.wrapping90.ppProductionCost,
      profitAmount: pp.wrapping90.profitAmount,
      priceBeforeRounding: pp.wrapping90.priceBeforeRounding,
      publishedCashPrice: pp.wrapping90.publishedCashPrice,
    });

    const decorative90 = calculator.calculate({
      ...baseInput(golden, 'DEKORATIF_PP_SARMA_SUPURGELIK'),
      pricing: {
        profitRate: I.profitRate,
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: pp.wrapping90.decorativeRate,
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
      ppWrappingCost: SUPURGELIK_PP_WRAPPING_TEST.amount90,
    });
    expect(decorative90.productionCost).toBe(pp.baseProductionCost);
    expect(decorative90.pricing).toMatchObject({
      basePublishedCashPrice: pp.wrapping90.publishedCashPrice,
      publishedCashPrice: pp.wrapping90.decorativePublishedCashPrice,
    });

    const duz = calculator.calculate({
      ...baseInput(golden, 'DUZ_SUPURGELIK'),
      pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
    });
    const decorative = calculator.calculate({
      ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
      pricing: {
        profitRate: I.profitRate,
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: '25',
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
    });
    expect(duz.pricing).toMatchObject({ publishedCashPrice: '184' });
    expect(decorative.pricing).toMatchObject({ publishedCashPrice: '230' });
  });

  it('source delta calculator golden: her değişiklik yalnız kendi downstream’ini bozar', () => {
    const golden = findGolden(12, 120);
    const base = SUPURGELIK_SOURCE_DELTA_GOLDEN.twelveBy120;

    const mdf2200 = calculator.calculate({
      ...baseInput(golden, 'DUZ_SUPURGELIK'),
      sheetPrice: {
        priceType: 'CARD_INSTALLMENT',
        amount: SUPURGELIK_SOURCE_DELTA_GOLDEN.mdfCard2200.sheetPrice,
      },
      pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
    });
    expect(mdf2200.mdfUnitCost).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.mdfCard2200.mdfUnitCost,
    );
    expect(mdf2200.extraCostsTotal).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.mdfCard2200.extraCostsTotal,
    );
    expect(mdf2200.productionCost).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.mdfCard2200.productionCost,
    );
    expect(mdf2200.pricing).toMatchObject({
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.mdfCard2200.duzCash,
    });
    expect(mdf2200.productionYield.netQty).toBe(base.netQty);
    const mdf2200Decorative = calculator.calculate({
      ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
      sheetPrice: {
        priceType: 'CARD_INSTALLMENT',
        amount: SUPURGELIK_SOURCE_DELTA_GOLDEN.mdfCard2200.sheetPrice,
      },
      pricing: {
        profitRate: I.profitRate,
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: '25',
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
    });
    expect(mdf2200Decorative.pricing).toMatchObject({
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.mdfCard2200.decorativeCash,
    });

    const cutting5 = calculator.calculate({
      ...baseInput(golden, 'DUZ_SUPURGELIK'),
      extraCosts: [
        { code: 'CUTTING', name: 'Kesim', amount: '5' },
        { code: 'LABOR', name: 'İşçilik', amount: I.extras.labor },
      ],
      pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
    });
    expect(cutting5.mdfUnitCost).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.cutting5.mdfUnitCost,
    );
    expect(cutting5.extraCostsTotal).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.cutting5.extraCostsTotal,
    );
    expect(cutting5.productionCost).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.cutting5.productionCost,
    );
    expect(cutting5.pricing).toMatchObject({
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.cutting5.duzCash,
    });
    expect(
      calculator.calculate({
        ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
        extraCosts: [
          { code: 'CUTTING', name: 'Kesim', amount: '5' },
          { code: 'LABOR', name: 'İşçilik', amount: I.extras.labor },
        ],
        pricing: {
          profitRate: I.profitRate,
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: '25',
          decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
        },
      }).pricing,
    ).toMatchObject({
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.cutting5.decorativeCash,
    });

    const labor13 = calculator.calculate({
      ...baseInput(golden, 'DUZ_SUPURGELIK'),
      extraCosts: [
        { code: 'CUTTING', name: 'Kesim', amount: I.extras.cutting },
        { code: 'LABOR', name: 'İşçilik', amount: '13' },
      ],
      pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
    });
    expect(labor13.mdfUnitCost).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.labor13.mdfUnitCost,
    );
    expect(labor13.extraCostsTotal).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.labor13.extraCostsTotal,
    );
    expect(labor13.productionCost).toBe(
      SUPURGELIK_SOURCE_DELTA_GOLDEN.labor13.productionCost,
    );
    expect(labor13.pricing).toMatchObject({
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.labor13.duzCash,
    });
    expect(
      calculator.calculate({
        ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
        extraCosts: [
          { code: 'CUTTING', name: 'Kesim', amount: I.extras.cutting },
          { code: 'LABOR', name: 'İşçilik', amount: '13' },
        ],
        pricing: {
          profitRate: I.profitRate,
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: '25',
          decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
        },
      }).pricing,
    ).toMatchObject({
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.labor13.decorativeCash,
    });

    const profit21 = calculator.calculate({
      ...baseInput(golden, 'DUZ_SUPURGELIK'),
      pricing: {
        profitRate: SUPURGELIK_SOURCE_DELTA_GOLDEN.profitRate21.profitRate,
        source: 'GROUP_PRICING_SETTING',
      },
    });
    expect(profit21.mdfUnitCost).toBe(base.mdfUnitCost);
    expect(profit21.extraCostsTotal).toBe(base.extraCostsTotal);
    expect(profit21.productionCost).toBe(base.productionCost);
    expect(profit21.pricing).toMatchObject({
      profitRate: SUPURGELIK_SOURCE_DELTA_GOLDEN.profitRate21.profitRate,
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.profitRate21.duzCash,
    });
    expect(
      calculator.calculate({
        ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
        pricing: {
          profitRate: SUPURGELIK_SOURCE_DELTA_GOLDEN.profitRate21.profitRate,
          source: 'GROUP_PRICING_SETTING',
          decorativeRate: '25',
          decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
        },
      }).pricing,
    ).toMatchObject({
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.profitRate21.decorativeCash,
    });

    const decorative26 = calculator.calculate({
      ...baseInput(golden, 'DEKORATIF_SUPURGELIK'),
      pricing: {
        profitRate: I.profitRate,
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: SUPURGELIK_SOURCE_DELTA_GOLDEN.decorativeRate26.decorativeRate,
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
    });
    expect(decorative26.mdfUnitCost).toBe(base.mdfUnitCost);
    expect(decorative26.productionCost).toBe(base.productionCost);
    expect(decorative26.pricing).toMatchObject({
      basePublishedCashPrice: base.duzCash,
      decorativeRate: SUPURGELIK_SOURCE_DELTA_GOLDEN.decorativeRate26.decorativeRate,
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.decorativeRate26.decorativeCash,
    });

    const duzUnchanged = calculator.calculate({
      ...baseInput(golden, 'DUZ_SUPURGELIK'),
      pricing: { profitRate: I.profitRate, source: 'GROUP_PRICING_SETTING' },
    });
    expect(duzUnchanged.pricing).toMatchObject({
      publishedCashPrice: SUPURGELIK_SOURCE_DELTA_GOLDEN.decorativeRate26.duzCash,
    });
  });
});
