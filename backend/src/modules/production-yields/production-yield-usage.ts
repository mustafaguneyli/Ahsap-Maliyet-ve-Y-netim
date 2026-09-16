import {
  getDoorFrameSizes,
  getPrimaryMaterialCode,
  getSecondary12MaterialCode,
  type DoorFrameVariantCode,
} from '../../calculation-engine/calculators/door-frame-variants';

export type ProductionYieldUsageSource =
  | 'PRODUCT_SCOPED'
  | 'RECIPE'
  | 'GENERIC';

export type ProductionYieldUsage = {
  productId: string;
  productCode: string;
  productName: string;
  productGroupId: string;
  productGroupCode: string;
  productGroupName: string;
  source: ProductionYieldUsageSource;
};

export type YieldUsageProduct = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  productGroup: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };
};

export type YieldUsageRow = {
  id: string;
  productId: string | null;
  pieceWidthMm: number;
  pieceLengthMm: number;
  rawMaterial: {
    code: string;
    sheetLengthMm: number;
  };
  product?: YieldUsageProduct | null;
  recipeItems?: Array<{
    recipe: {
      product: YieldUsageProduct;
    };
  }>;
};

function usageFromProduct(
  product: YieldUsageProduct,
  source: ProductionYieldUsageSource,
): ProductionYieldUsage {
  return {
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    productGroupId: product.productGroup.id,
    productGroupCode: product.productGroup.code,
    productGroupName: product.productGroup.name,
    source,
  };
}

function addUsage(
  bucket: Map<string, ProductionYieldUsage>,
  usage: ProductionYieldUsage,
): void {
  const current = bucket.get(usage.productId);
  if (!current) {
    bucket.set(usage.productId, usage);
    return;
  }
  const rank: Record<ProductionYieldUsageSource, number> = {
    PRODUCT_SCOPED: 3,
    RECIPE: 2,
    GENERIC: 1,
  };
  if (rank[usage.source] > rank[current.source]) {
    bucket.set(usage.productId, usage);
  }
}

export function isDoorFrameVariantCode(
  code: string,
): code is DoorFrameVariantCode {
  return code === '34_MM' || code === '30_MM';
}

export function genericYieldMatchesDoorFrameProduct(
  row: YieldUsageRow,
  productCode: DoorFrameVariantCode,
): boolean {
  const sizes = getDoorFrameSizes(productCode);
  const size = sizes.find(
    (item) =>
      item.widthCm * 10 === row.pieceWidthMm &&
      item.lengthCm * 10 === row.pieceLengthMm,
  );
  if (!size) return false;

  const primary = getPrimaryMaterialCode(productCode);
  const secondary = getSecondary12MaterialCode(size.widthCm, size.lengthCm);
  return row.rawMaterial.code === primary || row.rawMaterial.code === secondary;
}

export function genericYieldMatchesSharedProductSize(
  row: YieldUsageRow,
  productSizeKeys: Set<string>,
): boolean {
  return (
    row.pieceLengthMm === row.rawMaterial.sheetLengthMm &&
    productSizeKeys.has(`${row.pieceWidthMm}|${row.pieceLengthMm}`)
  );
}

export function collectRowUsages(
  row: YieldUsageRow,
  context: {
    genericConsumerProducts: YieldUsageProduct[];
    productSizeKeys: Set<string>;
  },
): ProductionYieldUsage[] {
  const bucket = new Map<string, ProductionYieldUsage>();

  if (row.product) {
    addUsage(bucket, usageFromProduct(row.product, 'PRODUCT_SCOPED'));
  }

  for (const item of row.recipeItems ?? []) {
    addUsage(bucket, usageFromProduct(item.recipe.product, 'RECIPE'));
  }

  if (row.productId == null) {
    for (const product of context.genericConsumerProducts) {
      if (!product.isActive || !product.productGroup.isActive) continue;

      if (
        isDoorFrameVariantCode(product.code) &&
        genericYieldMatchesDoorFrameProduct(row, product.code)
      ) {
        addUsage(bucket, usageFromProduct(product, 'GENERIC'));
        continue;
      }

      if (
        !isDoorFrameVariantCode(product.code) &&
        genericYieldMatchesSharedProductSize(row, context.productSizeKeys)
      ) {
        addUsage(bucket, usageFromProduct(product, 'GENERIC'));
      }
    }
  }

  return [...bucket.values()].sort((a, b) =>
    a.productGroupName.localeCompare(b.productGroupName, 'tr') ||
    a.productName.localeCompare(b.productName, 'tr'),
  );
}
