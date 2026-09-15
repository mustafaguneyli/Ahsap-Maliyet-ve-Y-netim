import {
  SUPURGELIK_PRICING_SEED,
  seedSupurgelikPricingSetting,
} from './supurgelik-pricing-seed';

const group = { id: 'group-supurgelik', code: 'SUPURGELIK', isActive: true };

function buildPrisma(options: {
  active?: unknown[];
  historyCount?: number;
  group?: typeof group | null;
} = {}) {
  const tx = {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(options.group === undefined ? group : options.group),
    },
    pricingSetting: {
      findMany: jest.fn().mockResolvedValue(options.active ?? []),
      count: jest.fn().mockResolvedValue(options.historyCount ?? 0),
      create: jest.fn().mockResolvedValue({ id: 'pricing-created' }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-created' }) },
  };
  return {
    tx,
    prisma: { $transaction: jest.fn((callback) => callback(tx)) },
  };
}

describe('SUPURGELIK_PRICING_SEED', () => {
  it('yalnız group-scope profitRate=20 tanımlar; KDV/kart alanlarını doldurmaz', () => {
    expect(SUPURGELIK_PRICING_SEED).toEqual({
      vatRate: null,
      profitRate: '20',
      cardMarkupRate: null,
      cardFixedSurchargeAmount: null,
    });
  });
});

describe('seedSupurgelikPricingSetting', () => {
  it('eksik kaydı audit ile aynı transaction içinde oluşturur', async () => {
    const { prisma, tx } = buildPrisma();

    const report = await seedSupurgelikPricingSetting(prisma as never);

    expect(report).toMatchObject({ created: 1, unchanged: 0, conflicts: [] });
    expect(tx.pricingSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productGroupId: group.id,
        productId: null,
        vatRate: null,
        cardMarkupRate: null,
        cardFixedSurchargeAmount: null,
        isActive: true,
      }),
    });
    expect(
      tx.pricingSetting.create.mock.calls[0][0].data.profitRate.toString(),
    ).toBe('20');
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'PricingSetting',
        entityId: 'pricing-created',
        action: 'CREATE',
        fieldName: 'profitRate',
        newValue: '20.0000',
      }),
    });
  });

  it('ikinci çalışmada aynı aktif kaydı değiştirmez ve duplicate oluşturmaz', async () => {
    const { prisma, tx } = buildPrisma({
      active: [
        {
          vatRate: null,
          profitRate: { toString: () => '20.0000' },
          cardMarkupRate: null,
          cardFixedSurchargeAmount: null,
        },
      ],
    });

    const report = await seedSupurgelikPricingSetting(prisma as never);

    expect(report).toMatchObject({ created: 0, unchanged: 1, conflicts: [] });
    expect(tx.pricingSetting.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('kullanıcı tarafından değiştirilmiş aktif değeri overwrite etmez', async () => {
    const { prisma, tx } = buildPrisma({
      active: [
        {
          vatRate: null,
          profitRate: { toString: () => '21' },
          cardMarkupRate: null,
          cardFixedSurchargeAmount: null,
        },
      ],
    });

    const report = await seedSupurgelikPricingSetting(prisma as never);

    expect(report.conflicts).toEqual([
      { field: 'profitRate', sourceValue: '20', existingValue: '21' },
    ]);
    expect(tx.pricingSetting.create).not.toHaveBeenCalled();
  });

  it('inactive geçmiş varsa yeni aktif kayıt açmaz', async () => {
    const { prisma, tx } = buildPrisma({ historyCount: 1 });

    const report = await seedSupurgelikPricingSetting(prisma as never);

    expect(report.inactiveHistoryPreserved).toBe(true);
    expect(tx.pricingSetting.create).not.toHaveBeenCalled();
  });

  it('duplicate aktif contexti raporlar', async () => {
    const active = {
      vatRate: null,
      profitRate: { toString: () => '20' },
      cardMarkupRate: null,
      cardFixedSurchargeAmount: null,
    };
    const { prisma, tx } = buildPrisma({ active: [active, active] });

    const report = await seedSupurgelikPricingSetting(prisma as never);

    expect(report.duplicateActive).toBe(true);
    expect(tx.pricingSetting.create).not.toHaveBeenCalled();
  });
});
