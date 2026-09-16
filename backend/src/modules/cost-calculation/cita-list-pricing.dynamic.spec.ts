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

const ROLLBACK = new Error('ROLLBACK_CITA_LIST_PRICING_DYNAMIC_TEST');
const MATERIAL_14 = 'MDF-14-2100X2800-ZIMPARALI';

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

function publishedPriceServiceForTx(tx: Prisma.TransactionClient) {
  return new CitaPublishedPriceBandsService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      productGroup: tx.productGroup,
      citaPublishedPriceBand: tx.citaPublishedPriceBand,
    } as never,
    new AuditService(tx as never),
  );
}

function listServiceForTx(tx: Prisma.TransactionClient) {
  const extras = extraCostsServiceForTx(tx);
  const net = new CitaNetService(tx as never);
  const mdf = new CitaMdfService(net, tx as never);
  const production = new CitaProductionService(mdf, extras);
  return {
    extras,
    production,
    rawMaterials: rawMaterialsServiceForTx(tx),
    publishedPrices: publishedPriceServiceForTx(tx),
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

describe('CITA list published pricing (DB master, rollback)', () => {
  const prisma = new PrismaClient();
  const net = new CitaNetService(prisma as never);
  const production = new CitaProductionService(
    new CitaMdfService(net, prisma as never),
    new ExtraCostsService(prisma as never, new AuditService(prisma as never)),
  );
  const service = new CitaListService(prisma as never, production, net);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('56 satırda 26 yayın fiyatı ve 30 missing döner; ExtraCost yokken fiyat bağımsızdır', async () => {
    const listed = await service.listProductionCosts();
    expect(listed.rows).toHaveLength(56);

    const priced = listed.rows.filter((row) => row.pricing.pricingAvailable);
    const missing = listed.rows.filter((row) => !row.pricing.pricingAvailable);
    expect(priced).toHaveLength(26);
    expect(missing).toHaveLength(30);
    expect(
      priced.every(
        (row) =>
          row.pricing.statusCode === null &&
          row.pricing.publishedCashPrice != null &&
          row.pricing.publishedCardPrice != null &&
          row.pricing.priceBand != null,
      ),
    ).toBe(true);
    expect(
      missing.every(
        (row) =>
          row.pricing.statusCode === CITA_PUBLISHED_PRICE_MISSING &&
          row.pricing.publishedCashPrice === null &&
          row.pricing.publishedCardPrice === null,
      ),
    ).toBe(true);

    const price = (thicknessMm: string, widthMm: string) =>
      findRow(listed.rows, thicknessMm, widthMm)?.pricing;
    expect(price('12', '10')).toMatchObject({
      publishedCashPrice: '115',
      publishedCardPrice: '138',
    });
    expect(price('12', '20')).toMatchObject({
      publishedCashPrice: '115',
      publishedCardPrice: '138',
    });
    expect(price('12', '30')).toMatchObject({
      publishedCashPrice: '145',
      publishedCardPrice: '174',
    });
    expect(price('14', '50')).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });
    expect(price('16', '80')).toMatchObject({
      publishedCashPrice: '215',
      publishedCardPrice: '258',
    });
    expect(price('18', '50')).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });
    expect(price('18', '60')).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });
    expect(price('18', '10')?.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);
    expect(price('18', '30')?.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);
    expect(price('18', '70')?.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);

    for (const thicknessMm of ['10', '22', '30']) {
      const rows = listed.rows.filter((row) =>
        toDecimal(row.thicknessMm).eq(thicknessMm),
      );
      expect(rows).toHaveLength(8);
      expect(
        rows.every(
          (row) => row.pricing.statusCode === CITA_PUBLISHED_PRICE_MISSING,
        ),
      ).toBe(true);
    }

    const fourteenBy30 = findRow(listed.rows, '14', '30');
    expect(fourteenBy30?.statusCode).toBe(CITA_EXTRA_COST_MISSING);
    expect(fourteenBy30?.productionCost).toBeNull();
    expect(fourteenBy30?.pricing).toMatchObject({
      pricingAvailable: true,
      publishedCashPrice: '145',
      publishedCardPrice: '174',
    });

    const custom = await production.getProductionCost({
      thicknessMm: '14',
      widthMm: '35',
      lengthMm: '2800',
    });
    expect(custom.productionYield).toEqual({
      netQty: 53,
      source: 'CALCULATED_CUT_RULE',
    });
    expect(
      listed.rows.some((row) => toDecimal(row.widthMm).eq(35)),
    ).toBe(false);
    expect('pricing' in custom).toBe(false);
  });

  it('14 mm MDF X→X+100 maliyet değiştirir, 14/30 yayın fiyatı 145/174 kalır ve rollback edilir', async () => {
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

    try {
      await prisma.$transaction(async (tx) => {
        const { rawMaterials, list, extras } = listServiceForTx(tx);
        const date = asOf.toISOString().slice(0, 10);
        await extras.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount: '5',
          effectiveFrom: date,
        });
        await extras.updateValue('LABOR', {
          productGroup: 'CITA',
          amount: '10',
          effectiveFrom: date,
        });

        const before = await list.listProductionCosts(asOf);
        const before14x30 = findRow(before.rows, '14', '30');
        expect(before14x30?.pricing).toMatchObject({
          publishedCashPrice: '145',
          publishedCardPrice: '174',
        });
        const beforeCost = before14x30?.productionCost;
        expect(beforeCost).not.toBeNull();

        await rawMaterials.updateCardInstallmentPrice(
          material.id,
          { price: nextAmount.toFixed() },
          asOf,
        );

        const after = await list.listProductionCosts(asOf);
        const after14x30 = findRow(after.rows, '14', '30');
        expect(after14x30?.productionYield.netQty).toBe(
          before14x30?.productionYield.netQty,
        );
        expect(after14x30?.mdfUnitCost).not.toBe(before14x30?.mdfUnitCost);
        expect(after14x30?.productionCost).not.toBe(beforeCost);
        expect(after14x30?.pricing).toMatchObject({
          publishedCashPrice: '145',
          publishedCardPrice: '174',
        });

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

  it('30–40 band 145/174→150/180 yalnız o bant fiyatını değiştirir; maliyet aynı kalır ve rollback edilir', async () => {
    const now = new Date();
    const group = await prisma.productGroup.findUnique({ where: { code: 'CITA' } });
    const openBefore = await prisma.citaPublishedPriceBand.findFirst({
      where: {
        productGroupId: group!.id,
        minWidthMm: 30,
        maxWidthMm: 40,
        isActive: true,
        effectiveTo: null,
      },
    });
    if (openBefore == null) {
      throw new Error('Dynamic test için açık 3–4 cm bandı gerekir.');
    }

    try {
      await prisma.$transaction(async (tx) => {
        const { list, publishedPrices } = listServiceForTx(tx);
        const before = await list.listProductionCosts(now);
        const beforeCosts = before.rows.map((row) => ({
          thicknessMm: row.thicknessMm,
          widthMm: row.widthMm,
          netQty: row.productionYield.netQty,
          mdfUnitCost: row.mdfUnitCost,
          productionCost: row.productionCost,
          extraCostsTotal: row.extraCostsTotal,
        }));
        expect(findRow(before.rows, '14', '30')?.pricing).toMatchObject({
          publishedCashPrice: '145',
          publishedCardPrice: '174',
        });
        expect(findRow(before.rows, '12', '10')?.pricing).toMatchObject({
          publishedCashPrice: '115',
          publishedCardPrice: '138',
        });

        await publishedPrices.updateActiveBandPrices(
          openBefore.id,
          {
            cashPrice: '150',
            cardPrice: '180',
          },
          now,
        );

        const after = await list.listProductionCosts(now);
        expect(after.rows).toHaveLength(56);
        expect(
          after.rows.map((row) => ({
            thicknessMm: row.thicknessMm,
            widthMm: row.widthMm,
            netQty: row.productionYield.netQty,
            mdfUnitCost: row.mdfUnitCost,
            productionCost: row.productionCost,
            extraCostsTotal: row.extraCostsTotal,
          })),
        ).toEqual(beforeCosts);

        for (const thicknessMm of ['12', '14', '16']) {
          for (const widthMm of ['30', '40']) {
            expect(findRow(after.rows, thicknessMm, widthMm)?.pricing).toMatchObject({
              pricingAvailable: true,
              publishedCashPrice: '150',
              publishedCardPrice: '180',
              priceBand: { minWidthMm: 30, maxWidthMm: 40 },
            });
          }
        }
        expect(findRow(after.rows, '12', '10')?.pricing).toMatchObject({
          publishedCashPrice: '115',
          publishedCardPrice: '138',
        });
        expect(findRow(after.rows, '14', '50')?.pricing).toMatchObject({
          publishedCashPrice: '185',
          publishedCardPrice: '222',
        });
        expect(findRow(after.rows, '16', '80')?.pricing).toMatchObject({
          publishedCashPrice: '215',
          publishedCardPrice: '258',
        });
        expect(findRow(after.rows, '18', '30')?.pricing.statusCode).toBe(
          CITA_PUBLISHED_PRICE_MISSING,
        );
        for (const thicknessMm of ['10', '22', '30']) {
          expect(findRow(after.rows, thicknessMm, '30')?.pricing.statusCode).toBe(
            CITA_PUBLISHED_PRICE_MISSING,
          );
        }

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const open = await prisma.citaPublishedPriceBand.findMany({
      where: {
        productGroupId: group!.id,
        minWidthMm: 30,
        maxWidthMm: 40,
        isActive: true,
        effectiveTo: null,
      },
    });
    expect(open).toHaveLength(1);
    expect(toDecimal(open[0].cashPrice.toString()).toString()).toBe('145');
    expect(toDecimal(open[0].cardPrice.toString()).toString()).toBe('174');
  });
});
