import {
  CITA_PRODUCT_GROUP_SEED,
  CITA_PRODUCT_SEED,
  CITA_PRODUCT_SIZE_SEEDS,
  seedCitaProductMaster,
} from './cita-product-seed';

describe('seedCitaProductMaster', () => {
  it('ilk çalışmada tek grup, tek ürün ve sekiz standart ölçü oluşturur', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'g-cita',
          code: 'CITA',
          name: 'Çıta',
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
      productionYield: { create: jest.fn(), createMany: jest.fn() },
      extraCostValue: { create: jest.fn() },
      extraCostType: { create: jest.fn() },
      pricingSetting: { create: jest.fn() },
    };

    const report = await seedCitaProductMaster(prisma as never);

    expect(report).toEqual({
      productGroupCreated: true,
      productsCreated: 1,
      productsSkippedExisting: 0,
      sizesCreated: 8,
      sizesSkippedExisting: 0,
    });
    expect(prisma.productGroup.create).toHaveBeenCalledWith({
      data: { code: 'CITA', name: 'Çıta', isActive: true },
    });
    expect(prisma.product.create).toHaveBeenCalledTimes(1);
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: {
        productGroupId: 'g-cita',
        code: 'CITA',
        name: 'Çıta',
        isActive: true,
      },
    });
    expect(prisma.productSize.create.mock.calls.map(([arg]) => arg.data)).toEqual(
      [...CITA_PRODUCT_SIZE_SEEDS],
    );
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
    expect(prisma.productionYield.createMany).not.toHaveBeenCalled();
    expect(prisma.extraCostValue.create).not.toHaveBeenCalled();
    expect(prisma.pricingSetting.create).not.toHaveBeenCalled();
  });

  it('idempotent: mevcut masterları overwrite etmez veya duplicate oluşturmaz', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g-cita',
          code: 'CITA',
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

    const report = await seedCitaProductMaster(prisma as never);

    expect(report).toEqual({
      productGroupCreated: false,
      productsCreated: 0,
      productsSkippedExisting: 1,
      sizesCreated: 0,
      sizesSkippedExisting: 8,
    });
    expect(prisma.productGroup.create).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.productSize.create).not.toHaveBeenCalled();
    expect(prisma.productGroup.update).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.productSize.update).not.toHaveBeenCalled();
  });

  it('80×2800 varsa reuse eder; diğer yedi ölçüyü oluşturur', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g-cita',
          code: 'CITA',
          name: 'Çıta',
          isActive: true,
        }),
        create: jest.fn(),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'created-product' }),
      },
      productSize: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.widthMm_lengthMm.widthMm === 80) {
            return Promise.resolve({
              id: 'supurgelik-80x2800',
              displayName: '8×280',
            });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockResolvedValue({ id: 'created-size' }),
      },
    };

    const report = await seedCitaProductMaster(prisma as never);

    expect(report.sizesCreated).toBe(7);
    expect(report.sizesSkippedExisting).toBe(1);
    expect(prisma.productSize.create).toHaveBeenCalledTimes(7);
    expect(
      prisma.productSize.create.mock.calls.some(
        ([arg]) => arg.data.widthMm === 80,
      ),
    ).toBe(false);
  });

  it('kalınlık veya 1-2/3-4 grupları için ayrı Product oluşturmaz', () => {
    expect(CITA_PRODUCT_GROUP_SEED).toEqual({ code: 'CITA', name: 'Çıta' });
    expect(CITA_PRODUCT_SEED).toEqual({ code: 'CITA', name: 'Çıta' });
    expect(CITA_PRODUCT_SEED).not.toHaveProperty('thicknessMm');
    expect(CITA_PRODUCT_SIZE_SEEDS).toHaveLength(8);
    expect(CITA_PRODUCT_SIZE_SEEDS.map((size) => size.widthMm)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80,
    ]);
    expect(
      CITA_PRODUCT_SIZE_SEEDS.every((size) => size.lengthMm === 2800),
    ).toBe(true);
    expect(CITA_PRODUCT_SIZE_SEEDS.some((size) => 'thicknessMm' in size)).toBe(
      false,
    );
  });
});
