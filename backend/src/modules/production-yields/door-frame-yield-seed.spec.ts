import { buildDoorFrameYieldSeedRows } from './door-frame-yield-seed-data';

describe('buildDoorFrameYieldSeedRows', () => {
  const { rows, sourceConflicts } = buildDoorFrameYieldSeedRows();

  it('kaynak çelişkisi üretmez', () => {
    expect(sourceConflicts).toEqual([]);
  });

  it('beklenen tekil ProductionYield sayısını üretir (56)', () => {
    // 22mm:24 + 12mm-210:21 + 12mm-220:3 + 18mm:8 = 56
    expect(rows).toHaveLength(56);
  });

  it('ortak 12mm 10x210 tek kayıttır (46)', () => {
    const matches = rows.filter(
      (r) =>
        r.materialCode === 'MDF-12-2100X2800-ZIMPARALI' &&
        r.pieceWidthMm === 100 &&
        r.pieceLengthMm === 2100,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].netQty).toBe(46);
    expect(matches[0].source).toBe('34MM+30MM');
  });

  it('özel 12mm 220×280 eşleşmelerini doğru bağlar', () => {
    const specials = [
      { w: 140, l: 2200, net: 22 },
      { w: 140, l: 2300, net: 21 },
      { w: 150, l: 2150, net: 19 },
    ];
    for (const s of specials) {
      const row = rows.find(
        (r) =>
          r.materialCode === 'MDF-12-2200X2800-ZIMPARALI' &&
          r.pieceWidthMm === s.w &&
          r.pieceLengthMm === s.l,
      );
      expect(row?.netQty).toBe(s.net);
    }

    expect(
      rows.some(
        (r) =>
          r.materialCode === 'MDF-12-2100X2800-ZIMPARALI' &&
          r.pieceWidthMm === 140 &&
          r.pieceLengthMm === 2200,
      ),
    ).toBe(false);
  });

  it('34mm 22mm ve 30mm 18mm örneklerini içerir', () => {
    expect(
      rows.find(
        (r) =>
          r.materialCode === 'MDF-22-2100X2800-ZIMPARALI' &&
          r.pieceWidthMm === 100 &&
          r.pieceLengthMm === 2100,
      )?.netQty,
    ).toBe(26);

    expect(
      rows.find(
        (r) =>
          r.materialCode === 'MDF-18-2100X2800-ZIMPARALI' &&
          r.pieceWidthMm === 160 &&
          r.pieceLengthMm === 2100,
      )?.netQty,
    ).toBe(16);
  });

  it('Neopan 18mm kullanmaz', () => {
    expect(rows.every((r) => !r.materialCode.includes('NEOPAN'))).toBe(true);
  });
});
