import { BadRequestException } from '@nestjs/common';
import { CitaNetService } from './cita-net.service';

const MATERIAL_14 = {
  id: 'mat-14',
  code: 'MDF-14-2100X2800-ZIMPARALI',
  isActive: true,
  sheetWidthMm: 2100,
  sheetLengthMm: 2800,
};

function buildService(options?: {
  masters?: Array<{ id: string; netQty: number }>;
  material?: typeof MATERIAL_14;
}) {
  const prisma = {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'g-cita',
        code: 'CITA',
        isActive: true,
      }),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'p-cita',
        code: 'CITA',
        isActive: true,
      }),
    },
    rawMaterial: {
      findUnique: jest.fn().mockResolvedValue(options?.material ?? MATERIAL_14),
    },
    productionYield: {
      findMany: jest.fn().mockResolvedValue(options?.masters ?? []),
      create: jest.fn(),
    },
    productSize: { create: jest.fn(), findUnique: jest.fn() },
    recipe: { create: jest.fn() },
  };

  return { prisma, service: new CitaNetService(prisma as never) };
}

describe('CitaNetService', () => {
  it('standart 10/40/80 mm MASTER NET kullanır ve formülü bypass etmez', async () => {
    const { prisma, service } = buildService({
      masters: [{ id: 'master-40', netQty: 99 }],
    });

    const result = await service.resolveNet({
      thicknessMm: '14',
      widthMm: '40',
      lengthMm: '2800',
    });

    expect(result).toMatchObject({
      productCode: 'CITA',
      thicknessMm: '14',
      widthMm: '40',
      lengthMm: '2800',
      netQty: 99,
      source: 'MASTER',
      effectiveCutPitchMm: '44',
      bladeAllowanceMm: 4,
      countSideMm: 2100,
    });
    expect(prisma.productionYield.findMany).toHaveBeenCalledWith({
      where: {
        productId: 'p-cita',
        rawMaterialId: 'mat-14',
        pieceWidthMm: 40,
        pieceLengthMm: 2800,
        isActive: true,
      },
    });
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
    expect(prisma.productSize.create).not.toHaveBeenCalled();
  });

  it.each([
    ['35', '39', 53],
    ['25', '29', 72],
    ['47', '51', 41],
    ['65', '69', 30],
  ])(
    'custom %s mm CALCULATED_CUT_RULE NET %i döner ve DB yazmaz',
    async (widthMm, pitch, netQty) => {
      const { prisma, service } = buildService({ masters: [] });

      const result = await service.resolveNet({
        thicknessMm: '14',
        widthMm,
        lengthMm: '2800',
      });

      expect(result.source).toBe('CALCULATED_CUT_RULE');
      expect(result.netQty).toBe(netQty);
      expect(result.effectiveCutPitchMm).toBe(pitch);
      expect(prisma.productionYield.create).not.toHaveBeenCalled();
      expect(prisma.productSize.create).not.toHaveBeenCalled();
      expect(prisma.recipe.create).not.toHaveBeenCalled();
    },
  );

  it('18 mm yalnız ZIMPARALI kodunu çözer', async () => {
    const { prisma, service } = buildService({
      material: {
        id: 'mat-18',
        code: 'MDF-18-2100X2800-ZIMPARALI',
        isActive: true,
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
      },
    });

    const result = await service.resolveNet({
      thicknessMm: '18',
      widthMm: '47',
      lengthMm: '2800',
    });

    expect(prisma.rawMaterial.findUnique).toHaveBeenCalledWith({
      where: { code: 'MDF-18-2100X2800-ZIMPARALI' },
    });
    expect(result.rawMaterial.code).toBe('MDF-18-2100X2800-ZIMPARALI');
    expect(result.netQty).toBe(41);
    expect(result.source).toBe('CALCULATED_CUT_RULE');
  });

  it('desteklenmeyen kalınlık, boy ve eni reddeder', async () => {
    const { prisma, service } = buildService();

    await expect(
      service.resolveNet({ thicknessMm: '9', widthMm: '35', lengthMm: '2800' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resolveNet({
        thicknessMm: '14',
        widthMm: '35',
        lengthMm: '2100',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resolveNet({ thicknessMm: '14', widthMm: '0', lengthMm: '2800' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resolveNet({
        thicknessMm: '14',
        widthMm: '2097',
        lengthMm: '2800',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productionYield.findMany).not.toHaveBeenCalled();
  });

  it('aynı CITA bağlamında birden fazla aktif MASTER varsa açık hata verir', async () => {
    const { service } = buildService({
      masters: [
        { id: 'master-a', netQty: 47 },
        { id: 'master-b', netQty: 48 },
      ],
    });

    await expect(
      service.resolveNet({
        thicknessMm: '14',
        widthMm: '40',
        lengthMm: '2800',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generic productId=null MASTER aramaz', async () => {
    const { prisma, service } = buildService();
    await service.resolveNet({
      thicknessMm: '14',
      widthMm: '40',
      lengthMm: '2800',
    });
    expect(prisma.productionYield.findMany.mock.calls[0][0].where.productId).toBe(
      'p-cita',
    );
    expect(
      prisma.productionYield.findMany.mock.calls[0][0].where.productId,
    ).not.toBeNull();
  });
});
