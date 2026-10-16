/**
 * Firestore koleksiyon adları PostgreSQL @@map ile birebir.
 * Belge kimliği mevcut UUID'dir; ilişki alanları aynı kalır.
 * Unique guard'lar `_unique` altındadır; iş koleksiyonu değildir.
 */
export const FIRESTORE_UNIQUE_COLLECTION = '_unique' as const;
export const FIRESTORE_COLLECTIONS = {
  productGroups: 'product_groups',
  products: 'products',
  productSizes: 'product_sizes',
  rawMaterials: 'raw_materials',
  rawMaterialPrices: 'raw_material_prices',
  productionYields: 'production_yields',
  kilcikTypes: 'kilcik_types',
  pervazKilcikYields: 'pervaz_kilcik_yields',
  recipes: 'recipes',
  recipeItems: 'recipe_items',
  extraCostTypes: 'extra_cost_types',
  extraCostValues: 'extra_cost_values',
  pricingSettings: 'pricing_settings',
  pricingThicknessModifiers: 'pricing_thickness_modifiers',
  pricingRowExceptions: 'pricing_row_exceptions',
  priceOverrides: 'price_overrides',
  productPricingOverrides: 'product_pricing_overrides',
  citaPublishedPriceBands: 'cita_published_price_bands',
  citaPublishedPriceBandThicknesses: 'cita_published_price_band_thicknesses',
  orderDocuments: 'order_documents',
  orderLines: 'order_lines',
  orderMaterialLines: 'order_material_lines',
  auditEvents: 'audit_events',
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS];
