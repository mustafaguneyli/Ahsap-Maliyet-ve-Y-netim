import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CITA_EXTRA_COST_MISSING } from '../../calculation-engine/calculators/cita-production-calculator';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { RawMaterialsService } from '../materials/raw-materials.service';
import { CITA_PUBLISHED_PRICE_MISSING } from '../pricing/cita-published-price-band-data';
import { CitaPublishedPriceBandsService } from '../pricing/cita-published-price-bands.service';
import { CitaListService } from './cita-list.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';

const ROLLBACK = new Error('ROLLBACK_CITA_GOLDEN_REGRESSION_DYNAMIC');
const MATERIAL_14 = 'MDF-14-2100X2800-ZIMPARALI';
const GOLDEN_BANDS = [
  { minWidthMm: 10, maxWidthMm: 20, cash: '115', card: '138' },
  { minWidthMm: 30, maxWidthMm: 40, cash: '145', card: '174' },
  { minWidthMm: 50, maxWidthMm: 60, cash: '185', card: '222' },
  { minWidthMm: 70, maxWidthMm: 80, cash: '215', card: '258' },
] as const;

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

function servicesForTx(tx: Prisma.TransactionClient) {
  const extras = extraCostsServiceForTx(tx);
  const net = new CitaNetService(tx as never);
  const mdf = new CitaMdfService(net, tx as never);
  const production = new CitaProductionService(mdf, extras, tx as never);
  return {
    extras,
    production,
    rawMaterials: new RawMaterialsService(
      {
        $transaction: async <T>(
          fn: (client: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => fn(tx),
        rawMaterial: tx.rawMaterial,
        rawMaterialPrice: tx.rawMaterialPrice,
      } as never,
      new AuditService(tx as never),
    ),
    publishedPrices: new CitaPublishedPriceBandsService(
      {
        $transaction: async <T>(
          fn: (client: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => fn(tx),
        productGroup: tx.productGroup,
        citaPublishedPriceBand: tx.citaPublishedPriceBand,
      } as never,
      new AuditService(tx as never),
    ),
    list: new CitaListService(tx as never, production, net),
  };
}

function findRow<T extends { thicknessMm: string; widthMm: string }>(
  rows: T[],
  thicknessMm: string,
  widthMm: string,
): T | undefined {
  return rows.find(
    (row) =>
      toDecimal(row.thicknessMm).eq(thicknessMm) &&
      toDecimal(row.widthMm).eq(widthMm),
  );
}

async function openPublishedBands(prisma: PrismaClient) {
  const group = await prisma.productGroup.findUnique({ where: { code: 'CITA' } });
  const rows = await prisma.citaPublishedPriceBand.findMany({
    where: {
      productGroupId: group!.id,
      isActive: true,
      effectiveTo: null,
    },
    orderBy: { minWidthMm: 'asc' },
  });
  return rows.map((row) => ({
    minWidthMm: row.minWidthMm,
    maxWidthMm: row.maxWidthMm,
    cash: toDecimal(row.cashPrice.toString()).toString(),
    card: toDecimal(row.cardPrice.toString()).toString(),
  }));
}

describe('CITA golden regression (DB runtime, rollback)', () => {
  const prisma = new PrismaClient();
  const net = new CitaNetService(prisma as never);
  const extras = new ExtraCostsService(prisma as never, new AuditService(prisma as never));
  const production = new CitaProductionService(
    new CitaMdfService(net, prisma as never),
    extras,
    prisma as never,
  );
  const list = new CitaListService(prisma as never, production, net);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('liste 56 MASTER satır, 26/30 pricing ve custom 14/35 yazmaz', async () => {
    const countsBefore = {
      productSize: await prisma.productSize.count(),
      productionYield: await prisma.productionYield.count(),
      recipe: await prisma.recipe.count(),
    };

    const listed = await list.listProductionCosts();
    expect(listed.verifiedMeasureCount).toBe(56);
    expect(listed.rows).toHaveLength(56);
    expect(listed.rows.every((row) => row.productionYield.source === 'MASTER')).toBe(
      true,
    );
    expect(listed.rows.filter((row) => row.pricing.pricingAvailable)).toHaveLength(
      26,
    );
    expect(listed.rows.filter((row) => !row.pricing.pricingAvailable)).toHaveLength(
      30,
    );
    expect(
      listed.rows.some((row) => ['35', '47', '65'].includes(row.widthMm)),
    ).toBe(false);

    const keys = listed.rows.map(
      (row) => `${row.thicknessMm}|${row.widthMm}|${row.lengthMm}`,
    );
    const sorted = [...keys].sort((left, right) => {
      const [lt, lw, ll] = left.split('|').map((value) => toDecimal(value));
      const [rt, rw, rl] = right.split('|').map((value) => toDecimal(value));
      return lt.comparedTo(rt) || lw.comparedTo(rw) || ll.comparedTo(rl);
    });
    expect(keys).toEqual(sorted);

    const fourteen30 = findRow(listed.rows, '14', '30');
    expect(fourteen30?.statusCode).toBe(CITA_EXTRA_COST_MISSING);
    expect(fourteen30?.productionCost).toBeNull();
    expect(fourteen30?.missingExtraCosts).toEqual(
      expect.arrayContaining(['CUTTING', 'LABOR']),
    );
    expect(fourteen30?.pricing).toMatchObject({
      pricingAvailable: true,
      publishedCashPrice: '145',
      publishedCardPrice: '174',
    });

    const custom = await production.getQuotedProductionCost({
      thicknessMm: '14',
      widthMm: '35',
      lengthMm: '2800',
    });
    expect(custom.productionYield).toEqual({
      netQty: 53,
      source: 'CALCULATED_CUT_RULE',
    });
    expect(custom.statusCode).toBe(CITA_EXTRA_COST_MISSING);
    expect(custom.productionCost).toBeNull();
    expect(custom.missingExtraCosts).toEqual(['CUTTING', 'LABOR']);
    expect(custom.pricing).toMatchObject({
      pricingAvailable: true,
      publishedCashPrice: '145',
      publishedCardPrice: '174',
      priceBand: { displayName: '3–4 cm' },
      statusCode: null,
    });
    expect(Object.keys(custom.pricing)).toEqual(
      expect.arrayContaining([
        'pricingAvailable',
        'priceBand',
        'publishedCashPrice',
        'publishedCardPrice',
        'statusCode',
      ]),
    );

    expect(await prisma.productSize.count()).toBe(countsBefore.productSize);
    expect(await prisma.productionYield.count()).toBe(countsBefore.productionYield);
    expect(await prisma.recipe.count()).toBe(countsBefore.recipe);
  });

  it(
    'MDF / ExtraCost / published price birbirini etkilemez ve rollback edilir',
    async () => {
    const material = await prisma.rawMaterial.findUnique({
      where: { code: MATERIAL_14 },
    });
    if (!material?.isActive) {
      throw new Error(`Dynamic golden için aktif ${MATERIAL_14} gerekir.`);
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
      throw new Error('Dynamic golden için tek açık 14 mm CARD fiyat gerekir.');
    }
    const originalPrice = openPrices[0];
    const originalAmount = toDecimal(originalPrice.price.toString());
    const now = new Date();
    if (now.getTime() <= originalPrice.effectiveFrom.getTime()) {
      throw new Error('Dynamic golden için CARD fiyat effectiveFrom geçmişte olmalıdır.');
    }
    const date = now.toISOString().slice(0, 10);
    const extraCountBefore = await prisma.extraCostValue.count();

    try {
      await prisma.$transaction(
        async (tx) => {
          const svc = servicesForTx(tx);
          const quote = (
            thicknessMm: string,
            widthMm: string,
            at: Date,
          ) =>
            svc.production.getQuotedProductionCost(
              { thicknessMm, widthMm, lengthMm: '2800' },
              at,
            );

          const before14x30 = await quote('14', '30', now);
          const before12x10 = await quote('12', '10', now);
          const before14x35 = await quote('14', '35', now);
          expect(before14x30.pricing).toMatchObject({
            publishedCashPrice: '145',
            publishedCardPrice: '174',
          });
          expect(before14x35.productionYield.netQty).toBe(53);
          expect(before14x35.pricing).toMatchObject({
            publishedCashPrice: '145',
            publishedCardPrice: '174',
          });

          await svc.extras.updateValue('CUTTING', {
            productGroup: 'CITA',
            amount: '5',
            effectiveFrom: date,
          });
          await svc.extras.updateValue('LABOR', {
            productGroup: 'CITA',
            amount: '10',
            effectiveFrom: date,
          });

          const extrasAt = new Date();
          const extras14x30 = await quote('14', '30', extrasAt);
          expect(extras14x30.productionYield.netQty).toBe(
            before14x30.productionYield.netQty,
          );
          expect(extras14x30.mdfUnitCost).toBe(before14x30.mdfUnitCost);
          expect(extras14x30.extraCostsTotal).toBe('15');
          expect(extras14x30.productionCost).toBe(
            toDecimal(extras14x30.mdfUnitCost!).plus(15).toFixed(),
          );
          expect(extras14x30.pricing).toMatchObject({
            publishedCashPrice: '145',
            publishedCardPrice: '174',
          });

          await svc.extras.updateValue('CUTTING', {
            productGroup: 'CITA',
            amount: '6',
            effectiveFrom: date,
          });
          const cuttingAt = new Date();
          const cutting14x30 = await quote('14', '30', cuttingAt);
          expect(cutting14x30.productionYield.netQty).toBe(
            extras14x30.productionYield.netQty,
          );
          expect(cutting14x30.mdfUnitCost).toBe(extras14x30.mdfUnitCost);
          expect(cutting14x30.extraCostsTotal).toBe('16');
          expect(cutting14x30.productionCost).toBe(
            toDecimal(extras14x30.productionCost!).plus(1).toFixed(),
          );
          expect(cutting14x30.pricing).toMatchObject({
            publishedCashPrice: '145',
            publishedCardPrice: '174',
          });

          const priceAt = new Date();
          await svc.publishedPrices.updateActiveBandPrices(
            (
              await tx.citaPublishedPriceBand.findFirstOrThrow({
                where: {
                  minWidthMm: 30,
                  maxWidthMm: 40,
                  isActive: true,
                  effectiveTo: null,
                },
              })
            ).id,
            { cashPrice: '150', cardPrice: '180' },
            priceAt,
          );

          const afterPrice = await svc.list.listProductionCosts(priceAt);
          expect(afterPrice.rows).toHaveLength(56);
          for (const thicknessMm of ['12', '14', '16']) {
            for (const widthMm of ['30', '40']) {
              expect(findRow(afterPrice.rows, thicknessMm, widthMm)?.pricing).toMatchObject({
                publishedCashPrice: '150',
                publishedCardPrice: '180',
              });
            }
          }
          expect(findRow(afterPrice.rows, '14', '30')?.mdfUnitCost).toBe(
            cutting14x30.mdfUnitCost,
          );
          expect(findRow(afterPrice.rows, '14', '30')?.productionCost).toBe(
            cutting14x30.productionCost,
          );
          expect(findRow(afterPrice.rows, '12', '10')?.pricing).toMatchObject({
            publishedCashPrice: '115',
            publishedCardPrice: '138',
          });
          expect(findRow(afterPrice.rows, '18', '30')?.pricing.statusCode).toBe(
            CITA_PUBLISHED_PRICE_MISSING,
          );
          for (const thicknessMm of ['10', '22', '30']) {
            expect(
              findRow(afterPrice.rows, thicknessMm, '30')?.pricing.statusCode,
            ).toBe(CITA_PUBLISHED_PRICE_MISSING);
          }

          const afterCustom = await quote('14', '35', priceAt);
          expect(afterCustom.productionYield.netQty).toBe(53);
          expect(afterCustom.mdfUnitCost).toBe(before14x35.mdfUnitCost);
          expect(afterCustom.pricing).toMatchObject({
            publishedCashPrice: '150',
            publishedCardPrice: '180',
          });
          expect((await quote('18', '35', priceAt)).pricing.statusCode).toBe(
            CITA_PUBLISHED_PRICE_MISSING,
          );

          const mdfAt = new Date();
          await svc.rawMaterials.updateCardInstallmentPrice(
            material.id,
            { price: originalAmount.plus(100).toFixed() },
            mdfAt,
          );
          const mdf14x30 = await quote('14', '30', mdfAt);
          expect(mdf14x30.productionYield.netQty).toBe(
            before14x30.productionYield.netQty,
          );
          expect(mdf14x30.productionYield.source).toBe('MASTER');
          expect(mdf14x30.sheetPrice?.amount).not.toBe(
            before14x30.sheetPrice?.amount,
          );
          expect(mdf14x30.mdfUnitCost).not.toBe(cutting14x30.mdfUnitCost);
          expect(mdf14x30.pricing).toMatchObject({
            publishedCashPrice: '150',
            publishedCardPrice: '180',
          });
          expect((await quote('12', '10', mdfAt)).mdfUnitCost).toBe(
            before12x10.mdfUnitCost,
          );

          const customAfterMdf = await quote('14', '35', mdfAt);
          expect(customAfterMdf.productionYield.netQty).toBe(53);
          expect(customAfterMdf.mdfUnitCost).not.toBe(afterCustom.mdfUnitCost);
          expect(customAfterMdf.pricing).toMatchObject({
            publishedCashPrice: '150',
            publishedCardPrice: '180',
          });

          throw ROLLBACK;
        },
        { timeout: 20000, maxWait: 10000 },
      );
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    expect(await openPublishedBands(prisma)).toEqual(GOLDEN_BANDS);
    expect(await prisma.extraCostValue.count()).toBe(extraCountBefore);
    const restored = await prisma.rawMaterialPrice.findUnique({
      where: { id: originalPrice.id },
    });
    expect(restored?.effectiveTo).toBeNull();
    expect(toDecimal(restored!.price.toString()).equals(originalAmount)).toBe(true);
  },
  30_000,
);
});
