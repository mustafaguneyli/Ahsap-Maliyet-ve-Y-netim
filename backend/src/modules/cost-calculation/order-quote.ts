import { toDecimal } from '../../common/decimal/decimal.util';

export function multiplyUnitByQuantity(unit: string, quantity: number): string {
  return toDecimal(unit).times(quantity).toFixed();
}

export function sameMm(left: string | number, right: string | number): boolean {
  return toDecimal(left).eq(toDecimal(right));
}

export function formatMmAsCmLabel(mm: string | number): string {
  const cm = toDecimal(mm).div(10);
  const text = cm.toFixed();
  const trimmed = text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return trimmed.replace('.', ',');
}

export function formatOrderSizeLabel(input: {
  thicknessMm?: string | number | null;
  widthMm: string | number;
  lengthMm: string | number;
}): string {
  const size = `${formatMmAsCmLabel(input.widthMm)}×${formatMmAsCmLabel(input.lengthMm)} cm`;
  if (input.thicknessMm == null || input.thicknessMm === '') {
    return size;
  }
  const thickness = toDecimal(input.thicknessMm).toFixed().replace(/\.0+$/, '');
  return `${thickness} mm · ${size}`;
}

export const EXTRA_COST_TR: Record<string, string> = {
  CUTTING: 'Kesim',
  GLUE: 'Tutkal',
  LABOR: 'İşçilik',
  OTHER: 'Diğer',
};

export const MISSING_SOURCE_MESSAGE =
  'Maliyet hesabı için gerekli bazı kaynak değerleri tanımlı değil.';

export const SALE_PRICE_MISSING_MESSAGE = 'Satış fiyatı tanımlı değil';
