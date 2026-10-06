import { toDecimal } from '../../common/decimal/decimal.util';
import type Decimal from 'decimal.js';

export type CitaCommercialWidthBand = {
  displayName: '1–2 cm' | '3–4 cm' | '5–6 cm' | '7–8 cm';
  masterMinWidthMm: 10 | 30 | 50 | 70;
  masterMaxWidthMm: 20 | 40 | 60 | 80;
};

/**
 * Yalnız custom/manual en için ticari satış bandı.
 * DB master aralıkları (10–20, 30–40, 50–60, 70–80) değişmez.
 * 0 < widthMm <= 26 → 10–20, <= 46 → 30–40, <= 66 → 50–60, <= 86 → 70–80.
 * widthMm > 86 → null.
 */
export function classifyCitaCommercialWidthBand(
  widthMm: Decimal.Value,
): CitaCommercialWidthBand | null {
  const width = toDecimal(widthMm);
  if (!width.isFinite() || width.lte(0) || width.gt(86)) {
    return null;
  }
  if (width.lte(26)) {
    return {
      displayName: '1–2 cm',
      masterMinWidthMm: 10,
      masterMaxWidthMm: 20,
    };
  }
  if (width.lte(46)) {
    return {
      displayName: '3–4 cm',
      masterMinWidthMm: 30,
      masterMaxWidthMm: 40,
    };
  }
  if (width.lte(66)) {
    return {
      displayName: '5–6 cm',
      masterMinWidthMm: 50,
      masterMaxWidthMm: 60,
    };
  }
  return {
    displayName: '7–8 cm',
    masterMinWidthMm: 70,
    masterMaxWidthMm: 80,
  };
}
