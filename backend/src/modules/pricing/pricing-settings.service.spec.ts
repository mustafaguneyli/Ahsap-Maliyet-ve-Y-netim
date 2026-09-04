import { NotFoundException } from '@nestjs/common';
import { PricingSettingsService } from './pricing-settings.service';

describe('PricingSettingsService', () => {
  const product = {
    id: 'p30',
    code: '30_MM',
    name: '30 MM MDF Kasa',
    isActive: true,
  };

  const current = {
    id: 'ps-old',
    productId: 'p30',
    productGroupId: null,
    vatRate: { toString: () => '10' },
    profitRate: { toString: () => '20' },
    cardMarkupRate: { toString: () => '20' },
    isActive: true,
  };

  it('GET aktif product-level oranları döner', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          code: 'door_frame',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue(current),
      },
    };
    const service = new PricingSettingsService(prisma as never, { record: jest.fn() } as never);

    const result = await service.getDoorFrameProductSetting('30_MM');
    expect(result.vatRate).toBe('10');
    expect(result.profitRate).toBe('20');
    expect(result.cardMarkupRate).toBe('20');
  });

  it('PATCH eski kaydı kapatır, yeni kayıt ve audit yazar (KDV 10→12)', async () => {
    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          code: 'door_frame',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({ ...current, isActive: false }),
        create: jest.fn().mockResolvedValue({
          id: 'ps-new',
          productId: 'p30',
          productGroupId: null,
          vatRate: { toString: () => '12' },
          profitRate: { toString: () => '20' },
          cardMarkupRate: { toString: () => '20' },
          isActive: true,
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new PricingSettingsService(prisma as never, audit as never);

    const result = await service.replaceDoorFrameProductSetting('30_MM', {
      productGroup: 'door_frame',
      vatRate: '12',
      profitRate: '20',
      cardMarkupRate: '20',
    });

    expect(tx.pricingSetting.update).toHaveBeenCalledWith({
      where: { id: 'ps-old' },
      data: { isActive: false },
    });
    expect(tx.pricingSetting.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls[0][0].action).toBe('UPDATE');
    expect(audit.record.mock.calls[1][0].action).toBe('CREATE');
    expect(audit.record.mock.calls[1][0].oldValue).toContain('vat=10');
    expect(audit.record.mock.calls[1][0].newValue).toContain('vat=12.0000');
    expect(result.vatRate).toBe('12');
    expect(result.profitRate).toBe('20');
    expect(result.cardMarkupRate).toBe('20');
  });

  it('aktif PricingSetting yoksa GET hata verir', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          code: 'door_frame',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PricingSettingsService(prisma as never, { record: jest.fn() } as never);

    await expect(service.getDoorFrameProductSetting('30_MM')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
