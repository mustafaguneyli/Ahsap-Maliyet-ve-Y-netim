import { toDecimal } from '../../common/decimal/decimal.util';
import type Decimal from 'decimal.js';

export type CitaCommercialWidthBand = {
  displayName: '1–2 cm' | '3–4 cm' | '5–6 cm' | '7–8 cm';
  masterMinWidthMm: 10 | 30 | 50 | 70;
  masterMaxWidthMm: 20 | 40 | 60 | 80;
};

/**
 * Custom/standart en için ticari satış bandı.
 * DB master aralığını (10–20, 30–40, …) değiştirmez; yalnız hangi master’ın
 * seçileceğini belirler. widthMm > 80 → null.
 */
export function classifyCitaCommercialWidthBand(
  widthMm: Decimal.Value,
): CitaCommercialWidthBand | null {
  const width = toDecimal(widthMm);
  if (!width.isFinite() || width.lte(0) || width.gt(80)) {
    return null;
  }
  if (width.lte(20)) {
    return {
      displayName: '1–2 cm',
      masterMinWidthMm: 10,
      masterMaxWidthMm: 20,
    };
  }
  if (width.lte(40)) {
    return {
      displayName: '3–4 cm',
      masterMinWidthMm: 30,
      masterMaxWidthMm: 40,
    };
  }
  if (width.lte(60)) {
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
