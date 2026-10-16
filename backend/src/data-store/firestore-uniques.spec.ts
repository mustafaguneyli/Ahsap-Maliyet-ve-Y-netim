import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { UniqueConstraintError } from './store-errors';
import {
  encodeUniqueKey,
  FIRESTORE_UNIQUE_CONSTRAINTS,
  mergeUniqueNet,
  uniqueGuardDiff,
  uniqueGuardsFor,
} from './firestore-uniques';

describe('firestore-uniques', () => {
  it('eksik alanlı belge unique claim etmez', () => {
    expect(uniqueGuardsFor(FIRESTORE_COLLECTIONS.orderLines, {})).toEqual([]);
    expect(
      uniqueGuardsFor(FIRESTORE_COLLECTIONS.orderLines, {
        orderDocumentId: 'order-1',
        lineNo: 1,
      })[0]?.constraint,
    ).toBe('order-line-no');
  });

  it('product-code guard anahtarı groupId + code kullanır', () => {
    const guards = uniqueGuardsFor(FIRESTORE_COLLECTIONS.products, {
      productGroupId: 'g1',
      code: '34_MM',
    });
    expect(guards).toEqual([{ constraint: 'product-code', key: encodeUniqueKey(['g1', '34_MM']) }]);
  });

  it('pasif NET kaydı generic unique claim etmez', () => {
    const guards = uniqueGuardsFor(FIRESTORE_COLLECTIONS.productionYields, {
      productId: null,
      rawMaterialId: 'm1',
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
      isActive: false,
    });
    expect(guards).toEqual([]);
  });

  it('aktif açık fiyat dönemi unique claim eder; kapanmış dönem etmez', () => {
    const open = uniqueGuardsFor(FIRESTORE_COLLECTIONS.rawMaterialPrices, {
      rawMaterialId: 'm1',
      priceType: 'CASH',
      isActive: true,
      effectiveTo: null,
    });
    const closed = uniqueGuardsFor(FIRESTORE_COLLECTIONS.rawMaterialPrices, {
      rawMaterialId: 'm1',
      priceType: 'CASH',
      isActive: true,
      effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
    });
    expect(open[0]?.constraint).toBe('raw-material-price-open');
    expect(closed).toEqual([]);
  });

  it('ürün+ölçü kâr override ile ürün kâr override ayrı guard kullanır', () => {
    const sized = uniqueGuardsFor(FIRESTORE_COLLECTIONS.productPricingOverrides, {
      productId: 'p1',
      productSizeId: 's1',
      isActive: true,
      effectiveTo: null,
    });
    const product = uniqueGuardsFor(FIRESTORE_COLLECTIONS.productPricingOverrides, {
      productId: 'p1',
      productSizeId: null,
      isActive: true,
      effectiveTo: null,
    });
    expect(sized[0]?.constraint).toBe('product-pricing-override-size');
    expect(product[0]?.constraint).toBe('product-pricing-override-product');
  });

  it('aynı anahtarı kapatan ve yeniden açan versioning net claim üretir', () => {
    const open = uniqueGuardsFor(FIRESTORE_COLLECTIONS.productionYields, {
      productId: null,
      rawMaterialId: 'm1',
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
      isActive: true,
    });
    const closed = uniqueGuardsFor(FIRESTORE_COLLECTIONS.productionYields, {
      productId: null,
      rawMaterialId: 'm1',
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
      isActive: false,
    });
    const nextOpen = uniqueGuardsFor(FIRESTORE_COLLECTIONS.productionYields, {
      productId: null,
      rawMaterialId: 'm1',
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
      isActive: true,
    });
    const closeDiff = uniqueGuardDiff(open, closed);
    const openDiff = uniqueGuardDiff(closed, nextOpen);
    expect(closeDiff.release).toEqual(open);
    expect(openDiff.claim).toEqual(nextOpen);
  });

  it('kapanan açık dönem unique guard’ı serbest bırakır', () => {
    const open = uniqueGuardsFor(FIRESTORE_COLLECTIONS.rawMaterialPrices, {
      rawMaterialId: 'm1',
      priceType: 'CASH',
      isActive: true,
      effectiveTo: null,
    });
    const closed = uniqueGuardsFor(FIRESTORE_COLLECTIONS.rawMaterialPrices, {
      rawMaterialId: 'm1',
      priceType: 'CASH',
      isActive: true,
      effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
    });
    const diff = uniqueGuardDiff(open, closed);
    expect(diff.release).toEqual(open);
    expect(diff.claim).toEqual([]);
  });

  it('aynı unique anahtarı aynı transaction içinde başka belgeye devreder', () => {
    const orderId = 'order-1';
    const net = mergeUniqueNet([
      {
        collection: FIRESTORE_COLLECTIONS.orderLines,
        id: 'line-old',
        previous: { orderDocumentId: orderId, lineNo: 1 },
        next: null,
      },
      {
        collection: FIRESTORE_COLLECTIONS.orderLines,
        id: 'line-new',
        previous: null,
        next: { orderDocumentId: orderId, lineNo: 1 },
      },
    ]);
    expect(net).toEqual([
      expect.objectContaining({
        op: 'claim',
        ownerId: 'line-new',
        releasedFrom: 'line-old',
        guard: expect.objectContaining({ constraint: 'order-line-no' }),
      }),
    ]);
  });

  it('aynı unique anahtarı iki yeni belge aynı anda claim edemez', () => {
    expect(() =>
      mergeUniqueNet([
        {
          collection: FIRESTORE_COLLECTIONS.orderLines,
          id: 'line-a',
          previous: null,
          next: { orderDocumentId: 'order-1', lineNo: 1 },
        },
        {
          collection: FIRESTORE_COLLECTIONS.orderLines,
          id: 'line-b',
          previous: null,
          next: { orderDocumentId: 'order-1', lineNo: 1 },
        },
      ]),
    ).toThrow(UniqueConstraintError);
  });

  it('her iş koleksiyonu için en az bir unique kuralı veya bilinçli boşluk belgelidir', () => {
    const covered = new Set(FIRESTORE_UNIQUE_CONSTRAINTS.map((item) => item.collection));
    const optional = new Set<string>([
      FIRESTORE_COLLECTIONS.extraCostValues,
      FIRESTORE_COLLECTIONS.orderMaterialLines,
      FIRESTORE_COLLECTIONS.auditEvents,
    ]);
    for (const collection of Object.values(FIRESTORE_COLLECTIONS)) {
      if (optional.has(collection)) {
        continue;
      }
      expect(covered.has(collection)).toBe(true);
    }
  });
});
