import { PERVAZ_PRODUCT_SEEDS, seedPervazProducts } from './pervaz-product-seed';

describe('seedPervazProducts', () => {
  it('ilk çalışmada PERVAZ grubu ve 3 aktif ürünü ekler', async () => {
    const createdCodes: string[] = [];
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'g-pervaz',
          code: 'PERVAZ',
          name: 'Pervaz',
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

    const report = await seedPervazProducts(prisma as never);

    expect(report.productGroupCreated).toBe(true);
    expect(report.productsCreated).toBe(3);
    expect(report.productsSkippedExisting).toBe(0);
    expect(createdCodes).toEqual([
      'AYARLI_PERVAZ',
      'DEKORATIF_PERVAZ',
      'DEKORATIF_PERVAZ_GENIS_KILCIK',
    ]);
    expect(prisma.product.create).toHaveBeenCalledTimes(3);
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({
      productGroupId: 'g-pervaz',
      code: 'AYARLI_PERVAZ',
      name: 'Ayarlı Pervaz',
      isActive: true,
    });
    expect(prisma.product.create.mock.calls[1][0].data).toMatchObject({
      productGroupId: 'g-pervaz',
      code: 'DEKORATIF_PERVAZ',
      name: 'Dekoratif Pervaz',
      isActive: true,
    });
    expect(prisma.product.create.mock.calls[2][0].data).toMatchObject({
      productGroupId: 'g-pervaz',
      code: 'DEKORATIF_PERVAZ_GENIS_KILCIK',
      name: 'Dekoratif Pervaz - Geniş Kılçık',
      isActive: true,
    });
    expect(PERVAZ_PRODUCT_SEEDS).toHaveLength(3);
  });

  it('idempotent: mevcut grubu ve ürünleri yeniden oluşturmaz', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g-pervaz',
          code: 'PERVAZ',
          name: 'Pervaz',
          isActive: true,
        }),
        create: jest.fn(),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
      },
    };

    const report = await seedPervazProducts(prisma as never);

    expect(report.productGroupCreated).toBe(false);
    expect(report.productsCreated).toBe(0);
    expect(report.productsSkippedExisting).toBe(3);
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.productGroup.create).not.toHaveBeenCalled();
  });

  it('ürüne ham madde veya kalınlık bağamaz', () => {
    for (const seed of PERVAZ_PRODUCT_SEEDS) {
      expect(seed).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          name: expect.any(String),
        }),
      );
      expect(seed).not.toHaveProperty('rawMaterialId');
      expect(seed).not.toHaveProperty('thicknessMm');
    }
  });
});
