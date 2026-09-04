import {
  DOOR_FRAME_PRICING_SEEDS,
  seedDoorFramePricingSettings,
} from './door-frame-pricing-seed';

describe('seedDoorFramePricingSettings', () => {
  const group = { id: 'g1', code: 'door_frame', name: 'Kapı Kasası', isActive: true };
  const product34 = { id: 'p34', code: '34_MM', isActive: true };
  const product30 = { id: 'p30', code: '30_MM', isActive: true };

  it('ilk çalışmada 34_MM ve 30_MM oranlarını cardMarkupRate=20 ile oluşturur', async () => {
    const created: Array<{
      productId: string;
      vatRate: { toString(): string };
      profitRate: { toString(): string };
      cardMarkupRate: { toString(): string };
    }> = [];

    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
      },
      product: {
        findUnique: jest.fn().mockImplementation(
          ({ where: { productGroupId_code } }: { where: { productGroupId_code: { code: string } } }) =>
            Promise.resolve(
              productGroupId_code.code === '34_MM'
                ? product34
                : productGroupId_code.code === '30_MM'
                  ? product30
                  : null,
            ),
        ),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => {
          created.push(data);
          return Promise.resolve(data);
        }),
        update: jest.fn(),
      },
    };

    const report = await seedDoorFramePricingSettings(prisma as never);

    expect(report.created).toBe(2);
    expect(report.cardMarkupBackfilled).toBe(0);
    expect(report.skippedExisting).toBe(0);
    expect(DOOR_FRAME_PRICING_SEEDS).toHaveLength(2);
    expect(created[0].cardMarkupRate.toString()).toBe('20');
    expect(created[1].cardMarkupRate.toString()).toBe('20');
  });

  it('aktif kayıtta cardMarkupRate null ise vat/profit korunarak 20 backfill eder', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(product34),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ps-old',
          vatRate: { toString: () => '0' },
          profitRate: { toString: () => '25' },
          cardMarkupRate: null,
          isActive: true,
        }),
        count: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const report = await seedDoorFramePricingSettings(prisma as never);

    expect(report.cardMarkupBackfilled).toBe(2);
    expect(report.created).toBe(0);
    expect(prisma.pricingSetting.update).toHaveBeenCalled();
    expect(prisma.pricingSetting.create.mock.calls[0][0].data.profitRate.toString()).toBe('25');
    expect(prisma.pricingSetting.create.mock.calls[0][0].data.cardMarkupRate.toString()).toBe(
      '20',
    );
  });

  it('cardMarkupRate doluysa dokunmaz', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(product34),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ps',
          vatRate: { toString: () => '0' },
          profitRate: { toString: () => '20' },
          cardMarkupRate: { toString: () => '25' },
          isActive: true,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const report = await seedDoorFramePricingSettings(prisma as never);

    expect(report.skippedExisting).toBe(2);
    expect(report.created).toBe(0);
    expect(report.cardMarkupBackfilled).toBe(0);
    expect(prisma.pricingSetting.create).not.toHaveBeenCalled();
  });
});
