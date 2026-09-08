import { BadRequestException } from '@nestjs/common';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';
import type { PervazQtySource } from '../../modules/pervaz/pervaz-qty-resolver';
import {
  applyPervazFixedCardSale,
  type PervazCardSaleBreakdown,
} from './pervaz-card-sale';

export type AyarliPervazMdfPriceType = 'CARD_INSTALLMENT';

export type AyarliPervazMdfPartInput = {
  rawMaterialCode: string;
  sheetPriceType: AyarliPervazMdfPriceType;
  sheetPrice: string;
  netQty: number;
  yieldSource: PervazQtySource;
};

export type AyarliPervazExtraCostsInput = {
  cutting: string;
  glue: string;
  labor: string;
};

export type AyarliPervazExtraCostsBreakdown = {
  cutting: string;
  glue: string;
  labor: string;
  total: string;
};

export type AyarliPervazMdfInput = {
  productCode: string;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  mainPiece: AyarliPervazMdfPartInput;
  kilcik: AyarliPervazMdfPartInput;
  extraCosts: AyarliPervazExtraCostsInput;
  profitRate: string;
  /** Resolver’dan gelir; yoksa ROUNDUP sonrası ekleme yok. */
  adjustmentAmount?: string | null;
  /** Product-level sabit TL; yüzde kart farkı kullanılmaz. */
  cardFixedSurchargeAmount?: string | null;
  /** Yalnız TRUE iken kart yayınlanır. */
  cardSaleEnabled?: boolean | null;
};

export type AyarliPervazMdfPartResult = {
  rawMaterialCode: string;
  sheetPriceType: AyarliPervazMdfPriceType;
  sheetPrice: string;
  netQty: number;
  yieldSource: PervazQtySource;
  unitCost: string;
};

export type AyarliPervazPricingBreakdown = {
  profitRate: string;
  profitAmount: string;
  priceBeforeRounding: string;
  /** Excel ROUNDUP(priceBeforeRounding, 0) */
  roundedSalePrice: string;
  /** Aktif exception adjustment; yoksa null (DB’de sahte 0 yok). */
  adjustmentAmount: string | null;
  /** roundedSalePrice + adjustmentAmount (adjustment yoksa rounded). */
  publishedSalePrice: string;
} & PervazCardSaleBreakdown;

export type AyarliPervazMdfResult = {
  productCode: string;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  mainPiece: AyarliPervazMdfPartResult;
  kilcik: AyarliPervazMdfPartResult;
  totalMdfCost: string;
  extraCosts: AyarliPervazExtraCostsBreakdown;
  productionCost: string;
  pricing: AyarliPervazPricingBreakdown;
};

/**
 * Ayarlı Pervaz — MDF + PERVAZ ek maliyet + kâr (Excel: K sonrası kâr, KDV yok).
 * productionCost = totalMdfCost + extraCosts.total
 * profitAmount = productionCost * profitRate / 100
 * priceBeforeRounding = productionCost + profitAmount
 * profitRate / adjustmentAmount input’tan gelir; satır if/thickness hardcode yok.
 * roundedSalePrice = ROUNDUP(priceBeforeRounding, 0) — roundUpToWholeTl.
 * publishedSalePrice = roundedSalePrice + adjustmentAmount (ROUNDUP sonrası).
 * Kart: cardSaleEnabled === true ise publishedSalePrice + cardFixedSurchargeAmount; ROUNDUP yok.
 */
export class AyarliPervazMdfCalculator {
  calculate(input: AyarliPervazMdfInput): AyarliPervazMdfResult {
    const mainPiece = this.calculatePart(input.mainPiece, 'ana pervaz');
    const kilcik = this.calculatePart(input.kilcik, 'kılçık');
    const totalMdfCost = toDecimal(mainPiece.unitCost).plus(toDecimal(kilcik.unitCost));
    const extraCosts = this.sumExtraCosts(input.extraCosts);
    const productionCost = totalMdfCost.plus(toDecimal(extraCosts.total));
    const pricing = this.applyProfit(
      productionCost,
      input.profitRate,
      input.adjustmentAmount,
      input.cardFixedSurchargeAmount,
      input.cardSaleEnabled === true,
    );

    return {
      productCode: input.productCode,
      thicknessMm: input.thicknessMm,
      widthMm: input.widthMm,
      lengthMm: input.lengthMm,
      mainPiece,
      kilcik,
      totalMdfCost: totalMdfCost.toFixed(),
      extraCosts,
      productionCost: productionCost.toFixed(),
      pricing,
    };
  }

  private applyProfit(
    productionCost: ReturnType<typeof toDecimal>,
    profitRateRaw: string,
    adjustmentAmountRaw: string | null | undefined,
    cardFixedSurchargeAmount: string | null | undefined,
    cardSaleAvailable: boolean,
  ): AyarliPervazPricingBreakdown {
    const profitRate = this.parseProfitRate(profitRateRaw);
    const hundred = toDecimal(100);
    const profitAmount = productionCost.times(profitRate).div(hundred);
    const priceBeforeRounding = productionCost.plus(profitAmount);
    const roundedSalePrice = roundUpToWholeTl(priceBeforeRounding);
    const adjustment = this.parseAdjustmentAmount(adjustmentAmountRaw);
    const publishedSalePrice = roundedSalePrice.plus(adjustment.amount);
    const card = applyPervazFixedCardSale({
      publishedCashPrice: publishedSalePrice.toFixed(),
      cardFixedSurchargeAmount,
      cardSaleAvailable,
    });
    return {
      profitRate: profitRate.toFixed(),
      profitAmount: profitAmount.toFixed(),
      priceBeforeRounding: priceBeforeRounding.toFixed(),
      roundedSalePrice: roundedSalePrice.toFixed(),
      adjustmentAmount: adjustment.applied ? adjustment.amount.toFixed() : null,
      publishedSalePrice: publishedSalePrice.toFixed(),
      ...card,
    };
  }

  private parseAdjustmentAmount(value?: string | null): {
    amount: ReturnType<typeof toDecimal>;
    applied: boolean;
  } {
    if (value == null || value === '') {
      return { amount: toDecimal(0), applied: false };
    }
    let amount;
    try {
      amount = toDecimal(value);
    } catch {
      throw new BadRequestException(`Pervaz adjustmentAmount geçersiz: ${value}`);
    }
    return { amount, applied: true };
  }

  private parseProfitRate(value: string) {
    if (value == null || value === '') {
      throw new BadRequestException('Pervaz kâr oranı (profitRate) eksik.');
    }
    let rate;
    try {
      rate = toDecimal(value);
    } catch {
      throw new BadRequestException(`Pervaz kâr oranı (profitRate) geçersiz: ${value}`);
    }
    if (rate.isNegative()) {
      throw new BadRequestException('Pervaz kâr oranı (profitRate) negatif olamaz.');
    }
    return rate;
  }

  private sumExtraCosts(
    extraCosts: AyarliPervazExtraCostsInput,
  ): AyarliPervazExtraCostsBreakdown {
    const cutting = this.parseNonNegativeAmount(extraCosts.cutting, 'CUTTING');
    const glue = this.parseNonNegativeAmount(extraCosts.glue, 'GLUE');
    const labor = this.parseNonNegativeAmount(extraCosts.labor, 'LABOR');
    const total = cutting.plus(glue).plus(labor);

    return {
      cutting: cutting.toFixed(),
      glue: glue.toFixed(),
      labor: labor.toFixed(),
      total: total.toFixed(),
    };
  }

  private parseNonNegativeAmount(value: string, code: string) {
    if (value == null || value === '') {
      throw new BadRequestException(`Pervaz ek maliyeti eksik: ${code}`);
    }
    let amount;
    try {
      amount = toDecimal(value);
    } catch {
      throw new BadRequestException(`Pervaz ek maliyeti geçersiz: ${code}`);
    }
    if (amount.isNegative()) {
      throw new BadRequestException(`Pervaz ek maliyeti negatif olamaz: ${code}`);
    }
    return amount;
  }

  private calculatePart(
    part: AyarliPervazMdfPartInput,
    label: string,
  ): AyarliPervazMdfPartResult {
    if (part.sheetPriceType !== 'CARD_INSTALLMENT') {
      throw new BadRequestException(
        `Ayarlı Pervaz ${label} MDF maliyeti yalnız CARD_INSTALLMENT alış fiyatı kullanır.`,
      );
    }
    if (!Number.isInteger(part.netQty) || part.netQty <= 0) {
      throw new BadRequestException(`Ayarlı Pervaz ${label} netQty pozitif tam sayı olmalıdır.`);
    }

    let sheetPrice;
    try {
      sheetPrice = toDecimal(part.sheetPrice);
    } catch {
      throw new BadRequestException(`Ayarlı Pervaz ${label} tabaka fiyatı geçersiz.`);
    }
    if (sheetPrice.isNegative()) {
      throw new BadRequestException(`Ayarlı Pervaz ${label} tabaka fiyatı negatif olamaz.`);
    }

    return {
      rawMaterialCode: part.rawMaterialCode,
      sheetPriceType: part.sheetPriceType,
      sheetPrice: sheetPrice.toFixed(),
      netQty: part.netQty,
      yieldSource: part.yieldSource,
      unitCost: sheetPrice.div(part.netQty).toFixed(),
    };
  }
}
