import { decimalToString, toDecimal } from '../../common/decimal/decimal.util';
import { CITA_EXTRA_COST_TYPE_ORDER } from '../../modules/extra-costs/cita-extra-cost';
import {
  attachCitaClassifiedPricing,
  attachCitaListPricing,
  resolveCitaClassifiedPricing,
} from '../../modules/cost-calculation/cita-list-pricing';
import {
  CITA_PUBLISHED_PRICE_BAND_SEEDS,
  CITA_PUBLISHED_PRICE_MISSING,
  CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM,
  citaPublishedPriceBandViewsFromSeeds,
} from '../../modules/pricing/cita-published-price-band-data';
import {
  CITA_CUT_RULE,
  CITA_CUSTOM_MEASURE_PRINCIPLE,
  CITA_SHEET_MM,
  CITA_STANDARD_FALLBACK_NET,
  CITA_SUPPORTED_THICKNESSES_MM,
} from '../../modules/products/cita-cut-rule.fixture';
import {
  CITA_PRODUCT_GROUP_SEED,
  CITA_PRODUCT_SEED,
  CITA_PRODUCT_SIZE_SEEDS,
} from '../../modules/products/cita-product-seed';
import {
  CITA_PRODUCTION_YIELD_SEEDS,
  CITA_YIELD_FORBIDDEN_MATERIAL_CODES,
  CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM,
  CITA_YIELD_NET_SET,
} from '../../modules/production-yields/cita-yield-seed-data';
import { calculateCitaMdfCost } from './cita-mdf-calculator';
import {
  calculateCitaCutRuleNet,
  CITA_NET_FORBIDDEN_MATERIAL_CODES,
  CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM,
  parseCitaThicknessMm,
} from './cita-net-calculator';
import {
  calculateCitaProductionCost,
  CITA_EXTRA_COST_MISSING,
} from './cita-production-calculator';

/**
 * ÇITA çapraz golden canary.
 * Detaylı unit/history testleri mevcut spec'lerde kalır; bu dosya
 * doğrulanmış matris ve sözleşmeyi tek yerde kilitler.
 */
const bands = citaPublishedPriceBandViewsFromSeeds();
const STANDARD_WIDTHS_MM = [10, 20, 30, 40, 50, 60, 70, 80] as const;
const PRICED_THICKNESSES_MM = [12, 14, 16] as const;

function standardListRows() {
  return CITA_SUPPORTED_THICKNESSES_MM.flatMap((thicknessMm) =>
    CITA_STANDARD_FALLBACK_NET.map((net) =>
      attachCitaListPricing(
        {
          thicknessMm: String(thicknessMm),
          widthMm: String(net.widthMm),
          lengthMm: String(CITA_CUT_RULE.pieceLengthMm),
          productionYield: { netQty: net.netQty, source: 'MASTER' as const },
          rawMaterialCode: CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM[thicknessMm],
        },
        bands,
      ),
    ),
  );
}

function mdfInput(input: {
  thicknessMm: string;
  widthMm: string;
  netQty: number;
  source: 'MASTER' | 'CALCULATED_CUT_RULE';
  sheetPrice: string;
}) {
  const thicknessMm = parseCitaThicknessMm(
    input.thicknessMm,
  ) as keyof typeof CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM;
  const cut = calculateCitaCutRuleNet(input.widthMm);
  return {
    productCode: 'CITA' as const,
    thicknessMm: input.thicknessMm,
    widthMm: input.widthMm,
    lengthMm: '2800',
    rawMaterial: {
      code: CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM[thicknessMm],
      thicknessMm: input.thicknessMm,
      sheetWidthMm: CITA_SHEET_MM.widthMm,
      sheetLengthMm: CITA_SHEET_MM.lengthMm,
    },
    cut: {
      bladeAllowanceMm: cut.bladeAllowanceMm,
      countSideMm: cut.countSideMm,
      effectiveCutPitchMm: decimalToString(cut.effectiveCutPitchMm),
    },
    productionYield: { netQty: input.netQty, source: input.source },
    sheetPrice: {
      priceType: 'CARD_INSTALLMENT' as const,
      amount: input.sheetPrice,
    },
  };
}

describe('CITA golden regression', () => {
  it('ProductGroup/Product CITA ve standart ölçü matrisi kilitlidir', () => {
    expect(CITA_PRODUCT_GROUP_SEED).toEqual({ code: 'CITA', name: 'Çıta' });
    expect(CITA_PRODUCT_SEED).toEqual({ code: 'CITA', name: 'Çıta' });
    expect([...CITA_SUPPORTED_THICKNESSES_MM]).toEqual([
      10, 12, 14, 16, 18, 22, 30,
    ]);
    expect(CITA_PRODUCT_SIZE_SEEDS.map((row) => row.widthMm)).toEqual([
      ...STANDARD_WIDTHS_MM,
    ]);
    expect(
      CITA_PRODUCT_SIZE_SEEDS.every((row) => row.lengthMm === 2800),
    ).toBe(true);
    expect(CITA_SHEET_MM).toEqual({ widthMm: 2100, lengthMm: 2800 });
    expect(CITA_CUT_RULE.kerfMm).toBe(4);
    expect(CITA_CUT_RULE.pieceLengthMm).toBe(2800);
  });

  it('ham madde eşlemesi 18 mm NEOPAN/Membranlık ve 22 mm UI-TEST kullanmaz', () => {
    expect(CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM).toEqual(
      CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM,
    );
    expect(CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM).toEqual({
      10: 'MDF-10-2100X2800-ZIMPARALI',
      12: 'MDF-12-2100X2800-ZIMPARALI',
      14: 'MDF-14-2100X2800-ZIMPARALI',
      16: 'MDF-16-2100X2800-ZIMPARALI',
      18: 'MDF-18-2100X2800-ZIMPARALI',
      22: 'MDF-22-2100X2800-ZIMPARALI',
      30: 'MDF-30-2100X2800-ZIMPARALI',
    });
    expect([...CITA_YIELD_FORBIDDEN_MATERIAL_CODES]).toEqual([
      ...CITA_NET_FORBIDDEN_MATERIAL_CODES,
    ]);
    expect(CITA_YIELD_FORBIDDEN_MATERIAL_CODES).toEqual([
      'MDF-18-2100X2800-ZIMPARALI-NEOPAN',
      'MDF-18-2100X2800-TEK-YUZ-MEMBRANLIK-4',
      'MDF-22-UI-TEST',
    ]);
  });

  it('56 MASTER anahtar ve NET seti tüm kalınlıklarda aynıdır', () => {
    expect(CITA_PRODUCTION_YIELD_SEEDS).toHaveLength(56);
    expect([...CITA_YIELD_NET_SET]).toEqual([150, 87, 61, 47, 38, 32, 28, 25]);
    expect(CITA_STANDARD_FALLBACK_NET.map((row) => row.netQty)).toEqual([
      ...CITA_YIELD_NET_SET,
    ]);
    expect(
      CITA_PRODUCTION_YIELD_SEEDS.some((row) =>
        [35, 47, 65].includes(row.pieceWidthMm),
      ),
    ).toBe(false);
    expect(CITA_CUSTOM_MEASURE_PRINCIPLE).toEqual({
      createsProductSize: false,
      createsProductionYield: false,
      usesRuntimeCutRule: true,
    });

    for (const thicknessMm of CITA_SUPPORTED_THICKNESSES_MM) {
      const rows = CITA_PRODUCTION_YIELD_SEEDS.filter(
        (row) =>
          row.materialCode ===
          CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM[thicknessMm],
      );
      expect(rows).toHaveLength(8);
      expect(rows.map((row) => row.pieceWidthMm)).toEqual([...STANDARD_WIDTHS_MM]);
      expect(rows.map((row) => row.netQty)).toEqual([...CITA_YIELD_NET_SET]);
      expect(rows.every((row) => row.pieceLengthMm === 2800)).toBe(true);
    }
  });

  it('cut-rule Decimal FLOOR(2100 / (en+4)) golden custom NET üretir', () => {
    const custom = [
      ['35', '39', 53],
      ['25', '29', 72],
      ['47', '51', 41],
      ['65', '69', 30],
    ] as const;
    for (const [widthMm, pitch, netQty] of custom) {
      const result = calculateCitaCutRuleNet(widthMm);
      expect(decimalToString(result.effectiveCutPitchMm)).toBe(pitch);
      expect(result.netQty).toBe(netQty);
      expect(toDecimal(widthMm).plus(4).toFixed()).toBe(
        decimalToString(result.effectiveCutPitchMm),
      );
      expect(toDecimal(2100).div(result.effectiveCutPitchMm).floor().toNumber()).toBe(
        netQty,
      );
    }
  });

  it('MDF = CARD_INSTALLMENT / netQty; 14 mm standart ve custom aynı tabaka fiyatını paylaşır', () => {
    const sheetPrice = '2625';
    const standard = calculateCitaMdfCost(
      mdfInput({
        thicknessMm: '14',
        widthMm: '40',
        netQty: 47,
        source: 'MASTER',
        sheetPrice,
      }),
    );
    const custom = calculateCitaMdfCost(
      mdfInput({
        thicknessMm: '14',
        widthMm: '35',
        netQty: 53,
        source: 'CALCULATED_CUT_RULE',
        sheetPrice,
      }),
    );

    expect(standard.sheetPrice).toEqual({
      priceType: 'CARD_INSTALLMENT',
      amount: sheetPrice,
    });
    expect(custom.sheetPrice).toEqual(standard.sheetPrice);
    expect(standard.mdfUnitCost).toBe(toDecimal(sheetPrice).div('47').toFixed());
    expect(custom.mdfUnitCost).toBe(toDecimal(sheetPrice).div('53').toFixed());
    expect(standard.productionYield).toEqual({ netQty: 47, source: 'MASTER' });
    expect(custom.productionYield).toEqual({
      netQty: 53,
      source: 'CALCULATED_CUT_RULE',
    });
  });

  it('CITA yalnız group-scope CUTTING+LABOR kullanır; eksikte 0 fallback yoktur', () => {
    const extraCodes: readonly string[] = CITA_EXTRA_COST_TYPE_ORDER;
    expect(extraCodes).toEqual(['CUTTING', 'LABOR']);
    expect(extraCodes.includes('GLUE')).toBe(false);
    expect(extraCodes.includes('OTHER')).toBe(false);
    expect(extraCodes.includes('PP_WRAPPING')).toBe(false);

    const mdf = calculateCitaMdfCost(
      mdfInput({
        thicknessMm: '14',
        widthMm: '35',
        netQty: 53,
        source: 'CALCULATED_CUT_RULE',
        sheetPrice: '2625',
      }),
    );
    const missing = calculateCitaProductionCost({
      mdf,
      extraCosts: [
        { code: 'CUTTING', amount: null },
        { code: 'LABOR', amount: null },
      ],
    });
    expect(missing.mdfUnitCost).toBe(mdf.mdfUnitCost);
    expect(missing.extraCostsTotal).toBeNull();
    expect(missing.productionCost).toBeNull();
    expect(missing.statusCode).toBe(CITA_EXTRA_COST_MISSING);
    expect(missing.missingExtraCosts).toEqual(['CUTTING', 'LABOR']);
    expect(missing).not.toHaveProperty('profit');
    expect(missing).not.toHaveProperty('salePrice');

    const withExtras = calculateCitaProductionCost({
      mdf,
      extraCosts: [
        { code: 'CUTTING', amount: '5' },
        { code: 'LABOR', amount: '10' },
      ],
    });
    expect(withExtras.extraCostsTotal).toBe('15');
    expect(withExtras.productionCost).toBe(
      toDecimal(mdf.mdfUnitCost).plus(15).toFixed(),
    );
  });

  it('dört yayın bandı bağımsız nakit/karttır; runtime cash×1.20 yoktur', () => {
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
    expect([...CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM]).toEqual([
      10, 22, 30,
    ]);

    const independent = bands.map((band) =>
      band.minWidthMm === 30
        ? { ...band, cashPrice: '150', cardPrice: '181' }
        : band,
    );
    expect(
      resolveCitaClassifiedPricing(independent, {
        widthMm: '35',
        thicknessMm: 14,
      }),
    ).toMatchObject({
      publishedCashPrice: '150',
      publishedCardPrice: '181',
    });
    expect(toDecimal('150').times('1.20').toString()).not.toBe('181');
  });

  it('56 standart list satırında 26 fiyat / 30 missing ve tam matris kilitlidir', () => {
    const rows = standardListRows();
    expect(rows).toHaveLength(56);
    expect(rows.every((row) => row.productionYield.source === 'MASTER')).toBe(
      true,
    );
    expect(rows.filter((row) => row.pricing.pricingAvailable)).toHaveLength(26);
    expect(rows.filter((row) => !row.pricing.pricingAvailable)).toHaveLength(30);

    const byKey = new Map(
      rows.map((row) => [`${row.thicknessMm}|${row.widthMm}`, row]),
    );

    for (const thicknessMm of PRICED_THICKNESSES_MM) {
      for (const [widthMm, cash, card] of [
        ['10', '115', '138'],
        ['20', '115', '138'],
        ['30', '145', '174'],
        ['40', '145', '174'],
        ['50', '185', '222'],
        ['60', '185', '222'],
        ['70', '215', '258'],
        ['80', '215', '258'],
      ] as const) {
        expect(byKey.get(`${thicknessMm}|${widthMm}`)?.pricing).toMatchObject({
          pricingAvailable: true,
          publishedCashPrice: cash,
          publishedCardPrice: card,
          statusCode: null,
        });
      }
    }

    expect(byKey.get('18|50')?.pricing).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });
    expect(byKey.get('18|60')?.pricing).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });
    for (const widthMm of ['10', '20', '30', '40', '70', '80']) {
      expect(byKey.get(`18|${widthMm}`)?.pricing).toMatchObject({
        pricingAvailable: false,
        statusCode: CITA_PUBLISHED_PRICE_MISSING,
        publishedCashPrice: null,
        publishedCardPrice: null,
      });
    }

    for (const thicknessMm of CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM) {
      for (const widthMm of STANDARD_WIDTHS_MM) {
        expect(byKey.get(`${thicknessMm}|${widthMm}`)?.pricing.statusCode).toBe(
          CITA_PUBLISHED_PRICE_MISSING,
        );
      }
    }
  });

  it('custom classification golden, sınır ve missing sözleşmesini kilitler', () => {
    const customGoldens = [
      { thicknessMm: 12, widthMm: '15', cash: '115', card: '138', band: '1–2 cm' },
      { thicknessMm: 14, widthMm: '25', cash: '145', card: '174', band: '3–4 cm' },
      { thicknessMm: 14, widthMm: '35', cash: '145', card: '174', band: '3–4 cm' },
      { thicknessMm: 16, widthMm: '47', cash: '185', card: '222', band: '5–6 cm' },
      { thicknessMm: 12, widthMm: '63', cash: '215', card: '258', band: '7–8 cm' },
      { thicknessMm: 18, widthMm: '47', cash: '185', card: '222', band: '5–6 cm' },
    ] as const;
    for (const row of customGoldens) {
      const priced = attachCitaClassifiedPricing(
        { thicknessMm: String(row.thicknessMm), widthMm: row.widthMm },
        bands,
      );
      expect(priced.pricing).toMatchObject({
        pricingAvailable: true,
        publishedCashPrice: row.cash,
        publishedCardPrice: row.card,
        priceBand: { displayName: row.band },
        statusCode: null,
      });
    }

    const boundaries = [
      ['20', '115', '1–2 cm'],
      ['20.1', '145', '3–4 cm'],
      ['40', '145', '3–4 cm'],
      ['40.1', '185', '5–6 cm'],
      ['60', '185', '5–6 cm'],
      ['60.1', '215', '7–8 cm'],
      ['80', '215', '7–8 cm'],
    ] as const;
    for (const [widthMm, cash, band] of boundaries) {
      expect(
        resolveCitaClassifiedPricing(bands, { widthMm, thicknessMm: 12 }),
      ).toMatchObject({
        publishedCashPrice: cash,
        priceBand: { displayName: band },
      });
    }
    expect(
      resolveCitaClassifiedPricing(bands, { widthMm: '80.1', thicknessMm: 12 }),
    ).toMatchObject({
      pricingAvailable: false,
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });

    for (const query of [
      { widthMm: '35', thicknessMm: 18 },
      { widthMm: '70', thicknessMm: 18 },
      { widthMm: '35', thicknessMm: 10 },
      { widthMm: '55', thicknessMm: 22 },
      { widthMm: '75', thicknessMm: 30 },
      { widthMm: '85', thicknessMm: 14 },
    ]) {
      expect(resolveCitaClassifiedPricing(bands, query)).toMatchObject({
        pricingAvailable: false,
        publishedCashPrice: null,
        publishedCardPrice: null,
        statusCode: CITA_PUBLISHED_PRICE_MISSING,
      });
    }

    const customContract = attachCitaClassifiedPricing(
      { thicknessMm: '14', widthMm: '35' },
      bands,
    );
    expect(customContract.pricing).toEqual(
      expect.objectContaining({
        pricingAvailable: expect.any(Boolean),
        publishedCashPrice: expect.any(String),
        publishedCardPrice: expect.any(String),
        statusCode: null,
        priceBand: expect.objectContaining({
          displayName: '3–4 cm',
          minWidthMm: 30,
          maxWidthMm: 40,
        }),
      }),
    );
    const listContract = standardListRows()[0];
    expect(listContract).toEqual(
      expect.objectContaining({
        productionYield: expect.objectContaining({ source: 'MASTER' }),
        pricing: expect.objectContaining({
          pricingAvailable: expect.any(Boolean),
          statusCode: expect.anything(),
        }),
      }),
    );
  });
});
