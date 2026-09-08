-- Pervaz kart/taksit: sabit TL (Excel nakit + 2). Kapı Kasası yüzde card_markup_rate korunur.
-- İki yöntem aynı kayıtta birlikte dolu olamaz.

ALTER TABLE "pricing_settings"
  ADD COLUMN "card_fixed_surcharge_amount" DECIMAL(14, 4);

ALTER TABLE "pricing_settings"
  ADD CONSTRAINT "pricing_settings_card_fixed_surcharge_non_negative"
  CHECK (
    "card_fixed_surcharge_amount" IS NULL
    OR "card_fixed_surcharge_amount" >= 0
  );

ALTER TABLE "pricing_settings"
  ADD CONSTRAINT "pricing_settings_card_method_mutex"
  CHECK (
    NOT (
      "card_markup_rate" IS NOT NULL
      AND "card_fixed_surcharge_amount" IS NOT NULL
    )
  );

ALTER TABLE "pricing_settings"
  DROP CONSTRAINT IF EXISTS "pricing_settings_at_least_one_rate";

ALTER TABLE "pricing_settings"
  ADD CONSTRAINT "pricing_settings_at_least_one_rate"
  CHECK (
    "vat_rate" IS NOT NULL
    OR "profit_rate" IS NOT NULL
    OR "card_markup_rate" IS NOT NULL
    OR "card_fixed_surcharge_amount" IS NOT NULL
  );

ALTER TABLE "pricing_row_exceptions"
  ADD COLUMN "card_sale_enabled" BOOLEAN;

ALTER TABLE "pricing_row_exceptions"
  DROP CONSTRAINT IF EXISTS "pricing_row_exceptions_at_least_one_value";

ALTER TABLE "pricing_row_exceptions"
  ADD CONSTRAINT "pricing_row_exceptions_at_least_one_value"
  CHECK (
    "profit_rate" IS NOT NULL
    OR "decorative_premium_rate" IS NOT NULL
    OR "adjustment_amount" IS NOT NULL
    OR "card_sale_enabled" IS NOT NULL
  );
