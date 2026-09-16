import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CITA_EXTRA_COST_MISSING } from '../../calculation-engine/calculators/cita-production-calculator';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { CITA_PUBLISHED_PRICE_MISSING } from '../pricing/cita-published-price-band-data';
import { CitaPublishedPriceBandsService } from '../pricing/cita-published-price-bands.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';

const ROLLBACK = new Error('ROLLBACK_CITA_CUSTOM_PRICING_DYNAMIC_TEST');

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

function quotedServiceForTx(tx: Prisma.TransactionClient) {
  const extras = extraCostsServiceForTx(tx);
  const mdf = new CitaMdfService(new CitaNetService(tx as never), tx as never);
  return {
    extras,
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
    production: new CitaProductionService(mdf, extras, tx as never),
  };
}

describe('CITA custom published pricing (DB master, yazmaz, rollback)', () => {
  const prisma = new PrismaClient();
  const service = new CitaProductionService(
    new CitaMdfService(new CitaNetService(prisma as never), prisma as never),
    new ExtraCostsService(prisma as never, new AuditService(prisma as never)),
    prisma as never,
  );

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('custom golden ve missing kombinasyonlarını DB masterından okur; ExtraCost yokken fiyat bağımsızdır', async () => {
    const countsBefore = {
      productSize: await prisma.productSize.count(),
      productionYield: await prisma.productionYield.count(),
      recipe: await prisma.recipe.count(),
      publishedBand: await prisma.citaPublishedPriceBand.count(),
      publishedThickness: await prisma.citaPublishedPriceBandThickness.count(),
    };

    const twelve15 = await service.getQuotedProductionCost({
      thicknessMm: '12',
      widthMm: '15',
      lengthMm: '2800',
    });
    expect(twelve15.productionYield.source).toBe('CALCULATED_CUT_RULE');
    expect(twelve15.pricing).toMatchObject({
      publishedCashPrice: '115',
      publishedCardPrice: '138',
      priceBand: { displayName: '1–2 cm', minWidthMm: 10, maxWidthMm: 20 },
    });

    const fourteen35 = await service.getQuotedProductionCost({
      thicknessMm: '14',
      widthMm: '35',
      lengthMm: '2800',
    });
    expect(fourteen35.productionYield).toEqual({ netQty: 53, source: 'CALCULATED_CUT_RULE' });
    expect(fourteen35.statusCode).toBe(CITA_EXTRA_COST_MISSING);
    expect(fourteen35.productionCost).toBeNull();
    expect(fourteen35.pricing).toMatchObject({
      pricingAvailable: true,
      publishedCashPrice: '145',
      publishedCardPrice: '174',
      priceBand: { displayName: '3–4 cm', minWidthMm: 30, maxWidthMm: 40 },
    });

    const fourteen25 = await service.getQuotedProductionCost({
      thicknessMm: '14',
      widthMm: '25',
      lengthMm: '2800',
    });
    expect(fourteen25.pricing).toMatchObject({
      publishedCashPrice: '145',
      publishedCardPrice: '174',
    });

    const sixteen47 = await service.getQuotedProductionCost({
      thicknessMm: '16',
      widthMm: '47',
      lengthMm: '2800',
    });
    expect(sixteen47.pricing).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
      priceBand: { displayName: '5–6 cm' },
    });

    const twelve63 = await service.getQuotedProductionCost({
      thicknessMm: '12',
      widthMm: '63',
      lengthMm: '2800',
    });
    expect(twelve63.pricing).toMatchObject({
      publishedCashPrice: '215',
      publishedCardPrice: '258',
      priceBand: { displayName: '7–8 cm' },
    });

    const eighteen47 = await service.getQuotedProductionCost({
      thicknessMm: '18',
      widthMm: '47',
      lengthMm: '2800',
    });
    expect(eighteen47.pricing).toMatchObject({
      publishedCashPrice: '185',
      publishedCardPrice: '222',
    });

    const eighteen35 = await service.getQuotedProductionCost({
      thicknessMm: '18',
      widthMm: '35',
      lengthMm: '2800',
    });
    expect(eighteen35.mdfUnitCost).not.toBeNull();
    expect(eighteen35.pricing.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);

    const eighteen70 = await service.getQuotedProductionCost({
      thicknessMm: '18',
      widthMm: '70',
      lengthMm: '2800',
    });
    expect(eighteen70.pricing.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);

    for (const query of [
      { thicknessMm: '10', widthMm: '35' },
      { thicknessMm: '22', widthMm: '55' },
      { thicknessMm: '30', widthMm: '75' },
    ] as const) {
      const row = await service.getQuotedProductionCost({
        ...query,
        lengthMm: '2800',
      });
      expect(row.pricing.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);
    }

    const over80 = await service.getQuotedProductionCost({
      thicknessMm: '14',
      widthMm: '85',
      lengthMm: '2800',
    });
    expect(over80.mdfUnitCost).not.toBeNull();
    expect(over80.productionYield.source).toBe('CALCULATED_CUT_RULE');
    expect(over80.pricing).toMatchObject({
      pricingAvailable: false,
      publishedCashPrice: null,
      publishedCardPrice: null,
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    });

    const master30 = await service.getQuotedProductionCost({
      thicknessMm: '14',
      widthMm: '30',
      lengthMm: '2800',
    });
    expect(master30.productionYield.source).toBe('MASTER');
    expect(master30.pricing).toMatchObject({
      publishedCashPrice: '145',
      publishedCardPrice: '174',
    });

    expect(await prisma.productSize.count()).toBe(countsBefore.productSize);
    expect(await prisma.productionYield.count()).toBe(countsBefore.productionYield);
    expect(await prisma.recipe.count()).toBe(countsBefore.recipe);
    expect(await prisma.citaPublishedPriceBand.count()).toBe(
      countsBefore.publishedBand,
    );
    expect(await prisma.citaPublishedPriceBandThickness.count()).toBe(
      countsBefore.publishedThickness,
    );
  });

  it('3–4 band 145/174→150/180 custom 14/35 fiyatını değiştirir; NET/maliyet aynı kalır ve rollback edilir', async () => {
    const now = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        const { production, publishedPrices } = quotedServiceForTx(tx);
        const before = await production.getQuotedProductionCost(
          { thicknessMm: '14', widthMm: '35', lengthMm: '2800' },
          now,
        );
        expect(before.pricing).toMatchObject({
          publishedCashPrice: '145',
          publishedCardPrice: '174',
        });
        const beforeCost = {
          netQty: before.productionYield.netQty,
          source: before.productionYield.source,
          mdfUnitCost: before.mdfUnitCost,
          productionCost: before.productionCost,
          extraCostsTotal: before.extraCostsTotal,
        };

        await publishedPrices.updateActiveBandPrices(
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
          {
            cashPrice: '150',
            cardPrice: '180',
          },
          now,
        );

        const after = await production.getQuotedProductionCost(
          { thicknessMm: '14', widthMm: '35', lengthMm: '2800' },
          now,
        );
        expect(after.productionYield.netQty).toBe(beforeCost.netQty);
        expect(after.productionYield.source).toBe(beforeCost.source);
        expect(after.mdfUnitCost).toBe(beforeCost.mdfUnitCost);
        expect(after.productionCost).toBe(beforeCost.productionCost);
        expect(after.extraCostsTotal).toBe(beforeCost.extraCostsTotal);
        expect(after.pricing).toMatchObject({
          publishedCashPrice: '150',
          publishedCardPrice: '180',
          priceBand: { displayName: '3–4 cm' },
        });

        const other = await production.getQuotedProductionCost(
          { thicknessMm: '12', widthMm: '15', lengthMm: '2800' },
          now,
        );
        expect(other.pricing).toMatchObject({
          publishedCashPrice: '115',
          publishedCardPrice: '138',
        });

        const eighteen35 = await production.getQuotedProductionCost(
          { thicknessMm: '18', widthMm: '35', lengthMm: '2800' },
          now,
        );
        expect(eighteen35.pricing.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);

        for (const thicknessMm of ['10', '22', '30'] as const) {
          const unsupported = await production.getQuotedProductionCost(
            { thicknessMm, widthMm: '35', lengthMm: '2800' },
            now,
          );
          expect(unsupported.pricing.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);
        }

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const group = await prisma.productGroup.findUnique({ where: { code: 'CITA' } });
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

  it('5–6 band id ile 185/222→190/230 18 mm / 4.7 cm fiyatını değiştirir; 18 mm / 3.5 missing kalır ve rollback edilir', async () => {
    const now = new Date();
    const group = await prisma.productGroup.findUnique({ where: { code: 'CITA' } });
    const openBefore = await prisma.citaPublishedPriceBand.findFirst({
      where: {
        productGroupId: group!.id,
        minWidthMm: 50,
        maxWidthMm: 60,
        isActive: true,
        effectiveTo: null,
      },
    });
    if (openBefore == null) {
      throw new Error('Dynamic test için açık 5–6 cm bandı gerekir.');
    }

    try {
      await prisma.$transaction(async (tx) => {
        const { production, publishedPrices } = quotedServiceForTx(tx);
        const before47 = await production.getQuotedProductionCost(
          { thicknessMm: '18', widthMm: '47', lengthMm: '2800' },
          now,
        );
        expect(before47.pricing).toMatchObject({
          publishedCashPrice: '185',
          publishedCardPrice: '222',
        });
        const beforeCost = {
          netQty: before47.productionYield.netQty,
          mdfUnitCost: before47.mdfUnitCost,
          productionCost: before47.productionCost,
        };

        await publishedPrices.updateActiveBandPrices(
          openBefore.id,
          { cashPrice: '190', cardPrice: '230' },
          now,
        );

        const after47 = await production.getQuotedProductionCost(
          { thicknessMm: '18', widthMm: '47', lengthMm: '2800' },
          now,
        );
        expect(after47.productionYield.netQty).toBe(beforeCost.netQty);
        expect(after47.mdfUnitCost).toBe(beforeCost.mdfUnitCost);
        expect(after47.productionCost).toBe(beforeCost.productionCost);
        expect(after47.pricing).toMatchObject({
          publishedCashPrice: '190',
          publishedCardPrice: '230',
          priceBand: { displayName: '5–6 cm' },
        });

        const eighteen35 = await production.getQuotedProductionCost(
          { thicknessMm: '18', widthMm: '35', lengthMm: '2800' },
          now,
        );
        expect(eighteen35.pricing.statusCode).toBe(CITA_PUBLISHED_PRICE_MISSING);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const openAfter = await prisma.citaPublishedPriceBand.findMany({
      where: {
        productGroupId: group!.id,
        minWidthMm: 50,
        maxWidthMm: 60,
        isActive: true,
        effectiveTo: null,
      },
    });
    expect(openAfter).toHaveLength(1);
    expect(openAfter[0].id).toBe(openBefore.id);
    expect(toDecimal(openAfter[0].cashPrice.toString()).toString()).toBe('185');
    expect(toDecimal(openAfter[0].cardPrice.toString()).toString()).toBe('222');
  });
});
