-- ============================================================
-- Süpürgelik dekoratif satış fiyatı oranı
--
-- Oran üretim maliyeti değildir. SUPURGELIK grup + kalınlık scope'unda
-- tutulur; aynı oran beş farklı ene kopyalanmaz. Hesapta normal baz satış
-- fiyatının ilk ROUNDUP sonucundan sonra uygulanır.
-- ============================================================

CREATE TYPE "PricingModifierType" AS ENUM ('DECORATIVE');

CREATE TABLE "pricing_thickness_modifiers" (
  "id" UUID NOT NULL,
  "product_group_id" UUID NOT NULL,
  "modifier_type" "PricingModifierType" NOT NULL,
  "thickness_mm" INTEGER NOT NULL,
  "rate" DECIMAL(8, 4) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pricing_thickness_modifiers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pricing_thickness_modifiers"
  ADD CONSTRAINT "pricing_thickness_modifiers_product_group_id_fkey"
  FOREIGN KEY ("product_group_id") REFERENCES "product_groups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_thickness_modifiers"
  ADD CONSTRAINT "pricing_thickness_modifiers_thickness_mm_positive"
  CHECK ("thickness_mm" > 0);

ALTER TABLE "pricing_thickness_modifiers"
  ADD CONSTRAINT "pricing_thickness_modifiers_rate_non_negative"
  CHECK ("rate" >= 0);

ALTER TABLE "pricing_thickness_modifiers"
  ADD CONSTRAINT "pricing_thickness_modifiers_period_order"
  CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

CREATE INDEX "pricing_thickness_modifiers_context_idx"
  ON "pricing_thickness_modifiers" ("product_group_id", "modifier_type", "thickness_mm");

CREATE UNIQUE INDEX "pricing_thickness_modifiers_active_open_unique"
  ON "pricing_thickness_modifiers" ("product_group_id", "modifier_type", "thickness_mm")
  WHERE "is_active" = true AND "effective_to" IS NULL;
