import type { RecipeCalculationMode } from '../calculation-engine/calculators/generic-recipe-calculator';

export type RecipeDoc = {
  id: string;
  productId: string;
  productSizeId: string;
  name: string;
  isActive: boolean;
};

export type RecipeItemDoc = {
  id: string;
  recipeId: string;
  rawMaterialId: string;
  productionYieldId: string | null;
  quantity: string;
  calculationMode: RecipeCalculationMode | null;
  quantityUnit: string | null;
  wasteRate: string | null;
  sortOrder: number;
};

export type CopiedRecipeItem = {
  rawMaterialId: string;
  calculationMode: RecipeCalculationMode;
  quantity: string;
  quantityUnit?: string;
  wasteRate?: string;
  productionYieldId?: string;
  sortOrder: number;
};

export function resolveRecipeWithItems(
  recipes: RecipeDoc[],
  items: RecipeItemDoc[],
  productId: string,
  productSizeId: string,
): { recipe: RecipeDoc; items: RecipeItemDoc[] } | null {
  const recipe = recipes.find(
    (row) => row.productId === productId && row.productSizeId === productSizeId && row.isActive,
  );
  if (!recipe) {
    return null;
  }
  const recipeItems = items
    .filter((item) => item.recipeId === recipe.id)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { recipe, items: recipeItems };
}

/**
 * copyRecipeFromSizeId: yeni ölçü için deep copy.
 * Yeni dizi/nesne; kaynak id ve recipeId kopyalanmaz.
 * productionYieldId master NET referansıdır, klonlanmaz.
 */
export function copyRecipeItemsDeep(items: RecipeItemDoc[]): CopiedRecipeItem[] {
  return items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
    if (!item.calculationMode) {
      throw new Error('Kaynak reçete satırında calculationMode yok; generic kopyalama yapılamaz.');
    }
    const copied: CopiedRecipeItem = {
      rawMaterialId: item.rawMaterialId,
      calculationMode: item.calculationMode,
      quantity: String(item.quantity),
      sortOrder: item.sortOrder,
    };
    if (item.quantityUnit) {
      copied.quantityUnit = item.quantityUnit;
    }
    if (item.wasteRate != null && item.wasteRate !== '') {
      copied.wasteRate = String(item.wasteRate);
    }
    if (item.productionYieldId) {
      copied.productionYieldId = item.productionYieldId;
    }
    return copied;
    });
}
