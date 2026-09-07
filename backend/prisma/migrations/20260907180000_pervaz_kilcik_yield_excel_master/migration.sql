-- Excel MASTER kılçık yield: tip opsiyonel, source + excel cut width.
-- Mevcut 4 kayıt silinmez / dönüştürülmez (kilcik_type_id ve net_qty aynı kalır).

CREATE TYPE "PervazKilcikYieldSource" AS ENUM ('EXCEL_MASTER', 'MANUAL_VERIFIED');

ALTER TABLE "pervaz_kilcik_yields"
  ADD COLUMN "source" "PervazKilcikYieldSource" NOT NULL DEFAULT 'EXCEL_MASTER',
  ADD COLUMN "excel_cut_width_mm" INTEGER;

ALTER TABLE "pervaz_kilcik_yields"
  ALTER COLUMN "kilcik_type_id" DROP NOT NULL;

ALTER TABLE "pervaz_kilcik_yields"
  ADD CONSTRAINT "pervaz_kilcik_yields_excel_cut_width_mm_positive"
    CHECK ("excel_cut_width_mm" IS NULL OR "excel_cut_width_mm" > 0);

DROP INDEX IF EXISTS "pervaz_kilcik_yields_active_context_unique";
DROP INDEX IF EXISTS "pervaz_kilcik_yields_context_idx";

CREATE INDEX "pervaz_kilcik_yields_excel_context_idx"
  ON "pervaz_kilcik_yields" ("product_id", "pervaz_thickness_mm", "piece_length_mm");

-- Aktif Excel master: product + kalınlık + boy (NULL kilcik_type_id duplicate üretmez).
CREATE UNIQUE INDEX "pervaz_kilcik_yields_active_excel_master_unique"
  ON "pervaz_kilcik_yields" ("product_id", "pervaz_thickness_mm", "piece_length_mm")
  WHERE "is_active" = true AND "source" = 'EXCEL_MASTER';

-- Aktif tipe özel manuel kayıt.
CREATE UNIQUE INDEX "pervaz_kilcik_yields_active_manual_typed_unique"
  ON "pervaz_kilcik_yields" ("product_id", "pervaz_thickness_mm", "kilcik_type_id", "piece_length_mm")
  WHERE "is_active" = true
    AND "source" = 'MANUAL_VERIFIED'
    AND "kilcik_type_id" IS NOT NULL;
