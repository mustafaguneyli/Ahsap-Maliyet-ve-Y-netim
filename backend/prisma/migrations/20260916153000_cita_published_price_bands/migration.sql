-- ============================================================
-- Çıta yayınlanmış satış fiyat bantları
--
-- Satış fiyatı productionCost'tan hesaplanmaz. Width band + thickness
-- kapsamı + bağımsız cashPrice/cardPrice master değerleridir.
-- Kart fiyatı nakit × 1.20 ile türetilmez.
-- Eski dönem kapatılır; overwrite yok.
-- ============================================================

CREATE TABLE "cita_published_price_bands" (
  "id" UUID NOT NULL,
  "product_group_id" UUID NOT NULL,
  "min_width_mm" INTEGER NOT NULL,
  "max_width_mm" INTEGER NOT NULL,
  "cash_price" DECIMAL(14, 4) NOT NULL,
  "card_price" DECIMAL(14, 4) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cita_published_price_bands_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cita_published_price_bands"
  ADD CONSTRAINT "cita_published_price_bands_product_group_id_fkey"
  FOREIGN KEY ("product_group_id") REFERENCES "product_groups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cita_published_price_bands"
  ADD CONSTRAINT "cita_published_price_bands_min_width_mm_positive"
  CHECK ("min_width_mm" > 0);

ALTER TABLE "cita_published_price_bands"
  ADD CONSTRAINT "cita_published_price_bands_max_width_mm_gte_min"
  CHECK ("max_width_mm" >= "min_width_mm");

ALTER TABLE "cita_published_price_bands"
  ADD CONSTRAINT "cita_published_price_bands_cash_price_positive"
  CHECK ("cash_price" > 0);

ALTER TABLE "cita_published_price_bands"
  ADD CONSTRAINT "cita_published_price_bands_card_price_positive"
  CHECK ("card_price" > 0);

ALTER TABLE "cita_published_price_bands"
  ADD CONSTRAINT "cita_published_price_bands_period_order"
  CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

CREATE INDEX "cita_published_price_bands_range_idx"
  ON "cita_published_price_bands" ("product_group_id", "min_width_mm", "max_width_mm");

CREATE UNIQUE INDEX "cita_published_price_bands_active_open_unique"
  ON "cita_published_price_bands" ("product_group_id", "min_width_mm", "max_width_mm")
  WHERE "is_active" = true AND "effective_to" IS NULL;

CREATE TABLE "cita_published_price_band_thicknesses" (
  "id" UUID NOT NULL,
  "band_id" UUID NOT NULL,
  "thickness_mm" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cita_published_price_band_thicknesses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cita_published_price_band_thicknesses"
  ADD CONSTRAINT "cita_published_price_band_thicknesses_band_id_fkey"
  FOREIGN KEY ("band_id") REFERENCES "cita_published_price_bands"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cita_published_price_band_thicknesses"
  ADD CONSTRAINT "cita_published_price_band_thicknesses_thickness_mm_positive"
  CHECK ("thickness_mm" > 0);

CREATE UNIQUE INDEX "cita_published_price_band_thicknesses_band_id_thickness_mm_key"
  ON "cita_published_price_band_thicknesses" ("band_id", "thickness_mm");
