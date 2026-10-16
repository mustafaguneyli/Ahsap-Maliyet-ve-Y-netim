import { CalculatorType, MaterialPriceType } from '@prisma/client';
import { GenericRecipeFirestoreRepository } from './generic-recipe-firestore.repository';
import { FirestoreOrderRepository } from './firestore-order-repository';
import { MemoryDocumentStore } from './memory.document-store';
import { AppendOnlyError, HardDeleteError } from './store-errors';
import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';

describe('Firestore write acceptance — soft deactivate, audit, hard delete yok', () => {
  async function seedStore() {
    const store = new MemoryDocumentStore();
    const materialId = store.createId();
    const typeId = store.createId();
    const priceId = store.createId();
    await store.upsert(FIRESTORE_COLLECTIONS.rawMaterials, materialId, {
      id: materialId,
      code: 'MDF-18-WRITE-TEST',
      name: '18 mm yazma testi',
      thicknessMm: '18.00',
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      priceBasis: 'SHEET',
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.rawMaterialPrices, priceId, {
      id: priceId,
      rawMaterialId: materialId,
      priceType: MaterialPriceType.CARD_INSTALLMENT,
      price: '1500.0000',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    });
    await store.upsert(FIRESTORE_COLLECTIONS.extraCostTypes, typeId, {
      id: typeId,
      code: 'CUTTING',
      name: 'Kesim',
      isActive: true,
    });
    return {
      store,
      materialId,
      catalog: new GenericRecipeFirestoreRepository(store),
      orders: new FirestoreOrderRepository(store),
    };
  }

  it('grup/ürün/ölçü/NET/recipe/extra/kâr/sipariş yazılır, okunur, soft kapanır', async () => {
    const { store, materialId, catalog, orders } = await seedStore();
    const created = await catalog.saveCatalog({
      mode: 'NEW_GROUP',
      newGroupCode: 'FS_WRITE_ACCEPT',
      newGroupName: 'Firestore Yazma Kabul',
      newProductCode: 'FS_WRITE_PRODUCT',
      productName: 'Yazma ürünü',
      productUnit: 'ADET',
      widthMm: 80,
      lengthMm: 2100,
      displayName: '8×210',
      recipeItems: [
        {
          rawMaterialId: materialId,
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1',
          newNetQty: 18,
          sortOrder: 1,
        },
      ],
      extraCosts: [
        { typeCode: 'CUTTING', amount: '7.5000', calculationMode: 'FIXED', scope: 'GROUP' },
      ],
      reason: 'Firestore write acceptance',
    });
    expect(created.mode).toBe('NEW_GROUP');
    expect(created.recipeId).toBeTruthy();

    const graph = await catalog.loadActiveGenericGroup('FS_WRITE_ACCEPT');
    expect(graph.group.calculatorType).toBe(CalculatorType.GENERIC_RECIPE);
    const product = graph.products.find((row) => row.code === 'FS_WRITE_PRODUCT');
    expect(product).toBeTruthy();
    expect(product!.recipes).toHaveLength(1);
    expect(product!.recipes[0].items[0].productionYield?.netQty).toBe(18);

    const extras = await catalog.loadExtras(graph.group.id, product!.id, new Date());
    expect(extras).toEqual([
      expect.objectContaining({ typeCode: 'CUTTING', amount: '7.5000', scope: 'GROUP' }),
    ]);

    const overrideId = store.createId();
    await store.runTransaction(async (tx) => {
      await tx.upsert(FIRESTORE_COLLECTIONS.productPricingOverrides, overrideId, {
        id: overrideId,
        productId: product!.id,
        productSizeId: created.size.id,
        profitRate: '11.0000',
        isActive: true,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: null,
      });
      const auditId = store.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.auditEvents, auditId, {
        id: auditId,
        entityType: 'ProductPricingOverride',
        entityId: overrideId,
        action: 'CREATE',
        fieldName: 'profitRate',
        oldValue: null,
        newValue: '11.0000',
        reason: 'Firestore write acceptance kâr',
        actor: 'local-admin',
      });
    });
    const override = await store.getById(
      FIRESTORE_COLLECTIONS.productPricingOverrides,
      overrideId,
    );
    expect(override?.profitRate).toBe('11.0000');
    expect(override?.isActive).toBe(true);

    const order = await orders.create({
      header: {
        customerName: 'FS Write Test',
        customerAddress: null,
        taxOffice: null,
        customerPhone: null,
        taxNumber: null,
        documentDateText: '07.10.2026',
        vatRate: '0.2000',
        grossTotal: '50.000000',
        discountAmount: '0.000000',
        netTotal: '50.000000',
        vatAmount: '10.000000',
        grandTotal: '60.000000',
      },
      lines: [
        {
          lineNo: 1,
          kind: 'CATALOG',
          productId: product!.id,
          productGroupCode: 'FS_WRITE_ACCEPT',
          productGroupName: 'Firestore Yazma Kabul',
          catalogProductName: 'Yazma ürünü',
          productNameText: 'Yazma ürünü',
          widthMm: '80',
          lengthMm: '2100',
          thicknessMm: null,
          decorText: null,
          productionNote: null,
          quantity: '1.000000',
          unitText: 'Adet',
          discountRate: '0.0000',
          unitPrice: '50.000000',
          lineAmount: '50.000000',
          lineDiscountAmount: '0.000000',
          priceSource: 'ENTERED',
        },
      ],
      materials: [],
    });
    const readBack = await orders.get(order.id);
    expect(readBack?.orderNumber).toMatch(/^SP-\d{6}$/);
    expect(readBack?.lines[0].productId).toBe(product!.id);
    expect(readBack?.customerName).toBe('FS Write Test');

    await catalog.deactivate({
      target: 'SIZE',
      recipeId: created.recipeId,
      reason: 'write acceptance size off',
    });
    await catalog.deactivate({
      target: 'PRODUCT',
      productId: product!.id,
      reason: 'write acceptance product off',
    });
    const groupOff = await catalog.deactivate({
      target: 'GROUP',
      productGroupCode: 'FS_WRITE_ACCEPT',
      reason: 'write acceptance group off',
    });
    expect(groupOff.changed).toBe(true);

    const closedGroup = await store.getById(
      FIRESTORE_COLLECTIONS.productGroups,
      graph.group.id,
    );
    expect(closedGroup?.isActive).toBe(false);
    const closedProduct = await store.getById(FIRESTORE_COLLECTIONS.products, product!.id);
    expect(closedProduct?.isActive).toBe(false);
    const closedRecipe = await store.getById(
      FIRESTORE_COLLECTIONS.recipes,
      created.recipeId,
    );
    expect(closedRecipe?.isActive).toBe(false);

    await expect(store.remove(FIRESTORE_COLLECTIONS.productGroups, graph.group.id)).rejects.toBeInstanceOf(
      HardDeleteError,
    );
    await expect(store.remove(FIRESTORE_COLLECTIONS.products, product!.id)).rejects.toBeInstanceOf(
      HardDeleteError,
    );
    await expect(
      store.remove(FIRESTORE_COLLECTIONS.productPricingOverrides, overrideId),
    ).rejects.toBeInstanceOf(HardDeleteError);
    await expect(store.remove(FIRESTORE_COLLECTIONS.orderDocuments, order.id)).rejects.toBeInstanceOf(
      HardDeleteError,
    );

    const audits = await store.list(FIRESTORE_COLLECTIONS.auditEvents);
    expect(audits.length).toBeGreaterThanOrEqual(6);
    expect(audits.some((row) => row.entityType === 'ProductGroup' && row.action === 'CREATE')).toBe(
      true,
    );
    expect(
      audits.some((row) => row.entityType === 'ProductPricingOverride' && row.action === 'CREATE'),
    ).toBe(true);
    expect(audits.some((row) => row.entityType === 'OrderDocument' && row.action === 'CREATE')).toBe(
      true,
    );
    const firstAuditId = String(audits[0].id);
    await expect(
      store.remove(FIRESTORE_COLLECTIONS.auditEvents, firstAuditId),
    ).rejects.toBeInstanceOf(AppendOnlyError);
    expect((await store.list(FIRESTORE_COLLECTIONS.auditEvents)).length).toBe(audits.length);
  });
});
