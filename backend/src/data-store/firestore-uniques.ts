import { FIRESTORE_COLLECTIONS, type FirestoreCollectionName } from '../firebase/firestore.collections';
import { UniqueConstraintError } from './store-errors';

export type UniqueGuard = {
  constraint: string;
  key: string;
};

export type UniqueConstraint = {
  name: string;
  collection: FirestoreCollectionName;
  fields: readonly string[];
  when?: (doc: Record<string, unknown>) => boolean;
};

function isPresent(value: unknown): boolean {
  return value != null && value !== '';
}

function isOpenActive(doc: Record<string, unknown>): boolean {
  return doc.isActive === true && !isPresent(doc.effectiveTo);
}

export function encodeUniqueKey(parts: readonly unknown[]): string {
  return parts
    .map((part) => (isPresent(part) ? encodeURIComponent(String(part)) : '_'))
    .join('~');
}

/**
 * PostgreSQL UNIQUE / partial unique karşılıkları.
 * Path: `_unique/{constraint}/{key}`
 */
export const FIRESTORE_UNIQUE_CONSTRAINTS: readonly UniqueConstraint[] = [
  {
    name: 'product-group-code',
    collection: FIRESTORE_COLLECTIONS.productGroups,
    fields: ['code'],
  },
  {
    name: 'product-code',
    collection: FIRESTORE_COLLECTIONS.products,
    fields: ['productGroupId', 'code'],
  },
  {
    name: 'product-size-mm',
    collection: FIRESTORE_COLLECTIONS.productSizes,
    fields: ['widthMm', 'lengthMm'],
  },
  {
    name: 'raw-material-code',
    collection: FIRESTORE_COLLECTIONS.rawMaterials,
    fields: ['code'],
  },
  {
    name: 'raw-material-price-open',
    collection: FIRESTORE_COLLECTIONS.rawMaterialPrices,
    fields: ['rawMaterialId', 'priceType'],
    when: isOpenActive,
  },
  {
    name: 'production-yield-generic',
    collection: FIRESTORE_COLLECTIONS.productionYields,
    fields: ['rawMaterialId', 'pieceWidthMm', 'pieceLengthMm'],
    when: (doc) => doc.isActive === true && !isPresent(doc.productId),
  },
  {
    name: 'production-yield-product',
    collection: FIRESTORE_COLLECTIONS.productionYields,
    fields: ['productId', 'rawMaterialId', 'pieceWidthMm', 'pieceLengthMm'],
    when: (doc) => doc.isActive === true && isPresent(doc.productId),
  },
  {
    name: 'kilcik-type-code',
    collection: FIRESTORE_COLLECTIONS.kilcikTypes,
    fields: ['code'],
  },
  {
    name: 'pervaz-kilcik-excel',
    collection: FIRESTORE_COLLECTIONS.pervazKilcikYields,
    fields: ['productId', 'pervazThicknessMm', 'pieceLengthMm'],
    when: (doc) => doc.isActive === true && doc.source === 'EXCEL_MASTER',
  },
  {
    name: 'pervaz-kilcik-manual',
    collection: FIRESTORE_COLLECTIONS.pervazKilcikYields,
    fields: ['productId', 'pervazThicknessMm', 'kilcikTypeId', 'pieceLengthMm'],
    when: (doc) =>
      doc.isActive === true && doc.source === 'MANUAL_VERIFIED' && isPresent(doc.kilcikTypeId),
  },
  {
    name: 'recipe-product-size',
    collection: FIRESTORE_COLLECTIONS.recipes,
    fields: ['productId', 'productSizeId'],
  },
  {
    name: 'recipe-item-sort',
    collection: FIRESTORE_COLLECTIONS.recipeItems,
    fields: ['recipeId', 'sortOrder'],
  },
  {
    name: 'extra-cost-type-code',
    collection: FIRESTORE_COLLECTIONS.extraCostTypes,
    fields: ['code'],
  },
  {
    name: 'pricing-setting-group',
    collection: FIRESTORE_COLLECTIONS.pricingSettings,
    fields: ['productGroupId'],
    when: (doc) => doc.isActive === true && isPresent(doc.productGroupId),
  },
  {
    name: 'pricing-setting-product',
    collection: FIRESTORE_COLLECTIONS.pricingSettings,
    fields: ['productId'],
    when: (doc) => doc.isActive === true && isPresent(doc.productId),
  },
  {
    name: 'pricing-setting-global',
    collection: FIRESTORE_COLLECTIONS.pricingSettings,
    fields: ['scope'],
    when: (doc) =>
      doc.isActive === true && !isPresent(doc.productGroupId) && !isPresent(doc.productId),
  },
  {
    name: 'pricing-thickness-open',
    collection: FIRESTORE_COLLECTIONS.pricingThicknessModifiers,
    fields: ['productGroupId', 'modifierType', 'thicknessMm'],
    when: isOpenActive,
  },
  {
    name: 'pricing-row-exception-open',
    collection: FIRESTORE_COLLECTIONS.pricingRowExceptions,
    fields: ['productId', 'thicknessMm', 'widthMm', 'lengthMm'],
    when: isOpenActive,
  },
  {
    name: 'price-override-active',
    collection: FIRESTORE_COLLECTIONS.priceOverrides,
    fields: ['productId', 'productSizeId'],
    when: (doc) => doc.isActive === true,
  },
  {
    name: 'product-pricing-override-size',
    collection: FIRESTORE_COLLECTIONS.productPricingOverrides,
    fields: ['productId', 'productSizeId'],
    when: (doc) => isOpenActive(doc) && isPresent(doc.productSizeId),
  },
  {
    name: 'product-pricing-override-product',
    collection: FIRESTORE_COLLECTIONS.productPricingOverrides,
    fields: ['productId'],
    when: (doc) => isOpenActive(doc) && !isPresent(doc.productSizeId),
  },
  {
    name: 'cita-band-open',
    collection: FIRESTORE_COLLECTIONS.citaPublishedPriceBands,
    fields: ['productGroupId', 'minWidthMm', 'maxWidthMm'],
    when: isOpenActive,
  },
  {
    name: 'cita-band-thickness',
    collection: FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses,
    fields: ['bandId', 'thicknessMm'],
  },
  {
    name: 'order-number',
    collection: FIRESTORE_COLLECTIONS.orderDocuments,
    fields: ['orderNumber'],
  },
  {
    name: 'order-line-no',
    collection: FIRESTORE_COLLECTIONS.orderLines,
    fields: ['orderDocumentId', 'lineNo'],
  },
];

export function uniqueGuardsFor(
  collection: FirestoreCollectionName,
  doc: Record<string, unknown>,
): UniqueGuard[] {
  return FIRESTORE_UNIQUE_CONSTRAINTS.filter((constraint) => constraint.collection === collection)
    .filter((constraint) => (constraint.when ? constraint.when(doc) : true))
    .filter((constraint) =>
      constraint.name === 'pricing-setting-global'
        ? true
        : constraint.fields.every((field) => isPresent(doc[field])),
    )
    .map((constraint) => ({
      constraint: constraint.name,
      key:
        constraint.name === 'pricing-setting-global'
          ? encodeUniqueKey(['global'])
          : encodeUniqueKey(constraint.fields.map((field) => doc[field])),
    }));
}

export function uniqueGuardPath(guard: UniqueGuard): { constraint: string; key: string } {
  return { constraint: guard.constraint, key: guard.key };
}

export function uniqueGuardDiff(
  previous: UniqueGuard[],
  next: UniqueGuard[],
): { claim: UniqueGuard[]; release: UniqueGuard[] } {
  const prevKeys = new Set(previous.map((item) => `${item.constraint}/${item.key}`));
  const nextKeys = new Set(next.map((item) => `${item.constraint}/${item.key}`));
  return {
    claim: next.filter((item) => !prevKeys.has(`${item.constraint}/${item.key}`)),
    release: previous.filter((item) => !nextKeys.has(`${item.constraint}/${item.key}`)),
  };
}

export type UniqueNetOp = {
  guard: UniqueGuard;
  ownerId: string;
  op: 'claim' | 'release';
  /** Aynı transaction içinde bu anahtarı bırakan önceki owner; sahiplik devrine izin verir. */
  releasedFrom?: string;
};

export function mergeUniqueNet(
  ops: Array<{
    collection: FirestoreCollectionName;
    id: string;
    previous: Record<string, unknown> | null;
    next: Record<string, unknown> | null;
  }>,
): UniqueNetOp[] {
  const netUnique = new Map<string, UniqueNetOp>();
  for (const op of ops) {
    const { claim, release } = uniqueGuardDiff(
      uniqueGuardsFor(op.collection, op.previous ?? {}),
      uniqueGuardsFor(op.collection, op.next ?? {}),
    );
    for (const guard of release) {
      const mapKey = `${guard.constraint}/${guard.key}`;
      const existing = netUnique.get(mapKey);
      if (existing?.op === 'claim' && existing.ownerId !== op.id) {
        continue;
      }
      if (existing?.op === 'claim' && existing.ownerId === op.id) {
        netUnique.delete(mapKey);
        continue;
      }
      netUnique.set(mapKey, { guard, ownerId: op.id, op: 'release' });
    }
    for (const guard of claim) {
      const mapKey = `${guard.constraint}/${guard.key}`;
      const existing = netUnique.get(mapKey);
      if (existing?.op === 'claim' && existing.ownerId !== op.id) {
        throw new UniqueConstraintError(guard.constraint, guard.key);
      }
      const releasedFrom =
        existing?.op === 'release' ? existing.ownerId : existing?.releasedFrom;
      netUnique.set(mapKey, { guard, ownerId: op.id, op: 'claim', releasedFrom });
    }
  }
  return [...netUnique.values()];
}
