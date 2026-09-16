import { toDecimal } from '../../common/decimal/decimal.util';
import type { CitaMdfResult } from './cita-mdf-calculator';
import {
  calculateCitaProductionCost,
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
    sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: '2625' },
    mdfUnitCost: toDecimal('2625').div('53').toFixed(),
    ...overrides,
  };
}

describe('calculateCitaProductionCost', () => {
  it('CUTTING+LABOR varken productionCost = mdfUnitCost + 15 ve kâr alanı yok', () => {
    const base = mdf();
    const result = calculateCitaProductionCost({
      mdf: base,
      extraCosts: [
        { code: 'CUTTING', amount: '5' },
        { code: 'LABOR', amount: '10' },
      ],
    });

    expect(result.mdfUnitCost).toBe(base.mdfUnitCost);
    expect(result.extraCosts).toEqual([
      { code: 'CUTTING', amount: '5' },
      { code: 'LABOR', amount: '10' },
    ]);
    expect(result.extraCostsTotal).toBe('15');
    expect(result.productionCost).toBe(toDecimal(base.mdfUnitCost).plus(15).toFixed());
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
        { code: 'CUTTING', amount: '5' },
        { code: 'LABOR', amount: null },
      ],
    });

    expect(result.extraCosts).toEqual([{ code: 'CUTTING', amount: '5' }]);
    expect(result.productionCost).toBeNull();
    expect(result.extraCostsTotal).toBeNull();
    expect(result.missingExtraCosts).toEqual(['LABOR']);
    expect(result.statusCode).toBe(CITA_EXTRA_COST_MISSING);
  });

  it('MASTER ölçü aynı ExtraCost toplamını kullanır', () => {
    const base = mdf({
      widthMm: '40',
      cut: {
        bladeAllowanceMm: 4,
        countSideMm: 2100,
        effectiveCutPitchMm: '44',
      },
      productionYield: { netQty: 47, source: 'MASTER' },
      mdfUnitCost: toDecimal('2625').div('47').toFixed(),
    });
    const result = calculateCitaProductionCost({
      mdf: base,
      extraCosts: [
        { code: 'CUTTING', amount: '5' },
        { code: 'LABOR', amount: '10' },
      ],
    });
    expect(result.productionYield).toEqual({ netQty: 47, source: 'MASTER' });
    expect(result.productionCost).toBe(toDecimal(base.mdfUnitCost).plus(15).toFixed());
  });
});
