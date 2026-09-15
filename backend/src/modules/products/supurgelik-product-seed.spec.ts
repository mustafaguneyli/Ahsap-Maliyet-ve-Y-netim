import {
  SUPURGELIK_PRODUCT_SEEDS,
  SUPURGELIK_PRODUCT_SIZE_SEEDS,
  seedSupurgelikProductMaster,
} from './supurgelik-product-seed';

describe('seedSupurgelikProductMaster', () => {
  it('ilk çalışmada tek grup, dört ürün ve beş standart ölçü oluşturur', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'g-supurgelik',
          code: 'SUPURGELIK',
          name: 'Süpürgelik',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'created-product' }),
      },
      productSize: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'created-size' }),
      },
    };

    const report = await seedSupurgelikProductMaster(prisma as never);

    expect(report).toEqual({
      productGroupCreated: true,
      productsCreated: 4,
      productsSkippedExisting: 0,
      sizesCreated: 5,
      sizesSkippedExisting: 0,
    });
    expect(prisma.productGroup.create).toHaveBeenCalledWith({
      data: { code: 'SUPURGELIK', name: 'Süpürgelik', isActive: true },
    });
    expect(prisma.product.create.mock.calls.map(([arg]) => arg.data)).toEqual(
      SUPURGELIK_PRODUCT_SEEDS.map(({ code, name }) => ({
        productGroupId: 'g-supurgelik',
        code,
        name,
        isActive: true,
      })),
    );
    expect(prisma.productSize.create.mock.calls.map(([arg]) => arg.data)).toEqual(
      SUPURGELIK_PRODUCT_SIZE_SEEDS,
    );
  });

  it('idempotent: mevcut masterları overwrite etmez veya duplicate oluşturmaz', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g-supurgelik',
          code: 'SUPURGELIK',
          name: 'Kullanıcı adı',
          isActive: false,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'existing-product',
          name: 'Kullanıcı ürün adı',
          isActive: false,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      productSize: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'existing-size',
          displayName: 'Kullanıcı ölçü adı',
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const report = await seedSupurgelikProductMaster(prisma as never);

    expect(report).toEqual({
      productGroupCreated: false,
      productsCreated: 0,
      productsSkippedExisting: 4,
      sizesCreated: 0,
      sizesSkippedExisting: 5,
    });
    expect(prisma.productGroup.create).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.productSize.create).not.toHaveBeenCalled();
    expect(prisma.productGroup.update).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.productSize.update).not.toHaveBeenCalled();
  });

  it('ürün kodları ortak temel calculator için iki eksenin 2×2 matrisidir', () => {
    expect(SUPURGELIK_PRODUCT_SEEDS).toHaveLength(4);
    expect(
      SUPURGELIK_PRODUCT_SEEDS.map(({ surfaceType, ppSarma }) =>
        `${surfaceType}/${ppSarma}`,
      ).sort(),
    ).toEqual([
      'DEKORATIF/false',
      'DEKORATIF/true',
      'DUZ/false',
      'DUZ/true',
    ]);

    for (const seed of SUPURGELIK_PRODUCT_SEEDS) {
      expect(seed).not.toHaveProperty('thicknessMm');
      expect(seed).not.toHaveProperty('netQty');
      expect(seed).not.toHaveProperty('pricing');
    }
  });

  it('yalnız beş standart 2800 mm ölçüyü içerir; 170×2800 legacy yoktur', () => {
    expect(SUPURGELIK_PRODUCT_SIZE_SEEDS).toEqual([
      { widthMm: 80, lengthMm: 2800, displayName: '8×280' },
      { widthMm: 90, lengthMm: 2800, displayName: '9×280' },
      { widthMm: 100, lengthMm: 2800, displayName: '10×280' },
      { widthMm: 120, lengthMm: 2800, displayName: '12×280' },
      { widthMm: 150, lengthMm: 2800, displayName: '15×280' },
    ]);
    expect(
      SUPURGELIK_PRODUCT_SIZE_SEEDS.some((size) => Number(size.widthMm) === 170),
    ).toBe(false);
    expect(SUPURGELIK_PRODUCT_SIZE_SEEDS.some((size) => 'thicknessMm' in size)).toBe(
      false,
    );
  });
});
