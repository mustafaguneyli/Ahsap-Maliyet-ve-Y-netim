import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { applyPercentCardSale } from '../../calculation-engine/pricing/percent-card-sale';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { CitaMdfService } from '../cost-calculation/cita-mdf.service';
import { CitaNetService } from '../cost-calculation/cita-net.service';
import { CitaProductionService } from '../cost-calculation/cita-production.service';
import { CostCalculationService } from '../cost-calculation/cost-calculation.service';
import { citaCardMarkupRateSnapshot } from '../cost-calculation/cita-card-markup-rate.fixture';
import { PervazQtyService } from '../pervaz/pervaz-qty.service';
import { PricingSettingsService } from './pricing-settings.service';

const ROLLBACK = new Error('ROLLBACK_GROUP_CARD_MARKUP_DYNAMIC');

function pricingServiceForTx(tx: Prisma.TransactionClient) {
  return new PricingSettingsService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      productGroup: tx.productGroup,
      product: tx.product,
      pricingSetting: tx.pricingSetting,
    } as never,
    new AuditService(tx as never),
  );
}

function costsForTx(tx: Prisma.TransactionClient) {
  return new CostCalculationService(
    tx as never,
    new ExtraCostsService(
      {
        $transaction: async <T>(
          fn: (client: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => fn(tx),
        productGroup: tx.productGroup,
        extraCostType: tx.extraCostType,
        extraCostValue: tx.extraCostValue,
      } as never,
      new AuditService(tx as never),
    ),
    new PervazQtyService(tx as never),
  );
}

function citaProductionForTx(tx: Prisma.TransactionClient) {
  return new CitaProductionService(
    new CitaMdfService(new CitaNetService(tx as never), tx as never),
    new ExtraCostsService(
      {
        $transaction: async <T>(
          fn: (client: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => fn(tx),
        productGroup: tx.productGroup,
        extraCostType: tx.extraCostType,
        extraCostValue: tx.extraCostValue,
      } as never,
      new AuditService(tx as never),
    ),
    tx as never,
  );
}

describe('group card markup screen (DB rollback)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('grup oranını yazar, drawer aynı oranı görür, Çıta nakit kalır ve rollback edilir', async () => {
    const rateBefore = await citaCardMarkupRateSnapshot(prisma);

    try {
      await prisma.$transaction(async (tx) => {
        const pricing = pricingServiceForTx(tx);
        const listed = await pricing.listGroupCardMarkupRates();
        const codes = listed.items.map((item) => item.productGroupCode);
        expect(codes).toEqual(expect.arrayContaining([
          'CITA',
          'door_frame',
          'PERVAZ',
          'SUPURGELIK',
        ]));

        const citaBefore = listed.items.find((item) => item.productGroupCode === 'CITA');
        expect(citaBefore?.cardMarkupRate).toBeNull();
        const doorListed = listed.items.find((item) => item.productGroupCode === 'door_frame');
        expect(doorListed?.cardMarkupRate).toBeNull();
        expect(doorListed?.productCardMarkupRate).toBe('20');

        const production = citaProductionForTx(tx);
        const citaMissing = await production.getQuotedProductionCost({
          thicknessMm: '14',
          widthMm: '30',
          lengthMm: '2800',
        });
        expect(citaMissing.pricing).toMatchObject({
          publishedCashPrice: '145',
          publishedCardPrice: null,
        });

        await pricing.replaceGroupCardMarkupRate({
          productGroup: 'CITA',
          cardMarkupRate: '20',
        });
        const at20 = await pricing.getCitaGroupSetting();
        expect(at20.cardMarkupRate).toBe('20');

        const cashRow = await production.getQuotedProductionCost({
          thicknessMm: '14',
          widthMm: '30',
          lengthMm: '2800',
        });
        expect(cashRow.pricing).toMatchObject({
          publishedCashPrice: '145',
          publishedCardPrice: '174',
        });

        await pricing.replaceGroupCardMarkupRate({
          productGroup: 'CITA',
          cardMarkupRate: '25',
        });
        const at25 = await pricing.getCitaGroupSetting();
        expect(at25.cardMarkupRate).toBe('25');
        const repriced = await production.getQuotedProductionCost({
          thicknessMm: '14',
          widthMm: '30',
          lengthMm: '2800',
        });
        expect(repriced.pricing).toMatchObject({
          publishedCashPrice: '145',
          publishedCardPrice: '181.25',
        });

        const doorBefore = await pricing.getDoorFrameProductSetting('34_MM');
        expect(doorBefore.groupCardMarkupRate).toBeNull();
        expect(doorBefore.productCardMarkupRate).toBe('20');
        expect(doorBefore.cardMarkupRate).toBe('20');
        const costs = costsForTx(tx);
        const door34Before = await costs.getDoorFrameMdfCosts('34_MM');
        const door34Row = door34Before.rows.find(
          (row) => row.widthCm === 10 && row.lengthCm === 210,
        );
        const door30Before = await costs.getDoorFrameMdfCosts('30_MM');
        const door30Row = door30Before.rows.find(
          (row) => row.widthCm === 10 && row.lengthCm === 210,
        );
        if (!door34Row?.pricing.publishedCashPrice || !door30Row?.pricing.publishedCashPrice) {
          throw new Error('Kapı Kasası 10x210 satırı bulunamadı.');
        }
        expect(door34Before.cardMarkupRate).toBe('20');
        expect(door30Before.cardMarkupRate).toBe('20');
        const door34Cash = door34Row.pricing.publishedCashPrice;
        const door30Cash = door30Row.pricing.publishedCashPrice;

        await pricing.replaceGroupCardMarkupRate({
          productGroup: 'door_frame',
          cardMarkupRate: '18.5',
        });
        const doorAfter = await pricing.getDoorFrameProductSetting('34_MM');
        const door30After = await pricing.getDoorFrameProductSetting('30_MM');
        expect(doorAfter.cardMarkupRate).toBe('18.5');
        expect(doorAfter.groupCardMarkupRate).toBe('18.5');
        expect(door30After.groupCardMarkupRate).toBe('18.5');
        expect(door30After.cardMarkupRate).toBe('18.5');
        expect(doorAfter.productCardMarkupRate).toBe('20');
        expect(doorAfter.vatRate).toBe(doorBefore.vatRate);
        expect(doorAfter.profitRate).toBe(doorBefore.profitRate);
        const door34Priced = await costs.getDoorFrameMdfCosts('34_MM');
        const door30Priced = await costs.getDoorFrameMdfCosts('30_MM');
        expect(door34Priced.cardMarkupRate).toBe('18.5');
        expect(door30Priced.cardMarkupRate).toBe('18.5');
        expect(
          door34Priced.rows.find((row) => row.widthCm === 10 && row.lengthCm === 210)
            ?.pricing.publishedCashPrice,
        ).toBe(door34Cash);
        expect(
          door30Priced.rows.find((row) => row.widthCm === 10 && row.lengthCm === 210)
            ?.pricing.publishedCashPrice,
        ).toBe(door30Cash);
        expect(
          door34Priced.rows.find((row) => row.widthCm === 10 && row.lengthCm === 210)
            ?.pricing.publishedCardPrice,
        ).toBe(
          applyPercentCardSale({
            cashPrice: door34Cash,
            cardMarkupRate: '18.5',
            rounding: 'roundUpWholeTl',
          }).cardSalePrice,
        );

        const pervazCostsBefore = await costs.getAyarliPervazMdfCosts();
        const pervazRow = pervazCostsBefore.rows.find(
          (row) =>
            row.pricing.cardSaleAvailable && row.pricing.publishedSalePrice != null,
        );
        if (!pervazRow?.pricing.publishedSalePrice) {
          throw new Error('Kart satışı açık Pervaz satırı bulunamadı.');
        }
        expect(pervazRow.pricing.cardSalePrice).toBeNull();
        const pervazCash = pervazRow.pricing.publishedSalePrice;
        const pervazBefore = await pricing.getPervazProductSetting('AYARLI_PERVAZ');
        await pricing.replaceGroupCardMarkupRate({
          productGroup: 'PERVAZ',
          cardMarkupRate: '25',
        });
        const pervazAfter = await pricing.getPervazProductSetting('AYARLI_PERVAZ');
        expect(pervazAfter.cardMarkupRate).toBe('25');
        expect(pervazAfter.profitRate).toBe(pervazBefore.profitRate);
        const pervazPriced = (await costs.getAyarliPervazMdfCosts()).rows.find(
          (row) =>
            row.thicknessMm === pervazRow.thicknessMm &&
            row.widthMm === pervazRow.widthMm &&
            row.lengthMm === pervazRow.lengthMm,
        );
        expect(pervazPriced?.pricing.publishedSalePrice).toBe(pervazCash);
        expect(pervazPriced?.pricing.cardSalePrice).toBe(
          applyPercentCardSale({
            cashPrice: pervazCash,
            cardMarkupRate: '25',
            rounding: 'none',
          }).cardSalePrice,
        );

        const supCostsBefore = await costs.getSupurgelikMdfCosts({
          productCode: 'DUZ_SUPURGELIK',
        });
        const supRow = supCostsBefore.rows.find(
          (row) => row.pricing?.publishedCashPrice != null && row.errorCode == null,
        );
        if (!supRow?.pricing?.publishedCashPrice) {
          throw new Error('Nakit satışı olan Düz Süpürgelik satırı bulunamadı.');
        }
        expect(
          (supRow.pricing as { publishedCardPrice?: string | null }).publishedCardPrice,
        ).toBeNull();
        const supCash = supRow.pricing.publishedCashPrice;
        const supBefore = await pricing.getSupurgelikGroupSetting();
        await pricing.replaceGroupCardMarkupRate({
          productGroup: 'SUPURGELIK',
          cardMarkupRate: '10',
        });
        const supAfter = await pricing.getSupurgelikGroupSetting();
        expect(supAfter.cardMarkupRate).toBe('10');
        expect(supAfter.profitRate).toBe(supBefore.profitRate);
        expect(toDecimal(supAfter.profitRate).equals(supBefore.profitRate)).toBe(true);
        const supPriced = (
          await costs.getSupurgelikMdfCosts({ productCode: 'DUZ_SUPURGELIK' })
        ).rows.find(
          (row) =>
            row.thicknessMm === supRow.thicknessMm &&
            row.widthMm === supRow.widthMm &&
            row.lengthMm === supRow.lengthMm,
        );
        const supSale = supPriced?.pricing as
          | { publishedCashPrice?: string | null; publishedCardPrice?: string | null }
          | undefined;
        expect(supSale?.publishedCashPrice).toBe(supCash);
        expect(supSale?.publishedCardPrice).toBe(
          applyPercentCardSale({
            cashPrice: supCash,
            cardMarkupRate: '10',
            rounding: 'roundUpWholeTl',
          }).cardSalePrice,
        );

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    expect(await citaCardMarkupRateSnapshot(prisma)).toBe(rateBefore);
  });
});
