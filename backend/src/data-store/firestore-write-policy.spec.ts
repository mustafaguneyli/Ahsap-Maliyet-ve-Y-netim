import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { newEntityId } from '../firebase/firestore-ids';
import {
  assertAuditHasCompanionWrite,
  assertWritePolicy,
  isNoOpDocument,
} from './firestore-write-policy';
import { AppendOnlyError, HardDeleteError, OrphanAuditError } from './store-errors';

describe('firestore-write-policy', () => {
  it('audit güncelleme ve silmeyi reddeder', () => {
    const id = newEntityId();
    expect(() =>
      assertWritePolicy(FIRESTORE_COLLECTIONS.auditEvents, { id, action: 'CREATE' }, { id, action: 'UPDATE' }),
    ).toThrow(AppendOnlyError);
    expect(() => assertWritePolicy(FIRESTORE_COLLECTIONS.auditEvents, { id }, null)).toThrow(AppendOnlyError);
    expect(() => assertWritePolicy(FIRESTORE_COLLECTIONS.auditEvents, null, { id, action: 'CREATE' })).not.toThrow();
  });

  it('generic ürün hard delete yerine soft-deactivate ister', () => {
    expect(() =>
      assertWritePolicy(FIRESTORE_COLLECTIONS.products, { id: 'p1', isActive: true }, null),
    ).toThrow(HardDeleteError);
    expect(() =>
      assertWritePolicy(
        FIRESTORE_COLLECTIONS.products,
        { id: 'p1', isActive: true },
        { id: 'p1', isActive: false },
      ),
    ).not.toThrow();
  });

  it('sipariş başlığı ve ölçü hard delete edilmez; satır snapshot güncellemede silinebilir', () => {
    expect(() =>
      assertWritePolicy(FIRESTORE_COLLECTIONS.orderDocuments, { id: 'o1' }, null),
    ).toThrow(HardDeleteError);
    expect(() =>
      assertWritePolicy(FIRESTORE_COLLECTIONS.productSizes, { id: 's1' }, null),
    ).toThrow(HardDeleteError);
    expect(() =>
      assertWritePolicy(FIRESTORE_COLLECTIONS.orderLines, { id: 'l1' }, null),
    ).not.toThrow();
  });

  it('no-op belge audit üretmez; orphan audit reddedilir', () => {
    const product = { id: 'p1', isActive: false, name: 'X' };
    expect(isNoOpDocument(product, { ...product, updatedAt: new Date() })).toBe(true);
    expect(() =>
      assertAuditHasCompanionWrite([
        { collection: FIRESTORE_COLLECTIONS.products, previous: product, next: product },
        { collection: FIRESTORE_COLLECTIONS.auditEvents, previous: null, next: { id: 'a1' } },
      ]),
    ).toThrow(OrphanAuditError);
  });

  it('asıl değişiklik ile aynı işlemde audit kabul edilir', () => {
    expect(() =>
      assertAuditHasCompanionWrite([
        {
          collection: FIRESTORE_COLLECTIONS.products,
          previous: { id: 'p1', isActive: true },
          next: { id: 'p1', isActive: false },
        },
        { collection: FIRESTORE_COLLECTIONS.auditEvents, previous: null, next: { id: 'a1' } },
      ]),
    ).not.toThrow();
  });
});
