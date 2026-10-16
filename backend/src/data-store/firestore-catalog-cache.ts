import { AsyncLocalStorage } from 'async_hooks';
import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { materialPriceRowFromFirestore } from './firestore-lookups';
import { isCurrentlyEffective, toOptionalUtcDate, toUtcDate } from '../firebase/firestore-dates';
import type { DocumentStore } from './document-store';
import type { MaterialPriceRow } from '../modules/cost-calculation/current-material-price';

/** Katalog/master koleksiyonları. Sipariş ve audit isteğe bağlı query ile okunur. */
export const CATALOG_PRELOAD_COLLECTIONS = [
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
  FIRESTORE_COLLECTIONS.extraCostTypes,
  FIRESTORE_COLLECTIONS.extraCostValues,
  FIRESTORE_COLLECTIONS.pricingSettings,
  FIRESTORE_COLLECTIONS.pricingThicknessModifiers,
  FIRESTORE_COLLECTIONS.pricingRowExceptions,
  FIRESTORE_COLLECTIONS.priceOverrides,
  FIRESTORE_COLLECTIONS.productPricingOverrides,
  FIRESTORE_COLLECTIONS.citaPublishedPriceBands,
  FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses,
] as const;

type Row = Record<string, unknown>;

const catalogAls = new AsyncLocalStorage<FirestoreCatalogCache>();

export function currentCatalogCache(): FirestoreCatalogCache | null {
  return catalogAls.getStore() ?? null;
}

export function runWithCatalogCache<T>(cache: FirestoreCatalogCache, fn: () => T): T {
  return catalogAls.run(cache, fn);
}

/**
 * İstek başına 19 koleksiyon okuması. Sonraki lookup bellek içi.
 * Calculator formülü değişmez.
 */
export class FirestoreCatalogCache {
  private constructor(
    private readonly docs: Map<string, Row[]>,
    readonly preloadReads: number,
  ) {}

  static async load(store: DocumentStore): Promise<FirestoreCatalogCache> {
    const before = store.readCount();
    const entries = await Promise.all(
      CATALOG_PRELOAD_COLLECTIONS.map(async (name) => [name, await store.list(name)] as const),
    );
    return new FirestoreCatalogCache(new Map(entries), store.readCount() - before);
  }

  collection(name: (typeof CATALOG_PRELOAD_COLLECTIONS)[number]): Row[] {
    return this.docs.get(name) ?? [];
  }

  groupByCode(code: string): Row | null {
    return this.collection(FIRESTORE_COLLECTIONS.productGroups).find(
      (row) => row.code === code && row.isActive === true,
    ) ?? null;
  }

  groupById(id: string): Row | null {
    return this.collection(FIRESTORE_COLLECTIONS.productGroups).find((row) => row.id === id) ?? null;
  }

  productByGroupAndCode(productGroupId: string, code: string): Row | null {
    return this.collection(FIRESTORE_COLLECTIONS.products).find(
      (row) =>
        row.productGroupId === productGroupId && row.code === code && row.isActive === true,
    ) ?? null;
  }

  productById(id: string): Row | null {
    return this.collection(FIRESTORE_COLLECTIONS.products).find(
      (row) => row.id === id && row.isActive === true,
    ) ?? null;
  }

  productsByGroup(productGroupId: string): Row[] {
    return this.collection(FIRESTORE_COLLECTIONS.products).filter(
      (row) => row.productGroupId === productGroupId && row.isActive === true,
    );
  }

  activeGroups(): Row[] {
    return this.collection(FIRESTORE_COLLECTIONS.productGroups).filter((row) => row.isActive === true);
  }

  materialByCode(code: string): Row | null {
    return this.collection(FIRESTORE_COLLECTIONS.rawMaterials).find(
      (row) => row.code === code && row.isActive === true,
    ) ?? null;
  }

  materialById(id: string): Row | null {
    return this.collection(FIRESTORE_COLLECTIONS.rawMaterials).find((row) => row.id === id) ?? null;
  }

  pricesFor(rawMaterialId: string): MaterialPriceRow[] {
    return this.collection(FIRESTORE_COLLECTIONS.rawMaterialPrices)
      .filter((row) => row.rawMaterialId === rawMaterialId)
      .map(materialPriceRowFromFirestore);
  }

  sizeByMm(widthMm: number, lengthMm: number): Row | null {
    return this.collection(FIRESTORE_COLLECTIONS.productSizes).find(
      (row) => Number(row.widthMm) === widthMm && Number(row.lengthMm) === lengthMm,
    ) ?? null;
  }

  sizeIdIndex(): Map<string, string> {
    return new Map(
      this.collection(FIRESTORE_COLLECTIONS.productSizes).map((size) => [
        `${Number(size.widthMm)}x${Number(size.lengthMm)}`,
        String(size.id),
      ]),
    );
  }

  genericYieldsForMaterial(rawMaterialId: string): Row[] {
    return this.collection(FIRESTORE_COLLECTIONS.productionYields).filter(
      (row) =>
        row.isActive === true &&
        row.rawMaterialId === rawMaterialId &&
        (row.productId == null || row.productId === ''),
    );
  }

  productYields(productId: string): Row[] {
    return this.collection(FIRESTORE_COLLECTIONS.productionYields).filter(
      (row) => row.isActive === true && row.productId === productId,
    );
  }

  findYield(input: {
    rawMaterialId: string;
    pieceWidthMm: number;
    pieceLengthMm: number;
    productId?: string | null;
  }): Row | null {
    const wantProduct = input.productId ?? null;
    return this.collection(FIRESTORE_COLLECTIONS.productionYields).find(
      (row) =>
        row.isActive === true &&
        row.rawMaterialId === input.rawMaterialId &&
        Number(row.pieceWidthMm) === input.pieceWidthMm &&
        Number(row.pieceLengthMm) === input.pieceLengthMm &&
        (row.productId ?? null) === wantProduct,
    ) ?? null;
  }

  pricingSettings(input: { productGroupId?: string | null; productId?: string | null }): Row[] {
    return this.collection(FIRESTORE_COLLECTIONS.pricingSettings).filter((row) => {
      if (row.isActive !== true) {
        return false;
      }
      const group = row.productGroupId ?? null;
      const product = row.productId ?? null;
      if (input.productId !== undefined) {
        return product === (input.productId ?? null) && group === (input.productGroupId ?? null);
      }
      return group === (input.productGroupId ?? null) && product == null;
    });
  }

  extraValuesForGroup(productGroupId: string): Row[] {
    return this.collection(FIRESTORE_COLLECTIONS.extraCostValues).filter(
      (row) =>
        row.productGroupId === productGroupId &&
        (row.productId == null || row.productId === '') &&
        row.isActive === true,
    );
  }

  extraTypes(): Row[] {
    return this.collection(FIRESTORE_COLLECTIONS.extraCostTypes);
  }

  extraValuesForType(productGroupId: string, extraCostTypeId: string): Row[] {
    return this.extraValuesForGroup(productGroupId).filter(
      (row) => row.extraCostTypeId === extraCostTypeId,
    );
  }

  asDate(value: unknown, field: string): Date {
    return toUtcDate(value, field);
  }

  asOptionalDate(value: unknown, field: string): Date | null {
    return toOptionalUtcDate(value, field);
  }

  isCurrent(row: Row, now: Date): boolean {
    if (row.isActive !== true || row.effectiveFrom == null) {
      return false;
    }
    return isCurrentlyEffective(
      this.asDate(row.effectiveFrom, 'effectiveFrom'),
      this.asOptionalDate(row.effectiveTo, 'effectiveTo'),
      now,
    );
  }
}

export async function withCatalogCache<T>(
  store: DocumentStore | null | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!store) {
    return Promise.resolve(fn());
  }
  if (currentCatalogCache()) {
    return Promise.resolve(fn());
  }
  const cache = await FirestoreCatalogCache.load(store);
  return runWithCatalogCache(cache, () => Promise.resolve(fn()));
}
