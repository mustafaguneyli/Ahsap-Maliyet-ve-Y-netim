import { BadRequestException } from '@nestjs/common';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';
import {
  AyarliPervazMdfCalculator,
  type AyarliPervazExtraCostsBreakdown,
  type AyarliPervazExtraCostsInput,
  type AyarliPervazMdfPartInput,
  type AyarliPervazMdfPartResult,
} from './ayarli-pervaz-mdf-calculator';
import {
  applyPervazFixedCardSale,
  type PervazCardSaleBreakdown,
} from './pervaz-card-sale';

export type DekoratifPervazProductCode =
  | 'DEKORATIF_PERVAZ'
  | 'DEKORATIF_PERVAZ_GENIS_KILCIK';

export type DekoratifPervazInput = {
  productCode: DekoratifPervazProductCode;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  mainPiece: AyarliPervazMdfPartInput;
  kilcik: AyarliPervazMdfPartInput;
  extraCosts: AyarliPervazExtraCostsInput;
  profitRate: string;
  decorativePremiumRate: string;
  /** Product-level sabit TL. NULL ise kart yayınlanmaz (Geniş Kılçık). */
  cardFixedSurchargeAmount?: string | null;
};

export type DekoratifPervazResult = {
  productCode: DekoratifPervazProductCode;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  mainPiece: AyarliPervazMdfPartResult;
  kilcik: AyarliPervazMdfPartResult;
  totalMdfCost: string;
  extraCosts: AyarliPervazExtraCostsBreakdown;
  productionCost: string;
  pricing: {
    profitRate: string;
    profitAmount: string;
    baseSalePrice: string;
    decorativePremiumRate: string;
    decorativePremiumAmount: string;
    priceBeforeRounding: string;
    roundedSalePrice: string;
    adjustmentAmount: null;
    publishedSalePrice: string;
  } & PervazCardSaleBreakdown;
};

/**
 * Dekoratif Pervaz, ortak Pervaz MDF/masraf/kâr zincirini reuse eder.
 * Dekoratif fark baseSalePrice üzerine uygulanır ve yalnız finalde ROUNDUP yapılır.
 */
export class DekoratifPervazCalculator {
  constructor(
    private readonly baseCalculator = new AyarliPervazMdfCalculator(),
  ) {}

  calculate(input: DekoratifPervazInput): DekoratifPervazResult {
    const base = this.baseCalculator.calculate({
      ...input,
      adjustmentAmount: null,
    });
    const decorativePremiumRate = this.parseRate(
      input.decorativePremiumRate,
    );
    const baseSalePrice = toDecimal(base.pricing.priceBeforeRounding);
    const decorativePremiumAmount = baseSalePrice
      .times(decorativePremiumRate)
      .div(100);
    const priceBeforeRounding = baseSalePrice.plus(decorativePremiumAmount);
    const publishedSalePrice = roundUpToWholeTl(priceBeforeRounding);
    const cardFixedSurchargeAmount =
      input.cardFixedSurchargeAmount == null || input.cardFixedSurchargeAmount === ''
        ? null
        : input.cardFixedSurchargeAmount;
    const card = applyPervazFixedCardSale({
      publishedCashPrice: publishedSalePrice.toFixed(),
      cardFixedSurchargeAmount,
      cardSaleAvailable: cardFixedSurchargeAmount != null,
    });

    return {
      productCode: input.productCode,
      thicknessMm: base.thicknessMm,
      widthMm: base.widthMm,
      lengthMm: base.lengthMm,
      mainPiece: base.mainPiece,
      kilcik: base.kilcik,
      totalMdfCost: base.totalMdfCost,
      extraCosts: base.extraCosts,
      productionCost: base.productionCost,
      pricing: {
        profitRate: base.pricing.profitRate,
        profitAmount: base.pricing.profitAmount,
        baseSalePrice: baseSalePrice.toFixed(),
        decorativePremiumRate: decorativePremiumRate.toFixed(),
        decorativePremiumAmount: decorativePremiumAmount.toFixed(),
        priceBeforeRounding: priceBeforeRounding.toFixed(),
        roundedSalePrice: publishedSalePrice.toFixed(),
        adjustmentAmount: null,
        publishedSalePrice: publishedSalePrice.toFixed(),
        ...card,
      },
    };
  }

  private parseRate(value: string) {
    if (value == null || value === '') {
      throw new BadRequestException(
        'Dekoratif Pervaz fark oranı (decorativePremiumRate) eksik.',
      );
    }
    let rate;
    try {
      rate = toDecimal(value);
    } catch {
      throw new BadRequestException(
        `Dekoratif Pervaz fark oranı geçersiz: ${value}`,
      );
    }
    if (rate.isNegative()) {
      throw new BadRequestException(
        'Dekoratif Pervaz fark oranı negatif olamaz.',
      );
    }
    return rate;
  }
}
