import { resolveCardMarkupRateWithProductFallback, resolveGroupCardMarkupRate } from './card-markup-rate.resolver';

describe('card markup rate resolver', () => {
  it('group-scope oranı döner', () => {
    expect(
      resolveGroupCardMarkupRate([
        { isActive: true, cardMarkupRate: { toString: () => '20' } },
      ]),
    ).toBe('20');
  });

  it('grup yoksa ürün fallback', () => {
    expect(
      resolveCardMarkupRateWithProductFallback(
        [],
        [{ isActive: true, cardMarkupRate: { toString: () => '20' } }],
      ),
    ).toBe('20');
  });

  it('grup ürünü ezer', () => {
    expect(
      resolveCardMarkupRateWithProductFallback(
        [{ isActive: true, cardMarkupRate: { toString: () => '25' } }],
        [{ isActive: true, cardMarkupRate: { toString: () => '20' } }],
      ),
    ).toBe('25');
  });

  it('yoksa null; 0 uydurmaz', () => {
    expect(resolveGroupCardMarkupRate([])).toBeNull();
    expect(
      resolveCardMarkupRateWithProductFallback(
        [{ isActive: true, cardMarkupRate: null }],
        [{ isActive: true, cardMarkupRate: null }],
      ),
    ).toBeNull();
  });
});
