import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import { applyPervazFixedCardSale } from './pervaz-card-sale';

describe('applyPervazFixedCardSale', () => {
  it('yayın nakit + sabit TL; ROUNDUP yok', () => {
    const result = applyPervazFixedCardSale({
      publishedCashPrice: '179',
      cardFixedSurchargeAmount: '2',
      cardSaleAvailable: true,
    });
    expect(result).toEqual({
      cardSaleAvailable: true,
      cardPricingType: 'FIXED_SURCHARGE',
      cardFixedSurchargeAmount: '2',
      cardSalePrice: '181',
    });
    expect(result.cardSalePrice).toBe(
      toDecimal('179').plus(toDecimal('2')).toFixed(),
    );
  });

  it('kapalı kapsamda fiyat uydurmaz', () => {
    const result = applyPervazFixedCardSale({
      publishedCashPrice: '179',
      cardFixedSurchargeAmount: '2',
      cardSaleAvailable: false,
    });
    expect(result.cardSaleAvailable).toBe(false);
    expect(result.cardPricingType).toBe('NONE');
    expect(result.cardSalePrice).toBeNull();
    expect(result.cardFixedSurchargeAmount).toBe('2');
  });

  it('2→3 yalnız kartı +1 değiştirir; nakit input aynı kalır', () => {
    const cash = '179';
    const two = applyPervazFixedCardSale({
      publishedCashPrice: cash,
      cardFixedSurchargeAmount: '2',
      cardSaleAvailable: true,
    });
    const three = applyPervazFixedCardSale({
      publishedCashPrice: cash,
      cardFixedSurchargeAmount: '3',
      cardSaleAvailable: true,
    });
    expect(two.cardSalePrice).toBe('181');
    expect(three.cardSalePrice).toBe('182');
    expect(
      toDecimal(three.cardSalePrice!).minus(toDecimal(two.cardSalePrice!)).equals(
        '1',
      ),
    ).toBe(true);
  });

  it('açık satırda tutar yoksa sessiz 0 değil, hata', () => {
    expect(() =>
      applyPervazFixedCardSale({
        publishedCashPrice: '179',
        cardFixedSurchargeAmount: null,
        cardSaleAvailable: true,
      }),
    ).toThrow(BadRequestException);
  });
});
