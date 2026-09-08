import { AyarliPervazMdfCalculator } from './ayarli-pervaz-mdf-calculator';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AYARLI_PERVAZ_EXCEL_EXTRA_COSTS,
  AYARLI_PERVAZ_EXCEL_MDF_ROWS,
  AYARLI_PERVAZ_KILCIK_CARD_PRICE,
} from './fixtures/ayarli-pervaz-excel-mdf.fixture';
import { AYARLI_PERVAZ_PRICING_SEED } from '../../modules/pricing/ayarli-pervaz-pricing-seed';
import { AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS } from '../../modules/pricing/ayarli-pervaz-pricing-row-exception-seed';
import {
  AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS,
  AYARLI_PERVAZ_CARD_SALE_UNLISTED_MEASURES,
} from '../../modules/pricing/ayarli-pervaz-card-sale-enabled-seed';

const excelExtraCosts = {
  cutting: AYARLI_PERVAZ_EXCEL_EXTRA_COSTS.cutting,
  glue: AYARLI_PERVAZ_EXCEL_EXTRA_COSTS.glue,
  labor: AYARLI_PERVAZ_EXCEL_EXTRA_COSTS.labor,
};

function excelProfitRate(row: { thicknessMm: number; widthMm: number; lengthMm: number }): string {
  const exception = AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS.find(
    (seed) =>
      seed.thicknessMm === row.thicknessMm &&
      seed.widthMm === row.widthMm &&
      seed.lengthMm === row.lengthMm &&
      seed.profitRate != null,
  );
  return exception?.profitRate ?? AYARLI_PERVAZ_PRICING_SEED.profitRate;
}

function excelAdjustmentAmount(row: {
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
}): string | null {
  const exception = AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS.find(
    (seed) =>
      seed.thicknessMm === row.thicknessMm &&
      seed.widthMm === row.widthMm &&
      seed.lengthMm === row.lengthMm &&
      seed.adjustmentAmount != null,
  );
  return exception?.adjustmentAmount ?? null;
}

describe('AyarliPervazMdfCalculator', () => {
  const calculator = new AyarliPervazMdfCalculator();

  it('CARD sheetPrice / NET; total = main + kilcik; ara ROUND yok', () => {
    const result = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: 9,
      widthMm: 70,
      lengthMm: 2200,
      mainPiece: {
        rawMaterialCode: 'MDF-9-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1880',
        netQty: 40,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1050',
        netQty: 66,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
    });

    expect(result.mainPiece.sheetPriceType).toBe('CARD_INSTALLMENT');
    expect(result.kilcik.sheetPriceType).toBe('CARD_INSTALLMENT');
    expect(result.mainPiece.unitCost).toBe('47');
    expect(result.kilcik.unitCost.startsWith('15.9090909090909090909')).toBe(true);
    expect(result.totalMdfCost).toBe(
      toDecimal(result.mainPiece.unitCost).plus(toDecimal(result.kilcik.unitCost)).toFixed(),
    );
    expect(toDecimal(result.totalMdfCost).equals(toDecimal('1880').div(40).plus(toDecimal('1050').div(66)))).toBe(
      true,
    );
  });

  it('12 mm 10×250 ana NET 22 (geometri 21 değil)', () => {
    const result = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: 12,
      widthMm: 100,
      lengthMm: 2500,
      mainPiece: {
        rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '2185',
        netQty: 22,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1050',
        netQty: 52,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
    });
    expect(result.mainPiece.netQty).toBe(22);
    expect(result.mainPiece.rawMaterialCode).toBe('MDF-12-2100X2800-ZIMPARALI');
    expect(result.mainPiece.unitCost.startsWith('99.3181818181818181818')).toBe(true);
  });

  it('18 mm 10×250 ana NET 21; kılçık 14/220=62, 16/250=44, 18/220=50', () => {
    const eighteen = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: 18,
      widthMm: 100,
      lengthMm: 2500,
      mainPiece: {
        rawMaterialCode: 'MDF-18-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '3400',
        netQty: 21,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1050',
        netQty: 40,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
    });
    expect(eighteen.mainPiece.netQty).toBe(21);

    expect(toDecimal('1050').div(62).toFixed().startsWith('16.9354838709677419354')).toBe(true);
    expect(toDecimal('1050').div(44).toFixed().startsWith('23.8636363636363636363')).toBe(true);
    expect(toDecimal('1050').div(50).toFixed()).toBe('21');
  });

  it('CASH fiyat tipi reddeder', () => {
    expect(() =>
      calculator.calculate({
        productCode: 'AYARLI_PERVAZ',
        thicknessMm: 9,
        widthMm: 70,
        lengthMm: 2200,
        mainPiece: {
          rawMaterialCode: 'MDF-9-2200X2800-ZIMPARALI',
          sheetPriceType: 'CASH' as 'CARD_INSTALLMENT',
          sheetPrice: '1600',
          netQty: 40,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '1050',
          netQty: 66,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: excelExtraCosts,
        profitRate: '15',
      }),
    ).toThrow('CARD_INSTALLMENT');
  });

  it('extraCosts.total Decimal CUTTING+GLUE+LABOR; productionCost = MDF + total; OTHER yok', () => {
    const result = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: 9,
      widthMm: 70,
      lengthMm: 2200,
      mainPiece: {
        rawMaterialCode: 'MDF-9-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1880',
        netQty: 40,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1050',
        netQty: 66,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
    });

    expect(result.extraCosts.cutting).toBe('4');
    expect(result.extraCosts.glue).toBe('4');
    expect(result.extraCosts.labor).toBe('4');
    expect(toDecimal(result.extraCosts.total).equals(toDecimal('4').plus('4').plus('4'))).toBe(
      true,
    );
    expect(
      toDecimal(result.productionCost).equals(
        toDecimal(result.totalMdfCost).plus(toDecimal(result.extraCosts.total)),
      ),
    ).toBe(true);
    expect(result.extraCosts).not.toHaveProperty('other');
    expect(result.totalMdfCost.startsWith('62.90909')).toBe(true);
    expect(result.productionCost.startsWith('74.90909')).toBe(true);
    expect(result.pricing.profitRate).toBe('15');
    expect(result.pricing.profitAmount.startsWith('11.23636')).toBe(true);
    expect(result.pricing.priceBeforeRounding.startsWith('86.14545')).toBe(true);
    expect(
      toDecimal(result.pricing.profitAmount).equals(
        toDecimal(result.productionCost).times('15').div('100'),
      ),
    ).toBe(true);
    expect(
      toDecimal(result.pricing.priceBeforeRounding).equals(
        toDecimal(result.productionCost).plus(toDecimal(result.pricing.profitAmount)),
      ),
    ).toBe(true);
    expect(result.pricing.roundedSalePrice).toBe('87');
    expect(result.pricing.publishedSalePrice).toBe('87');
    expect(result.pricing.adjustmentAmount).toBeNull();
    expect(result.pricing.roundedSalePrice).toBe(
      roundUpToWholeTl(result.pricing.priceBeforeRounding).toFixed(),
    );
  });

  it('ek maliyetler input’tan gelir; 12 hardcoded değil (5+5+5=15)', () => {
    const result = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: 9,
      widthMm: 70,
      lengthMm: 2200,
      mainPiece: {
        rawMaterialCode: 'MDF-9-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1880',
        netQty: 40,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1050',
        netQty: 66,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: { cutting: '5', glue: '5', labor: '5' },
      profitRate: '15',
    });

    expect(toDecimal(result.extraCosts.total).equals(toDecimal('15'))).toBe(true);
    expect(
      toDecimal(result.productionCost).equals(toDecimal(result.totalMdfCost).plus('15')),
    ).toBe(true);
  });

  it('CUTTING 4→6 simülasyonunda productionCost +2 değişir; MDF aynı kalır', () => {
    const base = {
      productCode: 'AYARLI_PERVAZ' as const,
      thicknessMm: 9,
      widthMm: 70,
      lengthMm: 2200,
      mainPiece: {
        rawMaterialCode: 'MDF-9-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT' as const,
        sheetPrice: '1880',
        netQty: 40,
        yieldSource: 'EXCEL_MASTER' as const,
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT' as const,
        sheetPrice: '1050',
        netQty: 66,
        yieldSource: 'EXCEL_MASTER' as const,
      },
    };

    const before = calculator.calculate({
      ...base,
      extraCosts: excelExtraCosts,
      profitRate: '15',
    });
    const after = calculator.calculate({
      ...base,
      extraCosts: { cutting: '6', glue: '4', labor: '4' },
      profitRate: '15',
    });

    expect(after.totalMdfCost).toBe(before.totalMdfCost);
    expect(toDecimal(after.extraCosts.total).equals(toDecimal('14'))).toBe(true);
    expect(
      toDecimal(after.productionCost).minus(toDecimal(before.productionCost)).equals(toDecimal(2)),
    ).toBe(true);
  });

  it('eksik required extra cost sessiz 0 değil, açık hata', () => {
    expect(() =>
      calculator.calculate({
        productCode: 'AYARLI_PERVAZ',
        thicknessMm: 9,
        widthMm: 70,
        lengthMm: 2200,
        mainPiece: {
          rawMaterialCode: 'MDF-9-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '1880',
          netQty: 40,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '1050',
          netQty: 66,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: { cutting: '4', glue: '', labor: '4' },
        profitRate: '15',
      }),
    ).toThrow('Pervaz ek maliyeti eksik: GLUE');
  });
});

describe('Ayarlı Pervaz Excel MDF karşılaştırması (20 satır)', () => {
  const calculator = new AyarliPervazMdfCalculator();

  it.each(AYARLI_PERVAZ_EXCEL_MDF_ROWS)(
    '$thicknessMm mm $widthMm×$lengthMm — tam bölme Excel gösteriminden sapabilir',
    (row) => {
      const result = calculator.calculate({
        productCode: 'AYARLI_PERVAZ',
        thicknessMm: row.thicknessMm,
        widthMm: row.widthMm,
        lengthMm: row.lengthMm,
        mainPiece: {
          rawMaterialCode: row.mainRawMaterialCode,
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: row.mainCardPrice,
          netQty: row.mainNetQty,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: AYARLI_PERVAZ_KILCIK_CARD_PRICE,
          netQty: row.kilcikNetQty,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: excelExtraCosts,
        profitRate: excelProfitRate(row),
        adjustmentAmount: excelAdjustmentAmount(row),
      });

      const expectedMain = toDecimal(row.mainCardPrice).div(row.mainNetQty);
      const expectedKilcik = toDecimal(AYARLI_PERVAZ_KILCIK_CARD_PRICE).div(row.kilcikNetQty);
      expect(toDecimal(result.mainPiece.unitCost).equals(expectedMain)).toBe(true);
      expect(toDecimal(result.kilcik.unitCost).equals(expectedKilcik)).toBe(true);
      expect(
        toDecimal(result.totalMdfCost).equals(expectedMain.plus(expectedKilcik)),
      ).toBe(true);

      const expectedExtraTotal = toDecimal(excelExtraCosts.cutting)
        .plus(excelExtraCosts.glue)
        .plus(excelExtraCosts.labor);
      expect(toDecimal(result.extraCosts.total).equals(expectedExtraTotal)).toBe(true);
      const excelK = expectedMain.plus(expectedKilcik).plus(expectedExtraTotal);
      expect(toDecimal(result.productionCost).equals(excelK)).toBe(true);
      expect(
        toDecimal(result.productionCost)
          .minus(excelK)
          .abs()
          .equals(0),
      ).toBe(true);

      const expectedProfitRate = excelProfitRate(row);
      expect(result.pricing.profitRate).toBe(expectedProfitRate);
      expect(
        toDecimal(result.pricing.profitAmount).equals(
          toDecimal(result.productionCost).times(expectedProfitRate).div('100'),
        ),
      ).toBe(true);
      expect(
        toDecimal(result.pricing.priceBeforeRounding).equals(
          toDecimal(result.productionCost).plus(toDecimal(result.pricing.profitAmount)),
        ),
      ).toBe(true);
      expect(result.pricing.roundedSalePrice).toBe(
        roundUpToWholeTl(result.pricing.priceBeforeRounding).toFixed(),
      );
      expect(result.pricing).not.toHaveProperty('finalSalePrice');
      expect(
        toDecimal(result.pricing.publishedSalePrice).equals(
          toDecimal(result.pricing.roundedSalePrice).plus(
            result.pricing.adjustmentAmount ?? '0',
          ),
        ),
      ).toBe(true);
      expect(result.pricing.publishedSalePrice).toBe(row.excelFinalSalePrice);
      if (excelAdjustmentAmount(row) != null) {
        expect(result.pricing.adjustmentAmount).toBe(excelAdjustmentAmount(row));
        expect(
          toDecimal(result.pricing.publishedSalePrice)
            .minus(toDecimal(result.pricing.roundedSalePrice))
            .equals(toDecimal(result.pricing.adjustmentAmount!)),
        ).toBe(true);
      } else {
        expect(result.pricing.adjustmentAmount).toBeNull();
        expect(result.pricing.publishedSalePrice).toBe(result.pricing.roundedSalePrice);
      }

      const displayMainDiff = expectedMain.minus(toDecimal(row.excelDisplayedMainUnitCost)).abs();
      const displayKilcikDiff = expectedKilcik
        .minus(toDecimal(row.excelDisplayedKilcikUnitCost))
        .abs();
      expect(displayMainDiff.lte('0.0001')).toBe(true);
      expect(displayKilcikDiff.lte('0.0001')).toBe(true);
    },
  );

  it('20 Excel satırı vardır; 12mm 10×250 NET 22 ve 18mm 10×250 NET 21', () => {
    expect(AYARLI_PERVAZ_EXCEL_MDF_ROWS).toHaveLength(20);
    expect(
      AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
        (r) => r.thicknessMm === 12 && r.widthMm === 100 && r.lengthMm === 2500,
      ),
    ).toMatchObject({
      mainNetQty: 22,
      mainRawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
      kilcikNetQty: 52,
    });
    expect(
      AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
        (r) => r.thicknessMm === 18 && r.widthMm === 100 && r.lengthMm === 2500,
      ),
    ).toMatchObject({ mainNetQty: 21, kilcikNetQty: 40 });
  });

  it('özel satırlar: productionCost = MDF + extraCosts.total (Excel K = J + L7)', () => {
    const cases = [
      { thicknessMm: 9, widthMm: 70, lengthMm: 2200, mdfPrefix: '62.9090', costPrefix: '74.9090' },
      { thicknessMm: 12, widthMm: 100, lengthMm: 2500, mdfPrefix: '119.5104', costPrefix: '131.5104' },
      { thicknessMm: 18, widthMm: 100, lengthMm: 2200, mdfPrefix: '142.4285', costPrefix: '154.4285' },
      { thicknessMm: 18, widthMm: 100, lengthMm: 2500, mdfPrefix: '188.1547', costPrefix: '200.1547' },
    ];

    for (const c of cases) {
      const row = AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
        (r) => r.thicknessMm === c.thicknessMm && r.widthMm === c.widthMm && r.lengthMm === c.lengthMm,
      )!;
      const result = calculator.calculate({
        productCode: 'AYARLI_PERVAZ',
        thicknessMm: row.thicknessMm,
        widthMm: row.widthMm,
        lengthMm: row.lengthMm,
        mainPiece: {
          rawMaterialCode: row.mainRawMaterialCode,
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: row.mainCardPrice,
          netQty: row.mainNetQty,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: AYARLI_PERVAZ_KILCIK_CARD_PRICE,
          netQty: row.kilcikNetQty,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: excelExtraCosts,
        profitRate: excelProfitRate(row),
        adjustmentAmount: excelAdjustmentAmount(row),
      });
      expect(result.totalMdfCost.startsWith(c.mdfPrefix)).toBe(true);
      expect(result.productionCost.startsWith(c.costPrefix)).toBe(true);
      expect(
        toDecimal(result.productionCost).equals(
          toDecimal(result.totalMdfCost).plus(toDecimal(result.extraCosts.total)),
        ),
      ).toBe(true);
    }
  });

  it('19 satır %15, 16 mm 10×250 %20; iki satırda adjustment seed var', () => {
    const rates = AYARLI_PERVAZ_EXCEL_MDF_ROWS.map(excelProfitRate);
    expect(rates.filter((rate) => rate === '15')).toHaveLength(19);
    expect(rates.filter((rate) => rate === '20')).toHaveLength(1);
    expect(AYARLI_PERVAZ_EXCEL_MDF_ROWS.filter((row) => excelAdjustmentAmount(row) != null)).toHaveLength(
      2,
    );
    expect(
      excelProfitRate({ thicknessMm: 16, widthMm: 100, lengthMm: 2500 }),
    ).toBe('20');
    expect(
      excelProfitRate({ thicknessMm: 18, widthMm: 100, lengthMm: 2200 }),
    ).toBe('15');
    expect(
      excelProfitRate({ thicknessMm: 18, widthMm: 80, lengthMm: 2200 }),
    ).toBe('15');
  });

  it('16 mm 10×250 %20 ve adjustment yok; 18 mm satırlar ROUNDUP sonrası +1', () => {
    const special = AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
      (r) => r.thicknessMm === 16 && r.widthMm === 100 && r.lengthMm === 2500,
    )!;
    const eighteenTen = AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
      (r) => r.thicknessMm === 18 && r.widthMm === 100 && r.lengthMm === 2200,
    )!;
    const eighteenEight = AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
      (r) => r.thicknessMm === 18 && r.widthMm === 80 && r.lengthMm === 2200,
    )!;

    const run = (row: (typeof AYARLI_PERVAZ_EXCEL_MDF_ROWS)[number]) =>
      calculator.calculate({
        productCode: 'AYARLI_PERVAZ',
        thicknessMm: row.thicknessMm,
        widthMm: row.widthMm,
        lengthMm: row.lengthMm,
        mainPiece: {
          rawMaterialCode: row.mainRawMaterialCode,
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: row.mainCardPrice,
          netQty: row.mainNetQty,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: AYARLI_PERVAZ_KILCIK_CARD_PRICE,
          netQty: row.kilcikNetQty,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: excelExtraCosts,
        profitRate: excelProfitRate(row),
        adjustmentAmount: excelAdjustmentAmount(row),
      });

    const specialResult = run(special);
    expect(specialResult.productionCost.startsWith('178.7207')).toBe(true);
    expect(specialResult.pricing.profitRate).toBe('20');
    expect(specialResult.pricing.priceBeforeRounding.startsWith('214.46493')).toBe(true);
    expect(specialResult.pricing.roundedSalePrice).toBe('215');
    expect(specialResult.pricing.adjustmentAmount).toBeNull();
    expect(specialResult.pricing.publishedSalePrice).toBe('215');
    expect(
      toDecimal(specialResult.pricing.priceBeforeRounding).equals(
        toDecimal(specialResult.productionCost).times('1.20'),
      ),
    ).toBe(true);

    const eighteenTenResult = run(eighteenTen);
    expect(eighteenTenResult.pricing.profitRate).toBe('15');
    expect(eighteenTenResult.pricing.priceBeforeRounding.startsWith('177.5928')).toBe(true);
    expect(eighteenTenResult.pricing.roundedSalePrice).toBe('178');
    expect(eighteenTenResult.pricing.adjustmentAmount).toBe('1');
    expect(eighteenTenResult.pricing.publishedSalePrice).toBe('179');
    expect(
      toDecimal(eighteenTenResult.pricing.publishedSalePrice).equals(
        toDecimal(eighteenTenResult.pricing.roundedSalePrice).plus('1'),
      ),
    ).toBe(true);
    expect(
      toDecimal(eighteenTenResult.pricing.profitAmount).equals(
        toDecimal(eighteenTenResult.productionCost).times('15').div('100'),
      ),
    ).toBe(true);
    expect(
      toDecimal(eighteenTenResult.pricing.priceBeforeRounding).equals(
        toDecimal(eighteenTenResult.productionCost).times('115').div('100'),
      ),
    ).toBe(true);

    const eighteenEightResult = run(eighteenEight);
    expect(eighteenEightResult.pricing.profitRate).toBe('15');
    expect(eighteenEightResult.pricing.roundedSalePrice).toBe('150');
    expect(eighteenEightResult.pricing.adjustmentAmount).toBe('1');
    expect(eighteenEightResult.pricing.publishedSalePrice).toBe('151');
    expect(
      toDecimal(eighteenEightResult.pricing.priceBeforeRounding).equals(
        toDecimal(eighteenEightResult.productionCost).times('115').div('100'),
      ),
    ).toBe(true);
  });

  it('calculator ölçüye göre profitRate hardcode etmez; input oranı kullanılır', () => {
    const special = AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
      (r) => r.thicknessMm === 16 && r.widthMm === 100 && r.lengthMm === 2500,
    )!;
    const result = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: special.thicknessMm,
      widthMm: special.widthMm,
      lengthMm: special.lengthMm,
      mainPiece: {
        rawMaterialCode: special.mainRawMaterialCode,
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: special.mainCardPrice,
        netQty: special.mainNetQty,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: AYARLI_PERVAZ_KILCIK_CARD_PRICE,
        netQty: special.kilcikNetQty,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
    });
    expect(result.pricing.profitRate).toBe('15');
    expect(
      toDecimal(result.pricing.profitAmount).equals(
        toDecimal(result.productionCost).times('15').div('100'),
      ),
    ).toBe(true);
  });

  it('kâr Decimal, ara ROUND ve KDV yok', () => {
    const result = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: 9,
      widthMm: 70,
      lengthMm: 2200,
      mainPiece: {
        rawMaterialCode: 'MDF-9-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1880',
        netQty: 40,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: '1050',
        netQty: 66,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
    });

    const profitAmount = toDecimal(result.productionCost).times('15').div('100');
    expect(result.pricing.profitAmount).toBe(profitAmount.toFixed());
    expect(result.pricing.profitAmount).not.toBe(profitAmount.toFixed(2));
    expect(result.pricing.priceBeforeRounding).not.toBe(
      toDecimal(result.pricing.priceBeforeRounding).toFixed(2),
    );
    expect(result.pricing.roundedSalePrice).toBe(
      roundUpToWholeTl(result.pricing.priceBeforeRounding).toFixed(),
    );
    expect(result.pricing.publishedSalePrice).toBe(result.pricing.roundedSalePrice);
    expect(result.pricing.adjustmentAmount).toBeNull();
    expect(result.pricing).not.toHaveProperty('vatRate');
    expect(result.pricing).not.toHaveProperty('vatAmount');
    expect(result.pricing).not.toHaveProperty('costWithVat');
    expect(result.pricing).not.toHaveProperty('finalSalePrice');
    expect(result.pricing).not.toHaveProperty('cardMarkupRate');
  });

  it('ortak roundUpToWholeTl: near-whole artığı 101 yapmaz; 100.0001 → 101', () => {
    expect(roundUpToWholeTl('100.00000000000000000001').toString()).toBe('100');
    expect(roundUpToWholeTl('100.0001').toString()).toBe('101');
  });

  it('ROUNDUP ortak roundUpToWholeTl helper’ını reuse eder; Math.ceil / hardcoded +1 yok', () => {
    const src = readFileSync(join(__dirname, 'ayarli-pervaz-mdf-calculator.ts'), 'utf8');
    expect(src).toMatch(/roundUpToWholeTl\(priceBeforeRounding\)/);
    expect(src).toMatch(/roundedSalePrice\.plus\(adjustment\.amount\)/);
    expect(src).not.toMatch(/Math\.ceil/);
    expect(src).not.toMatch(/thicknessMm === 18/);
  });

  it('exception yokken 18 mm satıra hardcoded +1 uygulanmaz', () => {
    const eighteenTen = AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
      (r) => r.thicknessMm === 18 && r.widthMm === 100 && r.lengthMm === 2200,
    )!;
    const result = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: eighteenTen.thicknessMm,
      widthMm: eighteenTen.widthMm,
      lengthMm: eighteenTen.lengthMm,
      mainPiece: {
        rawMaterialCode: eighteenTen.mainRawMaterialCode,
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: eighteenTen.mainCardPrice,
        netQty: eighteenTen.mainNetQty,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: AYARLI_PERVAZ_KILCIK_CARD_PRICE,
        netQty: eighteenTen.kilcikNetQty,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
    });
    expect(result.pricing.roundedSalePrice).toBe('178');
    expect(result.pricing.publishedSalePrice).toBe('178');
    expect(result.pricing.adjustmentAmount).toBeNull();
  });

  function isAyarliCardListed(row: {
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
  }): boolean {
    return AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS.some(
      (seed) =>
        seed.thicknessMm === row.thicknessMm &&
        seed.widthMm === row.widthMm &&
        seed.lengthMm === row.lengthMm,
    );
  }

  it.each(AYARLI_PERVAZ_EXCEL_MDF_ROWS)(
    '$thicknessMm mm $widthMm×$lengthMm kart kapsamı Excel nakit+2 veya null',
    (row) => {
      const result = calculator.calculate({
        productCode: 'AYARLI_PERVAZ',
        thicknessMm: row.thicknessMm,
        widthMm: row.widthMm,
        lengthMm: row.lengthMm,
        mainPiece: {
          rawMaterialCode: row.mainRawMaterialCode,
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: row.mainCardPrice,
          netQty: row.mainNetQty,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: AYARLI_PERVAZ_KILCIK_CARD_PRICE,
          netQty: row.kilcikNetQty,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: excelExtraCosts,
        profitRate: excelProfitRate(row),
        adjustmentAmount: excelAdjustmentAmount(row),
        cardFixedSurchargeAmount: '2',
        cardSaleEnabled: isAyarliCardListed(row),
      });

      expect(result.pricing.publishedSalePrice).toBe(row.excelFinalSalePrice);
      if (isAyarliCardListed(row)) {
        expect(result.pricing.cardSaleAvailable).toBe(true);
        expect(result.pricing.cardPricingType).toBe('FIXED_SURCHARGE');
        expect(result.pricing.cardSalePrice).toBe(
          toDecimal(result.pricing.publishedSalePrice).plus('2').toFixed(),
        );
      } else {
        expect(result.pricing.cardSaleAvailable).toBe(false);
        expect(result.pricing.cardPricingType).toBe('NONE');
        expect(result.pricing.cardSalePrice).toBeNull();
      }
    },
  );

  it('FİYAT LİSTESİ 12 kartlı / 8 liste dışı ayrımını korur', () => {
    expect(AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS).toHaveLength(12);
    expect(AYARLI_PERVAZ_CARD_SALE_UNLISTED_MEASURES).toHaveLength(8);
  });

  it('18 mm 10×220: nakit 179, kart 181; +1 karta dahildir; 178+2 yapılmaz', () => {
    const row = AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
      (item) => item.thicknessMm === 18 && item.widthMm === 100 && item.lengthMm === 2200,
    )!;
    const result = calculator.calculate({
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: row.thicknessMm,
      widthMm: row.widthMm,
      lengthMm: row.lengthMm,
      mainPiece: {
        rawMaterialCode: row.mainRawMaterialCode,
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: row.mainCardPrice,
        netQty: row.mainNetQty,
        yieldSource: 'EXCEL_MASTER',
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT',
        sheetPrice: AYARLI_PERVAZ_KILCIK_CARD_PRICE,
        netQty: row.kilcikNetQty,
        yieldSource: 'EXCEL_MASTER',
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
      adjustmentAmount: '1',
      cardFixedSurchargeAmount: '2',
      cardSaleEnabled: true,
    });
    expect(result.pricing.roundedSalePrice).toBe('178');
    expect(result.pricing.publishedSalePrice).toBe('179');
    expect(result.pricing.cardSalePrice).toBe('181');
    expect(result.pricing.cardSalePrice).not.toBe('180');
    expect(result.pricing.cardSalePrice).toBe(
      toDecimal(result.pricing.publishedSalePrice).plus('2').toFixed(),
    );
  });

  it('cardFixed 2→3 yalnız kartı +1 değiştirir; nakit aynı kalır', () => {
    const row = AYARLI_PERVAZ_EXCEL_MDF_ROWS.find(
      (item) => item.thicknessMm === 18 && item.widthMm === 100 && item.lengthMm === 2200,
    )!;
    const input = {
      productCode: 'AYARLI_PERVAZ' as const,
      thicknessMm: row.thicknessMm,
      widthMm: row.widthMm,
      lengthMm: row.lengthMm,
      mainPiece: {
        rawMaterialCode: row.mainRawMaterialCode,
        sheetPriceType: 'CARD_INSTALLMENT' as const,
        sheetPrice: row.mainCardPrice,
        netQty: row.mainNetQty,
        yieldSource: 'EXCEL_MASTER' as const,
      },
      kilcik: {
        rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
        sheetPriceType: 'CARD_INSTALLMENT' as const,
        sheetPrice: AYARLI_PERVAZ_KILCIK_CARD_PRICE,
        netQty: row.kilcikNetQty,
        yieldSource: 'EXCEL_MASTER' as const,
      },
      extraCosts: excelExtraCosts,
      profitRate: '15',
      adjustmentAmount: '1',
      cardSaleEnabled: true,
    };
    const two = calculator.calculate({ ...input, cardFixedSurchargeAmount: '2' });
    const three = calculator.calculate({ ...input, cardFixedSurchargeAmount: '3' });
    expect(two.pricing.publishedSalePrice).toBe('179');
    expect(three.pricing.publishedSalePrice).toBe(two.pricing.publishedSalePrice);
    expect(two.pricing.cardSalePrice).toBe('181');
    expect(three.pricing.cardSalePrice).toBe('182');
  });

  it('Pervaz calculator cardMarkupRate kullanmaz', () => {
    const src = readFileSync(join(__dirname, 'ayarli-pervaz-mdf-calculator.ts'), 'utf8');
    const helper = readFileSync(join(__dirname, 'pervaz-card-sale.ts'), 'utf8');
    expect(src).not.toMatch(/cardMarkupRate/);
    expect(helper).not.toMatch(/cardMarkupRate/);
    expect(helper).not.toMatch(/roundUpToWholeTl/);
  });
});
