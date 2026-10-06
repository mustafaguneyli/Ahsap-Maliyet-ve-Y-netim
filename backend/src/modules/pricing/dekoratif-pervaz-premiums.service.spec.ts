import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { DekoratifPervazPremiumsService } from './dekoratif-pervaz-premiums.service';

const NOW = new Date('2026-09-22T12:00:00.000Z');
const group = { id: 'g-pervaz', code: 'PERVAZ', name: 'Pervaz', isActive: true };
const product = {
  id: 'p-dek',
  code: 'DEKORATIF_PERVAZ',
  name: 'Dekoratif Pervaz',
  isActive: true,
};

function master(thicknessMm: number, widthMm: number, lengthMm: number) {
  return {
    id: `y-${thicknessMm}-${widthMm}-${lengthMm}`,
    productId: product.id,
    rawMaterialId: `m-${thicknessMm}`,
    pieceWidthMm: widthMm,
    pieceLengthMm: lengthMm,
    netQty: 10,
    isActive: true,
    createdAt: NOW,
    rawMaterial: {
      code: `MDF-${thicknessMm}`,
      thicknessMm: String(thicknessMm),
      isActive: true,
    },
  };
}

function exception(id: string, rate: string, overrides: Partial<{
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  profitRate: Decimal | null;
}> = {}) {
  return {
    id,
    productId: product.id,
    thicknessMm: overrides.thicknessMm ?? 12,
    widthMm: overrides.widthMm ?? 100,
    lengthMm: overrides.lengthMm ?? 2200,
    profitRate: overrides.profitRate ?? null,
    decorativePremiumRate: new Decimal(rate),
    adjustmentAmount: null,
    cardSaleEnabled: null,
    isActive: true,
    effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    effectiveTo: null,
  };
}

describe('DekoratifPervazPremiumsService', () => {
  it('GET product MASTER ölçülerini ve tanımlı/eksik dekoratif farkları döner', async () => {
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([
          master(12, 100, 2200),
          master(12, 100, 2500),
        ]),
      },
      pricingRowException: {
        findMany: jest.fn().mockResolvedValue([
          exception('ex-12-2200', '50'),
        ]),
      },
    };
    const service = new DekoratifPervazPremiumsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(service.listPremiums('DEKORATIF_PERVAZ', NOW)).resolves.toEqual({
      productGroupCode: 'PERVAZ',
      productCode: 'DEKORATIF_PERVAZ',
      productName: 'Dekoratif Pervaz',
      items: [
        {
          exceptionId: 'ex-12-2200',
          thicknessMm: 12,
          widthMm: 100,
          lengthMm: 2200,
          rate: '50',
          isActive: true,
        },
        {
          exceptionId: null,
          thicknessMm: 12,
          widthMm: 100,
          lengthMm: 2500,
          rate: null,
          isActive: false,
        },
      ],
    });
  });

  it('AYARLI_PERVAZ productCode reddedilir', async () => {
    const service = new DekoratifPervazPremiumsService(
      {} as never,
      { record: jest.fn() } as never,
    );
    await expect(service.listPremiums('AYARLI_PERVAZ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('PATCH 50→55 eski kaydı kapatır, yeni sürüm ve audit aynı transactionda yazılır', async () => {
    const oldRow = exception('ex-old', '50');
    const newRow = exception('ex-new', '55');
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([master(12, 100, 2200)]),
      },
      pricingRowException: {
        findMany: jest.fn().mockResolvedValue([oldRow]),
        update: jest.fn().mockResolvedValue({ ...oldRow, isActive: false }),
        create: jest.fn().mockResolvedValue(newRow),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([master(12, 100, 2200)]),
      },
      pricingRowException: {
        findMany: jest.fn().mockResolvedValue([newRow]),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new DekoratifPervazPremiumsService(prisma as never, audit as never);

    const result = await service.replacePremium(
      {
        productCode: 'DEKORATIF_PERVAZ',
        thicknessMm: 12,
        widthMm: 100,
        lengthMm: 2200,
        rate: '55',
      },
      NOW,
    );

    expect(tx.pricingRowException.update).toHaveBeenCalledWith({
      where: { id: 'ex-old' },
      data: { isActive: false },
    });
    expect(tx.pricingRowException.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: product.id,
        thicknessMm: 12,
        widthMm: 100,
        lengthMm: 2200,
        isActive: true,
      }),
    });
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls.every((call) => call[1] === tx)).toBe(true);
    expect(result.items[0]).toMatchObject({ rate: '55', exceptionId: 'ex-new' });
  });

  it('PATCH same-value no-op: history/audit yazılmaz', async () => {
    const current = exception('ex-50', '50');
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([master(12, 100, 2200)]),
      },
      pricingRowException: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([master(12, 100, 2200)]),
      },
      pricingRowException: {
        findMany: jest.fn().mockResolvedValue([current]),
      },
    };
    const audit = { record: jest.fn() };
    const service = new DekoratifPervazPremiumsService(prisma as never, audit as never);

    await service.replacePremium(
      {
        productCode: 'DEKORATIF_PERVAZ',
        thicknessMm: 12,
        widthMm: 100,
        lengthMm: 2200,
        rate: '50',
      },
      NOW,
    );

    expect(tx.pricingRowException.update).not.toHaveBeenCalled();
    expect(tx.pricingRowException.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('PATCH eksik ölçü için yeni kayıt açar', async () => {
    const created = exception('ex-new', '50', { lengthMm: 2500 });
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([master(12, 100, 2500)]),
      },
      pricingRowException: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([master(12, 100, 2500)]),
      },
      pricingRowException: {
        findMany: jest.fn().mockResolvedValue([created]),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new DekoratifPervazPremiumsService(prisma as never, audit as never);

    const result = await service.replacePremium(
      {
        productCode: 'DEKORATIF_PERVAZ',
        thicknessMm: 12,
        widthMm: 100,
        lengthMm: 2500,
        rate: '50',
      },
      NOW,
    );

    expect(tx.pricingRowException.update).not.toHaveBeenCalled();
    expect(tx.pricingRowException.create).toHaveBeenCalled();
    expect(result.items[0].rate).toBe('50');
  });

  it('PATCH negatif oranı reddeder', async () => {
    const prisma = { $transaction: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new DekoratifPervazPremiumsService(prisma as never, audit as never);
    await expect(
      service.replacePremium({
        productCode: 'DEKORATIF_PERVAZ',
        thicknessMm: 12,
        widthMm: 100,
        lengthMm: 2200,
        rate: '-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('PATCH MASTER olmayan ölçüyü reddeder', async () => {
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([master(12, 100, 2200)]),
      },
      pricingRowException: {
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new DekoratifPervazPremiumsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.replacePremium(
        {
          productCode: 'DEKORATIF_PERVAZ',
          thicknessMm: 8,
          widthMm: 100,
          lengthMm: 2200,
          rate: '25',
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.pricingRowException.create).not.toHaveBeenCalled();
  });

  it('audit hatasında PricingRowException transaction rollback olur', async () => {
    const current = exception('ex-old', '50');
    const currentIsActive = { value: true };
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      productionYield: {
        findMany: jest.fn().mockResolvedValue([master(12, 100, 2200)]),
      },
      pricingRowException: {
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
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => {
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
        },
      ),
    };
    const audit = { record: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const service = new DekoratifPervazPremiumsService(prisma as never, audit as never);

    await expect(
      service.replacePremium(
        {
          productCode: 'DEKORATIF_PERVAZ',
          thicknessMm: 12,
          widthMm: 100,
          lengthMm: 2200,
          rate: '55',
        },
        NOW,
      ),
    ).rejects.toThrow('AUDIT_FAIL');

    expect(committed).toBe(false);
    expect(currentIsActive.value).toBe(true);
    expect(tx.pricingRowException.create).not.toHaveBeenCalled();
  });
});
