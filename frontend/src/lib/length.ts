/**
 * Canonical internal birim: MM.
 * UI tabaka ölçülerini CM gösterir/girer; kalınlık doğrudan MM'dir.
 */

export function cmToMm(cm: number): number {
  if (!Number.isFinite(cm)) {
    throw new Error('Geçersiz cm değeri.');
  }
  return cm * 10;
}

export function mmToCm(mm: number): number {
  if (!Number.isFinite(mm)) {
    throw new Error('Geçersiz mm değeri.');
  }
  return mm / 10;
}

/** Örn. 2100 mm × 2800 mm → "210 × 280 cm" */
export function formatSheetSizeCm(sheetWidthMm: number, sheetLengthMm: number): string {
  return `${mmToCm(sheetWidthMm)} × ${mmToCm(sheetLengthMm)} cm`;
}
