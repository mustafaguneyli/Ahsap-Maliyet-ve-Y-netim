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

/** Örn. 100 mm × 2100 mm → "10 × 210 cm" */
export function formatPieceSizeCm(pieceWidthMm: number, pieceLengthMm: number): string {
  return `${mmToCm(pieceWidthMm)} × ${mmToCm(pieceLengthMm)} cm`;
}

/** Dropdown etiketi: "22 MM MDF – 210×280 – Zımparalı" */
export function formatRawMaterialOptionLabel(input: {
  thicknessMm: string | number;
  sheetWidthMm: number;
  sheetLengthMm: number;
  surfaceType?: string | null;
  name?: string;
}): string {
  const thickness = String(input.thicknessMm);
  const sheet = `${mmToCm(input.sheetWidthMm)}×${mmToCm(input.sheetLengthMm)}`;
  const surface = input.surfaceType?.trim();
  if (surface) {
    return `${thickness} MM MDF – ${sheet} – ${surface}`;
  }
  return input.name?.trim() || `${thickness} MM MDF – ${sheet}`;
}
