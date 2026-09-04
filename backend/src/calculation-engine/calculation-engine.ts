import { DoorFrameCalculator } from './calculators/door-frame-calculator';
import type {
  DoorFrameExtraCostsInput,
  DoorFrameMdfSizeResult,
  DoorFrameSizeCostInput,
  DoorFrameSizeCostPricedResult,
  DoorFrameSizeCostResult,
  DoorFrameSizeCostWithVatResult,
} from './calculators/door-frame-calculator';

/**
 * İnce yönlendirici. Mega-engine / abstract factory yoktur.
 * Phase 1 yalnızca door_frame → DoorFrameCalculator.
 */
export class CalculationEngine {
  constructor(private readonly doorFrameCalculator = new DoorFrameCalculator()) {}

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
