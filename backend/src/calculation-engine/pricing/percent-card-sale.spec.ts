import { BadRequestException } from '@nestjs/common';
import { applyPercentCardSale, CARD_MARKUP_RATE_MISSING } from './percent-card-sale';

describe('applyPercentCardSale', () => {
  it('Çıta nakit master @%20: 115→138, 145→174, 185→222, 215→258', () => {
    const cases = [
      ['115', '138'],
      ['145', '174'],
      ['185', '222'],
      ['215', '258'],
    ] as const;
    for (const [cash, card] of cases) {
      const result = applyPercentCardSale({
        cashPrice: cash,
        cardMarkupRate: '20',
        rounding: 'none',
      });
      expect(result.cardSalePrice).toBe(card);
      expect(result.cardMarkupRate).toBe('20');
      expect(result.statusCode).toBeNull();
    }
  });

  it('%20→%25: nakit 145 aynı, kart 174→181.25 (ROUNDUP yok)', () => {
    const twenty = applyPercentCardSale({
      cashPrice: '145',
      cardMarkupRate: '20',
      rounding: 'none',
    });
    const twentyFive = applyPercentCardSale({
      cashPrice: '145',
      cardMarkupRate: '25',
      rounding: 'none',
    });
    expect(twenty.cardSalePrice).toBe('174');
    expect(twentyFive.cardSalePrice).toBe('181.25');
  });

  it('Kapı Kasası ROUNDUP: 300 @%20→360, @%25→375', () => {
    const twenty = applyPercentCardSale({
      cashPrice: '300',
      cardMarkupRate: '20',
      rounding: 'roundUpWholeTl',
    });
    const twentyFive = applyPercentCardSale({
      cashPrice: '300',
      cardMarkupRate: '25',
      rounding: 'roundUpWholeTl',
    });
    expect(twenty.cardSalePrice).toBe('360');
    expect(twentyFive.cardSalePrice).toBe('375');
  });

  it('%0 iken kart = nakit', () => {
    const result = applyPercentCardSale({
      cashPrice: '145',
      cardMarkupRate: '0',
      rounding: 'none',
    });
    expect(result.cardSalePrice).toBe('145');
  });

  it('oran yoksa kart null; 0 uydurmaz', () => {
    const result = applyPercentCardSale({
      cashPrice: '145',
      cardMarkupRate: null,
      rounding: 'none',
    });
    expect(result.cardSalePrice).toBeNull();
    expect(result.cardMarkupRate).toBeNull();
    expect(result.statusCode).toBe(CARD_MARKUP_RATE_MISSING);
    expect(result.statusMessage).toBe('Kart/taksit oranı tanımlı değil');
  });

  it('negatif oranı reddeder', () => {
    expect(() =>
      applyPercentCardSale({
        cashPrice: '145',
        cardMarkupRate: '-1',
        rounding: 'none',
      }),
    ).toThrow(BadRequestException);
  });

  it('18.5 gibi ondalık oranı Decimal ile uygular', () => {
    const result = applyPercentCardSale({
      cashPrice: '200',
      cardMarkupRate: '18.5',
      rounding: 'none',
    });
    expect(result.cardSalePrice).toBe('237');
  });
});
