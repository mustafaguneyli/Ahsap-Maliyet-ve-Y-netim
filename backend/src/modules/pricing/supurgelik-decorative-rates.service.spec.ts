import { BadRequestException } from '@nestjs/common';
import { PricingModifierType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PricingThicknessModifiersService } from './pricing-thickness-modifiers.service';

const group = {
  id: 'group-supurgelik',
  code: 'SUPURGELIK',
  name: 'Süpürgelik',
  isActive: true,
};

const NOW = new Date('2026-09-14T12:00:00.000Z');

function modifier(id: string, thicknessMm: number, rate: string) {
  return {
    id,
    productGroupId: group.id,
    modifierType: PricingModifierType.DECORATIVE,
    thicknessMm,
    rate: new Decimal(rate),
    isActive: true,
    effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    effectiveTo: null,
  };
}

function catalogPrisma() {
  return {
    productSize: {
      findMany: jest.fn().mockResolvedValue([{ widthMm: 120, lengthMm: 2800 }]),
    },
    productionYield: {
      findMany: jest.fn().mockResolvedValue(
        [8, 9, 10, 12, 14, 18].map((thicknessMm) => ({
          productId: null,
          isActive: true,
          pieceWidthMm: 120,
          pieceLengthMm: 2800,
          rawMaterial: {
            isActive: true,
            code: `MDF-${thicknessMm}`,
            thicknessMm: String(thicknessMm),
            sheetLengthMm: 2800,
          },
        })),
      ),
    },
  };
}

describe('PricingThicknessModifiersService SUPURGELIK decorative rates', () => {
  it('GET tanımlı 12/14/18 oranlarını ve katalogdaki eksik 8/9/10 mm satırlarını döner', async () => {
    const rows = [
      modifier('mod-12', 12, '25'),
      modifier('mod-14', 14, '25'),
      modifier('mod-18', 18, '45'),
    ];
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: { findMany: jest.fn().mockResolvedValue(rows) },
      ...catalogPrisma(),
    };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.listSupurgelikDecorativeRates('SUPURGELIK', NOW),
    ).resolves.toEqual({
      productGroupCode: 'SUPURGELIK',
      productGroupName: 'Süpürgelik',
      items: [
        { modifierId: null, thicknessMm: 8, rate: null, isActive: false },
        { modifierId: null, thicknessMm: 9, rate: null, isActive: false },
        { modifierId: null, thicknessMm: 10, rate: null, isActive: false },
        { modifierId: 'mod-12', thicknessMm: 12, rate: '25', isActive: true },
        { modifierId: 'mod-14', thicknessMm: 14, rate: '25', isActive: true },
        { modifierId: 'mod-18', thicknessMm: 18, rate: '45', isActive: true },
      ],
    });
    expect(prisma.pricingThicknessModifier.findMany).toHaveBeenCalledWith({
      where: {
        productGroupId: group.id,
        modifierType: PricingModifierType.DECORATIVE,
        isActive: true,
        effectiveFrom: { lte: NOW },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: NOW } }],
      },
      orderBy: [{ thicknessMm: 'asc' }, { effectiveFrom: 'desc' }],
    });
  });

  it('GET aynı kalınlıkta birden fazla aktif oran varsa açık hata verir', async () => {
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([
          modifier('mod-12-a', 12, '25'),
          modifier('mod-12-b', 12, '26'),
        ]),
      },
      ...catalogPrisma(),
    };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.listSupurgelikDecorativeRates('SUPURGELIK', NOW),
    ).rejects.toThrow('birden fazla geçerli dekoratif oran');
  });

  it('PATCH 12 mm 25→26 eski sürümü kapatır, yenisini oluşturur ve iki audit kaydını aynı transactiona yazar', async () => {
    const oldRow = modifier('mod-12-old', 12, '25');
    const newRow = modifier('mod-12-new', 12, '26');
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([oldRow]),
        update: jest.fn().mockResolvedValue({ ...oldRow, isActive: false }),
        create: jest.fn().mockResolvedValue(newRow),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([
          newRow,
          modifier('mod-14', 14, '25'),
          modifier('mod-18', 18, '45'),
        ]),
      },
      ...catalogPrisma(),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      audit as never,
    );

    const result = await service.replaceSupurgelikDecorativeRate(
      { productGroup: 'SUPURGELIK', thicknessMm: 12, rate: '26' },
      NOW,
    );

    expect(tx.pricingThicknessModifier.update).toHaveBeenCalledWith({
      where: { id: 'mod-12-old' },
      data: { isActive: false },
    });
    expect(tx.pricingThicknessModifier.create).toHaveBeenCalledWith({
      data: {
        productGroupId: group.id,
        modifierType: PricingModifierType.DECORATIVE,
        thicknessMm: 12,
        rate: expect.anything(),
        isActive: true,
        effectiveFrom: NOW,
        effectiveTo: null,
      },
    });
    expect(
      tx.pricingThicknessModifier.create.mock.calls[0][0].data.rate.toString(),
    ).toBe('26');
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls.every((call) => call[1] === tx)).toBe(true);
    expect(result.items.find((item) => item.thicknessMm === 12)).toMatchObject({
      modifierId: 'mod-12-new',
      rate: '26',
    });
  });

  it('PATCH 25→25 same-value no-op: history/audit yazılmaz', async () => {
    const current = modifier('mod-12', 12, '25');
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([
          current,
          modifier('mod-14', 14, '25'),
          modifier('mod-18', 18, '45'),
        ]),
      },
      ...catalogPrisma(),
    };
    const audit = { record: jest.fn() };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      audit as never,
    );

    const result = await service.replaceSupurgelikDecorativeRate(
      { productGroup: 'SUPURGELIK', thicknessMm: 12, rate: '25' },
      NOW,
    );

    expect(tx.pricingThicknessModifier.update).not.toHaveBeenCalled();
    expect(tx.pricingThicknessModifier.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(result.items.find((item) => item.thicknessMm === 12)?.rate).toBe('25');
  });

  it('PATCH 8 mm eksik oranı oluşturur; 0 uydurmaz, verilen 25 yazılır', async () => {
    const created = modifier('mod-8-new', 8, '25');
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([
          created,
          modifier('mod-12', 12, '25'),
          modifier('mod-14', 14, '25'),
          modifier('mod-18', 18, '45'),
        ]),
      },
      ...catalogPrisma(),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      audit as never,
    );

    const result = await service.replaceSupurgelikDecorativeRate(
      { productGroup: 'SUPURGELIK', thicknessMm: 8, rate: '25' },
      NOW,
    );

    expect(tx.pricingThicknessModifier.update).not.toHaveBeenCalled();
    expect(tx.pricingThicknessModifier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productGroupId: group.id,
        thicknessMm: 8,
        isActive: true,
      }),
    });
    expect(result.items.find((item) => item.thicknessMm === 8)).toMatchObject({
      modifierId: 'mod-8-new',
      rate: '25',
    });
    expect(result.items.find((item) => item.thicknessMm === 10)?.rate).toBeNull();
  });

  it('PATCH %0 geçerli: kart/dekoratif 0 uydurma değil, açık 0 yazılır', async () => {
    const created = modifier('mod-8-zero', 8, '0');
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([created]),
      },
      ...catalogPrisma(),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      audit as never,
    );

    const result = await service.replaceSupurgelikDecorativeRate(
      { productGroup: 'SUPURGELIK', thicknessMm: 8, rate: '0' },
      NOW,
    );

    expect(tx.pricingThicknessModifier.create).toHaveBeenCalled();
    expect(result.items.find((item) => item.thicknessMm === 8)?.rate).toBe('0');
  });

  it('PATCH negatif dekoratif oran reddedilir; history/audit yok', async () => {
    const prisma = { $transaction: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      audit as never,
    );

    await expect(
      service.replaceSupurgelikDecorativeRate({
        productGroup: 'SUPURGELIK',
        thicknessMm: 12,
        rate: '-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('PATCH geçersiz Decimal reddedilir; history/audit yok', async () => {
    const prisma = { $transaction: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      audit as never,
    );

    await expect(
      service.replaceSupurgelikDecorativeRate({
        productGroup: 'SUPURGELIK',
        thicknessMm: 12,
        rate: 'abc',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('PATCH aynı kalınlıkta birden fazla aktif oran varsa yazmaz', async () => {
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
        findMany: jest.fn().mockResolvedValue([
          modifier('mod-12-a', 12, '25'),
          modifier('mod-12-b', 12, '26'),
        ]),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const audit = { record: jest.fn() };
    const service = new PricingThicknessModifiersService(
      prisma as never,
      audit as never,
    );

    await expect(
      service.replaceSupurgelikDecorativeRate(
        { productGroup: 'SUPURGELIK', thicknessMm: 12, rate: '27' },
        NOW,
      ),
    ).rejects.toThrow('birden fazla geçerli dekoratif oran');
    expect(tx.pricingThicknessModifier.update).not.toHaveBeenCalled();
    expect(tx.pricingThicknessModifier.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('audit hatasında PricingThicknessModifier transaction rollback olur', async () => {
    const current = modifier('mod-12-old', 12, '25');
    const currentIsActive = { value: true };
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      pricingThicknessModifier: {
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
    const service = new PricingThicknessModifiersService(
      prisma as never,
      audit as never,
    );

    await expect(
      service.replaceSupurgelikDecorativeRate(
        { productGroup: 'SUPURGELIK', thicknessMm: 12, rate: '26' },
        NOW,
      ),
    ).rejects.toThrow('AUDIT_FAIL');

    expect(committed).toBe(false);
    expect(currentIsActive.value).toBe(true);
    expect(tx.pricingThicknessModifier.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
