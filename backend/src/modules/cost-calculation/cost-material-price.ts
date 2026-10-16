import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import {
  COST_MATERIAL_PRICE_TYPE,
  MISSING_COST_MATERIAL_PRICE,
  resolveCostMaterialPrice as selectCostMaterialPrice,
  type MaterialPriceRow,
} from './current-material-price';

export {
  COST_MATERIAL_PRICE_TYPE,
  MISSING_COST_MATERIAL_PRICE,
  selectCostMaterialPrice,
};

export function isMaterialPriceTypeInput(
  value: string,
): value is 'CASH' | 'CARD_INSTALLMENT' {
  return value === 'CASH' || value === 'CARD_INSTALLMENT';
}

/**
 * Üretim maliyeti ham madde alış tipi daima CARD_INSTALLMENT.
 * CASH parametresi geriye dönük kabul edilir; CASH fiyata düşülmez.
 */
export function resolveCostMaterialPriceType(
  value?: string | null,
): typeof COST_MATERIAL_PRICE_TYPE {
  if (value == null || String(value).trim() === '') {
    return COST_MATERIAL_PRICE_TYPE;
  }
  const normalized = String(value).trim();
  if (!isMaterialPriceTypeInput(normalized)) {
    throw new BadRequestException(
      'materialPriceType CASH veya CARD_INSTALLMENT olmalıdır.',
    );
  }
  return COST_MATERIAL_PRICE_TYPE;
}

export function missingCostMaterialPriceMessage(materialLabel?: string): string {
  if (materialLabel && materialLabel.trim().length > 0) {
    return `${materialLabel} için ${MISSING_COST_MATERIAL_PRICE}`;
  }
  return MISSING_COST_MATERIAL_PRICE;
}

export function requireCostMaterialPrice(
  prices: MaterialPriceRow[],
  now: Date,
  materialLabel?: string,
): MaterialPriceRow {
  const current = selectCostMaterialPrice(prices, now);
  if (!current) {
    throw new NotFoundException(missingCostMaterialPriceMessage(materialLabel));
  }
  return current;
}
