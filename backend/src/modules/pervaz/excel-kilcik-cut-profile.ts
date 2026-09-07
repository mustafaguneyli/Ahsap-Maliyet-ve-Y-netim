import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

/**
 * Excel Ayarlı Pervaz kılçık teorik böleni (cm×10).
 * STANDARD 43 / WIDE 59 üretim pitch'i değildir; karıştırılmaz.
 */
export const EXCEL_KILCIK_CUT_WIDTH_MM: Readonly<Record<string, number>> = {
  '9': 42,
  '12': 42,
  '14': 45,
  '16': 50,
  '18': 55,
};

export function getExcelKilcikCutWidthMm(pervazThicknessMm: string | number): number {
  const thickness = toDecimal(pervazThicknessMm);
  if (!thickness.isInteger() || thickness.lte(0)) {
    throw new BadRequestException('Pervaz kalınlığı pozitif tam mm olmalıdır.');
  }
  const width = EXCEL_KILCIK_CUT_WIDTH_MM[thickness.toFixed()];
  if (width == null) {
    throw new BadRequestException(
      `Excel kılçık kesim profili bu kalınlık için tanımlı değil: ${thickness.toFixed()} mm.`,
    );
  }
  return width;
}
