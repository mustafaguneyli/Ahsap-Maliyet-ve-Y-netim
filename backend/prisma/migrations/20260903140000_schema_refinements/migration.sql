-- ============================================================
-- Migration: schema_refinements
-- Değişiklikler:
--   1. PriceType → MaterialPriceType (ham madde alış fiyatı)
--   2. RecipeItem.productionYieldId nullable
--   3. AuditEvent.fieldName nullable
--   4. CHECK constraints (ölçüler, miktarlar, fiyatlar, oranlar)
--   5. ExtraCostValue kapsam kısıtları
--   6. RawMaterialPrice dönem ve çakışma kısıtları
--   7. PricingSetting tek aktif kayıt (partial unique)
-- ============================================================

-- 1a. Yeni enum oluştur
CREATE TYPE "MaterialPriceType" AS ENUM ('CASH', 'CARD_INSTALLMENT');

-- 1b. price_type sütununu yeni enum türüne çevir
ALTER TABLE "raw_material_prices"
  ADD COLUMN "price_type_new" "MaterialPriceType";

UPDATE "raw_material_prices"
  SET "price_type_new" = "price_type"::text::"MaterialPriceType";

ALTER TABLE "raw_material_prices"
  DROP COLUMN "price_type";

ALTER TABLE "raw_material_prices"
  RENAME COLUMN "price_type_new" TO "price_type";

ALTER TABLE "raw_material_prices"
  ALTER COLUMN "price_type" SET NOT NULL;

-- 1c. Eski enum kaldır
DROP TYPE "PriceType";

-- 2. RecipeItem.productionYieldId nullable
ALTER TABLE "recipe_items"
  ALTER COLUMN "production_yield_id" DROP NOT NULL;

-- 3. AuditEvent.fieldName nullable
ALTER TABLE "audit_events"
  ALTER COLUMN "field_name" DROP NOT NULL;

-- ============================================================
-- 4. CHECK constraints
-- ============================================================

-- product_sizes: boyutlar pozitif (init'te eklendiyse idempotent DROP/ADD)
ALTER TABLE "product_sizes"
  DROP CONSTRAINT IF EXISTS "product_sizes_width_mm_positive",
  DROP CONSTRAINT IF EXISTS "product_sizes_length_mm_positive";
ALTER TABLE "product_sizes"
  ADD CONSTRAINT "product_sizes_width_mm_positive"  CHECK ("width_mm"  > 0),
  ADD CONSTRAINT "product_sizes_length_mm_positive" CHECK ("length_mm" > 0);

-- raw_materials: kalınlık ve levha boyutları pozitif
ALTER TABLE "raw_materials"
  DROP CONSTRAINT IF EXISTS "raw_materials_thickness_mm_positive",
  DROP CONSTRAINT IF EXISTS "raw_materials_sheet_width_mm_positive",
  DROP CONSTRAINT IF EXISTS "raw_materials_sheet_length_mm_positive";
ALTER TABLE "raw_materials"
  ADD CONSTRAINT "raw_materials_thickness_mm_positive"    CHECK ("thickness_mm"    > 0),
  ADD CONSTRAINT "raw_materials_sheet_width_mm_positive"  CHECK ("sheet_width_mm"  > 0),
  ADD CONSTRAINT "raw_materials_sheet_length_mm_positive" CHECK ("sheet_length_mm" > 0);

-- raw_material_prices: fiyat negatif olamaz
ALTER TABLE "raw_material_prices"
  DROP CONSTRAINT IF EXISTS "raw_material_prices_price_non_negative";
ALTER TABLE "raw_material_prices"
  ADD CONSTRAINT "raw_material_prices_price_non_negative" CHECK ("price" >= 0);

-- production_yields: parça ölçüleri ve net_qty pozitif
ALTER TABLE "production_yields"
  DROP CONSTRAINT IF EXISTS "production_yields_piece_width_mm_positive",
  DROP CONSTRAINT IF EXISTS "production_yields_piece_length_mm_positive",
  DROP CONSTRAINT IF EXISTS "production_yields_net_qty_positive";
ALTER TABLE "production_yields"
  ADD CONSTRAINT "production_yields_piece_width_mm_positive"  CHECK ("piece_width_mm"  > 0),
  ADD CONSTRAINT "production_yields_piece_length_mm_positive" CHECK ("piece_length_mm" > 0),
  ADD CONSTRAINT "production_yields_net_qty_positive"         CHECK ("net_qty"         > 0);

-- recipe_items: miktar pozitif
ALTER TABLE "recipe_items"
  DROP CONSTRAINT IF EXISTS "recipe_items_quantity_positive";
ALTER TABLE "recipe_items"
  ADD CONSTRAINT "recipe_items_quantity_positive" CHECK ("quantity" > 0);

-- extra_cost_values: tutar negatif olamaz
ALTER TABLE "extra_cost_values"
  DROP CONSTRAINT IF EXISTS "extra_cost_values_amount_non_negative";
ALTER TABLE "extra_cost_values"
  ADD CONSTRAINT "extra_cost_values_amount_non_negative" CHECK ("amount" >= 0);

-- pricing_settings: oranlar negatif olamaz
ALTER TABLE "pricing_settings"
  DROP CONSTRAINT IF EXISTS "pricing_settings_vat_rate_non_negative",
  DROP CONSTRAINT IF EXISTS "pricing_settings_profit_rate_non_negative",
  DROP CONSTRAINT IF EXISTS "pricing_settings_card_markup_rate_non_negative";
ALTER TABLE "pricing_settings"
  ADD CONSTRAINT "pricing_settings_vat_rate_non_negative"        CHECK ("vat_rate"        IS NULL OR "vat_rate"        >= 0),
  ADD CONSTRAINT "pricing_settings_profit_rate_non_negative"     CHECK ("profit_rate"     IS NULL OR "profit_rate"     >= 0),
  ADD CONSTRAINT "pricing_settings_card_markup_rate_non_negative" CHECK ("card_markup_rate" IS NULL OR "card_markup_rate" >= 0);

-- ============================================================
-- 5. ExtraCostValue kapsam kısıtları
--    - productGroupId ve productId aynı anda dolu olamaz
--    - en az biri dolu olmak zorunda
-- ============================================================
ALTER TABLE "extra_cost_values"
  DROP CONSTRAINT IF EXISTS "extra_cost_values_scope_mutual_exclusive",
  DROP CONSTRAINT IF EXISTS "extra_cost_values_scope_required";

ALTER TABLE "extra_cost_values"
  ADD CONSTRAINT "extra_cost_values_scope_mutual_exclusive"
    CHECK (NOT ("product_group_id" IS NOT NULL AND "product_id" IS NOT NULL)),
  ADD CONSTRAINT "extra_cost_values_scope_required"
    CHECK ("product_group_id" IS NOT NULL OR "product_id" IS NOT NULL);

-- ============================================================
-- 6. RawMaterialPrice: dönem sırası + tek aktif açık dönem
-- ============================================================

-- 6a. effectiveTo varsa effectiveTo > effectiveFrom
ALTER TABLE "raw_material_prices"
  DROP CONSTRAINT IF EXISTS "raw_material_prices_period_order";
ALTER TABLE "raw_material_prices"
  ADD CONSTRAINT "raw_material_prices_period_order"
    CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

-- 6b. Aynı raw_material + price_type için tek açık (active + effectiveTo NULL) dönem
DROP INDEX IF EXISTS "raw_material_prices_open_active_unique";
CREATE UNIQUE INDEX "raw_material_prices_open_active_unique"
  ON "raw_material_prices" ("raw_material_id", "price_type")
  WHERE "is_active" = true AND "effective_to" IS NULL;

-- ============================================================
-- 7. PricingSetting: aynı productGroup için tek aktif kayıt
--    productGroupId IS NULL → global ayar; o da tek olabilir
-- ============================================================
DROP INDEX IF EXISTS "pricing_settings_active_unique_per_group";
CREATE UNIQUE INDEX "pricing_settings_active_unique_per_group"
  ON "pricing_settings" ("product_group_id")
  WHERE "is_active" = true;

-- productGroupId NULL olan global kayıt da tek olsun
DROP INDEX IF EXISTS "pricing_settings_active_global_unique";
CREATE UNIQUE INDEX "pricing_settings_active_global_unique"
  ON "pricing_settings" ((1))
  WHERE "is_active" = true AND "product_group_id" IS NULL;

-- ============================================================
-- 8. production_yields: aktif kombinasyon partial unique
--    (init'te oluşturulduysa yeniden oluştur)
-- ============================================================
DROP INDEX IF EXISTS "production_yields_active_combination_unique";
CREATE UNIQUE INDEX "production_yields_active_combination_unique"
  ON "production_yields" ("raw_material_id", "piece_width_mm", "piece_length_mm")
  WHERE "is_active" = true;

-- ============================================================
-- 9. Yeni index: raw_material_prices.price_type
-- ============================================================
DROP INDEX IF EXISTS "raw_material_prices_raw_material_id_price_type_effective_fr_idx";
CREATE INDEX "raw_material_prices_raw_material_id_price_type_effective_fr_idx"
  ON "raw_material_prices" ("raw_material_id", "price_type", "effective_from");

-- Eski index adlarını yeniden adlandır (init'te farklı isimle oluştu ise)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'extra_cost_values_extra_cost_type_id_product_group_id_product_i') THEN
    ALTER INDEX "extra_cost_values_extra_cost_type_id_product_group_id_product_i"
      RENAME TO "extra_cost_values_extra_cost_type_id_product_group_id_produ_idx";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'production_yields_raw_material_id_piece_width_mm_piece_length_m') THEN
    ALTER INDEX "production_yields_raw_material_id_piece_width_mm_piece_length_m"
      RENAME TO "production_yields_raw_material_id_piece_width_mm_piece_leng_key";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'raw_material_prices_raw_material_id_price_type_effective_from_i') THEN
    ALTER INDEX "raw_material_prices_raw_material_id_price_type_effective_from_i"
      RENAME TO "raw_material_prices_raw_material_id_price_type_effective_fr_idx";
  END IF;
END $$;
