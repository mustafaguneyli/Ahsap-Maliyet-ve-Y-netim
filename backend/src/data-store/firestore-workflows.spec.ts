import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { FIRESTORE_ATOMIC_WORKFLOWS } from './firestore-workflows';

describe('FIRESTORE_ATOMIC_WORKFLOWS', () => {
  it('ürün grubu / ürün / ölçü / reçete / audit aynı transaction’dadır', () => {
    const group = FIRESTORE_ATOMIC_WORKFLOWS.find((item) => item.name === 'NEW_GROUP');
    expect(group?.writes).toEqual(
      expect.arrayContaining([
        FIRESTORE_COLLECTIONS.productGroups,
        FIRESTORE_COLLECTIONS.products,
        FIRESTORE_COLLECTIONS.productSizes,
        FIRESTORE_COLLECTIONS.recipes,
        FIRESTORE_COLLECTIONS.recipeItems,
        FIRESTORE_COLLECTIONS.auditEvents,
      ]),
    );
  });

  it('katalog kaldırma soft-deactivate + audit aynı transaction’dadır', () => {
    const deactivate = FIRESTORE_ATOMIC_WORKFLOWS.find((item) => item.name === 'DEACTIVATE_CATALOG');
    expect(deactivate?.writes).toEqual(
      expect.arrayContaining([
        FIRESTORE_COLLECTIONS.recipes,
        FIRESTORE_COLLECTIONS.products,
        FIRESTORE_COLLECTIONS.auditEvents,
      ]),
    );
  });

  it('yarım ürün bırakacak tek-yazımlı katalog akışı tanımlamaz', () => {
    for (const workflow of FIRESTORE_ATOMIC_WORKFLOWS.filter((item) =>
      ['NEW_GROUP', 'NEW_PRODUCT', 'NEW_SIZE'].includes(item.name),
    )) {
      expect(workflow.writes.length).toBeGreaterThan(1);
    }
  });
});
