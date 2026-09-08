import { DekoratifPervazCalculator } from './dekoratif-pervaz-calculator';
import {
  roundUpToWholeTl,
  toDecimal,
} from '../../common/decimal/decimal.util';

const rows = [
  {
    thicknessMm: 12,
    lengthMm: 2200,
    mainSheetPrice: '2475',
    mainNet: 28,
    kilcikNet: 66,
    premiumRate: '50',
    published: '201',
  },
  {
    thicknessMm: 12,
    lengthMm: 2500,
    mainSheetPrice: '2475',
    mainNet: 22,
    kilcikNet: 52,
    premiumRate: '50',
    published: '250',
  },
  {
    thicknessMm: 14,
    lengthMm: 2200,
    mainSheetPrice: '2625',
    mainNet: 21,
    kilcikNet: 62,
    premiumRate: '50',
    published: '266',
  },
  {
    thicknessMm: 14,
    lengthMm: 2500,
    mainSheetPrice: '2625',
    mainNet: 21,
    kilcikNet: 48,
    premiumRate: '50',
    published: '275',
  },
  {
    thicknessMm: 18,
    lengthMm: 2200,
    mainSheetPrice: '3400',
    mainNet: 28,
    kilcikNet: 50,
    premiumRate: '75',
    published: '311',
  },
  {
    thicknessMm: 18,
    lengthMm: 2500,
    mainSheetPrice: '2800',
    mainNet: 21,
    kilcikNet: 40,
    premiumRate: '75',
    published: '346',
  },
] as const;

describe('DekoratifPervazCalculator', () => {
  const calculator = new DekoratifPervazCalculator();

  it.each(rows)(
    '$thicknessMm mm 10×$lengthMm Excel zincirini üretir',
    (row) => {
      const result = calculator.calculate({
        productCode: 'DEKORATIF_PERVAZ',
        thicknessMm: row.thicknessMm,
        widthMm: 100,
        lengthMm: row.lengthMm,
        mainPiece: {
          rawMaterialCode: 'MAIN',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: row.mainSheetPrice,
          netQty: row.mainNet,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '1050',
          netQty: row.kilcikNet,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: { cutting: '4', glue: '4', labor: '4' },
        profitRate: '15',
        decorativePremiumRate: row.premiumRate,
      });

      expect(result.pricing.decorativePremiumRate).toBe(row.premiumRate);
      expect(result.pricing.publishedSalePrice).toBe(row.published);
      expect(result.pricing.baseSalePrice).toBe(
        toDecimal(result.productionCost)
          .plus(result.pricing.profitAmount)
          .toFixed(),
      );
      expect(result.pricing.decorativePremiumAmount).toBe(
        toDecimal(result.pricing.baseSalePrice)
          .times(row.premiumRate)
          .div(100)
          .toFixed(),
      );
      expect(result.pricing.publishedSalePrice).toBe(
        roundUpToWholeTl(result.pricing.priceBeforeRounding).toFixed(),
      );
    },
  );

  it('ortak masraf değişince sonucu request anında yeniden hesaplar', () => {
    const input = {
      productCode: 'DEKORATIF_PERVAZ' as const,
      thicknessMm: 12,
      widthMm: 100,
      lengthMm: 2200,
      mainPiece: {
        rawMaterialCode: 'MAIN',
        sheetPriceType: 'CARD_INSTALLMENT' as const,
        sheetPrice: '2475',
        netQty: 28,
        yieldSource: 'EXCEL_MASTER' as const,
      },
      kilcik: {
        rawMaterialCode: 'KILCIK',
        sheetPriceType: 'CARD_INSTALLMENT' as const,
        sheetPrice: '1050',
        netQty: 66,
        yieldSource: 'EXCEL_MASTER' as const,
      },
      profitRate: '15',
      decorativePremiumRate: '50',
    };
    const before = calculator.calculate({
      ...input,
      extraCosts: { cutting: '4', glue: '4', labor: '4' },
    });
    const after = calculator.calculate({
      ...input,
      extraCosts: { cutting: '5', glue: '4', labor: '4' },
    });

    expect(after.productionCost).not.toBe(before.productionCost);
    expect(after.pricing.publishedSalePrice).not.toBe(
      before.pricing.publishedSalePrice,
    );
  });

  it.each([
    { lengthMm: 2200, mainNet: 24, expected: '212' },
    { lengthMm: 2300, mainNet: 23, expected: '219' },
  ])(
    'Geniş Kılçık 9×$lengthMm Excel finalini yalnız %30 ile üretir',
    ({ lengthMm, mainNet, expected }) => {
      const result = calculator.calculate({
        productCode: 'DEKORATIF_PERVAZ_GENIS_KILCIK',
        thicknessMm: 12,
        widthMm: 90,
        lengthMm,
        mainPiece: {
          rawMaterialCode: 'MDF-12-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '2475',
          netQty: mainNet,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '1050',
          netQty: 40,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: { cutting: '4', glue: '4', labor: '4' },
        profitRate: '15',
        decorativePremiumRate: '30',
      });

      expect(result.productCode).toBe(
        'DEKORATIF_PERVAZ_GENIS_KILCIK',
      );
      expect(result.mainPiece.netQty).toBe(mainNet);
      expect(result.kilcik.netQty).toBe(40);
      expect(result.pricing.profitRate).toBe('15');
      expect(result.pricing.decorativePremiumRate).toBe('30');
      expect(result.pricing.adjustmentAmount).toBeNull();
      expect(result.pricing.roundedSalePrice).toBe(expected);
      expect(result.pricing.publishedSalePrice).toBe(expected);
      expect(result.pricing.cardSaleAvailable).toBe(false);
      expect(result.pricing.cardSalePrice).toBeNull();
    },
  );

  it.each(rows)(
    '$thicknessMm mm 10×$lengthMm kart = nakit + 2; ikinci ROUNDUP yok',
    (row) => {
      const result = calculator.calculate({
        productCode: 'DEKORATIF_PERVAZ',
        thicknessMm: row.thicknessMm,
        widthMm: 100,
        lengthMm: row.lengthMm,
        mainPiece: {
          rawMaterialCode: 'MAIN',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: row.mainSheetPrice,
          netQty: row.mainNet,
          yieldSource: 'EXCEL_MASTER',
        },
        kilcik: {
          rawMaterialCode: 'MDF-4-2200X2800-ZIMPARALI',
          sheetPriceType: 'CARD_INSTALLMENT',
          sheetPrice: '1050',
          netQty: row.kilcikNet,
          yieldSource: 'EXCEL_MASTER',
        },
        extraCosts: { cutting: '4', glue: '4', labor: '4' },
        profitRate: '15',
        decorativePremiumRate: row.premiumRate,
        cardFixedSurchargeAmount: '2',
      });

      expect(result.pricing.publishedSalePrice).toBe(row.published);
      expect(result.pricing.cardSaleAvailable).toBe(true);
      expect(result.pricing.cardPricingType).toBe('FIXED_SURCHARGE');
      expect(result.pricing.cardSalePrice).toBe(
        toDecimal(row.published).plus('2').toFixed(),
      );
      expect(result.pricing.cardSalePrice).toBe(
        toDecimal(result.pricing.publishedSalePrice).plus('2').toFixed(),
      );
    },
  );
});
