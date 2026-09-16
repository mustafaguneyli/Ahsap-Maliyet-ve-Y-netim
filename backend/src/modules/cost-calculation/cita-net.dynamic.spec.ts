import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CitaNetService } from './cita-net.service';

const OTHER_GROUP_CODES = ['door_frame', 'PERVAZ', 'SUPURGELIK'] as const;

async function productScopedYieldCount(
  prisma: PrismaClient,
  groupCode: string,
): Promise<number> {
  const group = await prisma.productGroup.findUnique({ where: { code: groupCode } });
  if (!group) {
    return 0;
  }
  const products = await prisma.product.findMany({
    where: { productGroupId: group.id },
    select: { id: true },
  });
  if (products.length === 0) {
    return 0;
  }
  return prisma.productionYield.count({
    where: { productId: { in: products.map((product) => product.id) } },
  });
}

describe('CITA NET runtime (DB yazmaz)', () => {
  const prisma = new PrismaClient();
  const service = new CitaNetService(prisma as never);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('standart enlerde MASTER, custom enlerde cut rule kullanır ve kayıt şişirmez', async () => {
    const countsBefore = {
      productSize: await prisma.productSize.count(),
      productionYield: await prisma.productionYield.count(),
      recipe: await prisma.recipe.count(),
      genericYield: await prisma.productionYield.count({
        where: { productId: null },
      }),
      extraCostValue: await prisma.extraCostValue.count(),
      otherYields: await Promise.all(
        OTHER_GROUP_CODES.map(async (code) => ({
          code,
          count: await productScopedYieldCount(prisma, code),
        })),
      ),
    };

    const standard10 = await service.resolveNet({
      thicknessMm: '14',
      widthMm: '10',
      lengthMm: '2800',
    });
    const standard40 = await service.resolveNet({
      thicknessMm: '14',
      widthMm: '40',
      lengthMm: '2800',
    });
    const standard80 = await service.resolveNet({
      thicknessMm: '14',
      widthMm: '80',
      lengthMm: '2800',
    });

    expect(standard10).toMatchObject({ netQty: 150, source: 'MASTER' });
    expect(standard40).toMatchObject({ netQty: 47, source: 'MASTER' });
    expect(standard80).toMatchObject({ netQty: 25, source: 'MASTER' });

    const custom35 = await service.resolveNet({
      thicknessMm: '14',
      widthMm: '35',
      lengthMm: '2800',
    });
    const custom25 = await service.resolveNet({
      thicknessMm: '12',
      widthMm: '25',
      lengthMm: '2800',
    });
    const custom47 = await service.resolveNet({
      thicknessMm: '18',
      widthMm: '47',
      lengthMm: '2800',
    });
    const custom65 = await service.resolveNet({
      thicknessMm: '30',
      widthMm: '65',
      lengthMm: '2800',
    });

    expect(custom35).toMatchObject({
      netQty: 53,
      source: 'CALCULATED_CUT_RULE',
      effectiveCutPitchMm: '39',
      rawMaterial: { code: 'MDF-14-2100X2800-ZIMPARALI' },
    });
    expect(custom25).toMatchObject({
      netQty: 72,
      source: 'CALCULATED_CUT_RULE',
      effectiveCutPitchMm: '29',
    });
    expect(custom47).toMatchObject({
      netQty: 41,
      source: 'CALCULATED_CUT_RULE',
      effectiveCutPitchMm: '51',
      rawMaterial: { code: 'MDF-18-2100X2800-ZIMPARALI' },
    });
    expect(custom65).toMatchObject({
      netQty: 30,
      source: 'CALCULATED_CUT_RULE',
      effectiveCutPitchMm: '69',
    });

    await expect(
      service.resolveNet({ thicknessMm: '9', widthMm: '35', lengthMm: '2800' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resolveNet({
        thicknessMm: '14',
        widthMm: '35',
        lengthMm: '2200',
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

    expect(await prisma.productSize.count()).toBe(countsBefore.productSize);
    expect(await prisma.productionYield.count()).toBe(
      countsBefore.productionYield,
    );
    expect(await prisma.recipe.count()).toBe(countsBefore.recipe);
    expect(
      await prisma.productionYield.count({ where: { productId: null } }),
    ).toBe(countsBefore.genericYield);
    expect(await prisma.extraCostValue.count()).toBe(countsBefore.extraCostValue);

    for (const before of countsBefore.otherYields) {
      expect(await productScopedYieldCount(prisma, before.code)).toBe(
        before.count,
      );
    }
  });
});
