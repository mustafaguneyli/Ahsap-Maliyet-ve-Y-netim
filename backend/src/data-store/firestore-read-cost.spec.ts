import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { FirestoreOrderRepository } from './firestore-order-repository';
import { MemoryDocumentStore } from './memory.document-store';
import { CATALOG_PRELOAD_COLLECTIONS, FirestoreCatalogCache } from './firestore-catalog-cache';

describe('Firestore read cost', () => {
  it('sipariş listesi her sipariş için N+1 query açmaz', async () => {
    const store = new MemoryDocumentStore();
    const repo = new FirestoreOrderRepository(store);
    for (let i = 0; i < 8; i += 1) {
      await repo.create({
        header: {
          customerName: `M${i}`,
          customerAddress: null,
          taxOffice: null,
          customerPhone: null,
          taxNumber: null,
          documentDateText: '07.10.2026',
          vatRate: '0.2000',
          grossTotal: '100.000000',
          discountAmount: '0.000000',
          netTotal: '100.000000',
          vatAmount: '20.000000',
          grandTotal: '120.000000',
        },
        lines: [
          {
            lineNo: 1,
            kind: 'FREE_TEXT',
            productId: null,
            productGroupCode: null,
            productGroupName: null,
            catalogProductName: null,
            productNameText: 'Satır',
            widthMm: null,
            lengthMm: null,
            thicknessMm: null,
            decorText: null,
            productionNote: null,
            quantity: '1.000000',
            unitText: 'Adet',
            discountRate: '0.0000',
            unitPrice: '100.000000',
            lineAmount: '100.000000',
            lineDiscountAmount: '0.000000',
            priceSource: 'ENTERED',
          },
        ],
        materials: [],
      });
    }
    const before = store.readCount();
    const listed = await repo.list();
    expect(listed).toHaveLength(8);
    expect(store.readCount() - before).toBe(3);
  });

  it('tek sipariş orderDocumentId query kullanır; full scan değil', async () => {
    const store = new MemoryDocumentStore();
    const repo = new FirestoreOrderRepository(store);
    const created = await repo.create({
      header: {
        customerName: 'Tek',
        customerAddress: null,
        taxOffice: null,
        customerPhone: null,
        taxNumber: null,
        documentDateText: '07.10.2026',
        vatRate: '0.2000',
        grossTotal: '100.000000',
        discountAmount: '0.000000',
        netTotal: '100.000000',
        vatAmount: '20.000000',
        grandTotal: '120.000000',
      },
      lines: [
        {
          lineNo: 1,
          kind: 'FREE_TEXT',
          productId: null,
          productGroupCode: null,
          productGroupName: null,
          catalogProductName: null,
          productNameText: 'Satır',
          widthMm: null,
          lengthMm: null,
          thicknessMm: null,
          decorText: null,
          productionNote: null,
          quantity: '1.000000',
          unitText: 'Adet',
          discountRate: '0.0000',
          unitPrice: '100.000000',
          lineAmount: '100.000000',
          lineDiscountAmount: '0.000000',
          priceSource: 'ENTERED',
        },
      ],
      materials: [],
    });
    const before = store.readCount();
    const loaded = await repo.get(created.id);
    expect(loaded?.lines).toHaveLength(1);
    expect(store.readCount() - before).toBe(3);
  });

  it('Maliyet/Fiyat/DoorBuild katalog preload tavanı 19 read', async () => {
    const store = new MemoryDocumentStore();
    const cache = await FirestoreCatalogCache.load(store);
    expect(cache.preloadReads).toBeLessThanOrEqual(CATALOG_PRELOAD_COLLECTIONS.length);
    expect(CATALOG_PRELOAD_COLLECTIONS).not.toContain(FIRESTORE_COLLECTIONS.orderDocuments);
    expect(CATALOG_PRELOAD_COLLECTIONS).not.toContain(FIRESTORE_COLLECTIONS.auditEvents);
  });
});
