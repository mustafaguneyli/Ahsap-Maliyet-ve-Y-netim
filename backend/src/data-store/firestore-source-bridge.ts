import { MaterialPriceType } from '@prisma/client';
import { currentCatalogCache } from './firestore-catalog-cache';
import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import { toOptionalUtcDate, toUtcDate } from '../firebase/firestore-dates';
import type { PrismaService } from '../prisma/prisma.service';
import { buildProfitRateCatalogFromDocs } from './firestore-profit-catalog';

function money(value: unknown): { toString(): string; valueOf(): number } {
  const text = String(value ?? '');
  return {
    toString: () => text,
    valueOf: () => Number(text),
  };
}

export async function sourceGroupByCode(prisma: PrismaService, code: string) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.productGroup.findUnique({ where: { code } });
  }
  const row = cache.groupByCode(code) ?? cache.collection(FIRESTORE_COLLECTIONS.productGroups).find((item) => item.code === code);
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    calculatorType: row.calculatorType,
    isActive: row.isActive === true,
  };
}

export async function sourceProductByGroupCode(
  prisma: PrismaService,
  productGroupId: string,
  code: string,
) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.product.findUnique({
      where: { productGroupId_code: { productGroupId, code } },
    });
  }
  const row =
    cache.productByGroupAndCode(productGroupId, code) ??
    cache.collection(FIRESTORE_COLLECTIONS.products).find(
      (item) => item.productGroupId === productGroupId && item.code === code,
    );
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    productGroupId: String(row.productGroupId),
    code: String(row.code),
    name: String(row.name),
    isActive: row.isActive === true,
    unit: row.unit,
  };
}

export async function sourceMaterialByCode(prisma: PrismaService, code: string, activeOnly = true) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.rawMaterial.findFirst({
      where: { code, ...(activeOnly ? { isActive: true } : {}) },
    });
  }
  const row = activeOnly
    ? cache.materialByCode(code)
    : cache.collection(FIRESTORE_COLLECTIONS.rawMaterials).find((item) => item.code === code);
  return row ? shapeMaterial(row) : null;
}

export async function sourceMaterialById(prisma: PrismaService, id: string, activeOnly = true) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.rawMaterial.findFirst({
      where: { id, ...(activeOnly ? { isActive: true } : {}) },
      include: { prices: { where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } } },
    });
  }
  const row = cache.materialById(id);
  if (!row || (activeOnly && row.isActive !== true)) {
    return null;
  }
  return {
    ...shapeMaterial(row),
    prices: cache.pricesFor(String(row.id)),
  };
}

export async function sourceMaterialsByCodes(prisma: PrismaService, codes: string[], priceType: MaterialPriceType) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.rawMaterial.findMany({
      where: { code: { in: codes }, isActive: true },
      include: {
        prices: {
          where: { priceType, isActive: true },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    });
  }
  return codes
    .map((code) => cache.materialByCode(code))
    .filter((row): row is NonNullable<typeof row> => row != null)
    .map((row) => ({
      ...shapeMaterial(row),
      prices: cache.pricesFor(String(row.id)).filter((price) => price.priceType === priceType),
    }));
}

export async function sourceGenericYields(prisma: PrismaService, rawMaterialIds: string[]) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.productionYield.findMany({
      where: { productId: null, isActive: true, rawMaterialId: { in: rawMaterialIds } },
    });
  }
  return cache
    .collection(FIRESTORE_COLLECTIONS.productionYields)
    .filter(
      (row) =>
        row.isActive === true &&
        (row.productId == null || row.productId === '') &&
        rawMaterialIds.includes(String(row.rawMaterialId)),
    )
    .map(shapeYield);
}

export async function sourceProductSizesByMm(
  prisma: PrismaService,
  pairs: Array<{ widthMm: number; lengthMm: number }>,
) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.productSize.findMany({
      where: { OR: pairs.map((pair) => ({ widthMm: pair.widthMm, lengthMm: pair.lengthMm })) },
    });
  }
  const wanted = new Set(pairs.map((pair) => `${pair.widthMm}x${pair.lengthMm}`));
  return cache
    .collection(FIRESTORE_COLLECTIONS.productSizes)
    .filter((row) => wanted.has(`${Number(row.widthMm)}x${Number(row.lengthMm)}`))
    .map((row) => ({
      id: String(row.id),
      widthMm: Number(row.widthMm),
      lengthMm: Number(row.lengthMm),
      displayName: String(row.displayName ?? ''),
    }));
}

export async function sourceLoadProfitRateCatalog(
  prisma: PrismaService,
  productId: string,
  productGroupId: string,
) {
  const cache = currentCatalogCache();
  if (!cache) {
    const { loadProfitRateCatalog } = await import('../modules/pricing/profit-rate-catalog');
    return loadProfitRateCatalog(prisma, productId, productGroupId);
  }
  return buildProfitRateCatalogFromDocs({
    productId,
    productGroupId,
    overrides: cache.collection(FIRESTORE_COLLECTIONS.productPricingOverrides),
    settings: cache.collection(FIRESTORE_COLLECTIONS.pricingSettings),
  });
}

function shapeMaterial(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    thicknessMm: money(row.thicknessMm),
    sheetWidthMm: Number(row.sheetWidthMm),
    sheetLengthMm: Number(row.sheetLengthMm),
    surfaceType: row.surfaceType == null ? null : String(row.surfaceType),
    priceBasis: row.priceBasis,
    isActive: row.isActive === true,
  };
}

function shapeYield(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    rawMaterialId: String(row.rawMaterialId),
    productId: row.productId == null || row.productId === '' ? null : String(row.productId),
    pieceWidthMm: Number(row.pieceWidthMm),
    pieceLengthMm: Number(row.pieceLengthMm),
    netQty: Number(row.netQty),
    isActive: row.isActive === true,
  };
}

export async function sourceMaterialByCodeExact(prisma: PrismaService, code: string) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.rawMaterial.findUnique({ where: { code } });
  }
  const row = cache.collection(FIRESTORE_COLLECTIONS.rawMaterials).find((item) => item.code === code);
  return row ? shapeMaterial(row) : null;
}

export async function sourceMaterialWithPrices(
  prisma: PrismaService,
  code: string,
  priceType?: MaterialPriceType,
) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.rawMaterial.findUnique({
      where: { code },
      include: {
        prices: priceType
          ? {
              where: { priceType, isActive: true },
              orderBy: { effectiveFrom: 'desc' as const },
            }
          : true,
      },
    });
  }
  const row = cache.collection(FIRESTORE_COLLECTIONS.rawMaterials).find((item) => item.code === code);
  if (!row) {
    return null;
  }
  const prices = cache.pricesFor(String(row.id));
  return {
    ...shapeMaterial(row),
    prices: priceType ? prices.filter((price) => price.priceType === priceType) : prices,
  };
}

export async function sourceAllProductSizes(prisma: PrismaService) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.productSize.findMany({ select: { widthMm: true, lengthMm: true } });
  }
  return cache.collection(FIRESTORE_COLLECTIONS.productSizes).map((row) => ({
    widthMm: Number(row.widthMm),
    lengthMm: Number(row.lengthMm),
  }));
}

export async function sourceGenericYieldsWithMaterials(
  prisma: PrismaService,
  opts?: {
    widthMm?: number;
    lengthMm?: number;
    thicknessMm?: number;
    priceType?: MaterialPriceType;
  },
) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.productionYield.findMany({
      where: {
        productId: null,
        isActive: true,
        ...(opts?.widthMm != null ? { pieceWidthMm: opts.widthMm } : {}),
        ...(opts?.lengthMm != null ? { pieceLengthMm: opts.lengthMm } : {}),
        rawMaterial: {
          isActive: true,
          ...(opts?.thicknessMm != null ? { thicknessMm: opts.thicknessMm } : {}),
        },
      },
      include: {
        rawMaterial: {
          include: {
            prices: opts?.priceType
              ? {
                  where: { priceType: opts.priceType, isActive: true },
                  orderBy: { effectiveFrom: 'desc' as const },
                }
              : true,
          },
        },
      },
    });
  }
  return cache
    .collection(FIRESTORE_COLLECTIONS.productionYields)
    .filter((row) => {
      if (row.isActive !== true || (row.productId != null && row.productId !== '')) {
        return false;
      }
      if (opts?.widthMm != null && Number(row.pieceWidthMm) !== opts.widthMm) {
        return false;
      }
      if (opts?.lengthMm != null && Number(row.pieceLengthMm) !== opts.lengthMm) {
        return false;
      }
      const material = cache.materialById(String(row.rawMaterialId));
      if (!material || material.isActive !== true) {
        return false;
      }
      if (opts?.thicknessMm != null && Number(material.thicknessMm) !== Number(opts.thicknessMm)) {
        return false;
      }
      return true;
    })
    .map((row) => {
      const material = cache.materialById(String(row.rawMaterialId))!;
      const prices = cache.pricesFor(String(material.id));
      return {
        ...shapeYield(row),
        rawMaterial: {
          ...shapeMaterial(material),
          prices: opts?.priceType
            ? prices.filter((price) => price.priceType === opts.priceType)
            : prices,
        },
      };
    });
}

export async function sourcePricingSettings(
  prisma: PrismaService,
  where: { productGroupId?: string | null; productId?: string | null; isActive?: boolean },
) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.pricingSetting.findMany({ where });
  }
  return cache.collection(FIRESTORE_COLLECTIONS.pricingSettings).filter((row) => {
    if (where.isActive === true && row.isActive !== true) {
      return false;
    }
    if (where.productGroupId !== undefined && (row.productGroupId ?? null) !== where.productGroupId) {
      return false;
    }
    if (where.productId !== undefined && (row.productId ?? null) !== where.productId) {
      return false;
    }
    return true;
  }).map((row) => ({
    id: String(row.id),
    productGroupId: row.productGroupId == null || row.productGroupId === '' ? null : String(row.productGroupId),
    productId: row.productId == null || row.productId === '' ? null : String(row.productId),
    isActive: row.isActive === true,
    vatRate: row.vatRate == null ? null : money(row.vatRate),
    profitRate: row.profitRate == null ? null : money(row.profitRate),
    cardMarkupRate: row.cardMarkupRate == null ? null : money(row.cardMarkupRate),
  }));
}

export async function sourceRowExceptions(
  prisma: PrismaService,
  input: { productId: string; thicknessMm: number; widthMm: number; lengthMm: number },
) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.pricingRowException.findMany({
      where: {
        productId: input.productId,
        thicknessMm: input.thicknessMm,
        widthMm: input.widthMm,
        lengthMm: input.lengthMm,
        isActive: true,
      },
    });
  }
  return cache.collection(FIRESTORE_COLLECTIONS.pricingRowExceptions).filter(
    (row) =>
      row.isActive === true &&
      row.productId === input.productId &&
      Number(row.thicknessMm) === input.thicknessMm &&
      Number(row.widthMm) === input.widthMm &&
      Number(row.lengthMm) === input.lengthMm,
  ).map((row) => ({
    id: String(row.id),
    productId: String(row.productId),
    isActive: true,
    thicknessMm: Number(row.thicknessMm),
    widthMm: Number(row.widthMm),
    lengthMm: Number(row.lengthMm),
    effectiveFrom: asUtc(row.effectiveFrom, 'effectiveFrom'),
    effectiveTo: asOptionalUtc(row.effectiveTo, 'effectiveTo'),
    profitRate: row.profitRate == null ? null : money(row.profitRate),
    adjustmentAmount: row.adjustmentAmount == null ? null : money(row.adjustmentAmount),
    decorativePremiumRate:
      row.decorativePremiumRate == null ? null : money(row.decorativePremiumRate),
    cardSaleEnabled:
      row.cardSaleEnabled === true ? true : row.cardSaleEnabled === false ? false : null,
  }));
}

export async function sourcePriceOverridesForSizes(
  prisma: PrismaService,
  productId: string,
  productSizeIds: string[],
) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.priceOverride.findMany({
      where: { productId, isActive: true, productSizeId: { in: productSizeIds } },
    });
  }
  const allowed = new Set(productSizeIds);
  return cache
    .collection(FIRESTORE_COLLECTIONS.priceOverrides)
    .filter(
      (row) =>
        row.isActive === true &&
        row.productId === productId &&
        allowed.has(String(row.productSizeId)),
    )
    .map((row) => ({
      id: String(row.id),
      productSizeId: String(row.productSizeId),
      cashPrice: money(row.cashPrice),
      reason: row.reason == null ? null : String(row.reason),
    }));
}

export async function sourceThicknessModifiers(
  prisma: PrismaService,
  productGroupId: string,
  modifierType: string,
  now: Date,
) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.pricingThicknessModifier.findMany({
      where: {
        productGroupId,
        modifierType: modifierType as never,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }
  return cache
    .collection(FIRESTORE_COLLECTIONS.pricingThicknessModifiers)
    .filter(
      (row) =>
        row.productGroupId === productGroupId &&
        row.modifierType === modifierType &&
        cache.isCurrent(row, now),
    )
    .sort(
      (a, b) =>
        cache.asDate(b.effectiveFrom, 'effectiveFrom').getTime() -
        cache.asDate(a.effectiveFrom, 'effectiveFrom').getTime(),
    )
    .map((row) => ({
      id: String(row.id),
      thicknessMm: Number(row.thicknessMm),
      rate: money(row.rate),
      isActive: true,
    }));
}

export async function sourceMaterialsByThickness(prisma: PrismaService, thicknessMm: number) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.rawMaterial.findMany({
      where: { isActive: true, thicknessMm },
      include: { prices: true },
    });
  }
  return cache
    .collection(FIRESTORE_COLLECTIONS.rawMaterials)
    .filter((row) => row.isActive === true && Number(row.thicknessMm) === Number(thicknessMm))
    .map((row) => ({
      ...shapeMaterial(row),
      prices: cache.pricesFor(String(row.id)),
    }));
}

export async function sourceProductById(prisma: PrismaService, id: string) {
  const cache = currentCatalogCache();
  if (!cache) {
    return prisma.product.findFirst({
      where: { id, isActive: true, productGroup: { isActive: true } },
      include: { productGroup: true },
    });
  }
  const product = cache.productById(id);
  if (!product) {
    return null;
  }
  const group = cache.groupById(String(product.productGroupId));
  if (!group || group.isActive !== true) {
    return null;
  }
  return {
    id: String(product.id),
    code: String(product.code),
    name: String(product.name),
    isActive: true,
    productGroup: {
      id: String(group.id),
      code: String(group.code),
      name: String(group.name),
      calculatorType: group.calculatorType,
      isActive: true,
    },
  };
}

export function asUtc(value: unknown, field: string): Date {
  return toUtcDate(value, field);
}

export function asOptionalUtc(value: unknown, field: string): Date | null {
  return toOptionalUtcDate(value, field);
}
