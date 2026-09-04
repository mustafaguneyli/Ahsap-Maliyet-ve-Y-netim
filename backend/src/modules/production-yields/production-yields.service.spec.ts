import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductionYieldsService } from './production-yields.service';

describe('ProductionYieldsService', () => {
  const activeMaterial = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code: 'MDF-22-2100X2800-ZIMPARALI',
    name: '22 MM MDF 210×280 Zımparalı',
    thicknessMm: { toString: () => '22' },
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: 'Zımparalı',
    isActive: true,
  };

  const inactiveMaterial = {
    ...activeMaterial,
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    code: 'MDF-INACTIVE',
    name: 'Pasif MDF',
    isActive: false,
  };

  const createdYield = {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    rawMaterialId: activeMaterial.id,
    pieceWidthMm: 100,
    pieceLengthMm: 2100,
    netQty: 26,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    rawMaterial: activeMaterial,
  };

  const replacedYield = {
    ...createdYield,
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    netQty: 25,
  };

  function buildService(overrides?: {
    findMaterial?: jest.Mock;
    findExistingActive?: jest.Mock;
    findYieldUnique?: jest.Mock;
    findOtherActive?: jest.Mock;
    createImpl?: jest.Mock;
    updateImpl?: jest.Mock;
  }) {
    const tx = {
      productionYield: {
        create:
          overrides?.createImpl ??
          jest.fn().mockResolvedValue(createdYield),
        update: overrides?.updateImpl ?? jest.fn().mockResolvedValue({ ...createdYield, isActive: false }),
      },
    };

    const prisma = {
      rawMaterial: {
        findUnique:
          overrides?.findMaterial ?? jest.fn().mockResolvedValue(activeMaterial),
      },
      productionYield: {
        findFirst:
          overrides?.findExistingActive ??
          overrides?.findOtherActive ??
          jest.fn().mockResolvedValue(null),
        findUnique:
          overrides?.findYieldUnique ?? jest.fn().mockResolvedValue(createdYield),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const auditService = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const service = new ProductionYieldsService(prisma as never, auditService as never);
    return { service, prisma, auditService, tx };
  }

  it('geçerli production yield oluşturur', async () => {
    const { service, auditService, tx } = buildService();

    const result = await service.create({
      rawMaterialId: activeMaterial.id,
      pieceWidthMm: 100,
      pieceLengthMm: 2100,
      netQty: 26,
    });

    expect(result.netQty).toBe(26);
    expect(result.rawMaterial.name).toBe('22 MM MDF 210×280 Zımparalı');
    expect(tx.productionYield.create).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'ProductionYield',
        action: 'CREATE',
      }),
      tx,
    );
  });

  it('netQty=0 reddeder', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.create({
        rawMaterialId: activeMaterial.id,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
        netQty: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('negatif ölçü reddeder', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.create({
        rawMaterialId: activeMaterial.id,
        pieceWidthMm: -10,
        pieceLengthMm: 2100,
        netQty: 26,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aynı aktif kombinasyon duplicate reddeder', async () => {
    const { service } = buildService({
      findExistingActive: jest.fn().mockResolvedValue({ id: 'existing-active' }),
    });

    await expect(
      service.create({
        rawMaterialId: activeMaterial.id,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
        netQty: 25,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('pasif rawMaterial ile kayıt reddeder', async () => {
    const { service, prisma } = buildService({
      findMaterial: jest.fn().mockResolvedValue(inactiveMaterial),
    });

    await expect(
      service.create({
        rawMaterialId: inactiveMaterial.id,
        pieceWidthMm: 100,
        pieceLengthMm: 2100,
        netQty: 26,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('26 → 25 replacement: eski inactive, yeni active, audit yazılır', async () => {
    const { service, auditService, tx, prisma } = buildService({
      createImpl: jest.fn().mockResolvedValue(replacedYield),
      findOtherActive: jest.fn().mockResolvedValue(null),
    });

    const result = await service.replace(createdYield.id, {
      netQty: 25,
      reason: 'Üretim kesim planı güncellendi',
    });

    expect(result.netQty).toBe(25);
    expect(result.isActive).toBe(true);
    expect(tx.productionYield.update).toHaveBeenCalledWith({
      where: { id: createdYield.id },
      data: { isActive: false },
    });
    expect(tx.productionYield.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawMaterialId: activeMaterial.id,
          pieceWidthMm: 100,
          pieceLengthMm: 2100,
          netQty: 25,
          isActive: true,
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledTimes(3);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        fieldName: 'isActive',
        reason: 'Üretim kesim planı güncellendi',
      }),
      tx,
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        fieldName: 'netQty',
        oldValue: '26',
        newValue: '25',
      }),
      tx,
    );
  });

  it('replace: reason boşsa reddeder', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.replace(createdYield.id, { netQty: 25, reason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replace: netQty=0 reddeder', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.replace(createdYield.id, {
        netQty: 0,
        reason: 'Geçersiz',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replace: pasif yield güncelleme reddeder', async () => {
    const { service, prisma } = buildService({
      findYieldUnique: jest.fn().mockResolvedValue({
        ...createdYield,
        isActive: false,
      }),
    });

    await expect(
      service.replace(createdYield.id, {
        netQty: 25,
        reason: 'Deneme',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
