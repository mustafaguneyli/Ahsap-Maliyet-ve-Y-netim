import { BadRequestException } from '@nestjs/common';
import {
  claimStoredLine,
  formatQuantityText,
  normalizeOrderListQuery,
  orderListWhere,
  sumQuantities,
} from './order-list';

describe('sipariş listesi', () => {
  it('arama ve sayfayı sınırlar', () => {
    const query = normalizeOrderListQuery({ q: ' sp-1 ', page: 2, pageSize: 10 });
    expect(query.q).toBe('sp-1');
    expect(query.page).toBe(2);
    expect(query.pageSize).toBe(10);
    expect(orderListWhere(query).OR).toEqual([
      { orderNumber: { contains: 'sp-1', mode: 'insensitive' } },
      { customerName: { contains: 'sp-1', mode: 'insensitive' } },
    ]);
  });

  it('geçersiz tarihi ve ters aralığı reddeder', () => {
    expect(() => normalizeOrderListQuery({ dateFrom: '06.01.2026' })).toThrow(BadRequestException);
    expect(() =>
      normalizeOrderListQuery({ dateFrom: '2026-02-01', dateTo: '2026-01-01' }),
    ).toThrow(/Başlangıç/);
  });

  it('ürün miktarlarını Decimal ile toplar', () => {
    expect(sumQuantities(['10', '1.5', '0.50'])).toBe('12');
    expect(formatQuantityText('12.000000')).toBe('12');
    expect(formatQuantityText('1.50')).toBe('1.5');
  });

  it('aynı imzalı satırı bir kez kullanır', () => {
    const lines = [
      { lineNo: 1, name: 'A' },
      { lineNo: 2, name: 'A' },
    ];
    const consumed = new Set<number>();
    const first = claimStoredLine(lines, consumed, (line) => line.name === 'A');
    const second = claimStoredLine(lines, consumed, (line) => line.name === 'A');
    const third = claimStoredLine(lines, consumed, (line) => line.name === 'A');
    expect(first?.lineNo).toBe(1);
    expect(second?.lineNo).toBe(2);
    expect(third).toBeUndefined();
  });
});
