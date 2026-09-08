import {
  DEKORATIF_PERVAZ_PREMIUM_SEEDS,
  seedDekoratifPervazPricing,
} from './dekoratif-pervaz-pricing-seed';
import { seedDekoratifGenisKilcikPricing } from './dekoratif-genis-kilcik-pricing-seed';

const group = { id: 'g-pervaz', code: 'PERVAZ', isActive: true };
const dekoratif = { id: 'p-dek', code: 'DEKORATIF_PERVAZ', isActive: true };
const genis = { id: 'p-genis', code: 'DEKORATIF_PERVAZ_GENIS_KILCIK', isActive: true };

function keyOf(row: { thicknessMm: number; widthMm: number; lengthMm: number }) {
  return `${row.thicknessMm}/${row.widthMm}/${row.lengthMm}`;
}

function basePrisma(product: { id: string; code: string; isActive: boolean }, overrides?: {
  activeSetting?: unknown;
  activeByKey?: Record<string, unknown>;
}) {
  return {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(group),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
    },
    pricingSetting: {
      findFirst: jest.fn().mockResolvedValue(overrides?.activeSetting ?? null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
    pricingRowException: {
      findFirst: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: { thicknessMm: number; widthMm: number; lengthMm: number };
        }) => Promise.resolve(overrides?.activeByKey?.[keyOf(where)] ?? null),
      ),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('DEKORATIF_PERVAZ kart master', () => {
  it('6/6 doğrulanmış satır product-level cardFixedSurchargeAmount=2 kullanır; satır TRUE tekrarı yok', async () => {
    expect(DEKORATIF_PERVAZ_PREMIUM_SEEDS).toHaveLength(6);
    const prisma = basePrisma(dekoratif);
    const report = await seedDekoratifPervazPricing(prisma as never);

    expect(report.settingCreated).toBe(true);
    expect(report.premiumCreated).toBe(6);
    expect(prisma.pricingSetting.create.mock.calls[0][0].data).toMatchObject({
      productId: 'p-dek',
      vatRate: null,
      cardMarkupRate: null,
    });
    expect(
      prisma.pricingSetting.create.mock.calls[0][0].data.profitRate.toString(),
    ).toBe('15');
    expect(
      prisma.pricingSetting.create.mock.calls[0][0].data.cardFixedSurchargeAmount.toString(),
    ).toBe('2');

    for (const call of prisma.pricingRowException.create.mock.calls) {
      expect(call[0].data.cardSaleEnabled).toBeUndefined();
      expect(call[0].data.decorativePremiumRate).toBeDefined();
    }
  });

  it('mevcut profit korunarak null cardFixedSurchargeAmount=2 backfill eder', async () => {
    const prisma = basePrisma(dekoratif, {
      activeSetting: {
        id: 'ps-dek',
        profitRate: { toString: () => '15' },
        vatRate: null,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: null,
      },
      activeByKey: Object.fromEntries(
        DEKORATIF_PERVAZ_PREMIUM_SEEDS.map((row) => [
          keyOf(row),
          {
            decorativePremiumRate: { toString: () => row.rate },
            profitRate: null,
            adjustmentAmount: null,
          },
        ]),
      ),
    });
    const report = await seedDekoratifPervazPricing(prisma as never);

    expect(report.cardFixedBackfilled).toBe(true);
    expect(report.premiumUnchanged).toBe(6);
    expect(
      prisma.pricingSetting.create.mock.calls[0][0].data.profitRate.toString(),
    ).toBe('15');
    expect(
      prisma.pricingSetting.create.mock.calls[0][0].data.cardFixedSurchargeAmount.toString(),
    ).toBe('2');
  });

  it('kullanıcı cardFixedSurchargeAmount=3 yaptıysa seed 2’ye çevirmez', async () => {
    const prisma = basePrisma(dekoratif, {
      activeSetting: {
        id: 'ps-user',
        profitRate: { toString: () => '15' },
        vatRate: null,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: { toString: () => '3' },
      },
    });
    const report = await seedDekoratifPervazPricing(prisma as never);

    expect(report.conflicts).toBe(1);
    expect(report.cardFixedBackfilled).toBe(false);
    expect(prisma.pricingSetting.create).not.toHaveBeenCalled();
  });
});

describe('DEKORATIF_PERVAZ_GENIS_KILCIK kart master', () => {
  it('doğrulanmış cardFixedSurchargeAmount yazmaz', async () => {
    const prisma = basePrisma(genis);
    const report = await seedDekoratifGenisKilcikPricing(prisma as never);

    expect(report.settingCreated).toBe(true);
    expect(prisma.pricingSetting.create.mock.calls[0][0].data).toMatchObject({
      productId: 'p-genis',
      cardMarkupRate: null,
      cardFixedSurchargeAmount: null,
    });
    expect(
      prisma.pricingSetting.create.mock.calls[0][0].data.profitRate.toString(),
    ).toBe('15');
  });

  it('mevcut profit=15 ve cardFixed null iken 2 uydurmaz', async () => {
    const prisma = basePrisma(genis, {
      activeSetting: {
        id: 'ps-genis',
        profitRate: { toString: () => '15' },
        vatRate: null,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: null,
      },
    });
    const report = await seedDekoratifGenisKilcikPricing(prisma as never);

    expect(report.settingUnchanged).toBe(true);
    expect(report.cardFixedBackfilled).toBe(false);
    expect(prisma.pricingSetting.create).not.toHaveBeenCalled();
    expect(prisma.pricingSetting.update).not.toHaveBeenCalled();
  });
});
