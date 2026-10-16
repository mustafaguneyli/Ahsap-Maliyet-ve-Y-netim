import { MaterialPriceType } from '@prisma/client';
import { toOptionalUtcDate, toUtcDate } from '../firebase/firestore-dates';
import { UniqueConstraintError } from './store-errors';
import {
  selectCurrentMaterialPrice,
  type MaterialPriceRow,
} from '../modules/cost-calculation/current-material-price';

export type ProductionYieldLookupRow = {
  id: string;
  rawMaterialId: string;
  productId?: string | null;
  pieceWidthMm: number;
  pieceLengthMm: number;
  netQty: number;
  isActive: boolean;
};

export type ProductionYieldLookupKey = {
  rawMaterialId: string;
  pieceWidthMm: number;
  pieceLengthMm: number;
  productId?: string | null;
};

/**
 * Exact match. Yakın ölçü fallback yok.
 * Duplicate aktif NET unique ihlalidir.
 */
export function findActiveProductionYield(
  rows: ProductionYieldLookupRow[],
  key: ProductionYieldLookupKey,
): ProductionYieldLookupRow | null {
  const wantProduct = key.productId ?? null;
  const matches = rows.filter(
    (row) =>
      row.isActive &&
      row.rawMaterialId === key.rawMaterialId &&
      row.pieceWidthMm === key.pieceWidthMm &&
      row.pieceLengthMm === key.pieceLengthMm &&
      (row.productId ?? null) === wantProduct,
  );
  if (matches.length > 1) {
    throw new UniqueConstraintError(
      wantProduct ? 'production-yield-product' : 'production-yield-generic',
      `${key.rawMaterialId}~${key.pieceWidthMm}~${key.pieceLengthMm}`,
    );
  }
  return matches[0] ?? null;
}

export function materialPriceRowFromFirestore(doc: Record<string, unknown>): MaterialPriceRow {
  const price = doc.price;
  if (typeof price === 'number') {
    throw new Error('raw_material_prices.price Number olamaz; eksik CASH/CARD uydurulmaz.');
  }
  return {
    id: String(doc.id),
    priceType: doc.priceType as MaterialPriceType,
    price: { toString: () => String(price) },
    effectiveFrom: toUtcDate(doc.effectiveFrom, 'effectiveFrom'),
    effectiveTo: toOptionalUtcDate(doc.effectiveTo, 'effectiveTo'),
    isActive: doc.isActive === true,
  };
}

/** CASH↔CARD fallback yok; aynı selectCurrentMaterialPrice. */
export function selectCurrentMaterialPriceFromDocs(
  docs: Record<string, unknown>[],
  priceType: MaterialPriceType,
  now: Date,
): MaterialPriceRow | null {
  return selectCurrentMaterialPrice(docs.map(materialPriceRowFromFirestore), priceType, now);
}
