import {
  AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS,
  AYARLI_PERVAZ_CARD_SALE_UNLISTED_MEASURES,
  seedAyarliPervazCardSaleEnabled,
} from './ayarli-pervaz-card-sale-enabled-seed';

const group = { id: 'g-pervaz', code: 'PERVAZ', isActive: true };
const ayarli = { id: 'p-ayarli', code: 'AYARLI_PERVAZ', isActive: true };

function keyOf(row: { thicknessMm: number; widthMm: number; lengthMm: number }) {
  return `${row.thicknessMm}/${row.widthMm}/${row.lengthMm}`;
}

function basePrisma(activeByKey?: Record<string, { id: string; cardSaleEnabled: boolean | null }>) {
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
          const key = keyOf(where);
          return Promise.resolve(activeByKey?.[key] ?? null);
        },
      ),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('AYARLI_PERVAZ kart kapsamı master', () => {
  it('FİYAT LİSTESİ’ndeki 12 satırı içerir; liste dışı 8 satırı içermez', () => {
    expect(AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS).toHaveLength(12);
    expect(AYARLI_PERVAZ_CARD_SALE_UNLISTED_MEASURES).toHaveLength(8);
    const enabled = new Set(AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS.map(keyOf));
    for (const row of AYARLI_PERVAZ_CARD_SALE_UNLISTED_MEASURES) {
      expect(enabled.has(keyOf(row))).toBe(false);
    }
    expect(enabled.has('18/80/2200')).toBe(false);
    expect(enabled.has('16/100/2500')).toBe(false);
    expect(enabled.has('18/100/2200')).toBe(true);
  });

  it('ilk çalışmada 12 cardSaleEnabled=true kaydı oluşturur', async () => {
    const prisma = basePrisma();
    const report = await seedAyarliPervazCardSaleEnabled(prisma as never);

    expect(report.totalExpected).toBe(12);
    expect(report.created).toBe(12);
    expect(report.backfilled).toBe(0);
    expect(prisma.pricingRowException.create).toHaveBeenCalledTimes(12);
    expect(prisma.pricingRowException.create.mock.calls[0][0].data).toMatchObject({
      productId: 'p-ayarli',
      cardSaleEnabled: true,
      profitRate: null,
      adjustmentAmount: null,
    });
    const createdKeys = prisma.pricingRowException.create.mock.calls.map(
      (call: [{ data: { thicknessMm: number; widthMm: number; lengthMm: number } }]) =>
        keyOf(call[0].data),
    );
    expect(createdKeys).not.toContain('9/80/2300');
    expect(createdKeys).not.toContain('18/80/2200');
  });

  it('mevcut +1 satırına cardSaleEnabled TRUE backfill eder; duplicate oluşturmaz', async () => {
    const prisma = basePrisma({
      '18/100/2200': { id: 'ex-plus1', cardSaleEnabled: null },
    });
    const report = await seedAyarliPervazCardSaleEnabled(prisma as never);

    expect(report.backfilled).toBe(1);
    expect(report.created).toBe(11);
    expect(prisma.pricingRowException.update).toHaveBeenCalledWith({
      where: { id: 'ex-plus1' },
      data: { cardSaleEnabled: true },
    });
  });

  it('cardSaleEnabled false ise TRUE’ya çevirmez', async () => {
    const prisma = basePrisma({
      '9/70/2200': { id: 'ex-off', cardSaleEnabled: false },
    });
    const report = await seedAyarliPervazCardSaleEnabled(prisma as never);

    expect(report.conflicts).toEqual([
      {
        thicknessMm: 9,
        widthMm: 70,
        lengthMm: 2200,
        existingValue: 'false',
      },
    ]);
    expect(prisma.pricingRowException.update).not.toHaveBeenCalled();
  });

  it('TRUE kayıtları duplicate etmez', async () => {
    const already = Object.fromEntries(
      AYARLI_PERVAZ_CARD_SALE_ENABLED_SEEDS.map((row, index) => [
        keyOf(row),
        { id: `ex-${index}`, cardSaleEnabled: true as const },
      ]),
    );
    const prisma = basePrisma(already);
    const report = await seedAyarliPervazCardSaleEnabled(prisma as never);

    expect(report.unchanged).toBe(12);
    expect(report.created).toBe(0);
    expect(prisma.pricingRowException.create).not.toHaveBeenCalled();
    expect(prisma.pricingRowException.update).not.toHaveBeenCalled();
  });
});
