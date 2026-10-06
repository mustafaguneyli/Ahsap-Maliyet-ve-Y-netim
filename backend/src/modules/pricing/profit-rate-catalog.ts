import type { PrismaService } from '../../prisma/prisma.service';
import {
  resolveProfitRate,
  type EffectivePeriodRecord,
  type ProfitRateHolder,
  type ProfitRateResolution,
} from './ayarli-pervaz-profit-rate.resolver';

type OverrideRow = EffectivePeriodRecord & {
  productSizeId: string | null;
  profitRate: { toString(): string } | string | null;
};

export type ProfitRateCatalog = {
  sizeOverrides: OverrideRow[];
  productOverrides: OverrideRow[];
  productSettings: ProfitRateHolder[];
  groupSettings: ProfitRateHolder[];
  globalSettings: ProfitRateHolder[];
};

export async function loadProfitRateCatalog(
  prisma: PrismaService,
  productId: string,
  productGroupId: string,
): Promise<ProfitRateCatalog> {
  const [overrides, productSettings, groupSettings, globalSettings] =
    await Promise.all([
      prisma.productPricingOverride.findMany({
        where: { productId, isActive: true },
      }),
      prisma.pricingSetting.findMany({
        where: { productId, productGroupId: null, isActive: true },
      }),
      prisma.pricingSetting.findMany({
        where: { productGroupId, productId: null, isActive: true },
      }),
      prisma.pricingSetting.findMany({
        where: { productGroupId: null, productId: null, isActive: true },
      }),
    ]);

  return {
    sizeOverrides: overrides.filter((row) => row.productSizeId != null),
    productOverrides: overrides.filter((row) => row.productSizeId == null),
    productSettings,
    groupSettings,
    globalSettings,
  };
}

export function resolveCatalogProfitRate(input: {
  catalog: ProfitRateCatalog;
  now: Date;
  productCode?: string;
  productSizeId?: string | null;
  rowExceptions?: Array<
    EffectivePeriodRecord & { profitRate: { toString(): string } | string | null }
  >;
  required?: boolean;
}): ProfitRateResolution | { profitRate: null; source: null } {
  const sizeOverrides = input.productSizeId
    ? input.catalog.sizeOverrides.filter(
        (row) => row.productSizeId === input.productSizeId,
      )
    : [];
  return resolveProfitRate({
    now: input.now,
    productCode: input.productCode,
    sizeOverrides,
    productOverrides: input.catalog.productOverrides,
    rowExceptions: input.rowExceptions ?? [],
    productSettings: input.catalog.productSettings,
    groupSettings: input.catalog.groupSettings,
    globalSettings: input.catalog.globalSettings,
    required: input.required,
  });
}

export async function findProductSizeId(
  prisma: PrismaService,
  widthMm: number,
  lengthMm: number,
): Promise<string | null> {
  const size = await prisma.productSize.findUnique({
    where: { widthMm_lengthMm: { widthMm, lengthMm } },
    select: { id: true },
  });
  return size?.id ?? null;
}
