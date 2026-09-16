import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { RawMaterialsService } from '../materials/raw-materials.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';

const ROLLBACK = new Error('ROLLBACK_CITA_MDF_PRICE_DYNAMIC_TEST');
const MATERIAL_12 = 'MDF-12-2100X2800-ZIMPARALI';
const OTHER_GROUP_CODES = ['door_frame', 'PERVAZ', 'SUPURGELIK'] as const;

function rawMaterialsServiceForTx(tx: Prisma.TransactionClient) {
  return new RawMaterialsService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      rawMaterial: tx.rawMaterial,
      rawMaterialPrice: tx.rawMaterialPrice,
    } as never,
    new AuditService(tx as never),
  );
}

function citaMdfServiceForTx(tx: Prisma.TransactionClient) {
  const net = new CitaNetService(tx as never);
  return new CitaMdfService(net, tx as never);
}

async function productScopedYieldCount(
  prisma: PrismaClient | Prisma.TransactionClient,
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

describe('CITA MDF cost DB (yazmaz, fiyat rollback)', () => {
  const prisma = new PrismaClient();
  const service = new CitaMdfService(new CitaNetService(prisma as never), prisma as never);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('standart MASTER ve custom NET için mdfUnitCost = CARD / netQty ve DB şişirmez', async () => {
    const countsBefore = {
      productSize: await prisma.productSize.count(),
      productionYield: await prisma.productionYield.count(),
      recipe: await prisma.recipe.count(),
      rawMaterialPrice: await prisma.rawMaterialPrice.count(),
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

    const cases = [
      { thicknessMm: '10', widthMm: '10', netQty: 150, source: 'MASTER' },
      { thicknessMm: '14', widthMm: '40', netQty: 47, source: 'MASTER' },
      { thicknessMm: '18', widthMm: '80', netQty: 25, source: 'MASTER' },
      { thicknessMm: '14', widthMm: '35', netQty: 53, source: 'CALCULATED_CUT_RULE' },
      { thicknessMm: '12', widthMm: '25', netQty: 72, source: 'CALCULATED_CUT_RULE' },
      { thicknessMm: '18', widthMm: '47', netQty: 41, source: 'CALCULATED_CUT_RULE' },
      { thicknessMm: '30', widthMm: '65', netQty: 30, source: 'CALCULATED_CUT_RULE' },
    ] as const;

    for (const row of cases) {
      const result = await service.getMdfCost({
        thicknessMm: row.thicknessMm,
        widthMm: row.widthMm,
        lengthMm: '2800',
      });
      expect(result.productionYield).toEqual({
        netQty: row.netQty,
        source: row.source,
      });
      expect(result.sheetPrice.priceType).toBe('CARD_INSTALLMENT');
      expect(result.mdfUnitCost).toBe(
        toDecimal(result.sheetPrice.amount).div(String(row.netQty)).toFixed(),
      );
      expect(result).not.toHaveProperty('extraCosts');
      expect(result).not.toHaveProperty('productionCost');
      if (row.thicknessMm === '18') {
        expect(result.rawMaterial.code).toBe('MDF-18-2100X2800-ZIMPARALI');
      }
    }

    await expect(
      service.getMdfCost({ thicknessMm: '9', widthMm: '35', lengthMm: '2800' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getMdfCost({ thicknessMm: '14', widthMm: '35', lengthMm: '2200' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getMdfCost({ thicknessMm: '14', widthMm: '0', lengthMm: '2800' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getMdfCost({ thicknessMm: '14', widthMm: '2097', lengthMm: '2800' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await prisma.productSize.count()).toBe(countsBefore.productSize);
    expect(await prisma.productionYield.count()).toBe(countsBefore.productionYield);
    expect(await prisma.recipe.count()).toBe(countsBefore.recipe);
    expect(await prisma.rawMaterialPrice.count()).toBe(
      countsBefore.rawMaterialPrice,
    );
    expect(
      await prisma.productionYield.count({ where: { productId: null } }),
    ).toBe(countsBefore.genericYield);
    expect(await prisma.extraCostValue.count()).toBe(countsBefore.extraCostValue);
    for (const before of countsBefore.otherYields) {
      expect(await productScopedYieldCount(prisma, before.code)).toBe(before.count);
    }
  });

  it('12 mm CARD X→X+100 olunca NET aynı kalır, yalnız maliyet değişir ve rollback edilir', async () => {
    const material = await prisma.rawMaterial.findUnique({
      where: { code: MATERIAL_12 },
    });
    if (!material?.isActive) {
      throw new Error(`Dynamic test için aktif ${MATERIAL_12} gerekir.`);
    }

    const openPrices = await prisma.rawMaterialPrice.findMany({
      where: {
        rawMaterialId: material.id,
        priceType: 'CARD_INSTALLMENT',
        isActive: true,
        effectiveTo: null,
      },
    });
    if (openPrices.length !== 1) {
      throw new Error(
        `Dynamic test için tek açık CARD_INSTALLMENT gerekir; bulunan=${openPrices.length}.`,
      );
    }
    const original = openPrices[0];
    const originalAmount = toDecimal(original.price.toString());
    const nextAmount = originalAmount.plus(100);
    const asOf = new Date(original.effectiveFrom.getTime() + 1000);

    try {
      await prisma.$transaction(async (tx) => {
        const rawMaterialsService = rawMaterialsServiceForTx(tx);
        const txService = citaMdfServiceForTx(tx);
        const query = {
          thicknessMm: '12',
          widthMm: '25',
          lengthMm: '2800',
        } as const;

        const productSnapshot = await tx.product.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, code: true, isActive: true, updatedAt: true },
        });
        const yieldSnapshot = await tx.productionYield.findMany({
          orderBy: { id: 'asc' },
          select: {
            id: true,
            productId: true,
            rawMaterialId: true,
            pieceWidthMm: true,
            pieceLengthMm: true,
            netQty: true,
            isActive: true,
            updatedAt: true,
          },
        });

        const before = await txService.getMdfCost(query, asOf);
        expect(before.productionYield).toEqual({
          netQty: 72,
          source: 'CALCULATED_CUT_RULE',
        });
        expect(before.cut.effectiveCutPitchMm).toBe('29');
        expect(before.sheetPrice.amount).toBe(originalAmount.toFixed());
        expect(before.mdfUnitCost).toBe(originalAmount.div('72').toFixed());

        const updated = await rawMaterialsService.updateCardInstallmentPrice(
          material.id,
          { price: nextAmount.toFixed() },
          asOf,
        );
        expect(updated.changed).toBe(true);

        const after = await txService.getMdfCost(query, asOf);
        expect(after.productionYield).toEqual(before.productionYield);
        expect(after.cut.effectiveCutPitchMm).toBe(before.cut.effectiveCutPitchMm);
        expect(after.sheetPrice.amount).toBe(nextAmount.toFixed());
        expect(after.mdfUnitCost).toBe(nextAmount.div('72').toFixed());

        expect(
          await tx.product.findMany({
            orderBy: { id: 'asc' },
            select: { id: true, code: true, isActive: true, updatedAt: true },
          }),
        ).toEqual(productSnapshot);
        expect(
          await tx.productionYield.findMany({
            orderBy: { id: 'asc' },
            select: {
              id: true,
              productId: true,
              rawMaterialId: true,
              pieceWidthMm: true,
              pieceLengthMm: true,
              netQty: true,
              isActive: true,
              updatedAt: true,
            },
          }),
        ).toEqual(yieldSnapshot);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const restored = await prisma.rawMaterialPrice.findUnique({
      where: { id: original.id },
    });
    expect(restored?.effectiveTo).toBeNull();
    expect(toDecimal(restored!.price.toString()).equals(originalAmount)).toBe(true);
  });
});
