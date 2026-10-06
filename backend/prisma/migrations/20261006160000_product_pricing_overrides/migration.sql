-- ============================================================
-- Migration: product_pricing_overrides
--
-- Ürün / ürün+ölçü kâr oranı (profitRate). Hard delete yok.
-- Aktif + açık dönemde (is_active, effective_to IS NULL) tekillik.
-- ============================================================

CREATE TABLE "product_pricing_overrides" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_size_id" UUID,
  "profit_rate" DECIMAL(8, 4) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_pricing_overrides_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "product_pricing_overrides"
  ADD CONSTRAINT "product_pricing_overrides_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_pricing_overrides"
  ADD CONSTRAINT "product_pricing_overrides_product_size_id_fkey"
  FOREIGN KEY ("product_size_id") REFERENCES "product_sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_pricing_overrides"
  ADD CONSTRAINT "product_pricing_overrides_profit_rate_non_negative"
  CHECK ("profit_rate" >= 0);

ALTER TABLE "product_pricing_overrides"
  ADD CONSTRAINT "product_pricing_overrides_period_order"
  CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

CREATE INDEX "product_pricing_overrides_scope_idx"
  ON "product_pricing_overrides" ("product_id", "product_size_id");

CREATE UNIQUE INDEX "product_pricing_overrides_active_open_size_unique"
  ON "product_pricing_overrides" ("product_id", "product_size_id")
  WHERE "is_active" = true AND "effective_to" IS NULL AND "product_size_id" IS NOT NULL;

CREATE UNIQUE INDEX "product_pricing_overrides_active_open_product_unique"
  ON "product_pricing_overrides" ("product_id")
  WHERE "is_active" = true AND "effective_to" IS NULL AND "product_size_id" IS NULL;
