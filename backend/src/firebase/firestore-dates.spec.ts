import { Timestamp } from 'firebase-admin/firestore';
import {
  assertPeriodOrder,
  decodeDateFields,
  encodeDateFields,
  isCurrentlyEffective,
  periodsOverlap,
  toUtcDate,
} from './firestore-dates';

describe('firestore-dates', () => {
  const from = new Date('2026-03-01T00:00:00.000Z');
  const to = new Date('2026-09-04T00:00:00.000Z');

  it('Timestamp / Date / ISO string aynı UTC anına iner', () => {
    const iso = '2026-03-01T00:00:00.000Z';
    expect(toUtcDate(new Date(iso), 'effectiveFrom').toISOString()).toBe(iso);
    expect(toUtcDate(Timestamp.fromDate(new Date(iso)), 'effectiveFrom').toISOString()).toBe(iso);
    expect(toUtcDate(iso, 'effectiveFrom').toISOString()).toBe(iso);
  });

  it('epoch Number kabul etmez', () => {
    expect(() => toUtcDate(Date.parse('2026-03-01T00:00:00.000Z'), 'effectiveFrom')).toThrow(
      /Number epoch/,
    );
  });

  it('timezone duvar saati aktif fiyatı değiştirmez', () => {
    const trPlus3 = new Date('2026-03-01T00:00:00.000+03:00');
    expect(isCurrentlyEffective(from, null, trPlus3)).toBe(false);
    expect(isCurrentlyEffective(from, null, new Date('2026-03-01T00:00:00.000Z'))).toBe(true);
    expect(isCurrentlyEffective(from, to, new Date('2026-09-04T00:00:00.000Z'))).toBe(false);
    expect(isCurrentlyEffective(from, to, new Date('2026-09-03T23:59:59.999Z'))).toBe(true);
  });

  it('effectiveTo > effectiveFrom kuralını korur', () => {
    expect(() => assertPeriodOrder(from, to)).not.toThrow();
    expect(() => assertPeriodOrder(from, from)).toThrow(/sonra/);
    expect(() => assertPeriodOrder(from, null)).not.toThrow();
  });

  it('açık dönemleri çakışma olarak görür', () => {
    expect(periodsOverlap(from, null, to, null)).toBe(true);
    expect(periodsOverlap(from, to, to, null)).toBe(false);
  });

  it('yazarken Timestamp, okurken Date üretir', () => {
    const encoded = encodeDateFields({ effectiveFrom: from, effectiveTo: null, createdAt: from });
    expect(encoded.effectiveFrom).toBeInstanceOf(Timestamp);
    expect(encoded.effectiveTo).toBeNull();
    const decoded = decodeDateFields(encoded);
    expect(decoded.effectiveFrom).toEqual(from);
    expect(decoded.effectiveTo).toBeNull();
  });
});
