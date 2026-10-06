import { BadRequestException, NotFoundException } from '@nestjs/common';
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
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new PricingSettingsService(prisma as never, { record: jest.fn() } as never);

    const result = await service.getDoorFrameProductSetting('30_MM');
    expect(result.vatRate).toBe('10');
    expect(result.profitRate).toBe('20');
    expect(result.cardMarkupRate).toBe('20');
    expect(result.groupCardMarkupRate).toBeNull();
    expect(result.productCardMarkupRate).toBe('20');
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
        findMany: jest.fn().mockResolvedValue([]),
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

  it('Ayarlı Pervaz GET yalnız DB profitRate değerini, KDV/kart NULL döner', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g-pervaz',
          code: 'PERVAZ',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-ayarli',
          code: 'AYARLI_PERVAZ',
          name: 'Ayarlı Pervaz',
          isActive: true,
        }),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ps-ayarli',
          profitRate: { toString: () => '15' },
          vatRate: null,
          cardMarkupRate: null,
          cardFixedSurchargeAmount: { toString: () => '2' },
          isActive: true,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new PricingSettingsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(service.getAyarliPervazProductSetting()).resolves.toEqual({
      productGroupCode: 'PERVAZ',
      productCode: 'AYARLI_PERVAZ',
      productName: 'Ayarlı Pervaz',
      settingId: 'ps-ayarli',
      vatRate: null,
      profitRate: '15',
      cardMarkupRate: null,
      cardFixedSurchargeAmount: '2',
      isActive: true,
    });
  });

  it('Ayarlı Pervaz PATCH eski kaydı kapatır, profitRate 15→17 version ve audit yazar', async () => {
    const oldSetting = {
      id: 'ps-old-ayarli',
      profitRate: { toString: () => '15' },
      vatRate: null,
      cardMarkupRate: null,
      cardFixedSurchargeAmount: { toString: () => '2' },
      isActive: true,
    };
    const productAyarli = {
      id: 'p-ayarli',
      code: 'AYARLI_PERVAZ',
      name: 'Ayarlı Pervaz',
      isActive: true,
    };
    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g-pervaz',
          code: 'PERVAZ',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(productAyarli),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue(oldSetting),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ ...oldSetting, isActive: false }),
        create: jest.fn().mockResolvedValue({
          id: 'ps-new-ayarli',
          profitRate: { toString: () => '17' },
          vatRate: null,
          cardMarkupRate: null,
          cardFixedSurchargeAmount: { toString: () => '2' },
          isActive: true,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new PricingSettingsService(prisma as never, audit as never);

    const result = await service.replaceAyarliPervazProductSetting({
      productGroup: 'PERVAZ',
      profitRate: '17',
    });

    expect(tx.pricingSetting.update).toHaveBeenCalledWith({
      where: { id: 'ps-old-ayarli' },
      data: { isActive: false },
    });
    expect(tx.pricingSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'p-ayarli',
        vatRate: null,
        cardMarkupRate: null,
        isActive: true,
      }),
    });
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(result.profitRate).toBe('17');
    expect(result.vatRate).toBeNull();
    expect(result.cardMarkupRate).toBeNull();
    expect(result.cardFixedSurchargeAmount).toBe('2');
  });

  it('Pervaz PATCH cardMarkupRate group-scope versionlar; profit same-value no-op', async () => {
    const oldSetting = {
      id: 'ps-old',
      profitRate: { toString: () => '15' },
      vatRate: null,
      cardMarkupRate: null,
      cardFixedSurchargeAmount: { toString: () => '2' },
      isActive: true,
    };
    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g-pervaz',
          code: 'PERVAZ',
          isActive: true,
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-ayarli',
          code: 'AYARLI_PERVAZ',
          name: 'Ayarlı Pervaz',
          isActive: true,
        }),
      },
      pricingSetting: {
        findFirst: jest.fn().mockResolvedValue(oldSetting),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'ps-group-card',
          profitRate: null,
          vatRate: null,
          cardMarkupRate: { toString: () => '20' },
          cardFixedSurchargeAmount: null,
          isActive: true,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new PricingSettingsService(prisma as never, audit as never);

    const result = await service.replacePervazProductSetting('AYARLI_PERVAZ', {
      productGroup: 'PERVAZ',
      profitRate: '15',
      cardMarkupRate: '20',
    });

    expect(tx.pricingSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productGroupId: 'g-pervaz',
        productId: null,
        isActive: true,
      }),
    });
    expect(result.profitRate).toBe('15');
    expect(result.cardMarkupRate).toBe('20');
    expect(result.cardFixedSurchargeAmount).toBe('2');
  });

  it('same-value no-op: group kart oranı aynıysa audit yazmaz', async () => {
    const current = {
      id: 'ps-old',
      productId: 'p30',
      productGroupId: null,
      vatRate: { toString: () => '10' },
      profitRate: { toString: () => '20' },
      cardMarkupRate: { toString: () => '20' },
      isActive: true,
    };
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
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ps-group',
            cardMarkupRate: { toString: () => '20' },
            vatRate: null,
            profitRate: null,
            cardFixedSurchargeAmount: null,
            isActive: true,
          },
        ]),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new PricingSettingsService(prisma as never, audit as never);

    const result = await service.replaceDoorFrameProductSetting('30_MM', {
      productGroup: 'door_frame',
      vatRate: '10',
      profitRate: '20',
      cardMarkupRate: '20',
    });

    expect(tx.pricingSetting.update).not.toHaveBeenCalled();
    expect(tx.pricingSetting.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(result.cardMarkupRate).toBe('20');
  });

  it('audit hata verirse PATCH transaction başarısız olur', async () => {
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
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ ...current, isActive: false }),
        create: jest.fn().mockResolvedValue({
          id: 'ps-new',
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
    const audit = { record: jest.fn().mockRejectedValue(new Error('audit fail')) };
    const service = new PricingSettingsService(prisma as never, audit as never);

    await expect(
      service.replaceDoorFrameProductSetting('30_MM', {
        productGroup: 'door_frame',
        vatRate: '12',
        profitRate: '20',
        cardMarkupRate: '20',
      }),
    ).rejects.toThrow('audit fail');
  });

  it('Geniş Kılçık için cardFixed yazmayı reddeder', async () => {
    const service = new PricingSettingsService({} as never, { record: jest.fn() } as never);
    await expect(
      service.replacePervazProductSetting('DEKORATIF_PERVAZ_GENIS_KILCIK', {
        productGroup: 'PERVAZ',
        profitRate: '15',
        cardFixedSurchargeAmount: '2',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
