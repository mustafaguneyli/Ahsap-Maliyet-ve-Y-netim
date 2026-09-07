-- Pervaz kılçık tipi master + bağlama duyarlı NET.
-- ProductionYield şeması ve kayıtları değişmez.

CREATE TABLE "kilcik_types" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nominal_width_mm" INTEGER NOT NULL,
  "blade_allowance_mm" INTEGER NOT NULL,
  "cut_pitch_mm" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kilcik_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kilcik_types_code_key" ON "kilcik_types"("code");

ALTER TABLE "kilcik_types"
  ADD CONSTRAINT "kilcik_types_nominal_width_mm_positive" CHECK ("nominal_width_mm" > 0),
  ADD CONSTRAINT "kilcik_types_blade_allowance_mm_positive" CHECK ("blade_allowance_mm" > 0),
  ADD CONSTRAINT "kilcik_types_cut_pitch_mm_positive" CHECK ("cut_pitch_mm" > 0),
  ADD CONSTRAINT "kilcik_types_cut_pitch_equals_nominal_plus_blade"
    CHECK ("cut_pitch_mm" = "nominal_width_mm" + "blade_allowance_mm");

CREATE TABLE "pervaz_kilcik_yields" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "pervaz_thickness_mm" INTEGER NOT NULL,
  "kilcik_type_id" UUID NOT NULL,
  "raw_material_id" UUID NOT NULL,
  "piece_length_mm" INTEGER NOT NULL,
  "net_qty" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pervaz_kilcik_yields_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pervaz_kilcik_yields"
  ADD CONSTRAINT "pervaz_kilcik_yields_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pervaz_kilcik_yields_kilcik_type_id_fkey"
    FOREIGN KEY ("kilcik_type_id") REFERENCES "kilcik_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pervaz_kilcik_yields_raw_material_id_fkey"
    FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pervaz_kilcik_yields"
  ADD CONSTRAINT "pervaz_kilcik_yields_pervaz_thickness_mm_positive" CHECK ("pervaz_thickness_mm" > 0),
  ADD CONSTRAINT "pervaz_kilcik_yields_piece_length_mm_positive" CHECK ("piece_length_mm" > 0),
  ADD CONSTRAINT "pervaz_kilcik_yields_net_qty_positive" CHECK ("net_qty" > 0);

CREATE INDEX "pervaz_kilcik_yields_context_idx"
  ON "pervaz_kilcik_yields" ("product_id", "pervaz_thickness_mm", "kilcik_type_id", "piece_length_mm");

-- Aktif kayıt tekilliği; inactive geçmiş korunabilir.
CREATE UNIQUE INDEX "pervaz_kilcik_yields_active_context_unique"
  ON "pervaz_kilcik_yields" ("product_id", "pervaz_thickness_mm", "kilcik_type_id", "piece_length_mm")
  WHERE "is_active" = true;
