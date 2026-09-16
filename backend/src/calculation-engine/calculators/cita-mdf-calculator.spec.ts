import { toDecimal } from '../../common/decimal/decimal.util';
import { calculateCitaMdfCost, type CitaMdfInput } from './cita-mdf-calculator';

function baseInput(
  overrides: Partial<CitaMdfInput> & {
    productionYield: CitaMdfInput['productionYield'];
    sheetPrice: CitaMdfInput['sheetPrice'];
    rawMaterial: CitaMdfInput['rawMaterial'];
    thicknessMm: string;
    widthMm: string;
    cut: CitaMdfInput['cut'];
  },
): CitaMdfInput {
  return {
    productCode: 'CITA',
    lengthMm: '2800',
    ...overrides,
  };
}

describe('calculateCitaMdfCost', () => {
  it.each([
    {
      name: '10 mm / 10 mm MASTER 150',
      thicknessMm: '10',
      widthMm: '10',
      netQty: 150,
      source: 'MASTER' as const,
      pitch: '14',
      materialCode: 'MDF-10-2100X2800-ZIMPARALI',
      sheetPrice: '1880',
    },
    {
      name: '14 mm / 40 mm MASTER 47',
      thicknessMm: '14',
      widthMm: '40',
      netQty: 47,
      source: 'MASTER' as const,
      pitch: '44',
      materialCode: 'MDF-14-2100X2800-ZIMPARALI',
      sheetPrice: '2625',
    },
    {
      name: '18 mm / 80 mm MASTER 25',
      thicknessMm: '18',
      widthMm: '80',
      netQty: 25,
      source: 'MASTER' as const,
      pitch: '84',
      materialCode: 'MDF-18-2100X2800-ZIMPARALI',
      sheetPrice: '2800',
    },
    {
      name: '14 mm / 35 mm CALCULATED 53',
      thicknessMm: '14',
      widthMm: '35',
      netQty: 53,
      source: 'CALCULATED_CUT_RULE' as const,
      pitch: '39',
      materialCode: 'MDF-14-2100X2800-ZIMPARALI',
      sheetPrice: '2625',
    },
    {
      name: '12 mm / 25 mm CALCULATED 72',
      thicknessMm: '12',
      widthMm: '25',
      netQty: 72,
      source: 'CALCULATED_CUT_RULE' as const,
      pitch: '29',
      materialCode: 'MDF-12-2100X2800-ZIMPARALI',
      sheetPrice: '2185',
    },
    {
      name: '18 mm / 47 mm CALCULATED 41',
      thicknessMm: '18',
      widthMm: '47',
      netQty: 41,
      source: 'CALCULATED_CUT_RULE' as const,
      pitch: '51',
      materialCode: 'MDF-18-2100X2800-ZIMPARALI',
      sheetPrice: '2800',
    },
    {
      name: '30 mm / 65 mm CALCULATED 30',
      thicknessMm: '30',
      widthMm: '65',
      netQty: 30,
      source: 'CALCULATED_CUT_RULE' as const,
      pitch: '69',
      materialCode: 'MDF-30-2100X2800-ZIMPARALI',
      sheetPrice: '6500',
    },
  ])(
    '$name için mdfUnitCost = sheetPrice / netQty, ara yuvarlama yok',
    (row) => {
      const result = calculateCitaMdfCost(
        baseInput({
          thicknessMm: row.thicknessMm,
          widthMm: row.widthMm,
          rawMaterial: {
            code: row.materialCode,
            thicknessMm: row.thicknessMm,
            sheetWidthMm: 2100,
            sheetLengthMm: 2800,
          },
          cut: {
            bladeAllowanceMm: 4,
            countSideMm: 2100,
            effectiveCutPitchMm: row.pitch,
          },
          productionYield: { netQty: row.netQty, source: row.source },
          sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: row.sheetPrice },
        }),
      );

      expect(result.mdfUnitCost).toBe(
        toDecimal(row.sheetPrice).div(String(row.netQty)).toFixed(),
      );
      expect(result.productionYield).toEqual({
        netQty: row.netQty,
        source: row.source,
      });
      expect(result).not.toHaveProperty('extraCosts');
      expect(result).not.toHaveProperty('productionCost');
      expect(result).not.toHaveProperty('profit');
      expect(result).not.toHaveProperty('salePrice');
    },
  );

  it('18 mm NEOPAN fiyatını girdi olarak kabul etmez; ZIMPARALI kodunu korur', () => {
    const result = calculateCitaMdfCost(
      baseInput({
        thicknessMm: '18',
        widthMm: '80',
        rawMaterial: {
          code: 'MDF-18-2100X2800-ZIMPARALI',
          thicknessMm: '18',
          sheetWidthMm: 2100,
          sheetLengthMm: 2800,
        },
        cut: {
          bladeAllowanceMm: 4,
          countSideMm: 2100,
          effectiveCutPitchMm: '84',
        },
        productionYield: { netQty: 25, source: 'MASTER' },
        sheetPrice: { priceType: 'CARD_INSTALLMENT', amount: '2800' },
      }),
    );
    expect(result.rawMaterial.code).toBe('MDF-18-2100X2800-ZIMPARALI');
    expect(result.rawMaterial.code).not.toContain('NEOPAN');
    expect(result.rawMaterial.code).not.toContain('MEMBRANLIK');
  });
});
