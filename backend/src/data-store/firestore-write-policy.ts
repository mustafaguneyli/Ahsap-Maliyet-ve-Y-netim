import { FIRESTORE_COLLECTIONS, type FirestoreCollectionName } from '../firebase/firestore.collections';
import { AppendOnlyError, HardDeleteError, OrphanAuditError } from './store-errors';

/** isActive=false ile kapanır; hard delete yok. */
export const SOFT_DELETE_COLLECTIONS = new Set<FirestoreCollectionName>([
  FIRESTORE_COLLECTIONS.productGroups,
  FIRESTORE_COLLECTIONS.products,
  FIRESTORE_COLLECTIONS.rawMaterials,
  FIRESTORE_COLLECTIONS.rawMaterialPrices,
  FIRESTORE_COLLECTIONS.productionYields,
  FIRESTORE_COLLECTIONS.kilcikTypes,
  FIRESTORE_COLLECTIONS.pervazKilcikYields,
  FIRESTORE_COLLECTIONS.recipes,
  FIRESTORE_COLLECTIONS.extraCostTypes,
  FIRESTORE_COLLECTIONS.extraCostValues,
  FIRESTORE_COLLECTIONS.pricingSettings,
  FIRESTORE_COLLECTIONS.pricingThicknessModifiers,
  FIRESTORE_COLLECTIONS.pricingRowExceptions,
  FIRESTORE_COLLECTIONS.priceOverrides,
  FIRESTORE_COLLECTIONS.productPricingOverrides,
  FIRESTORE_COLLECTIONS.citaPublishedPriceBands,
]);

const VOLATILE_FIELDS = new Set(['updatedAt', 'createdAt']);

function stableClone(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(doc).sort()) {
    if (VOLATILE_FIELDS.has(key)) {
      continue;
    }
    const value = doc[key];
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

export function isNoOpDocument(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
): boolean {
  if (previous == null || next == null) {
    return false;
  }
  return JSON.stringify(stableClone(previous)) === JSON.stringify(stableClone(next));
}

export function assertWritePolicy(
  collection: FirestoreCollectionName,
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
): void {
  if (collection === FIRESTORE_COLLECTIONS.auditEvents) {
    if (next == null) {
      throw new AppendOnlyError('Audit kayıtları silinemez (append-only).');
    }
    if (previous != null) {
      throw new AppendOnlyError('Audit kayıtları güncellenemez (append-only).');
    }
    return;
  }

  if (next == null) {
    if (SOFT_DELETE_COLLECTIONS.has(collection)) {
      throw new HardDeleteError(
        `${collection} hard delete edilemez; isActive=false kullanın.`,
      );
    }
    if (
      collection === FIRESTORE_COLLECTIONS.productSizes ||
      collection === FIRESTORE_COLLECTIONS.orderDocuments
    ) {
      throw new HardDeleteError(
        `${collection} hard delete edilemez; sipariş numarası ve paylaşılan ölçü korunur.`,
      );
    }
  }
}

export function assertAuditHasCompanionWrite(
  ops: Array<{ collection: FirestoreCollectionName; previous: Record<string, unknown> | null; next: Record<string, unknown> | null }>,
): void {
  const audits = ops.filter((op) => op.collection === FIRESTORE_COLLECTIONS.auditEvents && op.next != null);
  if (audits.length === 0) {
    return;
  }
  const companions = ops.filter(
    (op) =>
      op.collection !== FIRESTORE_COLLECTIONS.auditEvents &&
      op.next != null &&
      !isNoOpDocument(op.previous, op.next),
  );
  if (companions.length === 0) {
    throw new OrphanAuditError();
  }
}
