import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export const KILCIK_TYPE_CODES = ['STANDARD', 'WIDE'] as const;
export type KilcikTypeCode = (typeof KILCIK_TYPE_CODES)[number];

export const KILCIK_TYPE_SPECS = {
  STANDARD: {
    code: 'STANDARD',
    name: 'Standart Kılçık',
    nominalWidthMm: 39,
    bladeAllowanceMm: 4,
    cutPitchMm: 43,
  },
  WIDE: {
    code: 'WIDE',
    name: 'Geniş Kılçık',
    nominalWidthMm: 55,
    bladeAllowanceMm: 4,
    cutPitchMm: 59,
  },
} as const;

export const KILCIK_ALLOWED_BY_THICKNESS: Record<string, readonly KilcikTypeCode[]> = {
  '9': ['STANDARD', 'WIDE'],
  '12': ['STANDARD', 'WIDE'],
  '14': ['WIDE'],
  '16': ['STANDARD', 'WIDE'],
  '18': ['WIDE'],
};

export function isKilcikTypeCode(value: string): value is KilcikTypeCode {
  return (KILCIK_TYPE_CODES as readonly string[]).includes(value);
}

export function assertKilcikTypeAllowedForThickness(
  pervazThicknessMm: string | number,
  kilcikTypeCode: string,
): void {
  if (!isKilcikTypeCode(kilcikTypeCode)) {
    throw new BadRequestException(`Desteklenmeyen kılçık tipi: ${kilcikTypeCode}.`);
  }

  const thickness = toDecimal(pervazThicknessMm);
  if (!thickness.isInteger() || thickness.lte(0)) {
    throw new BadRequestException('Pervaz kalınlığı pozitif tam mm olmalıdır.');
  }

  const allowed = KILCIK_ALLOWED_BY_THICKNESS[thickness.toFixed()];
  if (!allowed) {
    throw new BadRequestException(
      `Kılçık tipi bu pervaz kalınlığı için tanımlı değil: ${thickness.toFixed()} mm.`,
    );
  }
  if (!allowed.includes(kilcikTypeCode)) {
    throw new BadRequestException(
      `${thickness.toFixed()} mm pervaz ile ${kilcikTypeCode} kılçık kullanılamaz. ` +
        `İzinli: ${allowed.join(', ')}.`,
    );
  }
}
