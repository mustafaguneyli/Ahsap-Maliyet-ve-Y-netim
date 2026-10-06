import { toDecimal } from '../../common/decimal/decimal.util';
import type { CitaMdfResult } from './cita-mdf-calculator';
import {
  calculateCitaProductionCost,
  CITA_CUTTING_BATCH_QTY,
  CITA_EXTRA_COST_MISSING,
} from './cita-production-calculator';

function mdf(overrides: Partial<CitaMdfResult> = {}): CitaMdfResult {
  return {
    productCode: 'CITA',
    thicknessMm: '14',
    widthMm: '35',
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
      effectiveCutPitchMm: '39',
    },
    productionYield: { netQty: 53, source: 'CALCULATED_CUT_RULE' },
    materialPriceType: 'CARD_INSTALLMENT',
    sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: '2625' },
    mdfUnitCost: toDecimal('2625').div('53').toFixed(),
    ...overrides,
  };
}

describe('calculateCitaProductionCost', () => {
  it('CUTTING 250-parça toplamıdır; birim kesim = CUTTING/250', () => {
    expect(CITA_CUTTING_BATCH_QTY).toBe(250);

    const cases = [
      { batch: '250', unit: '1' },
      { batch: '500', unit: '2' },
      { batch: '375', unit: '1.5' },
    ];

    for (const example of cases) {
      const result = calculateCitaProductionCost({
        mdf: mdf(),
        extraCosts: [
          { code: 'CUTTING', amount: example.batch },
          { code: 'LABOR', amount: '10' },
        ],
      });
      expect(result.extraCosts).toEqual([
        { code: 'CUTTING', amount: example.batch },
        { code: 'LABOR', amount: '10' },
      ]);
      expect(result.cuttingBatchCost).toBe(example.batch);
      expect(result.cuttingUnitCost).toBe(example.unit);
      expect(result.extraCostsTotal).toBe(
        toDecimal(example.unit).plus(10).toFixed(),
      );
    }
  });

  it('CUTTING=250 LABOR=10 iken productionCost = mdfUnitCost + 11 ve kâr alanı yok', () => {
    const base = mdf();
    const result = calculateCitaProductionCost({
      mdf: base,
      extraCosts: [
        { code: 'CUTTING', amount: '250' },
        { code: 'LABOR', amount: '10' },
      ],
    });

    expect(result.mdfUnitCost).toBe(base.mdfUnitCost);
    expect(result.extraCosts).toEqual([
      { code: 'CUTTING', amount: '250' },
      { code: 'LABOR', amount: '10' },
    ]);
    expect(result.cuttingBatchCost).toBe('250');
    expect(result.cuttingUnitCost).toBe('1');
    expect(result.extraCostsTotal).toBe('11');
    expect(result.productionCost).toBe(toDecimal(base.mdfUnitCost).plus(11).toFixed());
    expect(result.extraCostsAvailable).toBe(true);
    expect(result.missingExtraCosts).toEqual([]);
    expect(result.statusCode).toBeNull();
    expect(result).not.toHaveProperty('profit');
    expect(result).not.toHaveProperty('salePrice');
  });

  it('ikisi de yoksa EXTRA_COST_MISSING, mdfUnitCost kalır, productionCost null', () => {
    const base = mdf();
    const result = calculateCitaProductionCost({
      mdf: base,
      extraCosts: [
        { code: 'CUTTING', amount: null },
        { code: 'LABOR', amount: null },
      ],
    });

    expect(result.mdfUnitCost).toBe(base.mdfUnitCost);
    expect(result.extraCosts).toEqual([]);
    expect(result.cuttingBatchCost).toBeNull();
    expect(result.cuttingUnitCost).toBeNull();
    expect(result.extraCostsTotal).toBeNull();
    expect(result.productionCost).toBeNull();
    expect(result.extraCostsAvailable).toBe(false);
    expect(result.missingExtraCosts).toEqual(['CUTTING', 'LABOR']);
    expect(result.statusCode).toBe(CITA_EXTRA_COST_MISSING);
  });

  it('yalnız CUTTING varsa LABOR eksikliği açık, productionCost null', () => {
    const result = calculateCitaProductionCost({
      mdf: mdf(),
      extraCosts: [
        { code: 'CUTTING', amount: '250' },
        { code: 'LABOR', amount: null },
      ],
    });

    expect(result.extraCosts).toEqual([{ code: 'CUTTING', amount: '250' }]);
    expect(result.cuttingBatchCost).toBe('250');
    expect(result.cuttingUnitCost).toBe('1');
    expect(result.productionCost).toBeNull();
    expect(result.extraCostsTotal).toBeNull();
    expect(result.missingExtraCosts).toEqual(['LABOR']);
    expect(result.statusCode).toBe(CITA_EXTRA_COST_MISSING);
  });

  it('standard 14/40 ve custom 14/35 aynı birim kesimi kullanır', () => {
    const extras = [
      { code: 'CUTTING', amount: '250' },
      { code: 'LABOR', amount: '10' },
    ];
    const custom = mdf();
    const standard = mdf({
      widthMm: '40',
      cut: {
        bladeAllowanceMm: 4,
        countSideMm: 2100,
        effectiveCutPitchMm: '44',
      },
      productionYield: { netQty: 47, source: 'MASTER' },
      mdfUnitCost: toDecimal('2625').div('47').toFixed(),
    });
    const customResult = calculateCitaProductionCost({ mdf: custom, extraCosts: extras });
    const standardResult = calculateCitaProductionCost({
      mdf: standard,
      extraCosts: extras,
    });

    expect(customResult.cuttingUnitCost).toBe('1');
    expect(standardResult.cuttingUnitCost).toBe('1');
    expect(customResult.extraCostsTotal).toBe('11');
    expect(standardResult.extraCostsTotal).toBe('11');
    expect(standardResult.productionYield).toEqual({ netQty: 47, source: 'MASTER' });
    expect(standardResult.productionCost).toBe(
      toDecimal(standard.mdfUnitCost).plus(11).toFixed(),
    );
    expect(customResult.productionCost).toBe(
      toDecimal(custom.mdfUnitCost).plus(11).toFixed(),
    );
  });
});
