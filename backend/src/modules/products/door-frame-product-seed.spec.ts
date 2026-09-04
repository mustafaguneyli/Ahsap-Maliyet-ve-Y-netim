import {
  DOOR_FRAME_PRODUCT_SEEDS,
  seedDoorFrameProducts,
} from './door-frame-product-seed';

describe('seedDoorFrameProducts', () => {
  it('ilk çalışmada 34_MM ve 30_MM ürünlerini door_frame altına ekler', async () => {
    const createdCodes: string[] = [];
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'g1',
          code: 'door_frame',
          name: 'Kapı Kasası',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: { code: string } }) => {
          createdCodes.push(data.code);
          return Promise.resolve({ id: `p-${data.code}`, ...data });
        }),
      },
    };

    const report = await seedDoorFrameProducts(prisma as never);

    expect(report.productGroupCreated).toBe(true);
    expect(report.productsCreated).toBe(2);
    expect(report.productsSkippedExisting).toBe(0);
    expect(createdCodes).toEqual(['34_MM', '30_MM']);
    expect(prisma.product.create).toHaveBeenCalledTimes(2);
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({
      productGroupId: 'g1',
      code: '34_MM',
      name: '34 MM MDF Kasa',
      isActive: true,
    });
    expect(prisma.product.create.mock.calls[1][0].data).toMatchObject({
      productGroupId: 'g1',
      code: '30_MM',
      name: '30 MM MDF Kasa',
      isActive: true,
    });
    expect(DOOR_FRAME_PRODUCT_SEEDS).toHaveLength(2);
  });

  it('idempotent: mevcut ürünleri yeniden oluşturmaz', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          code: 'door_frame',
          name: 'Kapı Kasası',
          isActive: true,
        }),
        create: jest.fn(),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
      },
    };

    const report = await seedDoorFrameProducts(prisma as never);

    expect(report.productGroupCreated).toBe(false);
    expect(report.productsCreated).toBe(0);
    expect(report.productsSkippedExisting).toBe(2);
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.productGroup.create).not.toHaveBeenCalled();
  });
});
