-- ============================================================
-- Migration: pricing_row_exceptions
--
-- AYARLI_PERVAZ satır bazlı kâr / ROUNDUP-sonrası adjustment.
-- Mutlak satış fiyatı saklanmaz (PriceOverride'dan ayrı).
-- Aktif + açık dönemde (is_active, effective_to IS NULL) satır tekilliği.
-- ============================================================

CREATE TABLE "pricing_row_exceptions" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "thickness_mm" INTEGER NOT NULL,
  "width_mm" INTEGER NOT NULL,
  "length_mm" INTEGER NOT NULL,
  "profit_rate" DECIMAL(8, 4),
  "adjustment_amount" DECIMAL(14, 4),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pricing_row_exceptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_thickness_mm_positive"
  CHECK ("thickness_mm" > 0);

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_width_mm_positive"
  CHECK ("width_mm" > 0);

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_length_mm_positive"
  CHECK ("length_mm" > 0);

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_profit_rate_non_negative"
  CHECK ("profit_rate" IS NULL OR "profit_rate" >= 0);

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_at_least_one_value"
  CHECK ("profit_rate" IS NOT NULL OR "adjustment_amount" IS NOT NULL);

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_period_order"
  CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

CREATE INDEX "pricing_row_exceptions_row_idx"
  ON "pricing_row_exceptions" ("product_id", "thickness_mm", "width_mm", "length_mm");

CREATE UNIQUE INDEX "pricing_row_exceptions_active_open_row_unique"
  ON "pricing_row_exceptions" ("product_id", "thickness_mm", "width_mm", "length_mm")
  WHERE "is_active" = true AND "effective_to" IS NULL;
