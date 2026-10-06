import { AuditAction } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ProductPricingOverrideService } from './product-pricing-override.service';

describe('ProductPricingOverrideService', () => {
  function build() {
    const audits: unknown[] = [];
    const tx = {
      productPricingOverride: {
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => ({
          id: where.id,
          ...data,
        })),
        create: jest.fn(async ({ data }: { data: object }) => ({
          id: 'ov-new',
          ...data,
        })),
      },
      auditEvent: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          audits.push(data);
          return { id: `a${audits.length}`, ...(data as object) };
        }),
      },
    };
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          code: 'AYARLI_PERVAZ',
          isActive: true,
          productGroup: { id: 'g1', code: 'PERVAZ', isActive: true },
        }),
      },
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          code: 'PERVAZ',
          isActive: true,
        }),
      },
      productSize: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's-10',
          widthMm: 100,
          lengthMm: 2100,
        }),
        create: jest.fn().mockImplementation(
          async ({ data }: { data: { widthMm: number; lengthMm: number; displayName: string } }) => ({
            id: 's-created',
            ...data,
          }),
        ),
      },
      productionYield: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      productPricingOverride: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      pricingSetting: {
        findMany: jest.fn().mockImplementation(
          ({ where }: { where: { productId?: string | null; productGroupId?: string | null } }) => {
            if (where.productId === 'p1') {
              return Promise.resolve([
                { isActive: true, profitRate: { toString: () => '20' } },
              ]);
            }
            return Promise.resolve([]);
          },
        ),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new ProductPricingOverrideService(
      prisma as never,
      new AuditService(prisma as never),
    );
    return { service, prisma, tx, audits };
  }

  it('A/B) 10×210 %20, 12×210 %30 ayrı override; diğer ölçü etkilenmez', async () => {
    const { service, prisma, tx, audits } = build();
    prisma.productSize.findUnique
      .mockResolvedValueOnce({ id: 's-10', widthMm: 100, lengthMm: 2100 })
      .mockResolvedValueOnce({ id: 's-12', widthMm: 120, lengthMm: 2100 });

    const ten = await service.upsertSizeProfitRate({
      productGroupCode: 'PERVAZ',
      productCode: 'AYARLI_PERVAZ',
      widthMm: 100,
      lengthMm: 2100,
      profitRate: '20',
    });
    expect(ten.changed).toBe(true);
    expect(tx.productPricingOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'p1',
          productSizeId: 's-10',
        }),
      }),
    );
    expect(audits).toHaveLength(1);

    const twelve = await service.upsertSizeProfitRate({
      productGroupCode: 'PERVAZ',
      productCode: 'AYARLI_PERVAZ',
      widthMm: 120,
      lengthMm: 2100,
      profitRate: '30',
    });
    expect(twelve.changed).toBe(true);
    expect(
      (tx.productPricingOverride.create.mock.calls[1][0] as { data: { productSizeId: string } })
        .data.productSizeId,
    ).toBe('s-12');
  });

  it('D) profitRate=0 kaydedilir', async () => {
    const { service, tx } = build();
    const result = await service.upsertSizeProfitRate({
      productId: 'p1',
      productSizeId: 's-10',
      profitRate: '0',
    });
    expect(result.changed).toBe(true);
    expect(tx.productPricingOverride.create).toHaveBeenCalled();
  });

  it('E) blank override kapatır; no-op tekrar audit üretmez', async () => {
    const { service, prisma, tx, audits } = build();
    const cleared = await service.upsertSizeProfitRate({
      productId: 'p1',
      productSizeId: 's-10',
      profitRate: null,
    });
    expect(cleared.changed).toBe(false);
    expect(tx.productPricingOverride.update).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);

    prisma.productPricingOverride.findFirst.mockResolvedValue({
      id: 'ov-1',
      profitRate: { toString: () => '25' },
    });
    const closed = await service.upsertSizeProfitRate({
      productId: 'p1',
      productSizeId: 's-10',
      profitRate: null,
    });
    expect(closed.changed).toBe(true);
    expect(tx.productPricingOverride.update).toHaveBeenCalledWith({
      where: { id: 'ov-1' },
      data: expect.objectContaining({ isActive: false }),
    });
    expect(tx.productPricingOverride.create).not.toHaveBeenCalled();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: AuditAction.UPDATE,
      fieldName: 'profitRate',
      newValue: null,
    });
  });

  it('aynı oran no-op audit spam yok', async () => {
    const { service, prisma, tx, audits } = build();
    prisma.productPricingOverride.findFirst.mockResolvedValue({
      id: 'ov-1',
      profitRate: { toString: () => '25' },
    });
    const result = await service.upsertSizeProfitRate({
      productId: 'p1',
      productSizeId: 's-10',
      profitRate: '25',
    });
    expect(result.changed).toBe(false);
    expect(tx.productPricingOverride.create).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
  });

  it('katalogdaki Pervaz ölçüsü için eksik ProductSize kaydını yakın eşlemeden oluşturur', async () => {
    const { service, prisma, tx } = build();
    prisma.productSize.findUnique.mockResolvedValue(null);
    prisma.productionYield.findFirst.mockResolvedValue({ id: 'y-70' });
    const result = await service.upsertSizeProfitRate({
      productGroupCode: 'PERVAZ',
      productCode: 'AYARLI_PERVAZ',
      widthMm: 70,
      lengthMm: 2200,
      profitRate: '30',
    });
    expect(prisma.productionYield.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productId: 'p1',
          pieceWidthMm: 70,
          pieceLengthMm: 2200,
          isActive: true,
        }),
      }),
    );
    expect(prisma.productSize.create).toHaveBeenCalledWith({
      data: {
        widthMm: 70,
        lengthMm: 2200,
        displayName: '7×220',
      },
    });
    expect(result.productSizeId).toBe('s-created');
    expect(tx.productPricingOverride.create).toHaveBeenCalled();
  });

  it('katalogda olmayan ölçüye ProductSize yazmaz', async () => {
    const { service, prisma } = build();
    prisma.productSize.findUnique.mockResolvedValue(null);
    prisma.productionYield.findFirst.mockResolvedValue(null);
    await expect(
      service.upsertSizeProfitRate({
        productGroupCode: 'PERVAZ',
        productCode: 'AYARLI_PERVAZ',
        widthMm: 71,
        lengthMm: 2200,
        profitRate: '30',
      }),
    ).rejects.toThrow(/71×2200/);
    expect(prisma.productSize.create).not.toHaveBeenCalled();
  });
});
