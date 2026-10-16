import { MaterialPriceType } from '@prisma/client';
import {
  applyPercentCardSale,
  CARD_MARKUP_RATE_MISSING,
} from '../calculation-engine/pricing/percent-card-sale';

describe('cardMarkupRate vs MDF alış tipi', () => {
  it('müşteri kart satış oranı 0 geçerlidir; CARD_INSTALLMENT alış tipi değildir', () => {
    const sale = applyPercentCardSale({
      cashPrice: '100',
      cardMarkupRate: '0',
      rounding: 'none',
    });
    expect(sale.cardSalePrice).toBe('100');
    expect(sale.cardMarkupRate).toBe('0');
    expect(sale.statusCode).toBeNull();
    expect(MaterialPriceType.CARD_INSTALLMENT).toBe('CARD_INSTALLMENT');
    expect(sale.cardMarkupRate).not.toBe(MaterialPriceType.CARD_INSTALLMENT);
  });

  it('CARD_INSTALLMENT ham madde alış tipi cardMarkupRate yerine geçmez', () => {
    const missing = applyPercentCardSale({
      cashPrice: '100',
      cardMarkupRate: null,
      rounding: 'roundUpWholeTl',
    });
    expect(missing.cardSalePrice).toBeNull();
    expect(missing.statusCode).toBe(CARD_MARKUP_RATE_MISSING);
  });
});
