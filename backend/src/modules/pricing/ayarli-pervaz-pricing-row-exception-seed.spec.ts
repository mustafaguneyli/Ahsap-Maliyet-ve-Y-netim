import {
  AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS,
  seedAyarliPervazPricingRowExceptions,
} from './ayarli-pervaz-pricing-row-exception-seed';

const group = { id: 'g-pervaz', code: 'PERVAZ', isActive: true };
const ayarli = { id: 'p-ayarli', code: 'AYARLI_PERVAZ', isActive: true };

function basePrisma(activeByKey?: Record<string, unknown>) {
  return {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(group),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue(ayarli),
    },
    pricingRowException: {
      findFirst: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: { thicknessMm: number; widthMm: number; lengthMm: number };
        }) => {
          const key = `${where.thicknessMm}/${where.widthMm}/${where.lengthMm}`;
          return Promise.resolve(activeByKey?.[key] ?? null);
        },
      ),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
  };
}

describe('AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS', () => {
  it('yalnız 3 istisna içerir; default %15 yoktur', () => {
    expect(AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS).toHaveLength(3);
    expect(AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS).toEqual([
      {
        thicknessMm: 16,
        widthMm: 100,
        lengthMm: 2500,
        profitRate: '20',
        adjustmentAmount: null,
      },
      {
        thicknessMm: 18,
        widthMm: 100,
        lengthMm: 2200,
        profitRate: null,
        adjustmentAmount: '1',
      },
      {
        thicknessMm: 18,
        widthMm: 80,
        lengthMm: 2200,
        profitRate: null,
        adjustmentAmount: '1',
      },
    ]);
    const profitRates: Array<string | null> = AYARLI_PERVAZ_PRICING_ROW_EXCEPTION_SEEDS.map(
      (s) => s.profitRate,
    );
    expect(profitRates).not.toContain('15');
  });
});

describe('seedAyarliPervazPricingRowExceptions', () => {
  it('ilk çalışmada 3 exception oluşturur; Decimal alanlar doğru', async () => {
    const prisma = basePrisma();
    const report = await seedAyarliPervazPricingRowExceptions(prisma as never);

    expect(report.totalExpected).toBe(3);
    expect(report.created).toBe(3);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toEqual([]);
    expect(prisma.pricingRowException.create).toHaveBeenCalledTimes(3);

    const first = prisma.pricingRowException.create.mock.calls[0][0].data;
    expect(first).toMatchObject({
      productId: 'p-ayarli',
      thicknessMm: 16,
      widthMm: 100,
      lengthMm: 2500,
      adjustmentAmount: null,
      isActive: true,
      effectiveTo: null,
    });
    expect(first.profitRate.toString()).toBe('20');

    const second = prisma.pricingRowException.create.mock.calls[1][0].data;
    expect(second.profitRate).toBeNull();
    expect(second.adjustmentAmount.toString()).toBe('1');
    expect(second).toMatchObject({ thicknessMm: 18, widthMm: 100, lengthMm: 2200 });

    const third = prisma.pricingRowException.create.mock.calls[2][0].data;
    expect(third.profitRate).toBeNull();
    expect(third.adjustmentAmount.toString()).toBe('1');
    expect(third).toMatchObject({ thicknessMm: 18, widthMm: 80, lengthMm: 2200 });
  });

  it('aynı aktif değer varken duplicate oluşturmaz', async () => {
    const prisma = basePrisma({
      '16/100/2500': {
        profitRate: { toString: () => '20' },
        adjustmentAmount: null,
      },
      '18/100/2200': {
        profitRate: null,
        adjustmentAmount: { toString: () => '1' },
      },
      '18/80/2200': {
        profitRate: null,
        adjustmentAmount: { toString: () => '1' },
      },
    });

    const report = await seedAyarliPervazPricingRowExceptions(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(3);
    expect(report.conflicts).toEqual([]);
    expect(prisma.pricingRowException.create).not.toHaveBeenCalled();
    expect(prisma.pricingRowException.update).not.toHaveBeenCalled();
  });

  it('kullanıcı 16/100/2500 profitRate=25 yaptıysa seed 20’ye geri çevirmez', async () => {
    const prisma = basePrisma({
      '16/100/2500': {
        profitRate: { toString: () => '25' },
        adjustmentAmount: null,
      },
      '18/100/2200': {
        profitRate: null,
        adjustmentAmount: { toString: () => '1' },
      },
      '18/80/2200': {
        profitRate: null,
        adjustmentAmount: { toString: () => '1' },
      },
    });

    const report = await seedAyarliPervazPricingRowExceptions(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(2);
    expect(report.conflicts).toEqual([
      {
        thicknessMm: 16,
        widthMm: 100,
        lengthMm: 2500,
        field: 'profitRate',
        seedValue: '20',
        existingValue: '25',
      },
    ]);
    expect(prisma.pricingRowException.create).not.toHaveBeenCalled();
    expect(prisma.pricingRowException.update).not.toHaveBeenCalled();
  });

  it('yalnız AYARLI_PERVAZ arar; Dekoratif seed etmez', async () => {
    const prisma = basePrisma();
    await seedAyarliPervazPricingRowExceptions(prisma as never);
    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: {
        productGroupId_code: {
          productGroupId: 'g-pervaz',
          code: 'AYARLI_PERVAZ',
        },
      },
    });
  });
});
