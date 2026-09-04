import { DoorFrameCalculator } from './calculators/door-frame-calculator';

/**
 * İnce yönlendirici. Mega-engine / abstract factory yoktur.
 * Phase 1 yalnızca door_frame → DoorFrameCalculator.
 */
export class CalculationEngine {
  constructor(private readonly doorFrameCalculator = new DoorFrameCalculator()) {}

  calculate(productGroupCode: string, input: unknown): never {
    if (productGroupCode === 'door_frame') {
      return this.doorFrameCalculator.calculate(input);
    }

    throw new Error(`Hesaplama bu ürün grubu için henüz desteklenmiyor: ${productGroupCode}`);
  }
}
