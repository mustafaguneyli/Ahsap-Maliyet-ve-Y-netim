import {
  CITA_CUSTOM_MEASURE_PRINCIPLE,
  CITA_CUT_RULE,
  CITA_FUTURE_COST_PRINCIPLE,
  CITA_SHEET_MM,
  CITA_STANDARD_FALLBACK_NET,
  CITA_SUPPORTED_THICKNESSES_MM,
} from './cita-cut-rule.fixture';
import { CITA_PRODUCT_SIZE_SEEDS } from './cita-product-seed';

describe('CITA cut-rule fixture (calculator yok)', () => {
  it('desteklenen kalınlıklar yalnız 10/12/14/16/18/22/30 mm ve 2100×2800 tabakadır', () => {
    expect([...CITA_SUPPORTED_THICKNESSES_MM]).toEqual([
      10, 12, 14, 16, 18, 22, 30,
    ]);
    expect(CITA_SHEET_MM).toEqual({ widthMm: 2100, lengthMm: 2800 });
    expect(CITA_CUT_RULE).toEqual({
      pieceLengthMm: 2800,
      kerfMm: 4,
      edgeWasteMm: 0,
    });
  });

  it('standart fallback NET tablosu FLOOR(2100 / (en+4)) örneklerini kilitler', () => {
    expect(CITA_STANDARD_FALLBACK_NET).toEqual([
      { widthMm: 10, effectiveCutPitchMm: 14, netQty: 150 },
      { widthMm: 20, effectiveCutPitchMm: 24, netQty: 87 },
      { widthMm: 30, effectiveCutPitchMm: 34, netQty: 61 },
      { widthMm: 40, effectiveCutPitchMm: 44, netQty: 47 },
      { widthMm: 50, effectiveCutPitchMm: 54, netQty: 38 },
      { widthMm: 60, effectiveCutPitchMm: 64, netQty: 32 },
      { widthMm: 70, effectiveCutPitchMm: 74, netQty: 28 },
      { widthMm: 80, effectiveCutPitchMm: 84, netQty: 25 },
    ]);

    for (const row of CITA_STANDARD_FALLBACK_NET) {
      const pitch = row.widthMm + CITA_CUT_RULE.kerfMm;
      expect(pitch).toBe(row.effectiveCutPitchMm);
      expect(Math.floor(CITA_SHEET_MM.widthMm / pitch)).toBe(row.netQty);
    }

    expect(CITA_STANDARD_FALLBACK_NET.map((row) => row.widthMm)).toEqual(
      CITA_PRODUCT_SIZE_SEEDS.map((size) => size.widthMm),
    );
  });

  it('özel ölçü ve maliyet prensibi master şişirmeyi yasaklar', () => {
    expect(CITA_CUSTOM_MEASURE_PRINCIPLE).toEqual({
      createsProductSize: false,
      createsProductionYield: false,
      usesRuntimeCutRule: true,
    });
    expect([...CITA_FUTURE_COST_PRINCIPLE.extraCostCodes]).toEqual([
      'CUTTING',
      'LABOR',
    ]);
    expect([...CITA_FUTURE_COST_PRINCIPLE.excludedExtraCostCodes]).toEqual([
      'GLUE',
      'OTHER',
    ]);
  });
});
