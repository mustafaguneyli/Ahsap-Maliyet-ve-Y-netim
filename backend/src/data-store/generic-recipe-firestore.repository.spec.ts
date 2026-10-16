import { CalculatorType, MaterialPriceType } from '@prisma/client';
import { GenericRecipeFirestoreRepository } from './generic-recipe-firestore.repository';
import { MemoryDocumentStore } from './memory.document-store';

describe('GenericRecipeFirestoreRepository', () => {
  async function seedStore() {
    const store = new MemoryDocumentStore();
    const materialId = store.createId();
    const typeId = store.createId();
    await store.upsert('raw_materials', materialId, {
      id: materialId,
      code: 'MDF-18',
      name: '18 mm MDF',
      thicknessMm: '18.00',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      priceBasis: 'SHEET',
      isActive: true,
    });
    await store.upsert('raw_material_prices', store.createId(), {
      id: store.createId(),
      rawMaterialId: materialId,
      priceType: MaterialPriceType.CARD_INSTALLMENT,
      price: '1200.0000',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    });
    await store.upsert('extra_cost_types', typeId, {
      id: typeId,
      code: 'CUTTING',
      name: 'Kesim',
      isActive: true,
    });
    return { store, materialId, typeId, repo: new GenericRecipeFirestoreRepository(store) };
  }

  it('NEW_GROUP + copy NEW_SIZE + ExtraCost product>group + soft remove', async () => {
    const { store, materialId, repo } = await seedStore();
    const created = await repo.saveCatalog({
      mode: 'NEW_GROUP',
      newGroupCode: 'MUTFAK_PROFILLERI',
      newGroupName: 'Mutfak Profilleri',
      newProductCode: 'X_PROFIL',
      productName: 'X Profil',
      productUnit: 'ADET',
      widthMm: 100,
      lengthMm: 2100,
      displayName: '10×210',
      recipeItems: [
        {
          rawMaterialId: materialId,
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1',
          newNetQty: 24,
          sortOrder: 1,
        },
      ],
      extraCosts: [
        { typeCode: 'CUTTING', amount: '5.0000', calculationMode: 'FIXED', scope: 'GROUP' },
      ],
    });
    expect(created.mode).toBe('NEW_GROUP');
    expect(created.recipeId).toBeTruthy();

    const copied = await repo.saveCatalog({
      mode: 'NEW_SIZE',
      productGroupCode: 'MUTFAK_PROFILLERI',
      productCode: 'X_PROFIL',
      widthMm: 120,
      lengthMm: 2100,
      copyRecipeFromSizeId: created.size.id,
    });
    expect(copied.mode).toBe('NEW_SIZE');
    expect(copied.recipeId).not.toBe(created.recipeId);

    await repo.saveCatalog({
      mode: 'NEW_PRODUCT',
      productGroupCode: 'MUTFAK_PROFILLERI',
      newProductCode: 'Y_PROFIL',
      productName: 'Y Profil',
      widthMm: 100,
      lengthMm: 2100,
      recipeItems: [
        {
          rawMaterialId: materialId,
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1',
          newNetQty: 24,
          sortOrder: 1,
        },
      ],
      extraCosts: [
        { typeCode: 'CUTTING', amount: '8.0000', calculationMode: 'FIXED', scope: 'PRODUCT' },
      ],
    });

    const graph = await repo.loadActiveGenericGroup('MUTFAK_PROFILLERI');
    expect(graph.group.calculatorType).toBe(CalculatorType.GENERIC_RECIPE);
    const x = graph.products.find((row) => row.code === 'X_PROFIL');
    const y = graph.products.find((row) => row.code === 'Y_PROFIL');
    expect(x?.recipes).toHaveLength(2);
    const now = new Date();
    const groupExtras = await repo.loadExtras(graph.group.id, x!.id, now);
    const productExtras = await repo.loadExtras(graph.group.id, y!.id, now);
    expect(groupExtras).toEqual([
      expect.objectContaining({ typeCode: 'CUTTING', amount: '5.0000', scope: 'GROUP' }),
    ]);
    expect(productExtras).toEqual([
      expect.objectContaining({ typeCode: 'CUTTING', amount: '8.0000', scope: 'PRODUCT' }),
    ]);

    const previewItems = await repo.resolvePreviewItems(
      [
        {
          rawMaterialId: materialId,
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1',
          newNetQty: 24,
          sortOrder: 1,
        },
      ],
      now,
      MaterialPriceType.CARD_INSTALLMENT,
    );
    expect(previewItems[0].netQty).toBe(24);
    expect(previewItems[0].unitPrice).toBe('1200.0000');

    const sizeOff = await repo.deactivate({ target: 'SIZE', recipeId: created.recipeId });
    expect(sizeOff.changed).toBe(true);
    const afterSize = await repo.loadActiveGenericGroup('MUTFAK_PROFILLERI');
    const xAfter = afterSize.products.find((row) => row.code === 'X_PROFIL');
    expect(xAfter?.recipes).toHaveLength(1);

    await expect(
      repo.deactivate({ target: 'GROUP', productGroupCode: 'MUTFAK_PROFILLERI' }),
    ).rejects.toThrow('Önce gruptaki aktif ürünleri kaldırın.');

    await repo.deactivate({ target: 'PRODUCT', productId: xAfter!.id });
    await repo.deactivate({ target: 'PRODUCT', productId: y!.id });
    const groupOff = await repo.deactivate({
      target: 'GROUP',
      productGroupCode: 'MUTFAK_PROFILLERI',
    });
    expect(groupOff.changed).toBe(true);

    const sizes = await store.list('product_sizes');
    expect(sizes.length).toBeGreaterThan(0);
  });
});
