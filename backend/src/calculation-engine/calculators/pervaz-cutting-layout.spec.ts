import { BadRequestException } from '@nestjs/common';
import {
  calculateKilcikTheoreticalQty,
  calculatePervazTheoreticalQty,
  KILCIK_CUT_SPECS,
  resolvePervazCuttingOrientation,
} from './pervaz-cutting-layout';

const SHEET_220_280 = { sheetWidthMm: 2200, sheetLengthMm: 2800 };
const SHEET_210_280 = { sheetWidthMm: 2100, sheetLengthMm: 2800 };

describe('resolvePervazCuttingOrientation', () => {
  it('220×280 + 7×220 → kesim kenarı 2800 (boy kısa kenara oturur)', () => {
    const o = resolvePervazCuttingOrientation(SHEET_220_280, 2200);
    expect(o.countSideMm).toBe(2800);
    expect(o.pieceAlongSideMm).toBe(2200);
    expect(o.sheetShortSideMm).toBe(2200);
    expect(o.sheetLongSideMm).toBe(2800);
  });

  it('220×280 + 9×250 → kesim kenarı 2200', () => {
    const o = resolvePervazCuttingOrientation(SHEET_220_280, 2500);
    expect(o.countSideMm).toBe(2200);
    expect(o.pieceAlongSideMm).toBe(2800);
  });

  it('220×280 + 10×280 → kesim kenarı 2200', () => {
    const o = resolvePervazCuttingOrientation(SHEET_220_280, 2800);
    expect(o.countSideMm).toBe(2200);
    expect(o.pieceAlongSideMm).toBe(2800);
  });

  it('210×280 + 10×220 → 220 kısa kenara sığmaz, kesim kenarı 2100', () => {
    const o = resolvePervazCuttingOrientation(SHEET_210_280, 2200);
    expect(o.countSideMm).toBe(2100);
    expect(o.pieceAlongSideMm).toBe(2800);
    expect(o.sheetShortSideMm).toBe(2100);
  });

  it('210×280 üzerinde 250 ve 280 boy da kısa 2100 kenardan sayılır', () => {
    expect(resolvePervazCuttingOrientation(SHEET_210_280, 2500).countSideMm).toBe(2100);
    expect(resolvePervazCuttingOrientation(SHEET_210_280, 2800).countSideMm).toBe(2100);
  });

  it('220 boyu körü körüne 2800 kullanmaz', () => {
    expect(resolvePervazCuttingOrientation(SHEET_220_280, 2200).countSideMm).toBe(2800);
    expect(resolvePervazCuttingOrientation(SHEET_210_280, 2200).countSideMm).toBe(2100);
  });
});

describe('calculatePervazTheoreticalQty', () => {
  it('220×280 + 7×220 → FLOOR(2800/70) = 40; bıçak payı yok', () => {
    const result = calculatePervazTheoreticalQty({
      ...SHEET_220_280,
      pieceWidthMm: 70,
      pieceLengthMm: 2200,
    });
    expect(result.orientation.countSideMm).toBe(2800);
    expect(result.cutPitchMm).toBe(70);
    expect(result.theoreticalQty).toBe(40);
    expect(result.rounding).toBe('FLOOR');
  });

  it('220×280 + 9×250 → kesim kenarı 2200', () => {
    const result = calculatePervazTheoreticalQty({
      ...SHEET_220_280,
      pieceWidthMm: 90,
      pieceLengthMm: 2500,
    });
    expect(result.orientation.countSideMm).toBe(2200);
    expect(result.theoreticalQty).toBe(24);
  });

  it('220×280 + 10×280 → kesim kenarı 2200', () => {
    const result = calculatePervazTheoreticalQty({
      ...SHEET_220_280,
      pieceWidthMm: 100,
      pieceLengthMm: 2800,
    });
    expect(result.orientation.countSideMm).toBe(2200);
    expect(result.theoreticalQty).toBe(22);
  });

  it('210×280 + 10×220 → kesim kenarı 2100, FLOOR(2100/100) = 21', () => {
    const result = calculatePervazTheoreticalQty({
      ...SHEET_210_280,
      pieceWidthMm: 100,
      pieceLengthMm: 2200,
    });
    expect(result.orientation.countSideMm).toBe(2100);
    expect(result.theoreticalQty).toBe(21);
  });
});

describe('calculateKilcikTheoreticalQty', () => {
  it('STANDARD 220 → FLOOR(2800/43)', () => {
    const result = calculateKilcikTheoreticalQty({
      ...SHEET_220_280,
      pieceLengthMm: 2200,
      pervazThicknessMm: 9,
      kilcikProfile: 'STANDARD',
    });
    expect(result.orientation.countSideMm).toBe(2800);
    expect(result.cutPitchMm).toBe(43);
    expect(result.nominalWidthMm).toBe(39);
    expect(result.bladeAllowanceMm).toBe(4);
    expect(result.theoreticalQty).toBe(Math.floor(2800 / 43));
  });

  it('STANDARD 250 → FLOOR(2200/43)', () => {
    const result = calculateKilcikTheoreticalQty({
      ...SHEET_220_280,
      pieceLengthMm: 2500,
      pervazThicknessMm: 12,
      kilcikProfile: 'STANDARD',
    });
    expect(result.orientation.countSideMm).toBe(2200);
    expect(result.theoreticalQty).toBe(Math.floor(2200 / 43));
  });

  it('STANDARD 280 → FLOOR(2200/43)', () => {
    const result = calculateKilcikTheoreticalQty({
      ...SHEET_220_280,
      pieceLengthMm: 2800,
      pervazThicknessMm: 16,
      kilcikProfile: 'STANDARD',
    });
    expect(result.orientation.countSideMm).toBe(2200);
    expect(result.theoreticalQty).toBe(Math.floor(2200 / 43));
  });

  it('WIDE 220 → FLOOR(2800/59)', () => {
    const result = calculateKilcikTheoreticalQty({
      ...SHEET_220_280,
      pieceLengthMm: 2200,
      pervazThicknessMm: 18,
      kilcikProfile: 'WIDE',
    });
    expect(result.orientation.countSideMm).toBe(2800);
    expect(result.cutPitchMm).toBe(59);
    expect(result.nominalWidthMm).toBe(55);
    expect(result.theoreticalQty).toBe(Math.floor(2800 / 59));
  });

  it('WIDE 250 → FLOOR(2200/59)', () => {
    expect(
      calculateKilcikTheoreticalQty({
        ...SHEET_220_280,
        pieceLengthMm: 2500,
        pervazThicknessMm: 14,
        kilcikProfile: 'WIDE',
      }).theoreticalQty,
    ).toBe(Math.floor(2200 / 59));
  });

  it('WIDE 280 → FLOOR(2200/59)', () => {
    expect(
      calculateKilcikTheoreticalQty({
        ...SHEET_220_280,
        pieceLengthMm: 2800,
        pervazThicknessMm: 18,
        kilcikProfile: 'WIDE',
      }).theoreticalQty,
    ).toBe(Math.floor(2200 / 59));
  });

  it('kılçık yönü ana pervaz ile aynıdır', () => {
    const pervaz = calculatePervazTheoreticalQty({
      ...SHEET_210_280,
      pieceWidthMm: 100,
      pieceLengthMm: 2200,
    });
    const kilcik = calculateKilcikTheoreticalQty({
      ...SHEET_210_280,
      pieceLengthMm: 2200,
      pervazThicknessMm: 12,
      kilcikProfile: 'STANDARD',
    });
    expect(kilcik.orientation.countSideMm).toBe(pervaz.orientation.countSideMm);
    expect(kilcik.orientation.countSideMm).toBe(2100);
    expect(kilcik.theoreticalQty).toBe(Math.floor(2100 / 43));
  });

  it('14 mm + STANDARD reddeder', () => {
    expect(() =>
      calculateKilcikTheoreticalQty({
        ...SHEET_220_280,
        pieceLengthMm: 2200,
        pervazThicknessMm: 14,
        kilcikProfile: 'STANDARD',
      }),
    ).toThrow(BadRequestException);
  });

  it('18 mm + STANDARD reddeder', () => {
    expect(() =>
      calculateKilcikTheoreticalQty({
        ...SHEET_220_280,
        pieceLengthMm: 2200,
        pervazThicknessMm: 18,
        kilcikProfile: 'STANDARD',
      }),
    ).toThrow(BadRequestException);
  });

  it('nominal en ile kesim aralığını ayırır', () => {
    expect(KILCIK_CUT_SPECS.STANDARD.nominalWidthMm).toBe(39);
    expect(KILCIK_CUT_SPECS.STANDARD.cutPitchMm).toBe(43);
    expect(KILCIK_CUT_SPECS.WIDE.nominalWidthMm).toBe(55);
    expect(KILCIK_CUT_SPECS.WIDE.cutPitchMm).toBe(59);
  });
});
