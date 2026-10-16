import { FIRESTORE_COLLECTIONS, type FirestoreCollectionName } from '../firebase/firestore.collections';
import { assertFkIds, requireMatchingDocumentId } from '../firebase/firestore-ids';
import { encodeDateFields, decodeDateFields } from '../firebase/firestore-dates';
import { encodeMoneyFields } from '../firebase/firestore-money';
import { Timestamp } from 'firebase-admin/firestore';

const HAS_CREATED_AT = new Set<FirestoreCollectionName>([
  FIRESTORE_COLLECTIONS.productGroups,
  FIRESTORE_COLLECTIONS.products,
  FIRESTORE_COLLECTIONS.productSizes,
  FIRESTORE_COLLECTIONS.rawMaterials,
  FIRESTORE_COLLECTIONS.rawMaterialPrices,
  FIRESTORE_COLLECTIONS.productionYields,
  FIRESTORE_COLLECTIONS.kilcikTypes,
  FIRESTORE_COLLECTIONS.pervazKilcikYields,
  FIRESTORE_COLLECTIONS.recipes,
  FIRESTORE_COLLECTIONS.recipeItems,
  FIRESTORE_COLLECTIONS.extraCostValues,
  FIRESTORE_COLLECTIONS.pricingSettings,
  FIRESTORE_COLLECTIONS.pricingThicknessModifiers,
  FIRESTORE_COLLECTIONS.pricingRowExceptions,
  FIRESTORE_COLLECTIONS.priceOverrides,
  FIRESTORE_COLLECTIONS.productPricingOverrides,
  FIRESTORE_COLLECTIONS.citaPublishedPriceBands,
  FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses,
  FIRESTORE_COLLECTIONS.orderDocuments,
  FIRESTORE_COLLECTIONS.orderLines,
  FIRESTORE_COLLECTIONS.orderMaterialLines,
  FIRESTORE_COLLECTIONS.auditEvents,
]);

const HAS_UPDATED_AT = new Set<FirestoreCollectionName>([
  FIRESTORE_COLLECTIONS.productGroups,
  FIRESTORE_COLLECTIONS.products,
  FIRESTORE_COLLECTIONS.productSizes,
  FIRESTORE_COLLECTIONS.rawMaterials,
  FIRESTORE_COLLECTIONS.productionYields,
  FIRESTORE_COLLECTIONS.kilcikTypes,
  FIRESTORE_COLLECTIONS.pervazKilcikYields,
  FIRESTORE_COLLECTIONS.recipes,
  FIRESTORE_COLLECTIONS.recipeItems,
  FIRESTORE_COLLECTIONS.pricingSettings,
  FIRESTORE_COLLECTIONS.pricingThicknessModifiers,
  FIRESTORE_COLLECTIONS.pricingRowExceptions,
  FIRESTORE_COLLECTIONS.priceOverrides,
  FIRESTORE_COLLECTIONS.productPricingOverrides,
  FIRESTORE_COLLECTIONS.citaPublishedPriceBands,
  FIRESTORE_COLLECTIONS.orderDocuments,
]);

export function encodeDocument(
  collection: FirestoreCollectionName,
  documentId: string,
  data: Record<string, unknown>,
  previous: Record<string, unknown> | null,
): Record<string, unknown> {
  const id = requireMatchingDocumentId(documentId, data.id ?? documentId);
  const withId: Record<string, unknown> = { ...data, id };
  assertFkIds(withId);

  const now = Timestamp.now();
  if (HAS_CREATED_AT.has(collection) && withId.createdAt == null) {
    withId.createdAt = previous?.createdAt ?? now;
  }
  if (HAS_UPDATED_AT.has(collection)) {
    withId.updatedAt = now;
  }

  return encodeDateFields(encodeMoneyFields(collection, withId));
}

export function decodeDocument(data: Record<string, unknown>): Record<string, unknown> {
  return decodeDateFields(data);
}
