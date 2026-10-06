import Decimal from 'decimal.js';
import { toDecimal } from '../../common/decimal/decimal.util';

export class OrderCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderCalculationError';
  }
}

export type OrderLineCalcInput = {
  quantity: string;
  unitPrice: string;
  discountRate: string;
};

export type OrderLineCalcResult = {
  quantity: Decimal;
  unitPrice: Decimal;
  discountRate: Decimal;
  lineAmount: Decimal;
  lineDiscountAmount: Decimal;
};

export type OrderTotals = {
  lines: OrderLineCalcResult[];
  grossTotal: Decimal;
  discountAmount: Decimal;
  netTotal: Decimal;
  vatRate: Decimal;
  vatAmount: Decimal;
  grandTotal: Decimal;
};

const DECIMAL_TEXT = /^-?(?:0|[1-9]\d*)(?:[.,]\d+)?$/;

export function parseOrderDecimal(raw: string, label: string): Decimal {
  const text = raw.trim();
  if (!DECIMAL_TEXT.test(text)) {
    throw new OrderCalculationError(`${label} geçerli bir sayı olmalıdır.`);
  }
  const value = toDecimal(text.replace(',', '.'));
  if (!value.isFinite()) {
    throw new OrderCalculationError(`${label} geçerli bir sayı olmalıdır.`);
  }
  return value;
}

/**
 * Boş KDV oranını %0 saymaz. "0" açıkça girilmişse 0 döner.
 */
export function requireVatRate(raw: string | null | undefined): Decimal {
  if (raw == null || raw.trim() === '') {
    throw new OrderCalculationError(
      'KDV oranı girilmedi. Boş oran %0 olarak kabul edilmez.',
    );
  }
  const rate = parseOrderDecimal(raw, 'KDV oranı');
  if (rate.isNegative()) {
    throw new OrderCalculationError('KDV oranı negatif olamaz.');
  }
  return rate;
}

/**
 * Satır tutarı = miktar × birim fiyat.
 * Satır iskontosu = satır tutarı × iskonto yüzdesi / 100.
 * Ara adımlar yuvarlanmaz. Tam TL ROUNDUP uygulanmaz.
 * Birim fiyat KDV hariç kabul edilir; KDV ara toplam üzerine eklenir.
 */
export function calculateOrderTotals(
  lines: OrderLineCalcInput[],
  vatRateRaw: string | null | undefined,
): OrderTotals {
  if (lines.length === 0) {
    throw new OrderCalculationError('Siparişte en az bir satır olmalıdır.');
  }

  const vatRate = requireVatRate(vatRateRaw);
  const calculated = lines.map((line) => calculateLine(line));
  const grossTotal = calculated.reduce(
    (sum, line) => sum.plus(line.lineAmount),
    new Decimal(0),
  );
  const discountAmount = calculated.reduce(
    (sum, line) => sum.plus(line.lineDiscountAmount),
    new Decimal(0),
  );
  const netTotal = grossTotal.minus(discountAmount);
  const vatAmount = netTotal.times(vatRate).div(100);
  const grandTotal = netTotal.plus(vatAmount);

  return {
    lines: calculated,
    grossTotal,
    discountAmount,
    netTotal,
    vatRate,
    vatAmount,
    grandTotal,
  };
}

function calculateLine(line: OrderLineCalcInput): OrderLineCalcResult {
  const quantity = parseOrderDecimal(line.quantity, 'Miktar');
  if (quantity.lte(0)) {
    throw new OrderCalculationError('Miktar 0’dan büyük olmalıdır.');
  }

  if (line.unitPrice == null || line.unitPrice.trim() === '') {
    throw new OrderCalculationError(
      'Birim fiyat girilmedi. Tanımsız satış fiyatı 0 TL yapılmaz.',
    );
  }
  const unitPrice = parseOrderDecimal(line.unitPrice, 'Birim fiyat');
  if (unitPrice.isNegative()) {
    throw new OrderCalculationError('Birim fiyat negatif olamaz.');
  }

  const discountRate = parseOrderDecimal(line.discountRate, 'İskonto yüzdesi');
  if (discountRate.isNegative()) {
    throw new OrderCalculationError('İskonto yüzdesi negatif olamaz.');
  }
  if (discountRate.gt(100)) {
    throw new OrderCalculationError('İskonto %100’ü aşamaz.');
  }

  const lineAmount = quantity.times(unitPrice);
  const lineDiscountAmount = lineAmount.times(discountRate).div(100);

  return {
    quantity,
    unitPrice,
    discountRate,
    lineAmount,
    lineDiscountAmount,
  };
}

export function formatOrderMoney(value: Decimal.Value): string {
  const shown = toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const negative = shown.isNegative();
  const [intPart, frac] = shown.abs().toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${frac} TL`;
}

/** Fiziksel miktar gösterimi: tam sayıysa tam; değilse en fazla 2 ondalık (virgül). */
export function formatOrderQuantity(value: Decimal.Value): string {
  const qty = toDecimal(value);
  if (qty.isInteger()) return qty.toFixed(0);
  const shown = qty.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return shown.toFixed(2).replace('.', ',');
}

export function formatPercent(value: Decimal.Value): string {
  const rate = toDecimal(value);
  const text = rate.toFixed().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${text}%`;
}

export function formatVatLabel(rate: Decimal.Value): string {
  const text = toDecimal(rate)
    .toFixed()
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return `KDV %${text}`;
}

/**
 * A4 dikey (210×297 mm) müşteri/üretim formunda okunabilir satır kapasitesi.
 * Combined kısa siparişte tek A4 (üst+alt); uzun siparişte devam sayfası açılır.
 */
export const ORDER_LINES_PER_PAGE = 8;

export function paginateOrderLines<T>(lines: T[]): T[][] {
  if (lines.length === 0) {
    return [[]];
  }
  const pages: T[][] = [];
  for (let index = 0; index < lines.length; index += ORDER_LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + ORDER_LINES_PER_PAGE));
  }
  return pages;
}
