import { PricingModifierType, Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../audit/audit.service';
import { ExtraCostsService } from '../extra-costs/extra-costs.service';
import { PricingSettingsService } from '../pricing/pricing-settings.service';
import { PricingThicknessModifiersService } from '../pricing/pricing-thickness-modifiers.service';
import { toDecimal } from '../../common/decimal/decimal.util';
import { CostCalculationService } from './cost-calculation.service';

const ROLLBACK = new Error('ROLLBACK_SUPURGELIK_PRICING_DYNAMIC_SOURCE_TEST');
const SIZE = {
  thicknessMm: 12,
  widthMm: 120,
  lengthMm: 2800,
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

function pricingSettingsServiceForTx(tx: Prisma.TransactionClient) {
  return new PricingSettingsService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      productGroup: tx.productGroup,
      pricingSetting: tx.pricingSetting,
    } as never,
    new AuditService(tx as never),
  );
}

function pricingThicknessModifiersServiceForTx(tx: Prisma.TransactionClient) {
  return new PricingThicknessModifiersService(
    {
      $transaction: async <T>(
        fn: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => fn(tx),
      productGroup: tx.productGroup,
      pricingThicknessModifier: tx.pricingThicknessModifier,
    } as never,
    new AuditService(tx as never),
  );
}

describe('Süpürgelik pricing request-time DB regression', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('profitRate 20→21 updateValue history ile 12/120 nakit 184→185 olur ve rollback eder', async () => {
    const group = await prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    if (!group?.isActive) {
      throw new Error('Dynamic test için aktif SUPURGELIK grubu gerekir.');
    }

    const activeSettings = await prisma.pricingSetting.findMany({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
    if (activeSettings.length !== 1 || activeSettings[0].profitRate == null) {
      throw new Error(
        `Dynamic test için profitRate içeren tek aktif SUPURGELIK group PricingSetting gerekir; bulunan=${activeSettings.length}.`,
      );
    }
    const original = activeSettings[0];
    if (!toDecimal(original.profitRate!.toString()).equals('20')) {
      throw new Error(
        `Dynamic test beklenen SUPURGELIK profitRate=20; bulunan=${original.profitRate!.toString()}.`,
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const extraCostsService = extraCostsServiceForTx(tx);
        const pricingSettingsService = pricingSettingsServiceForTx(tx);
        const service = new CostCalculationService(
          tx as never,
          extraCostsService,
          {} as never,
        );

        const before = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_SUPURGELIK',
          ...SIZE,
        });
        expect(before.mdfUnitCost).toBe('136.5625');
        expect(before.extraCostsTotal).toBe('16');
        expect(before.productionCost).toBe('152.5625');
        expect(before.pricing).toMatchObject({
          profitRate: '20',
          profitAmount: '30.5125',
          priceBeforeRounding: '183.075',
          publishedCashPrice: '184',
        });

        await pricingSettingsService.replaceSupurgelikGroupSetting({
          productGroup: 'SUPURGELIK',
          profitRate: '21',
        });

        const closed = await tx.pricingSetting.findUnique({ where: { id: original.id } });
        expect(closed?.isActive).toBe(false);
        expect(toDecimal(closed!.profitRate!.toString()).equals('20')).toBe(true);

        const nextOpen = await tx.pricingSetting.findMany({
          where: {
            productGroupId: group.id,
            productId: null,
            isActive: true,
          },
        });
        expect(nextOpen).toHaveLength(1);
        expect(nextOpen[0].id).not.toBe(original.id);
        expect(toDecimal(nextOpen[0].profitRate!.toString()).equals('21')).toBe(true);
        expect(nextOpen[0].productId).toBeNull();

        const productScoped = await tx.pricingSetting.findMany({
          where: {
            productGroupId: group.id,
            productId: { not: null },
            isActive: true,
          },
        });
        expect(productScoped).toHaveLength(0);

        const after = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_SUPURGELIK',
          ...SIZE,
        });
        expect(after.mdfUnitCost).toBe(before.mdfUnitCost);
        expect(after.extraCostsTotal).toBe(before.extraCostsTotal);
        expect(after.productionCost).toBe('152.5625');
        expect(after.pricing).toMatchObject({
          profitRate: '21',
          profitAmount: '32.038125',
          priceBeforeRounding: '184.600625',
          roundedBaseSalePrice: '185',
          publishedCashPrice: '185',
        });

        const decorative = await service.getSupurgelikMdfCost({
          productCode: 'DEKORATIF_SUPURGELIK',
          ...SIZE,
        });
        expect(decorative.productionCost).toBe('152.5625');
        expect(decorative.pricing).toMatchObject({
          profitRate: '21',
          basePublishedCashPrice: '185',
          decorativeRate: '25',
          publishedCashPrice: '232',
        });

        const ppDuz = await service.getSupurgelikMdfCost({
          productCode: 'DUZ_PP_SARMA_SUPURGELIK',
          ...SIZE,
        });
        const ppDekoratif = await service.getSupurgelikMdfCost({
          productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK',
          ...SIZE,
        });
        expect(ppDuz.productionCost).toBe('152.5625');
        const wrapping = await extraCostsService.getSupurgelikPpWrapping();
        if (wrapping.items[0]?.amount == null) {
          expect(ppDuz.pricing).toMatchObject({
            publishedCashPrice: null,
            statusCode: 'PP_WRAPPING_COST_MISSING',
          });
          expect(ppDekoratif.pricing).toMatchObject({
            publishedCashPrice: null,
            statusCode: 'PP_WRAPPING_COST_MISSING',
          });
        } else {
          expect(ppDuz.pricing).toMatchObject({
            baseProductionCost: '152.5625',
            ppWrappingCost: wrapping.items[0].amount,
          });
          expect(ppDekoratif.pricing).toMatchObject({
            baseProductionCost: '152.5625',
            ppWrappingCost: wrapping.items[0].amount,
          });
        }

        const list = await service.getSupurgelikMdfCosts({
          productCode: 'DUZ_SUPURGELIK',
        });
        const missingNineMm = list.rows.filter(
          (row) =>
            row.thicknessMm === 9 && row.errorCode === 'RAW_MATERIAL_PRICE_MISSING',
        );
        for (const row of missingNineMm) {
          expect(row.productionCost).toBeNull();
          expect(row.mdfUnitCost).toBeNull();
          expect(row.pricing?.publishedCashPrice).toBeNull();
          if (row.pricing && 'profitAmount' in row.pricing) {
            expect(row.pricing.profitAmount).toBeNull();
          }
        }

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const restored = await prisma.pricingSetting.findUnique({
      where: { id: original.id },
    });
    expect(restored?.isActive).toBe(true);
    expect(toDecimal(restored!.profitRate!.toString()).equals('20')).toBe(true);

    const stillOpen = await prisma.pricingSetting.findMany({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0].id).toBe(original.id);
  });

  it('12 mm dekoratif oranını 25→26 history ile 12/120 nakit 230→232 olur ve rollback eder', async () => {
    const now = new Date();
    const group = await prisma.productGroup.findUnique({
      where: { code: 'SUPURGELIK' },
    });
    if (!group?.isActive) {
      throw new Error('Dynamic test için aktif SUPURGELIK grubu gerekir.');
    }

    const activeModifiers = await prisma.pricingThicknessModifier.findMany({
      where: {
        productGroupId: group.id,
        modifierType: PricingModifierType.DECORATIVE,
        thicknessMm: { in: [12, 14, 18] },
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { thicknessMm: 'asc' },
    });
    const byThickness = new Map(
      activeModifiers.map((row) => [row.thicknessMm, row]),
    );
    if (byThickness.size !== 3 || activeModifiers.length !== 3) {
      throw new Error(
        `Dynamic test için tek geçerli 12/14/18 mm dekoratif oran gerekir; bulunan=${activeModifiers.length}.`,
      );
    }
    const modifier12 = byThickness.get(12);
    const modifier14 = byThickness.get(14);
    const modifier18 = byThickness.get(18);
    if (
      modifier12 == null ||
      modifier14 == null ||
      modifier18 == null ||
      !new Decimal(modifier12.rate.toString()).equals(25) ||
      !new Decimal(modifier14.rate.toString()).equals(25) ||
      !new Decimal(modifier18.rate.toString()).equals(45)
    ) {
      throw new Error(
        `Dynamic test 12/14/18 başlangıç oranlarını %25/%25/%45 bekler; bulunan=${[...byThickness.values()]
          .map((row) => `${row.thicknessMm}:${row.rate.toString()}`)
          .join(', ')}.`,
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const extraCostsService = extraCostsServiceForTx(tx);
        const modifiersService = pricingThicknessModifiersServiceForTx(tx);
        const service = new CostCalculationService(
          tx as never,
          extraCostsService,
          {} as never,
        );

        const listed = await modifiersService.listSupurgelikDecorativeRates(
          'SUPURGELIK',
          now,
        );
        expect(listed.items).toEqual([
          expect.objectContaining({ thicknessMm: 12, rate: '25' }),
          expect.objectContaining({ thicknessMm: 14, rate: '25' }),
          expect.objectContaining({ thicknessMm: 18, rate: '45' }),
        ]);

        const before = await service.getSupurgelikMdfCost(
          {
            productCode: 'DEKORATIF_SUPURGELIK',
            thicknessMm: 12,
            widthMm: 120,
            lengthMm: 2800,
          },
          now,
        );
        expect(before.mdfUnitCost).toBe('136.5625');
        expect(before.extraCostsTotal).toBe('16');
        expect(before.productionCost).toBe('152.5625');
        expect(before.pricing).toMatchObject({
          profitRate: '20',
          basePublishedCashPrice: '184',
          decorativeRate: '25',
          priceBeforeDecorativeRounding: '230',
          publishedCashPrice: '230',
        });

        await modifiersService.replaceSupurgelikDecorativeRate(
          { productGroup: 'SUPURGELIK', thicknessMm: 12, rate: '26' },
          now,
        );

        const closed = await tx.pricingThicknessModifier.findUnique({
          where: { id: modifier12.id },
        });
        expect(closed?.isActive).toBe(false);
        expect(toDecimal(closed!.rate.toString()).equals('25')).toBe(true);

        const nextOpen = await tx.pricingThicknessModifier.findMany({
          where: {
            productGroupId: group.id,
            modifierType: PricingModifierType.DECORATIVE,
            thicknessMm: 12,
            isActive: true,
          },
        });
        expect(nextOpen).toHaveLength(1);
        expect(nextOpen[0].id).not.toBe(modifier12.id);
        expect(toDecimal(nextOpen[0].rate.toString()).equals('26')).toBe(true);

        const after = await service.getSupurgelikMdfCost(
          {
            productCode: 'DEKORATIF_SUPURGELIK',
            thicknessMm: 12,
            widthMm: 120,
            lengthMm: 2800,
          },
          now,
        );
        expect(after.mdfUnitCost).toBe(before.mdfUnitCost);
        expect(after.extraCostsTotal).toBe(before.extraCostsTotal);
        expect(after.productionCost).toBe('152.5625');
        if (
          before.pricing == null ||
          after.pricing == null ||
          !('decorativeRate' in before.pricing) ||
          !('decorativeRate' in after.pricing)
        ) {
          throw new Error('Dynamic test dekoratif pricing sonucu bekler.');
        }
        expect(after.pricing.profitRate).toBe(before.pricing.profitRate);
        expect(after.pricing.profitAmount).toBe(before.pricing.profitAmount);
        expect(after.pricing.basePublishedCashPrice).toBe('184');
        expect(after.pricing.decorativeRate).toBe('26');
        expect(after.pricing.priceBeforeDecorativeRounding).toBe('231.84');
        expect(after.pricing.publishedCashPrice).toBe('232');

        const row14 = await service.getSupurgelikMdfCost(
          {
            productCode: 'DEKORATIF_SUPURGELIK',
            thicknessMm: 14,
            widthMm: 120,
            lengthMm: 2800,
          },
          now,
        );
        expect(row14.pricing).toMatchObject({
          decorativeRate: '25',
          publishedCashPrice: '272',
        });

        const row18 = await service.getSupurgelikMdfCost(
          {
            productCode: 'DEKORATIF_SUPURGELIK',
            thicknessMm: 18,
            widthMm: 120,
            lengthMm: 2800,
          },
          now,
        );
        expect(row18.pricing).toMatchObject({
          decorativeRate: '45',
          publishedCashPrice: '334',
        });

        const list = await service.getSupurgelikMdfCosts(
          { productCode: 'DEKORATIF_SUPURGELIK' },
          now,
        );
        for (const thicknessMm of [8, 10]) {
          const missingRate = list.rows.filter(
            (row) =>
              row.thicknessMm === thicknessMm &&
              row.errorCode === 'DECORATIVE_RATE_MISSING',
          );
          expect(missingRate.length).toBeGreaterThan(0);
          expect(
            missingRate.every((row) => row.pricing?.publishedCashPrice == null),
          ).toBe(true);
        }
        const missingNineMm = list.rows.filter(
          (row) =>
            row.thicknessMm === 9 &&
            row.errorCode === 'RAW_MATERIAL_PRICE_MISSING',
        );
        expect(missingNineMm.length).toBeGreaterThan(0);
        for (const row of missingNineMm) {
          expect(row.productionCost).toBeNull();
          expect(row.pricing?.publishedCashPrice).toBeNull();
        }

        const ppDekoratif = await service.getSupurgelikMdfCost(
          {
            productCode: 'DEKORATIF_PP_SARMA_SUPURGELIK',
            thicknessMm: 12,
            widthMm: 120,
            lengthMm: 2800,
          },
          now,
        );
        expect(ppDekoratif.productionCost).toBe('152.5625');
        const wrapping = await extraCostsService.getSupurgelikPpWrapping(now);
        if (wrapping.items[0]?.amount == null) {
          expect(ppDekoratif.pricing).toMatchObject({
            publishedCashPrice: null,
            statusCode: 'PP_WRAPPING_COST_MISSING',
          });
        } else {
          expect(ppDekoratif.pricing).toMatchObject({
            baseProductionCost: '152.5625',
            ppWrappingCost: wrapping.items[0].amount,
          });
        }

        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }

    const restored = await prisma.pricingThicknessModifier.findUnique({
      where: { id: modifier12.id },
    });
    expect(restored?.isActive).toBe(true);
    expect(toDecimal(restored!.rate.toString()).equals('25')).toBe(true);

    const stillOpen = await prisma.pricingThicknessModifier.findMany({
      where: {
        productGroupId: group.id,
        modifierType: PricingModifierType.DECORATIVE,
        thicknessMm: 12,
        isActive: true,
      },
    });
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0].id).toBe(modifier12.id);
  });
});
