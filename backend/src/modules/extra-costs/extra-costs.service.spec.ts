import { BadRequestException } from '@nestjs/common';
import { ExtraCostsService } from './extra-costs.service';
import { DOOR_FRAME_EXTRA_COST_SEEDS } from './door-frame-extra-cost-seed';
import { PERVAZ_EXTRA_COST_SEEDS } from './pervaz-extra-cost-seed';

describe('ExtraCostsService', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  const group = {
    id: 'group-1',
    code: 'door_frame',
    name: 'Kapı Kasası',
    isActive: true,
  };

  const typeDefs = DOOR_FRAME_EXTRA_COST_SEEDS.map((s, i) => ({
    id: `type-${s.code}`,
    code: s.code,
    name: s.name,
    isActive: true,
    values: [
      {
        id: `val-${s.code}`,
        amount: { toString: () => s.amount },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ],
  }));

  it('Kapı Kasası için 4 kalem ve toplam 33.5 döner', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(typeDefs),
      },
    };
    const audit = { record: jest.fn() };
    const service = new ExtraCostsService(prisma as never, audit as never);

    const result = await service.listForProductGroup('door_frame', now);

    expect(result.items).toHaveLength(4);
    expect(result.items.map((i) => i.typeCode)).toEqual([
      'CUTTING',
      'GLUE',
      'LABOR',
      'OTHER',
    ]);
    expect(result.items[0].amount).toBe('8');
    expect(result.items[1].amount).toBe('3.5');
    expect(result.items[2].amount).toBe('17');
    expect(result.items[3].amount).toBe('5');
    expect(result.totalAmount).toBe('33.5');
  });

  it('8→10 güncellemesinde eski dönem kapanır, yeni kayıt ve audit yazılır', async () => {
    const openCutting = {
      id: 'val-CUTTING',
      amount: { toString: () => '8' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };

    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
      },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-CUTTING',
          code: 'CUTTING',
          name: 'Kesim',
          isActive: true,
        }),
      },
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue(openCutting),
        update: jest.fn().mockResolvedValue({
          ...openCutting,
          effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
        }),
        create: jest.fn().mockResolvedValue({
          id: 'val-CUTTING-new',
          amount: { toString: () => '10' },
          effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
          effectiveTo: null,
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(
          typeDefs.map((t) =>
            t.code === 'CUTTING'
              ? {
                  ...t,
                  values: [
                    {
                      ...openCutting,
                      effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
                    },
                    {
                      id: 'val-CUTTING-new',
                      amount: { toString: () => '10' },
                      effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
                      effectiveTo: null,
                      isActive: true,
                    },
                  ],
                }
              : t,
          ),
        ),
      },
    };

    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    const result = await service.updateValue('CUTTING', {
      productGroup: 'door_frame',
      amount: '10',
      effectiveFrom: '2026-09-04',
    });

    expect(tx.extraCostValue.update).toHaveBeenCalledWith({
      where: { id: 'val-CUTTING' },
      data: { effectiveTo: new Date('2026-09-04T00:00:00.000Z') },
    });
    expect(tx.extraCostValue.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls[0][0].action).toBe('UPDATE');
    expect(audit.record.mock.calls[1][0].action).toBe('CREATE');
    expect(audit.record.mock.calls[1][0].oldValue).toBe('8');
    expect(audit.record.mock.calls[1][0].newValue).toBe('10.0000');

    const cutting = result.items.find((i) => i.typeCode === 'CUTTING')!;
    expect(cutting.amount).toBe('10');
    expect(result.totalAmount).toBe('35.5');
  });

  it('gelecek tarihli 10 bugünkü listede aktif olmaz', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(
          typeDefs.map((t) =>
            t.code === 'CUTTING'
              ? {
                  ...t,
                  values: [
                    {
                      id: 'val-old',
                      amount: { toString: () => '8' },
                      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
                      effectiveTo: new Date('2026-12-01T00:00:00.000Z'),
                      isActive: true,
                    },
                    {
                      id: 'val-future',
                      amount: { toString: () => '10' },
                      effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
                      effectiveTo: null,
                      isActive: true,
                    },
                  ],
                }
              : t,
          ),
        ),
      },
    };
    const service = new ExtraCostsService(prisma as never, { record: jest.fn() } as never);
    const result = await service.listForProductGroup('door_frame', now);
    expect(result.items[0].amount).toBe('8');
    expect(result.totalAmount).toBe('33.5');
  });

  const pervazGroup = {
    id: 'group-pervaz',
    code: 'PERVAZ',
    name: 'Pervaz',
    isActive: true,
  };

  const pervazTypeDefs = PERVAZ_EXTRA_COST_SEEDS.map((s) => ({
    id: `type-${s.code}`,
    code: s.code,
    name: s.code === 'CUTTING' ? 'Kesim' : s.code === 'GLUE' ? 'Tutkal' : 'İşçilik',
    isActive: true,
    values: [
      {
        id: `pervaz-val-${s.code}`,
        amount: { toString: () => s.amount },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ],
  }));

  it('PERVAZ için 3 kalem DB’den gelir, toplam Decimal 4+4+4=12, OTHER yok', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(pervazGroup),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(pervazTypeDefs),
      },
    };
    const service = new ExtraCostsService(prisma as never, { record: jest.fn() } as never);

    const result = await service.listForProductGroup('PERVAZ', now);

    expect(result.productGroupCode).toBe('PERVAZ');
    expect(result.items).toHaveLength(3);
    expect(result.items.map((i) => i.typeCode)).toEqual(['CUTTING', 'GLUE', 'LABOR']);
    expect(result.items.map((i) => i.amount)).toEqual(['4', '4', '4']);
    expect(result.totalAmount).toBe('12');
    expect(result.items.some((i) => i.typeCode === 'OTHER' || i.typeCode === 'TOTAL')).toBe(
      false,
    );
    expect(prisma.extraCostType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: { in: ['CUTTING', 'GLUE', 'LABOR'] },
        }),
      }),
    );
  });

  it('aynı ExtraCostType iki ProductGroup’ta bağımsız değerlere sahip olabilir', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockImplementation(({ where: { code } }: { where: { code: string } }) =>
          Promise.resolve(code === 'door_frame' ? group : pervazGroup),
        ),
      },
      extraCostType: {
        findMany: jest.fn().mockImplementation(
          ({ where }: { where: { code: { in: string[] } } }) => {
            const codes = where.code.in;
            if (codes.includes('OTHER')) {
              return Promise.resolve(typeDefs);
            }
            return Promise.resolve(pervazTypeDefs);
          },
        ),
      },
    };
    const service = new ExtraCostsService(prisma as never, { record: jest.fn() } as never);

    const door = await service.listForProductGroup('door_frame', now);
    const pervaz = await service.listForProductGroup('PERVAZ', now);

    expect(door.items.find((i) => i.typeCode === 'CUTTING')?.amount).toBe('8');
    expect(pervaz.items.find((i) => i.typeCode === 'CUTTING')?.amount).toBe('4');
    expect(door.totalAmount).toBe('33.5');
    expect(pervaz.totalAmount).toBe('12');
  });

  it('PERVAZ CUTTING 4→6 güncellemesinde eski dönem kapanır, yeni kayıt ve audit yazılır', async () => {
    const openCutting = {
      id: 'pervaz-val-CUTTING',
      amount: { toString: () => '4' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };

    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(pervazGroup),
      },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-CUTTING',
          code: 'CUTTING',
          name: 'Kesim',
          isActive: true,
        }),
      },
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue(openCutting),
        update: jest.fn().mockResolvedValue({
          ...openCutting,
          effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
        }),
        create: jest.fn().mockResolvedValue({
          id: 'pervaz-val-CUTTING-new',
          amount: { toString: () => '6' },
          effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
          effectiveTo: null,
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(pervazGroup),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(
          pervazTypeDefs.map((t) =>
            t.code === 'CUTTING'
              ? {
                  ...t,
                  values: [
                    {
                      ...openCutting,
                      effectiveTo: new Date('2026-09-04T00:00:00.000Z'),
                    },
                    {
                      id: 'pervaz-val-CUTTING-new',
                      amount: { toString: () => '6' },
                      effectiveFrom: new Date('2026-09-04T00:00:00.000Z'),
                      effectiveTo: null,
                      isActive: true,
                    },
                  ],
                }
              : t,
          ),
        ),
      },
    };

    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    const result = await service.updateValue('CUTTING', {
      productGroup: 'PERVAZ',
      amount: '6',
      effectiveFrom: '2026-09-04',
    });

    expect(tx.extraCostValue.update).toHaveBeenCalledWith({
      where: { id: 'pervaz-val-CUTTING' },
      data: { effectiveTo: new Date('2026-09-04T00:00:00.000Z') },
    });
    expect(tx.extraCostValue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          extraCostTypeId: 'type-CUTTING',
          productGroupId: 'group-pervaz',
          productId: null,
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls[0][0].action).toBe('UPDATE');
    expect(audit.record.mock.calls[1][0].action).toBe('CREATE');
    expect(audit.record.mock.calls[1][0].oldValue).toBe('4');
    expect(audit.record.mock.calls[1][0].newValue).toBe('6.0000');
    expect(audit.record.mock.calls[1][0].reason).toContain('PERVAZ');

    expect(result.items.find((i) => i.typeCode === 'CUTTING')?.amount).toBe('6');
    expect(result.totalAmount).toBe('14');
  });

  it('PERVAZ için OTHER typeCode reddedilir', async () => {
    const service = new ExtraCostsService(
      { $transaction: jest.fn() } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.updateValue('OTHER', {
        productGroup: 'PERVAZ',
        amount: '1',
        effectiveFrom: '2026-09-04',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('AYARLI_PERVAZ product-level extra cost scope kabul edilmez', async () => {
    const service = new ExtraCostsService({} as never, { record: jest.fn() } as never);

    await expect(service.listForProductGroup('AYARLI_PERVAZ', now)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
