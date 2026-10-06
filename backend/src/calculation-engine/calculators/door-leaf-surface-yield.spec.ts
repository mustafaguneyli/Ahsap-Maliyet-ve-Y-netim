import {
  calculateDoorLeafSurfaceYield,
  DoorLeafSurfaceRuleMissingError,
  listVerifiedDoorLeafSurfaceRules,
  resolveDoorLeafSurfaceRule,
} from './door-leaf-surface-yield';

describe('DoorLeafSurfaceYield', () => {
  it('doğrulanmış boy bandı özetlerini listeler', () => {
    const rules = listVerifiedDoorLeafSurfaceRules();
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.heightBand)).toEqual(['EXACT_210', 'UP_TO_250']);
    expect(rules[0].facesPerSheet).toBe(3);
    expect(rules[1].facesPerSheet).toBe(2);
  });

  it('210 cm boy: en bağımsız 3 yüzey/tabaka, 2 yüzey/kapı', () => {
    for (const widthMm of [900, 1000, 1200, 1500, 1700, 2000, 2300]) {
      const rule = resolveDoorLeafSurfaceRule(2100, widthMm);
      expect(rule.facesPerSheet).toBe(3);
      expect(rule.facesPerDoor).toBe(2);
      expect(rule.heightBand).toBe('EXACT_210');
      expect(rule.source).toBe('VERIFIED_PRODUCTION_RULE');
    }
  });

  it('>210–250 cm boy: en bağımsız 2 yüzey/tabaka', () => {
    for (const [heightMm, widthMm] of [
      [2200, 900],
      [2200, 1200],
      [2300, 1700],
      [2500, 900],
      [2500, 1200],
      [2500, 2000],
    ] as const) {
      const rule = resolveDoorLeafSurfaceRule(heightMm, widthMm);
      expect(rule.facesPerSheet).toBe(2);
      expect(rule.facesPerDoor).toBe(2);
      expect(rule.heightBand).toBe('UP_TO_250');
    }
  });

  it('210×90 / 1 kapı → 2 yüzey, 1 tabaka, 1 artık', () => {
    const result = calculateDoorLeafSurfaceYield({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 1,
    });
    expect(result.totalFaces).toBe(2);
    expect(result.requiredFullSheets).toBe(1);
    expect(result.unusedFaces).toBe(1);
    expect(result.theoreticalSheetsPerDoor).toBe('2/3');
  });

  it('210×90 / 3 kapı → 6 yüzey, 2 tabaka, 0 artık', () => {
    const result = calculateDoorLeafSurfaceYield({
      doorHeightMm: 2100,
      doorWidthMm: 900,
      quantity: 3,
    });
    expect(result.totalFaces).toBe(6);
    expect(result.requiredFullSheets).toBe(2);
    expect(result.unusedFaces).toBe(0);
  });

  it('250×90 / 1 kapı → 2 yüzey, 1 tabaka, 0 artık', () => {
    const result = calculateDoorLeafSurfaceYield({
      doorHeightMm: 2500,
      doorWidthMm: 900,
      quantity: 1,
    });
    expect(result.totalFaces).toBe(2);
    expect(result.requiredFullSheets).toBe(1);
    expect(result.unusedFaces).toBe(0);
    expect(result.theoreticalSheetsPerDoor).toBe('2/2');
  });

  it('250×120 / 3 kapı → 6 yüzey, 3 tabaka', () => {
    const result = calculateDoorLeafSurfaceYield({
      doorHeightMm: 2500,
      doorWidthMm: 1200,
      quantity: 3,
    });
    expect(result.totalFaces).toBe(6);
    expect(result.requiredFullSheets).toBe(3);
    expect(result.unusedFaces).toBe(0);
    expect(result.rule.facesPerSheet).toBe(2);
  });

  it('210 altı ve 250 üstü boyda kural uydurmaz', () => {
    expect(() => resolveDoorLeafSurfaceRule(2000, 900)).toThrow(
      DoorLeafSurfaceRuleMissingError,
    );
    expect(() =>
      calculateDoorLeafSurfaceYield({
        doorHeightMm: 2501,
        doorWidthMm: 900,
        quantity: 1,
      }),
    ).toThrow(/doğrulanmış yüzey kesim kuralı yok/);
  });

  it('geçersiz adedi reddeder', () => {
    expect(() =>
      calculateDoorLeafSurfaceYield({
        doorHeightMm: 2100,
        doorWidthMm: 900,
        quantity: 0,
      }),
    ).toThrow(/Kapı adedi/);
  });
});
