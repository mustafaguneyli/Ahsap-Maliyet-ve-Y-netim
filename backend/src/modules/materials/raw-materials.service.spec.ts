import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RawMaterialsService } from './raw-materials.service';

describe('RawMaterialsService', () => {
  const createdMaterial = {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'MDF-22-2100X2800-ZIMPARALI',
    name: '22 MM MDF 210×280 Zımparalı',
    thicknessMm: { toString: () => '22' },
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    supplierName: 'DEMPAŞ',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    prices: [
      {
        priceType: 'CASH',
        price: { toString: () => '3750.0000' },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        createdAt: new Date(),
      },
      {
        priceType: 'CARD_INSTALLMENT',
        price: { toString: () => '4400.0000' },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        createdAt: new Date(),
      },
    ],
  };

  function buildService(overrides?: { createImpl?: jest.Mock }) {
    const tx = {
      rawMaterial: {
        create: overrides?.createImpl ?? jest.fn().mockResolvedValue(createdMaterial),
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(createdMaterial),
      },
      rawMaterialPrice: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'price-1', price: { toString: () => '3800' } }),
      },
    };

    const prisma = {
      rawMaterial: {
        findUnique: jest.fn().mockResolvedValue(createdMaterial),
        findMany: jest.fn().mockResolvedValue([createdMaterial]),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const auditService = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const service = new RawMaterialsService(prisma as never, auditService as never);
    return { service, prisma, auditService, tx };
  }

  it('geçerli ham madde oluşturur ve audit yazar', async () => {
    const { service, auditService, tx } = buildService();

    const result = await service.create({
      code: 'MDF-22-2100X2800-ZIMPARALI',
      name: '22 MM MDF 210×280 Zımparalı',
      thicknessMm: 22,
      sheetWidthMm: 2100,
      sheetLengthMm: 2800,
      surfaceType: 'Zımparalı',
    });

    expect(result.code).toBe('MDF-22-2100X2800-ZIMPARALI');
    expect(result.cashPrice).toBe('3750.0000');
    expect(tx.rawMaterial.create).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'RawMaterial',
        action: 'CREATE',
      }),
      tx,
    );
  });

  it('negatif veya 0 ölçüleri reddeder', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.create({
        code: 'MDF-0',
        name: 'Geçersiz',
        thicknessMm: 0,
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('duplicate code durumunda ConflictException fırlatır', async () => {
    const createImpl = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['code'] },
      }),
    );
    const { service } = buildService({ createImpl });

    await expect(
      service.create({
        code: 'MDF-22-2100X2800-ZIMPARALI',
        name: '22 MM MDF',
        thicknessMm: 22,
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
