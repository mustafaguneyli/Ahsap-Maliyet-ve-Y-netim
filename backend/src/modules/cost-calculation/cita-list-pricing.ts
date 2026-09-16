import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import {
  integerMmOrNull,
  parseCitaThicknessMm,
  parseCitaWidthMm,
} from '../../calculation-engine/calculators/cita-net-calculator';
import { PrismaService } from '../../prisma/prisma.service';
import { CITA_PRODUCT_GROUP_SEED } from '../products/cita-product-seed';
import {
  CITA_PUBLISHED_PRICE_MISSING,
  selectCitaPublishedPrice,
  type CitaPublishedPriceBandView,
  type CitaPublishedPriceLookup,
} from '../pricing/cita-published-price-band-data';
import {
  classifyCitaCommercialWidthBand,
  type CitaCommercialWidthBand,
} from '../pricing/cita-published-price-classification';

export type CitaListPricing = {
  pricingAvailable: boolean;
  priceBand: {
    minWidthMm: number;
    maxWidthMm: number;
    displayName?: CitaCommercialWidthBand['displayName'];
  } | null;
  publishedCashPrice: string | null;
  publishedCardPrice: string | null;
  statusCode: typeof CITA_PUBLISHED_PRICE_MISSING | null;
};

export function toCitaListPricing(
  lookup: CitaPublishedPriceLookup,
): CitaListPricing {
  if (lookup.statusCode === CITA_PUBLISHED_PRICE_MISSING) {
    return {
      pricingAvailable: false,
      priceBand: null,
      publishedCashPrice: null,
      publishedCardPrice: null,
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    };
  }
  return {
    pricingAvailable: true,
    priceBand: {
      minWidthMm: lookup.minWidthMm,
      maxWidthMm: lookup.maxWidthMm,
    },
    publishedCashPrice: lookup.cashPrice,
    publishedCardPrice: lookup.cardPrice,
    statusCode: null,
  };
}

export function resolveCitaListPricing(
  bands: readonly CitaPublishedPriceBandView[],
  query: { widthMm: number; thicknessMm: number },
): CitaListPricing {
  try {
    return toCitaListPricing(selectCitaPublishedPrice(bands, query));
  } catch (error) {
    if (error instanceof Error) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

export async function loadCitaPublishedPriceBandViews(
  prisma: Pick<PrismaService, 'productGroup' | 'citaPublishedPriceBand'>,
  now: Date,
): Promise<CitaPublishedPriceBandView[]> {
  const group = await prisma.productGroup.findUnique({
    where: { code: CITA_PRODUCT_GROUP_SEED.code },
  });
  if (!group?.isActive) {
    throw new BadRequestException('Ürün grubu bulunamadı: CITA');
  }

  const rows = await prisma.citaPublishedPriceBand.findMany({
    where: {
      productGroupId: group.id,
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    include: { thicknesses: { orderBy: { thicknessMm: 'asc' } } },
    orderBy: [{ minWidthMm: 'asc' }, { effectiveFrom: 'desc' }],
  });

  const seen = new Set<string>();
  const views: CitaPublishedPriceBandView[] = [];
  for (const row of rows) {
    const key = `${row.minWidthMm}-${row.maxWidthMm}`;
    if (seen.has(key)) {
      throw new BadRequestException(
        `CITA ${row.minWidthMm}-${row.maxWidthMm} mm için birden fazla geçerli yayınlanmış fiyat bandı bulundu.`,
      );
    }
    seen.add(key);
    views.push({
      minWidthMm: row.minWidthMm,
      maxWidthMm: row.maxWidthMm,
      cashPrice: toDecimal(row.cashPrice.toString()).toString(),
      cardPrice: toDecimal(row.cardPrice.toString()).toString(),
      thicknessMm: row.thicknesses.map((item) => item.thicknessMm),
      isActive: true,
      effectiveTo: null,
    });
  }
  return views;
}

export function attachCitaListPricing<
  T extends { thicknessMm: string; widthMm: string },
>(row: T, bands: readonly CitaPublishedPriceBandView[]): T & { pricing: CitaListPricing } {
  const thicknessMm = parseCitaThicknessMm(row.thicknessMm);
  const widthMm = integerMmOrNull(toDecimal(row.widthMm));
  if (widthMm == null) {
    throw new BadRequestException(
      `Çıta yayınlanmış fiyat eşlemesi için widthMm tam sayı mm olmalıdır: ${row.widthMm}.`,
    );
  }
  return {
    ...row,
    pricing: resolveCitaListPricing(bands, { widthMm, thicknessMm }),
  };
}

const MISSING_PRICING: CitaListPricing = {
  pricingAvailable: false,
  priceBand: null,
  publishedCashPrice: null,
  publishedCardPrice: null,
  statusCode: CITA_PUBLISHED_PRICE_MISSING,
};

/**
 * Custom/standart tek ölçü: ticari banda sınıflandır, sonra DB master min/max ile oku.
 * 25 mm → 3–4 cm → mevcut 30–40 master. Yeni band yazılmaz.
 */
export function resolveCitaClassifiedPricing(
  bands: readonly CitaPublishedPriceBandView[],
  query: { widthMm: string | number; thicknessMm: number },
): CitaListPricing {
  const commercial = classifyCitaCommercialWidthBand(query.widthMm);
  if (commercial == null) {
    return MISSING_PRICING;
  }

  const matches = bands.filter(
    (band) =>
      band.isActive &&
      band.effectiveTo == null &&
      band.minWidthMm === commercial.masterMinWidthMm &&
      band.maxWidthMm === commercial.masterMaxWidthMm,
  );
  if (matches.length > 1) {
    throw new BadRequestException(
      `CITA ${commercial.displayName} için birden fazla aktif yayınlanmış fiyat bandı bulundu.`,
    );
  }
  const band = matches[0];
  if (band == null || !band.thicknessMm.includes(query.thicknessMm)) {
    return MISSING_PRICING;
  }

  return {
    pricingAvailable: true,
    priceBand: {
      minWidthMm: band.minWidthMm,
      maxWidthMm: band.maxWidthMm,
      displayName: commercial.displayName,
    },
    publishedCashPrice: band.cashPrice,
    publishedCardPrice: band.cardPrice,
    statusCode: null,
  };
}

export function attachCitaClassifiedPricing<
  T extends { thicknessMm: string; widthMm: string },
>(row: T, bands: readonly CitaPublishedPriceBandView[]): T & { pricing: CitaListPricing } {
  const thicknessMm = parseCitaThicknessMm(row.thicknessMm);
  parseCitaWidthMm(row.widthMm);
  return {
    ...row,
    pricing: resolveCitaClassifiedPricing(bands, {
      widthMm: row.widthMm,
      thicknessMm,
    }),
  };
}
