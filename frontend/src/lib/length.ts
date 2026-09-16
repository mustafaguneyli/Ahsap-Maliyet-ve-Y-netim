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

/**
 * UI cm girdisini canonical mm stringine çevirir.
 * Number/float kullanmaz. "3,5" → "35", "4.7" → "47".
 */
export function cmInputToMmString(cm: string): string | null {
  const normalized = cm.trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  const [wholeRaw, fraction = ''] = normalized.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const first = fraction[0] ?? '0';
  const rest = fraction.slice(1).replace(/0+$/, '');
  const mmWhole = (BigInt(whole) * 10n + BigInt(first)).toString();
  return rest.length > 0 ? `${mmWhole}.${rest}` : mmWhole;
}

/** Canonical mm gösterimini cm olarak üretir. 35 → "3,5", 40 → "4". */
export function formatMmAsCmDisplay(mm: string | number): string {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(String(mm).trim());
  if (!match) return String(mm);

  const sign = match[1];
  const whole = match[2].replace(/^0+(?=\d)/, '') || '0';
  const fraction = match[3] ?? '';

  if (whole.length === 1) {
    const outFraction = `${whole}${fraction}`.replace(/0+$/, '');
    return `${sign}0${outFraction ? `,${outFraction}` : ''}`;
  }

  const newWhole = whole.slice(0, -1).replace(/^0+(?=\d)/, '') || '0';
  const newFraction = `${whole.slice(-1)}${fraction}`.replace(/0+$/, '');
  return `${sign}${newWhole}${newFraction ? `,${newFraction}` : ''}`;
}

/** Çıta ölçü etiketi: 10×2800 mm → "1×280 cm", 35×2800 mm → "3,5×280 cm". */
export function formatCitaPieceLabel(
  widthMm: string | number,
  lengthMm: string | number,
): string {
  return `${formatMmAsCmDisplay(widthMm)}×${formatMmAsCmDisplay(lengthMm)} cm`;
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
