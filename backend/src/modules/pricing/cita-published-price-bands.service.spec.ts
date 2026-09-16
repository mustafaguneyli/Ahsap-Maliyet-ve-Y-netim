import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CitaPublishedPriceBandsService } from './cita-published-price-bands.service';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const group = { id: 'g-cita', code: 'CITA', name: 'Çıta', isActive: true };

function band(id: string, minWidthMm: number, maxWidthMm: number, cash: string, card: string, thicknessMm: number[]) {
  return {
    id,
    productGroupId: group.id,
    minWidthMm,
    maxWidthMm,
    cashPrice: new Decimal(cash),
    cardPrice: new Decimal(card),
    isActive: true,
    effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    effectiveTo: null as Date | null,
    thicknesses: thicknessMm.map((value) => ({ thicknessMm: value })),
  };
}

describe('CitaPublishedPriceBandsService', () => {
  it('aktif dört bandı listeler', async () => {
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([
          band('b1', 10, 20, '115', '138', [12, 14, 16]),
          band('b2', 30, 40, '145', '174', [12, 14, 16]),
          band('b3', 50, 60, '185', '222', [12, 14, 16, 18]),
          band('b4', 70, 80, '215', '258', [12, 14, 16]),
        ]),
      },
    };
    const service = new CitaPublishedPriceBandsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    const result = await service.listActive(NOW);

    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toMatchObject({
      minWidthMm: 10,
      maxWidthMm: 20,
      displayName: '1–2 cm',
      cashPrice: '115',
      cardPrice: '138',
      thicknessMm: [12, 14, 16],
    });
    expect(result.items[2].thicknessMm).toEqual([12, 14, 16, 18]);
    expect(result.items.map((item) => item.displayName)).toEqual([
      '1–2 cm',
      '3–4 cm',
      '5–6 cm',
      '7–8 cm',
    ]);
  });

  it('aynı nakit/kart değerinde no-op yapar', async () => {
    const current = band('b1', 10, 20, '115', '138', [12, 14, 16]);
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([current]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const audit = { record: jest.fn() };
    const service = new CitaPublishedPriceBandsService(
      prisma as never,
      audit as never,
    );

    await service.replaceBand(
      { minWidthMm: 10, maxWidthMm: 20, cashPrice: '115', cardPrice: '138' },
      NOW,
    );

    expect(tx.citaPublishedPriceBand.update).not.toHaveBeenCalled();
    expect(tx.citaPublishedPriceBand.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('fiyat değişince eski dönemi kapatır, thickness kapsamını kopyalar', async () => {
    const current = band('b1', 10, 20, '115', '138', [12, 14, 16]);
    const created = band('b1-new', 10, 20, '116', '139', [12, 14, 16]);
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn().mockResolvedValue({ ...current, effectiveTo: NOW }),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([created]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new CitaPublishedPriceBandsService(
      prisma as never,
      audit as never,
    );

    await service.replaceBand(
      { minWidthMm: 10, maxWidthMm: 20, cashPrice: '116', cardPrice: '139' },
      NOW,
    );

    expect(tx.citaPublishedPriceBand.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { effectiveTo: NOW },
    });
    expect(tx.citaPublishedPriceBand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          minWidthMm: 10,
          maxWidthMm: 20,
          thicknesses: {
            create: [{ thicknessMm: 12 }, { thicknessMm: 14 }, { thicknessMm: 16 }],
          },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledTimes(3);
  });

  it('kart fiyatını nakit × 1.20 üretmez; bağımsız tutarı yazar', async () => {
    const current = band('b2', 30, 40, '145', '174', [12, 14, 16]);
    const created = band('b2-new', 30, 40, '150', '181', [12, 14, 16]);
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn().mockResolvedValue({ ...current, effectiveTo: NOW }),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([created]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const service = new CitaPublishedPriceBandsService(
      prisma as never,
      { record: jest.fn().mockResolvedValue({}) } as never,
    );

    await service.replaceBand(
      { minWidthMm: 30, maxWidthMm: 40, cashPrice: '150', cardPrice: '181' },
      NOW,
    );

    const createdData = tx.citaPublishedPriceBand.create.mock.calls[0][0].data;
    expect(createdData.cashPrice.toString()).toBe('150');
    expect(createdData.cardPrice.toString()).toBe('181');
    expect(createdData.minWidthMm).toBe(30);
    expect(createdData.maxWidthMm).toBe(40);
  });

  it('id ile yalnız nakit/kart günceller; kapalı bandı reddeder', async () => {
    const current = band('b2', 30, 40, '145', '174', [12, 14, 16]);
    const created = band('b2-new', 30, 40, '150', '180', [12, 14, 16]);
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn().mockResolvedValue({ ...current, effectiveTo: NOW }),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findUnique: jest.fn().mockResolvedValue(current),
        findMany: jest.fn().mockResolvedValue([created]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const service = new CitaPublishedPriceBandsService(
      prisma as never,
      { record: jest.fn().mockResolvedValue({}) } as never,
    );

    await service.updateActiveBandPrices(
      'b2',
      { cashPrice: '150', cardPrice: '180' },
      NOW,
    );

    expect(prisma.citaPublishedPriceBand.findUnique).toHaveBeenCalledWith({
      where: { id: 'b2' },
    });
    expect(tx.citaPublishedPriceBand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          minWidthMm: 30,
          maxWidthMm: 40,
          thicknesses: {
            create: [{ thicknessMm: 12 }, { thicknessMm: 14 }, { thicknessMm: 16 }],
          },
        }),
      }),
    );

    const closedPrisma = {
      citaPublishedPriceBand: {
        findUnique: jest.fn().mockResolvedValue({
          ...current,
          effectiveTo: NOW,
        }),
      },
      $transaction: jest.fn(),
    };
    const closedService = new CitaPublishedPriceBandsService(
      closedPrisma as never,
      { record: jest.fn() } as never,
    );
    await expect(
      closedService.updateActiveBandPrices(
        'b2',
        { cashPrice: '150', cardPrice: '180' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(closedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['0', '138'],
    ['-1', '138'],
    ['145', '0'],
    ['145', '-1'],
  ])('geçersiz cash/card %s/%s reddedilir', async (cashPrice, cardPrice) => {
    const prisma = { $transaction: jest.fn() };
    const service = new CitaPublishedPriceBandsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.replaceBand(
        { minWidthMm: 10, maxWidthMm: 20, cashPrice, cardPrice },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('audit hatasında transaction rollback olur', async () => {
    const current = band('b1', 10, 20, '115', '138', [12, 14, 16]);
    let closed = false;
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([current]),
        update: jest.fn(async () => {
          closed = true;
          return { ...current, effectiveTo: NOW };
        }),
        create: jest.fn(),
      },
    };
    let committed = false;
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => {
          const previous = closed;
          try {
            const result = await callback(tx);
            committed = true;
            return result;
          } catch (error) {
            closed = previous;
            throw error;
          }
        },
      ),
    };
    const audit = {
      record: jest.fn().mockRejectedValue(new Error('audit failed')),
    };
    const service = new CitaPublishedPriceBandsService(
      prisma as never,
      audit as never,
    );

    await expect(
      service.replaceBand(
        { minWidthMm: 10, maxWidthMm: 20, cashPrice: '116', cardPrice: '139' },
        NOW,
      ),
    ).rejects.toThrow('audit failed');
    expect(committed).toBe(false);
    expect(closed).toBe(false);
    expect(tx.citaPublishedPriceBand.create).not.toHaveBeenCalled();
  });

  it('olmayan bandı NotFound döner', async () => {
    const tx = {
      productGroup: { findUnique: jest.fn().mockResolvedValue(group) },
      citaPublishedPriceBand: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const service = new CitaPublishedPriceBandsService(
      prisma as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.replaceBand(
        { minWidthMm: 10, maxWidthMm: 20, cashPrice: '116', cardPrice: '139' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
