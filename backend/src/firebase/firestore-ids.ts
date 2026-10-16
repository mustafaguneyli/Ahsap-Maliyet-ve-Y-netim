import { randomUUID } from 'crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FIRESTORE_FK_FIELDS = [
  'productGroupId',
  'productId',
  'productSizeId',
  'rawMaterialId',
  'recipeId',
  'productionYieldId',
  'extraCostTypeId',
  'kilcikTypeId',
  'orderDocumentId',
  'bandId',
] as const;

export type FirestoreFkField = (typeof FIRESTORE_FK_FIELDS)[number];

/** Prisma `@default(uuid())` ile aynı: yeni kayıt UUID v4 alır. */
export function newEntityId(): string {
  return randomUUID();
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function requireEntityId(value: unknown, fieldName = 'id'): string {
  if (!isUuid(value)) {
    throw new Error(`${fieldName} mevcut UUID olmalıdır; rastgele Firestore id üretilmez.`);
  }
  return value;
}

export function requireMatchingDocumentId(documentId: string, dataId: unknown): string {
  const id = requireEntityId(dataId, 'id');
  if (id !== documentId) {
    throw new Error('Firestore belge kimliği ile kayıt id alanı aynı UUID olmalıdır.');
  }
  return id;
}

/** Null FK serbest; doluysa PostgreSQL UUID'si korunur. */
export function assertFkIds(data: Record<string, unknown>): void {
  for (const field of FIRESTORE_FK_FIELDS) {
    const value = data[field];
    if (value == null || value === '') {
      continue;
    }
    if (!isUuid(value)) {
      throw new Error(`${field} mevcut UUID olmalıdır; yeni rastgele id ile ilişki kırılmaz.`);
    }
  }
}
