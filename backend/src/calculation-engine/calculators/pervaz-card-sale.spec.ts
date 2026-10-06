import { applyPervazPercentCardSale } from './pervaz-card-sale';
import { CARD_MARKUP_RATE_MISSING } from '../pricing/percent-card-sale';

describe('applyPervazPercentCardSale', () => {
  it('nakit × (1 + oran/100); ROUNDUP yok', () => {
    const result = applyPervazPercentCardSale({
      publishedCashPrice: '179',
      cardMarkupRate: '20',
      cardSaleAvailable: true,
    });
    expect(result.cardSalePrice).toBe('214.8');
    expect(result.cardPricingType).toBe('PERCENT_MARKUP');
    expect(result.cardMarkupRate).toBe('20');
  });

  it('%20→%25: nakit aynı, kart değişir', () => {
    const twenty = applyPervazPercentCardSale({
      publishedCashPrice: '179',
      cardMarkupRate: '20',
      cardSaleAvailable: true,
    });
    const twentyFive = applyPervazPercentCardSale({
      publishedCashPrice: '179',
      cardMarkupRate: '25',
      cardSaleAvailable: true,
    });
    expect(twenty.cardSalePrice).toBe('214.8');
    expect(twentyFive.cardSalePrice).toBe('223.75');
  });

  it('kapalı kapsamda fiyat uydurmaz', () => {
    const result = applyPervazPercentCardSale({
      publishedCashPrice: '179',
      cardMarkupRate: '20',
      cardSaleAvailable: false,
    });
    expect(result.cardSaleAvailable).toBe(false);
    expect(result.cardSalePrice).toBeNull();
  });

  it('açık satırda oran yoksa kart null; 0 uydurmaz', () => {
    const result = applyPervazPercentCardSale({
      publishedCashPrice: '179',
      cardMarkupRate: null,
      cardSaleAvailable: true,
    });
    expect(result.cardSalePrice).toBeNull();
    expect(result.cardStatusCode).toBe(CARD_MARKUP_RATE_MISSING);
    expect(result.cardStatusMessage).toBe('Kart/taksit oranı tanımlı değil');
  });
});
