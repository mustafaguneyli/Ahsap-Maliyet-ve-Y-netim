import { BadRequestException } from '@nestjs/common';
import { calculateDoorFrameSuggestedQty } from './production-yield-calculator';

describe('calculateDoorFrameSuggestedQty', () => {
  const sheet210x280 = {
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
  };

  describe('22 mm ana parça', () => {
    it('10×210 → 26', () => {
      const result = calculateDoorFrameSuggestedQty({
        ...sheet210x280,
        thicknessMm: 22,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      });
      expect(result.calculatedQty).toBe(26);
      expect(result.calculation.sheetCutSideMm).toBe(2800);
      expect(result.calculation.effectivePieceWidthMm).toBe(105);
      expect(result.calculation.rounding).toBe('FLOOR');
    });

    it('11×210 → 24', () => {
      expect(
        calculateDoorFrameSuggestedQty({
          ...sheet210x280,
          thicknessMm: 22,
          pieceWidthMm: 110,
          pieceLengthMm: 2100,
        }).calculatedQty,
      ).toBe(24);
    });

    it('12×210 → 22', () => {
      expect(
        calculateDoorFrameSuggestedQty({
          ...sheet210x280,
          thicknessMm: 22,
          pieceWidthMm: 120,
          pieceLengthMm: 2100,
        }).calculatedQty,
      ).toBe(22);
    });

    it('14×210 → 19', () => {
      expect(
        calculateDoorFrameSuggestedQty({
          ...sheet210x280,
          thicknessMm: 22,
          pieceWidthMm: 140,
          pieceLengthMm: 2100,
        }).calculatedQty,
      ).toBe(19);
    });

    it('14×220 özel yön: 2100 mm kesim tarafı', () => {
      const result = calculateDoorFrameSuggestedQty({
        ...sheet210x280,
        thicknessMm: 22,
        pieceWidthMm: 140,
        pieceLengthMm: 2200,
      });
      expect(result.calculation.sheetCutSideMm).toBe(2100);
      expect(result.calculation.sheetShortSideMm).toBe(2100);
      expect(result.calculatedQty).toBe(14); // floor(2100/145)
    });
  });

  describe('18 mm ana parça', () => {
    it('10×210 → 26 (aynı +5 mm kuralı)', () => {
      expect(
        calculateDoorFrameSuggestedQty({
          ...sheet210x280,
          thicknessMm: 18,
          pieceWidthMm: 100,
          pieceLengthMm: 2100,
        }).calculatedQty,
      ).toBe(26);
    });
  });

  describe('12 mm ikinci parça', () => {
    it('10×210 → 46', () => {
      const result = calculateDoorFrameSuggestedQty({
        ...sheet210x280,
        thicknessMm: 12,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      });
      expect(result.calculatedQty).toBe(46);
      expect(result.calculation.effectivePieceWidthMm).toBe(60);
      expect(result.calculation.rule).toBe('SECONDARY_MINUS_40MM');
    });

    it('11×210 → 40', () => {
      expect(
        calculateDoorFrameSuggestedQty({
          ...sheet210x280,
          thicknessMm: 12,
          pieceWidthMm: 110,
          pieceLengthMm: 2100,
        }).calculatedQty,
      ).toBe(40);
    });

    it('12×210 → 35', () => {
      expect(
        calculateDoorFrameSuggestedQty({
          ...sheet210x280,
          thicknessMm: 12,
          pieceWidthMm: 120,
          pieceLengthMm: 2100,
        }).calculatedQty,
      ).toBe(35);
    });

    it('14×210 → 28', () => {
      expect(
        calculateDoorFrameSuggestedQty({
          ...sheet210x280,
          thicknessMm: 12,
          pieceWidthMm: 140,
          pieceLengthMm: 2100,
        }).calculatedQty,
      ).toBe(28);
    });

    it('pieceWidth <= 40 mm reddeder', () => {
      expect(() =>
        calculateDoorFrameSuggestedQty({
          ...sheet210x280,
          thicknessMm: 12,
          pieceWidthMm: 40,
          pieceLengthMm: 2100,
        }),
      ).toThrow(BadRequestException);
    });
  });

  it('desteklenmeyen kalınlık reddeder', () => {
    expect(() =>
      calculateDoorFrameSuggestedQty({
        ...sheet210x280,
        thicknessMm: 16,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      }),
    ).toThrow(BadRequestException);
  });

  it('hiçbir yöne sığmayan parça reddeder', () => {
    expect(() =>
      calculateDoorFrameSuggestedQty({
        ...sheet210x280,
        thicknessMm: 22,
        pieceWidthMm: 100,
        pieceLengthMm: 3000,
      }),
    ).toThrow(BadRequestException);
  });
});
