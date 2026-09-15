import { BadRequestException } from '@nestjs/common';
import { ExtraCostsService } from './extra-costs.service';
import { DOOR_FRAME_EXTRA_COST_SEEDS } from './door-frame-extra-cost-seed';
import { PERVAZ_EXTRA_COST_SEEDS } from './pervaz-extra-cost-seed';
import { SUPURGELIK_EXTRA_COST_SEEDS } from './supurgelik-extra-cost-seed';

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

  const supurgelikGroup = {
    id: 'group-supurgelik',
    code: 'SUPURGELIK',
    name: 'Süpürgelik',
    isActive: true,
  };

  const supurgelikTypeDefs = SUPURGELIK_EXTRA_COST_SEEDS.map((seed) => ({
    id: `type-${seed.code}`,
    code: seed.code,
    name: seed.code === 'CUTTING' ? 'Kesim' : 'İşçilik',
    isActive: true,
    values: [
      {
        id: `supurgelik-value-${seed.code}`,
        amount: { toString: () => seed.amount },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ],
  }));

  it('SUPURGELIK için yalnız aktif group-scope CUTTING/LABOR toplamı 16 döner', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(supurgelikTypeDefs),
      },
    };
    const service = new ExtraCostsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    const result = await service.listForProductGroup('SUPURGELIK', now);

    expect(result.items.map((item) => item.typeCode)).toEqual(['CUTTING', 'LABOR']);
    expect(result.items.map((item) => item.amount)).toEqual(['4', '12']);
    expect(result.totalAmount).toBe('16');
    expect(prisma.extraCostType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          values: expect.objectContaining({
            where: expect.objectContaining({
              productGroupId: supurgelikGroup.id,
              productId: null,
              isActive: true,
            }),
          }),
        }),
      }),
    );
  });

  it('SUPURGELIK için inactive geçmişi toplama katmaz', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(
          supurgelikTypeDefs.map((type) => ({
            ...type,
            values: [
              ...type.values,
              {
                id: `inactive-${type.code}`,
                amount: { toString: () => '999' },
                effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
                effectiveTo: null,
                isActive: false,
              },
            ],
          })),
        ),
      },
    };
    const service = new ExtraCostsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    const result = await service.listForProductGroup('SUPURGELIK', now);

    expect(result.totalAmount).toBe('16');
    expect(result.items.map((item) => item.amount)).toEqual(['4', '12']);
  });

  it('SUPURGELIK aynı cost contextte iki geçerli aktif değer varsa açık hata verir', async () => {
    const duplicateCutting = {
      ...supurgelikTypeDefs[0],
      values: [
        ...supurgelikTypeDefs[0].values,
        {
          id: 'duplicate-current-cutting',
          amount: { toString: () => '5' },
          effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
          effectiveTo: null,
          isActive: true,
        },
      ],
    };
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue([
          duplicateCutting,
          supurgelikTypeDefs[1],
        ]),
      },
    };
    const service = new ExtraCostsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(service.listForProductGroup('SUPURGELIK', now)).rejects.toThrow(
      'birden fazla aktif ExtraCostValue',
    );
  });

  it('SUPURGELIK yalnız CUTTING/LABOR güncellemesine izin verir', async () => {
    const service = new ExtraCostsService(
      { $transaction: jest.fn() } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.updateValue('GLUE', {
        productGroup: 'SUPURGELIK',
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

  it('SUPURGELIK CUTTING 4→5 group-scope history + audit yazar; productId null kalır', async () => {
    const openCutting = {
      id: 'supurgelik-value-CUTTING',
      amount: { toString: () => '4' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };

    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
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
          effectiveTo: new Date('2026-09-14T00:00:00.000Z'),
        }),
        create: jest.fn().mockResolvedValue({
          id: 'supurgelik-value-CUTTING-new',
          amount: { toString: () => '5' },
          effectiveFrom: new Date('2026-09-14T00:00:00.000Z'),
          effectiveTo: null,
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(
          supurgelikTypeDefs.map((type) =>
            type.code === 'CUTTING'
              ? {
                  ...type,
                  values: [
                    {
                      ...openCutting,
                      effectiveTo: new Date('2026-09-14T00:00:00.000Z'),
                    },
                    {
                      id: 'supurgelik-value-CUTTING-new',
                      amount: { toString: () => '5' },
                      effectiveFrom: new Date('2026-09-14T00:00:00.000Z'),
                      effectiveTo: null,
                      isActive: true,
                    },
                  ],
                }
              : type,
          ),
        ),
      },
    };

    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    const result = await service.updateValue('CUTTING', {
      productGroup: 'SUPURGELIK',
      amount: '5',
      effectiveFrom: '2026-09-14',
    });

    expect(tx.extraCostValue.update).toHaveBeenCalledWith({
      where: { id: 'supurgelik-value-CUTTING' },
      data: { effectiveTo: new Date('2026-09-14T00:00:00.000Z') },
    });
    expect(tx.extraCostValue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          extraCostTypeId: 'type-CUTTING',
          productGroupId: 'group-supurgelik',
          productId: null,
        }),
      }),
    );
    expect(tx.extraCostValue.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(result.productGroupCode).toBe('SUPURGELIK');
    expect(result.items.map((item) => item.typeCode)).toEqual(['CUTTING', 'LABOR']);
    expect(result.items.find((item) => item.typeCode === 'CUTTING')?.amount).toBe('5');
    expect(result.totalAmount).toBe('17');
  });

  it('SUPURGELIK CUTTING 4→4 same-value no-op: history/audit yazılmaz', async () => {
    const openCutting = {
      id: 'supurgelik-value-CUTTING',
      amount: { toString: () => '4' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };

    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
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
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(supurgelikTypeDefs),
      },
    };

    const audit = { record: jest.fn() };
    const service = new ExtraCostsService(prisma as never, audit as never);

    const result = await service.updateValue('CUTTING', {
      productGroup: 'SUPURGELIK',
      amount: '4',
      effectiveFrom: '2026-09-14',
    });

    expect(tx.extraCostValue.update).not.toHaveBeenCalled();
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(result.items.find((item) => item.typeCode === 'CUTTING')?.amount).toBe('4');
    expect(result.totalAmount).toBe('16');
  });

  it.each(['0', '-1'])(
    'SUPURGELIK geçersiz tutar %s reddedilir; history/audit yok',
    async (amount) => {
      const prisma = { $transaction: jest.fn() };
      const audit = { record: jest.fn() };
      const service = new ExtraCostsService(prisma as never, audit as never);

      await expect(
        service.updateValue('CUTTING', {
          productGroup: 'SUPURGELIK',
          amount,
          effectiveFrom: '2026-09-14',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('SUPURGELIK boş/geçersiz Decimal reddedilir; history/audit yok', async () => {
    const prisma = { $transaction: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new ExtraCostsService(prisma as never, audit as never);

    await expect(
      service.updateValue('CUTTING', {
        productGroup: 'SUPURGELIK',
        amount: 'abc',
        effectiveFrom: '2026-09-14',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('SUPURGELIK ExtraCost audit hatasında transaction rollback olur', async () => {
    const openCutting = {
      id: 'supurgelik-value-CUTTING',
      amount: { toString: () => '4' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null as Date | null,
      isActive: true,
    };

    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
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
        update: jest.fn(async ({ data }: { data: { effectiveTo: Date } }) => {
          openCutting.effectiveTo = data.effectiveTo;
          return openCutting;
        }),
        create: jest.fn(),
      },
    };

    let committed = false;
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => {
        const previousEffectiveTo = openCutting.effectiveTo;
        try {
          await fn(tx);
          committed = true;
        } catch (error) {
          openCutting.effectiveTo = previousEffectiveTo;
          committed = false;
          throw error;
        }
      }),
    };

    const audit = { record: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    await expect(
      service.updateValue('CUTTING', {
        productGroup: 'SUPURGELIK',
        amount: '5',
        effectiveFrom: '2026-09-14',
      }),
    ).rejects.toThrow('AUDIT_FAIL');

    expect(committed).toBe(false);
    expect(openCutting.effectiveTo).toBeNull();
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('SUPURGELIK PP_WRAPPING tanımlı değilken amount=null döner; 0 uydurulmaz', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-PP_WRAPPING',
          code: 'PP_WRAPPING',
          name: 'PP Sarma',
          isActive: true,
        }),
        create: jest.fn(),
      },
      extraCostValue: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new ExtraCostsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    const result = await service.getSupurgelikPpWrapping(now);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      typeCode: 'PP_WRAPPING',
      amount: null,
      valueId: null,
    });
    expect(result.totalAmount).toBe('');
    expect(prisma.extraCostType.create).not.toHaveBeenCalled();
  });

  it('SUPURGELIK PP_WRAPPING ilk kayıt 80 history + audit yazar', async () => {
    const created = {
      id: 'supurgelik-value-PP_WRAPPING',
      amount: { toString: () => '80' },
      effectiveFrom: new Date('2026-09-14T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };
    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-PP_WRAPPING',
          code: 'PP_WRAPPING',
          name: 'PP Sarma',
          isActive: true,
        }),
        create: jest.fn(),
      },
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-PP_WRAPPING',
          code: 'PP_WRAPPING',
          name: 'PP Sarma',
          isActive: true,
        }),
        create: jest.fn(),
      },
      extraCostValue: {
        findMany: jest.fn().mockResolvedValue([created]),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    const result = await service.updateValue('PP_WRAPPING', {
      productGroup: 'SUPURGELIK',
      amount: '80',
      effectiveFrom: '2026-09-14',
    });

    expect(tx.extraCostValue.update).not.toHaveBeenCalled();
    expect(tx.extraCostValue.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(result.items[0]).toMatchObject({
      typeCode: 'PP_WRAPPING',
      amount: '80',
    });
    expect(result.items.map((item) => item.typeCode)).toEqual(['PP_WRAPPING']);
  });

  it('SUPURGELIK PP_WRAPPING 80→90 history + audit yazar; 90→90 no-op', async () => {
    const openWrapping = {
      id: 'supurgelik-value-PP_WRAPPING',
      amount: { toString: () => '80' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null as Date | null,
      isActive: true,
    };
    const created = {
      id: 'supurgelik-value-PP_WRAPPING-new',
      amount: { toString: () => '90' },
      effectiveFrom: new Date('2026-09-14T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };
    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-PP_WRAPPING',
          code: 'PP_WRAPPING',
          name: 'PP Sarma',
          isActive: true,
        }),
        create: jest.fn(),
      },
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue(openWrapping),
        update: jest.fn().mockResolvedValue({
          ...openWrapping,
          effectiveTo: new Date('2026-09-14T00:00:00.000Z'),
        }),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-PP_WRAPPING',
          code: 'PP_WRAPPING',
          name: 'PP Sarma',
          isActive: true,
        }),
        create: jest.fn(),
      },
      extraCostValue: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...openWrapping,
            effectiveTo: new Date('2026-09-14T00:00:00.000Z'),
          },
          created,
        ]),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    const changed = await service.updateValue('PP_WRAPPING', {
      productGroup: 'SUPURGELIK',
      amount: '90',
      effectiveFrom: '2026-09-14',
    });
    expect(tx.extraCostValue.update).toHaveBeenCalledTimes(1);
    expect(tx.extraCostValue.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(changed.items[0]?.amount).toBe('90');

    openWrapping.amount = { toString: () => '90' };
    tx.extraCostValue.update.mockClear();
    tx.extraCostValue.create.mockClear();
    audit.record.mockClear();
    prisma.extraCostValue.findMany.mockResolvedValue([
      { ...openWrapping, amount: { toString: () => '90' } },
    ]);

    const same = await service.updateValue('PP_WRAPPING', {
      productGroup: 'SUPURGELIK',
      amount: '90',
      effectiveFrom: '2026-09-15',
    });
    expect(tx.extraCostValue.update).not.toHaveBeenCalled();
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(same.items[0]?.amount).toBe('90');
  });

  it('SUPURGELIK PP_WRAPPING audit hatasında transaction rollback olur', async () => {
    const openWrapping = {
      id: 'supurgelik-value-PP_WRAPPING',
      amount: { toString: () => '80' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null as Date | null,
      isActive: true,
    };
    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(supurgelikGroup),
      },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-PP_WRAPPING',
          code: 'PP_WRAPPING',
          name: 'PP Sarma',
          isActive: true,
        }),
        create: jest.fn(),
      },
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue(openWrapping),
        update: jest.fn(async ({ data }: { data: { effectiveTo: Date } }) => {
          openWrapping.effectiveTo = data.effectiveTo;
          return openWrapping;
        }),
        create: jest.fn(),
      },
    };
    let committed = false;
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => {
        const previousEffectiveTo = openWrapping.effectiveTo;
        try {
          await fn(tx);
          committed = true;
        } catch (error) {
          openWrapping.effectiveTo = previousEffectiveTo;
          committed = false;
          throw error;
        }
      }),
    };
    const audit = { record: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    await expect(
      service.updateValue('PP_WRAPPING', {
        productGroup: 'SUPURGELIK',
        amount: '90',
        effectiveFrom: '2026-09-14',
      }),
    ).rejects.toThrow('AUDIT_FAIL');

    expect(committed).toBe(false);
    expect(openWrapping.effectiveTo).toBeNull();
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc'])(
    'SUPURGELIK PP_WRAPPING geçersiz tutar %s reddedilir',
    async (amount) => {
      const prisma = { $transaction: jest.fn() };
      const audit = { record: jest.fn() };
      const service = new ExtraCostsService(prisma as never, audit as never);

      await expect(
        service.updateValue('PP_WRAPPING', {
          productGroup: 'SUPURGELIK',
          amount,
          effectiveFrom: '2026-09-14',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );
});
