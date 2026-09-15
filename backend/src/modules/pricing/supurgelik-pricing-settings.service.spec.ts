import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PricingSettingsService } from './pricing-settings.service';

const group = {
  id: 'group-supurgelik',
  code: 'SUPURGELIK',
  name: 'Süpürgelik',
  isActive: true,
};

function setting(id: string, profitRate: string) {
  return {
    id,
    productGroupId: group.id,
    productId: null,
    vatRate: null,
    profitRate: new Decimal(profitRate),
    cardMarkupRate: null,
    cardFixedSurchargeAmount: null,
    isActive: true,
  };
}

describe('PricingSettingsService SUPURGELIK group setting', () => {
  it('GET yalnız aktif group-scope profitRate değerini döndürür', async () => {
    const current = setting('pricing-current', '20');
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingSetting: { findMany: jest.fn().mockResolvedValue([current]) },
    };
    const service = new PricingSettingsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(service.getSupurgelikGroupSetting()).resolves.toEqual({
      productGroupCode: 'SUPURGELIK',
      productGroupName: 'Süpürgelik',
      settingId: 'pricing-current',
      vatRate: null,
      profitRate: '20',
      cardMarkupRate: null,
      cardFixedSurchargeAmount: null,
      isActive: true,
    });
    expect(prisma.pricingSetting.findMany).toHaveBeenCalledWith({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
  });

  it('PATCH eski sürümü kapatır, yenisini oluşturur ve iki audit kaydını aynı transactiona yazar', async () => {
    const oldSetting = setting('pricing-old', '20');
    const newSetting = setting('pricing-new', '21');
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingSetting: {
        findMany: jest.fn().mockResolvedValue([oldSetting]),
        update: jest.fn().mockResolvedValue({ ...oldSetting, isActive: false }),
        create: jest.fn().mockResolvedValue(newSetting),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new PricingSettingsService(prisma as never, audit as never);

    const result = await service.replaceSupurgelikGroupSetting({
      productGroup: 'SUPURGELIK',
      profitRate: '21',
    });

    expect(tx.pricingSetting.update).toHaveBeenCalledWith({
      where: { id: 'pricing-old' },
      data: { isActive: false },
    });
    expect(tx.pricingSetting.create).toHaveBeenCalledWith({
      data: {
        productGroupId: group.id,
        productId: null,
        vatRate: null,
        profitRate: expect.anything(),
        cardMarkupRate: null,
        cardFixedSurchargeAmount: null,
        isActive: true,
      },
    });
    expect(tx.pricingSetting.create.mock.calls[0][0].data.profitRate.toString()).toBe(
      '21',
    );
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls.every((call) => call[1] === tx)).toBe(true);
    expect(result).toMatchObject({ settingId: 'pricing-new', profitRate: '21' });
  });

  it('PATCH 20→20 same-value no-op: history/audit yazılmaz', async () => {
    const current = setting('pricing-current', '20');
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingSetting: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const audit = { record: jest.fn() };
    const service = new PricingSettingsService(prisma as never, audit as never);

    const result = await service.replaceSupurgelikGroupSetting({
      productGroup: 'SUPURGELIK',
      profitRate: '20',
    });

    expect(tx.pricingSetting.update).not.toHaveBeenCalled();
    expect(tx.pricingSetting.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      productGroupCode: 'SUPURGELIK',
      settingId: 'pricing-current',
      profitRate: '20',
    });
  });

  it.each(['0', '-1'])(
    'PATCH geçersiz kâr oranı %s reddedilir; history/audit yok',
    async (profitRate) => {
      const prisma = { $transaction: jest.fn() };
      const audit = { record: jest.fn() };
      const service = new PricingSettingsService(prisma as never, audit as never);

      await expect(
        service.replaceSupurgelikGroupSetting({
          productGroup: 'SUPURGELIK',
          profitRate,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('PATCH geçersiz Decimal reddedilir; history/audit yok', async () => {
    const prisma = { $transaction: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new PricingSettingsService(prisma as never, audit as never);

    await expect(
      service.replaceSupurgelikGroupSetting({
        productGroup: 'SUPURGELIK',
        profitRate: 'abc',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('audit hatasında PricingSetting transaction rollback olur', async () => {
    const current = setting('pricing-old', '20');
    const currentIsActive = { value: true };
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingSetting: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn(async () => {
          currentIsActive.value = false;
          return { ...current, isActive: false };
        }),
        create: jest.fn(),
      },
    };
    let committed = false;
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        const previous = currentIsActive.value;
        try {
          const result = await callback(tx);
          committed = true;
          return result;
        } catch (error) {
          currentIsActive.value = previous;
          committed = false;
          throw error;
        }
      }),
    };
    const audit = { record: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const service = new PricingSettingsService(prisma as never, audit as never);

    await expect(
      service.replaceSupurgelikGroupSetting({
        productGroup: 'SUPURGELIK',
        profitRate: '21',
      }),
    ).rejects.toThrow('AUDIT_FAIL');

    expect(committed).toBe(false);
    expect(currentIsActive.value).toBe(true);
    expect(tx.pricingSetting.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
