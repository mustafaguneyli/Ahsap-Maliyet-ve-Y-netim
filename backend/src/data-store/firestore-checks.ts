import { toDecimal } from '../common/decimal/decimal.util';
import { FIRESTORE_COLLECTIONS, type FirestoreCollectionName } from '../firebase/firestore.collections';
import { assertPeriodOrder, toOptionalUtcDate, toUtcDate } from '../firebase/firestore-dates';
import { moneyFromFirestore } from '../firebase/firestore-money';
import { assertDoorFrameYieldRequired } from '../modules/recipes/recipe-item.validation';
import { CheckConstraintError } from './store-errors';

function fail(constraint: string, message: string): never {
  throw new CheckConstraintError(constraint, message);
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(field, `${field} sayı olmalıdır.`);
  }
  return value;
}

function assertPositiveInt(constraint: string, field: string, value: unknown): void {
  const n = asNumber(value, field);
  if (!Number.isInteger(n) || n <= 0) {
    fail(constraint, `${field} > 0 olmalıdır.`);
  }
}

function assertNonNegativeDecimal(constraint: string, field: string, value: unknown): void {
  const amount =
    typeof value === 'number'
      ? fail(constraint, `${field} Number olamaz.`)
      : typeof value === 'string'
        ? moneyFromFirestore(value, field)
        : toDecimal(String((value as { toString(): string }).toString()));
  if (amount.isNegative()) {
    fail(constraint, `${field} negatif olamaz.`);
  }
}

function assertPositiveDecimal(constraint: string, field: string, value: unknown): void {
  const amount =
    typeof value === 'number'
      ? fail(constraint, `${field} Number olamaz.`)
      : typeof value === 'string'
        ? moneyFromFirestore(value, field)
        : toDecimal(String((value as { toString(): string }).toString()));
  if (amount.lte(0)) {
    fail(constraint, `${field} > 0 olmalıdır.`);
  }
}

function present(value: unknown): boolean {
  return value != null && value !== '';
}

function assertPeriod(doc: Record<string, unknown>): void {
  if (!present(doc.effectiveFrom)) {
    return;
  }
  const from = toUtcDate(doc.effectiveFrom, 'effectiveFrom');
  const to = toOptionalUtcDate(doc.effectiveTo, 'effectiveTo');
  try {
    assertPeriodOrder(from, to);
  } catch (error) {
    fail('period_order', error instanceof Error ? error.message : 'dönem sırası geçersiz');
  }
}

function assertScopeXor(
  constraint: string,
  groupId: unknown,
  productId: unknown,
  requireOne: boolean,
): void {
  const hasGroup = present(groupId);
  const hasProduct = present(productId);
  if (hasGroup && hasProduct) {
    fail(constraint, 'productGroupId ve productId aynı anda dolu olamaz.');
  }
  if (requireOne && !hasGroup && !hasProduct) {
    fail(constraint, 'productGroupId veya productId zorunludur.');
  }
}

export function assertFirestoreChecks(
  collection: FirestoreCollectionName,
  doc: Record<string, unknown>,
): void {
  switch (collection) {
    case FIRESTORE_COLLECTIONS.productSizes:
      assertPositiveInt('product_sizes_width_mm_positive', 'widthMm', doc.widthMm);
      assertPositiveInt('product_sizes_length_mm_positive', 'lengthMm', doc.lengthMm);
      return;
    case FIRESTORE_COLLECTIONS.rawMaterials:
      assertPositiveDecimal('raw_materials_thickness_mm_positive', 'thicknessMm', doc.thicknessMm);
      assertPositiveInt('raw_materials_sheet_width_mm_positive', 'sheetWidthMm', doc.sheetWidthMm);
      assertPositiveInt('raw_materials_sheet_length_mm_positive', 'sheetLengthMm', doc.sheetLengthMm);
      return;
    case FIRESTORE_COLLECTIONS.rawMaterialPrices:
      assertNonNegativeDecimal('raw_material_prices_price_non_negative', 'price', doc.price);
      assertPeriod(doc);
      return;
    case FIRESTORE_COLLECTIONS.productionYields:
      assertPositiveInt('production_yields_piece_width_mm_positive', 'pieceWidthMm', doc.pieceWidthMm);
      assertPositiveInt('production_yields_piece_length_mm_positive', 'pieceLengthMm', doc.pieceLengthMm);
      assertPositiveInt('production_yields_net_qty_positive', 'netQty', doc.netQty);
      return;
    case FIRESTORE_COLLECTIONS.kilcikTypes: {
      assertPositiveInt('kilcik_types_nominal_width_mm_positive', 'nominalWidthMm', doc.nominalWidthMm);
      assertPositiveInt('kilcik_types_blade_allowance_mm_positive', 'bladeAllowanceMm', doc.bladeAllowanceMm);
      assertPositiveInt('kilcik_types_cut_pitch_mm_positive', 'cutPitchMm', doc.cutPitchMm);
      if (asNumber(doc.cutPitchMm, 'cutPitchMm') !== asNumber(doc.nominalWidthMm, 'nominalWidthMm') + asNumber(doc.bladeAllowanceMm, 'bladeAllowanceMm')) {
        fail('kilcik_types_cut_pitch_identity', 'cutPitchMm = nominalWidthMm + bladeAllowanceMm olmalıdır.');
      }
      return;
    }
    case FIRESTORE_COLLECTIONS.pervazKilcikYields:
      assertPositiveInt('pervaz_kilcik_yields_pervaz_thickness_mm_positive', 'pervazThicknessMm', doc.pervazThicknessMm);
      assertPositiveInt('pervaz_kilcik_yields_piece_length_mm_positive', 'pieceLengthMm', doc.pieceLengthMm);
      assertPositiveInt('pervaz_kilcik_yields_net_qty_positive', 'netQty', doc.netQty);
      if (present(doc.excelCutWidthMm)) {
        assertPositiveInt('pervaz_kilcik_yields_excel_cut_width_mm_positive', 'excelCutWidthMm', doc.excelCutWidthMm);
      }
      return;
    case FIRESTORE_COLLECTIONS.recipeItems:
      assertPositiveDecimal('recipe_items_quantity_positive', 'quantity', doc.quantity);
      return;
    case FIRESTORE_COLLECTIONS.extraCostValues:
      assertScopeXor('extra_cost_values_scope', doc.productGroupId, doc.productId, true);
      assertNonNegativeDecimal('extra_cost_values_amount_non_negative', 'amount', doc.amount);
      assertPeriod(doc);
      return;
    case FIRESTORE_COLLECTIONS.pricingSettings: {
      assertScopeXor('pricing_settings_scope_mutual_exclusive', doc.productGroupId, doc.productId, false);
      const rates = [doc.vatRate, doc.profitRate, doc.cardMarkupRate, doc.cardFixedSurchargeAmount];
      if (rates.every((rate) => !present(rate))) {
        fail('pricing_settings_at_least_one_rate', 'En az bir oran/tutar dolu olmalıdır.');
      }
      if (present(doc.cardMarkupRate) && present(doc.cardFixedSurchargeAmount)) {
        fail('pricing_settings_card_method_mutex', 'Yüzde kart farkı ile sabit TL kart farkı aynı anda dolu olamaz.');
      }
      for (const field of ['vatRate', 'profitRate', 'cardMarkupRate', 'cardFixedSurchargeAmount'] as const) {
        if (present(doc[field])) {
          assertNonNegativeDecimal(`pricing_settings_${field}_non_negative`, field, doc[field]);
        }
      }
      return;
    }
    case FIRESTORE_COLLECTIONS.pricingThicknessModifiers:
      assertPositiveInt('pricing_thickness_modifiers_thickness_mm_positive', 'thicknessMm', doc.thicknessMm);
      assertNonNegativeDecimal('pricing_thickness_modifiers_rate_non_negative', 'rate', doc.rate);
      assertPeriod(doc);
      return;
    case FIRESTORE_COLLECTIONS.pricingRowExceptions: {
      assertPositiveInt('pricing_row_exceptions_thickness_mm_positive', 'thicknessMm', doc.thicknessMm);
      assertPositiveInt('pricing_row_exceptions_width_mm_positive', 'widthMm', doc.widthMm);
      assertPositiveInt('pricing_row_exceptions_length_mm_positive', 'lengthMm', doc.lengthMm);
      if (
        !present(doc.profitRate) &&
        !present(doc.decorativePremiumRate) &&
        !present(doc.adjustmentAmount) &&
        doc.cardSaleEnabled == null
      ) {
        fail('pricing_row_exceptions_at_least_one_value', 'Satır istisnasında en az bir değer dolu olmalıdır.');
      }
      if (present(doc.profitRate)) {
        assertNonNegativeDecimal('pricing_row_exceptions_profit_rate_non_negative', 'profitRate', doc.profitRate);
      }
      assertPeriod(doc);
      return;
    }
    case FIRESTORE_COLLECTIONS.priceOverrides:
      assertPositiveDecimal('price_overrides_cash_price_positive', 'cashPrice', doc.cashPrice);
      return;
    case FIRESTORE_COLLECTIONS.productPricingOverrides:
      assertNonNegativeDecimal('product_pricing_overrides_profit_rate_non_negative', 'profitRate', doc.profitRate);
      assertPeriod(doc);
      return;
    case FIRESTORE_COLLECTIONS.citaPublishedPriceBands:
      assertPositiveInt('cita_published_price_bands_min_width_mm_positive', 'minWidthMm', doc.minWidthMm);
      if (asNumber(doc.maxWidthMm, 'maxWidthMm') < asNumber(doc.minWidthMm, 'minWidthMm')) {
        fail('cita_published_price_bands_max_width_mm_gte_min', 'maxWidthMm >= minWidthMm olmalıdır.');
      }
      assertPositiveDecimal('cita_published_price_bands_cash_price_positive', 'cashPrice', doc.cashPrice);
      assertPositiveDecimal('cita_published_price_bands_card_price_positive', 'cardPrice', doc.cardPrice);
      assertPeriod(doc);
      return;
    case FIRESTORE_COLLECTIONS.citaPublishedPriceBandThicknesses:
      assertPositiveInt('cita_published_price_band_thicknesses_thickness_mm_positive', 'thicknessMm', doc.thicknessMm);
      return;
    case FIRESTORE_COLLECTIONS.orderDocuments:
      assertNonNegativeDecimal('order_documents_vat_rate_nonneg', 'vatRate', doc.vatRate);
      assertNonNegativeDecimal('order_documents_discount_nonneg', 'discountAmount', doc.discountAmount);
      return;
    case FIRESTORE_COLLECTIONS.orderLines:
      assertPositiveDecimal('order_lines_quantity_positive', 'quantity', doc.quantity);
      assertNonNegativeDecimal('order_lines_unit_price_nonneg', 'unitPrice', doc.unitPrice);
      assertNonNegativeDecimal('order_lines_discount_rate_nonneg', 'discountRate', doc.discountRate);
      assertNonNegativeDecimal('order_lines_amounts_nonneg', 'lineAmount', doc.lineAmount);
      assertNonNegativeDecimal('order_lines_amounts_nonneg', 'lineDiscountAmount', doc.lineDiscountAmount);
      return;
    case FIRESTORE_COLLECTIONS.orderMaterialLines: {
      if (doc.unverified === true) {
        if (present(doc.quantity)) {
          fail('order_material_lines_quantity_rule', 'unverified satırında quantity boş olmalıdır.');
        }
      } else if (!present(doc.quantity)) {
        fail('order_material_lines_quantity_rule', 'doğrulanmış satırda quantity > 0 zorunludur.');
      } else {
        assertPositiveDecimal('order_material_lines_quantity_rule', 'quantity', doc.quantity);
      }
      if (present(doc.sheetQuantity)) {
        assertPositiveDecimal('order_material_lines_sheet_nonneg', 'sheetQuantity', doc.sheetQuantity);
      }
      if (present(doc.netQtySnapshot)) {
        assertPositiveInt('order_material_lines_net_positive', 'netQtySnapshot', doc.netQtySnapshot);
      }
      return;
    }
    default:
      return;
  }
}

/** Kapı kasası productionYield zorunluluğu PG CHECK değildir; business validation'dadır. */
export const DOOR_FRAME_YIELD_REQUIRED = assertDoorFrameYieldRequired;
