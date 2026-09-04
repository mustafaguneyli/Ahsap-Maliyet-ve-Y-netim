import {
  DOOR_FRAME_EXTRA_COST_SEEDS,
  seedDoorFrameExtraCosts,
} from './door-frame-extra-cost-seed';

describe('seedDoorFrameExtraCosts', () => {
  it('idempotent: mevcut değer varken yeniden seed etmez / eski değere döndürmez', async () => {
    const group = { id: 'g1', code: 'door_frame', name: 'Kapı Kasası', isActive: true };
    const types = DOOR_FRAME_EXTRA_COST_SEEDS.map((s) => ({
      id: `t-${s.code}`,
      code: s.code,
      name: s.name,
    }));

    let valueCreateCalls = 0;
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
        create: jest.fn(),
      },
      extraCostType: {
        findUnique: jest.fn().mockImplementation(({ where: { code } }: { where: { code: string } }) =>
          Promise.resolve(types.find((t) => t.code === code) ?? null),
        ),
        create: jest.fn(),
      },
      extraCostValue: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation(() => {
          valueCreateCalls += 1;
          return Promise.resolve({});
        }),
      },
    };

    const report = await seedDoorFrameExtraCosts(prisma as never);

    expect(report.valuesCreated).toBe(0);
    expect(report.valuesSkippedExisting).toBe(4);
    expect(valueCreateCalls).toBe(0);
    expect(prisma.extraCostValue.create).not.toHaveBeenCalled();
  });

  it('ilk çalışmada tip ve değerleri oluşturur', async () => {
    const createdTypes = new Map<string, { id: string; code: string; name: string }>();
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
      extraCostType: {
        findUnique: jest.fn().mockImplementation(({ where: { code } }: { where: { code: string } }) =>
          Promise.resolve(createdTypes.get(code) ?? null),
        ),
        create: jest.fn().mockImplementation(({ data }: { data: { code: string; name: string } }) => {
          const row = { id: `t-${data.code}`, code: data.code, name: data.name };
          createdTypes.set(data.code, row);
          return Promise.resolve(row);
        }),
      },
      extraCostValue: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const report = await seedDoorFrameExtraCosts(prisma as never);

    expect(report.productGroupCreated).toBe(true);
    expect(report.typesCreated).toBe(4);
    expect(report.valuesCreated).toBe(4);
    expect(prisma.extraCostValue.create).toHaveBeenCalledTimes(4);
  });
});
