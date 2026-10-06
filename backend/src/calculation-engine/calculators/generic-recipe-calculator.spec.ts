import { calculateGenericRecipeCost } from './generic-recipe-calculator';

describe('calculateGenericRecipeCost', () => {
  const base = {
    productGroupCode: 'MUTFAK_PROFILLERI',
    productGroupName: 'Mutfak Profilleri',
    productCode: 'X_PROFIL',
    productName: 'X Profil',
    productUnit: 'ADET' as const,
    widthMm: 100,
    lengthMm: 2100,
    displayName: '10×210',
    materialPriceType: 'CARD_INSTALLMENT' as const,
    vatRate: '0',
    profitRate: '20',
    cardMarkupRate: '20',
  };

  it('PER_SHEET_YIELD: 2400/24 × 1 + kesim 5 + işçilik 10 = 115', () => {
    const result = calculateGenericRecipeCost({
      ...base,
      items: [
        {
          sortOrder: 1,
          rawMaterialId: 'm1',
          rawMaterialCode: 'MDF-18',
          rawMaterialName: '18 mm MDF',
          priceBasis: 'SHEET',
          unitPrice: '2400',
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1',
          netQty: 24,
        },
      ],
      extraCosts: [
        {
          typeCode: 'CUTTING',
          typeName: 'Kesim',
          amount: '5',
          calculationMode: 'FIXED',
          scope: 'PRODUCT',
        },
        {
          typeCode: 'LABOR',
          typeName: 'İşçilik',
          amount: '10',
          calculationMode: 'FIXED',
          scope: 'PRODUCT',
        },
      ],
    });

    expect(result.status).toBe('OK');
    expect(result.materialCostTotal).toBe('100');
    expect(result.extraCostTotal).toBe('15');
    expect(result.productionCost).toBe('115');
    expect(result.pricing?.cashSalePrice).toBe('138'); // 115 * 1.2 ROUNDUP
  });

  it('eksik fiyat → MISSING_SOURCE, 0 maliyet uydurmaz', () => {
    const result = calculateGenericRecipeCost({
      ...base,
      items: [
        {
          sortOrder: 1,
          rawMaterialId: 'm1',
          rawMaterialCode: 'MDF-18',
          rawMaterialName: '18 mm MDF',
          priceBasis: 'SHEET',
          unitPrice: null,
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1',
          netQty: 24,
        },
      ],
      extraCosts: [],
    });
    expect(result.status).toBe('MISSING_SOURCE');
    expect(result.productionCost).toBeNull();
    expect(result.missingSources.length).toBeGreaterThan(0);
  });

  it('SHEET + PER_PIECE reddeder', () => {
    expect(() =>
      calculateGenericRecipeCost({
        ...base,
        items: [
          {
            sortOrder: 1,
            rawMaterialId: 'm1',
            rawMaterialCode: 'MDF-18',
            rawMaterialName: '18 mm',
            priceBasis: 'SHEET',
            unitPrice: '2400',
            calculationMode: 'PER_PIECE',
            quantity: '1',
          },
        ],
        extraCosts: [],
      }),
    ).toThrow(/PER_SHEET_YIELD/);
  });

  it('PER_METER açık quantity kullanır', () => {
    const result = calculateGenericRecipeCost({
      ...base,
      items: [
        {
          sortOrder: 1,
          rawMaterialId: 'p1',
          rawMaterialCode: 'PROFIL-ALU',
          rawMaterialName: 'Alüminyum',
          priceBasis: 'METER',
          unitPrice: '50',
          calculationMode: 'PER_METER',
          quantity: '2.4',
          quantityUnit: 'metre',
        },
      ],
      extraCosts: [],
      vatRate: null,
      profitRate: null,
      cardMarkupRate: null,
    });
    expect(result.status).toBe('OK');
    expect(result.productionCost).toBe('120');
  });

  it('NET eksik → missingSources', () => {
    const result = calculateGenericRecipeCost({
      ...base,
      items: [
        {
          sortOrder: 1,
          rawMaterialId: 'm1',
          rawMaterialCode: 'MDF-18',
          rawMaterialName: '18 mm',
          priceBasis: 'SHEET',
          unitPrice: '2400',
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1',
          netQty: null,
        },
      ],
      extraCosts: [],
    });
    expect(result.status).toBe('MISSING_SOURCE');
    expect(result.productionCost).toBeNull();
  });
});
