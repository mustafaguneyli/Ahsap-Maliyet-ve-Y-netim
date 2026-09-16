import {
  collectRowUsages,
  genericYieldMatchesDoorFrameProduct,
  genericYieldMatchesSharedProductSize,
  type YieldUsageProduct,
  type YieldUsageRow,
} from './production-yield-usage';

function product(
  overrides: Partial<YieldUsageProduct> & Pick<YieldUsageProduct, 'id' | 'code' | 'name'>,
): YieldUsageProduct {
  const { productGroup, ...rest } = overrides;
  return {
    isActive: true,
    productGroup: productGroup ?? {
      id: 'g-door',
      code: 'door_frame',
      name: 'Kapı Kasası',
      isActive: true,
    },
    ...rest,
  };
}

describe('production-yield-usage', () => {
  const door34 = product({
    id: 'p-34',
    code: '34_MM',
    name: '34 MM MDF Kasa',
  });
  const door30 = product({
    id: 'p-30',
    code: '30_MM',
    name: '30 MM MDF Kasa',
  });
  const cita = product({
    id: 'p-cita',
    code: 'CITA',
    name: 'Çıta',
    productGroup: {
      id: 'g-cita',
      code: 'CITA',
      name: 'Çıta',
      isActive: true,
    },
  });
  const duzSupurgelik = product({
    id: 'p-duz',
    code: 'DUZ_SUPURGELIK',
    name: 'Düz Süpürgelik',
    productGroup: {
      id: 'g-sup',
      code: 'SUPURGELIK',
      name: 'Süpürgelik',
      isActive: true,
    },
  });

  it('product-scoped yield yalnız kendi ürününü döner', () => {
    const row: YieldUsageRow = {
      id: 'y-cita',
      productId: cita.id,
      pieceWidthMm: 40,
      pieceLengthMm: 2800,
      rawMaterial: { code: 'MDF-14-2100X2800-ZIMPARALI', sheetLengthMm: 2800 },
      product: cita,
    };

    const usages = collectRowUsages(row, {
      genericConsumerProducts: [door34, duzSupurgelik],
      productSizeKeys: new Set(['40|2800', '80|2800']),
    });

    expect(usages).toEqual([
      expect.objectContaining({
        productId: cita.id,
        productGroupCode: 'CITA',
        source: 'PRODUCT_SCOPED',
      }),
    ]);
  });

  it('generic 22 mm 10×210 kapı kasası 34 MM ile eşleşir; süpürgelik ile eşleşmez', () => {
    const row: YieldUsageRow = {
      id: 'y-door',
      productId: null,
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
      rawMaterial: { code: 'MDF-22-2100X2800-ZIMPARALI', sheetLengthMm: 2800 },
    };

    expect(genericYieldMatchesDoorFrameProduct(row, '34_MM')).toBe(true);
    expect(genericYieldMatchesDoorFrameProduct(row, '30_MM')).toBe(false);
    expect(
      genericYieldMatchesSharedProductSize(row, new Set(['100|2100', '80|2800'])),
    ).toBe(false);

    const usages = collectRowUsages(row, {
      genericConsumerProducts: [door34, door30, duzSupurgelik],
      productSizeKeys: new Set(['100|2100', '80|2800']),
    });
    expect(usages.map((item) => item.productCode)).toEqual(['34_MM']);
    expect(usages[0].source).toBe('GENERIC');
  });

  it('generic 8×280 süpürgelik ProductSize eşleşmesiyle gösterilir', () => {
    const row: YieldUsageRow = {
      id: 'y-sup',
      productId: null,
      pieceWidthMm: 80,
      pieceLengthMm: 2800,
      rawMaterial: { code: 'MDF-8-2100X2800-ZIMPARALI', sheetLengthMm: 2800 },
    };

    const usages = collectRowUsages(row, {
      genericConsumerProducts: [door34, duzSupurgelik],
      productSizeKeys: new Set(['80|2800', '100|2100']),
    });

    expect(usages).toEqual([
      expect.objectContaining({
        productCode: 'DUZ_SUPURGELIK',
        productGroupCode: 'SUPURGELIK',
        source: 'GENERIC',
      }),
    ]);
  });

  it('recipe kullanımı generic eşleşmeyi ezmez, ürünü RECIPE kaynağıyla ekler', () => {
    const row: YieldUsageRow = {
      id: 'y-recipe',
      productId: null,
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
      rawMaterial: { code: 'MDF-22-2100X2800-ZIMPARALI', sheetLengthMm: 2800 },
      recipeItems: [{ recipe: { product: door34 } }],
    };

    const usages = collectRowUsages(row, {
      genericConsumerProducts: [door34],
      productSizeKeys: new Set(['100|2100']),
    });

    expect(usages).toEqual([
      expect.objectContaining({
        productId: door34.id,
        source: 'RECIPE',
      }),
    ]);
  });
});
