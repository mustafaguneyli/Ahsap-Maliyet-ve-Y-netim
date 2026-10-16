import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import type { MaterialComponent } from '../modules/order-documents/order-material-plan';
import type { DocumentStore } from './document-store';

const SPECIAL_ORDER_GROUP_CODES = ['door_frame', 'PERVAZ', 'SUPURGELIK', 'CITA'] as const;

export async function catalogProductSnapshotFromStore(
  store: DocumentStore,
  productId: string,
) {
  const product = await store.getById(FIRESTORE_COLLECTIONS.products, productId);
  if (!product) {
    return null;
  }
  const group = await store.getById(
    FIRESTORE_COLLECTIONS.productGroups,
    String(product.productGroupId),
  );
  if (!group) {
    return null;
  }
  const special = (SPECIAL_ORDER_GROUP_CODES as readonly string[]).includes(String(group.code));
  if (!special && group.calculatorType !== 'GENERIC_RECIPE') {
    return null;
  }
  if (product.isActive !== true || group.isActive !== true) {
    throw new Error('INACTIVE_CATALOG_PRODUCT');
  }
  return {
    productId: String(product.id),
    productGroupCode: String(group.code),
    productGroupName: String(group.name),
    catalogProductName: String(product.name),
  };
}

export async function recipeComponentsFromStore(
  store: DocumentStore,
  productId: string,
  widthMm: number,
  lengthMm: number,
): Promise<MaterialComponent[] | null> {
  const sizes = await store.list(FIRESTORE_COLLECTIONS.productSizes);
  const size = sizes.find(
    (row) => Number(row.widthMm) === widthMm && Number(row.lengthMm) === lengthMm,
  );
  if (!size) {
    return null;
  }
  const recipes = await store.list(FIRESTORE_COLLECTIONS.recipes);
  const recipe = recipes.find(
    (row) =>
      row.productId === productId && row.productSizeId === size.id && row.isActive === true,
  );
  if (!recipe) {
    return null;
  }
  const [items, materials, yields] = await Promise.all([
    store.list(FIRESTORE_COLLECTIONS.recipeItems),
    store.list(FIRESTORE_COLLECTIONS.rawMaterials),
    store.list(FIRESTORE_COLLECTIONS.productionYields),
  ]);
  const recipeItems = items
    .filter((row) => row.recipeId === recipe.id)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  if (recipeItems.length === 0) {
    return null;
  }
  return recipeItems.map((item) => {
    const material = materials.find((row) => row.id === item.rawMaterialId);
    const yieldRow = item.productionYieldId
      ? yields.find((row) => row.id === item.productionYieldId)
      : null;
    return {
      role: 'RECETE',
      rawMaterialId: String(item.rawMaterialId),
      materialName: String(material?.name ?? ''),
      thicknessMm: material?.thicknessMm == null ? '' : String(material.thicknessMm),
      sheetWidthMm: Number(material?.sheetWidthMm ?? 0),
      sheetLengthMm: Number(material?.sheetLengthMm ?? 0),
      surfaceType: material?.surfaceType == null ? null : String(material.surfaceType),
      piecesPerUnit: String(item.quantity),
      netQty: yieldRow?.isActive === true ? Number(yieldRow.netQty) : null,
    };
  });
}

export async function listOrderCatalogFromStore(store: DocumentStore) {
  const [groups, products, recipes, sizes, yields, materials] = await Promise.all([
    store.list(FIRESTORE_COLLECTIONS.productGroups),
    store.list(FIRESTORE_COLLECTIONS.products),
    store.list(FIRESTORE_COLLECTIONS.recipes),
    store.list(FIRESTORE_COLLECTIONS.productSizes),
    store.list(FIRESTORE_COLLECTIONS.productionYields),
    store.list(FIRESTORE_COLLECTIONS.rawMaterials),
  ]);
  const activeGroups = groups.filter((group) => {
    if (group.isActive !== true) {
      return false;
    }
    return (
      (SPECIAL_ORDER_GROUP_CODES as readonly string[]).includes(String(group.code)) ||
      group.calculatorType === 'GENERIC_RECIPE'
    );
  });
  const sizeById = new Map(sizes.map((row) => [String(row.id), row]));
  const genericSizesByGroup: Record<
    string,
    Array<{ widthMm: number; lengthMm: number; displayName?: string }>
  > = {};
  for (const recipe of recipes) {
    if (recipe.isActive !== true) {
      continue;
    }
    const product = products.find((row) => row.id === recipe.productId && row.isActive === true);
    if (!product) {
      continue;
    }
    const group = activeGroups.find((row) => row.id === product.productGroupId);
    if (!group || (SPECIAL_ORDER_GROUP_CODES as readonly string[]).includes(String(group.code))) {
      continue;
    }
    const size = sizeById.get(String(recipe.productSizeId));
    if (!size) {
      continue;
    }
    const code = String(group.code);
    if (!genericSizesByGroup[code]) {
      genericSizesByGroup[code] = [];
    }
    genericSizesByGroup[code].push({
      widthMm: Number(size.widthMm),
      lengthMm: Number(size.lengthMm),
      displayName: String(size.displayName),
    });
  }
  const pervazYields = yields.filter((row) => {
    if (row.isActive !== true) {
      return false;
    }
    const product = products.find((item) => item.id === row.productId && item.isActive === true);
    if (!product) {
      return false;
    }
    const group = groups.find((item) => item.id === product.productGroupId);
    return group?.code === 'PERVAZ';
  });
  return {
    groups: activeGroups.map((group) => ({
      code: String(group.code),
      name: String(group.name),
      calculatorType: group.calculatorType,
      products: products
        .filter((product) => product.productGroupId === group.id && product.isActive === true)
        .map((product) => ({
          id: String(product.id),
          code: String(product.code),
          name: String(product.name),
        })),
    })),
    genericSizesByGroup,
    pervazSizes: uniqueMm(pervazYields.map((row) => ({
      widthMm: Number(row.pieceWidthMm),
      lengthMm: Number(row.pieceLengthMm),
    }))),
    pervazThicknesses: uniqueTexts(
      pervazYields.map((row) => {
        const material = materials.find((item) => item.id === row.rawMaterialId);
        return material?.thicknessMm == null ? '' : String(material.thicknessMm);
      }).filter(Boolean),
    ),
  };
}

function uniqueMm(rows: Array<{ widthMm: number; lengthMm: number }>) {
  const map = new Map<string, { widthMm: number; lengthMm: number; displayName: string }>();
  for (const row of rows) {
    const key = `${row.widthMm}x${row.lengthMm}`;
    if (!map.has(key)) {
      map.set(key, {
        widthMm: row.widthMm,
        lengthMm: row.lengthMm,
        displayName: `${row.widthMm / 10}×${row.lengthMm / 10}`,
      });
    }
  }
  return [...map.values()];
}

function uniqueTexts(values: string[]): string[] {
  return [...new Set(values)].sort();
}
