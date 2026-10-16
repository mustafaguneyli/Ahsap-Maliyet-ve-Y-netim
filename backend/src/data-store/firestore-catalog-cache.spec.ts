import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import {
  CATALOG_PRELOAD_COLLECTIONS,
  FirestoreCatalogCache,
  withCatalogCache,
} from './firestore-catalog-cache';
import { MemoryDocumentStore } from './memory.document-store';

describe('FirestoreCatalogCache', () => {
  it('katalog önbelleği 19 koleksiyon okur; sonraki lookup N+1 üretmez', async () => {
    const store = new MemoryDocumentStore();
    const groupId = '00000000-0000-4000-8000-000000000001';
    await store.upsert(FIRESTORE_COLLECTIONS.productGroups, groupId, {
      id: groupId,
      code: 'door_frame',
      name: 'Kapı Kasası',
      isActive: true,
    });
    const cache = await FirestoreCatalogCache.load(store);
    expect(cache.preloadReads).toBe(CATALOG_PRELOAD_COLLECTIONS.length);
    expect(CATALOG_PRELOAD_COLLECTIONS).toHaveLength(19);
    const afterLoad = store.readCount();
    expect(cache.groupByCode('door_frame')?.id).toBe(groupId);
    expect(cache.materialByCode('missing')).toBeNull();
    expect(cache.productYields('p1')).toEqual([]);
    expect(store.readCount()).toBe(afterLoad);
  });

  it('withCatalogCache aynı istekte ikinci preload yapmaz', async () => {
    const store = new MemoryDocumentStore();
    await withCatalogCache(store, async () => {
      const first = store.readCount();
      await withCatalogCache(store, async () => {
        expect(store.readCount()).toBe(first);
      });
    });
  });
});
