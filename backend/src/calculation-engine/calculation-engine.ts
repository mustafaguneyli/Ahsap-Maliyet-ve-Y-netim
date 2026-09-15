import { DoorFrameCalculator } from './calculators/door-frame-calculator';
import type {
  DoorFrameExtraCostsInput,
  DoorFrameMdfSizeResult,
  DoorFrameSizeCostInput,
  DoorFrameSizeCostPricedResult,
  DoorFrameSizeCostResult,
  DoorFrameSizeCostWithVatResult,
} from './calculators/door-frame-calculator';
import {
  AyarliPervazMdfCalculator,
  type AyarliPervazMdfInput,
  type AyarliPervazMdfResult,
} from './calculators/ayarli-pervaz-mdf-calculator';
import {
  DekoratifPervazCalculator,
  type DekoratifPervazInput,
  type DekoratifPervazResult,
} from './calculators/dekoratif-pervaz-calculator';
import {
  SupurgelikMdfCalculator,
  type SupurgelikMdfInput,
  type SupurgelikMdfResult,
} from './calculators/supurgelik-mdf-calculator';

/**
 * İnce yönlendirici. Mega-engine / abstract factory yoktur.
 * Ürün aileleri kendi küçük calculator'larına yönlendirilir.
 */
export class CalculationEngine {
  constructor(
    private readonly doorFrameCalculator = new DoorFrameCalculator(),
    private readonly ayarliPervazMdfCalculator = new AyarliPervazMdfCalculator(),
    private readonly dekoratifPervazCalculator = new DekoratifPervazCalculator(),
    private readonly supurgelikMdfCalculator = new SupurgelikMdfCalculator(),
  ) {}

  calculateDoorFrameMdfCosts(sizes: DoorFrameSizeCostInput[]): DoorFrameMdfSizeResult[] {
    return this.doorFrameCalculator.calculateMdfCosts(sizes);
  }

  calculateDoorFrameProductionCosts(
    sizes: DoorFrameSizeCostInput[],
    extraCosts: DoorFrameExtraCostsInput,
  ): DoorFrameSizeCostResult[] {
    return this.doorFrameCalculator.calculateProductionCosts(sizes, extraCosts);
  }

  calculateDoorFrameCostsWithVat(
    sizes: DoorFrameSizeCostInput[],
    extraCosts: DoorFrameExtraCostsInput,
    vatRate: string,
  ): DoorFrameSizeCostWithVatResult[] {
    return this.doorFrameCalculator.calculateCostsWithVat(sizes, extraCosts, vatRate);
  }

  calculateDoorFrameCostsWithProfit(
    sizes: DoorFrameSizeCostInput[],
    extraCosts: DoorFrameExtraCostsInput,
    vatRate: string,
    profitRate: string,
    cardMarkupRate: string,
  ): DoorFrameSizeCostPricedResult[] {
    return this.doorFrameCalculator.calculateCostsWithProfit(
      sizes,
      extraCosts,
      vatRate,
      profitRate,
      cardMarkupRate,
    );
  }

  calculateAyarliPervazMdf(input: AyarliPervazMdfInput): AyarliPervazMdfResult {
    return this.ayarliPervazMdfCalculator.calculate(input);
  }

  calculateDekoratifPervaz(
    input: DekoratifPervazInput,
  ): DekoratifPervazResult {
    return this.dekoratifPervazCalculator.calculate(input);
  }

  calculateSupurgelikMdf(input: SupurgelikMdfInput): SupurgelikMdfResult {
    return this.supurgelikMdfCalculator.calculate(input);
  }

  calculate(
    productGroupCode: string,
    input: {
      mode: 'mdf_cost' | 'production_cost' | 'cost_with_vat' | 'cost_with_profit';
      sizes: DoorFrameSizeCostInput[];
      extraCosts?: DoorFrameExtraCostsInput;
      vatRate?: string;
      profitRate?: string;
      cardMarkupRate?: string;
    },
  ):
    | DoorFrameMdfSizeResult[]
    | DoorFrameSizeCostResult[]
    | DoorFrameSizeCostWithVatResult[]
    | DoorFrameSizeCostPricedResult[] {
    if (productGroupCode === 'door_frame') {
      return this.doorFrameCalculator.calculate(input);
    }

    throw new Error(`Hesaplama bu ürün grubu için henüz desteklenmiyor: ${productGroupCode}`);
  }
}
