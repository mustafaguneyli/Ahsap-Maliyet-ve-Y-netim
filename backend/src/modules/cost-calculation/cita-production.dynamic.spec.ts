import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';
import { CITA_EXTRA_COST_MISSING } from '../../calculation-engine/calculators/cita-production-calculator';

const ROLLBACK = new Error('ROLLBACK_CITA_PRODUCTION_DYNAMIC_TEST');
const OTHER_GROUP_CODES = ['door_frame', 'PERVAZ', 'SUPURGELIK'] as const;
const CUSTOM = {
  thicknessMm: '14',
  widthMm: '35',
  lengthMm: '2800',
} as const;
const MASTER = {
  thicknessMm: '14',
  widthMm: '40',
  lengthMm: '2800',
} as const;

function extraCostsServiceForTx(tx: Prisma.TransactionClient) {
  return new ExtraCostsService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      productGroup: tx.productGroup,
      extraCostType: tx.extraCostType,
      extraCostValue: tx.extraCostValue,
    } as never,
    new AuditService(tx as never),
  );
}

function productionServiceForTx(tx: Prisma.TransactionClient) {
  const extras = extraCostsServiceForTx(tx);
  const mdf = new CitaMdfService(new CitaNetService(tx as never), tx as never);
  return {
    extras,
    production: new CitaProductionService(mdf, extras),
  };
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

async function citaExtraCostValueCount(
  prisma: PrismaClient | Prisma.TransactionClient,
): Promise<number> {
  const group = await prisma.productGroup.findUnique({ where: { code: 'CITA' } });
  if (!group) {
    return 0;
  }
  return prisma.extraCostValue.count({
    where: { productGroupId: group.id },
  });
}

describe('CITA production ExtraCost DB (tutar seed yok, rollback)', () => {
  const prisma = new PrismaClient();
  const service = new CitaProductionService(
    new CitaMdfService(new CitaNetService(prisma as never), prisma as never),
    new ExtraCostsService(prisma as never, new AuditService(prisma as never)),
  );

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('başlangıçta ExtraCostValue yoksa EXTRA_COST_MISSING; test tutarları rollback edilir', async () => {
    expect(await citaExtraCostValueCount(prisma)).toBe(0);

    const missing = await service.getProductionCost(CUSTOM);
    expect(missing.statusCode).toBe(CITA_EXTRA_COST_MISSING);
    expect(missing.productionCost).toBeNull();
    expect(missing.missingExtraCosts).toEqual(['CUTTING', 'LABOR']);
    expect(missing.mdfUnitCost).toBeTruthy();
    expect(missing.productionYield).toEqual({
      netQty: 53,
      source: 'CALCULATED_CUT_RULE',
    });

    const countsBefore = {
      productSize: await prisma.productSize.count(),
      productionYield: await prisma.productionYield.count(),
      recipe: await prisma.recipe.count(),
      extraCostValue: await prisma.extraCostValue.count(),
      otherYields: await Promise.all(
        OTHER_GROUP_CODES.map(async (code) => ({
          code,
          count: await productScopedYieldCount(prisma, code),
        })),
      ),
    };

    try {
      await prisma.$transaction(async (tx) => {
        const { extras, production } = productionServiceForTx(tx);
        const asOf = new Date().toISOString().slice(0, 10);

        await extras.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount: '5',
          effectiveFrom: asOf,
        });
        await extras.updateValue('LABOR', {
          productGroup: 'CITA',
          amount: '10',
          effectiveFrom: asOf,
        });

        const customBefore = await production.getProductionCost(CUSTOM);
        expect(customBefore.productionYield).toEqual({
          netQty: 53,
          source: 'CALCULATED_CUT_RULE',
        });
        expect(customBefore.extraCostsTotal).toBe('15');
        expect(customBefore.productionCost).toBe(
          toDecimal(customBefore.mdfUnitCost).plus(15).toFixed(),
        );
        expect(customBefore.statusCode).toBeNull();

        const masterBefore = await production.getProductionCost(MASTER);
        expect(masterBefore.productionYield).toEqual({
          netQty: 47,
          source: 'MASTER',
        });
        expect(masterBefore.extraCostsTotal).toBe('15');
        expect(masterBefore.sheetPrice.amount).toBe(customBefore.sheetPrice.amount);

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
        const sizeSnapshot = await tx.productSize.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, widthMm: true, lengthMm: true, updatedAt: true },
        });

        await extras.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount: '6',
          effectiveFrom: asOf,
        });

        const customAfter = await production.getProductionCost(CUSTOM);
        expect(customAfter.productionYield).toEqual(customBefore.productionYield);
        expect(customAfter.sheetPrice.amount).toBe(customBefore.sheetPrice.amount);
        expect(customAfter.mdfUnitCost).toBe(customBefore.mdfUnitCost);
        expect(customAfter.cut.effectiveCutPitchMm).toBe(
          customBefore.cut.effectiveCutPitchMm,
        );
        expect(customAfter.extraCostsTotal).toBe('16');
        expect(customAfter.productionCost).toBe(
          toDecimal(customBefore.productionCost!).plus(1).toFixed(),
        );

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
        expect(
          await tx.productSize.findMany({
            orderBy: { id: 'asc' },
            select: { id: true, widthMm: true, lengthMm: true, updatedAt: true },
          }),
        ).toEqual(sizeSnapshot);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    expect(await citaExtraCostValueCount(prisma)).toBe(0);
    expect(await prisma.productSize.count()).toBe(countsBefore.productSize);
    expect(await prisma.productionYield.count()).toBe(countsBefore.productionYield);
    expect(await prisma.recipe.count()).toBe(countsBefore.recipe);
    expect(await prisma.extraCostValue.count()).toBe(countsBefore.extraCostValue);
    for (const before of countsBefore.otherYields) {
      expect(await productScopedYieldCount(prisma, before.code)).toBe(before.count);
    }
  });
});
