import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { DATA_STORE_MODEL_MAP } from './data-store.mapping';

describe('DATA_STORE_MODEL_MAP', () => {
  it('her Firestore koleksiyonu tam bir Prisma modeli ile eşleşir', () => {
    const mapped = new Set(DATA_STORE_MODEL_MAP.map((item) => item.collection));
    const defined = new Set(Object.values(FIRESTORE_COLLECTIONS));
    expect(mapped).toEqual(defined);
  });

  it('yeni duplicate koleksiyon adı üretmez', () => {
    const names = DATA_STORE_MODEL_MAP.map((item) => item.collection);
    expect(new Set(names).size).toBe(names.length);
  });
});
