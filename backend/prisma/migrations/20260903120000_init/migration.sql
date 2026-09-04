-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('CASH', 'CARD_INSTALLMENT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "product_groups" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "product_group_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sizes" (
    "id" UUID NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "length_mm" INTEGER NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_materials" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thickness_mm" INTEGER NOT NULL,
    "sheet_width_mm" INTEGER NOT NULL,
    "sheet_length_mm" INTEGER NOT NULL,
    "surface_type" TEXT,
    "supplier_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_prices" (
    "id" UUID NOT NULL,
    "raw_material_id" UUID NOT NULL,
    "price_type" "PriceType" NOT NULL,
    "price" DECIMAL(14,4) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_material_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_yields" (
    "id" UUID NOT NULL,
    "raw_material_id" UUID NOT NULL,
    "piece_width_mm" INTEGER NOT NULL,
    "piece_length_mm" INTEGER NOT NULL,
    "net_qty" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_yields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_size_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "raw_material_id" UUID NOT NULL,
    "production_yield_id" UUID NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_cost_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "extra_cost_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_cost_values" (
    "id" UUID NOT NULL,
    "extra_cost_type_id" UUID NOT NULL,
    "product_group_id" UUID,
    "product_id" UUID,
    "amount" DECIMAL(14,4) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extra_cost_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_settings" (
    "id" UUID NOT NULL,
    "product_group_id" UUID,
    "vat_rate" DECIMAL(8,4),
    "profit_rate" DECIMAL(8,4),
    "card_markup_rate" DECIMAL(8,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'local-admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_groups_code_key" ON "product_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_product_group_id_code_key" ON "products"("product_group_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_sizes_width_mm_length_mm_key" ON "product_sizes"("width_mm", "length_mm");

-- CreateIndex
CREATE UNIQUE INDEX "raw_materials_code_key" ON "raw_materials"("code");

-- CreateIndex
CREATE INDEX "raw_material_prices_raw_material_id_price_type_effective_from_idx" ON "raw_material_prices"("raw_material_id", "price_type", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "production_yields_raw_material_id_piece_width_mm_piece_length_mm_key" ON "production_yields"("raw_material_id", "piece_width_mm", "piece_length_mm");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_product_id_product_size_id_key" ON "recipes"("product_id", "product_size_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_items_recipe_id_sort_order_key" ON "recipe_items"("recipe_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "extra_cost_types_code_key" ON "extra_cost_types"("code");

-- CreateIndex
CREATE INDEX "extra_cost_values_extra_cost_type_id_product_group_id_product_id_idx" ON "extra_cost_values"("extra_cost_type_id", "product_group_id", "product_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "product_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_prices" ADD CONSTRAINT "raw_material_prices_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_yields" ADD CONSTRAINT "production_yields_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_size_id_fkey" FOREIGN KEY ("product_size_id") REFERENCES "product_sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_production_yield_id_fkey" FOREIGN KEY ("production_yield_id") REFERENCES "production_yields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_cost_values" ADD CONSTRAINT "extra_cost_values_extra_cost_type_id_fkey" FOREIGN KEY ("extra_cost_type_id") REFERENCES "extra_cost_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_cost_values" ADD CONSTRAINT "extra_cost_values_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "product_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_cost_values" ADD CONSTRAINT "extra_cost_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "product_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check constraints: positive dimensions, quantities and money
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_width_mm_positive" CHECK ("width_mm" > 0);
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_length_mm_positive" CHECK ("length_mm" > 0);

ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_thickness_mm_positive" CHECK ("thickness_mm" > 0);
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_sheet_width_mm_positive" CHECK ("sheet_width_mm" > 0);
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_sheet_length_mm_positive" CHECK ("sheet_length_mm" > 0);

ALTER TABLE "raw_material_prices" ADD CONSTRAINT "raw_material_prices_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "raw_material_prices" ADD CONSTRAINT "raw_material_prices_period_order" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

ALTER TABLE "production_yields" ADD CONSTRAINT "production_yields_piece_width_mm_positive" CHECK ("piece_width_mm" > 0);
ALTER TABLE "production_yields" ADD CONSTRAINT "production_yields_piece_length_mm_positive" CHECK ("piece_length_mm" > 0);
ALTER TABLE "production_yields" ADD CONSTRAINT "production_yields_net_qty_positive" CHECK ("net_qty" > 0);

ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "extra_cost_values" ADD CONSTRAINT "extra_cost_values_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "extra_cost_values" ADD CONSTRAINT "extra_cost_values_period_order" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_vat_rate_non_negative" CHECK ("vat_rate" IS NULL OR "vat_rate" >= 0);
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_profit_rate_non_negative" CHECK ("profit_rate" IS NULL OR "profit_rate" >= 0);
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_card_markup_rate_non_negative" CHECK ("card_markup_rate" IS NULL OR "card_markup_rate" >= 0);

-- Aynı malzeme + fiyat tipi için tek açık (aktif ve bitişsiz) dönem
CREATE UNIQUE INDEX "raw_material_prices_open_active_unique"
ON "raw_material_prices" ("raw_material_id", "price_type")
WHERE "is_active" = true AND "effective_to" IS NULL;

-- Aynı aktif yield kombinasyonu iki kez oluşamaz (tam unique zaten var; aktif filtre ileride history için)
CREATE UNIQUE INDEX "production_yields_active_combination_unique"
ON "production_yields" ("raw_material_id", "piece_width_mm", "piece_length_mm")
WHERE "is_active" = true;
