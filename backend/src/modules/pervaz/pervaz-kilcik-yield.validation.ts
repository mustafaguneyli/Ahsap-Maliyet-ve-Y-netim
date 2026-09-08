import { BadRequestException } from '@nestjs/common';
import { getExcelKilcikCutWidthMm } from './excel-kilcik-cut-profile';
import {
  assertKilcikTypeAllowedForThickness,
  KILCIK_TYPE_SPECS,
} from './kilcik-type.rules';

export type PervazKilcikYieldSourceCode = 'EXCEL_MASTER' | 'MANUAL_VERIFIED';

export type PervazKilcikYieldValidationInput = {
  productId: string;
  productIsActive?: boolean | null;
  productGroupCode?: string | null;
  pervazThicknessMm: number;
  source?: PervazKilcikYieldSourceCode;
  kilcikTypeCode?: string | null;
  kilcikTypeIsActive?: boolean | null;
  rawMaterialId: string;
  rawMaterialIsActive?: boolean | null;
  pieceLengthMm: number;
  netQty: number;
  excelCutWidthMm?: number | null;
};

function requirePositiveInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${name} pozitif tam sayı olmalıdır.`);
  }
}

function hasKilcikType(code: string | null | undefined): code is string {
  return code != null && code !== '';
}

/**
 * Pervaz kılçık NET domain doğrulaması.
 * EXCEL_MASTER: product + kalınlık + boy; kilcikType zorunlu değil.
 * MANUAL_VERIFIED: kilcikType zorunlu (STANDARD/WIDE üretim tipi).
 */
export function assertPervazKilcikYield(input: PervazKilcikYieldValidationInput): void {
  if (!input.productId) {
    throw new BadRequestException('productId zorunludur.');
  }
  if (!input.rawMaterialId) {
    throw new BadRequestException('rawMaterialId zorunludur.');
  }

  requirePositiveInt('pervazThicknessMm', input.pervazThicknessMm);
  requirePositiveInt('pieceLengthMm', input.pieceLengthMm);
  requirePositiveInt('netQty', input.netQty);

  const source: PervazKilcikYieldSourceCode = input.source ?? 'EXCEL_MASTER';
  if (source !== 'EXCEL_MASTER' && source !== 'MANUAL_VERIFIED') {
    throw new BadRequestException(`Desteklenmeyen kılçık yield kaynağı: ${String(source)}.`);
  }

  if (input.productIsActive === false) {
    throw new BadRequestException(
      `Ürün (${input.productId}) aktif değil. Pasif ürüne kılçık NET atanamaz.`,
    );
  }
  if (input.rawMaterialIsActive === false) {
    throw new BadRequestException(
      `Ham madde (${input.rawMaterialId}) aktif değil. Pasif ham maddeye kılçık NET bağlanamaz.`,
    );
  }

  if (input.productGroupCode != null && input.productGroupCode !== 'PERVAZ') {
    throw new BadRequestException(
      `PervazKilcikYield yalnızca PERVAZ ürün grubu içindir; verilen grup: ${input.productGroupCode}.`,
    );
  }

  if (input.excelCutWidthMm != null) {
    requirePositiveInt('excelCutWidthMm', input.excelCutWidthMm);
    const expected =
      input.kilcikTypeCode === 'WIDE'
        ? KILCIK_TYPE_SPECS.WIDE.nominalWidthMm
        : getExcelKilcikCutWidthMm(input.pervazThicknessMm);
    if (input.excelCutWidthMm !== expected) {
      throw new BadRequestException(
        `${input.pervazThicknessMm} mm Excel kılçık kesim eni ${expected} mm olmalıdır; ` +
          `verilen: ${input.excelCutWidthMm}.`,
      );
    }
  }

  if (source === 'MANUAL_VERIFIED' && !hasKilcikType(input.kilcikTypeCode)) {
    throw new BadRequestException(
      'MANUAL_VERIFIED kılçık NET kaydı için kilcikType (STANDARD veya WIDE) zorunludur.',
    );
  }

  if (hasKilcikType(input.kilcikTypeCode)) {
    if (input.kilcikTypeIsActive === false) {
      throw new BadRequestException('Kılçık tipi aktif değil. Pasif tipe NET atanamaz.');
    }
    assertKilcikTypeAllowedForThickness(input.pervazThicknessMm, input.kilcikTypeCode);
  }
}
