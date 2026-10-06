import { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { PervazQtyService } from '../pervaz/pervaz-qty.service';
import { DekoratifPervazPremiumsService } from '../pricing/dekoratif-pervaz-premiums.service';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CostCalculationService } from './cost-calculation.service';

const ROLLBACK = new Error('ROLLBACK_DEKORATIF_PERVAZ_PREMIUM_DYNAMIC_TEST');
const TARGET = { thicknessMm: 12, widthMm: 100, lengthMm: 2200 } as const;

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

function premiumsServiceForTx(tx: Prisma.TransactionClient) {
  return new DekoratifPervazPremiumsService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      productGroup: tx.productGroup,
      product: tx.product,
      productionYield: tx.productionYield,
      pricingRowException: tx.pricingRowException,
    } as never,
    new AuditService(tx as never),
  );
}

describe('Dekoratif Pervaz premium request-time DB regression', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dekoratif fark 50→60 yalnız ilgili Dekoratif Pervaz satırını değiştirir; Ayarlı değişmez ve rollback eder', async () => {
    const group = await prisma.productGroup.findUnique({
      where: { code: 'PERVAZ' },
    });
    const product = group
      ? await prisma.product.findUnique({
          where: {
            productGroupId_code: {
              productGroupId: group.id,
              code: 'DEKORATIF_PERVAZ',
            },
          },
        })
      : null;
    if (!group?.isActive || !product?.isActive) {
      throw new Error('Dynamic test için aktif DEKORATIF_PERVAZ gerekir.');
    }

    const current = await prisma.pricingRowException.findFirst({
      where: {
        productId: product.id,
        thicknessMm: TARGET.thicknessMm,
        widthMm: TARGET.widthMm,
        lengthMm: TARGET.lengthMm,
        isActive: true,
        effectiveTo: null,
      },
    });
    if (
      current?.decorativePremiumRate == null ||
      !toDecimal(current.decorativePremiumRate.toString()).equals('50')
    ) {
      throw new Error(
        `Dynamic test 12/100/2200 dekoratif fark=50 bekler; bulunan=${current?.decorativePremiumRate?.toString() ?? 'null'}.`,
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const extraCostsService = extraCostsServiceForTx(tx);
        const premiumsService = premiumsServiceForTx(tx);
        const service = new CostCalculationService(
          tx as never,
          extraCostsService,
          new PervazQtyService(tx as never),
        );
        const now = new Date();

        const dekoratifBefore = await service.getDekoratifPervazCosts(now);
        const targetBefore = dekoratifBefore.rows.find(
          (row) =>
            row.thicknessMm === TARGET.thicknessMm &&
            row.widthMm === TARGET.widthMm &&
            row.lengthMm === TARGET.lengthMm,
        );
        if (targetBefore == null) {
          throw new Error('Dynamic test 12/100/2200 Dekoratif Pervaz satırı bekler.');
        }
        expect(targetBefore.pricing.decorativePremiumRate).toBe('50');

        const ayarliBefore = await service.getAyarliPervazMdfCosts(now);
        expect(ayarliBefore.rows.length).toBeGreaterThan(0);
        const ayarliSnapshot = ayarliBefore.rows.map((row) => ({
          thicknessMm: row.thicknessMm,
          widthMm: row.widthMm,
          lengthMm: row.lengthMm,
          productionCost: row.productionCost,
          publishedSalePrice: row.pricing.publishedSalePrice,
        }));

        await premiumsService.replacePremium(
          {
            productCode: 'DEKORATIF_PERVAZ',
            ...TARGET,
            rate: '60',
          },
          now,
        );

        const closed = await tx.pricingRowException.findUnique({
          where: { id: current.id },
        });
        expect(closed?.isActive).toBe(false);

        const dekoratifAfter = await service.getDekoratifPervazCosts(now);
        const targetAfter = dekoratifAfter.rows.find(
          (row) =>
            row.thicknessMm === TARGET.thicknessMm &&
            row.widthMm === TARGET.widthMm &&
            row.lengthMm === TARGET.lengthMm,
        );
        expect(targetAfter?.pricing.decorativePremiumRate).toBe('60');
        expect(targetAfter?.productionCost).toBe(targetBefore.productionCost);
        expect(targetAfter?.pricing.publishedSalePrice).not.toBe(
          targetBefore.pricing.publishedSalePrice,
        );

        const otherAfter = dekoratifAfter.rows.find(
          (row) =>
            row.thicknessMm === 18 &&
            row.widthMm === 100 &&
            row.lengthMm === 2200,
        );
        const otherBefore = dekoratifBefore.rows.find(
          (row) =>
            row.thicknessMm === 18 &&
            row.widthMm === 100 &&
            row.lengthMm === 2200,
        );
        if (otherBefore && otherAfter) {
          expect(otherAfter.pricing.decorativePremiumRate).toBe(
            otherBefore.pricing.decorativePremiumRate,
          );
          expect(otherAfter.pricing.publishedSalePrice).toBe(
            otherBefore.pricing.publishedSalePrice,
          );
        }

        const ayarliAfter = await service.getAyarliPervazMdfCosts(now);
        expect(
          ayarliAfter.rows.map((row) => ({
            thicknessMm: row.thicknessMm,
            widthMm: row.widthMm,
            lengthMm: row.lengthMm,
            productionCost: row.productionCost,
            publishedSalePrice: row.pricing.publishedSalePrice,
          })),
        ).toEqual(ayarliSnapshot);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const restored = await prisma.pricingRowException.findUnique({
      where: { id: current.id },
    });
    expect(restored?.isActive).toBe(true);
    expect(
      new Decimal(restored!.decorativePremiumRate!.toString()).equals('50'),
    ).toBe(true);
  });
});
