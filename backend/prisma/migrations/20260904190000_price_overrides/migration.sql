-- ============================================================
-- Migration: price_overrides
--
-- Kapı Kasası ticari nakit fiyat override katmanı.
-- Hesaplanan fiyat saklanmaz / overwrite edilmez.
-- Aynı product + product_size için tek aktif kayıt.
-- cash_price > 0 (Decimal).
-- ============================================================

CREATE TABLE IF NOT EXISTS "price_overrides" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_size_id" UUID NOT NULL,
  "cash_price" DECIMAL(14, 4) NOT NULL,
  "reason" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "price_overrides_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "price_overrides"
  DROP CONSTRAINT IF EXISTS "price_overrides_product_id_fkey";
ALTER TABLE "price_overrides"
  ADD CONSTRAINT "price_overrides_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_overrides"
  DROP CONSTRAINT IF EXISTS "price_overrides_product_size_id_fkey";
ALTER TABLE "price_overrides"
  ADD CONSTRAINT "price_overrides_product_size_id_fkey"
  FOREIGN KEY ("product_size_id") REFERENCES "product_sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_overrides"
  DROP CONSTRAINT IF EXISTS "price_overrides_cash_price_positive";
ALTER TABLE "price_overrides"
  ADD CONSTRAINT "price_overrides_cash_price_positive"
  CHECK ("cash_price" > 0);

DROP INDEX IF EXISTS "price_overrides_product_id_product_size_id_idx";
CREATE INDEX "price_overrides_product_id_product_size_id_idx"
  ON "price_overrides" ("product_id", "product_size_id");

DROP INDEX IF EXISTS "price_overrides_active_unique_per_product_size";
CREATE UNIQUE INDEX "price_overrides_active_unique_per_product_size"
  ON "price_overrides" ("product_id", "product_size_id")
  WHERE "is_active" = true;
