import { DoorFrameCalculator } from './door-frame-calculator';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';

describe('DoorFrameCalculator MDF maliyeti', () => {
  const calculator = new DoorFrameCalculator();

  it('34 MM / 10×210 Excel: 169.23 + 47.50 = 216.73', () => {
    const [row] = calculator.calculateMdfCosts([
      {
        widthCm: 10,
        lengthCm: 210,
        displayName: '10×210',
        parts: [
          {
            thicknessMm: '22',
            rawMaterialId: 'm22',
            rawMaterialCode: 'MDF-22-2100X2800-ZIMPARALI',
            rawMaterialName: '22 MM MDF',
            sheetWidthMm: 2100,
            sheetLengthMm: 2800,
            sheetPrice: '4400',
            netQty: 26,
            pieceWidthMm: 100,
            pieceLengthMm: 2100,
          },
          {
            thicknessMm: '12',
            rawMaterialId: 'm12',
            rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
            rawMaterialName: '12 MM MDF',
            sheetWidthMm: 2100,
            sheetLengthMm: 2800,
            sheetPrice: '2185',
            netQty: 46,
            pieceWidthMm: 100,
            pieceLengthMm: 2100,
          },
        ],
      },
    ]);

    expect(row.parts[0].calculatedQty).toBe(26);
    expect(row.parts[1].calculatedQty).toBe(46);
    expect(row.parts[0].netQty).toBe(26);
    expect(row.parts[1].netQty).toBe(46);
    expect(row.parts[0].unitCost.startsWith('169.2307692307692307692')).toBe(true);
    expect(row.parts[1].unitCost).toBe('47.5');
    expect(row.mdfCost.startsWith('216.7307692307692307692')).toBe(true);
  });

  it('30 MM / 10×210 Excel: 107.69 + 47.50 = 155.19', () => {
    const [row] = calculator.calculateMdfCosts([
      {
        widthCm: 10,
        lengthCm: 210,
        displayName: '10×210',
        parts: [
          {
            thicknessMm: '18',
            rawMaterialId: 'm18',
            rawMaterialCode: 'MDF-18-2100X2800-ZIMPARALI',
            rawMaterialName: '18 MM MDF',
            sheetWidthMm: 2100,
            sheetLengthMm: 2800,
            sheetPrice: '2800',
            netQty: 26,
            pieceWidthMm: 100,
            pieceLengthMm: 2100,
          },
          {
            thicknessMm: '12',
            rawMaterialId: 'm12',
            rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
            rawMaterialName: '12 MM MDF',
            sheetWidthMm: 2100,
            sheetLengthMm: 2800,
            sheetPrice: '2185',
            netQty: 46,
            pieceWidthMm: 100,
            pieceLengthMm: 2100,
          },
        ],
      },
    ]);

    expect(row.parts[0].unitCost.startsWith('107.6923076923076923076')).toBe(true);
    expect(row.parts[1].unitCost).toBe('47.5');
    expect(row.mdfCost.startsWith('155.1923076923076923076')).toBe(true);
  });
});

describe('DoorFrameCalculator MDF + ek maliyet', () => {
  const calculator = new DoorFrameCalculator();
  const extraCosts = { cutting: '8', glue: '3.5', labor: '17', other: '5' };

  const size34 = {
    widthCm: 10,
    lengthCm: 210,
    displayName: '10×210',
    parts: [
      {
        thicknessMm: '22',
        rawMaterialId: 'm22',
        rawMaterialCode: 'MDF-22-2100X2800-ZIMPARALI',
        rawMaterialName: '22 MM MDF',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        sheetPrice: '4400',
        netQty: 26,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      },
      {
        thicknessMm: '12',
        rawMaterialId: 'm12',
        rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
        rawMaterialName: '12 MM MDF',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        sheetPrice: '2185',
        netQty: 46,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      },
    ],
  };

  const size30 = {
    ...size34,
    parts: [
      {
        ...size34.parts[0],
        thicknessMm: '18',
        rawMaterialId: 'm18',
        rawMaterialCode: 'MDF-18-2100X2800-ZIMPARALI',
        rawMaterialName: '18 MM MDF',
        sheetPrice: '2800',
      },
      size34.parts[1],
    ],
  };

  it('34 MM / 10×210 Excel: MDF 216.73 + 33.50 = 250.23', () => {
    const [row] = calculator.calculateProductionCosts([size34], extraCosts);
    expect(row.mdfCost.startsWith('216.7307692307692307692')).toBe(true);
    expect(row.extraCosts.cutting).toBe('8');
    expect(row.extraCosts.glue).toBe('3.5');
    expect(row.extraCosts.labor).toBe('17');
    expect(row.extraCosts.other).toBe('5');
    expect(row.extraCosts.total).toBe('33.5');
    expect(row.productionCost.startsWith('250.2307692307692307692')).toBe(true);
  });

  it('30 MM / 10×210 Excel: MDF 155.19 + 33.50 = 188.69', () => {
    const [row] = calculator.calculateProductionCosts([size30], extraCosts);
    expect(row.mdfCost.startsWith('155.1923076923076923076')).toBe(true);
    expect(row.extraCosts.total).toBe('33.5');
    expect(row.productionCost.startsWith('188.6923076923076923076')).toBe(true);
  });

  it('CUTTING 8→10 olduğunda productionCost +2 değişir', () => {
    const [oldRow] = calculator.calculateProductionCosts([size34], extraCosts);
    const [newRow] = calculator.calculateProductionCosts([size34], {
      ...extraCosts,
      cutting: '10',
    });

    expect(newRow.extraCosts.cutting).toBe('10');
    expect(newRow.extraCosts.total).toBe('35.5');
    expect(
      toDecimal(newRow.productionCost).minus(toDecimal(oldRow.productionCost)).toString(),
    ).toBe('2');
  });
});

describe('DoorFrameCalculator KDV', () => {
  const calculator = new DoorFrameCalculator();
  const extraCosts = { cutting: '8', glue: '3.5', labor: '17', other: '5' };

  const size34 = {
    widthCm: 10,
    lengthCm: 210,
    displayName: '10×210',
    parts: [
      {
        thicknessMm: '22',
        rawMaterialId: 'm22',
        rawMaterialCode: 'MDF-22-2100X2800-ZIMPARALI',
        rawMaterialName: '22 MM MDF',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        sheetPrice: '4400',
        netQty: 26,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      },
      {
        thicknessMm: '12',
        rawMaterialId: 'm12',
        rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
        rawMaterialName: '12 MM MDF',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        sheetPrice: '2185',
        netQty: 46,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      },
    ],
  };

  const size30 = {
    ...size34,
    parts: [
      {
        ...size34.parts[0],
        thicknessMm: '18',
        rawMaterialId: 'm18',
        rawMaterialCode: 'MDF-18-2100X2800-ZIMPARALI',
        rawMaterialName: '18 MM MDF',
        sheetPrice: '2800',
      },
      size34.parts[1],
    ],
  };

  it('34 MM / 10×210: vatRate 0 → vatAmount 0, costWithVat = productionCost', () => {
    const [row] = calculator.calculateCostsWithVat([size34], extraCosts, '0');
    expect(row.productionCost.startsWith('250.2307692307692307692')).toBe(true);
    expect(row.pricing.vatRate).toBe('0');
    expect(row.pricing.vatAmount).toBe('0');
    expect(row.pricing.costWithVat).toBe(row.productionCost);
  });

  it('30 MM / 10×210: vatRate 10 → vatAmount ≈ 18.86923, costWithVat ≈ 207.56153', () => {
    const [row] = calculator.calculateCostsWithVat([size30], extraCosts, '10');
    expect(row.productionCost.startsWith('188.6923076923076923076')).toBe(true);
    expect(row.pricing.vatRate).toBe('10');
    expect(row.pricing.vatAmount.startsWith('18.8692307692307692307')).toBe(true);
    expect(row.pricing.costWithVat.startsWith('207.5615384615384615384')).toBe(true);
  });

  it('vatRate eksikse sessiz 0 kabul etmez', () => {
    expect(() => calculator.calculateCostsWithVat([size34], extraCosts, '')).toThrow(
      'KDV oranı (vatRate) eksik.',
    );
  });
});

describe('DoorFrameCalculator kâr', () => {
  const calculator = new DoorFrameCalculator();
  const extraCosts = { cutting: '8', glue: '3.5', labor: '17', other: '5' };

  const size34 = {
    widthCm: 10,
    lengthCm: 210,
    displayName: '10×210',
    parts: [
      {
        thicknessMm: '22',
        rawMaterialId: 'm22',
        rawMaterialCode: 'MDF-22-2100X2800-ZIMPARALI',
        rawMaterialName: '22 MM MDF',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        sheetPrice: '4400',
        netQty: 26,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      },
      {
        thicknessMm: '12',
        rawMaterialId: 'm12',
        rawMaterialCode: 'MDF-12-2100X2800-ZIMPARALI',
        rawMaterialName: '12 MM MDF',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        sheetPrice: '2185',
        netQty: 46,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      },
    ],
  };

  const size30 = {
    ...size34,
    parts: [
      {
        ...size34.parts[0],
        thicknessMm: '18',
        rawMaterialId: 'm18',
        rawMaterialCode: 'MDF-18-2100X2800-ZIMPARALI',
        rawMaterialName: '18 MM MDF',
        sheetPrice: '2800',
      },
      size34.parts[1],
    ],
  };

  it('34 MM / 10×210: profitRate 20 → priceBeforeRounding ≈ 300.28 → rounded/cash 301', () => {
    const [row] = calculator.calculateCostsWithProfit([size34], extraCosts, '0', '20', '20');
    expect(row.pricing.costWithVat.startsWith('250.2307692307692307692')).toBe(true);
    expect(row.pricing.profitRate).toBe('20');
    expect(row.pricing.profitAmount.startsWith('50.0461538461538461538')).toBe(true);
    expect(row.pricing.priceBeforeRounding.startsWith('300.2769230769230769230')).toBe(true);
    expect(row.pricing.roundedSalePrice).toBe('301');
    expect(row.pricing.cashSalePrice).toBe('301');
    expect(row.pricing.cardMarkupRate).toBe('20');
    expect(row.pricing.cardPriceBeforeRounding).toBe('361.2');
    expect(row.pricing.cardSalePrice).toBe('362');
  });

  it('30 MM / 10×210: profitRate 20 → priceBeforeRounding ≈ 249.07 → rounded/cash 250', () => {
    const [row] = calculator.calculateCostsWithProfit([size30], extraCosts, '10', '20', '20');
    expect(row.pricing.costWithVat.startsWith('207.5615384615384615384')).toBe(true);
    expect(row.pricing.profitRate).toBe('20');
    expect(row.pricing.profitAmount.startsWith('41.5123076923076923076')).toBe(true);
    expect(row.pricing.priceBeforeRounding.startsWith('249.0738461538461538461')).toBe(true);
    expect(row.pricing.roundedSalePrice).toBe('250');
    expect(row.pricing.cashSalePrice).toBe('250');
    expect(row.pricing.cardSalePrice).toBe('300');
  });

  it('Excel ROUNDUP örnekleri: 325.75→326', () => {
    expect(roundUpToWholeTl('325.75').toString()).toBe('326');
  });

  it('profitRate eksikse sessiz varsayım yapmaz', () => {
    expect(() => calculator.calculateCostsWithProfit([size34], extraCosts, '0', '', '20')).toThrow(
      'Kâr oranı (profitRate) eksik.',
    );
  });
});

describe('DoorFrameCalculator nakit / kart satış', () => {
  const calculator = new DoorFrameCalculator();

  it('356 nakit + %20 → 428 kart', () => {
    const [row] = calculator.applySaleChannels(
      [
        {
          widthCm: 10,
          lengthCm: 210,
          displayName: 'x',
          parts: [],
          mdfCost: '0',
          extraCosts: { cutting: '0', glue: '0', labor: '0', other: '0', total: '0' },
          productionCost: '0',
          pricing: {
            vatRate: '0',
            vatAmount: '0',
            costWithVat: '0',
            profitRate: '0',
            profitAmount: '0',
            priceBeforeRounding: '356',
            roundedSalePrice: '356',
          },
        },
      ],
      '20',
    );
    expect(row.pricing.cashSalePrice).toBe('356');
    expect(row.pricing.cardPriceBeforeRounding).toBe('427.2');
    expect(row.pricing.cardSalePrice).toBe('428');
  });

  it('415 nakit + %20 → 498 kart', () => {
    const [row] = calculator.applySaleChannels(
      [
        {
          widthCm: 10,
          lengthCm: 210,
          displayName: 'x',
          parts: [],
          mdfCost: '0',
          extraCosts: { cutting: '0', glue: '0', labor: '0', other: '0', total: '0' },
          productionCost: '0',
          pricing: {
            vatRate: '0',
            vatAmount: '0',
            costWithVat: '0',
            profitRate: '0',
            profitAmount: '0',
            priceBeforeRounding: '415',
            roundedSalePrice: '415',
          },
        },
      ],
      '20',
    );
    expect(row.pricing.cashSalePrice).toBe('415');
    expect(row.pricing.cardPriceBeforeRounding).toBe('498');
    expect(row.pricing.cardSalePrice).toBe('498');
  });

  it('708 nakit + %20 → 850 kart', () => {
    const [row] = calculator.applySaleChannels(
      [
        {
          widthCm: 10,
          lengthCm: 210,
          displayName: 'x',
          parts: [],
          mdfCost: '0',
          extraCosts: { cutting: '0', glue: '0', labor: '0', other: '0', total: '0' },
          productionCost: '0',
          pricing: {
            vatRate: '0',
            vatAmount: '0',
            costWithVat: '0',
            profitRate: '0',
            profitAmount: '0',
            priceBeforeRounding: '708',
            roundedSalePrice: '708',
          },
        },
      ],
      '20',
    );
    expect(row.pricing.cashSalePrice).toBe('708');
    expect(row.pricing.cardPriceBeforeRounding).toBe('849.6');
    expect(row.pricing.cardSalePrice).toBe('850');
  });

  it('kart oranı %20→%25 değişince nakit aynı kalır, kart fiyatı değişir', () => {
    const base = {
      widthCm: 10,
      lengthCm: 210,
      displayName: 'x',
      parts: [],
      mdfCost: '0',
      extraCosts: { cutting: '0', glue: '0', labor: '0', other: '0', total: '0' },
      productionCost: '0',
      pricing: {
        vatRate: '0',
        vatAmount: '0',
        costWithVat: '0',
        profitRate: '0',
        profitAmount: '0',
        priceBeforeRounding: '356',
        roundedSalePrice: '356',
      },
    };
    const [a] = calculator.applySaleChannels([base], '20');
    const [b] = calculator.applySaleChannels([base], '25');
    expect(a.pricing.cashSalePrice).toBe(b.pricing.cashSalePrice);
    expect(a.pricing.cardSalePrice).toBe('428');
    expect(b.pricing.cardPriceBeforeRounding).toBe('445');
    expect(b.pricing.cardSalePrice).toBe('445');
  });

  it('cardMarkupRate eksikse sessiz varsayım yapmaz', () => {
    expect(() =>
      calculator.applySaleChannels(
        [
          {
            widthCm: 10,
            lengthCm: 210,
            displayName: 'x',
            parts: [],
            mdfCost: '0',
            extraCosts: { cutting: '0', glue: '0', labor: '0', other: '0', total: '0' },
            productionCost: '0',
            pricing: {
              vatRate: '0',
              vatAmount: '0',
              costWithVat: '0',
              profitRate: '0',
              profitAmount: '0',
              priceBeforeRounding: '100',
              roundedSalePrice: '100',
            },
          },
        ],
        '',
      ),
    ).toThrow('Kredi kartı farkı (cardMarkupRate) eksik.');
  });
});
