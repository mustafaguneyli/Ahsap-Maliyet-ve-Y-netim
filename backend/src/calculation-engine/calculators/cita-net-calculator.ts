import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { decimalToString, toDecimal } from '../../common/decimal/decimal.util';
import {
  CITA_CUT_RULE,
  CITA_SHEET_MM,
  CITA_SUPPORTED_THICKNESSES_MM,
} from '../../modules/products/cita-cut-rule.fixture';
import { CITA_PRODUCT_SEED } from '../../modules/products/cita-product-seed';

export const CITA_NET_PRODUCT_CODE = CITA_PRODUCT_SEED.code;

export const CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM = {
  10: 'MDF-10-2100X2800-ZIMPARALI',
  12: 'MDF-12-2100X2800-ZIMPARALI',
  14: 'MDF-14-2100X2800-ZIMPARALI',
  16: 'MDF-16-2100X2800-ZIMPARALI',
  18: 'MDF-18-2100X2800-ZIMPARALI',
  22: 'MDF-22-2100X2800-ZIMPARALI',
  30: 'MDF-30-2100X2800-ZIMPARALI',
} as const;

export const CITA_NET_FORBIDDEN_MATERIAL_CODES = [
  'MDF-18-2100X2800-ZIMPARALI-NEOPAN',
  'MDF-18-2100X2800-TEK-YUZ-MEMBRANLIK-4',
  'MDF-22-UI-TEST',
] as const;

export type CitaSupportedThicknessMm =
  (typeof CITA_SUPPORTED_THICKNESSES_MM)[number];

export type CitaNetSource = 'MASTER' | 'CALCULATED_CUT_RULE';

export type CitaCutRuleNet = {
  widthMm: Decimal;
  bladeAllowanceMm: number;
  countSideMm: number;
  effectiveCutPitchMm: Decimal;
  netQty: number;
};

/**
 * Çıta runtime kesim kuralı. JS Number / Math.floor kullanılmaz.
 * effectiveCutPitchMm = widthMm + 4
 * netQty = FLOOR(2100 / effectiveCutPitchMm)
 */
export function calculateCitaCutRuleNet(widthMm: Decimal.Value): CitaCutRuleNet {
  const width = parseCitaWidthMm(widthMm);
  const bladeAllowanceMm = CITA_CUT_RULE.kerfMm;
  const countSideMm = CITA_SHEET_MM.widthMm;
  const effectiveCutPitchMm = width.plus(bladeAllowanceMm);

  if (effectiveCutPitchMm.gt(countSideMm)) {
    throw new BadRequestException(
      `Çıta eni + bıçak payı (${decimalToString(effectiveCutPitchMm)} mm) ` +
        `${countSideMm} mm kısa kenara sığmıyor.`,
    );
  }

  const raw = toDecimal(countSideMm).div(effectiveCutPitchMm);
  const netQtyDecimal = raw.floor();
  const netQty = netQtyDecimal.toNumber();

  if (!netQtyDecimal.isInteger() || !Number.isInteger(netQty) || netQty < 1) {
    throw new BadRequestException(
      `Çıta NET adedi en az 1 olmalıdır (FLOOR(${countSideMm} / ${decimalToString(effectiveCutPitchMm)}) = ${decimalToString(netQtyDecimal)}).`,
    );
  }

  return {
    widthMm: width,
    bladeAllowanceMm,
    countSideMm,
    effectiveCutPitchMm,
    netQty,
  };
}

export function parseCitaMm(field: string, value: unknown): Decimal {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new BadRequestException(`${field} zorunludur.`);
  }

  const parsed = toDecimal(String(value).trim());
  if (!parsed.isFinite()) {
    throw new BadRequestException(`${field} geçerli bir mm değeri olmalıdır.`);
  }
  return parsed;
}

export function parseCitaWidthMm(value: unknown): Decimal {
  const width = parseCitaMm('widthMm', value);
  if (width.lte(0)) {
    throw new BadRequestException('widthMm > 0 olmalıdır.');
  }
  return width;
}

export function parseCitaLengthMm(value: unknown): Decimal {
  const length = parseCitaMm('lengthMm', value);
  if (!length.equals(CITA_CUT_RULE.pieceLengthMm)) {
    throw new BadRequestException(
      `Çıta boyu yalnız ${CITA_CUT_RULE.pieceLengthMm} mm desteklenir. Gelen: ${decimalToString(length)} mm.`,
    );
  }
  return length;
}

export function parseCitaThicknessMm(value: unknown): CitaSupportedThicknessMm {
  const thickness = parseCitaMm('thicknessMm', value);
  for (const allowed of CITA_SUPPORTED_THICKNESSES_MM) {
    if (thickness.equals(allowed)) {
      return allowed;
    }
  }
  throw new BadRequestException(
    `Çıta bu MDF kalınlığını desteklemiyor: ${decimalToString(thickness)} mm. ` +
      `Desteklenen: ${CITA_SUPPORTED_THICKNESSES_MM.join(', ')} mm.`,
  );
}

export function citaMaterialCodeForThickness(
  thicknessMm: CitaSupportedThicknessMm,
): (typeof CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM)[CitaSupportedThicknessMm] {
  return CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM[thicknessMm];
}

export function integerMmOrNull(value: Decimal): number | null {
  if (!value.isInteger()) {
    return null;
  }
  const asNumber = value.toNumber();
  if (!Number.isInteger(asNumber) || asNumber <= 0) {
    return null;
  }
  return asNumber;
}
