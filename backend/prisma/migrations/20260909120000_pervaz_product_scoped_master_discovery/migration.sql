-- Runtime Pervaz listeleri product-scoped ProductionYield MASTER kayıtlarını keşfeder.
-- Eski generic Pervaz master'ları korunur; ilgili ürünler için güvenli kopyaları oluşturulur.
WITH desired(product_code, material_code, piece_width_mm, piece_length_mm) AS (
  VALUES
    ('AYARLI_PERVAZ', 'MDF-9-2200X2800-ZIMPARALI', 70, 2200),
    ('AYARLI_PERVAZ', 'MDF-9-2200X2800-ZIMPARALI', 80, 2200),
    ('AYARLI_PERVAZ', 'MDF-9-2200X2800-ZIMPARALI', 80, 2300),
    ('AYARLI_PERVAZ', 'MDF-9-2200X2800-ZIMPARALI', 90, 2200),
    ('AYARLI_PERVAZ', 'MDF-9-2200X2800-ZIMPARALI', 90, 2500),
    ('AYARLI_PERVAZ', 'MDF-9-2200X2800-ZIMPARALI', 100, 2200),
    ('AYARLI_PERVAZ', 'MDF-9-2200X2800-ZIMPARALI', 100, 2550),
    ('AYARLI_PERVAZ', 'MDF-9-2200X2800-ZIMPARALI', 120, 2200),
    ('AYARLI_PERVAZ', 'MDF-12-2200X2800-ZIMPARALI', 70, 2200),
    ('AYARLI_PERVAZ', 'MDF-12-2200X2800-ZIMPARALI', 80, 2200),
    ('AYARLI_PERVAZ', 'MDF-12-2200X2800-ZIMPARALI', 90, 2200),
    ('AYARLI_PERVAZ', 'MDF-12-2200X2800-ZIMPARALI', 100, 2200),
    ('AYARLI_PERVAZ', 'MDF-12-2100X2800-ZIMPARALI', 100, 2500),
    ('AYARLI_PERVAZ', 'MDF-14-2100X2800-ZIMPARALI', 100, 2200),
    ('AYARLI_PERVAZ', 'MDF-14-2100X2800-ZIMPARALI', 100, 2500),
    ('AYARLI_PERVAZ', 'MDF-16-2100X2800-ZIMPARALI', 100, 2200),
    ('AYARLI_PERVAZ', 'MDF-16-2100X2800-ZIMPARALI', 100, 2500),
    ('AYARLI_PERVAZ', 'MDF-18-2200X2800-ZIMPARALI', 100, 2200),
    ('AYARLI_PERVAZ', 'MDF-18-2200X2800-ZIMPARALI', 80, 2200),
    ('AYARLI_PERVAZ', 'MDF-18-2200X2800-ZIMPARALI', 100, 2500),
    ('DEKORATIF_PERVAZ', 'MDF-12-2200X2800-ZIMPARALI', 100, 2200),
    ('DEKORATIF_PERVAZ', 'MDF-12-2200X2800-ZIMPARALI', 100, 2500),
    ('DEKORATIF_PERVAZ', 'MDF-14-2100X2800-ZIMPARALI', 100, 2200),
    ('DEKORATIF_PERVAZ', 'MDF-14-2100X2800-ZIMPARALI', 100, 2500),
    ('DEKORATIF_PERVAZ', 'MDF-18-2200X2800-ZIMPARALI', 100, 2200),
    ('DEKORATIF_PERVAZ', 'MDF-18-2100X2800-ZIMPARALI', 100, 2500)
)
INSERT INTO "production_yields" (
  "id",
  "product_id",
  "raw_material_id",
  "piece_width_mm",
  "piece_length_mm",
  "net_qty",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  product."id",
  source."raw_material_id",
  source."piece_width_mm",
  source."piece_length_mm",
  source."net_qty",
  true,
  source."created_at",
  source."updated_at"
FROM desired
JOIN "product_groups" AS product_group
  ON product_group."code" = 'PERVAZ'
JOIN "products" AS product
  ON product."product_group_id" = product_group."id"
 AND product."code" = desired.product_code
JOIN "raw_materials" AS material
  ON material."code" = desired.material_code
JOIN "production_yields" AS source
  ON source."product_id" IS NULL
 AND source."raw_material_id" = material."id"
 AND source."piece_width_mm" = desired.piece_width_mm
 AND source."piece_length_mm" = desired.piece_length_mm
 AND source."is_active" = true
WHERE product_group."is_active" = true
  AND product."is_active" = true
  AND material."is_active" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "production_yields" AS existing
    WHERE existing."product_id" = product."id"
      AND existing."raw_material_id" = source."raw_material_id"
      AND existing."piece_width_mm" = source."piece_width_mm"
      AND existing."piece_length_mm" = source."piece_length_mm"
      AND existing."is_active" = true
  );
