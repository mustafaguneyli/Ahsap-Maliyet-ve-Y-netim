import { BadRequestException } from '@nestjs/common';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';
import { applyPercentCardSale } from '../pricing/percent-card-sale';

export const RECIPE_CALCULATION_MODES = [
  'PER_PIECE',
  'PER_SHEET_YIELD',
  'PER_METER',
  'PER_SQUARE_METER',
  'FIXED_QUANTITY',
] as const;

export type RecipeCalculationMode = (typeof RECIPE_CALCULATION_MODES)[number];

export const RAW_MATERIAL_PRICE_BASES = [
  'SHEET',
  'UNIT',
  'METER',
  'SQUARE_METER',
] as const;

export type RawMaterialPriceBasisCode = (typeof RAW_MATERIAL_PRICE_BASES)[number];

export const EXTRA_COST_CALCULATION_MODES = [
  'FIXED',
  'PER_PRODUCT_QUANTITY',
  'PER_RECIPE_QUANTITY',
] as const;

export type ExtraCostCalculationModeCode =
  (typeof EXTRA_COST_CALCULATION_MODES)[number];

export type GenericRecipeItemInput = {
  sortOrder: number;
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  priceBasis: RawMaterialPriceBasisCode;
  /** Aktif alış fiyatı (Decimal string). Yoksa missingSources. */
  unitPrice: string | null;
  calculationMode: RecipeCalculationMode;
  quantity: string;
  quantityUnit?: string | null;
  wasteRate?: string | null;
  netQty?: number | null;
  productionYieldId?: string | null;
};

export type GenericExtraCostInput = {
  typeCode: string;
  typeName: string;
  amount: string;
  calculationMode: ExtraCostCalculationModeCode;
  scope: 'GROUP' | 'PRODUCT';
};

export type GenericRecipeCostInput = {
  productGroupCode: string;
  productGroupName: string;
  productCode: string;
  productName: string;
  productUnit: 'ADET' | 'BOY' | 'METRE' | 'M2';
  widthMm: number;
  lengthMm: number;
  displayName: string;
  materialPriceType: 'CASH' | 'CARD_INSTALLMENT';
  items: GenericRecipeItemInput[];
  extraCosts: GenericExtraCostInput[];
  vatRate: string | null;
  profitRate: string | null;
  cardMarkupRate: string | null;
};

export type GenericMaterialCostLine = {
  sortOrder: number;
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  calculationMode: RecipeCalculationMode;
  quantity: string;
  quantityUnit: string | null;
  wasteRate: string | null;
  netQty: number | null;
  unitPrice: string;
  materialUnitCost: string;
  lineCost: string;
};

export type GenericExtraCostLine = {
  typeCode: string;
  typeName: string;
  amount: string;
  calculationMode: ExtraCostCalculationModeCode;
  scope: 'GROUP' | 'PRODUCT';
  appliedAmount: string;
};

export type GenericRecipeCostResult = {
  status: 'OK' | 'MISSING_SOURCE';
  productGroupCode: string;
  productGroupName: string;
  productCode: string;
  productName: string;
  productUnit: string;
  widthMm: number;
  lengthMm: number;
  displayName: string;
  materialPriceType: string;
  materialCosts: GenericMaterialCostLine[];
  materialCostTotal: string | null;
  extraCosts: GenericExtraCostLine[];
  extraCostTotal: string | null;
  productionCost: string | null;
  missingSources: string[];
  warnings: string[];
  pricing: {
    vatRate: string | null;
    profitRate: string | null;
    cashSalePrice: string | null;
    cardSalePrice: string | null;
    cardStatusCode: string | null;
    cardStatusMessage: string | null;
  } | null;
};

function assertMode(mode: string): asserts mode is RecipeCalculationMode {
  if (!(RECIPE_CALCULATION_MODES as readonly string[]).includes(mode)) {
    throw new BadRequestException(
      `Desteklenmeyen calculationMode: ${mode}. ` +
        `Bu hesap tipi generic recipe ile desteklenmiyor.`,
    );
  }
}

function applyWaste(quantity: ReturnType<typeof toDecimal>, wasteRate: string | null | undefined) {
  if (wasteRate == null || wasteRate === '') {
    return quantity;
  }
  const rate = toDecimal(wasteRate);
  if (rate.isNegative()) {
    throw new BadRequestException('wasteRate negatif olamaz.');
  }
  // wasteRate yüzde puanı: 5 → ×1.05
  return quantity.times(toDecimal(1).plus(rate.div(100)));
}

/**
 * Saf generic reçete maliyeti. Formül frontend'de yok; Decimal.js.
 * Eksik fiyat/NET → 0 uydurulmaz; missingSources.
 */
export function calculateGenericRecipeCost(
  input: GenericRecipeCostInput,
): GenericRecipeCostResult {
  const missingSources: string[] = [];
  const warnings: string[] = [];

  if (!input.items.length) {
    throw new BadRequestException('Generic recipe boş olamaz.');
  }

  const materialCosts: GenericMaterialCostLine[] = [];
  let materialTotal = toDecimal(0);
  let materialOk = true;

  for (const item of input.items) {
    assertMode(item.calculationMode);
    const qty = toDecimal(item.quantity);
    if (!qty.isFinite() || qty.lte(0)) {
      throw new BadRequestException(
        `Recipe quantity > 0 olmalıdır (sortOrder ${item.sortOrder}).`,
      );
    }

    if (item.unitPrice == null || item.unitPrice === '') {
      missingSources.push(
        `${item.rawMaterialCode} için ${input.materialPriceType} alış fiyatı yok.`,
      );
      materialOk = false;
      continue;
    }

    const price = toDecimal(item.unitPrice);
    if (!price.isFinite() || price.lt(0)) {
      throw new BadRequestException(
        `${item.rawMaterialCode} alış fiyatı geçersiz.`,
      );
    }

    let materialUnitCost = toDecimal(0);
    let effectiveQty = applyWaste(qty, item.wasteRate);

    switch (item.calculationMode) {
      case 'PER_SHEET_YIELD': {
        if (item.priceBasis !== 'SHEET') {
          throw new BadRequestException(
            `${item.rawMaterialCode}: PER_SHEET_YIELD yalnız SHEET fiyat birimli malzemede kullanılır ` +
              `(priceBasis=${item.priceBasis}).`,
          );
        }
        if (item.netQty == null || !Number.isInteger(item.netQty) || item.netQty <= 0) {
          missingSources.push(
            `${item.rawMaterialCode} için NET (ProductionYield) zorunlu.`,
          );
          materialOk = false;
          continue;
        }
        materialUnitCost = price.div(item.netQty);
        break;
      }
      case 'PER_PIECE':
      case 'FIXED_QUANTITY': {
        if (item.priceBasis === 'SHEET') {
          throw new BadRequestException(
            `${item.rawMaterialCode}: tabaka (SHEET) fiyatı ${item.calculationMode} ile hesaplanamaz. ` +
              `PER_SHEET_YIELD kullanın veya fiyat birimini UNIT yapın.`,
          );
        }
        if (item.priceBasis !== 'UNIT' && item.calculationMode === 'PER_PIECE') {
          warnings.push(
            `${item.rawMaterialCode}: PER_PIECE için UNIT fiyat birimi önerilir (priceBasis=${item.priceBasis}).`,
          );
        }
        materialUnitCost = price;
        break;
      }
      case 'PER_METER': {
        if (item.priceBasis !== 'METER' && item.priceBasis !== 'UNIT') {
          throw new BadRequestException(
            `${item.rawMaterialCode}: PER_METER için METER veya UNIT fiyat birimi gerekir ` +
              `(priceBasis=${item.priceBasis}). Otomatik fiziksel çıkarım yapılmaz.`,
          );
        }
        materialUnitCost = price;
        break;
      }
      case 'PER_SQUARE_METER': {
        if (item.priceBasis !== 'SQUARE_METER' && item.priceBasis !== 'UNIT') {
          throw new BadRequestException(
            `${item.rawMaterialCode}: PER_SQUARE_METER için SQUARE_METER veya UNIT fiyat birimi gerekir ` +
              `(priceBasis=${item.priceBasis}).`,
          );
        }
        materialUnitCost = price;
        break;
      }
      default: {
        const _exhaustive: never = item.calculationMode;
        throw new BadRequestException(
          `Desteklenmeyen calculationMode: ${String(_exhaustive)}.`,
        );
      }
    }

    const lineCost = materialUnitCost.times(effectiveQty);
    materialTotal = materialTotal.plus(lineCost);
    materialCosts.push({
      sortOrder: item.sortOrder,
      rawMaterialId: item.rawMaterialId,
      rawMaterialCode: item.rawMaterialCode,
      rawMaterialName: item.rawMaterialName,
      calculationMode: item.calculationMode,
      quantity: qty.toFixed(),
      quantityUnit: item.quantityUnit ?? null,
      wasteRate: item.wasteRate ?? null,
      netQty: item.netQty ?? null,
      unitPrice: price.toFixed(),
      materialUnitCost: materialUnitCost.toFixed(),
      lineCost: lineCost.toFixed(),
    });
  }

  const extraLines: GenericExtraCostLine[] = [];
  let extraTotal = toDecimal(0);
  for (const extra of input.extraCosts) {
    const amount = toDecimal(extra.amount);
    if (!amount.isFinite() || amount.lt(0)) {
      throw new BadRequestException(
        `Ek maliyet ${extra.typeCode} tutarı geçersiz.`,
      );
    }
    let applied = amount;
    if (extra.calculationMode === 'PER_PRODUCT_QUANTITY') {
      // Birim üretim maliyeti hesabında quantity=1 kabul edilir; sipariş çarpanı quote'ta.
      applied = amount;
    } else if (extra.calculationMode === 'PER_RECIPE_QUANTITY') {
      applied = amount;
    } else if (extra.calculationMode !== 'FIXED') {
      throw new BadRequestException(
        `Desteklenmeyen ExtraCost calculationMode: ${extra.calculationMode}`,
      );
    }
    extraTotal = extraTotal.plus(applied);
    extraLines.push({
      typeCode: extra.typeCode,
      typeName: extra.typeName,
      amount: amount.toFixed(),
      calculationMode: extra.calculationMode,
      scope: extra.scope,
      appliedAmount: applied.toFixed(),
    });
  }

  if (!materialOk) {
    return {
      status: 'MISSING_SOURCE',
      productGroupCode: input.productGroupCode,
      productGroupName: input.productGroupName,
      productCode: input.productCode,
      productName: input.productName,
      productUnit: input.productUnit,
      widthMm: input.widthMm,
      lengthMm: input.lengthMm,
      displayName: input.displayName,
      materialPriceType: input.materialPriceType,
      materialCosts,
      materialCostTotal: null,
      extraCosts: extraLines,
      extraCostTotal: extraTotal.toFixed(),
      productionCost: null,
      missingSources,
      warnings,
      pricing: null,
    };
  }

  const productionCost = materialTotal.plus(extraTotal);
  let pricing: GenericRecipeCostResult['pricing'] = null;

  if (input.vatRate != null && input.profitRate != null) {
    const vatRate = toDecimal(input.vatRate);
    const profitRate = toDecimal(input.profitRate);
    if (vatRate.isNegative() || profitRate.isNegative()) {
      throw new BadRequestException('vatRate/profitRate negatif olamaz.');
    }
    const vatAmount = productionCost.times(vatRate.div(100));
    const costWithVat = productionCost.plus(vatAmount);
    const profitAmount = costWithVat.times(profitRate.div(100));
    const beforeRound = costWithVat.plus(profitAmount);
    const cash = roundUpToWholeTl(beforeRound);
    const card = applyPercentCardSale({
      cashPrice: cash.toFixed(),
      cardMarkupRate: input.cardMarkupRate,
      rounding: 'roundUpWholeTl',
    });
    pricing = {
      vatRate: vatRate.toFixed(),
      profitRate: profitRate.toFixed(),
      cashSalePrice: cash.toFixed(),
      cardSalePrice: card.cardSalePrice,
      cardStatusCode: card.statusCode,
      cardStatusMessage: card.statusMessage,
    };
  } else {
    warnings.push(
      'Grup PricingSetting (vatRate/profitRate) yok; yalnız üretim maliyeti hesaplandı.',
    );
  }

  return {
    status: 'OK',
    productGroupCode: input.productGroupCode,
    productGroupName: input.productGroupName,
    productCode: input.productCode,
    productName: input.productName,
    productUnit: input.productUnit,
    widthMm: input.widthMm,
    lengthMm: input.lengthMm,
    displayName: input.displayName,
    materialPriceType: input.materialPriceType,
    materialCosts,
    materialCostTotal: materialTotal.toFixed(),
    extraCosts: extraLines,
    extraCostTotal: extraTotal.toFixed(),
    productionCost: productionCost.toFixed(),
    missingSources,
    warnings,
    pricing,
  };
}
