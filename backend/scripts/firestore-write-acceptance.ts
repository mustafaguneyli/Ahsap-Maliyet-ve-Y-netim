/**
 * Firestore mode kontrollü yazma: generic grup/ürün/ölçü/NET/recipe/extra/kâr/sipariş.
 * Read-back, sonra soft deactivate. Hard delete yok. Audit korunur.
 * Admin yoksa çalışmaz; CUTOVER YAPMA.
 */
import { Test } from '@nestjs/testing';
import { CalculatorType, MaterialPriceType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { DataStoreConfig } from '../src/data-store/data-store.config';
import { FirestoreDocumentStore } from '../src/data-store/firestore.document-store';
import { GenericRecipeFirestoreRepository } from '../src/data-store/generic-recipe-firestore.repository';
import { FirestoreOrderRepository } from '../src/data-store/firestore-order-repository';
import { FIRESTORE_COLLECTIONS } from '../src/firebase/firestore.collections';
import { FirebaseService } from '../src/firebase/firebase.service';
import { HardDeleteError } from '../src/data-store/store-errors';

function hasAdminCredential(): boolean {
  if (process.env.FIREBASE_USE_ADC === 'true') {
    return true;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return true;
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    return true;
  }
  return Boolean(
    process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim(),
  );
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function main(): Promise<void> {
  if (!hasAdminCredential()) {
    console.error('CUTOVER YAPMA / WRITE SKIP: Firestore Admin kimliği yok.');
    process.exitCode = 2;
    return;
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await moduleRef.init();
  const firebase = moduleRef.get(FirebaseService);
  const dataStore = moduleRef.get(DataStoreConfig);
  const store = moduleRef.get(FirestoreDocumentStore);
  if (!firebase.isEnabled) {
    await moduleRef.close();
    console.error('CUTOVER YAPMA: Admin SDK bağlanamadı.');
    process.exitCode = 2;
    return;
  }
  if (!dataStore.isFirestore()) {
    console.log(
      `Uyarı: süreç DATA_STORE=${dataStore.name}. Bu script DocumentStore üzerinden yazar; env postgres kalsa da Admin store kullanılır.`,
    );
  }

  const catalog = new GenericRecipeFirestoreRepository(store);
  const orders = new FirestoreOrderRepository(store);
  const materials = await store.list(FIRESTORE_COLLECTIONS.rawMaterials);
  const material = materials.find(
    (row) => row.isActive === true && String(row.code ?? '').startsWith('MDF-'),
  );
  if (!material) {
    await moduleRef.close();
    throw new Error('Aktif MDF ham madde yok; write test durdu.');
  }

  const groupCode = `FS_WRITE_${stamp()}`;
  let groupId: string | null = null;
  let productId: string | null = null;
  let recipeId: string | null = null;
  let overrideId: string | null = null;
  try {
    const created = await catalog.saveCatalog({
      mode: 'NEW_GROUP',
      newGroupCode: groupCode,
      newGroupName: 'Firestore canlı yazma',
      newProductCode: `${groupCode}_P`,
      productName: 'Canlı yazma ürünü',
      productUnit: 'ADET',
      widthMm: 90,
      lengthMm: 2100,
      recipeItems: [
        {
          rawMaterialId: String(material.id),
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1',
          newNetQty: 16,
          sortOrder: 1,
        },
      ],
      extraCosts: [
        { typeCode: 'CUTTING', amount: '3.2500', calculationMode: 'FIXED', scope: 'GROUP' },
      ],
      reason: 'live firestore write acceptance',
    });
    recipeId = created.recipeId;
    const graph = await catalog.loadActiveGenericGroup(groupCode);
    groupId = graph.group.id;
    const product = graph.products[0];
    productId = product.id;
    if (graph.group.calculatorType !== CalculatorType.GENERIC_RECIPE) {
      throw new Error('calculatorType GENERIC_RECIPE değil.');
    }
    if (product.recipes[0].items[0].productionYield?.netQty !== 16) {
      throw new Error('NET read-back 16 değil.');
    }
    const extras = await catalog.loadExtras(graph.group.id, product.id, new Date());
    if (!extras.some((row) => row.typeCode === 'CUTTING' && row.amount === '3.2500')) {
      throw new Error('Extra cost read-back başarısız.');
    }

    overrideId = store.createId();
    await store.runTransaction(async (tx) => {
      await tx.upsert(FIRESTORE_COLLECTIONS.productPricingOverrides, overrideId!, {
        id: overrideId,
        productId,
        productSizeId: created.size.id,
        profitRate: '9.0000',
        isActive: true,
        effectiveFrom: new Date(),
        effectiveTo: null,
      });
      const auditId = store.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.auditEvents, auditId, {
        id: auditId,
        entityType: 'ProductPricingOverride',
        entityId: overrideId,
        action: 'CREATE',
        fieldName: 'profitRate',
        newValue: '9.0000',
        actor: 'local-admin',
        reason: 'live firestore write acceptance',
      });
    });
    const override = await store.getById(
      FIRESTORE_COLLECTIONS.productPricingOverrides,
      overrideId,
    );
    if (String(override?.profitRate) !== '9.0000') {
      throw new Error('Kâr override read-back başarısız.');
    }

    const order = await orders.create({
      header: {
        customerName: 'FS Live Write',
        customerAddress: null,
        taxOffice: null,
        customerPhone: null,
        taxNumber: null,
        documentDateText: '07.10.2026',
        vatRate: '0.0000',
        grossTotal: '10.000000',
        discountAmount: '0.000000',
        netTotal: '10.000000',
        vatAmount: '0.000000',
        grandTotal: '10.000000',
      },
      lines: [
        {
          lineNo: 1,
          kind: 'CATALOG',
          productId,
          productGroupCode: groupCode,
          productGroupName: 'Firestore canlı yazma',
          catalogProductName: 'Canlı yazma ürünü',
          productNameText: 'Canlı yazma ürünü',
          widthMm: '90',
          lengthMm: '2100',
          thicknessMm: null,
          decorText: null,
          productionNote: null,
          quantity: '1.000000',
          unitText: 'Adet',
          discountRate: '0.0000',
          unitPrice: '10.000000',
          lineAmount: '10.000000',
          lineDiscountAmount: '0.000000',
          priceSource: 'ENTERED',
        },
      ],
      materials: [],
    });
    const readOrder = await orders.get(order.id);
    if (!readOrder || readOrder.customerName !== 'FS Live Write') {
      throw new Error('Sipariş read-back başarısız.');
    }
    void MaterialPriceType;

    if (recipeId) {
      await catalog.deactivate({
        target: 'SIZE',
        recipeId,
        reason: 'live write size off',
      });
    }
    if (productId) {
      await catalog.deactivate({
        target: 'PRODUCT',
        productId,
        reason: 'live write product off',
      });
    }
    await catalog.deactivate({
      target: 'GROUP',
      productGroupCode: groupCode,
      reason: 'live write group off',
    });

    if (groupId) {
      const closed = await store.getById(FIRESTORE_COLLECTIONS.productGroups, groupId);
      if (closed?.isActive !== false) {
        throw new Error('Grup soft deactivate olmadı.');
      }
      await store.remove(FIRESTORE_COLLECTIONS.productGroups, groupId).then(
        () => {
          throw new Error('Hard delete kabul edildi; olmamalı.');
        },
        (error) => {
          if (!(error instanceof HardDeleteError)) {
            throw error;
          }
        },
      );
    }

    const audits = await store.list(FIRESTORE_COLLECTIONS.auditEvents);
    if (
      !audits.some(
        (row) =>
          row.entityType === 'ProductGroup' &&
          (String(row.newValue) === groupCode || String(row.entityId) === groupId),
      )
    ) {
      throw new Error('Audit kaydı bulunamadı.');
    }
    console.log(`WRITE OK: ${groupCode} oluşturuldu, okundu, soft kapatıldı. Sipariş ${readOrder.orderNumber}.`);
  } finally {
    await moduleRef.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
