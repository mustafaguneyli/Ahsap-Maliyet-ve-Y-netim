import Decimal from 'decimal.js';
import { decimalToString, toDecimal } from '../common/decimal/decimal.util';
import type { FirestoreCollectionName } from './firestore.collections';
import { FIRESTORE_COLLECTIONS } from './firestore.collections';

/**
 * Firestore Number/float para tutmaz. Canonical biçim string'dir.
 * Ölçek Prisma Decimal(p,s) ile aynıdır (ör. 1885.0000).
 */
export const FIRESTORE_MONEY_FIELDS: Record<FirestoreCollectionName, Readonly<Record<string, number>>> = {
  [FIRESTORE_COLLECTIONS.productGroups]: {},
  [FIRESTORE_COLLECTIONS.products]: {},
  [FIRESTORE_COLLECTIONS.productSizes]: {},
  [FIRESTORE_COLLECTIONS.rawMaterials]: { thicknessMm: 2 },
  [FIRESTORE_COLLECTIONS.rawMaterialPrices]: { price: 4 },
  [FIRESTORE_COLLECTIONS.productionYields]: {},
  [FIRESTORE_COLLECTIONS.kilcikTypes]: {},
  [FIRESTORE_COLLECTIONS.pervazKilcikYields]: {},
  [FIRESTORE_COLLECTIONS.recipes]: {},
  [FIRESTORE_COLLECTIONS.recipeItems]: { quantity: 4, wasteRate: 4 },
  [FIRESTORE_COLLECTIONS.extraCostTypes]: {},
  [FIRESTORE_COLLECTIONS.extraCostValues]: { amount: 4 },
  [FIRESTORE_COLLECTIONS.pricingSettings]: {
    vatRate: 4,
    profitRate: 4,
    cardMarkupRate: 4,
    cardFixedSurchargeAmount: 4,
  },
  [FIRESTORE_COLLECTIONS.pricingThicknessModifiers]: { rate: 4 },
  [FIRESTORE_COLLECTIONS.pricingRowExceptions]: {
    profitRate: 4,
    decorativePremiumRate: 4,
    adjustmentAmount: 4,
  },
  [FIRESTORE_COLLECTIONS.priceOverrides]: { cashPrice: 4 },
  [FIRESTORE_COLLECTIONS.productPricingOverrides]: { profitRate: 4 },
  [FIRESTORE_COLLECTIONS.citaPublishedPriceBands]: { cashPrice: 4, cardPrice: 4 },
  [FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses]: {},
  [FIRESTORE_COLLECTIONS.orderDocuments]: {
    vatRate: 4,
    grossTotal: 6,
    discountAmount: 6,
    netTotal: 6,
    vatAmount: 6,
    grandTotal: 6,
  },
  [FIRESTORE_COLLECTIONS.orderLines]: {
    widthMm: 2,
    lengthMm: 2,
    thicknessMm: 2,
    quantity: 6,
    discountRate: 4,
    unitPrice: 6,
    lineAmount: 6,
    lineDiscountAmount: 6,
  },
  [FIRESTORE_COLLECTIONS.orderMaterialLines]: {
    thicknessMm: 2,
    quantity: 6,
    pieceQuantity: 6,
    sheetQuantity: 6,
  },
  [FIRESTORE_COLLECTIONS.auditEvents]: {},
};

export function moneyToFirestore(value: Decimal.Value, scale?: number): string {
  if (typeof value === 'number') {
    throw new Error('Firestore para alanı Number kabul etmez; Decimal veya string kullanın.');
  }
  const parsed = toDecimal(value);
  if (!parsed.isFinite()) {
    throw new Error('Firestore para alanı geçerli bir Decimal olmalıdır.');
  }
  return scale == null ? decimalToString(parsed) : parsed.toFixed(scale);
}

export function moneyFromFirestore(value: unknown, fieldName: string): Decimal {
  if (value == null || value === '') {
    throw new Error(`${fieldName} eksik; 0 varsayılmaz.`);
  }
  if (typeof value === 'number') {
    throw new Error(`${fieldName} Firestore Number olarak geldi; string Decimal beklenir.`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} para alanı string olmalıdır.`);
  }
  const parsed = toDecimal(value);
  if (!parsed.isFinite()) {
    throw new Error(`${fieldName} geçerli bir Decimal değil.`);
  }
  return parsed;
}

function isDecimalObject(value: unknown): value is { toString(): string } {
  return (
    value != null &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    typeof (value as { toString?: unknown }).toString === 'function'
  );
}

export function encodeMoneyFields(
  collection: FirestoreCollectionName,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const scales = FIRESTORE_MONEY_FIELDS[collection];
  const out = { ...data };
  for (const [field, scale] of Object.entries(scales)) {
    if (!(field in out) || out[field] == null || out[field] === '') {
      continue;
    }
    const raw = out[field];
    if (typeof raw === 'string' || isDecimalObject(raw)) {
      out[field] = moneyToFirestore(typeof raw === 'string' ? raw : raw.toString(), scale);
      continue;
    }
    throw new Error(`${field} para alanı Number olamaz; canonical string yazılır.`);
  }
  return out;
}
