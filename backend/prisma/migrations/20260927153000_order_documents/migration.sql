-- Sipariş kaydı. Mevcut maliyet, NET ve fiyat tablolarına yazmaz.

CREATE TYPE "OrderLineKind" AS ENUM ('CATALOG', 'FREE_TEXT');
CREATE TYPE "OrderPriceSource" AS ENUM ('ENTERED', 'SUGGESTED_CASH', 'SUGGESTED_CARD');
CREATE TYPE "OrderMaterialSource" AS ENUM ('RECIPE', 'MANUAL');

CREATE SEQUENCE "order_document_number_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "order_documents" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_address" TEXT,
    "tax_office" TEXT,
    "customer_phone" TEXT,
    "tax_number" TEXT,
    "document_date_text" TEXT,
    "vat_rate" DECIMAL(8,4) NOT NULL,
    "gross_total" DECIMAL(18,6) NOT NULL,
    "discount_amount" DECIMAL(18,6) NOT NULL,
    "net_total" DECIMAL(18,6) NOT NULL,
    "vat_amount" DECIMAL(18,6) NOT NULL,
    "grand_total" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_documents_order_number_key" ON "order_documents"("order_number");

ALTER TABLE "order_documents"
  ADD CONSTRAINT "order_documents_vat_rate_nonneg" CHECK ("vat_rate" >= 0),
  ADD CONSTRAINT "order_documents_discount_nonneg" CHECK ("discount_amount" >= 0);

CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "order_document_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "kind" "OrderLineKind" NOT NULL,
    "product_id" UUID,
    "product_group_code" TEXT,
    "product_group_name" TEXT,
    "catalog_product_name" TEXT,
    "product_name_text" TEXT NOT NULL,
    "width_mm" DECIMAL(10,2),
    "length_mm" DECIMAL(10,2),
    "thickness_mm" DECIMAL(8,2),
    "decor_text" TEXT,
    "production_note" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit_text" TEXT NOT NULL,
    "discount_rate" DECIMAL(8,4) NOT NULL,
    "unit_price" DECIMAL(18,6) NOT NULL,
    "line_amount" DECIMAL(18,6) NOT NULL,
    "line_discount_amount" DECIMAL(18,6) NOT NULL,
    "price_source" "OrderPriceSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_lines_order_document_id_line_no_key" ON "order_lines"("order_document_id", "line_no");

ALTER TABLE "order_lines"
  ADD CONSTRAINT "order_lines_order_document_id_fkey"
    FOREIGN KEY ("order_document_id") REFERENCES "order_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_lines_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "order_lines_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_lines_unit_price_nonneg" CHECK ("unit_price" >= 0),
  ADD CONSTRAINT "order_lines_discount_rate_nonneg" CHECK ("discount_rate" >= 0),
  ADD CONSTRAINT "order_lines_amounts_nonneg" CHECK (
    "line_amount" >= 0 AND "line_discount_amount" >= 0
  );

CREATE TABLE "order_material_lines" (
    "id" UUID NOT NULL,
    "order_document_id" UUID NOT NULL,
    "source" "OrderMaterialSource" NOT NULL,
    "line_no" INTEGER,
    "raw_material_id" UUID,
    "material_name_text" TEXT NOT NULL,
    "thickness_mm" DECIMAL(8,2),
    "sheet_width_mm" INTEGER,
    "sheet_length_mm" INTEGER,
    "surface_type" TEXT,
    "quantity" DECIMAL(18,6),
    "unit_text" TEXT,
    "note" TEXT,
    "unverified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_material_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_material_lines_order_document_id_line_no_idx"
  ON "order_material_lines"("order_document_id", "line_no");

ALTER TABLE "order_material_lines"
  ADD CONSTRAINT "order_material_lines_order_document_id_fkey"
    FOREIGN KEY ("order_document_id") REFERENCES "order_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_material_lines_raw_material_id_fkey"
    FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "order_material_lines_quantity_rule" CHECK (
    ("unverified" = true AND "quantity" IS NULL)
    OR ("unverified" = false AND "quantity" IS NOT NULL AND "quantity" > 0)
  );
