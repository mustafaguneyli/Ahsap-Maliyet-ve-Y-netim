-- ============================================================
-- Migration: pricing_settings_product_scope
--
-- PricingSetting product-level kapsam:
--   - product_id nullable
--   - product_group_id ve product_id aynı anda dolu olamaz
--   - ikisi de null = global ayar (mevcut davranış korunur)
--   - aynı product için tek aktif kayıt
-- Mevcut grup/global kayıtlar product_id NULL kalır; bozulmaz.
-- ============================================================

ALTER TABLE "pricing_settings"
  ADD COLUMN IF NOT EXISTS "product_id" UUID;

ALTER TABLE "pricing_settings"
  DROP CONSTRAINT IF EXISTS "pricing_settings_product_id_fkey";

ALTER TABLE "pricing_settings"
  ADD CONSTRAINT "pricing_settings_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_settings"
  DROP CONSTRAINT IF EXISTS "pricing_settings_scope_mutual_exclusive";

ALTER TABLE "pricing_settings"
  ADD CONSTRAINT "pricing_settings_scope_mutual_exclusive"
    CHECK (NOT ("product_group_id" IS NOT NULL AND "product_id" IS NOT NULL));

DROP INDEX IF EXISTS "pricing_settings_product_group_id_product_id_idx";
CREATE INDEX "pricing_settings_product_group_id_product_id_idx"
  ON "pricing_settings" ("product_group_id", "product_id");

DROP INDEX IF EXISTS "pricing_settings_active_unique_per_product";
CREATE UNIQUE INDEX "pricing_settings_active_unique_per_product"
  ON "pricing_settings" ("product_id")
  WHERE "is_active" = true AND "product_id" IS NOT NULL;
