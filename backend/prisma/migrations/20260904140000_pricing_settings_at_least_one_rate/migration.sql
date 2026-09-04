-- ============================================================
-- Migration: pricing_settings_at_least_one_rate
--
-- Aynı kayıtta vat_rate, profit_rate, card_markup_rate
-- alanlarının hepsinin NULL olması engellenir.
-- ============================================================

ALTER TABLE "pricing_settings"
  DROP CONSTRAINT IF EXISTS "pricing_settings_at_least_one_rate";

ALTER TABLE "pricing_settings"
  ADD CONSTRAINT "pricing_settings_at_least_one_rate"
  CHECK (
    "vat_rate" IS NOT NULL
    OR "profit_rate" IS NOT NULL
    OR "card_markup_rate" IS NOT NULL
  );
