import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../common/decimal/decimal.util';
import { DoorFrameCalculator } from './calculators/door-frame-calculator';
import { DekoratifPervazCalculator } from './calculators/dekoratif-pervaz-calculator';
import {
  calculateCitaProductionCost,
  CITA_CUTTING_BATCH_QTY,
} from './calculators/cita-production-calculator';
import type { CitaMdfResult } from './calculators/cita-mdf-calculator';
import { calculateCitaCutRuleNet } from './calculators/cita-net-calculator';
import { SupurgelikMdfCalculator } from './calculators/supurgelik-mdf-calculator';
import { applyPervazPercentCardSale } from './calculators/pervaz-card-sale';
import {
  applyPercentCardSale,
  CARD_MARKUP_RATE_MISSING_TR,
} from './pricing/percent-card-sale';
import {
  resolveCitaClassifiedPricing,
  resolveCitaListPricing,
} from '../modules/cost-calculation/cita-list-pricing';
import { OrderQuoteService } from '../modules/cost-calculation/order-quote.service';
import { multiplyUnitByQuantity } from '../modules/cost-calculation/order-quote';
import {
  CITA_PUBLISHED_PRICE_BAND_SEEDS,
  CITA_PUBLISHED_PRICE_MISSING,
  citaPublishedPriceBandViewsFromSeeds,
} from '../modules/pricing/cita-published-price-band-data';
import { classifyCitaCommercialWidthBand } from '../modules/pricing/cita-published-price-classification';
import { CITA_SUPPORTED_THICKNESSES_MM } from '../modules/products/cita-cut-rule.fixture';

const bands = citaPublishedPriceBandViewsFromSeeds();
const STANDARD_WIDTHS_MM = [10, 20, 30, 40, 50, 60, 70, 80] as const;
const ROOT = join(__dirname, '..', '..', '..');

function readRepo(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function citaMdf(widthMm: string, netQty: number): CitaMdfResult {
  return {
    productCode: 'CITA',
    thicknessMm: '14',
    widthMm,
    lengthMm: '2800',
    rawMaterial: {
      code: 'MDF-14-2100X2800-ZIMPARALI',
      thicknessMm: '14',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
    },
    cut: {
      bladeAllowanceMm: 4,
      countSideMm: 2100,
      effectiveCutPitchMm: String(Number(widthMm) + 4),
    },
    productionYield: { netQty, source: 'CALCULATED_CUT_RULE' },
    materialPriceType: 'CARD_INSTALLMENT',
    sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: '2625' },
    mdfUnitCost: toDecimal('2625').div(netQty).toFixed(),
  };
}

describe('son dört iş kuralı regression', () => {
  it('dört ürün grubunda kart = nakit × (1 + oran/100); oran değişince nakit durur', () => {
    const door = new DoorFrameCalculator();
    const doorRow = {
      pricing: {
        costWithVat: '100',
        profitRate: '0',
        profitAmount: '0',
        priceBeforeRounding: '100',
        roundedSalePrice: '100',
      },
    };
    const door20 = door.applySaleChannels([doorRow as never], '20')[0];
    const door25 = door.applySaleChannels([doorRow as never], '25')[0];
    expect(door20.pricing.cashSalePrice).toBe('100');
    expect(door25.pricing.cashSalePrice).toBe('100');
    expect(door20.pricing.cardSalePrice).toBe('120');
    expect(door25.pricing.cardSalePrice).toBe('125');

    const pervaz20 = applyPervazPercentCardSale({
      publishedCashPrice: '145',
      cardMarkupRate: '20',
      cardSaleAvailable: true,
    });
    const pervaz25 = applyPervazPercentCardSale({
      publishedCashPrice: '145',
      cardMarkupRate: '25',
      cardSaleAvailable: true,
    });
    expect(pervaz20.cardSalePrice).toBe('174');
    expect(pervaz25.cardSalePrice).toBe('181.25');

    const supurgelik20 = applyPercentCardSale({
      cashPrice: '184',
      cardMarkupRate: '20',
      rounding: 'roundUpWholeTl',
    });
    const supurgelik25 = applyPercentCardSale({
      cashPrice: '184',
      cardMarkupRate: '25',
      rounding: 'roundUpWholeTl',
    });
    expect(supurgelik20.cardSalePrice).toBe('221');
    expect(supurgelik25.cardSalePrice).toBe('230');

    const cita20 = resolveCitaClassifiedPricing(
      bands,
      { widthMm: '30', thicknessMm: 14 },
      '20',
    );
    const cita25 = resolveCitaClassifiedPricing(
      bands,
      { widthMm: '30', thicknessMm: 14 },
      '25',
    );
    expect(cita20.publishedCashPrice).toBe('145');
    expect(cita25.publishedCashPrice).toBe('145');
    expect(cita20.publishedCardPrice).toBe('174');
    expect(cita25.publishedCardPrice).toBe('181.25');
  });

  it('Çıta cardMarkupRate yoksa nakit durur, kart null kalır; %20 uydurulmaz', () => {
    const missing = resolveCitaListPricing(
      bands,
      { widthMm: 30, thicknessMm: 14 },
      null,
    );
    expect(missing.publishedCashPrice).toBe('145');
    expect(missing.publishedCardPrice).toBeNull();
    expect(missing.publishedCardPrice).not.toBe('174');
    expect(missing.cardStatusMessage).toBe(CARD_MARKUP_RATE_MISSING_TR);
    expect(CARD_MARKUP_RATE_MISSING_TR).toBe('Kart/taksit oranı tanımlı değil');
  });

  it('dekoratif source eksikse 0 veya %0 uydurulmaz', () => {
    const calculator = new SupurgelikMdfCalculator();
    const base = {
      productCode: 'DEKORATIF_SUPURGELIK' as const,
      thicknessMm: 8,
      widthMm: 120,
      lengthMm: 2800,
      rawMaterial: {
        code: 'MDF-8-2100X2800-ZIMPARALI',
        thicknessMm: '8',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
      },
      sheetPrice: { priceType: 'CARD_INSTALLMENT' as const, amount: '2185' },
      productionYield: { netQty: 16, scope: 'GENERIC' as const },
      extraCosts: [
        { code: 'CUTTING', name: 'Kesim', amount: '4' },
        { code: 'LABOR', name: 'İşçilik', amount: '12' },
      ],
    };
    const missing = calculator.calculate({
      ...base,
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: null,
        decorativeRateSource: null,
      },
    });
    expect(missing.pricing).toMatchObject({
      decorativeRate: null,
      decorativeAmount: null,
      publishedCashPrice: null,
      statusCode: 'DECORATIVE_RATE_MISSING',
    });
    expect(missing.productionCost).toBe('152.5625');

    const duz = calculator.calculate({
      ...base,
      productCode: 'DUZ_SUPURGELIK',
      pricing: { profitRate: '20', source: 'GROUP_PRICING_SETTING' },
    });
    const decorative = calculator.calculate({
      ...base,
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: '25',
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
    });
    expect(duz.pricing && 'publishedCashPrice' in duz.pricing
      ? duz.pricing.publishedCashPrice
      : null).toBe('184');
    expect(decorative.productionCost).toBe(duz.productionCost);
    expect(decorative.pricing).toMatchObject({
      decorativeRate: '25',
      publishedCashPrice: '230',
    });

    const ppBase = { ...base, ppWrappingCost: '10' };
    const duzPp = calculator.calculate({
      ...ppBase,
      productCode: 'DUZ_PP_SARMA_SUPURGELIK',
      pricing: { profitRate: '20', source: 'GROUP_PRICING_SETTING' },
    });
    const decorativePpLow = calculator.calculate({
      ...ppBase,
      productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK',
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: '25',
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
    });
    const decorativePpHigh = calculator.calculate({
      ...ppBase,
      productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK',
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: '45',
        decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER',
      },
    });
    const decorativePpMissing = calculator.calculate({
      ...ppBase,
      productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK',
      pricing: {
        profitRate: '20',
        source: 'GROUP_PRICING_SETTING',
        decorativeRate: null,
        decorativeRateSource: null,
      },
    });
    expect(duzPp.pricing).toMatchObject({ statusCode: null });
    expect(decorativePpLow.productionCost).toBe(duzPp.productionCost);
    expect(decorativePpHigh.pricing).toMatchObject({ decorativeRate: '45' });
    expect(
      decorativePpLow.pricing && 'publishedCashPrice' in decorativePpLow.pricing
        ? decorativePpLow.pricing.publishedCashPrice
        : null,
    ).not.toBe(
      decorativePpHigh.pricing && 'publishedCashPrice' in decorativePpHigh.pricing
        ? decorativePpHigh.pricing.publishedCashPrice
        : null,
    );
    expect(decorativePpMissing.pricing).toMatchObject({
      decorativeRate: null,
      publishedCashPrice: null,
      statusCode: 'DECORATIVE_RATE_MISSING',
    });

    const pervaz = new DekoratifPervazCalculator();
    expect(() =>
      pervaz.calculate({
        productCode: 'DEKORATIF_PERVAZ',
        thicknessMm: 12,
        widthMm: 100,
        lengthMm: 2200,
        mainPiece: {
          rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '2475',
          netQty: 28,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '1050',
          netQty: 66,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: { cutting: '4', glue: '4', labor: '4' },
        profitRate: '15',
        decorativePremiumRate: '',
      }),
    ).toThrow(BadRequestException);

    const low = pervaz.calculate({
      productCode: 'DEKORATIF_PERVAZ',
      thicknessMm: 12,
      widthMm: 100,
      lengthMm: 2200,
      mainPiece: {
        rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '2475',
        netQty: 28,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1050',
        netQty: 66,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: { cutting: '4', glue: '4', labor: '4' },
      profitRate: '15',
      decorativePremiumRate: '50',
    });
    const high = pervaz.calculate({
      ...{
        productCode: 'DEKORATIF_PERVAZ' as const,
        thicknessMm: 12,
        widthMm: 100,
        lengthMm: 2200,
        mainPiece: low.mainPiece
          ? {
              rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
              sheetPriceType: 'CARD_INSTALLMENT' as const,
              sheetPrice: '2475',
              netQty: 28,
              yieldSource: 'EXCEL_MASTER' as const,
            }
          : {
              rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
              sheetPriceType: 'CARD_INSTALLMENT' as const,
              sheetPrice: '2475',
              netQty: 28,
              yieldSource: 'EXCEL_MASTER' as const,
            },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT' as const,
          sheetPrice: '1050',
          netQty: 66,
          yieldSource: 'EXCEL_MASTER' as const,
        },
        extraCosts: { cutting: '4', glue: '4', labor: '4' },
        profitRate: '15',
        decorativePremiumRate: '60',
      },
    });
    expect(high.productionCost).toBe(low.productionCost);
    expect(high.pricing.publishedSalePrice).not.toBe(low.pricing.publishedSalePrice);
    expect(low.pricing.decorativePremiumRate).not.toBe('0');
  });

  it('Çıta CUTTING 250 parça toplamıdır; birim kesim CUTTING/250', () => {
    expect(CITA_CUTTING_BATCH_QTY).toBe(250);
    const net = calculateCitaCutRuleNet('40');
    const result = calculateCitaProductionCost({
      mdf: citaMdf('40', net.netQty),
      extraCosts: [
        { code: 'CUTTING', amount: '250' },
        { code: 'LABOR', amount: '10' },
      ],
    });
    expect(result.extraCosts).toEqual([
      { code: 'CUTTING', amount: '250' },
      { code: 'LABOR', amount: '10' },
    ]);
    expect(result.cuttingUnitCost).toBe('1');
    expect(result.extraCostsTotal).toBe('11');
    expect(result.productionCost).toBe(
      toDecimal(result.mdfUnitCost).plus(11).toFixed(),
    );

    const doubled = calculateCitaProductionCost({
      mdf: citaMdf('40', net.netQty),
      extraCosts: [
        { code: 'CUTTING', amount: '500' },
        { code: 'LABOR', amount: '10' },
      ],
    });
    expect(doubled.cuttingUnitCost).toBe('2');
    expect(doubled.mdfUnitCost).toBe(result.mdfUnitCost);
    expect(doubled.productionYield.netQty).toBe(result.productionYield.netQty);
    expect(doubled.productionCost).toBe(
      toDecimal(result.productionCost!).plus(1).toFixed(),
    );
    expect(doubled.extraCosts.find((item) => item.code === 'LABOR')?.amount).toBe(
      '10',
    );
  });

  it('custom band sınırları 26/46/66/86; DB master aralıkları aynı', () => {
    expect(
      CITA_PUBLISHED_PRICE_BAND_SEEDS.map((band) => [
        band.minWidthMm,
        band.maxWidthMm,
        band.cashPrice,
      ]),
    ).toEqual([
      [10, 20, '115'],
      [30, 40, '145'],
      [50, 60, '185'],
      [70, 80, '215'],
    ]);

    const boundaries = [
      ['26', '1–2 cm', '115', 10, 20],
      ['26.1', '3–4 cm', '145', 30, 40],
      ['46', '3–4 cm', '145', 30, 40],
      ['46.1', '5–6 cm', '185', 50, 60],
      ['66', '5–6 cm', '185', 50, 60],
      ['66.1', '7–8 cm', '215', 70, 80],
      ['86', '7–8 cm', '215', 70, 80],
    ] as const;
    for (const [widthMm, displayName, cash, minWidthMm, maxWidthMm] of boundaries) {
      expect(classifyCitaCommercialWidthBand(widthMm)?.displayName).toBe(displayName);
      expect(
        resolveCitaClassifiedPricing(bands, { widthMm, thicknessMm: 14 }, '20'),
      ).toMatchObject({
        publishedCashPrice: cash,
        publishedCardPrice: toDecimal(cash).times('1.2').toFixed(),
        priceBand: { displayName, minWidthMm, maxWidthMm },
      });
    }
    expect(classifyCitaCommercialWidthBand('86.1')).toBeNull();
    expect(
      resolveCitaClassifiedPricing(bands, { widthMm: '86.1', thicknessMm: 14 }, '20'),
    ).toMatchObject({
      pricingAvailable: false,
      publishedCashPrice: null,
      publishedCardPrice: null,
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
  });

  it('14 mm / 25 mm NET gerçek en, fiyat 1–2 bandı', () => {
    const net = calculateCitaCutRuleNet('25');
    expect(net.effectiveCutPitchMm.toFixed()).toBe('29');
    expect(net.netQty).toBe(72);
    const production = calculateCitaProductionCost({
      mdf: citaMdf('25', net.netQty),
      extraCosts: [
        { code: 'CUTTING', amount: '250' },
        { code: 'LABOR', amount: '10' },
      ],
    });
    expect(production.productionYield.netQty).toBe(72);
    expect(production.cuttingUnitCost).toBe('1');
    const pricing = resolveCitaClassifiedPricing(
      bands,
      { widthMm: '25', thicknessMm: 14 },
      '20',
    );
    expect(pricing).toMatchObject({
      publishedCashPrice: '115',
      publishedCardPrice: '138',
      priceBand: { displayName: '1–2 cm', minWidthMm: 10, maxWidthMm: 20 },
    });
    expect(resolveCitaListPricing(bands, { widthMm: 25, thicknessMm: 14 }, '20')).toMatchObject({
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });
  });

  it('18 mm yalnız 5–6 bandında fiyatlı; 10/22/30 custom bant bulsa da missing', () => {
    expect(
      resolveCitaClassifiedPricing(bands, { widthMm: '47', thicknessMm: 18 }, '20'),
    ).toMatchObject({ publishedCashPrice: '185', publishedCardPrice: '222' });
    expect(
      resolveCitaClassifiedPricing(bands, { widthMm: '66', thicknessMm: 18 }, '20'),
    ).toMatchObject({ publishedCashPrice: '185' });
    expect(
      resolveCitaClassifiedPricing(bands, { widthMm: '46', thicknessMm: 18 }, '20'),
    ).toMatchObject({ pricingAvailable: false, statusCode: CITA_PUBLISHED_PRICE_MISSING });
    expect(
      resolveCitaClassifiedPricing(bands, { widthMm: '66.1', thicknessMm: 18 }, '20'),
    ).toMatchObject({ pricingAvailable: false });

    expect(classifyCitaCommercialWidthBand('25')?.displayName).toBe('1–2 cm');
    for (const thicknessMm of [10, 22, 30]) {
      expect(
        resolveCitaClassifiedPricing(bands, { widthMm: '25', thicknessMm }, '20'),
      ).toMatchObject({
        pricingAvailable: false,
        publishedCashPrice: null,
        publishedCardPrice: null,
      });
    }
  });

  it('8.6 cm üstü NET ve maliyet hesaplanır, published fiyat null', () => {
    for (const widthMm of ['87', '90']) {
      const net = calculateCitaCutRuleNet(widthMm);
      expect(net.netQty).toBeGreaterThan(0);
      const production = calculateCitaProductionCost({
        mdf: citaMdf(widthMm, net.netQty),
        extraCosts: [
          { code: 'CUTTING', amount: '250' },
          { code: 'LABOR', amount: '10' },
        ],
      });
      expect(production.productionCost).toBe(
        toDecimal(production.mdfUnitCost).plus(11).toFixed(),
      );
      expect(
        resolveCitaClassifiedPricing(bands, { widthMm, thicknessMm: 14 }, '20'),
      ).toMatchObject({
        publishedCashPrice: null,
        publishedCardPrice: null,
        pricingAvailable: false,
      });
    }
  });

  it('standart Çıta listesi 56 satır, 26 fiyatlı, 30 missing ve 1–8 cm matrisi aynı', () => {
    const rows = CITA_SUPPORTED_THICKNESSES_MM.flatMap((thicknessMm) =>
      STANDARD_WIDTHS_MM.map((widthMm) =>
        resolveCitaListPricing(bands, { widthMm, thicknessMm }, '20'),
      ),
    );
    expect(rows).toHaveLength(56);
    expect(rows.filter((row) => row.pricingAvailable)).toHaveLength(26);
    expect(rows.filter((row) => !row.pricingAvailable)).toHaveLength(30);

    const cashFor = (widthMm: number) =>
      resolveCitaListPricing(bands, { widthMm, thicknessMm: 14 }, '20').publishedCashPrice;
    expect([10, 20].map(cashFor)).toEqual(['115', '115']);
    expect([30, 40].map(cashFor)).toEqual(['145', '145']);
    expect([50, 60].map(cashFor)).toEqual(['185', '185']);
    expect([70, 80].map(cashFor)).toEqual(['215', '215']);
    expect(
      resolveCitaListPricing(bands, { widthMm: 50, thicknessMm: 18 }, '20').publishedCashPrice,
    ).toBe('185');
    expect(
      resolveCitaListPricing(bands, { widthMm: 10, thicknessMm: 18 }, '20').pricingAvailable,
    ).toBe(false);
  });

  it('sipariş maliyeti calculator sonucunu çarpar; /250 ve tolerans yeniden yazılmaz', async () => {
    const net = calculateCitaCutRuleNet('25');
    const production = calculateCitaProductionCost({
      mdf: citaMdf('25', net.netQty),
      extraCosts: [
        { code: 'CUTTING', amount: '250' },
        { code: 'LABOR', amount: '10' },
      ],
    });
    const pricing = resolveCitaClassifiedPricing(
      bands,
      { widthMm: '25', thicknessMm: 14 },
      '20',
    );
    const getQuotedProductionCost = jest.fn().mockResolvedValue({
      ...production,
      pricing,
    });
    const service = new OrderQuoteService(
      {
        product: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'cita-id',
            code: 'CITA',
            name: 'Çıta',
            productGroup: { code: 'CITA', name: 'Çıta' },
          }),
        },
      } as never,
      {} as never,
      { getQuotedProductionCost } as never,
      {} as never,
    );

    const result = await service.quote({
      productId: 'cita-id',
      quantity: 40,
      thicknessMm: '14',
      widthMm: '25',
      lengthMm: '2800',
    });

    expect(getQuotedProductionCost).toHaveBeenCalledWith({
      thicknessMm: '14',
      widthMm: '25',
      lengthMm: '2800',
    });
    expect(result.unitProductionCost).toBe(production.productionCost);
    expect(result.totalProductionCost).toBe(
      multiplyUnitByQuantity(production.productionCost!, 40),
    );
    expect(result.unitCashPrice).toBe('115');
    expect(result.totalCashPrice).toBe('4600');
    expect(result.unitCardPrice).toBe('138');
    expect(result.totalCardPrice).toBe('5520');

    const orderSource = readRepo(
      'backend/src/modules/cost-calculation/order-quote.service.ts',
    );
    expect(orderSource).not.toContain('CITA_CUTTING_BATCH_QTY');
    expect(orderSource).not.toContain('classifyCitaCommercialWidthBand');
    expect(orderSource).not.toContain('/ 250');
  });

  it('frontend iş kuralını hesaplamaz; drawer ve Kesim sözleşmesi durur', () => {
    const citaUi = readRepo('frontend/src/components/cita-cost-list.tsx');
    expect(citaUi).toContain("CUTTING: 'Kesim Maliyeti (250 Parça)'");
    expect(citaUi).toContain('cuttingUnitCost');
    expect(citaUi).toContain('cuttingUnitAmount(row)');
    expect(citaUi).not.toContain('/ 250');
    expect(citaUi).not.toContain('26.1');
    expect(citaUi).toContain('updateCitaPricingSetting');

    const supurgelikUi = readRepo('frontend/src/components/supurgelik-cost-list.tsx');
    expect(supurgelikUi).toContain('DECORATIVE_RATE_MISSING');
    expect(supurgelikUi).toContain('Değer Gir');

    const pervazPage = readRepo('frontend/src/pages/cost-calculation-page.tsx');
    expect(pervazPage).toContain('Değer Gir');
    expect(pervazPage).toContain('saveDekoratifPremium');
  });
});
