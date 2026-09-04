import { BadRequestException } from '@nestjs/common';
import { roundUpToWholeTl, toDecimal } from '../../common/decimal/decimal.util';
import { calculateDoorFrameSuggestedQty } from '../../modules/production-yields/production-yield-calculator';

export type DoorFramePartCostInput = {
  thicknessMm: string;
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  sheetWidthMm: number;
  sheetLengthMm: number;
  /** Aktif CARD_INSTALLMENT alış fiyatı (Decimal string). */
  sheetPrice: string;
  netQty: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
};

export type DoorFrameSizeCostInput = {
  widthCm: number;
  lengthCm: number;
  displayName: string;
  parts: DoorFramePartCostInput[];
};

export type DoorFramePartCostResult = {
  thicknessMm: string;
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  calculatedQty: number | null;
  calculatedQtyError: string | null;
  netQty: number;
  sheetPrice: string;
  unitCost: string;
};

export type DoorFrameMdfSizeResult = {
  widthCm: number;
  lengthCm: number;
  displayName: string;
  parts: DoorFramePartCostResult[];
  mdfCost: string;
};

export type DoorFrameExtraCostsInput = {
  cutting: string;
  glue: string;
  labor: string;
  other: string;
};

export type DoorFrameExtraCostsBreakdown = {
  cutting: string;
  glue: string;
  labor: string;
  other: string;
  total: string;
};

export type DoorFrameSizeCostResult = DoorFrameMdfSizeResult & {
  extraCosts: DoorFrameExtraCostsBreakdown;
  productionCost: string;
};

export type DoorFrameVatPricing = {
  vatRate: string;
  vatAmount: string;
  costWithVat: string;
};

export type DoorFramePricing = DoorFrameVatPricing & {
  profitRate: string;
  profitAmount: string;
  priceBeforeRounding: string;
  /** Excel ROUNDUP(priceBeforeRounding, 0) */
  roundedSalePrice: string;
  /** Nakit satış = roundedSalePrice */
  cashSalePrice: string;
  cardMarkupRate: string;
  cardPriceBeforeRounding: string;
  /** ROUNDUP(cashSalePrice * (1 + cardMarkupRate/100), 0) */
  cardSalePrice: string;
};

export type DoorFrameSizeCostWithVatResult = DoorFrameSizeCostResult & {
  pricing: DoorFrameVatPricing;
};

export type DoorFrameSizeCostPricedResult = DoorFrameSizeCostResult & {
  pricing: DoorFramePricing;
};

/**
 * Kapı kasası — MDF + ek maliyet + KDV + kâr + yuvarlanmış nakit + kart satış.
 * unitCost = sheetPrice / netQty (Decimal; ara yuvarlama yok).
 * mdfCost = parça maliyetleri toplamı.
 * productionCost = mdfCost + extraCosts.total
 * vatAmount = productionCost * vatRate / 100
 * costWithVat = productionCost + vatAmount
 * profitAmount = costWithVat * profitRate / 100
 * priceBeforeRounding = costWithVat + profitAmount
 * roundedSalePrice = ROUNDUP(priceBeforeRounding, 0)
 * cashSalePrice = roundedSalePrice
 * cardPriceBeforeRounding = cashSalePrice * (1 + cardMarkupRate/100)
 * cardSalePrice = ROUNDUP(cardPriceBeforeRounding, 0)
 */
export class DoorFrameCalculator {
  calculateMdfCosts(sizes: DoorFrameSizeCostInput[]): DoorFrameMdfSizeResult[] {
    return sizes.map((size) => this.calculateSize(size));
  }

  calculateProductionCosts(
    sizes: DoorFrameSizeCostInput[],
    extraCosts: DoorFrameExtraCostsInput,
  ): DoorFrameSizeCostResult[] {
    return this.applyExtraCosts(this.calculateMdfCosts(sizes), extraCosts);
  }

  calculateCostsWithVat(
    sizes: DoorFrameSizeCostInput[],
    extraCosts: DoorFrameExtraCostsInput,
    vatRate: string,
  ): DoorFrameSizeCostWithVatResult[] {
    return this.applyVat(this.calculateProductionCosts(sizes, extraCosts), vatRate);
  }

  calculateCostsWithProfit(
    sizes: DoorFrameSizeCostInput[],
    extraCosts: DoorFrameExtraCostsInput,
    vatRate: string,
    profitRate: string,
    cardMarkupRate: string,
  ): DoorFrameSizeCostPricedResult[] {
    return this.applySaleChannels(
      this.applyProfit(this.calculateCostsWithVat(sizes, extraCosts, vatRate), profitRate),
      cardMarkupRate,
    );
  }

  applyExtraCosts(
    rows: DoorFrameMdfSizeResult[],
    extraCosts: DoorFrameExtraCostsInput,
  ): DoorFrameSizeCostResult[] {
    const breakdown = this.sumExtraCosts(extraCosts);
    const extraTotal = toDecimal(breakdown.total);

    return rows.map((row) => ({
      ...row,
      extraCosts: breakdown,
      productionCost: toDecimal(row.mdfCost).plus(extraTotal).toFixed(),
    }));
  }

  applyVat(
    rows: DoorFrameSizeCostResult[],
    vatRateRaw: string,
  ): DoorFrameSizeCostWithVatResult[] {
    const vatRate = this.parseVatRate(vatRateRaw);
    const hundred = toDecimal(100);

    return rows.map((row) => {
      const productionCost = toDecimal(row.productionCost);
      const vatAmount = productionCost.times(vatRate).div(hundred);
      return {
        ...row,
        pricing: {
          vatRate: vatRate.toFixed(),
          vatAmount: vatAmount.toFixed(),
          costWithVat: productionCost.plus(vatAmount).toFixed(),
        },
      };
    });
  }

  /**
   * Kâr + ROUNDUP nakit fiyatı (kart kanalı henüz yok).
   * Nakit/kart için applySaleChannels kullanın.
   */
  applyProfit(
    rows: DoorFrameSizeCostWithVatResult[],
    profitRateRaw: string,
  ): Array<
    DoorFrameSizeCostResult & {
      pricing: DoorFrameVatPricing & {
        profitRate: string;
        profitAmount: string;
        priceBeforeRounding: string;
        roundedSalePrice: string;
      };
    }
  > {
    const profitRate = this.parseProfitRate(profitRateRaw);
    const hundred = toDecimal(100);

    return rows.map((row) => {
      const costWithVat = toDecimal(row.pricing.costWithVat);
      const profitAmount = costWithVat.times(profitRate).div(hundred);
      const priceBeforeRounding = costWithVat.plus(profitAmount);
      const roundedSalePrice = roundUpToWholeTl(priceBeforeRounding);
      return {
        ...row,
        pricing: {
          ...row.pricing,
          profitRate: profitRate.toFixed(),
          profitAmount: profitAmount.toFixed(),
          priceBeforeRounding: priceBeforeRounding.toFixed(),
          roundedSalePrice: roundedSalePrice.toFixed(),
        },
      };
    });
  }

  applySaleChannels(
    rows: Array<
      DoorFrameSizeCostResult & {
        pricing: DoorFrameVatPricing & {
          profitRate: string;
          profitAmount: string;
          priceBeforeRounding: string;
          roundedSalePrice: string;
        };
      }
    >,
    cardMarkupRateRaw: string,
  ): DoorFrameSizeCostPricedResult[] {
    const cardMarkupRate = this.parseCardMarkupRate(cardMarkupRateRaw);
    const hundred = toDecimal(100);
    const one = toDecimal(1);

    return rows.map((row) => {
      const cashSalePrice = toDecimal(row.pricing.roundedSalePrice);
      const cardPriceBeforeRounding = cashSalePrice.times(
        one.plus(cardMarkupRate.div(hundred)),
      );
      return {
        ...row,
        pricing: {
          ...row.pricing,
          cashSalePrice: cashSalePrice.toFixed(),
          cardMarkupRate: cardMarkupRate.toFixed(),
          cardPriceBeforeRounding: cardPriceBeforeRounding.toFixed(),
          cardSalePrice: roundUpToWholeTl(cardPriceBeforeRounding).toFixed(),
        },
      };
    });
  }

  /** CalculationEngine ince yönlendirici için genel giriş. */
  calculate(input: {
    mode: 'mdf_cost' | 'production_cost' | 'cost_with_vat' | 'cost_with_profit';
    sizes: DoorFrameSizeCostInput[];
    extraCosts?: DoorFrameExtraCostsInput;
    vatRate?: string;
    profitRate?: string;
    cardMarkupRate?: string;
  }):
    | DoorFrameMdfSizeResult[]
    | DoorFrameSizeCostResult[]
    | DoorFrameSizeCostWithVatResult[]
    | DoorFrameSizeCostPricedResult[] {
    if (input?.mode === 'cost_with_profit') {
      if (!input.extraCosts) {
        throw new Error('DoorFrameCalculator mode=cost_with_profit için extraCosts zorunludur.');
      }
      if (input.vatRate == null || input.vatRate === '') {
        throw new Error('DoorFrameCalculator mode=cost_with_profit için vatRate zorunludur.');
      }
      if (input.profitRate == null || input.profitRate === '') {
        throw new Error('DoorFrameCalculator mode=cost_with_profit için profitRate zorunludur.');
      }
      if (input.cardMarkupRate == null || input.cardMarkupRate === '') {
        throw new Error(
          'DoorFrameCalculator mode=cost_with_profit için cardMarkupRate zorunludur.',
        );
      }
      return this.calculateCostsWithProfit(
        input.sizes,
        input.extraCosts,
        input.vatRate,
        input.profitRate,
        input.cardMarkupRate,
      );
    }
    if (input?.mode === 'cost_with_vat') {
      if (!input.extraCosts) {
        throw new Error('DoorFrameCalculator mode=cost_with_vat için extraCosts zorunludur.');
      }
      if (input.vatRate == null || input.vatRate === '') {
        throw new Error('DoorFrameCalculator mode=cost_with_vat için vatRate zorunludur.');
      }
      return this.calculateCostsWithVat(input.sizes, input.extraCosts, input.vatRate);
    }
    if (input?.mode === 'production_cost') {
      if (!input.extraCosts) {
        throw new Error('DoorFrameCalculator mode=production_cost için extraCosts zorunludur.');
      }
      return this.calculateProductionCosts(input.sizes, input.extraCosts);
    }
    if (input?.mode !== 'mdf_cost') {
      throw new Error(
        'DoorFrameCalculator bu aşamada yalnızca mode=mdf_cost, production_cost, cost_with_vat veya cost_with_profit destekler.',
      );
    }
    return this.calculateMdfCosts(input.sizes);
  }

  private sumExtraCosts(extraCosts: DoorFrameExtraCostsInput): DoorFrameExtraCostsBreakdown {
    const cutting = this.parseNonNegativeAmount(extraCosts.cutting, 'CUTTING');
    const glue = this.parseNonNegativeAmount(extraCosts.glue, 'GLUE');
    const labor = this.parseNonNegativeAmount(extraCosts.labor, 'LABOR');
    const other = this.parseNonNegativeAmount(extraCosts.other, 'OTHER');
    const total = cutting.plus(glue).plus(labor).plus(other);

    return {
      cutting: cutting.toFixed(),
      glue: glue.toFixed(),
      labor: labor.toFixed(),
      other: other.toFixed(),
      total: total.toFixed(),
    };
  }

  private parseNonNegativeAmount(value: string, code: string) {
    if (value == null || value === '') {
      throw new BadRequestException(`Kapı Kasası ek maliyeti eksik: ${code}`);
    }
    let amount;
    try {
      amount = toDecimal(value);
    } catch {
      throw new BadRequestException(`Kapı Kasası ek maliyeti geçersiz: ${code}`);
    }
    if (amount.isNegative()) {
      throw new BadRequestException(`Kapı Kasası ek maliyeti negatif olamaz: ${code}`);
    }
    return amount;
  }

  private parseVatRate(value: string) {
    if (value == null || value === '') {
      throw new BadRequestException('KDV oranı (vatRate) eksik.');
    }
    let rate;
    try {
      rate = toDecimal(value);
    } catch {
      throw new BadRequestException(`KDV oranı (vatRate) geçersiz: ${value}`);
    }
    if (rate.isNegative()) {
      throw new BadRequestException('KDV oranı (vatRate) negatif olamaz.');
    }
    return rate;
  }

  private parseProfitRate(value: string) {
    if (value == null || value === '') {
      throw new BadRequestException('Kâr oranı (profitRate) eksik.');
    }
    let rate;
    try {
      rate = toDecimal(value);
    } catch {
      throw new BadRequestException(`Kâr oranı (profitRate) geçersiz: ${value}`);
    }
    if (rate.isNegative()) {
      throw new BadRequestException('Kâr oranı (profitRate) negatif olamaz.');
    }
    return rate;
  }

  private parseCardMarkupRate(value: string) {
    if (value == null || value === '') {
      throw new BadRequestException('Kredi kartı farkı (cardMarkupRate) eksik.');
    }
    let rate;
    try {
      rate = toDecimal(value);
    } catch {
      throw new BadRequestException(`Kredi kartı farkı (cardMarkupRate) geçersiz: ${value}`);
    }
    if (rate.isNegative()) {
      throw new BadRequestException('Kredi kartı farkı (cardMarkupRate) negatif olamaz.');
    }
    return rate;
  }

  private calculateSize(size: DoorFrameSizeCostInput): DoorFrameMdfSizeResult {
    if (!Array.isArray(size.parts) || size.parts.length !== 2) {
      throw new BadRequestException(
        `Kapı kasası ölçüsü ${size.displayName}: tam 2 MDF parçası beklenir.`,
      );
    }

    const parts = size.parts.map((part) => this.calculatePart(part, size.displayName));
    const mdfCost = parts
      .reduce((sum, part) => sum.plus(toDecimal(part.unitCost)), toDecimal(0))
      .toFixed();

    return {
      widthCm: size.widthCm,
      lengthCm: size.lengthCm,
      displayName: size.displayName,
      parts,
      mdfCost,
    };
  }

  private calculatePart(
    part: DoorFramePartCostInput,
    sizeLabel: string,
  ): DoorFramePartCostResult {
    if (!Number.isInteger(part.netQty) || part.netQty <= 0) {
      throw new BadRequestException(
        `${sizeLabel} / ${part.thicknessMm} mm: netQty > 0 olmalıdır (doğrulanmış NET adet).`,
      );
    }

    const sheetPrice = toDecimal(part.sheetPrice);
    if (sheetPrice.isNegative()) {
      throw new BadRequestException(
        `${sizeLabel} / ${part.rawMaterialCode}: tabaka fiyatı negatif olamaz.`,
      );
    }

    const unitCost = sheetPrice.div(part.netQty).toFixed();

    let calculatedQty: number | null = null;
    let calculatedQtyError: string | null = null;
    try {
      calculatedQty = calculateDoorFrameSuggestedQty({
        thicknessMm: part.thicknessMm,
        sheetWidthMm: part.sheetWidthMm,
        sheetLengthMm: part.sheetLengthMm,
        pieceWidthMm: part.pieceWidthMm,
        pieceLengthMm: part.pieceLengthMm,
      }).calculatedQty;
    } catch (err) {
      calculatedQtyError = err instanceof Error ? err.message : 'Hesaplanan adet üretilemedi.';
    }

    return {
      thicknessMm: part.thicknessMm,
      rawMaterialId: part.rawMaterialId,
      rawMaterialCode: part.rawMaterialCode,
      rawMaterialName: part.rawMaterialName,
      calculatedQty,
      calculatedQtyError,
      netQty: part.netQty,
      sheetPrice: sheetPrice.toFixed(),
      unitCost,
    };
  }
}
