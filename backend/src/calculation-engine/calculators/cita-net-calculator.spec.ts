import { BadRequestException } from '@nestjs/common';
import { decimalToString, toDecimal } from '../../common/decimal/decimal.util';
import { CITA_STANDARD_FALLBACK_NET } from '../../modules/products/cita-cut-rule.fixture';
import { CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM } from '../../modules/production-yields/cita-yield-seed-data';
import {
  calculateCitaCutRuleNet,
  CITA_NET_FORBIDDEN_MATERIAL_CODES,
  CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM,
  parseCitaLengthMm,
  parseCitaThicknessMm,
  parseCitaWidthMm,
} from './cita-net-calculator';

describe('calculateCitaCutRuleNet', () => {
  it('standart enler FLOOR(2100 / (en+4)) üretir', () => {
    for (const row of CITA_STANDARD_FALLBACK_NET) {
      const result = calculateCitaCutRuleNet(row.widthMm);
      expect(decimalToString(result.effectiveCutPitchMm)).toBe(
        String(row.effectiveCutPitchMm),
      );
      expect(result.netQty).toBe(row.netQty);
      expect(result.bladeAllowanceMm).toBe(4);
      expect(result.countSideMm).toBe(2100);
    }
  });

  it.each([
    ['35', '39', 53],
    ['25', '29', 72],
    ['47', '51', 41],
    ['65', '69', 30],
    ['35.5', '39.5', 53],
  ])(
    'custom en %s mm → pitch %s, NET %i',
    (widthMm, pitch, netQty) => {
      const result = calculateCitaCutRuleNet(widthMm);
      expect(decimalToString(result.effectiveCutPitchMm)).toBe(pitch);
      expect(result.netQty).toBe(netQty);
      expect(
        toDecimal(2100).div(result.effectiveCutPitchMm).floor().toNumber(),
      ).toBe(netQty);
    },
  );

  it('sığmayan en için 0 adet döndürmez', () => {
    expect(() => calculateCitaCutRuleNet(2097)).toThrow(BadRequestException);
  });
});

describe('CITA net parse', () => {
  it('widthMm <= 0 reddeder', () => {
    expect(() => parseCitaWidthMm('0')).toThrow(BadRequestException);
    expect(() => parseCitaWidthMm('-1')).toThrow(BadRequestException);
  });

  it('lengthMm != 2800 reddeder', () => {
    expect(() => parseCitaLengthMm('2100')).toThrow(BadRequestException);
    expect(decimalToString(parseCitaLengthMm('2800'))).toBe('2800');
  });

  it('desteklenmeyen kalınlığı reddeder', () => {
    expect(() => parseCitaThicknessMm('9')).toThrow(BadRequestException);
    expect(() => parseCitaThicknessMm('25')).toThrow(BadRequestException);
    expect(parseCitaThicknessMm('18')).toBe(18);
  });
});

describe('CITA net material map', () => {
  it('yield seed ile aynı 18 mm ZIMPARALI kodunu kullanır', () => {
    expect(CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM).toEqual(
      CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM,
    );
    expect(CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM[18]).toBe(
      'MDF-18-2100X2800-ZIMPARALI',
    );
    expect(CITA_NET_FORBIDDEN_MATERIAL_CODES).toEqual([
      'MDF-18-2100X2800-ZIMPARALI-NEOPAN',
      'MDF-18-2100X2800-TEK-YUZ-MEMBRANLIK-4',
      'MDF-22-UI-TEST',
    ]);
  });
});
