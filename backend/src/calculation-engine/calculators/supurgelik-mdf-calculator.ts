import { BadRequestException } from '@nestjs/common';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';

export const SUPURGELIK_PRODUCT_CODES = [
  'DUZ_SUPURGELIK',
  'DEKORATIF_SUPURGELIK',
  'DUZ_PP_SARMA_SUPURGELIK',
  'DEKORATIF_PP_SARMA_SUPURGELIK',
] as const;

export type SupurgelikProductCode = (typeof SUPURGELIK_PRODUCT_CODES)[number];

export type SupurgelikExtraCostInput = {
  code: string;
  name: string;
  amount: string;
};

export type SupurgelikDuzPricingInput = {
  profitRate: string;
  source: 'GROUP_PRICING_SETTING';
};

export type SupurgelikDecorativePricingInput = SupurgelikDuzPricingInput & {
  decorativeRate: string | null;
  decorativeRateSource: 'GROUP_THICKNESS_PRICING_MODIFIER' | null;
};

export type SupurgelikDuzPricingResult = SupurgelikDuzPricingInput & {
  profitAmount: string;
  priceBeforeRounding: string;
  roundedBaseSalePrice: string;
  publishedCashPrice: string;
};

export type SupurgelikDecorativePricingResult = SupurgelikDecorativePricingInput & {
  profitAmount: string;
  priceBeforeRounding: string;
  roundedBaseSalePrice: string;
  basePublishedCashPrice: string;
  decorativeAmount: string | null;
  priceBeforeDecorativeRounding: string | null;
  publishedCashPrice: string | null;
  statusCode: 'DECORATIVE_RATE_MISSING' | null;
};

export const SUPURGELIK_PP_WRAPPING_COST_MISSING =
  'PP_WRAPPING_COST_MISSING' as const;

export type SupurgelikPpLayerFields = {
  baseProductionCost: string;
  ppWrappingCost: string | null;
  ppProductionCost: string | null;
};

export type SupurgelikDuzPpPricingResult = SupurgelikDuzPricingInput &
  SupurgelikPpLayerFields & {
    profitAmount: string | null;
    priceBeforeRounding: string | null;
    roundedBaseSalePrice: string | null;
    publishedCashPrice: string | null;
    statusCode: typeof SUPURGELIK_PP_WRAPPING_COST_MISSING | null;
  };

export type SupurgelikDecorativePpPricingResult = SupurgelikDecorativePricingInput &
  SupurgelikPpLayerFields & {
    profitAmount: string | null;
    priceBeforeRounding: string | null;
    roundedBaseSalePrice: string | null;
    basePublishedCashPrice: string | null;
    decorativeAmount: string | null;
    priceBeforeDecorativeRounding: string | null;
    publishedCashPrice: string | null;
    statusCode:
      | typeof SUPURGELIK_PP_WRAPPING_COST_MISSING
      | 'DECORATIVE_RATE_MISSING'
      | null;
  };

export type SupurgelikPpPricingResult =
  | SupurgelikDuzPpPricingResult
  | SupurgelikDecorativePpPricingResult;

export function isSupurgelikPpProduct(
  productCode: SupurgelikProductCode,
): boolean {
  return (
    productCode === 'DUZ_PP_SARMA_SUPURGELIK' ||
    productCode === 'DEKORATIF_PP_SARMA_SUPURGELIK'
  );
}

export function isSupurgelikDecorativeProduct(
  productCode: SupurgelikProductCode,
): boolean {
  return (
    productCode === 'DEKORATIF_SUPURGELIK' ||
    productCode === 'DEKORATIF_PP_SARMA_SUPURGELIK'
  );
}

export type SupurgelikMdfInput = {
  productCode: SupurgelikProductCode;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  rawMaterial: {
    code: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
  };
  sheetPrice: {
    priceType: 'CARD_INSTALLMENT';
    amount: string;
  };
  productionYield: {
    netQty: number;
    scope: 'GENERIC';
  };
  /** Request anındaki aktif SUPURGELIK ProductGroup değerleri. */
  extraCosts: SupurgelikExtraCostInput[];
  /**
   * SUPURGELIK group-scope PP_WRAPPING ExtraCostValue.
   * Yalnız PP ürünlerinde kullanılır; yoksa null.
   */
  ppWrappingCost?: string | null;
  /** Düz/dekoratif/PP için request anındaki aktif DB pricing kaynakları. */
  pricing?: SupurgelikDuzPricingInput | SupurgelikDecorativePricingInput;
};

export type SupurgelikMdfResult = {
  productCode: SupurgelikProductCode;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  rawMaterial: SupurgelikMdfInput['rawMaterial'];
  sheetPrice: SupurgelikMdfInput['sheetPrice'];
  productionYield: {
    netQty: number;
    scope: 'GENERIC';
    productId: null;
    productScoped: false;
  };
  mdfUnitCost: string;
  extraCosts: SupurgelikExtraCostInput[];
  extraCostsTotal: string;
  productionCost: string;
  pricing?:
    | SupurgelikDuzPricingResult
    | SupurgelikDecorativePricingResult
    | SupurgelikPpPricingResult;
};

/**
 * Süpürgelik temel MDF maliyeti.
 *
 * sheetPrice / netQty üzerine request anındaki ortak ProductGroup giderlerini ekler.
 * Düz ve dekoratif ürünlerde DB'den verilen normal kâr oranını uygular.
 * PP Sarma maliyeti ortak extraCosts toplamına katılmaz; yalnız PP ürünlerinde
 * baseProductionCost üzerine eklenir. Dekoratif oran, PP eklenmiş baz nakit
 * fiyatının ardından uygulanır.
 */
export class SupurgelikMdfCalculator {
  calculate(input: SupurgelikMdfInput): SupurgelikMdfResult {
    if (input.sheetPrice.priceType !== 'CARD_INSTALLMENT') {
      throw new BadRequestException(
        'Süpürgelik MDF maliyeti yalnız CARD_INSTALLMENT alış fiyatı kullanır.',
      );
    }
    if (!Number.isInteger(input.productionYield.netQty) || input.productionYield.netQty <= 0) {
      throw new BadRequestException('Süpürgelik netQty pozitif tam sayı olmalıdır.');
    }

    let sheetPrice;
    try {
      sheetPrice = toDecimal(input.sheetPrice.amount);
    } catch {
      throw new BadRequestException('Süpürgelik MDF tabaka fiyatı geçersiz.');
    }
    if (sheetPrice.isNegative()) {
      throw new BadRequestException('Süpürgelik MDF tabaka fiyatı negatif olamaz.');
    }

    let materialThickness;
    try {
      materialThickness = toDecimal(input.rawMaterial.thicknessMm);
    } catch {
      throw new BadRequestException('Süpürgelik RawMaterial kalınlığı geçersiz.');
    }
    if (!materialThickness.equals(String(input.thicknessMm))) {
      throw new BadRequestException(
        `Süpürgelik RawMaterial kalınlığı ${input.rawMaterial.thicknessMm} mm; beklenen ${input.thicknessMm} mm.`,
      );
    }

    const seenExtraCostCodes = new Set<string>();
    let extraCostsTotal = toDecimal(0);
    const extraCosts = input.extraCosts.map((extraCost) => {
      const code = extraCost.code.trim();
      if (!code || seenExtraCostCodes.has(code)) {
        throw new BadRequestException(
          `Süpürgelik ortak ek maliyet kodu boş veya duplicate: ${extraCost.code}`,
        );
      }
      seenExtraCostCodes.add(code);
      if (code === 'PP_WRAPPING') {
        throw new BadRequestException(
          'PP Sarma maliyeti ortak ek maliyet toplamına katılamaz.',
        );
      }

      let amount;
      try {
        amount = toDecimal(extraCost.amount);
      } catch {
        throw new BadRequestException(
          `Süpürgelik ortak ek maliyet tutarı geçersiz: ${code}`,
        );
      }
      if (amount.isNegative()) {
        throw new BadRequestException(
          `Süpürgelik ortak ek maliyet tutarı negatif olamaz: ${code}`,
        );
      }
      extraCostsTotal = extraCostsTotal.plus(amount);
      return {
        code,
        name: extraCost.name,
        amount: amount.toFixed(),
      };
    });

    const mdfUnitCost = sheetPrice.div(String(input.productionYield.netQty));

    const productionCost = mdfUnitCost.plus(extraCostsTotal);
    const baseResult: SupurgelikMdfResult = {
      productCode: input.productCode,
      thicknessMm: input.thicknessMm,
      widthMm: input.widthMm,
      lengthMm: input.lengthMm,
      rawMaterial: input.rawMaterial,
      sheetPrice: {
        priceType: input.sheetPrice.priceType,
        amount: sheetPrice.toFixed(),
      },
      productionYield: {
        netQty: input.productionYield.netQty,
        scope: 'GENERIC',
        productId: null,
        productScoped: false,
      },
      mdfUnitCost: mdfUnitCost.toFixed(),
      extraCosts,
      extraCostsTotal: extraCostsTotal.toFixed(),
      productionCost: productionCost.toFixed(),
    };

    if (!isSupurgelikPpProduct(input.productCode) && input.ppWrappingCost != null) {
      throw new BadRequestException(
        'PP Sarma maliyeti yalnız PP Süpürgelik ürünlerine uygulanabilir.',
      );
    }

    if (input.pricing == null) {
      throw new BadRequestException('Süpürgelik kâr oranı (profitRate) eksik.');
    }

    let profitRate;
    try {
      profitRate = toDecimal(input.pricing.profitRate);
    } catch {
      throw new BadRequestException('Süpürgelik kâr oranı (profitRate) geçersiz.');
    }
    if (profitRate.isNegative()) {
      throw new BadRequestException('Süpürgelik kâr oranı negatif olamaz.');
    }

    if (isSupurgelikPpProduct(input.productCode)) {
      return this.calculatePpPricing(
        baseResult,
        productionCost,
        profitRate,
        input,
      );
    }

    const profitAmount = productionCost.times(profitRate).div(toDecimal(100));
    const priceBeforeRounding = productionCost.plus(profitAmount);
    const roundedBaseSalePrice = roundUpToWholeTl(priceBeforeRounding);

    const normalPricing = {
      profitRate: profitRate.toFixed(),
      source: input.pricing.source,
      profitAmount: profitAmount.toFixed(),
      priceBeforeRounding: priceBeforeRounding.toFixed(),
      roundedBaseSalePrice: roundedBaseSalePrice.toFixed(),
    } as const;

    if (input.productCode === 'DUZ_SUPURGELIK') {
      if ('decorativeRate' in input.pricing) {
        throw new BadRequestException(
          'Dekoratif Süpürgelik oranı DUZ_SUPURGELIK ürününe uygulanamaz.',
        );
      }
      return {
        ...baseResult,
        pricing: {
          ...normalPricing,
          publishedCashPrice: roundedBaseSalePrice.toFixed(),
        },
      };
    }

    return this.applyDecorativePricing(
      baseResult,
      normalPricing,
      roundedBaseSalePrice,
      input.pricing,
    );
  }

  private calculatePpPricing(
    baseResult: SupurgelikMdfResult,
    baseProductionCost: ReturnType<typeof toDecimal>,
    profitRate: ReturnType<typeof toDecimal>,
    input: SupurgelikMdfInput,
  ): SupurgelikMdfResult {
    if (input.pricing == null) {
      throw new BadRequestException('Süpürgelik kâr oranı (profitRate) eksik.');
    }

    let wrappingCost: ReturnType<typeof toDecimal> | null = null;
    if (input.ppWrappingCost != null) {
      try {
        wrappingCost = toDecimal(input.ppWrappingCost);
      } catch {
        throw new BadRequestException('PP Sarma maliyeti geçersiz.');
      }
      if (!wrappingCost.isFinite() || wrappingCost.lte(0)) {
        throw new BadRequestException('PP Sarma maliyeti 0’dan büyük olmalıdır.');
      }
    }

    if (wrappingCost == null) {
      const missingLayer = {
        profitRate: profitRate.toFixed(),
        source: input.pricing.source,
        baseProductionCost: baseProductionCost.toFixed(),
        ppWrappingCost: null,
        ppProductionCost: null,
        profitAmount: null,
        priceBeforeRounding: null,
        roundedBaseSalePrice: null,
        publishedCashPrice: null,
        statusCode: SUPURGELIK_PP_WRAPPING_COST_MISSING,
      } as const;
      if (input.productCode === 'DEKORATIF_PP_SARMA_SUPURGELIK') {
        return {
          ...baseResult,
          pricing: missingLayer,
        };
      }
      if ('decorativeRate' in input.pricing) {
        throw new BadRequestException(
          'Dekoratif Süpürgelik oranı DUZ_PP_SARMA_SUPURGELIK ürününe uygulanamaz.',
        );
      }
      return {
        ...baseResult,
        pricing: missingLayer,
      };
    }

    const ppProductionCost = baseProductionCost.plus(wrappingCost);
    const profitAmount = ppProductionCost.times(profitRate).div(toDecimal(100));
    const priceBeforeRounding = ppProductionCost.plus(profitAmount);
    const roundedBaseSalePrice = roundUpToWholeTl(priceBeforeRounding);
    const ppLayer = {
      profitRate: profitRate.toFixed(),
      source: input.pricing.source,
      baseProductionCost: baseProductionCost.toFixed(),
      ppWrappingCost: wrappingCost.toFixed(),
      ppProductionCost: ppProductionCost.toFixed(),
      profitAmount: profitAmount.toFixed(),
      priceBeforeRounding: priceBeforeRounding.toFixed(),
      roundedBaseSalePrice: roundedBaseSalePrice.toFixed(),
    } as const;

    if (input.productCode === 'DUZ_PP_SARMA_SUPURGELIK') {
      if ('decorativeRate' in input.pricing) {
        throw new BadRequestException(
          'Dekoratif Süpürgelik oranı DUZ_PP_SARMA_SUPURGELIK ürününe uygulanamaz.',
        );
      }
      return {
        ...baseResult,
        pricing: {
          ...ppLayer,
          publishedCashPrice: roundedBaseSalePrice.toFixed(),
          statusCode: null,
        },
      };
    }

    return this.applyDecorativePricing(
      baseResult,
      ppLayer,
      roundedBaseSalePrice,
      input.pricing,
    );
  }

  private applyDecorativePricing(
    baseResult: SupurgelikMdfResult,
    basePricing: {
      profitRate: string;
      source: 'GROUP_PRICING_SETTING';
      profitAmount: string;
      priceBeforeRounding: string;
      roundedBaseSalePrice: string;
      baseProductionCost?: string;
      ppWrappingCost?: string | null;
      ppProductionCost?: string | null;
    },
    roundedBaseSalePrice: ReturnType<typeof toDecimal>,
    pricing: SupurgelikDuzPricingInput | SupurgelikDecorativePricingInput,
  ): SupurgelikMdfResult {
    if (!('decorativeRate' in pricing)) {
      throw new BadRequestException('Dekoratif Süpürgelik pricing girdisi eksik.');
    }
    if (pricing.decorativeRate == null) {
      return {
        ...baseResult,
        pricing: {
          ...basePricing,
          basePublishedCashPrice: roundedBaseSalePrice.toFixed(),
          decorativeRate: null,
          decorativeRateSource: null,
          decorativeAmount: null,
          priceBeforeDecorativeRounding: null,
          publishedCashPrice: null,
          statusCode: 'DECORATIVE_RATE_MISSING',
        },
      };
    }

    let decorativeRate;
    try {
      decorativeRate = toDecimal(pricing.decorativeRate);
    } catch {
      throw new BadRequestException('Dekoratif Süpürgelik oranı geçersiz.');
    }
    if (decorativeRate.isNegative()) {
      throw new BadRequestException('Dekoratif Süpürgelik oranı negatif olamaz.');
    }
    if (pricing.decorativeRateSource == null) {
      throw new BadRequestException('Dekoratif Süpürgelik oran kaynağı eksik.');
    }

    const decorativeAmount = roundedBaseSalePrice
      .times(decorativeRate)
      .div(toDecimal(100));
    const priceBeforeDecorativeRounding = roundedBaseSalePrice.plus(decorativeAmount);
    const publishedCashPrice = roundUpToWholeTl(priceBeforeDecorativeRounding);

    return {
      ...baseResult,
      pricing: {
        ...basePricing,
        basePublishedCashPrice: roundedBaseSalePrice.toFixed(),
        decorativeRate: decorativeRate.toFixed(),
        decorativeRateSource: pricing.decorativeRateSource,
        decorativeAmount: decorativeAmount.toFixed(),
        priceBeforeDecorativeRounding: priceBeforeDecorativeRounding.toFixed(),
        publishedCashPrice: publishedCashPrice.toFixed(),
        statusCode: null,
      },
    };
  }
}
