-- Generic recipe / dinamik katalog: calculatorType, product unit, recipe item modes, price basis, extra cost mode.
-- Mevcut özel gruplar backfill edilir; mevcut satırlar bozulmaz.

CREATE TYPE "CalculatorType" AS ENUM (
  'DOOR_FRAME',
  'PERVAZ',
  'SUPURGELIK',
  'CITA',
  'DOOR_BUILD',
  'GENERIC_RECIPE'
);

CREATE TYPE "ProductUnit" AS ENUM ('ADET', 'BOY', 'METRE', 'M2');

CREATE TYPE "RawMaterialPriceBasis" AS ENUM ('SHEET', 'UNIT', 'METER', 'SQUARE_METER');

CREATE TYPE "RecipeItemCalculationMode" AS ENUM (
  'PER_PIECE',
  'PER_SHEET_YIELD',
  'PER_METER',
  'PER_SQUARE_METER',
  'FIXED_QUANTITY'
);

CREATE TYPE "ExtraCostCalculationMode" AS ENUM (
  'FIXED',
  'PER_PRODUCT_QUANTITY',
  'PER_RECIPE_QUANTITY'
);

ALTER TABLE "product_groups"
  ADD COLUMN "calculator_type" "CalculatorType" NOT NULL DEFAULT 'GENERIC_RECIPE';

UPDATE "product_groups" SET "calculator_type" = 'DOOR_FRAME' WHERE "code" = 'door_frame';
UPDATE "product_groups" SET "calculator_type" = 'PERVAZ' WHERE "code" = 'PERVAZ';
UPDATE "product_groups" SET "calculator_type" = 'SUPURGELIK' WHERE "code" = 'SUPURGELIK';
UPDATE "product_groups" SET "calculator_type" = 'CITA' WHERE "code" = 'CITA';
UPDATE "product_groups" SET "calculator_type" = 'DOOR_BUILD' WHERE "code" = 'KAPI_IMALATI';

ALTER TABLE "products"
  ADD COLUMN "has_sizes" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "unit" "ProductUnit" NOT NULL DEFAULT 'ADET';

ALTER TABLE "raw_materials"
  ADD COLUMN "price_basis" "RawMaterialPriceBasis" NOT NULL DEFAULT 'SHEET';

ALTER TABLE "recipe_items"
  ADD COLUMN "calculation_mode" "RecipeItemCalculationMode",
  ADD COLUMN "quantity_unit" VARCHAR(32),
  ADD COLUMN "waste_rate" DECIMAL(8, 4);

ALTER TABLE "extra_cost_values"
  ADD COLUMN "calculation_mode" "ExtraCostCalculationMode" NOT NULL DEFAULT 'FIXED';
