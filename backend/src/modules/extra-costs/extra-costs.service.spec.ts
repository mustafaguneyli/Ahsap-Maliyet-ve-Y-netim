import { ExtraCostsService } from './extra-costs.service';
import { DOOR_FRAME_EXTRA_COST_SEEDS } from './door-frame-extra-cost-seed';

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
});
