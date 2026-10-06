import Decimal from 'decimal.js';
import {
  calculateOrderTotals,
  formatOrderMoney,
  formatOrderQuantity,
  OrderCalculationError,
  paginateOrderLines,
  requireVatRate,
} from './order-totals';

describe('sipariş toplamları', () => {
  it('özgün formdaki sıfır fiyatlı satırları çarpar', () => {
    const result = calculateOrderTotals(
      [
        { quantity: '400', unitPrice: '0', discountRate: '0' },
        { quantity: '1500', unitPrice: '0', discountRate: '0' },
      ],
      '0',
    );

    expect(result.lines[0].lineAmount.toFixed()).toBe('0');
    expect(result.lines[1].lineAmount.toFixed()).toBe('0');
    expect(result.grossTotal.toFixed()).toBe('0');
    expect(result.discountAmount.toFixed()).toBe('0');
    expect(result.netTotal.toFixed()).toBe('0');
    expect(result.vatAmount.toFixed()).toBe('0');
    expect(result.grandTotal.toFixed()).toBe('0');
  });

  it('ilk satır tutarını sabit 0 bırakmaz', () => {
    const result = calculateOrderTotals(
      [{ quantity: '400', unitPrice: '10', discountRate: '0' }],
      '0',
    );
    expect(result.lines[0].lineAmount.toFixed()).toBe('4000');
  });

  it('satır yüzdesini toplar ve KDV’yi iskonto sonrası ekler', () => {
    const result = calculateOrderTotals(
      [
        { quantity: '1500', unitPrice: '12.345', discountRate: '10' },
        { quantity: '3', unitPrice: '10.005', discountRate: '7.5' },
        { quantity: '1', unitPrice: '1.005', discountRate: '0' },
      ],
      '0',
    );

    expect(result.lines[0].lineAmount.toFixed()).toBe('18517.5');
    expect(result.lines[0].lineDiscountAmount.toFixed()).toBe('1851.75');
    expect(result.lines[1].lineAmount.toFixed()).toBe('30.015');
    expect(result.lines[1].lineDiscountAmount.toFixed()).toBe('2.251125');
    expect(result.lines[2].lineAmount.toFixed()).toBe('1.005');
    expect(result.grossTotal.toFixed()).toBe('18548.52');
    expect(result.discountAmount.toFixed()).toBe('1854.001125');
    expect(result.netTotal.toFixed()).toBe('16694.518875');
    expect(result.vatAmount.toFixed()).toBe('0');
    expect(result.grandTotal.toFixed()).toBe('16694.518875');
  });

  it('12,5 iskonto yüzdesini virgülle kabul eder', () => {
    const result = calculateOrderTotals(
      [{ quantity: '8', unitPrice: '200', discountRate: '12,5' }],
      '20',
    );
    expect(result.lines[0].lineDiscountAmount.toFixed()).toBe('200');
    expect(result.netTotal.toFixed()).toBe('1400');
    expect(result.vatAmount.toFixed()).toBe('280');
    expect(result.grandTotal.toFixed()).toBe('1680');
  });

  it('elle girilen KDV oranını ara toplama uygular', () => {
    const result = calculateOrderTotals(
      [{ quantity: '2', unitPrice: '100', discountRate: '0' }],
      '20',
    );
    expect(result.netTotal.toFixed()).toBe('200');
    expect(result.vatAmount.toFixed()).toBe('40');
    expect(result.grandTotal.toFixed()).toBe('240');
  });

  it('Aşama5 örnek sipariş toplamlarını Decimal ile üretir', () => {
    const result = calculateOrderTotals(
      [
        { quantity: '400', unitPrice: '50', discountRate: '10' },
        { quantity: '100', unitPrice: '80', discountRate: '5' },
      ],
      '20',
    );
    expect(result.grossTotal.toFixed()).toBe('28000');
    expect(result.discountAmount.toFixed()).toBe('2400');
    expect(result.netTotal.toFixed()).toBe('25600');
    expect(result.vatAmount.toFixed()).toBe('5120');
    expect(result.grandTotal.toFixed()).toBe('30720');
  });

  it('negatif miktar, fiyat, iskonto ve %100 üstü iskontoyu reddeder', () => {
    expect(() =>
      calculateOrderTotals([{ quantity: '-1', unitPrice: '10', discountRate: '0' }], '20'),
    ).toThrow(/Miktar/);
    expect(() =>
      calculateOrderTotals([{ quantity: '1', unitPrice: '-10', discountRate: '0' }], '20'),
    ).toThrow(/Birim fiyat negatif/);
    expect(() =>
      calculateOrderTotals([{ quantity: '1', unitPrice: '10', discountRate: '-1' }], '20'),
    ).toThrow(/İskonto yüzdesi negatif/);
    expect(() =>
      calculateOrderTotals([{ quantity: '1', unitPrice: '10', discountRate: '100.01' }], '20'),
    ).toThrow(/%100/);
    expect(() => requireVatRate('-1')).toThrow(/KDV oranı negatif/);
    expect(() => requireVatRate('0')).not.toThrow();
  });

  it('boş KDV oranını %0 saymaz', () => {
    expect(() => requireVatRate('')).toThrow(OrderCalculationError);
    expect(() => requireVatRate(null)).toThrow(/Boş oran %0/);
  });

  it('boş birim fiyatı 0 yapmaz', () => {
    expect(() =>
      calculateOrderTotals(
        [{ quantity: '1', unitPrice: ' ', discountRate: '0' }],
        '20',
      ),
    ).toThrow(/Birim fiyat/);
  });

  it('gösterimde 2 kuruşa yuvarlar, toplam tam değeri kullanır', () => {
    const result = calculateOrderTotals(
      [
        { quantity: '3', unitPrice: '10.005', discountRate: '0' },
        { quantity: '3', unitPrice: '10.005', discountRate: '0' },
      ],
      '0',
    );
    expect(result.lines[0].lineAmount.toFixed()).toBe('30.015');
    expect(formatOrderMoney(result.lines[0].lineAmount)).toBe('30,02 TL');
    expect(result.grossTotal.toFixed()).toBe('60.03');
    expect(formatOrderMoney(result.grossTotal)).toBe('60,03 TL');
    const displayedSum = new Decimal('30.02').plus('30.02');
    expect(displayedSum.toFixed()).toBe('60.04');
    expect(result.grossTotal.eq(displayedSum)).toBe(false);
  });

  it('formatOrderQuantity: tam sayı / ondalık', () => {
    expect(formatOrderQuantity('12')).toBe('12');
    expect(formatOrderQuantity('7.5')).toBe('7,50');
    expect(formatOrderQuantity('2')).toBe('2');
    expect(formatOrderQuantity(0)).toBe('0');
  });

  it('formatOrderMoney: Türkçe 2 ondalık', () => {
    expect(formatOrderMoney('8922.6')).toBe('8.922,60 TL');
    expect(formatOrderMoney('2250')).toBe('2.250,00 TL');
    expect(formatOrderMoney('181.25')).toBe('181,25 TL');
    expect(formatOrderMoney('0')).toBe('0,00 TL');
  });

  it('sayfa kapasitesine göre 8 satırı tek sayfada, 9 satırı iki sayfada tutar', () => {
    const eight = Array.from({ length: 8 }, (_, index) => index);
    const nine = Array.from({ length: 9 }, (_, index) => index);
    expect(paginateOrderLines(eight)).toHaveLength(1);
    expect(paginateOrderLines(nine)).toEqual([eight, [8]]);
  });
});
