import { toOptionalUtcDate, toUtcDate } from '../firebase/firestore-dates';
import {
  resolveCatalogProfitRate,
  type ProfitRateCatalog,
} from '../modules/pricing/profit-rate-catalog';

function asRate(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    throw new Error('profitRate Number olamaz; Firestore string Decimal gerekir.');
  }
  return typeof value === 'string' ? value : String((value as { toString(): string }).toString());
}

function asPeriod(doc: Record<string, unknown>) {
  return {
    isActive: doc.isActive === true,
    effectiveFrom: toUtcDate(doc.effectiveFrom, 'effectiveFrom'),
    effectiveTo: toOptionalUtcDate(doc.effectiveTo, 'effectiveTo'),
    profitRate: asRate(doc.profitRate),
  };
}

/**
 * Firestore belgelerinden kâr kataloğu. 0 geçerli; null/undefined fallback.
 * `if (profitRate)` kullanılmaz.
 */
export function buildProfitRateCatalogFromDocs(input: {
  productId: string;
  productGroupId: string;
  overrides: Record<string, unknown>[];
  settings: Record<string, unknown>[];
}): ProfitRateCatalog {
  const overrides = input.overrides.filter(
    (row) => row.productId === input.productId && row.isActive === true,
  );
  return {
    sizeOverrides: overrides
      .filter((row) => row.productSizeId != null && row.productSizeId !== '')
      .map((row) => ({ ...asPeriod(row), productSizeId: String(row.productSizeId) })),
    productOverrides: overrides
      .filter((row) => row.productSizeId == null || row.productSizeId === '')
      .map((row) => ({ ...asPeriod(row), productSizeId: null })),
    productSettings: input.settings
      .filter(
        (row) =>
          row.isActive === true &&
          row.productId === input.productId &&
          (row.productGroupId == null || row.productGroupId === ''),
      )
      .map((row) => ({ isActive: true, profitRate: asRate(row.profitRate) })),
    groupSettings: input.settings
      .filter(
        (row) =>
          row.isActive === true &&
          row.productGroupId === input.productGroupId &&
          (row.productId == null || row.productId === ''),
      )
      .map((row) => ({ isActive: true, profitRate: asRate(row.profitRate) })),
    globalSettings: input.settings
      .filter(
        (row) =>
          row.isActive === true &&
          (row.productGroupId == null || row.productGroupId === '') &&
          (row.productId == null || row.productId === ''),
      )
      .map((row) => ({ isActive: true, profitRate: asRate(row.profitRate) })),
  };
}

export function resolveProfitRateFromFirestoreDocs(input: {
  productId: string;
  productGroupId: string;
  productSizeId?: string | null;
  productCode?: string;
  now: Date;
  overrides: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  rowExceptions?: Record<string, unknown>[];
  required?: boolean;
}) {
  return resolveCatalogProfitRate({
    catalog: buildProfitRateCatalogFromDocs(input),
    now: input.now,
    productCode: input.productCode,
    productSizeId: input.productSizeId,
    rowExceptions: (input.rowExceptions ?? []).map((row) => ({
      isActive: row.isActive === true,
      effectiveFrom: toUtcDate(row.effectiveFrom, 'effectiveFrom'),
      effectiveTo: toOptionalUtcDate(row.effectiveTo, 'effectiveTo'),
      profitRate: asRate(row.profitRate),
    })),
    required: input.required,
  });
}
