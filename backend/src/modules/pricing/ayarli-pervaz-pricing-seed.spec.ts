import {
  AYARLI_PERVAZ_PRICING_SEED,
  seedAyarliPervazPricingSettings,
} from './ayarli-pervaz-pricing-seed';

const group = { id: 'g-pervaz', code: 'PERVAZ', isActive: true };
const ayarli = { id: 'p-ayarli', code: 'AYARLI_PERVAZ', isActive: true };

function basePrisma(overrides?: {
  group?: typeof group | null;
  product?: typeof ayarli | null;
  active?: unknown;
}) {
  return {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(overrides?.group === undefined ? group : overrides.group),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue(
        overrides?.product === undefined ? ayarli : overrides.product,
      ),
    },
    pricingSetting: {
      findFirst: jest.fn().mockResolvedValue(overrides?.active ?? null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
  };
}

describe('AYARLI_PERVAZ_PRICING_SEED', () => {
  it('profitRate=15; vatRate ve cardMarkupRate null; cardFixedSurchargeAmount=2', () => {
    expect(AYARLI_PERVAZ_PRICING_SEED).toEqual({
      profitRate: '15',
      vatRate: null,
      cardMarkupRate: null,
      cardFixedSurchargeAmount: '2',
    });
  });
});

describe('seedAyarliPervazPricingSettings', () => {
  it('aktif kayıt yoksa AYARLI_PERVAZ product-level profitRate=15 oluşturur', async () => {
    const prisma = basePrisma();

    const report = await seedAyarliPervazPricingSettings(prisma as never);

    expect(report.created).toBe(1);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toEqual([]);
    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: {
        productGroupId_code: {
          productGroupId: 'g-pervaz',
          code: 'AYARLI_PERVAZ',
        },
      },
    });
    expect(prisma.pricingSetting.create).toHaveBeenCalledTimes(1);
    expect(prisma.pricingSetting.create.mock.calls[0][0].data).toMatchObject({
      productGroupId: null,
      productId: 'p-ayarli',
      vatRate: null,
      cardMarkupRate: null,
      isActive: true,
    });
    expect(prisma.pricingSetting.create.mock.calls[0][0].data.profitRate.toString()).toBe('15');
    expect(
      prisma.pricingSetting.create.mock.calls[0][0].data.cardFixedSurchargeAmount.toString(),
    ).toBe('2');
    expect(prisma.pricingSetting.update).not.toHaveBeenCalled();
  });

  it('aynı aktif değer varken duplicate oluşturmaz', async () => {
    const prisma = basePrisma({
      active: {
        id: 'ps-ayarli',
        profitRate: { toString: () => '15' },
        vatRate: null,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: { toString: () => '2' },
        isActive: true,
      },
    });

    const report = await seedAyarliPervazPricingSettings(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(1);
    expect(report.conflicts).toEqual([]);
    expect(prisma.pricingSetting.create).not.toHaveBeenCalled();
    expect(prisma.pricingSetting.update).not.toHaveBeenCalled();
  });

  it('kullanıcı profitRate=17 yaptıysa seed 15’e geri çevirmez, conflict raporlar', async () => {
    const prisma = basePrisma({
      active: {
        id: 'ps-user',
        profitRate: { toString: () => '17' },
        vatRate: null,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: { toString: () => '2' },
        isActive: true,
      },
    });

    const report = await seedAyarliPervazPricingSettings(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toEqual([
      { field: 'profitRate', seedValue: '15', existingValue: '17' },
    ]);
    expect(prisma.pricingSetting.create).not.toHaveBeenCalled();
    expect(prisma.pricingSetting.update).not.toHaveBeenCalled();
  });

  it('cardFixedSurchargeAmount null ise profit korunarak 2 backfill eder', async () => {
    const prisma = basePrisma({
      active: {
        id: 'ps-old',
        profitRate: { toString: () => '15' },
        vatRate: null,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: null,
        isActive: true,
      },
    });

    const report = await seedAyarliPervazPricingSettings(prisma as never);

    expect(report.cardFixedBackfilled).toBe(1);
    expect(report.created).toBe(0);
    expect(prisma.pricingSetting.update).toHaveBeenCalledWith({
      where: { id: 'ps-old' },
      data: { isActive: false },
    });
    expect(
      prisma.pricingSetting.create.mock.calls[0][0].data.cardFixedSurchargeAmount.toString(),
    ).toBe('2');
    expect(prisma.pricingSetting.create.mock.calls[0][0].data.profitRate.toString()).toBe(
      '15',
    );
  });

  it('kullanıcı cardFixedSurchargeAmount=3 yaptıysa seed 2’ye çevirmez', async () => {
    const prisma = basePrisma({
      active: {
        id: 'ps-user-card',
        profitRate: { toString: () => '15' },
        vatRate: null,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: { toString: () => '3' },
        isActive: true,
      },
    });

    const report = await seedAyarliPervazPricingSettings(prisma as never);

    expect(report.created).toBe(0);
    expect(report.cardFixedBackfilled).toBe(0);
    expect(report.conflicts).toEqual([
      {
        field: 'cardFixedSurchargeAmount',
        seedValue: '2',
        existingValue: '3',
      },
    ]);
    expect(prisma.pricingSetting.create).not.toHaveBeenCalled();
  });

  it('PERVAZ grubu veya AYARLI_PERVAZ yoksa create etmez', async () => {
    const missingGroup = await seedAyarliPervazPricingSettings(
      basePrisma({ group: null }) as never,
    );
    expect(missingGroup.missingProductGroup).toBe(true);
    expect(missingGroup.created).toBe(0);

    const missingProductPrisma = basePrisma({ product: null });
    const missingProduct = await seedAyarliPervazPricingSettings(missingProductPrisma as never);
    expect(missingProduct.missingProduct).toBe(true);
    expect(missingProduct.created).toBe(0);
    expect(missingProductPrisma.pricingSetting.create).not.toHaveBeenCalled();
  });

  it('yalnız AYARLI_PERVAZ ürün kodunu arar; Dekoratif ürün seed etmez', async () => {
    const prisma = basePrisma();
    await seedAyarliPervazPricingSettings(prisma as never);

    const codes = prisma.product.findUnique.mock.calls.map(
      (call: [{ where: { productGroupId_code: { code: string } } }]) =>
        call[0].where.productGroupId_code.code,
    );
    expect(codes).toEqual(['AYARLI_PERVAZ']);
    expect(codes).not.toContain('DEKORATIF_PERVAZ');
    expect(codes).not.toContain('DEKORATIF_PERVAZ_GENIS_KILCIK');
  });
});
