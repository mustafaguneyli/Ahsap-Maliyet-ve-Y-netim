import { formatOrderNumber, nextOrderSequence, parseOrderSequence } from './firestore-order-number';

describe('firestore-order-number', () => {
  it('mevcut SP-000001…SP-000008’i korur, sonraki SP-000009 üretir', () => {
    const existing = ['SP-000001', 'SP-000008', 'SP-000003'];
    expect(existing.map(parseOrderSequence)).toEqual([1, 8, 3]);
    expect(nextOrderSequence(existing)).toBe(9);
    expect(formatOrderNumber(9)).toBe('SP-000009');
  });

  it('duplicate sequence üretmez', () => {
    const first = nextOrderSequence(['SP-000001']);
    const second = nextOrderSequence(['SP-000001', formatOrderNumber(first)]);
    expect(first).toBe(2);
    expect(second).toBe(3);
  });
});
