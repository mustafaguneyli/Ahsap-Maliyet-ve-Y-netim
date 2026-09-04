import { selectCurrentExtraCostValue } from './current-extra-cost-value';

describe('selectCurrentExtraCostValue', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  it('açık aktif değeri seçer', () => {
    const selected = selectCurrentExtraCostValue(
      [
        {
          id: 'v1',
          amount: { toString: () => '8' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
      now,
    );
    expect(selected?.amount.toString()).toBe('8');
  });

  it('eski kapanmış değer yerine yeni açık değeri seçer (8→10)', () => {
    const selected = selectCurrentExtraCostValue(
      [
        {
          id: 'old',
          amount: { toString: () => '8' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
          isActive: true,
        },
        {
          id: 'new',
          amount: { toString: () => '10' },
          effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
      now,
    );
    expect(selected?.id).toBe('new');
    expect(selected?.amount.toString()).toBe('10');
  });

  it('gelecek tarihli değeri bugüne yansıtmaz', () => {
    const selected = selectCurrentExtraCostValue(
      [
        {
          id: 'current',
          amount: { toString: () => '8' },
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-12-01T00:00:00.000Z'),
          isActive: true,
        },
        {
          id: 'future',
          amount: { toString: () => '10' },
          effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
      now,
    );
    expect(selected?.id).toBe('current');
    expect(selected?.amount.toString()).toBe('8');
  });
});
