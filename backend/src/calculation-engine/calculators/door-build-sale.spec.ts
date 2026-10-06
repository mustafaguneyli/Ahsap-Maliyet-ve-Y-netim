import {
  calculateDoorBuildSalePrice,
  DOOR_BUILD_CARD_MARKUP_MISSING_TR,
  DOOR_BUILD_SALE_MISSING_PROFIT,
  DOOR_BUILD_SALE_MISSING_VAT,
} from './door-build-sale';

describe('DoorBuildSalePrice', () => {
  it('10000 / %20 kâr / %10 KDV → nakit 13200; kart %20 → 15840', () => {
    const result = calculateDoorBuildSalePrice({
      productionBase: '10000',
      profitRate: '20',
      vatRate: '10',
      cardMarkupRate: '20',
    });
    expect(result.status).toBe('COMPUTED');
    if (result.status !== 'COMPUTED') return;
    expect(result.profitAmount).toBe('2000');
    expect(result.beforeVat).toBe('12000');
    expect(result.vatAmount).toBe('1200');
    expect(result.cashSale).toBe('13200');
    expect(result.cardSale).toBe('15840');
  });

  it('profitRate yoksa nihai satış yok', () => {
    const result = calculateDoorBuildSalePrice({
      productionBase: '10000',
      profitRate: null,
      vatRate: '10',
      cardMarkupRate: '20',
    });
    expect(result.status).toBe('NOT_COMPUTED');
    if (result.status !== 'NOT_COMPUTED') return;
    expect(result.cashSale).toBeNull();
    expect(result.reason).toBe(DOOR_BUILD_SALE_MISSING_PROFIT);
  });

  it('vatRate yoksa nihai satış yok', () => {
    const result = calculateDoorBuildSalePrice({
      productionBase: '10000',
      profitRate: '20',
      vatRate: '',
      cardMarkupRate: '20',
    });
    expect(result.status).toBe('NOT_COMPUTED');
    if (result.status !== 'NOT_COMPUTED') return;
    expect(result.cashSale).toBeNull();
    expect(result.reason).toBe(DOOR_BUILD_SALE_MISSING_VAT);
  });

  it('cardMarkupRate yoksa cash var, card null', () => {
    const result = calculateDoorBuildSalePrice({
      productionBase: '10000',
      profitRate: '20',
      vatRate: '10',
      cardMarkupRate: null,
    });
    expect(result.status).toBe('COMPUTED');
    if (result.status !== 'COMPUTED') return;
    expect(result.cashSale).toBe('13200');
    expect(result.cardSale).toBeNull();
    expect(result.cardStatusMessage).toBe(DOOR_BUILD_CARD_MARKUP_MISSING_TR);
  });

  it('0 profit ve 0 VAT kabul', () => {
    const result = calculateDoorBuildSalePrice({
      productionBase: '10000',
      profitRate: '0',
      vatRate: '0',
      cardMarkupRate: '0',
    });
    expect(result.status).toBe('COMPUTED');
    if (result.status !== 'COMPUTED') return;
    expect(result.profitAmount).toBe('0');
    expect(result.vatAmount).toBe('0');
    expect(result.cashSale).toBe('10000');
    expect(result.cardSale).toBe('10000');
  });

  it('negatif oranları reddeder', () => {
    expect(() =>
      calculateDoorBuildSalePrice({
        productionBase: '10000',
        profitRate: '-1',
        vatRate: '10',
        cardMarkupRate: null,
      }),
    ).toThrow(/Kâr oranı/);
    expect(() =>
      calculateDoorBuildSalePrice({
        productionBase: '10000',
        profitRate: '10',
        vatRate: '-1',
        cardMarkupRate: null,
      }),
    ).toThrow(/KDV oranı/);
  });
});
