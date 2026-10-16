import { FIRESTORE_COLLECTIONS, type FirestoreCollectionName } from '../firebase/firestore.collections';

export type DataStoreModelMapping = {
  prismaModel: string;
  collection: FirestoreCollectionName;
};

/**
 * PostgreSQL modeli → mevcut Firestore koleksiyonu.
 * Yeni koleksiyon adı üretilmez; kopyalanmış yapı reuse edilir.
 */
export const DATA_STORE_MODEL_MAP: readonly DataStoreModelMapping[] = [
  { prismaModel: 'ProductGroup', collection: FIRESTORE_COLLECTIONS.productGroups },
  { prismaModel: 'Product', collection: FIRESTORE_COLLECTIONS.products },
  { prismaModel: 'ProductSize', collection: FIRESTORE_COLLECTIONS.productSizes },
  { prismaModel: 'RawMaterial', collection: FIRESTORE_COLLECTIONS.rawMaterials },
  { prismaModel: 'RawMaterialPrice', collection: FIRESTORE_COLLECTIONS.rawMaterialPrices },
  { prismaModel: 'ProductionYield', collection: FIRESTORE_COLLECTIONS.productionYields },
  { prismaModel: 'KilcikType', collection: FIRESTORE_COLLECTIONS.kilcikTypes },
  { prismaModel: 'PervazKilcikYield', collection: FIRESTORE_COLLECTIONS.pervazKilcikYields },
  { prismaModel: 'Recipe', collection: FIRESTORE_COLLECTIONS.recipes },
  { prismaModel: 'RecipeItem', collection: FIRESTORE_COLLECTIONS.recipeItems },
  { prismaModel: 'ExtraCostType', collection: FIRESTORE_COLLECTIONS.extraCostTypes },
  { prismaModel: 'ExtraCostValue', collection: FIRESTORE_COLLECTIONS.extraCostValues },
  { prismaModel: 'PricingSetting', collection: FIRESTORE_COLLECTIONS.pricingSettings },
  { prismaModel: 'PricingThicknessModifier', collection: FIRESTORE_COLLECTIONS.pricingThicknessModifiers },
  { prismaModel: 'PricingRowException', collection: FIRESTORE_COLLECTIONS.pricingRowExceptions },
  { prismaModel: 'PriceOverride', collection: FIRESTORE_COLLECTIONS.priceOverrides },
  { prismaModel: 'ProductPricingOverride', collection: FIRESTORE_COLLECTIONS.productPricingOverrides },
  { prismaModel: 'CitaPublishedPriceBand', collection: FIRESTORE_COLLECTIONS.citaPublishedPriceBands },
  {
    prismaModel: 'CitaPublishedPriceBandThickness',
    collection: FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses,
  },
  { prismaModel: 'OrderDocument', collection: FIRESTORE_COLLECTIONS.orderDocuments },
  { prismaModel: 'OrderLine', collection: FIRESTORE_COLLECTIONS.orderLines },
  { prismaModel: 'OrderMaterialLine', collection: FIRESTORE_COLLECTIONS.orderMaterialLines },
  { prismaModel: 'AuditEvent', collection: FIRESTORE_COLLECTIONS.auditEvents },
] as const;
