import { FIRESTORE_COLLECTIONS, type FirestoreCollectionName } from '../firebase/firestore.collections';

export type FirestoreEqualityOp = '==' | 'in';

export type FirestoreQueryFilter = {
  field: string;
  op: FirestoreEqualityOp;
  value: unknown;
};

export type FirestoreRuntimeIndex = {
  collectionGroup: FirestoreCollectionName;
  fields: Array<{ fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }>;
  usedBy: string;
};

/**
 * Runtime Firestore sorguları. Composite index yalnız bu listeden üretilir.
 * Full-collection list() katalog önbelleği içindir; index kaçırmak için scan yapılmaz.
 */
export const FIRESTORE_RUNTIME_INDEXES: readonly FirestoreRuntimeIndex[] = [
  {
    collectionGroup: FIRESTORE_COLLECTIONS.products,
    fields: [
      { fieldPath: 'productGroupId', order: 'ASCENDING' },
      { fieldPath: 'code', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'product by group+code',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.products,
    fields: [
      { fieldPath: 'productGroupId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'active products in group',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.rawMaterials,
    fields: [
      { fieldPath: 'code', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'material by code',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.rawMaterialPrices,
    fields: [
      { fieldPath: 'rawMaterialId', order: 'ASCENDING' },
      { fieldPath: 'priceType', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
      { fieldPath: 'effectiveFrom', order: 'DESCENDING' },
    ],
    usedBy: 'current material price',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.productionYields,
    fields: [
      { fieldPath: 'rawMaterialId', order: 'ASCENDING' },
      { fieldPath: 'pieceWidthMm', order: 'ASCENDING' },
      { fieldPath: 'pieceLengthMm', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'NET lookup',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.productionYields,
    fields: [
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'product MASTER yields',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.recipes,
    fields: [
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'productSizeId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'recipe by product+size',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.recipeItems,
    fields: [
      { fieldPath: 'recipeId', order: 'ASCENDING' },
      { fieldPath: 'sortOrder', order: 'ASCENDING' },
    ],
    usedBy: 'recipe items',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.extraCostValues,
    fields: [
      { fieldPath: 'productGroupId', order: 'ASCENDING' },
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
      { fieldPath: 'effectiveFrom', order: 'DESCENDING' },
    ],
    usedBy: 'group/product extra costs',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.extraCostValues,
    fields: [
      { fieldPath: 'extraCostTypeId', order: 'ASCENDING' },
      { fieldPath: 'productGroupId', order: 'ASCENDING' },
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
      { fieldPath: 'effectiveFrom', order: 'DESCENDING' },
    ],
    usedBy: 'PP wrapping extra cost',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.pricingThicknessModifiers,
    fields: [
      { fieldPath: 'productGroupId', order: 'ASCENDING' },
      { fieldPath: 'modifierType', order: 'ASCENDING' },
      { fieldPath: 'thicknessMm', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'decorative thickness rate',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.pricingRowExceptions,
    fields: [
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'thicknessMm', order: 'ASCENDING' },
      { fieldPath: 'widthMm', order: 'ASCENDING' },
      { fieldPath: 'lengthMm', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'row exception exact size',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.pricingSettings,
    fields: [
      { fieldPath: 'productGroupId', order: 'ASCENDING' },
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'pricing settings scope',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.pricingRowExceptions,
    fields: [
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'row exceptions by product',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.priceOverrides,
    fields: [
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'productSizeId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'published cash override',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.productPricingOverrides,
    fields: [
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'profit size/product override',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.citaPublishedPriceBands,
    fields: [
      { fieldPath: 'productGroupId', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'cita published bands',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses,
    fields: [
      { fieldPath: 'bandId', order: 'ASCENDING' },
      { fieldPath: 'thicknessMm', order: 'ASCENDING' },
    ],
    usedBy: 'cita band thicknesses',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.orderLines,
    fields: [
      { fieldPath: 'orderDocumentId', order: 'ASCENDING' },
      { fieldPath: 'lineNo', order: 'ASCENDING' },
    ],
    usedBy: 'order lines',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.orderMaterialLines,
    fields: [
      { fieldPath: 'orderDocumentId', order: 'ASCENDING' },
      { fieldPath: 'lineNo', order: 'ASCENDING' },
    ],
    usedBy: 'order material lines',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.auditEvents,
    fields: [
      { fieldPath: 'entityType', order: 'ASCENDING' },
      { fieldPath: 'entityId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
    usedBy: 'audit by entity',
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.pervazKilcikYields,
    fields: [
      { fieldPath: 'productId', order: 'ASCENDING' },
      { fieldPath: 'pervazThicknessMm', order: 'ASCENDING' },
      { fieldPath: 'pieceLengthMm', order: 'ASCENDING' },
      { fieldPath: 'isActive', order: 'ASCENDING' },
    ],
    usedBy: 'pervaz kılçık NET',
  },
];

export function toFirestoreIndexesJson(): {
  indexes: Array<{
    collectionGroup: string;
    queryScope: 'COLLECTION';
    fields: Array<{ fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }>;
  }>;
  fieldOverrides: [];
} {
  return {
    indexes: FIRESTORE_RUNTIME_INDEXES.map((index) => ({
      collectionGroup: index.collectionGroup,
      queryScope: 'COLLECTION' as const,
      fields: index.fields,
    })),
    fieldOverrides: [],
  };
}

export function matchesQuery(
  doc: Record<string, unknown>,
  filters: readonly FirestoreQueryFilter[],
): boolean {
  return filters.every((filter) => {
    const value = doc[filter.field] ?? null;
    if (filter.op === '==') {
      return value === filter.value || (filter.value == null && (value == null || value === ''));
    }
    return Array.isArray(filter.value) && filter.value.includes(value);
  });
}
