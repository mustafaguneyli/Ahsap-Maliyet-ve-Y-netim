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

  function buildService(overrides?: {
    createImpl?: jest.Mock;
    openPrice?: {
      id: string;
      price: { toString(): string };
      effectiveFrom: Date;
    } | null;
    auditImpl?: jest.Mock;
  }) {
    const tx = {
      rawMaterial: {
        create: overrides?.createImpl ?? jest.fn().mockResolvedValue(createdMaterial),
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(createdMaterial),
      },
      rawMaterialPrice: {
        findFirst: jest.fn().mockResolvedValue(overrides?.openPrice ?? null),
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
      record:
        overrides?.auditImpl ?? jest.fn().mockResolvedValue({ id: 'audit-1' }),
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

  it('aktif CARD_INSTALLMENT fiyatını listeden okur', async () => {
    const { service } = buildService();

    const rows = await service.findAll({ isActive: true });

    expect(rows).toHaveLength(1);
    expect(rows[0].cardInstallmentPrice).toBe('4400.0000');
  });

  it('fiyatı olmayan material için ilk CARD_INSTALLMENT dönemini audit ile açar', async () => {
    const { service, prisma, tx, auditService } = buildService();
    const effectiveFrom = new Date('2026-09-14T12:00:00.000Z');

    const result = await service.updateCardInstallmentPrice(
      createdMaterial.id,
      { price: '1900' },
      effectiveFrom,
    );

    expect(result.changed).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.rawMaterialPrice.update).not.toHaveBeenCalled();
    expect(tx.rawMaterialPrice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rawMaterialId: createdMaterial.id,
        priceType: 'CARD_INSTALLMENT',
        effectiveFrom,
        effectiveTo: null,
        isActive: true,
      }),
    });
    expect(
      tx.rawMaterialPrice.create.mock.calls[0][0].data.price.toString(),
    ).toBe('1900');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'RawMaterialPrice',
        action: 'CREATE',
        oldValue: null,
        newValue: '1900.0000',
      }),
      tx,
    );
  });

  it('mevcut açık CARD_INSTALLMENT dönemini kapatıp yeni dönemi açar', async () => {
    const openPrice = {
      id: 'open-card-price',
      price: { toString: () => '2185' },
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    };
    const { service, tx, auditService } = buildService({ openPrice });
    const effectiveFrom = new Date('2026-09-14T12:00:00.000Z');

    const result = await service.updateCardInstallmentPrice(
      createdMaterial.id,
      { price: '2200' },
      effectiveFrom,
    );

    expect(result.changed).toBe(true);
    expect(tx.rawMaterialPrice.update).toHaveBeenCalledWith({
      where: { id: openPrice.id },
      data: { effectiveTo: effectiveFrom },
    });
    expect(tx.rawMaterialPrice.create).toHaveBeenCalledTimes(1);
    expect(tx.rawMaterialPrice.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.rawMaterialPrice.create.mock.invocationCallOrder[0],
    );
    expect(auditService.record).toHaveBeenCalledTimes(2);
  });

  it('aynı CARD_INSTALLMENT Decimal değeri için yeni history veya audit oluşturmaz', async () => {
    const { service, tx, auditService } = buildService({
      openPrice: {
        id: 'open-card-price',
        price: { toString: () => '2185.0000' },
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      },
    });

    const result = await service.updateCardInstallmentPrice(
      createdMaterial.id,
      { price: '2185' },
      new Date('2026-09-14T12:00:00.000Z'),
    );

    expect(result.changed).toBe(false);
    expect(tx.rawMaterialPrice.update).not.toHaveBeenCalled();
    expect(tx.rawMaterialPrice.create).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it.each(['', 'abc', '0', '0.0000', '-1'])(
    'CARD_INSTALLMENT için geçersiz veya pozitif olmayan "%s" değerini reddeder',
    async (price) => {
      const { service, prisma } = buildService();

      await expect(
        service.updateCardInstallmentPrice(createdMaterial.id, { price }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('audit başarısızsa fiyat transaction’ını da başarısız kılar', async () => {
    const auditError = new Error('AUDIT_WRITE_FAILED');
    const { service, prisma } = buildService({
      auditImpl: jest.fn().mockRejectedValue(auditError),
    });

    await expect(
      service.updateCardInstallmentPrice(
        createdMaterial.id,
        { price: '1900' },
        new Date('2026-09-14T12:00:00.000Z'),
      ),
    ).rejects.toBe(auditError);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
