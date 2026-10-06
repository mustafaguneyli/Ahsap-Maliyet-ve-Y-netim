-- Üretim satırına parça ve tabaka adedini ayrı yazar.
-- Mevcut sipariş satırlarını silmez; yeni kolonlar boş kalabilir.

ALTER TABLE "order_material_lines"
  ADD COLUMN "piece_quantity" DECIMAL(18,6),
  ADD COLUMN "sheet_quantity" DECIMAL(18,6),
  ADD COLUMN "net_qty_snapshot" INTEGER,
  ADD COLUMN "component_role" TEXT;

ALTER TABLE "order_material_lines"
  ADD CONSTRAINT "order_material_lines_sheet_nonneg" CHECK (
    "sheet_quantity" IS NULL OR "sheet_quantity" > 0
  ),
  ADD CONSTRAINT "order_material_lines_net_positive" CHECK (
    "net_qty_snapshot" IS NULL OR "net_qty_snapshot" > 0
  );
