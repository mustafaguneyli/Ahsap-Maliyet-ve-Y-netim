import {
  DOOR_FRAME_34MM_CASH_OVERRIDE_SEEDS,
  seedDoorFramePriceOverrides,
} from './door-frame-price-override-seed';

describe('seedDoorFramePriceOverrides', () => {
  it('34_MM için yalnızca 4 basılı sapma override oluşturur', async () => {
    const created: Array<{ cashPrice: unknown; productSizeId: string }> = [];
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'g1', code: 'door_frame' }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p34', code: '34_MM' }),
      },
      productSize: {
        findUnique: jest.fn().mockImplementation(
          (args: {
            where: { widthMm_lengthMm: { widthMm: number; lengthMm: number } };
          }) => {
            const { widthMm, lengthMm } = args.where.widthMm_lengthMm;
            return Promise.resolve({
              id: `sz-${widthMm}-${lengthMm}`,
              widthMm,
              lengthMm,
            });
          },
        ),
      },
      priceOverride: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: { data: { cashPrice: unknown; productSizeId: string } }) => {
          created.push(data);
          return Promise.resolve({ id: 'ov', ...data });
        }),
      },
    };

    const report = await seedDoorFramePriceOverrides(prisma as never);

    expect(report.created).toBe(4);
    expect(report.skippedExisting).toBe(0);
    expect(DOOR_FRAME_34MM_CASH_OVERRIDE_SEEDS.map((s) => s.cashPrice)).toEqual([
      '300',
      '415',
      '525',
      '600',
    ]);
    expect(created.map((c) => String(c.cashPrice))).toEqual(['300', '415', '525', '600']);
    expect(prisma.priceOverride.create).toHaveBeenCalledTimes(4);
  });

  it('mevcut override varsa (aktif veya geçmiş) ezmez', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'g1', code: 'door_frame' }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p34', code: '34_MM' }),
      },
      productSize: {
        findUnique: jest.fn().mockResolvedValue({ id: 'sz1', widthMm: 100, lengthMm: 2100 }),
      },
      priceOverride: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
      },
    };

    const report = await seedDoorFramePriceOverrides(prisma as never);
    expect(report.created).toBe(0);
    expect(report.skippedExisting).toBe(4);
    expect(prisma.priceOverride.create).not.toHaveBeenCalled();
  });
});
