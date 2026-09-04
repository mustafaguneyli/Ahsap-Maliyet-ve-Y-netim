-- ============================================================
-- Migration: raw_material_prices_no_overlap
--
-- Aynı raw_material_id + price_type için effectiveFrom/effectiveTo
-- dönemlerinin çakışmasını engeller.
--
-- effective_to = NULL → süresiz (infinity) dönem.
--
-- Not: raw_material_prices_open_active_unique yalnızca
-- "tek açık aktif dönem" garantisi verir; kapalı aralık
-- çakışmalarını engellemez. Bu EXCLUDE onu tamamlar.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "raw_material_prices"
  DROP CONSTRAINT IF EXISTS "raw_material_prices_no_overlap";

ALTER TABLE "raw_material_prices"
  ADD CONSTRAINT "raw_material_prices_no_overlap"
  EXCLUDE USING gist (
    "raw_material_id" WITH =,
    "price_type" WITH =,
    tsrange(
      "effective_from",
      COALESCE("effective_to", 'infinity'::timestamp),
      '[)'
    ) WITH &&
  );
