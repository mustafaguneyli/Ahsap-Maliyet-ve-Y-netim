import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import {
  CITA_NET_FORBIDDEN_MATERIAL_CODES,
  CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM,
} from '../../calculation-engine/calculators/cita-net-calculator';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { RawMaterialsService } from '../materials/raw-materials.service';
import { CitaListService } from './cita-list.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';

const ROLLBACK = new Error('ROLLBACK_CITA_MDF_SOURCE_DYNAMIC_TEST');
const MATERIAL_14 = 'MDF-14-2100X2800-ZIMPARALI';
const CUSTOM = {
  thicknessMm: '14',
  widthMm: '35',
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

function servicesForTx(tx: Prisma.TransactionClient) {
  const extras = extraCostsServiceForTx(tx);
  const net = new CitaNetService(tx as never);
  const mdf = new CitaMdfService(net, tx as never);
  const production = new CitaProductionService(mdf, extras);
  return {
    extras,
    production,
    rawMaterials: rawMaterialsServiceForTx(tx),
    list: new CitaListService(tx as never, production, net),
  };
}

describe('CITA kaynak MDF CARD_INSTALLMENT (liste + custom, rollback)', () => {
  const prisma = new PrismaClient();
  const net = new CitaNetService(prisma as never);
  const production = new CitaProductionService(
    new CitaMdfService(net, prisma as never),
    new ExtraCostsService(prisma as never, new AuditService(prisma as never)),
  );
  const list = new CitaListService(prisma as never, production, net);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('liste 7 unique CITA MASTER ham maddesini keşfeder; 14 mm CARD X→X+100 yalnız 14 mm maliyeti değiştirir', async () => {
    const listed = await list.listProductionCosts();
    const uniqueCodes = [...new Set(listed.rows.map((row) => row.rawMaterial.code))].sort();

    expect(listed.rows).toHaveLength(56);
    expect(uniqueCodes).toEqual(Object.values(CITA_NET_MATERIAL_CODES_BY_THICKNESS_MM));
    expect(
      uniqueCodes.some((code) =>
        (CITA_NET_FORBIDDEN_MATERIAL_CODES as readonly string[]).includes(code),
      ),
    ).toBe(false);
    expect(
      listed.rows
        .filter((row) => toDecimal(row.thicknessMm).eq(18))
        .every((row) => row.rawMaterial.code === 'MDF-18-2100X2800-ZIMPARALI'),
    ).toBe(true);

    const material = await prisma.rawMaterial.findUnique({
      where: { code: MATERIAL_14 },
    });
    if (!material?.isActive) {
      throw new Error(`Dynamic test için aktif ${MATERIAL_14} gerekir.`);
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

    const countsBefore = {
      product: await prisma.product.count(),
      productSize: await prisma.productSize.count(),
      productionYield: await prisma.productionYield.count(),
      recipe: await prisma.recipe.count(),
      extraCostValue: await prisma.extraCostValue.count(),
    };

    try {
      await prisma.$transaction(async (tx) => {
        const { rawMaterials, list: txList, production: txProduction } =
          servicesForTx(tx);

        const productSnapshot = await tx.product.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, code: true, isActive: true, updatedAt: true },
        });
        const sizeSnapshot = await tx.productSize.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, widthMm: true, lengthMm: true, updatedAt: true },
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
        const recipeSnapshot = await tx.recipe.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, updatedAt: true },
        });

        const beforeList = await txList.listProductionCosts(asOf);
        expect(beforeList.rows).toHaveLength(56);
        const before14 = beforeList.rows.filter((row) =>
          toDecimal(row.thicknessMm).eq(14),
        );
        const beforeOther = beforeList.rows.filter(
          (row) => !toDecimal(row.thicknessMm).eq(14),
        );
        expect(before14).toHaveLength(8);
        expect(
          before14.every(
            (row) =>
              row.sheetPrice != null &&
              toDecimal(row.sheetPrice.amount).equals(originalAmount),
          ),
        ).toBe(true);
        expect(
          before14.every((row) => row.productionYield.source === 'MASTER'),
        ).toBe(true);

        const beforeCustom = await txProduction.getProductionCost(CUSTOM, asOf);
        expect(beforeCustom.productionYield).toEqual({
          netQty: 53,
          source: 'CALCULATED_CUT_RULE',
        });
        expect(beforeCustom.sheetPrice?.amount).toBeDefined();
        expect(toDecimal(beforeCustom.sheetPrice!.amount).equals(originalAmount)).toBe(
          true,
        );

        const sameValue = await rawMaterials.updateCardInstallmentPrice(
          material.id,
          { price: originalAmount.toFixed() },
          asOf,
        );
        expect(sameValue.changed).toBe(false);

        const updated = await rawMaterials.updateCardInstallmentPrice(
          material.id,
          { price: nextAmount.toFixed() },
          asOf,
        );
        expect(updated.changed).toBe(true);

        const closed = await tx.rawMaterialPrice.findUnique({
          where: { id: original.id },
        });
        expect(closed?.effectiveTo).not.toBeNull();
        expect(toDecimal(closed!.price.toString()).equals(originalAmount)).toBe(true);

        const afterList = await txList.listProductionCosts(asOf);
        expect(afterList.rows).toHaveLength(56);
        const after14 = afterList.rows.filter((row) =>
          toDecimal(row.thicknessMm).eq(14),
        );
        const afterOther = afterList.rows.filter(
          (row) => !toDecimal(row.thicknessMm).eq(14),
        );

        expect(after14).toHaveLength(8);
        expect(
          after14.every(
            (row) =>
              row.sheetPrice != null &&
              toDecimal(row.sheetPrice.amount).equals(nextAmount),
          ),
        ).toBe(true);
        expect(
          after14.every((row) => row.productionYield.source === 'MASTER'),
        ).toBe(true);
        for (const row of after14) {
          const beforeRow = before14.find(
            (candidate) => candidate.widthMm === row.widthMm,
          );
          expect(beforeRow).toBeDefined();
          expect(row.productionYield.netQty).toBe(beforeRow!.productionYield.netQty);
          expect(row.extraCosts).toEqual(beforeRow!.extraCosts);
          expect(row.extraCostsTotal).toBe(beforeRow!.extraCostsTotal);
          expect(row.mdfUnitCost).toBe(
            nextAmount.div(String(row.productionYield.netQty)).toFixed(),
          );
          if (beforeRow!.productionCost == null) {
            expect(row.productionCost).toBeNull();
          } else {
            expect(row.productionCost).toBe(
              toDecimal(row.mdfUnitCost!).plus(beforeRow!.extraCostsTotal!).toFixed(),
            );
          }
        }

        expect(
          afterOther.map((row) => ({
            thicknessMm: row.thicknessMm,
            widthMm: row.widthMm,
            netQty: row.productionYield.netQty,
            source: row.productionYield.source,
            sheetPrice: row.sheetPrice?.amount,
            mdfUnitCost: row.mdfUnitCost,
            extraCosts: row.extraCosts,
            productionCost: row.productionCost,
          })),
        ).toEqual(
          beforeOther.map((row) => ({
            thicknessMm: row.thicknessMm,
            widthMm: row.widthMm,
            netQty: row.productionYield.netQty,
            source: row.productionYield.source,
            sheetPrice: row.sheetPrice?.amount,
            mdfUnitCost: row.mdfUnitCost,
            extraCosts: row.extraCosts,
            productionCost: row.productionCost,
          })),
        );

        const afterCustom = await txProduction.getProductionCost(CUSTOM, asOf);
        expect(afterCustom.productionYield).toEqual({
          netQty: 53,
          source: 'CALCULATED_CUT_RULE',
        });
        expect(afterCustom.extraCosts).toEqual(beforeCustom.extraCosts);
        expect(toDecimal(afterCustom.sheetPrice!.amount).equals(nextAmount)).toBe(true);
        expect(afterCustom.mdfUnitCost).toBe(nextAmount.div('53').toFixed());

        expect(
          await tx.product.findMany({
            orderBy: { id: 'asc' },
            select: { id: true, code: true, isActive: true, updatedAt: true },
          }),
        ).toEqual(productSnapshot);
        expect(
          await tx.productSize.findMany({
            orderBy: { id: 'asc' },
            select: { id: true, widthMm: true, lengthMm: true, updatedAt: true },
          }),
        ).toEqual(sizeSnapshot);
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
          await tx.recipe.findMany({
            orderBy: { id: 'asc' },
            select: { id: true, updatedAt: true },
          }),
        ).toEqual(recipeSnapshot);

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
    expect(await prisma.product.count()).toBe(countsBefore.product);
    expect(await prisma.productSize.count()).toBe(countsBefore.productSize);
    expect(await prisma.productionYield.count()).toBe(countsBefore.productionYield);
    expect(await prisma.recipe.count()).toBe(countsBefore.recipe);
    expect(await prisma.extraCostValue.count()).toBe(countsBefore.extraCostValue);
  });
});
