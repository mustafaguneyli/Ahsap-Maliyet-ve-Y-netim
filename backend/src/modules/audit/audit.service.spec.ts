import { AuditAction } from '@prisma/client';
import { DataStoreConfig } from '../../data-store/data-store.config';
import { FIRESTORE_COLLECTIONS } from '../../firebase/firestore.collections';
import { FirestoreDocumentStore } from '../../data-store/firestore.document-store';
import { AuditService } from './audit.service';

describe('AuditService firestore listRecent', () => {
  it('Prisma’ya gitmeden son kayıtları döner; effectiveTo no-op gizlenir', async () => {
    const rows = [
      {
        id: 'a-old',
        entityType: 'ProductionYield',
        entityId: 'y1',
        action: AuditAction.CREATE,
        fieldName: null,
        oldValue: null,
        newValue: '24',
        reason: 'eski',
        actor: 'local-admin',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      },
      {
        id: 'a-hidden',
        entityType: 'RawMaterialPrice',
        entityId: 'p1',
        action: AuditAction.UPDATE,
        fieldName: 'effectiveTo',
        oldValue: null,
        newValue: '2026-10-08',
        reason: 'kapanış',
        actor: 'local-admin',
        createdAt: new Date('2026-10-08T12:00:00.000Z'),
      },
      {
        id: 'a-new',
        entityType: 'ProductPricingOverride',
        entityId: 'o1',
        action: AuditAction.CREATE,
        fieldName: 'profitRate',
        oldValue: '20',
        newValue: '25',
        reason: 'Cutover profit override test 20->25',
        actor: 'local-admin',
        createdAt: new Date('2026-10-08T11:00:00.000Z'),
      },
    ];
    const prisma = { auditEvent: { findMany: jest.fn() } };
    const dataStore = { isFirestore: () => true } as DataStoreConfig;
    const firestoreStore = {
      list: jest.fn(async (collection: string) => {
        expect(collection).toBe(FIRESTORE_COLLECTIONS.auditEvents);
        return rows;
      }),
    };
    const service = new AuditService(
      prisma as never,
      dataStore,
      firestoreStore as unknown as FirestoreDocumentStore,
    );
    const result = await service.listRecent(8);
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.id)).toEqual(['a-new', 'a-old']);
    expect(result.items[0].summary).toBe('Ölçü kâr oranı güncellendi');
  });
});
