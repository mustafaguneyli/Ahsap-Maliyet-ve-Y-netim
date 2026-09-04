-- ============================================================
-- Migration: extra_cost_values_period_strict
--
-- effectiveTo varsa effectiveTo > effectiveFrom olmalı.
-- Önceki kural (>=) sıfır uzunluklu döneme izin veriyordu.
-- ============================================================

ALTER TABLE "extra_cost_values"
  DROP CONSTRAINT IF EXISTS "extra_cost_values_period_order";

ALTER TABLE "extra_cost_values"
  ADD CONSTRAINT "extra_cost_values_period_order"
  CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
