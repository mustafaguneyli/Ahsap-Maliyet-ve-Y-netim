import {
  PERVAZ_EXTRA_COST_SEEDS,
  PERVAZ_EXTRA_COST_TYPE_ORDER,
  seedPervazExtraCosts,
} from './pervaz-extra-cost-seed';

const group = { id: 'g-pervaz', code: 'PERVAZ', isActive: true };

function basePrisma() {
  return {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(group),
    },
    extraCostType: {
      findUnique: jest.fn().mockImplementation(({ where: { code } }: { where: { code: string } }) =>
        Promise.resolve({ id: `t-${code}`, code, isActive: true }),
      ),
    },
  };
}

describe('PERVAZ_EXTRA_COST_SEEDS', () => {
  it('yalnız CUTTING/GLUE/LABOR 4+4+4 içerir; OTHER/TOTAL/N4:N7 yok', () => {
    expect(PERVAZ_EXTRA_COST_TYPE_ORDER).toEqual(['CUTTING', 'GLUE', 'LABOR']);
    expect(PERVAZ_EXTRA_COST_SEEDS).toEqual([
      { code: 'CUTTING', amount: '4' },
      { code: 'GLUE', amount: '4' },
      { code: 'LABOR', amount: '4' },
    ]);
    const seededCodes: string[] = PERVAZ_EXTRA_COST_SEEDS.map((s) => s.code);
    expect(seededCodes).not.toContain('OTHER');
    expect(seededCodes).not.toContain('TOTAL');
  });
});

describe('seedPervazExtraCosts', () => {
  it('ilk çalışmada PERVAZ grup kapsamında 3 ExtraCostValue oluşturur', async () => {
    const prisma = {
      ...basePrisma(),
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const report = await seedPervazExtraCosts(prisma as never);

    expect(report.totalExpected).toBe(3);
    expect(report.created).toBe(3);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toEqual([]);
    expect(prisma.extraCostValue.create).toHaveBeenCalledTimes(3);
    expect(prisma.extraCostValue.create.mock.calls[0][0].data).toMatchObject({
      extraCostTypeId: 't-CUTTING',
      productGroupId: 'g-pervaz',
      productId: null,
      isActive: true,
    });
    expect(prisma.extraCostValue.create.mock.calls[0][0].data.amount.toString()).toBe('4');
    expect('create' in prisma.extraCostType).toBe(false);
  });

  it('aynı aktif değer varken duplicate oluşturmaz', async () => {
    const prisma = {
      ...basePrisma(),
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'existing',
          amount: { toString: () => '4' },
        }),
        create: jest.fn(),
      },
    };

    const report = await seedPervazExtraCosts(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(3);
    expect(report.conflicts).toEqual([]);
    expect(prisma.extraCostValue.create).not.toHaveBeenCalled();
  });

  it('kullanıcı CUTTING=6 yaptıysa seed 4’e geri çevirmez, conflict raporlar', async () => {
    const prisma = {
      ...basePrisma(),
      extraCostType: {
        findUnique: jest.fn().mockImplementation(({ where: { code } }: { where: { code: string } }) =>
          Promise.resolve({ id: `t-${code}`, code, isActive: true }),
        ),
      },
      extraCostValue: {
        findFirst: jest.fn().mockImplementation(
          ({ where }: { where: { extraCostTypeId: string } }) => {
            if (where.extraCostTypeId === 't-CUTTING') {
              return Promise.resolve({ id: 'user-cut', amount: { toString: () => '6' } });
            }
            return Promise.resolve({ id: 'ok', amount: { toString: () => '4' } });
          },
        ),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const report = await seedPervazExtraCosts(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(2);
    expect(report.conflicts).toEqual([
      { typeCode: 'CUTTING', excelAmount: '4', existingAmount: '6' },
    ]);
    expect(prisma.extraCostValue.create).not.toHaveBeenCalled();
    expect(prisma.extraCostValue.update).not.toHaveBeenCalled();
  });

  it('PERVAZ grubu yoksa create etmez, missingProductGroup raporlar', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      extraCostType: { findUnique: jest.fn() },
      extraCostValue: { create: jest.fn() },
    };

    const report = await seedPervazExtraCosts(prisma as never);

    expect(report.missingProductGroup).toBe(true);
    expect(report.created).toBe(0);
    expect(prisma.extraCostValue.create).not.toHaveBeenCalled();
  });

  it('eksik ExtraCostType için duplicate type oluşturmaz, missingTypes raporlar', async () => {
    const prisma = {
      ...basePrisma(),
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      extraCostValue: { create: jest.fn() },
    };

    const report = await seedPervazExtraCosts(prisma as never);

    expect(report.missingTypes).toEqual(['CUTTING', 'GLUE', 'LABOR']);
    expect(report.created).toBe(0);
    expect(prisma.extraCostType.create).not.toHaveBeenCalled();
    expect(prisma.extraCostValue.create).not.toHaveBeenCalled();
  });
});
