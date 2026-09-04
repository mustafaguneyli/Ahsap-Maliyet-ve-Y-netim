import { applyPublishedSalePrices } from './apply-published-sale-prices';

describe('applyPublishedSalePrices', () => {
  it('override yoksa published = calculated; kart calculated nakitten', () => {
    const result = applyPublishedSalePrices('356', '20', null);
    expect(result.calculatedCashPrice).toBe('356');
    expect(result.cashOverride).toBeNull();
    expect(result.publishedCashPrice).toBe('356');
    expect(result.publishedCardPrice).toBe('428');
  });

  it('34 MM basılı liste 8/8 nakit + kart', () => {
    const cases: Array<{
      size: string;
      calculated: string;
      override: string | null;
      publishedCash: string;
      publishedCard: string;
    }> = [
      { size: '10x210', calculated: '301', override: '300', publishedCash: '300', publishedCard: '360' },
      { size: '12x210', calculated: '356', override: null, publishedCash: '356', publishedCard: '428' },
      { size: '14x210', calculated: '412', override: '415', publishedCash: '415', publishedCard: '498' },
      { size: '16x210', calculated: '465', override: null, publishedCash: '465', publishedCard: '558' },
      { size: '18x210', calculated: '524', override: '525', publishedCash: '525', publishedCard: '630' },
      { size: '20x210', calculated: '601', override: '600', publishedCash: '600', publishedCard: '720' },
      { size: '22x210', calculated: '655', override: null, publishedCash: '655', publishedCard: '786' },
      { size: '24x210', calculated: '708', override: null, publishedCash: '708', publishedCard: '850' },
    ];

    for (const row of cases) {
      const override =
        row.override == null
          ? null
          : { id: `ov-${row.size}`, cashPrice: row.override, reason: '2026-4' };
      const result = applyPublishedSalePrices(row.calculated, '20', override);
      expect(`${row.size} calculated`).toEqual(`${row.size} calculated`);
      expect(result.calculatedCashPrice).toBe(row.calculated);
      expect(result.publishedCashPrice).toBe(row.publishedCash);
      expect(result.publishedCardPrice).toBe(row.publishedCard);
    }
  });

  it('nakit override kartı etkiler; calculated nakit değişmez', () => {
    const result = applyPublishedSalePrices('301', '20', {
      id: 'ov1',
      cashPrice: '300',
      reason: null,
    });
    expect(result.calculatedCashPrice).toBe('301');
    expect(result.publishedCashPrice).toBe('300');
    expect(result.publishedCardPrice).toBe('360');
  });

  it('eksik override tutarında sessiz varsayım yapmaz', () => {
    expect(() =>
      applyPublishedSalePrices('301', '20', { id: 'ov1', cashPrice: '', reason: null }),
    ).toThrow('cashOverride.cashPrice eksik.');
  });
});
