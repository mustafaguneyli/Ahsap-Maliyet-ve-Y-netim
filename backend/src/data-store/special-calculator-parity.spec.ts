import { DoorFrameCalculator } from '../calculation-engine/calculators/door-frame-calculator';

describe('special calculator Firestore canonical input parity', () => {
  it('DoorFrame aynı NET/fiyat string’iyle aynı unitCost üretir; iş kuralı değişmez', () => {
    const calculator = new DoorFrameCalculator();
    const part = (
      sheetPrice: string,
      thicknessMm: string,
      netQty: number,
      rawMaterialId: string,
    ) => ({
      thicknessMm,
      rawMaterialId,
      rawMaterialCode: `MDF-${rawMaterialId}`,
      rawMaterialName: `${thicknessMm} mm`,
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      sheetPrice,
      netQty,
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
    });
    const [plain] = calculator.calculateMdfCosts([
      {
        widthCm: 10,
        lengthCm: 210,
        displayName: '10x210',
        parts: [part('1885', '22', 13, 'm22'), part('1200', '12', 24, 'm12')],
      },
    ]);
    const [canonical] = calculator.calculateMdfCosts([
      {
        widthCm: 10,
        lengthCm: 210,
        displayName: '10x210',
        parts: [part('1885.0000', '22.00', 13, 'm22'), part('1200.0000', '12.00', 24, 'm12')],
      },
    ]);
    expect(canonical.mdfCost).toBe(plain.mdfCost);
    expect(canonical.parts[0].unitCost).toBe(plain.parts[0].unitCost);
    expect(canonical.parts[1].unitCost).toBe(plain.parts[1].unitCost);
  });
});
