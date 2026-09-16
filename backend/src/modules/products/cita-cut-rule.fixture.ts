/**
 * Çıta üretim / maliyet prensipleri — yalnız dokümantasyon ve test kilidi.
 * Bu dosya calculator, ExtraCost, ProductionYield veya ProductSize şişirme
 * implementasyonu değildir.
 */

export const CITA_SUPPORTED_THICKNESSES_MM = [
  10, 12, 14, 16, 18, 22, 30,
] as const;

export const CITA_SHEET_MM = {
  widthMm: 2100,
  lengthMm: 2800,
} as const;

export const CITA_CUT_RULE = {
  pieceLengthMm: 2800,
  kerfMm: 4,
  edgeWasteMm: 0,
} as const;

/**
 * Doğrulanmış standart NET (1–8 cm ProductSize için ProductionYield seed edilir):
 * effectiveCutPitchMm = exactWidthMm + 4
 * netQty = FLOOR(2100 / effectiveCutPitchMm)
 *
 * Parça 2800 mm yönüne oturur; adet 2100 mm kısa kenardan çıkar.
 * Custom en bu tabloda yoktur; runtime calculator cut rule ile NET üretir.
 */
export const CITA_STANDARD_FALLBACK_NET = [
  { widthMm: 10, effectiveCutPitchMm: 14, netQty: 150 },
  { widthMm: 20, effectiveCutPitchMm: 24, netQty: 87 },
  { widthMm: 30, effectiveCutPitchMm: 34, netQty: 61 },
  { widthMm: 40, effectiveCutPitchMm: 44, netQty: 47 },
  { widthMm: 50, effectiveCutPitchMm: 54, netQty: 38 },
  { widthMm: 60, effectiveCutPitchMm: 64, netQty: 32 },
  { widthMm: 70, effectiveCutPitchMm: 74, netQty: 28 },
  { widthMm: 80, effectiveCutPitchMm: 84, netQty: 25 },
] as const;

/**
 * Özel ölçü (ör. 14 mm / 35×2800) otomatik ProductSize veya ProductionYield
 * oluşturmaz. Runtime calculator doğrulanmış kesim kuralıyla NET üretecek.
 * Standart 1–8 cm ölçüler ProductSize olarak bulunabilir.
 */
export const CITA_CUSTOM_MEASURE_PRINCIPLE = {
  createsProductSize: false,
  createsProductionYield: false,
  usesRuntimeCutRule: true,
} as const;

/**
 * Gelecek temel maliyet (bu fazda ExtraCost oluşturulmaz):
 * mdfUnitCost = activeSheetPrice / netQty
 * productionCost = mdfUnitCost + CUTTING + LABOR
 * GLUE / OTHER / boya / kaplama yok.
 */
export const CITA_FUTURE_COST_PRINCIPLE = {
  extraCostCodes: ['CUTTING', 'LABOR'] as const,
  excludedExtraCostCodes: ['GLUE', 'OTHER'] as const,
} as const;
