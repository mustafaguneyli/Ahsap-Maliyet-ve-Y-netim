import { BadRequestException } from '@nestjs/common';
import { parseOptionalCardMarkupRate } from '../../calculation-engine/pricing/percent-card-sale';
import { PrismaService } from '../../prisma/prisma.service';

export type CardMarkupSettingRow = {
  isActive: boolean;
  productGroupId?: string | null;
  productId?: string | null;
  cardMarkupRate?: { toString(): string } | string | null;
};

/**
 * Group-scope cardMarkupRate. Birden fazla aktif dolu kayıt hata.
 * Yoksa null (0 uydurulmaz).
 */
export function resolveGroupCardMarkupRate(
  groupSettings: readonly CardMarkupSettingRow[],
): string | null {
  const active = groupSettings.filter((setting) => {
    if (!setting.isActive) return false;
    return parseOptionalCardMarkupRate(toRateString(setting.cardMarkupRate)) != null;
  });
  if (active.length > 1) {
    throw new BadRequestException(
      'Kart/taksit oranı için birden fazla aktif group-scope PricingSetting bulundu.',
    );
  }
  return parseOptionalCardMarkupRate(toRateString(active[0]?.cardMarkupRate))?.toFixed() ?? null;
}

/**
 * Grup oranı yoksa Kapı Kasası ürün kaydındaki legacy cardMarkupRate.
 */
export function resolveCardMarkupRateWithProductFallback(
  groupSettings: readonly CardMarkupSettingRow[],
  productSettings: readonly CardMarkupSettingRow[] = [],
): string | null {
  const groupRate = resolveGroupCardMarkupRate(groupSettings);
  if (groupRate != null) {
    return groupRate;
  }

  for (const setting of productSettings) {
    if (!setting.isActive) continue;
    const rate = parseOptionalCardMarkupRate(toRateString(setting.cardMarkupRate));
    if (rate != null) {
      return rate.toFixed();
    }
  }
  return null;
}

export async function loadCardMarkupRate(
  prisma: Pick<PrismaService, 'productGroup' | 'pricingSetting'>,
  productGroupCode: string,
  productId?: string | null,
): Promise<string | null> {
  const { currentCatalogCache } = await import('../../data-store/firestore-catalog-cache');
  const cache = currentCatalogCache();
  if (cache) {
    const group = cache.groupByCode(productGroupCode);
    if (!group) {
      return null;
    }
    const toCardRow = (row: Record<string, unknown>): CardMarkupSettingRow => ({
      isActive: row.isActive === true,
      productGroupId: row.productGroupId == null ? null : String(row.productGroupId),
      productId: row.productId == null ? null : String(row.productId),
      cardMarkupRate: row.cardMarkupRate == null ? null : String(row.cardMarkupRate),
    });
    const groupSettings = cache.pricingSettings({
      productGroupId: String(group.id),
      productId: null,
    }).map(toCardRow);
    const productSettings = productId
      ? cache.pricingSettings({ productId, productGroupId: null }).map(toCardRow)
      : [];
    return resolveCardMarkupRateWithProductFallback(groupSettings, productSettings);
  }
  const group = await prisma.productGroup.findUnique({
    where: { code: productGroupCode },
  });
  if (!group?.isActive) {
    return null;
  }

  const groupSettings = await prisma.pricingSetting.findMany({
    where: {
      productGroupId: group.id,
      productId: null,
      isActive: true,
    },
  });

  let productSettings: CardMarkupSettingRow[] = [];
  if (productId) {
    productSettings = await prisma.pricingSetting.findMany({
      where: {
        productId,
        productGroupId: null,
        isActive: true,
      },
    });
  }

  return resolveCardMarkupRateWithProductFallback(groupSettings, productSettings);
}

function toRateString(
  value: { toString(): string } | string | null | undefined,
): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : value.toString();
}
