import { BadRequestException } from '@nestjs/common';
import { ExtraCostsService } from './extra-costs.service';
import { CITA_EXTRA_COST_TYPE_ORDER } from './cita-extra-cost';

describe('CITA ExtraCostsService', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');
  const group = {
    id: 'group-cita',
    code: 'CITA',
    name: 'Çıta',
    isActive: true,
  };

  const emptyTypes = CITA_EXTRA_COST_TYPE_ORDER.map((code) => ({
    id: `type-${code}`,
    code,
    name: code === 'CUTTING' ? 'Kesim' : 'İşçilik',
    isActive: true,
    values: [],
  }));

  it('değer yokken CUTTING/LABOR amount=null döner; 0 uydurulmaz; productId=null sorar', async () => {
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      extraCostType: { findMany: jest.fn().mockResolvedValue(emptyTypes) },
    };
    const service = new ExtraCostsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    const result = await service.listForProductGroup('CITA', now);
    expect(result.items.map((item) => item.typeCode)).toEqual(['CUTTING', 'LABOR']);
    expect(result.items.map((item) => item.amount)).toEqual([null, null]);
    expect(result.totalAmount).toBe('0');
    expect(prisma.extraCostType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          values: expect.objectContaining({
            where: expect.objectContaining({
              productGroupId: group.id,
              productId: null,
              isActive: true,
            }),
          }),
        }),
      }),
    );
  });

  it('GLUE/OTHER/PP_WRAPPING CITA için güncellenemez', async () => {
    const service = new ExtraCostsService(
      { $transaction: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    for (const typeCode of ['GLUE', 'OTHER', 'PP_WRAPPING']) {
      await expect(
        service.updateValue(typeCode, {
          productGroup: 'CITA',
          amount: '1',
          effectiveFrom: '2026-09-16',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('ilk CUTTING değeri group-scope productId=null history + audit yazar', async () => {
    const created = {
      id: 'cita-value-CUTTING',
      amount: { toString: () => '5' },
      effectiveFrom: new Date('2026-09-16T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      extraCostType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'type-CUTTING',
          code: 'CUTTING',
          name: 'Kesim',
          isActive: true,
        }),
      },
      extraCostValue: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) =>
        fn(tx),
      ),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue(
          emptyTypes.map((type) =>
            type.code === 'CUTTING' ? { ...type, values: [created] } : type,
          ),
        ),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    const result = await service.updateValue('CUTTING', {
      productGroup: 'CITA',
      amount: '5',
      effectiveFrom: '2026-09-16',
    });

    expect(tx.extraCostValue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productGroupId: group.id,
        productId: null,
        isActive: true,
      }),
    });
    expect(tx.extraCostValue.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(result.items.find((item) => item.typeCode === 'CUTTING')?.amount).toBe(
      '5',
    );
  });

  it('CUTTING 5→6 history + audit yazar; 6→6 no-op', async () => {
    const openCutting = {
      id: 'cita-value-CUTTING',
      amount: { toString: () => '5' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null as Date | null,
      isActive: true,
    };
    const created = {
      id: 'cita-value-CUTTING-new',
      amount: { toString: () => '6' },
      effectiveFrom: new Date('2026-09-16T00:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
    };
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
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
          effectiveTo: new Date('2026-09-16T00:00:00.000Z'),
        }),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) =>
        fn(tx),
      ),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue([
          { ...emptyTypes[0], values: [created] },
          emptyTypes[1],
        ]),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    await service.updateValue('CUTTING', {
      productGroup: 'CITA',
      amount: '6',
      effectiveFrom: '2026-09-16',
    });
    expect(tx.extraCostValue.update).toHaveBeenCalled();
    expect(tx.extraCostValue.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(2);

    tx.extraCostValue.findFirst.mockResolvedValue({
      ...created,
      amount: { toString: () => '6' },
    });
    audit.record.mockClear();
    tx.extraCostValue.update.mockClear();
    tx.extraCostValue.create.mockClear();

    await service.updateValue('CUTTING', {
      productGroup: 'CITA',
      amount: '6',
      effectiveFrom: '2026-09-16',
    });
    expect(tx.extraCostValue.update).not.toHaveBeenCalled();
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['0', '-1'])(
    'geçersiz tutar %s reddedilir; history/audit yok',
    async (amount) => {
      const prisma = { $transaction: jest.fn() };
      const audit = { record: jest.fn() };
      const service = new ExtraCostsService(prisma as never, audit as never);
      await expect(
        service.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount,
          effectiveFrom: '2026-09-16',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('audit hatasında transaction rollback olur', async () => {
    const openCutting = {
      id: 'cita-value-CUTTING',
      amount: { toString: () => '5' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null as Date | null,
      isActive: true,
    };
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
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
        const previous = openCutting.effectiveTo;
        try {
          await fn(tx);
          committed = true;
        } catch (error) {
          openCutting.effectiveTo = previous;
          committed = false;
          throw error;
        }
      }),
    };
    const audit = { record: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const service = new ExtraCostsService(prisma as never, audit as never);

    await expect(
      service.updateValue('CUTTING', {
        productGroup: 'CITA',
        amount: '6',
        effectiveFrom: '2026-09-16',
      }),
    ).rejects.toThrow('AUDIT_FAIL');
    expect(committed).toBe(false);
    expect(openCutting.effectiveTo).toBeNull();
    expect(tx.extraCostValue.create).not.toHaveBeenCalled();
  });

  it('aynı anda iki aktif CITA CUTTING varsa açık hata verir', async () => {
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      extraCostType: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...emptyTypes[0],
            values: [
              {
                id: 'a',
                amount: { toString: () => '5' },
                effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
                effectiveTo: null,
                isActive: true,
              },
              {
                id: 'b',
                amount: { toString: () => '6' },
                effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
                effectiveTo: null,
                isActive: true,
              },
            ],
          },
          emptyTypes[1],
        ]),
      },
    };
    const service = new ExtraCostsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(service.listForProductGroup('CITA', now)).rejects.toThrow(
      'birden fazla aktif ExtraCostValue',
    );
  });
});
