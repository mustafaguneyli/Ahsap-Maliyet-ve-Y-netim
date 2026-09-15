import { Prisma, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import {
  SUPURGELIK_PP_WRAPPING_TYPE_CODE,
  SUPURGELIK_PP_WRAPPING_TYPE_NAME,
} from '../extra-costs/supurgelik-extra-cost-seed';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CostCalculationService } from './cost-calculation.service';

const ROLLBACK = new Error('ROLLBACK_SUPURGELIK_PP_WRAPPING_DYNAMIC_TEST');
const SIZE = {
  thicknessMm: 12,
  widthMm: 120,
  lengthMm: 2800,
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

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

describe('Süpürgelik PP Sarma request-time DB regression', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
    const existing = await prisma.extraCostType.findUnique({
      where: { code: SUPURGELIK_PP_WRAPPING_TYPE_CODE },
    });
    if (!existing) {
      await prisma.extraCostType.create({
        data: {
          code: SUPURGELIK_PP_WRAPPING_TYPE_CODE,
          name: SUPURGELIK_PP_WRAPPING_TYPE_NAME,
          isActive: true,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('temporary wrapping 80→90 runtime değişir; NET/MDF/base ve normal ürünler değişmez; rollback eder', async () => {
    const group = await prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    if (!group?.isActive) {
      throw new Error('Dynamic test için aktif SUPURGELIK grubu gerekir.');
    }

    const type = await prisma.extraCostType.findUnique({
      where: { code: SUPURGELIK_PP_WRAPPING_TYPE_CODE },
    });
    if (!type?.isActive) {
      throw new Error('Dynamic test için aktif PP_WRAPPING ExtraCostType gerekir.');
    }

    const originalOpen = await prisma.extraCostValue.findMany({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        productId: null,
        isActive: true,
        effectiveTo: null,
      },
    });
    const productCountBefore = await prisma.product.count();
    const yieldCountBefore = await prisma.productionYield.count();

    try {
      await prisma.$transaction(async (tx) => {
        const extraCostsService = extraCostsServiceForTx(tx);
        const service = new CostCalculationService(
          tx as never,
          extraCostsService,
          {} as never,
        );

        await extraCostsService.updateValue('PP_WRAPPING', {
          productGroup: 'SUPURGELIK',
          amount: '80',
          effectiveFrom: todayIsoDate(),
        });

        const duz = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_SUPURGELIK',
          ...SIZE,
        });
        const decorative = await service.getSupurgelikMdfCost({
          productCode: 'DEKORATIF_SUPURGELIK',
          ...SIZE,
        });
        const duzPp = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_PP_SARMA_SUPURGELIK',
          ...SIZE,
        });
        const decorativePp = await service.getSupurgelikMdfCost({
          productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK',
          ...SIZE,
        });

        expect(duz.pricing?.publishedCashPrice).toBe('184');
        expect(decorative.pricing).toMatchObject({
          decorativeRate: '25',
          publishedCashPrice: '230',
        });
        expect(duzPp.mdfUnitCost).toBe('136.5625');
        expect(duzPp.extraCostsTotal).toBe('16');
        expect(duzPp.productionCost).toBe('152.5625');
        expect(duzPp.productionYield.netQty).toBe(16);
        expect(duzPp.pricing).toMatchObject({
          baseProductionCost: '152.5625',
          ppWrappingCost: '80',
          ppProductionCost: '232.5625',
          profitAmount: '46.5125',
          priceBeforeRounding: '279.075',
          publishedCashPrice: '280',
          statusCode: null,
        });
        expect(decorativePp.pricing).toMatchObject({
          baseProductionCost: '152.5625',
          ppWrappingCost: '80',
          ppProductionCost: '232.5625',
          basePublishedCashPrice: '280',
          decorativeRate: '25',
          publishedCashPrice: '350',
          statusCode: null,
        });

        const ppList = await service.getSupurgelikMdfCosts({
          productCode: 'DUZ_PP_SARMA_SUPURGELIK',
        });
        const nineMm = ppList.rows.filter((row) => row.thicknessMm === 9);
        expect(nineMm.length).toBeGreaterThan(0);
        expect(
          nineMm.every(
            (row) =>
              row.errorCode === 'RAW_MATERIAL_PRICE_MISSING' &&
              row.mdfUnitCost === null &&
              row.productionCost === null &&
              row.pricing?.publishedCashPrice === null,
          ),
        ).toBe(true);

        await extraCostsService.updateValue('PP_WRAPPING', {
          productGroup: 'SUPURGELIK',
          amount: '90',
          effectiveFrom: todayIsoDate(),
        });

        const duzPp90 = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_PP_SARMA_SUPURGELIK',
          ...SIZE,
        });
        const decorativePp90 = await service.getSupurgelikMdfCost({
          productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK',
          ...SIZE,
        });
        const duzAfter = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_SUPURGELIK',
          ...SIZE,
        });
        const decorativeAfter = await service.getSupurgelikMdfCost({
          productCode: 'DEKORATIF_SUPURGELIK',
          ...SIZE,
        });

        expect(duzPp90.mdfUnitCost).toBe(duzPp.mdfUnitCost);
        expect(duzPp90.extraCostsTotal).toBe(duzPp.extraCostsTotal);
        expect(duzPp90.productionCost).toBe(duzPp.productionCost);
        expect(duzPp90.productionYield.netQty).toBe(duzPp.productionYield.netQty);
        expect(duzPp90.pricing).toMatchObject({
          baseProductionCost: '152.5625',
          ppWrappingCost: '90',
          ppProductionCost: '242.5625',
          profitAmount: '48.5125',
          publishedCashPrice: '292',
        });
        expect(decorativePp90.pricing).toMatchObject({
          basePublishedCashPrice: '292',
          publishedCashPrice: '365',
        });
        expect(duzAfter.pricing?.publishedCashPrice).toBe('184');
        expect(decorativeAfter.pricing).toMatchObject({
          publishedCashPrice: '230',
        });

        const wrappingValueCount = await tx.extraCostValue.count({
          where: {
            extraCostTypeId: type.id,
            productGroupId: group.id,
          },
        });
        await extraCostsService.updateValue('PP_WRAPPING', {
          productGroup: 'SUPURGELIK',
          amount: '90',
          effectiveFrom: todayIsoDate(),
        });
        expect(
          await tx.extraCostValue.count({
            where: {
              extraCostTypeId: type.id,
              productGroupId: group.id,
            },
          }),
        ).toBe(wrappingValueCount);

        expect(await tx.product.count()).toBe(productCountBefore);
        expect(await tx.productionYield.count()).toBe(yieldCountBefore);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) {
        throw error;
      }
    }

    const restoredOpen = await prisma.extraCostValue.findMany({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        productId: null,
        isActive: true,
        effectiveTo: null,
      },
    });
    expect(restoredOpen.map((row) => row.id).sort()).toEqual(
      originalOpen.map((row) => row.id).sort(),
    );
    expect(
      restoredOpen.map((row) => row.amount.toString()).sort(),
    ).toEqual(originalOpen.map((row) => row.amount.toString()).sort());
    expect(await prisma.product.count()).toBe(productCountBefore);
    expect(await prisma.productionYield.count()).toBe(yieldCountBefore);
    expect(
      restoredOpen.some((row) => toDecimal(row.amount.toString()).equals('90')),
    ).toBe(
      originalOpen.some((row) => toDecimal(row.amount.toString()).equals('90')),
    );
  });
});
