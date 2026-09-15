import {
  SUPURGELIK_EXTRA_COST_SEEDS,
  SUPURGELIK_EXTRA_COST_TYPE_ORDER,
  SUPURGELIK_PP_WRAPPING_TYPE_CODE,
  seedSupurgelikExtraCosts,
  seedSupurgelikPpWrappingType,
} from './supurgelik-extra-cost-seed';

const group = { id: 'g-supurgelik', code: 'SUPURGELIK', isActive: true };

function buildPrisma(activeByCode: Record<string, Array<{ id: string; amount: string }>>) {
  const tx = {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(group),
    },
    extraCostType: {
      findUnique: jest.fn().mockImplementation(({ where: { code } }) =>
        Promise.resolve({ id: `t-${code}`, code, isActive: true }),
      ),
    },
    extraCostValue: {
      findMany: jest.fn().mockImplementation(({ where: { extraCostTypeId } }) => {
        const code = extraCostTypeId.replace('t-', '');
        return Promise.resolve(
          (activeByCode[code] ?? []).map((row) => ({
            ...row,
            amount: { toString: () => row.amount },
          })),
        );
      }),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: `created-${data.extraCostTypeId}`, ...data }),
      ),
      update: jest.fn(),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return { prisma, tx };
}

describe('SUPURGELIK_EXTRA_COST_SEEDS', () => {
  it('Excel kaynağındaki yalnız KESİM=4 ve İŞÇİLİK=12 değerlerini içerir', () => {
    expect(SUPURGELIK_EXTRA_COST_TYPE_ORDER).toEqual(['CUTTING', 'LABOR']);
    expect(SUPURGELIK_EXTRA_COST_SEEDS).toEqual([
      { code: 'CUTTING', amount: '4' },
      { code: 'LABOR', amount: '12' },
    ]);
    expect(SUPURGELIK_EXTRA_COST_SEEDS.map((seed) => seed.code)).not.toEqual(
      expect.arrayContaining(['GLUE', 'OTHER', 'TOTAL', 'PP_WRAPPING']),
    );
  });
});

describe('seedSupurgelikExtraCosts', () => {
  it('ilk çalışmada iki group-scope değer ve aynı transactionda audit oluşturur', async () => {
    const { prisma, tx } = buildPrisma({});

    const report = await seedSupurgelikExtraCosts(prisma as never);

    expect(report).toMatchObject({
      created: 2,
      unchanged: 0,
      conflicts: [],
      duplicateActiveTypes: [],
      totalExpected: 2,
    });
    expect(tx.extraCostValue.create).toHaveBeenCalledTimes(2);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(2);
    for (const call of tx.extraCostValue.create.mock.calls) {
      expect(call[0].data).toMatchObject({
        productGroupId: group.id,
        productId: null,
        isActive: true,
      });
    }
    expect(tx.auditEvent.create.mock.calls[0][0].data).toMatchObject({
      entityType: 'ExtraCostValue',
      action: 'CREATE',
      newValue: '4.0000',
      actor: 'local-admin',
    });
  });

  it('ikinci çalışmada aynı aktif değerleri reuse eder ve duplicate oluşturmaz', async () => {
    const { prisma, tx } = buildPrisma({
      CUTTING: [{ id: 'cut', amount: '4.0000' }],
      LABOR: [{ id: 'labor', amount: '12.0000' }],
    });

    const report = await seedSupurgelikExtraCosts(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(2);
    expect(report.conflicts).toEqual([]);
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('kullanıcı değerini overwrite etmez; farklı değeri conflict raporlar', async () => {
    const { prisma, tx } = buildPrisma({
      CUTTING: [{ id: 'cut-user', amount: '6' }],
      LABOR: [{ id: 'labor', amount: '12' }],
    });

    const report = await seedSupurgelikExtraCosts(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(1);
    expect(report.conflicts).toEqual([
      { typeCode: 'CUTTING', sourceAmount: '4', existingAmount: '6' },
    ]);
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
    expect(tx.extraCostValue.update).not.toHaveBeenCalled();
  });

  it('aynı contextte duplicate aktif açık değer varsa yazmaz ve açıkça raporlar', async () => {
    const { prisma, tx } = buildPrisma({
      CUTTING: [
        { id: 'cut-1', amount: '4' },
        { id: 'cut-2', amount: '4' },
      ],
      LABOR: [{ id: 'labor', amount: '12' }],
    });

    const report = await seedSupurgelikExtraCosts(prisma as never);

    expect(report.duplicateActiveTypes).toEqual(['CUTTING']);
    expect(report.unchanged).toBe(1);
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
  });
});

describe('seedSupurgelikPpWrappingType', () => {
  it('yalnız ExtraCostType oluşturur; ExtraCostValue yazmaz', async () => {
    const extraCostType = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'type-PP_WRAPPING',
        code: SUPURGELIK_PP_WRAPPING_TYPE_CODE,
      }),
    };
    const extraCostValue = { create: jest.fn() };
    const prisma = { extraCostType, extraCostValue };

    const report = await seedSupurgelikPpWrappingType(prisma as never);

    expect(report.created).toBe(true);
    expect(extraCostType.create).toHaveBeenCalledWith({
      data: {
        code: 'PP_WRAPPING',
        name: 'PP Sarma',
        isActive: true,
      },
    });
    expect(extraCostValue.create).not.toHaveBeenCalled();
  });

  it('mevcut tipi atlar ve değer oluşturmaz', async () => {
    const extraCostType = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'type-PP_WRAPPING',
        code: SUPURGELIK_PP_WRAPPING_TYPE_CODE,
      }),
      create: jest.fn(),
    };
    const extraCostValue = { create: jest.fn() };
    const prisma = { extraCostType, extraCostValue };

    const report = await seedSupurgelikPpWrappingType(prisma as never);

    expect(report.created).toBe(false);
    expect(extraCostType.create).not.toHaveBeenCalled();
    expect(extraCostValue.create).not.toHaveBeenCalled();
  });
});
