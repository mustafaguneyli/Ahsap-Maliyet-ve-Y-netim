import { MaterialPriceType } from '@prisma/client';
import { UniqueConstraintError } from './store-errors';
import {
  findActiveProductionYield,
  selectCurrentMaterialPriceFromDocs,
} from './firestore-lookups';

describe('firestore-lookups', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  it('CASH yoksa CARD’a, CARD yoksa CASH’e fallback yapmaz', () => {
    const cashOnly = [
      {
        id: 'cash',
        priceType: MaterialPriceType.CASH,
        price: '3750.0000',
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ];
    const cardOnly = [
      {
        id: 'card',
        priceType: MaterialPriceType.CARD_INSTALLMENT,
        price: '4400.0000',
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ];
    expect(selectCurrentMaterialPriceFromDocs(cashOnly, MaterialPriceType.CARD_INSTALLMENT, now)).toBeNull();
    expect(selectCurrentMaterialPriceFromDocs(cardOnly, MaterialPriceType.CASH, now)).toBeNull();
    expect(selectCurrentMaterialPriceFromDocs(cashOnly, MaterialPriceType.CASH, now)?.id).toBe('cash');
  });

  it('eksik fiyatı 0 veya karşı tipe doldurmaz', () => {
    expect(selectCurrentMaterialPriceFromDocs([], MaterialPriceType.CASH, now)).toBeNull();
  });

  it('NET lookup exact match; yakın ölçü kullanmaz', () => {
    const rows = [
      {
        id: 'y1',
        rawMaterialId: 'm1',
        productId: null,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
        netQty: 24,
        isActive: true,
      },
      {
        id: 'y2',
        rawMaterialId: 'm1',
        productId: null,
        pieceWidthMm: 100,
        pieceLengthMm: 2101,
        netQty: 23,
        isActive: true,
      },
    ];
    expect(
      findActiveProductionYield(rows, {
        rawMaterialId: 'm1',
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
      })?.netQty,
    ).toBe(24);
    expect(
      findActiveProductionYield(rows, {
        rawMaterialId: 'm1',
        pieceWidthMm: 110,
        pieceLengthMm: 2100,
      }),
    ).toBeNull();
  });

  it('duplicate aktif NET’i reddeder', () => {
    expect(() =>
      findActiveProductionYield(
        [
          {
            id: 'a',
            rawMaterialId: 'm1',
            productId: null,
            pieceWidthMm: 100,
            pieceLengthMm: 2100,
            netQty: 24,
            isActive: true,
          },
          {
            id: 'b',
            rawMaterialId: 'm1',
            productId: null,
            pieceWidthMm: 100,
            pieceLengthMm: 2100,
            netQty: 25,
            isActive: true,
          },
        ],
        { rawMaterialId: 'm1', pieceWidthMm: 100, pieceLengthMm: 2100 },
      ),
    ).toThrow(UniqueConstraintError);
  });

  it('pasif NET’i seçmez', () => {
    expect(
      findActiveProductionYield(
        [
          {
            id: 'old',
            rawMaterialId: 'm1',
            productId: null,
            pieceWidthMm: 100,
            pieceLengthMm: 2100,
            netQty: 20,
            isActive: false,
          },
        ],
        { rawMaterialId: 'm1', pieceWidthMm: 100, pieceLengthMm: 2100 },
      ),
    ).toBeNull();
  });
});
