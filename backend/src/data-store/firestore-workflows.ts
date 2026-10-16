import { FIRESTORE_COLLECTIONS, type FirestoreCollectionName } from '../firebase/firestore.collections';

export type AtomicWorkflow = {
  name: string;
  source: string;
  writes: readonly FirestoreCollectionName[];
};

/**
 * Prisma `$transaction` akışlarının Firestore `runTransaction` karşılığı.
 * Business service'ler henüz Prisma kullanır; Firestore yazımı bu atomik birimleri korumalıdır.
 */
export const FIRESTORE_ATOMIC_WORKFLOWS: readonly AtomicWorkflow[] = [
  {
    name: 'NEW_GROUP',
    source: 'generic-recipe.service.ts saveNewGroup',
    writes: [
      FIRESTORE_COLLECTIONS.productGroups,
      FIRESTORE_COLLECTIONS.products,
      FIRESTORE_COLLECTIONS.productSizes,
      FIRESTORE_COLLECTIONS.recipes,
      FIRESTORE_COLLECTIONS.recipeItems,
      FIRESTORE_COLLECTIONS.auditEvents,
    ],
  },
  {
    name: 'NEW_PRODUCT',
    source: 'generic-recipe.service.ts / catalog-items.service.ts',
    writes: [
      FIRESTORE_COLLECTIONS.products,
      FIRESTORE_COLLECTIONS.productSizes,
      FIRESTORE_COLLECTIONS.recipes,
      FIRESTORE_COLLECTIONS.recipeItems,
      FIRESTORE_COLLECTIONS.auditEvents,
    ],
  },
  {
    name: 'NEW_SIZE',
    source: 'catalog-items.service.ts createNewSizeInTx',
    writes: [
      FIRESTORE_COLLECTIONS.productSizes,
      FIRESTORE_COLLECTIONS.recipes,
      FIRESTORE_COLLECTIONS.productionYields,
      FIRESTORE_COLLECTIONS.auditEvents,
    ],
  },
  {
    name: 'PRODUCTION_YIELD_CREATE_REPLACE',
    source: 'production-yields.service.ts',
    writes: [FIRESTORE_COLLECTIONS.productionYields, FIRESTORE_COLLECTIONS.auditEvents],
  },
  {
    name: 'RECIPE_ITEM_UPDATE',
    source: 'generic-recipe.service.ts',
    writes: [FIRESTORE_COLLECTIONS.recipes, FIRESTORE_COLLECTIONS.recipeItems, FIRESTORE_COLLECTIONS.auditEvents],
  },
  {
    name: 'EXTRA_COST_VALUE_VERSION',
    source: 'extra-costs.service.ts',
    writes: [FIRESTORE_COLLECTIONS.extraCostValues, FIRESTORE_COLLECTIONS.auditEvents],
  },
  {
    name: 'RAW_MATERIAL_PRICE',
    source: 'raw-materials.service.ts',
    writes: [FIRESTORE_COLLECTIONS.rawMaterials, FIRESTORE_COLLECTIONS.rawMaterialPrices, FIRESTORE_COLLECTIONS.auditEvents],
  },
  {
    name: 'PRICING_SETTING_VERSION',
    source: 'pricing-settings.service.ts',
    writes: [FIRESTORE_COLLECTIONS.pricingSettings, FIRESTORE_COLLECTIONS.auditEvents],
  },
  {
    name: 'PRICE_OVERRIDE_VERSION',
    source: 'price-overrides.service.ts',
    writes: [FIRESTORE_COLLECTIONS.priceOverrides, FIRESTORE_COLLECTIONS.auditEvents],
  },
  {
    name: 'PRODUCT_PRICING_OVERRIDE',
    source: 'product-pricing-override.service.ts',
    writes: [FIRESTORE_COLLECTIONS.productPricingOverrides, FIRESTORE_COLLECTIONS.auditEvents],
  },
  {
    name: 'DEACTIVATE_CATALOG',
    source: 'generic-recipe.service.ts deactivateCatalogItem',
    writes: [
      FIRESTORE_COLLECTIONS.productGroups,
      FIRESTORE_COLLECTIONS.products,
      FIRESTORE_COLLECTIONS.recipes,
      FIRESTORE_COLLECTIONS.auditEvents,
    ],
  },
  {
    name: 'ORDER_DOCUMENT_UPSERT',
    source: 'order-documents.service.ts',
    writes: [
      FIRESTORE_COLLECTIONS.orderDocuments,
      FIRESTORE_COLLECTIONS.orderLines,
      FIRESTORE_COLLECTIONS.orderMaterialLines,
    ],
  },
];
