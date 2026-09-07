import { getExcelKilcikCutWidthMm } from './excel-kilcik-cut-profile';
import { resolveKilcikExcelQty, resolvePervazPieceQty } from './pervaz-qty-resolver';

const SHEET_220_280 = { sheetWidthMm: 2200, sheetLengthMm: 2800 };
const SHEET_210_280 = { sheetWidthMm: 2100, sheetLengthMm: 2800 };

describe('Excel kılçık kesim profili', () => {
  it('kalınlığa göre 42 / 42 / 45 / 50 / 55 verir; 43/59 değildir', () => {
    expect(getExcelKilcikCutWidthMm(9)).toBe(42);
    expect(getExcelKilcikCutWidthMm(12)).toBe(42);
    expect(getExcelKilcikCutWidthMm(14)).toBe(45);
    expect(getExcelKilcikCutWidthMm(16)).toBe(50);
    expect(getExcelKilcikCutWidthMm(18)).toBe(55);
  });
});

describe('resolveKilcikExcelQty — Excel NET ile eşleşen fallback', () => {
  const cases: Array<[number, number, number]> = [
    [9, 2200, 66],
    [9, 2500, 52],
    [9, 2300, 52],
    [9, 2550, 52],
    [12, 2200, 66],
    [12, 2500, 52],
    [14, 2200, 62],
    [14, 2500, 48],
    [16, 2200, 56],
    [16, 2500, 44],
    [18, 2200, 50],
    [18, 2500, 40],
  ];

  it.each(cases)('%s mm / %s → %s', (thickness, length, expected) => {
    const result = resolveKilcikExcelQty({
      ...SHEET_220_280,
      pervazThicknessMm: thickness,
      pieceLengthMm: length,
    });
    expect(result.source).toBe('CALCULATED_EXCEL_RULE');
    expect(result.netQty).toBe(expected);
    expect(result.calculatedQty).toBe(expected);
  });

  it('9 mm / yeni 2800 boy CALCULATED_EXCEL_RULE = 52', () => {
    const result = resolveKilcikExcelQty({
      ...SHEET_220_280,
      pervazThicknessMm: 9,
      pieceLengthMm: 2800,
    });
    expect(result.source).toBe('CALCULATED_EXCEL_RULE');
    expect(result.orientation.countSideMm).toBe(2200);
    expect(result.netQty).toBe(52);
  });

  it('9 mm 220 boy STANDARD 43 mm pitch (65) kullanmaz', () => {
    expect(
      resolveKilcikExcelQty({
        ...SHEET_220_280,
        pervazThicknessMm: 9,
        pieceLengthMm: 2200,
      }).netQty,
    ).toBe(66);
  });

  it('master varsa CALCULATED farklı olsa bile EXCEL_MASTER kazanır', () => {
    const result = resolveKilcikExcelQty({
      ...SHEET_220_280,
      pervazThicknessMm: 18,
      pieceLengthMm: 2200,
      masterNetQty: 50,
    });
    expect(result.source).toBe('EXCEL_MASTER');
    expect(result.netQty).toBe(50);
    expect(result.calculatedQty).toBe(50);
  });
});

describe('resolvePervazPieceQty — master önceliği', () => {
  it('12 mm 10×250 master 22 geometrik 21 olsa da EXCEL_MASTER kalır', () => {
    const result = resolvePervazPieceQty({
      ...SHEET_210_280,
      pieceWidthMm: 100,
      pieceLengthMm: 2500,
      masterNetQty: 22,
    });
    expect(result.calculatedQty).toBe(21);
    expect(result.netQty).toBe(22);
    expect(result.source).toBe('EXCEL_MASTER');
  });

  it('18 mm 10×250 master 21 geometrik 22 olsa da EXCEL_MASTER kalır', () => {
    const result = resolvePervazPieceQty({
      ...SHEET_220_280,
      pieceWidthMm: 100,
      pieceLengthMm: 2500,
      masterNetQty: 21,
    });
    expect(result.calculatedQty).toBe(22);
    expect(result.netQty).toBe(21);
    expect(result.source).toBe('EXCEL_MASTER');
  });

  it('master yoksa CALCULATED_EXCEL_RULE döner', () => {
    const result = resolvePervazPieceQty({
      ...SHEET_220_280,
      pieceWidthMm: 70,
      pieceLengthMm: 2300,
    });
    expect(result.source).toBe('CALCULATED_EXCEL_RULE');
    expect(result.orientation.countSideMm).toBe(2200);
    expect(result.netQty).toBe(31);
  });
});
