-- DEKORATIF_PERVAZ Excel satırlarındaki dönemsel dekoratif fark oranı.
ALTER TABLE "pricing_row_exceptions"
  ADD COLUMN "decorative_premium_rate" DECIMAL(8, 4);

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_decorative_premium_rate_non_negative"
  CHECK ("decorative_premium_rate" IS NULL OR "decorative_premium_rate" >= 0);

ALTER TABLE "pricing_row_exceptions"
  DROP CONSTRAINT "pricing_row_exceptions_at_least_one_value";

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_at_least_one_value"
  CHECK (
    "profit_rate" IS NOT NULL
    OR "decorative_premium_rate" IS NOT NULL
    OR "adjustment_amount" IS NOT NULL
  );
