import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { RawMaterialsService } from '../materials/raw-materials.service';
import { CostCalculationService } from './cost-calculation.service';

const ROLLBACK = new Error('ROLLBACK_MISSING_SOURCE_COMPLETION');
const NINE_MM = 'MDF-9-2100X2800-ZIMPARALI';
const TEST_CASH = '1234.5';
const TEST_PP = '7.5';
const SIZE = { thicknessMm: 12, widthMm: 120, lengthMm: 2800 };

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

function costServiceForTx(tx: Prisma.TransactionClient) {
  return new CostCalculationService(
    tx as never,
    extraCostsServiceForTx(tx),
    {} as never,
  );
}

describe('eksik kaynak tamamlama (DB rollback)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('9 mm nakit test fiyatı yalnız nakit maliyeti açar ve rollback eder', async () => {
    const material = await prisma.rawMaterial.findUnique({
      where: { code: NINE_MM },
    });
    if (!material?.isActive) {
      throw new Error(`Dynamic test için aktif ${NINE_MM} gerekir.`);
    }
    const openCashBefore = await prisma.rawMaterialPrice.count({
      where: {
        rawMaterialId: material.id,
        priceType: 'CASH',
        isActive: true,
        effectiveTo: null,
      },
    });
    expect(openCashBefore).toBe(0);

    try {
      await prisma.$transaction(async (tx) => {
        const service = costServiceForTx(tx);
        const beforeCash = await service.getSupurgelikMdfCosts(
          { productCode: 'DUZ_SUPURGELIK', materialPriceType: 'CASH' },
        );
        const beforeCard = await service.getSupurgelikMdfCost(
          {
            productCode: 'DUZ_SUPURGELIK',
            thicknessMm: 9,
            widthMm: 80,
            lengthMm: 2800,
          },
        );
        expect(
          beforeCash.rows
            .filter((row) => row.thicknessMm === 9)
            .every((row) => row.errorCode === 'RAW_MATERIAL_PRICE_MISSING'),
        ).toBe(true);
        expect(beforeCard.sheetPrice).toMatchObject({
          priceType: 'CARD_INSTALLMENT',
          amount: '1880',
        });

        await rawMaterialsServiceForTx(tx).updateCashPrice(material.id, {
          price: TEST_CASH,
        });

        const afterCash = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_SUPURGELIK',
          thicknessMm: 9,
          widthMm: 80,
          lengthMm: 2800,
          materialPriceType: 'CASH',
        });
        const afterCard = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_SUPURGELIK',
          thicknessMm: 9,
          widthMm: 80,
          lengthMm: 2800,
        });
        expect(afterCash.sheetPrice).toMatchObject({
          priceType: 'CASH',
          amount: TEST_CASH,
        });
        expect(afterCash.productionCost).not.toBeNull();
        expect(afterCard.sheetPrice.amount).toBe(beforeCard.sheetPrice.amount);
        expect(afterCard.mdfUnitCost).toBe(beforeCard.mdfUnitCost);
        expect(afterCard.productionCost).toBe(beforeCard.productionCost);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const openCashAfter = await prisma.rawMaterialPrice.count({
      where: {
        rawMaterialId: material.id,
        priceType: 'CASH',
        isActive: true,
        effectiveTo: null,
      },
    });
    expect(openCashAfter).toBe(0);
  });

  it('test PP sarma tutarı yalnız PP varyantlarını etkiler ve rollback eder', async () => {
    const group = await prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    const type = await prisma.extraCostType.findUnique({
      where: { code: 'PP_WRAPPING' },
    });
    if (!group?.isActive || !type?.isActive) {
      throw new Error('Dynamic test için aktif SUPURGELIK PP_WRAPPING gerekir.');
    }
    const openBefore = await prisma.extraCostValue.count({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        isActive: true,
        effectiveTo: null,
      },
    });

    try {
      await prisma.$transaction(async (tx) => {
        const service = costServiceForTx(tx);
        const duzBefore = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_SUPURGELIK',
          ...SIZE,
        });
        const decorativeBefore = await service.getSupurgelikMdfCost({
          productCode: 'DEKORATIF_SUPURGELIK',
          ...SIZE,
        });
        const ppBefore = await service.getSupurgelikMdfCosts({
          productCode: 'DUZ_PP_SARMA_SUPURGELIK',
        });
        expect(
          ppBefore.rows.every(
            (row) => row.errorCode === 'PP_WRAPPING_COST_MISSING',
          ),
        ).toBe(true);

        await extraCostsServiceForTx(tx).updateValue('PP_WRAPPING', {
          productGroup: 'SUPURGELIK',
          amount: TEST_PP,
          effectiveFrom: todayIsoDate(),
        });

        const duzAfter = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_SUPURGELIK',
          ...SIZE,
        });
        const decorativeAfter = await service.getSupurgelikMdfCost({
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

        expect(duzAfter.productionCost).toBe(duzBefore.productionCost);
        expect(duzAfter.pricing?.publishedCashPrice).toBe(
          duzBefore.pricing?.publishedCashPrice,
        );
        expect(decorativeAfter.pricing?.publishedCashPrice).toBe(
          decorativeBefore.pricing?.publishedCashPrice,
        );
        expect(duzPp.pricing).toMatchObject({ ppWrappingCost: TEST_PP });
        expect(decorativePp.pricing).toMatchObject({ ppWrappingCost: TEST_PP });
        expect(duzPp.pricing?.publishedCashPrice).not.toBeNull();
        expect(decorativePp.pricing?.publishedCashPrice).not.toBeNull();
        expect(toDecimal(duzPp.productionCost ?? '0').equals(duzBefore.productionCost ?? '0')).toBe(
          true,
        );

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const openAfter = await prisma.extraCostValue.count({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        isActive: true,
        effectiveTo: null,
      },
    });
    expect(openAfter).toBe(openBefore);
  });
});
