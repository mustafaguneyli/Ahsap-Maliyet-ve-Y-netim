-- ============================================================
-- Migration: pricing_settings_global_unique_null_product
--
-- Global unique, product_group_id IS NULL olan TÜM aktif satırları
-- kapsıyordu. Product-level kayıtlar da group_id NULL olduğu için
-- ikinci ürün ayarı (ör. 30_MM) global tekillikle çakışıyordu.
--
-- Gerçek global: product_group_id IS NULL AND product_id IS NULL
-- ============================================================

DROP INDEX IF EXISTS "pricing_settings_active_global_unique";
CREATE UNIQUE INDEX "pricing_settings_active_global_unique"
  ON "pricing_settings" ((1))
  WHERE "is_active" = true
    AND "product_group_id" IS NULL
    AND "product_id" IS NULL;
