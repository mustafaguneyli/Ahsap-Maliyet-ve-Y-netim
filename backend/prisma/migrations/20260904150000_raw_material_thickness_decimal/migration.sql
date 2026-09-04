-- 2.7 mm gibi ondalık MDF kalınlıkları için thickness_mm Decimal olur.
ALTER TABLE "raw_materials"
  ALTER COLUMN "thickness_mm" TYPE DECIMAL(8,2)
  USING "thickness_mm"::DECIMAL(8,2);
