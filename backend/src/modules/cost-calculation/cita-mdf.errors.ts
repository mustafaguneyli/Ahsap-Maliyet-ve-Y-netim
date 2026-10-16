import { NotFoundException } from '@nestjs/common';
import type { CitaMaterialPriceType } from '../../calculation-engine/calculators/cita-mdf-calculator';
import {
  COST_MATERIAL_PRICE_TYPE,
  missingCostMaterialPriceMessage,
} from './cost-material-price';

export const CITA_RAW_MATERIAL_PRICE_MISSING =
  'RAW_MATERIAL_PRICE_MISSING' as const;

export class CitaRawMaterialPriceMissingException extends NotFoundException {
  readonly errorCode = CITA_RAW_MATERIAL_PRICE_MISSING;
  readonly materialPriceType = COST_MATERIAL_PRICE_TYPE;

  constructor(
    readonly rawMaterialCode: string,
    _materialPriceType?: CitaMaterialPriceType,
  ) {
    super({
      message: missingCostMaterialPriceMessage(rawMaterialCode),
      errorCode: CITA_RAW_MATERIAL_PRICE_MISSING,
      materialPriceType: COST_MATERIAL_PRICE_TYPE,
      rawMaterialCode,
    });
  }
}
