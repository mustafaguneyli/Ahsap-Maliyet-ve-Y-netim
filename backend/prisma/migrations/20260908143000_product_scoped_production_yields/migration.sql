-- Aynı MDF + parça ölçüsünde ürün üretim yöntemine göre farklı doğrulanmış NET.
ALTER TABLE "production_yields"
  ADD COLUMN "product_id" UUID;

ALTER TABLE "production_yields"
  ADD CONSTRAINT "production_yields_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "production_yields_active_combination_unique";

CREATE UNIQUE INDEX "production_yields_active_generic_unique"
  ON "production_yields" ("raw_material_id", "piece_width_mm", "piece_length_mm")
  WHERE "is_active" = true AND "product_id" IS NULL;

CREATE UNIQUE INDEX "production_yields_active_product_unique"
  ON "production_yields" (
    "product_id",
    "raw_material_id",
    "piece_width_mm",
    "piece_length_mm"
  )
  WHERE "is_active" = true AND "product_id" IS NOT NULL;

CREATE INDEX "production_yields_product_context_idx"
  ON "production_yields" (
    "product_id",
    "raw_material_id",
    "piece_width_mm",
    "piece_length_mm"
  );
