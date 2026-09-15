import { Prisma, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CostCalculationService } from './cost-calculation.service';

const ROLLBACK = new Error('ROLLBACK_SUPURGELIK_DYNAMIC_SOURCE_TEST');
const SIZE = {
  productCode: 'DUZ_SUPURGELIK' as const,
  thicknessMm: 12,
  widthMm: 120,
  lengthMm: 2800,
};
const SUPURGELIK_PRODUCT_CODES = [
  'DUZ_SUPURGELIK',
  'DEKORATIF_SUPURGELIK',
  'DUZ_PP_SARMA_SUPURGELIK',
  'DEKORATIF_PP_SARMA_SUPURGELIK',
] as const;

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

function assertDuzGolden(
  row: {
    mdfUnitCost: string;
    extraCostsTotal: string;
    productionCost: string;
    pricing?: { publishedCashPrice?: string | null };
  },
  expected: {
    extraCostsTotal: string;
    productionCost: string;
    publishedCashPrice: string;
  },
) {
  expect(row.mdfUnitCost).toBe('136.5625');
  expect(row.extraCostsTotal).toBe(expected.extraCostsTotal);
  expect(row.productionCost).toBe(expected.productionCost);
  expect(row.pricing?.publishedCashPrice).toBe(expected.publishedCashPrice);
}

describe('Süpürgelik ortak gideri request-time DB regression', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function requireOpenGroupValue(typeCode: 'CUTTING' | 'LABOR', expectedAmount: string) {
    const group = await prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    const type = await prisma.extraCostType.findUnique({
      where: { code: typeCode },
    });
    if (!group?.isActive || !type?.isActive) {
      throw new Error(`Dynamic test için aktif SUPURGELIK ve ${typeCode} masterları gerekir.`);
    }

    const openValues = await prisma.extraCostValue.findMany({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        productId: null,
        isActive: true,
        effectiveTo: null,
      },
    });
    if (openValues.length !== 1) {
      throw new Error(
        `Dynamic test için tam bir aktif SUPURGELIK/${typeCode} gerekir; bulunan=${openValues.length}.`,
      );
    }
    if (!toDecimal(openValues[0].amount.toString()).equals(toDecimal(expectedAmount))) {
      throw new Error(
        `Dynamic test beklenen SUPURGELIK/${typeCode}=${expectedAmount}; bulunan=${openValues[0].amount.toString()}.`,
      );
    }

    return { group, type, open: openValues[0] };
  }

  async function runHistoryBump(input: {
    typeCode: 'CUTTING' | 'LABOR';
    fromAmount: string;
    toAmount: string;
  }) {
    const { group, type, open } = await requireOpenGroupValue(input.typeCode, input.fromAmount);

    try {
      await prisma.$transaction(async (tx) => {
        const extraCostsService = extraCostsServiceForTx(tx);
        const service = new CostCalculationService(tx as never, extraCostsService, {} as never);

        const before = await service.getSupurgelikMdfCost(SIZE);
        assertDuzGolden(before, {
          extraCostsTotal: '16',
          productionCost: '152.5625',
          publishedCashPrice: '184',
        });

        await extraCostsService.updateValue(input.typeCode, {
          productGroup: 'SUPURGELIK',
          amount: input.toAmount,
          effectiveFrom: todayIsoDate(),
        });

        const closed = await tx.extraCostValue.findUnique({ where: { id: open.id } });
        expect(closed?.effectiveTo).not.toBeNull();
        expect(toDecimal(closed!.amount.toString()).equals(toDecimal(input.fromAmount))).toBe(
          true,
        );

        const nextOpen = await tx.extraCostValue.findMany({
          where: {
            extraCostTypeId: type.id,
            productGroupId: group.id,
            productId: null,
            isActive: true,
            effectiveTo: null,
          },
        });
        expect(nextOpen).toHaveLength(1);
        expect(nextOpen[0].id).not.toBe(open.id);
        expect(toDecimal(nextOpen[0].amount.toString()).equals(toDecimal(input.toAmount))).toBe(
          true,
        );
        expect(nextOpen[0].productId).toBeNull();

        const productScoped = await tx.extraCostValue.findMany({
          where: {
            extraCostTypeId: type.id,
            productGroupId: group.id,
            productId: { not: null },
            isActive: true,
          },
        });
        expect(productScoped).toHaveLength(0);

        const after = await service.getSupurgelikMdfCost(SIZE);
        expect(after.mdfUnitCost).toBe(before.mdfUnitCost);
        assertDuzGolden(after, {
          extraCostsTotal: '17',
          productionCost: '153.5625',
          publishedCashPrice: '185',
        });
        expect(after.pricing).toMatchObject({
          profitRate: '20',
          profitAmount: '30.7125',
          priceBeforeRounding: '184.275',
          roundedBaseSalePrice: '185',
          publishedCashPrice: '185',
        });

        const fourProducts = [];
        for (const productCode of SUPURGELIK_PRODUCT_CODES) {
          fourProducts.push(
            await service.getSupurgelikMdfCost({
              productCode,
              thicknessMm: 12,
              widthMm: 120,
              lengthMm: 2800,
            }),
          );
        }
        expect(new Set(fourProducts.map((row) => row.extraCostsTotal))).toEqual(new Set(['17']));
        expect(new Set(fourProducts.map((row) => row.productionCost))).toEqual(
          new Set(['153.5625']),
        );
        expect(new Set(fourProducts.map((row) => row.mdfUnitCost))).toEqual(new Set(['136.5625']));
        expect(fourProducts[0].pricing?.publishedCashPrice).toBe('185');
        expect(fourProducts[1].pricing).toMatchObject({
          basePublishedCashPrice: '185',
          decorativeRate: '25',
          publishedCashPrice: '232',
        });
        expect(fourProducts[2].productionCost).toBe('153.5625');
        expect(fourProducts[2].extraCostsTotal).toBe('17');
        expect(fourProducts[2].mdfUnitCost).toBe('136.5625');
        const wrapping = await extraCostsService.getSupurgelikPpWrapping();
        if (wrapping.items[0]?.amount == null) {
          expect(fourProducts[2].pricing).toMatchObject({
            publishedCashPrice: null,
            statusCode: 'PP_WRAPPING_COST_MISSING',
          });
          expect(fourProducts[3].pricing).toMatchObject({
            publishedCashPrice: null,
            statusCode: 'PP_WRAPPING_COST_MISSING',
          });
        } else {
          expect(fourProducts[2].pricing).toMatchObject({
            baseProductionCost: '153.5625',
            ppWrappingCost: wrapping.items[0].amount,
          });
          expect(fourProducts[3].pricing).toMatchObject({
            baseProductionCost: '153.5625',
            ppWrappingCost: wrapping.items[0].amount,
          });
        }

        const list = await service.getSupurgelikMdfCosts({ productCode: 'DUZ_SUPURGELIK' });
        const missingNineMm = list.rows.filter(
          (row) =>
            row.thicknessMm === 9 && row.errorCode === 'RAW_MATERIAL_PRICE_MISSING',
        );
        for (const row of missingNineMm) {
          expect(row.mdfUnitCost).toBeNull();
          expect(row.productionCost).toBeNull();
          expect(row.pricing?.publishedCashPrice).toBeNull();
          expect(row.extraCostsTotal).toBe('17');
        }

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) {
        throw error;
      }
    }

    const restored = await prisma.extraCostValue.findUnique({ where: { id: open.id } });
    expect(restored?.effectiveTo).toBeNull();
    expect(toDecimal(restored!.amount.toString()).equals(toDecimal(input.fromAmount))).toBe(true);

    const stillOpen = await prisma.extraCostValue.findMany({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        productId: null,
        isActive: true,
        effectiveTo: null,
      },
    });
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0].id).toBe(open.id);
  }

  it('CUTTING 4→5 updateValue history ile 12/120 nakit 184→185 olur ve rollback eder', async () => {
    await runHistoryBump({ typeCode: 'CUTTING', fromAmount: '4', toAmount: '5' });
  });

  it('LABOR 12→13 updateValue history ile extra/production +1 ve nakit 185 olur, rollback eder', async () => {
    await runHistoryBump({ typeCode: 'LABOR', fromAmount: '12', toAmount: '13' });
  });
});
