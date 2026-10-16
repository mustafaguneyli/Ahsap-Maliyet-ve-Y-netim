import { calculateGenericRecipeCost } from '../calculation-engine/calculators/generic-recipe-calculator';
import { copyRecipeItemsDeep, resolveRecipeWithItems, type RecipeItemDoc } from './firestore-recipe';

describe('firestore-recipe', () => {
  const recipe = {
    id: 'r1',
    productId: 'p1',
    productSizeId: 's1',
    name: 'X 10x210',
    isActive: true,
  };
  const items: RecipeItemDoc[] = [
    {
      id: 'i1',
      recipeId: 'r1',
      rawMaterialId: 'm1',
      productionYieldId: 'y1',
      quantity: '1.0000',
      calculationMode: 'PER_SHEET_YIELD',
      quantityUnit: null,
      wasteRate: null,
      sortOrder: 2,
    },
    {
      id: 'i0',
      recipeId: 'r1',
      rawMaterialId: 'm2',
      productionYieldId: null,
      quantity: '0.5000',
      calculationMode: 'FIXED_QUANTITY',
      quantityUnit: 'adet',
      wasteRate: '0.0000',
      sortOrder: 1,
    },
  ];

  it('productId + productSizeId ile aktif reçete ve satırları çözer', () => {
    const resolved = resolveRecipeWithItems([recipe], items, 'p1', 's1');
    expect(resolved?.recipe.id).toBe('r1');
    expect(resolved?.items.map((item) => item.id)).toEqual(['i0', 'i1']);
  });

  it('pasif reçeteyi çözmez', () => {
    expect(
      resolveRecipeWithItems([{ ...recipe, isActive: false }], items, 'p1', 's1'),
    ).toBeNull();
  });

  it('copyRecipeFromSizeId deep copy: yeni nesne, kaynak id yok, yield referansı korunur', () => {
    const copied = copyRecipeItemsDeep(items);
    expect(copied).toHaveLength(2);
    expect(copied[0]).not.toBe(items[0]);
    expect(copied.map((item) => item.sortOrder)).toEqual([1, 2]);
    expect(copied[0]).not.toHaveProperty('id');
    expect(copied[0]).not.toHaveProperty('recipeId');
    expect(copied[1].productionYieldId).toBe('y1');
    copied[1].quantity = '9';
    expect(items[0].quantity).toBe('1.0000');
  });

  it('Firestore canonical string ile PostgreSQL dönemindeki productionCost aynıdır', () => {
    const result = calculateGenericRecipeCost({
      productGroupCode: 'MUTFAK_PROFILLERI',
      productGroupName: 'Mutfak Profilleri',
      productCode: 'X_PROFIL',
      productName: 'X Profil',
      productUnit: 'ADET',
      widthMm: 100,
      lengthMm: 2100,
      displayName: '10×210',
      materialPriceType: 'CARD_INSTALLMENT',
      vatRate: '0.0000',
      profitRate: '20.0000',
      cardMarkupRate: '20.0000',
      items: [
        {
          sortOrder: 1,
          rawMaterialId: 'm1',
          rawMaterialCode: 'MDF-18',
          rawMaterialName: '18 mm MDF',
          priceBasis: 'SHEET',
          unitPrice: '2400.0000',
          calculationMode: 'PER_SHEET_YIELD',
          quantity: '1.0000',
          netQty: 24,
        },
      ],
      extraCosts: [
        {
          typeCode: 'CUTTING',
          typeName: 'Kesim',
          amount: '5.0000',
          calculationMode: 'FIXED',
          scope: 'PRODUCT',
        },
        {
          typeCode: 'LABOR',
          typeName: 'İşçilik',
          amount: '10.0000',
          calculationMode: 'FIXED',
          scope: 'PRODUCT',
        },
      ],
    });
    expect(result.status).toBe('OK');
    expect(result.productionCost).toBe('115');
  });
});
