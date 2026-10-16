import { BadRequestException } from '@nestjs/common';
import { MaterialPriceType } from '@prisma/client';
import {
  COST_MATERIAL_PRICE_TYPE,
  MISSING_COST_MATERIAL_PRICE,
  resolveCostMaterialPrice,
  selectCurrentMaterialPrice,
} from './current-material-price';
import {
  missingCostMaterialPriceMessage,
  resolveCostMaterialPriceType,
} from './cost-material-price';

const now = new Date('2026-10-15T12:00:00.000Z');

function row(priceType: MaterialPriceType, amount: string, id = priceType) {
  return {
    id,
    priceType,
    price: { toString: () => amount },
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
  };
}

describe('üretim maliyeti CARD_INSTALLMENT kaynağı', () => {
  it('boş, CASH ve CARD girdilerini CARD_INSTALLMENT yapar', () => {
    expect(resolveCostMaterialPriceType(undefined)).toBe(COST_MATERIAL_PRICE_TYPE);
    expect(resolveCostMaterialPriceType(null)).toBe(COST_MATERIAL_PRICE_TYPE);
    expect(resolveCostMaterialPriceType('')).toBe(COST_MATERIAL_PRICE_TYPE);
    expect(resolveCostMaterialPriceType('CASH')).toBe('CARD_INSTALLMENT');
    expect(resolveCostMaterialPriceType('CARD_INSTALLMENT')).toBe(
      'CARD_INSTALLMENT',
    );
  });

  it('geçersiz tipi reddeder', () => {
    expect(() => resolveCostMaterialPriceType('NAKIT')).toThrow(BadRequestException);
  });

  it('CARD ve CASH farklıysa productionCost CARD tutarını seçer', () => {
    const prices = [
      row(MaterialPriceType.CASH, '2000'),
      row(MaterialPriceType.CARD_INSTALLMENT, '2500'),
    ];
    const selected = resolveCostMaterialPrice(prices, now);
    expect(selected?.priceType).toBe('CARD_INSTALLMENT');
    expect(selected?.price.toString()).toBe('2500');
  });

  it('CARD yokken CASH mevcutsa fallback yapmaz', () => {
    const prices = [row(MaterialPriceType.CASH, '2000')];
    expect(resolveCostMaterialPrice(prices, now)).toBeNull();
    expect(
      selectCurrentMaterialPrice(prices, MaterialPriceType.CASH, now)?.price.toString(),
    ).toBe('2000');
    expect(missingCostMaterialPriceMessage()).toBe(MISSING_COST_MATERIAL_PRICE);
  });
});
