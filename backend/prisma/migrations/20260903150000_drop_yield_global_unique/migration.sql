-- ============================================================
-- Migration: drop_yield_global_unique
--
-- production_yields üzerindeki global unique constraint kaldırılıyor.
-- Tekillik, yalnızca is_active=true kayıtlar için tanımlanan
-- production_yields_active_combination_unique partial unique index
-- ile sağlanmaya devam ediyor.
--
-- Böylece: aynı MDF + ölçü kombinasyonu için inactive (arşiv)
-- kayıtlar saklanabilir, yeni active kayıt oluşturulabilir.
-- ============================================================

DROP INDEX IF EXISTS "production_yields_raw_material_id_piece_width_mm_piece_leng_key";
DROP INDEX IF EXISTS "production_yields_raw_material_id_piece_width_mm_piece_length_mm_key";
