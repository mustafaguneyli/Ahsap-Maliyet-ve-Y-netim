import { resolveProfitRateFromFirestoreDocs } from './firestore-profit-catalog';

describe('resolveProfitRateFromFirestoreDocs', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');
  const from = new Date('2026-03-01T00:00:00.000Z');

  it('precedence: SIZE > PRODUCT_OVERRIDE > ROW > PRODUCT > GROUP > GLOBAL', () => {
    const docs = {
      productId: 'p1',
      productGroupId: 'g1',
      productSizeId: 's1',
      now,
      overrides: [
        {
          productId: 'p1',
          productSizeId: 's1',
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: '25.0000',
        },
      ],
      settings: [
        { productId: 'p1', productGroupId: null, isActive: true, profitRate: '20.0000' },
        { productId: null, productGroupId: 'g1', isActive: true, profitRate: '15.0000' },
        { productId: null, productGroupId: null, isActive: true, profitRate: '8.0000' },
      ],
      rowExceptions: [
        {
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: '18.0000',
        },
      ],
    };
    expect(resolveProfitRateFromFirestoreDocs(docs)).toEqual({
      profitRate: '25',
      source: 'SIZE_OVERRIDE',
    });
  });

  it('profitRate 0.0000 geçerlidir; undefined/null fallback yapar', () => {
    const zero = resolveProfitRateFromFirestoreDocs({
      productId: 'p1',
      productGroupId: 'g1',
      productSizeId: 's1',
      now,
      overrides: [
        {
          productId: 'p1',
          productSizeId: 's1',
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: '0.0000',
        },
      ],
      settings: [{ productId: null, productGroupId: 'g1', isActive: true, profitRate: '15.0000' }],
    });
    expect(zero).toEqual({ profitRate: '0', source: 'SIZE_OVERRIDE' });

    const missing = resolveProfitRateFromFirestoreDocs({
      productId: 'p1',
      productGroupId: 'g1',
      productSizeId: 's1',
      now,
      overrides: [
        {
          productId: 'p1',
          productSizeId: 's1',
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
        },
      ],
      settings: [{ productId: null, productGroupId: 'g1', isActive: true, profitRate: '15.0000' }],
    });
    expect(missing).toEqual({ profitRate: '15', source: 'GROUP_PRICING_SETTING' });
  });
});
