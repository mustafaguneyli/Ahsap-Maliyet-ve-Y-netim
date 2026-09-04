import { toDecimal } from '../../common/decimal/decimal.util';
import {
  DoorFrameCalculator,
  DoorFrameSizeCostInput,
  DoorFrameSizeCostPricedResult,
} from './door-frame-calculator';
import {
  DOOR_FRAME_MATERIAL_CODES,
  formatDoorFrameSizeLabel,
  getSecondary12MaterialCode,
} from './door-frame-variants';
import {
  DOOR_FRAME_EXCEL_GOLDEN_30_MM,
  DOOR_FRAME_EXCEL_GOLDEN_34_MM,
  DOOR_FRAME_EXCEL_GOLDEN_INPUTS,
  DoorFrameExcelGoldenRow,
} from './fixtures/door-frame-excel-golden.fixture';

/**
 * Excel float vs Decimal: ara değerler için göreli/mutlak tolerans.
 * Yuvarlanmış satış tam eşleşmeli (ε yok).
 */
const INTERMEDIATE_ABS_EPS = toDecimal('1e-9');
const INTERMEDIATE_REL_EPS = toDecimal('1e-12');

function decimalsClose(actual: string, expected: string): boolean {
  const a = toDecimal(actual);
  const e = toDecimal(expected);
  const diff = a.minus(e).abs();
  if (diff.lte(INTERMEDIATE_ABS_EPS)) return true;
  const scale = e.abs().eq(0) ? toDecimal(1) : e.abs();
  return diff.div(scale).lte(INTERMEDIATE_REL_EPS);
}

function failMsg(
  variant: string,
  widthCm: number,
  lengthCm: number,
  field: string,
  expected: string | number,
  actual: string | number,
): string {
  return (
    `Excel golden uyuşmazlığı: ${variant} ${widthCm}x${lengthCm} alan=${field} ` +
    `excel=${expected} sistem=${actual}`
  );
}

function assertClose(
  variant: string,
  row: DoorFrameExcelGoldenRow,
  field: string,
  actual: string,
  expected: string,
): void {
  if (!decimalsClose(actual, expected)) {
    throw new Error(failMsg(variant, row.widthCm, row.lengthCm, field, expected, actual));
  }
}

function assertExact(
  variant: string,
  row: DoorFrameExcelGoldenRow,
  field: string,
  actual: string | number,
  expected: string | number,
): void {
  if (String(actual) !== String(expected)) {
    throw new Error(failMsg(variant, row.widthCm, row.lengthCm, field, expected, actual));
  }
}

function buildSizeInput(
  variant: '34_MM' | '30_MM',
  golden: DoorFrameExcelGoldenRow,
): DoorFrameSizeCostInput {
  const inputs = DOOR_FRAME_EXCEL_GOLDEN_INPUTS;
  const primaryCode =
    variant === '34_MM'
      ? DOOR_FRAME_MATERIAL_CODES.PRIMARY_22
      : DOOR_FRAME_MATERIAL_CODES.PRIMARY_18;
  const primaryPrice = variant === '34_MM' ? inputs.price22 : inputs.price18;
  const primaryThickness = variant === '34_MM' ? '22' : '18';
  const secondaryCode = getSecondary12MaterialCode(golden.widthCm, golden.lengthCm);
  const secondaryPrice =
    secondaryCode === DOOR_FRAME_MATERIAL_CODES.SECONDARY_12_220
      ? inputs.price12_220
      : inputs.price12_210;
  const secondarySheetWidth =
    secondaryCode === DOOR_FRAME_MATERIAL_CODES.SECONDARY_12_220 ? 2200 : 2100;

  return {
    widthCm: golden.widthCm,
    lengthCm: golden.lengthCm,
    displayName: formatDoorFrameSizeLabel(golden.widthCm, golden.lengthCm),
    parts: [
      {
        thicknessMm: primaryThickness,
        rawMaterialId: `fixture-${primaryCode}`,
        rawMaterialCode: primaryCode,
        rawMaterialName: `${primaryThickness} MM MDF`,
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        sheetPrice: primaryPrice,
        netQty: golden.netPrimary,
        pieceWidthMm: golden.widthCm * 10,
        pieceLengthMm: golden.lengthCm * 10,
      },
      {
        thicknessMm: '12',
        rawMaterialId: `fixture-${secondaryCode}`,
        rawMaterialCode: secondaryCode,
        rawMaterialName: '12 MM MDF',
        sheetWidthMm: secondarySheetWidth,
        sheetLengthMm: 2800,
        sheetPrice: secondaryPrice,
        netQty: golden.netSecondary,
        pieceWidthMm: golden.widthCm * 10,
        pieceLengthMm: golden.lengthCm * 10,
      },
    ],
  };
}

function assertGoldenRow(
  variant: '34_MM' | '30_MM',
  golden: DoorFrameExcelGoldenRow,
  actual: DoorFrameSizeCostPricedResult,
): void {
  const primary = actual.parts[0];
  const secondary = actual.parts[1];

  assertExact(variant, golden, 'netPrimary', primary.netQty, golden.netPrimary);
  assertExact(variant, golden, 'netSecondary', secondary.netQty, golden.netSecondary);
  assertClose(variant, golden, 'unitCostPrimary', primary.unitCost, golden.unitCostPrimary);
  assertClose(
    variant,
    golden,
    'unitCostSecondary',
    secondary.unitCost,
    golden.unitCostSecondary,
  );
  assertClose(variant, golden, 'mdfCost', actual.mdfCost, golden.mdfCost);
  assertClose(
    variant,
    golden,
    'extraCosts.total',
    actual.extraCosts.total,
    golden.extraCostsTotal,
  );
  assertClose(variant, golden, 'productionCost', actual.productionCost, golden.productionCost);
  assertExact(variant, golden, 'vatRate', actual.pricing.vatRate, golden.vatRate);
  assertClose(variant, golden, 'vatAmount', actual.pricing.vatAmount, golden.vatAmount);
  assertClose(variant, golden, 'costWithVat', actual.pricing.costWithVat, golden.costWithVat);
  assertExact(variant, golden, 'profitRate', actual.pricing.profitRate, golden.profitRate);
  assertClose(variant, golden, 'profitAmount', actual.pricing.profitAmount, golden.profitAmount);
  assertClose(
    variant,
    golden,
    'priceBeforeRounding',
    actual.pricing.priceBeforeRounding,
    golden.priceBeforeRounding,
  );
  assertExact(
    variant,
    golden,
    'roundedSalePrice',
    actual.pricing.roundedSalePrice,
    golden.roundedSalePrice,
  );
}

function runVariantGolden(
  variant: '34_MM' | '30_MM',
  goldens: DoorFrameExcelGoldenRow[],
  vatRate: string,
  profitRate: string,
): void {
  const calculator = new DoorFrameCalculator();
  const sizes = goldens.map((g) => buildSizeInput(variant, g));
  const results = calculator.calculateCostsWithProfit(
    sizes,
    { ...DOOR_FRAME_EXCEL_GOLDEN_INPUTS.extras },
    vatRate,
    profitRate,
    DOOR_FRAME_EXCEL_GOLDEN_INPUTS.cardMarkupRate,
  );

  expect(results).toHaveLength(goldens.length);

  for (let i = 0; i < goldens.length; i += 1) {
    const golden = goldens[i];
    const actual = results[i];
    expect(actual.displayName).toBe(
      formatDoorFrameSizeLabel(golden.widthCm, golden.lengthCm),
    );
    assertGoldenRow(variant, golden, actual);
  }
}

describe('DoorFrameCalculator Excel golden regression (DB yok)', () => {
  it(`34_MM: ${DOOR_FRAME_EXCEL_GOLDEN_34_MM.length} ölçü Excel ile birebir`, () => {
    expect(DOOR_FRAME_EXCEL_GOLDEN_34_MM).toHaveLength(24);
    runVariantGolden('34_MM', DOOR_FRAME_EXCEL_GOLDEN_34_MM, '0', '20');
  });

  it(`30_MM: ${DOOR_FRAME_EXCEL_GOLDEN_30_MM.length} ölçü Excel ile birebir`, () => {
    expect(DOOR_FRAME_EXCEL_GOLDEN_30_MM).toHaveLength(8);
    runVariantGolden('30_MM', DOOR_FRAME_EXCEL_GOLDEN_30_MM, '10', '20');
  });

  it('özel ölçüler ve 22×210=655 golden içinde', () => {
    const keys = DOOR_FRAME_EXCEL_GOLDEN_34_MM.map((r) => `${r.widthCm}x${r.lengthCm}`);
    for (const special of ['14x220', '14x230', '15x215', '16x235', '20x230', '22x215', '22x210']) {
      expect(keys).toContain(special);
    }
    const row22 = DOOR_FRAME_EXCEL_GOLDEN_34_MM.find(
      (r) => r.widthCm === 22 && r.lengthCm === 210,
    );
    expect(row22?.roundedSalePrice).toBe('655');
  });

  it('toplam 32 golden senaryo', () => {
    expect(
      DOOR_FRAME_EXCEL_GOLDEN_34_MM.length + DOOR_FRAME_EXCEL_GOLDEN_30_MM.length,
    ).toBe(32);
  });
});
