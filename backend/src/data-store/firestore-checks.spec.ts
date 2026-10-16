import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { newEntityId } from '../firebase/firestore-ids';
import { assertFirestoreChecks, DOOR_FRAME_YIELD_REQUIRED } from './firestore-checks';
import { CheckConstraintError } from './store-errors';

describe('firestore-checks', () => {
  it('NET <= 0 yazımını reddeder', () => {
    expect(() =>
      assertFirestoreChecks(FIRESTORE_COLLECTIONS.productionYields, {
        rawMaterialId: newEntityId(),
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
        netQty: 0,
      }),
    ).toThrow(CheckConstraintError);
  });

  it('ek maliyet scope XOR kuralını korur', () => {
    expect(() =>
      assertFirestoreChecks(FIRESTORE_COLLECTIONS.extraCostValues, {
        productGroupId: newEntityId(),
        productId: newEntityId(),
        amount: '10.0000',
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).toThrow(/aynı anda/);
  });

  it('reçete miktarı Number olarak yazılamaz', () => {
    expect(() =>
      assertFirestoreChecks(FIRESTORE_COLLECTIONS.recipeItems, {
        recipeId: newEntityId(),
        rawMaterialId: newEntityId(),
        quantity: 1,
        sortOrder: 1,
      }),
    ).toThrow(/Number olamaz/);
  });

  it('kapı kasası productionYieldId zorunluluğu backend validation’dadır', () => {
    expect(() => DOOR_FRAME_YIELD_REQUIRED(null, 1)).toThrow(/productionYieldId zorunludur/);
  });
});
