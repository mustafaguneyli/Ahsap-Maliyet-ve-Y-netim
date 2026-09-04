import { PriceOverridesService } from './price-overrides.service';

describe('PriceOverridesService', () => {
  function buildService() {
    const current = {
      id: 'ov-old',
      cashPrice: { toString: () => '290' },
      isActive: true,
    };
    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'g1', code: 'door_frame', isActive: true }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p34',
          code: '34_MM',
          isActive: true,
        }),
      },
      productSize: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sz-100-2100',
          displayName: '10×210',
          widthMm: 100,
          lengthMm: 2100,
        }),
      },
      priceOverride: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({ ...current, isActive: false }),
        create: jest.fn().mockResolvedValue({
          id: 'ov-new',
          cashPrice: { toString: () => '300' },
          reason: 'basılı',
          isActive: true,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const auditService = {
      record: jest.fn().mockResolvedValue({}),
    };
    return {
      service: new PriceOverridesService(prisma as never, auditService as never),
      tx,
      auditService,
    };
  }

  it('upsert eski aktif kaydı kapatır, yeni override ve audit yazar', async () => {
    const { service, tx, auditService } = buildService();
    const result = await service.upsertDoorFrameOverride('34_MM', '10x210', {
      productGroup: 'door_frame',
      cashPrice: '300',
      reason: 'basılı',
    });

    expect(tx.priceOverride.update).toHaveBeenCalledWith({
      where: { id: 'ov-old' },
      data: { isActive: false },
    });
    expect(tx.priceOverride.create).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledTimes(2);
    expect(result.cashPrice).toBe('300');
    expect(result.isActive).toBe(true);
  });

  it('deactivate aktif override\'ı pasife alır', async () => {
    const { service, tx } = buildService();
    const result = await service.deactivateDoorFrameOverride('34_MM', '10×210');
    expect(tx.priceOverride.update).toHaveBeenCalledWith({
      where: { id: 'ov-old' },
      data: { isActive: false },
    });
    expect(result.overrideId).toBeNull();
    expect(result.cashPrice).toBeNull();
  });
});
