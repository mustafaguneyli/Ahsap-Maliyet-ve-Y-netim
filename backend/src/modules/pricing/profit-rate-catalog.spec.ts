import {
  resolveCatalogProfitRate,
  type ProfitRateCatalog,
} from './profit-rate-catalog';

const now = new Date('2026-10-06T12:00:00.000Z');
const from = new Date('2026-03-01T00:00:00.000Z');

function catalog(partial: Partial<ProfitRateCatalog> = {}): ProfitRateCatalog {
  return {
    sizeOverrides: [],
    productOverrides: [],
    productSettings: [{ isActive: true, profitRate: { toString: () => '15' } }],
    groupSettings: [{ isActive: true, profitRate: { toString: () => '10' } }],
    globalSettings: [{ isActive: true, profitRate: { toString: () => '8' } }],
    ...partial,
  };
}

describe('resolveCatalogProfitRate', () => {
  it('A) product+size override yalnız o ölçüyü etkiler', () => {
    const loaded = catalog({
      sizeOverrides: [
        {
          productSizeId: 's-10',
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: { toString: () => '20' },
        },
        {
          productSizeId: 's-12',
          isActive: true,
          effectiveFrom: from,
          effectiveTo: null,
          profitRate: { toString: () => '30' },
        },
      ],
    });
    const ten = resolveCatalogProfitRate({
      catalog: loaded,
      now,
      productSizeId: 's-10',
    });
    const twelve = resolveCatalogProfitRate({
      catalog: loaded,
      now,
      productSizeId: 's-12',
    });
    expect(ten).toEqual({ profitRate: '20', source: 'SIZE_OVERRIDE' });
    expect(twelve).toEqual({ profitRate: '30', source: 'SIZE_OVERRIDE' });
  });

  it('C) ölçü override yoksa ürün → grup → global fallback', () => {
    const sizeMissing = resolveCatalogProfitRate({
      catalog: catalog({ sizeOverrides: [], productOverrides: [] }),
      now,
      productSizeId: 's-10',
    });
    expect(sizeMissing).toEqual({
      profitRate: '15',
      source: 'PRODUCT_PRICING_SETTING',
    });

    const group = resolveCatalogProfitRate({
      catalog: catalog({
        sizeOverrides: [],
        productOverrides: [],
        productSettings: [{ isActive: true, profitRate: null }],
      }),
      now,
      productSizeId: 's-10',
    });
    expect(group).toEqual({
      profitRate: '10',
      source: 'GROUP_PRICING_SETTING',
    });
  });

  it('D) profitRate=0 geçerli SIZE_OVERRIDE’dır', () => {
    const resolved = resolveCatalogProfitRate({
      catalog: catalog({
        sizeOverrides: [
          {
            productSizeId: 's-10',
            isActive: true,
            effectiveFrom: from,
            effectiveTo: null,
            profitRate: { toString: () => '0' },
          },
        ],
      }),
      now,
      productSizeId: 's-10',
    });
    expect(resolved).toEqual({ profitRate: '0', source: 'SIZE_OVERRIDE' });
  });

  it('E) blank/null ölçü override fallback’e döner; 0 ile aynı değildir', () => {
    const blank = resolveCatalogProfitRate({
      catalog: catalog({
        sizeOverrides: [
          {
            productSizeId: 's-10',
            isActive: true,
            effectiveFrom: from,
            effectiveTo: null,
            profitRate: null,
          },
        ],
      }),
      now,
      productSizeId: 's-10',
    });
    expect(blank).toEqual({
      profitRate: '15',
      source: 'PRODUCT_PRICING_SETTING',
    });
  });
});
