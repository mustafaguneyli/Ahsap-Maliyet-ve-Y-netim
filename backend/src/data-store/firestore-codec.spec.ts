import Decimal from 'decimal.js';
import { Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { newEntityId } from '../firebase/firestore-ids';
import { decodeDocument, encodeDocument } from './firestore-codec';

describe('firestore-codec', () => {
  it('id ve FK UUID’lerini korur, para string yazar', () => {
    const id = newEntityId();
    const rawMaterialId = newEntityId();
    const encoded = encodeDocument(
      FIRESTORE_COLLECTIONS.rawMaterialPrices,
      id,
      {
        id,
        rawMaterialId,
        priceType: 'CASH',
        price: new Decimal('1885'),
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
      null,
    );
    expect(encoded.id).toBe(id);
    expect(encoded.rawMaterialId).toBe(rawMaterialId);
    expect(encoded.price).toBe('1885.0000');
    expect(encoded.effectiveFrom).toBeInstanceOf(Timestamp);
    expect(encoded.effectiveTo).toBeNull();
    const decoded = decodeDocument(encoded);
    expect((decoded.effectiveFrom as Date).toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});
