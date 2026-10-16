import { assertFkIds, isUuid, newEntityId, requireEntityId, requireMatchingDocumentId } from './firestore-ids';

describe('firestore-ids', () => {
  it('yeni kayıt için UUID v4 üretir', () => {
    const id = newEntityId();
    expect(isUuid(id)).toBe(true);
    expect(id).not.toBe(newEntityId());
  });

  it('eksik id ile rastgele belge üretmez', () => {
    expect(() => requireEntityId(undefined)).toThrow(/mevcut UUID/);
    expect(() => requireEntityId('auto')).toThrow(/mevcut UUID/);
  });

  it('belge kimliği ile kayıt id sapmasını reddeder', () => {
    const a = newEntityId();
    const b = newEntityId();
    expect(requireMatchingDocumentId(a, a)).toBe(a);
    expect(() => requireMatchingDocumentId(a, b)).toThrow(/aynı UUID/);
  });

  it('FK alanlarında taşınmış UUID’yi korur', () => {
    const productGroupId = newEntityId();
    expect(() => assertFkIds({ productGroupId, productId: null })).not.toThrow();
    expect(() => assertFkIds({ productId: 'new-random' })).toThrow(/productId/);
  });
});
