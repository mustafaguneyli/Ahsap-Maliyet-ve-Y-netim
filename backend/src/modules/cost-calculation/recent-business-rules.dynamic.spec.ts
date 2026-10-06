import { Prisma, PrismaClient } from '@prisma/client';
import { toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { RawMaterialsService } from '../materials/raw-materials.service';
import { PervazQtyService } from '../pervaz/pervaz-qty.service';
import { DekoratifPervazPremiumsService } from '../pricing/dekoratif-pervaz-premiums.service';
import { PricingSettingsService } from '../pricing/pricing-settings.service';
import { PricingThicknessModifiersService } from '../pricing/pricing-thickness-modifiers.service';
import { CostCalculationService } from './cost-calculation.service';
import { CitaMdfService } from './cita-mdf.service';
import { CitaNetService } from './cita-net.service';
import { CitaProductionService } from './cita-production.service';

const ROLLBACK = new Error('ROLLBACK_RECENT_BUSINESS_RULES');
const MATERIAL_14 = 'MDF-14-2100X2800-ZIMPARALI';
const SUPURGELIK_SIZE = { thicknessMm: 12, widthMm: 120, lengthMm: 2800 } as const;

function txPrisma(tx: Prisma.TransactionClient) {
  return {
    $transaction: async <T>(
      fn: (client: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> => fn(tx),
    productGroup: tx.productGroup,
    product: tx.product,
    extraCostType: tx.extraCostType,
    extraCostValue: tx.extraCostValue,
    pricingSetting: tx.pricingSetting,
    pricingThicknessModifier: tx.pricingThicknessModifier,
    pricingRowException: tx.pricingRowException,
    productionYield: tx.productionYield,
    productSize: tx.productSize,
    rawMaterial: tx.rawMaterial,
    rawMaterialPrice: tx.rawMaterialPrice,
  } as never;
}

async function fingerprint(prisma: PrismaClient): Promise<string> {
  const [bands, settings, prices, extraCount, modifierCount, exceptionCount] =
    await Promise.all([
      prisma.citaPublishedPriceBand.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          minWidthMm: true,
          maxWidthMm: true,
          cashPrice: true,
          cardPrice: true,
          isActive: true,
          effectiveTo: true,
        },
      }),
      prisma.pricingSetting.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          productGroupId: true,
          productId: true,
          isActive: true,
          cardMarkupRate: true,
          profitRate: true,
          vatRate: true,
        },
      }),
      prisma.rawMaterialPrice.findMany({
        where: { priceType: 'CARD_INSTALLMENT', isActive: true, effectiveTo: null },
        orderBy: { id: 'asc' },
        select: { id: true, rawMaterialId: true, price: true },
      }),
      prisma.extraCostValue.count(),
      prisma.pricingThicknessModifier.count(),
      prisma.pricingRowException.count(),
    ]);

  return JSON.stringify({
    bands: bands.map((row) => ({
      id: row.id,
      minWidthMm: row.minWidthMm,
      maxWidthMm: row.maxWidthMm,
      cash: row.cashPrice.toString(),
      card: row.cardPrice.toString(),
      isActive: row.isActive,
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
    })),
    settings: settings.map((row) => ({
      id: row.id,
      productGroupId: row.productGroupId,
      productId: row.productId,
      isActive: row.isActive,
      card: row.cardMarkupRate?.toString() ?? null,
      profit: row.profitRate?.toString() ?? null,
      vat: row.vatRate?.toString() ?? null,
    })),
    prices: prices.map((row) => ({
      id: row.id,
      rawMaterialId: row.rawMaterialId,
      price: row.price.toString(),
    })),
    extraCount,
    modifierCount,
    exceptionCount,
  });
}

describe('son dört iş kuralı dynamic rollback', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Çıta cardMarkupRate 20→25 yalnız kartı 174→181.25 yapar ve rollback eder', async () => {
    const before = await fingerprint(prisma);
    const date = new Date().toISOString().slice(0, 10);

    try {
      await prisma.$transaction(async (tx) => {
        const client = txPrisma(tx);
        const extras = new ExtraCostsService(client, new AuditService(tx as never));
        const pricing = new PricingSettingsService(client, new AuditService(tx as never));
        const production = new CitaProductionService(
          new CitaMdfService(new CitaNetService(tx as never), tx as never),
          extras,
          tx as never,
        );
        await extras.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount: '250',
          effectiveFrom: date,
        });
        await extras.updateValue('LABOR', {
          productGroup: 'CITA',
          amount: '10',
          effectiveFrom: date,
        });
        await pricing.replaceCitaGroupSetting({
          productGroup: 'CITA',
          cardMarkupRate: '20',
        });

        const at20 = await production.getQuotedProductionCost({
          thicknessMm: '14',
          widthMm: '30',
          lengthMm: '2800',
        });
        expect(at20.pricing.publishedCashPrice).toBe('145');
        expect(at20.pricing.publishedCardPrice).toBe('174');
        expect(at20.cuttingUnitCost).toBe('1');

        await pricing.replaceCitaGroupSetting({
          productGroup: 'CITA',
          cardMarkupRate: '25',
        });
        const at25 = await production.getQuotedProductionCost({
          thicknessMm: '14',
          widthMm: '30',
          lengthMm: '2800',
        });
        expect(at25.pricing.publishedCashPrice).toBe('145');
        expect(at25.pricing.publishedCardPrice).toBe('181.25');
        expect(at25.productionCost).toBe(at20.productionCost);
        expect(at25.mdfUnitCost).toBe(at20.mdfUnitCost);
        expect(at25.productionYield.netQty).toBe(at20.productionYield.netQty);
        expect(at25.cuttingUnitCost).toBe('1');

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    expect(await fingerprint(prisma)).toBe(before);
  });

  it('Çıta CUTTING 250→500 birim kesimi 1→2 yapar; NET, MDF, nakit ve kart aynı kalır', async () => {
    const before = await fingerprint(prisma);
    const date = new Date().toISOString().slice(0, 10);

    try {
      await prisma.$transaction(async (tx) => {
        const client = txPrisma(tx);
        const extras = new ExtraCostsService(client, new AuditService(tx as never));
        const pricing = new PricingSettingsService(client, new AuditService(tx as never));
        const production = new CitaProductionService(
          new CitaMdfService(new CitaNetService(tx as never), tx as never),
          extras,
          tx as never,
        );
        await pricing.replaceCitaGroupSetting({
          productGroup: 'CITA',
          cardMarkupRate: '20',
        });
        await extras.updateValue('LABOR', {
          productGroup: 'CITA',
          amount: '10',
          effectiveFrom: date,
        });
        await extras.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount: '250',
          effectiveFrom: date,
        });

        const customBefore = await production.getQuotedProductionCost({
          thicknessMm: '14',
          widthMm: '35',
          lengthMm: '2800',
        });
        const standardBefore = await production.getQuotedProductionCost({
          thicknessMm: '14',
          widthMm: '40',
          lengthMm: '2800',
        });
        expect(customBefore.productionYield.netQty).toBe(53);
        expect(standardBefore.productionYield).toEqual({ netQty: 47, source: 'MASTER' });
        expect(customBefore.cuttingUnitCost).toBe('1');
        expect(standardBefore.cuttingUnitCost).toBe('1');
        expect(customBefore.pricing.publishedCashPrice).toBe('145');
        expect(customBefore.pricing.publishedCardPrice).toBe('174');

        await extras.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount: '500',
          effectiveFrom: date,
        });
        const customAfter = await production.getQuotedProductionCost({
          thicknessMm: '14',
          widthMm: '35',
          lengthMm: '2800',
        });
        expect(customAfter.cuttingUnitCost).toBe('2');
        expect(customAfter.productionYield.netQty).toBe(customBefore.productionYield.netQty);
        expect(customAfter.mdfUnitCost).toBe(customBefore.mdfUnitCost);
        expect(customAfter.extraCosts.find((item) => item.code === 'LABOR')?.amount).toBe(
          '10',
        );
        expect(customAfter.productionCost).toBe(
          toDecimal(customBefore.productionCost!).plus(1).toFixed(),
        );
        expect(customAfter.pricing.publishedCashPrice).toBe(
          customBefore.pricing.publishedCashPrice,
        );
        expect(customAfter.pricing.publishedCardPrice).toBe(
          customBefore.pricing.publishedCardPrice,
        );
        expect(standardBefore.sheetPrice.amount).toBe(customBefore.sheetPrice.amount);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    expect(await fingerprint(prisma)).toBe(before);
  });

  it('MDF fiyatı productionCost değiştirir, yayın nakit fiyatını değiştirmez', async () => {
    const before = await fingerprint(prisma);
    const material = await prisma.rawMaterial.findUnique({
      where: { code: MATERIAL_14 },
    });
    const open = await prisma.rawMaterialPrice.findFirst({
      where: {
        rawMaterialId: material!.id,
        priceType: 'CARD_INSTALLMENT',
        isActive: true,
        effectiveTo: null,
      },
    });
    if (!material || !open) {
      throw new Error('Dynamic test için açık 14 mm CARD fiyatı gerekir.');
    }
    const now = new Date();
    if (now.getTime() <= open.effectiveFrom.getTime()) {
      throw new Error('MDF fiyat effectiveFrom şu andan sonra olamaz.');
    }
    const date = now.toISOString().slice(0, 10);

    try {
      await prisma.$transaction(async (tx) => {
        const client = txPrisma(tx);
        const extras = new ExtraCostsService(client, new AuditService(tx as never));
        const pricing = new PricingSettingsService(client, new AuditService(tx as never));
        const rawMaterials = new RawMaterialsService(client, new AuditService(tx as never));
        const production = new CitaProductionService(
          new CitaMdfService(new CitaNetService(tx as never), tx as never),
          extras,
          tx as never,
        );
        await pricing.replaceCitaGroupSetting({
          productGroup: 'CITA',
          cardMarkupRate: '20',
        });
        await extras.updateValue('CUTTING', {
          productGroup: 'CITA',
          amount: '250',
          effectiveFrom: date,
        });
        await extras.updateValue('LABOR', {
          productGroup: 'CITA',
          amount: '10',
          effectiveFrom: date,
        });
        const quotedBefore = await production.getQuotedProductionCost(
          { thicknessMm: '14', widthMm: '30', lengthMm: '2800' },
          now,
        );
        await rawMaterials.updateCardInstallmentPrice(
          material.id,
          { price: toDecimal(open.price.toString()).plus(100).toFixed() },
          now,
        );
        const quotedAfter = await production.getQuotedProductionCost(
          { thicknessMm: '14', widthMm: '30', lengthMm: '2800' },
          now,
        );
        expect(quotedAfter.productionYield.netQty).toBe(quotedBefore.productionYield.netQty);
        expect(quotedAfter.mdfUnitCost).not.toBe(quotedBefore.mdfUnitCost);
        expect(quotedAfter.productionCost).not.toBe(quotedBefore.productionCost);
        expect(quotedAfter.pricing.publishedCashPrice).toBe('145');
        expect(quotedAfter.pricing.publishedCardPrice).toBe('174');
        expect(quotedAfter.cuttingUnitCost).toBe(quotedBefore.cuttingUnitCost);

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    expect(await fingerprint(prisma)).toBe(before);
  });

  it('Süpürgelik dekoratif oranı yalnız dekoratif ürünleri değiştirir ve rollback eder', async () => {
    const before = await fingerprint(prisma);
    const now = new Date();

    try {
      await prisma.$transaction(async (tx) => {
        const client = txPrisma(tx);
        const extras = new ExtraCostsService(client, new AuditService(tx as never));
        const modifiers = new PricingThicknessModifiersService(
          client,
          new AuditService(tx as never),
        );
        const service = new CostCalculationService(
          tx as never,
          extras,
          new PervazQtyService(tx as never),
        );
        const listed = await modifiers.listSupurgelikDecorativeRates('SUPURGELIK', now);
        const target = listed.items.find(
          (item) => item.thicknessMm === SUPURGELIK_SIZE.thicknessMm,
        );
        if (!target) {
          throw new Error('Süpürgelik 12 mm dekoratif kataloğu yok.');
        }
        const nextRate =
          target.rate == null ? '25' : toDecimal(target.rate).plus(1).toFixed();
        const size = { ...SUPURGELIK_SIZE, thicknessMm: target.thicknessMm };

        const duzBefore = await service.getSupurgelikMdfCost(
          { productCode: 'DUZ_SUPURGELIK', ...size },
          now,
        );
        const decorativeBefore = await service.getSupurgelikMdfCost(
          { productCode: 'DEKORATIF_SUPURGELIK', ...size },
          now,
        );
        const ppBefore = await service.getSupurgelikMdfCost(
          { productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK', ...size },
          now,
        );

        await modifiers.replaceSupurgelikDecorativeRate(
          { productGroup: 'SUPURGELIK', thicknessMm: target.thicknessMm, rate: nextRate },
          now,
        );

        const duzAfter = await service.getSupurgelikMdfCost(
          { productCode: 'DUZ_SUPURGELIK', ...size },
          now,
        );
        const decorativeAfter = await service.getSupurgelikMdfCost(
          { productCode: 'DEKORATIF_SUPURGELIK', ...size },
          now,
        );
        const ppAfter = await service.getSupurgelikMdfCost(
          { productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK', ...size },
          now,
        );

        expect(duzAfter.productionCost).toBe(duzBefore.productionCost);
        expect(duzAfter.pricing?.publishedCashPrice).toBe(
          duzBefore.pricing?.publishedCashPrice,
        );
        expect(decorativeAfter.productionCost).toBe(decorativeBefore.productionCost);
        expect(decorativeAfter.pricing).toMatchObject({ decorativeRate: nextRate });
        if (target.rate == null) {
          expect(decorativeBefore.pricing).toMatchObject({
            decorativeRate: null,
            statusCode: 'DECORATIVE_RATE_MISSING',
          });
        }
        expect(decorativeAfter.pricing?.publishedCashPrice).not.toBe(
          decorativeBefore.pricing?.publishedCashPrice,
        );
        if (
          ppBefore.pricing &&
          'decorativeRate' in ppBefore.pricing &&
          ppAfter.pricing &&
          'decorativeRate' in ppAfter.pricing
        ) {
          expect(ppAfter.pricing.decorativeRate).toBe(nextRate);
          expect(ppAfter.productionCost).toBe(ppBefore.productionCost);
        }

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    expect(await fingerprint(prisma)).toBe(before);
  });

  it('Pervaz dekoratif farkı yalnız ilgili satırı değiştirir; Ayarlı aynı kalır ve rollback eder', async () => {
    const before = await fingerprint(prisma);
    const now = new Date();

    try {
      await prisma.$transaction(async (tx) => {
        const client = txPrisma(tx);
        const extras = new ExtraCostsService(client, new AuditService(tx as never));
        const premiums = new DekoratifPervazPremiumsService(
          client,
          new AuditService(tx as never),
        );
        const service = new CostCalculationService(
          tx as never,
          extras,
          new PervazQtyService(tx as never),
        );
        const listed = await premiums.listPremiums('DEKORATIF_PERVAZ', now);
        const target = listed.items[0];
        if (!target) {
          throw new Error('Dekoratif Pervaz master satırı yok.');
        }
        const nextRate = target.rate == null ? '30' : toDecimal(target.rate).plus(10).toFixed();

        const ayarliBefore = await service.getAyarliPervazMdfCosts(now);
        const ayarliSnapshot = ayarliBefore.rows.map((row) => ({
          thicknessMm: row.thicknessMm,
          widthMm: row.widthMm,
          lengthMm: row.lengthMm,
          productionCost: row.productionCost,
          publishedSalePrice: row.pricing.publishedSalePrice,
        }));

        await premiums.replacePremium(
          {
            productCode: 'DEKORATIF_PERVAZ',
            thicknessMm: target.thicknessMm,
            widthMm: target.widthMm,
            lengthMm: target.lengthMm,
            rate: nextRate,
          },
          now,
        );

        const dekoratifAfter = await service.getDekoratifPervazCosts(now);
        const changed = dekoratifAfter.rows.find(
          (row) =>
            row.thicknessMm === target.thicknessMm &&
            row.widthMm === target.widthMm &&
            row.lengthMm === target.lengthMm,
        );
        expect(changed?.pricing.decorativePremiumRate).toBe(nextRate);
        const untouched = dekoratifAfter.rows.find(
          (row) =>
            !(
              row.thicknessMm === target.thicknessMm &&
              row.widthMm === target.widthMm &&
              row.lengthMm === target.lengthMm
            ),
        );
        if (untouched) {
          const original = listed.items.find(
            (item) =>
              item.thicknessMm === untouched.thicknessMm &&
              item.widthMm === untouched.widthMm &&
              item.lengthMm === untouched.lengthMm,
          );
          expect(untouched.pricing.decorativePremiumRate).toBe(original?.rate ?? untouched.pricing.decorativePremiumRate);
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

    expect(await fingerprint(prisma)).toBe(before);
  });
});
