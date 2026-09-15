import { Prisma, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { RawMaterialsService } from '../materials/raw-materials.service';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CostCalculationService } from './cost-calculation.service';

const ROLLBACK = new Error('ROLLBACK_SUPURGELIK_MDF_PRICE_DYNAMIC_TEST');
const SIZE = {
  productCode: 'DUZ_SUPURGELIK' as const,
  thicknessMm: 12,
  widthMm: 120,
  lengthMm: 2800,
};
const MATERIAL_CODE = 'MDF-12-2100X2800-ZIMPARALI';

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

describe('Süpürgelik MDF CARD_INSTALLMENT request-time DB regression', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('12 mm CARD 2185→2200 history ile NET=16 kalır, 12/120 nakit 184→185 olur ve rollback eder', async () => {
    const material = await prisma.rawMaterial.findUnique({
      where: { code: MATERIAL_CODE },
    });
    if (!material?.isActive) {
      throw new Error(`Dynamic test için aktif ${MATERIAL_CODE} gerekir.`);
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
    if (!toDecimal(original.price.toString()).equals('2185')) {
      throw new Error(
        `Dynamic test beklenen CARD_INSTALLMENT=2185; bulunan=${original.price.toString()}.`,
      );
    }
    const asOf = new Date(original.effectiveFrom.getTime() + 1000);

    try {
      await prisma.$transaction(async (tx) => {
        const extraCostsService = extraCostsServiceForTx(tx);
        const rawMaterialsService = rawMaterialsServiceForTx(tx);
        const service = new CostCalculationService(
          tx as never,
          extraCostsService,
          {} as never,
        );

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

        const before = await service.getSupurgelikMdfCost(SIZE, asOf);
        expect(before.productionYield.netQty).toBe(16);
        expect(before.mdfUnitCost).toBe('136.5625');
        expect(before.extraCostsTotal).toBe('16');
        expect(before.productionCost).toBe('152.5625');
        expect(before.pricing).toMatchObject({ publishedCashPrice: '184' });

        const updated = await rawMaterialsService.updateCardInstallmentPrice(
          material.id,
          { price: '2200' },
          asOf,
        );
        expect(updated.changed).toBe(true);

        const closed = await tx.rawMaterialPrice.findUnique({
          where: { id: original.id },
        });
        expect(closed?.effectiveTo).not.toBeNull();
        expect(toDecimal(closed!.price.toString()).equals('2185')).toBe(true);

        const nextOpen = await tx.rawMaterialPrice.findMany({
          where: {
            rawMaterialId: material.id,
            priceType: 'CARD_INSTALLMENT',
            isActive: true,
            effectiveTo: null,
          },
        });
        expect(nextOpen).toHaveLength(1);
        expect(nextOpen[0].id).not.toBe(original.id);
        expect(toDecimal(nextOpen[0].price.toString()).equals('2200')).toBe(true);

        const after = await service.getSupurgelikMdfCost(SIZE, asOf);
        expect(after.productionYield.netQty).toBe(16);
        expect(after.mdfUnitCost).toBe('137.5');
        expect(after.extraCostsTotal).toBe('16');
        expect(after.productionCost).toBe('153.5');
        expect(after.pricing).toMatchObject({
          profitRate: '20',
          profitAmount: '30.7',
          priceBeforeRounding: '184.2',
          publishedCashPrice: '185',
        });

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
    expect(toDecimal(restored!.price.toString()).equals('2185')).toBe(true);

    const stillOpen = await prisma.rawMaterialPrice.findMany({
      where: {
        rawMaterialId: material.id,
        priceType: 'CARD_INSTALLMENT',
        isActive: true,
        effectiveTo: null,
      },
    });
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0].id).toBe(original.id);
  });
});
