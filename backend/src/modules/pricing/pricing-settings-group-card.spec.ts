import { BadRequestException } from '@nestjs/common';
import { applyPercentCardSale } from '../../calculation-engine/pricing/percent-card-sale';
import { PricingSettingsService } from './pricing-settings.service';

describe('group cardMarkupRate yönetimi', () => {
  const groups = [
    { id: 'g-cita', code: 'CITA', name: 'Çıta', isActive: true },
    { id: 'g-door', code: 'door_frame', name: 'Kapı Kasası', isActive: true },
  ];

  function serviceWith(settings: Array<Record<string, unknown>>) {
    const prisma = {
      productGroup: {
        findMany: jest.fn().mockResolvedValue(groups),
      },
      product: {
        findMany: jest.fn(async (args: { where: { productGroupId: string } }) =>
          args.where.productGroupId === 'g-door' ? [{ id: 'door-product' }] : [],
        ),
      },
      pricingSetting: {
        findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
          const where = args.where;
          return settings.filter((row) => {
            if (where.productGroupId !== undefined && row.productGroupId !== where.productGroupId) {
              return false;
            }
            if (where.productId === null && row.productId != null) {
              return false;
            }
            const productId = where.productId as { in?: string[] } | null | undefined;
            if (productId && typeof productId === 'object' && productId.in) {
              if (!productId.in.includes(String(row.productId))) return false;
            }
            if (where.isActive === true && row.isActive !== true) return false;
            return true;
          });
        }),
      },
    };
    return new PricingSettingsService(prisma as never, { record: jest.fn() } as never);
  }

  it('grup oranı yoksa null döner; ürün kaydındaki oranı kaynak saymaz', async () => {
    const service = serviceWith([
      {
        id: 'product-rate',
        productGroupId: null,
        productId: 'door-product',
        isActive: true,
        cardMarkupRate: { toString: () => '20' },
      },
    ]);

    const result = await service.listGroupCardMarkupRates();

    expect(result.items).toEqual([
      {
        productGroupCode: 'CITA',
        productGroupName: 'Çıta',
        cardMarkupRate: null,
        productCardMarkupRate: null,
      },
      {
        productGroupCode: 'door_frame',
        productGroupName: 'Kapı Kasası',
        cardMarkupRate: null,
        productCardMarkupRate: '20',
      },
    ]);
    expect(result.items[0]).not.toHaveProperty('cardPrice');
  });

  it('grup oranını döner ve kart TL fiyatı üretmez', async () => {
    const service = serviceWith([
      {
        id: 'cita-rate',
        productGroupId: 'g-cita',
        productId: null,
        isActive: true,
        cardMarkupRate: { toString: () => '20' },
      },
    ]);

    const result = await service.listGroupCardMarkupRates();
    const cita = result.items.find((item) => item.productGroupCode === 'CITA');

    expect(cita?.cardMarkupRate).toBe('20');
    expect(applyPercentCardSale({
      cashPrice: '145',
      cardMarkupRate: cita?.cardMarkupRate,
      rounding: 'none',
    }).cardSalePrice).toBe('174');
    expect(applyPercentCardSale({
      cashPrice: '145',
      cardMarkupRate: '25',
      rounding: 'none',
    })).toMatchObject({
      cardSalePrice: '181.25',
    });
  });

  it('0 oranını negatif saymaz', async () => {
    const service = new PricingSettingsService(
      { $transaction: jest.fn().mockRejectedValue(new Error('tx-reached')) } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.replaceGroupCardMarkupRate({
        productGroup: 'CITA',
        cardMarkupRate: '0',
      }),
    ).rejects.toThrow('tx-reached');
  });

  it('negatif oranı reddeder', async () => {
    const service = new PricingSettingsService(
      { $transaction: jest.fn() } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.replaceGroupCardMarkupRate({
        productGroup: 'CITA',
        cardMarkupRate: '-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('eksik grup oranını yazar; aynı değer ikinci kez sürüm açmaz', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const audit = jest.fn();
    const tx = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue(groups[0]),
      },
      pricingSetting: {
        findMany: jest.fn(async () => rows.filter((row) => row.isActive)),
        update: jest.fn(async ({ where }: { where: { id: string } }) => {
          const row = rows.find((item) => item.id === where.id);
          if (row) row.isActive = false;
          return row;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const created = {
            id: `ps-${rows.length + 1}`,
            ...data,
            cardMarkupRate: {
              toString: () => String(data.cardMarkupRate),
            },
            isActive: true,
          };
          rows.push(created);
          return created;
        }),
      },
    };
    const prisma = {
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const service = new PricingSettingsService(prisma as never, { record: audit } as never);

    const created = await service.replaceGroupCardMarkupRate({
      productGroup: 'CITA',
      cardMarkupRate: '20',
    });
    const same = await service.replaceGroupCardMarkupRate({
      productGroup: 'CITA',
      cardMarkupRate: '20',
    });

    expect(created.cardMarkupRate).toBe('20');
    expect(same.cardMarkupRate).toBe('20');
    expect(rows.filter((row) => row.isActive)).toHaveLength(1);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({
      productGroupId: 'g-cita',
      productId: null,
      vatRate: null,
      profitRate: null,
    });
  });
});
