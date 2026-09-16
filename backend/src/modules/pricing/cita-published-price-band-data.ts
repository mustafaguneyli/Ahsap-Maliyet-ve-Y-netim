/**
 * Çıta yayınlanmış satış fiyat listesi.
 * Kart fiyatı nakit × 1.20 ile türetilmez; her iki tutar bağımsız master değerdir.
 */
export const CITA_PUBLISHED_PRICE_MISSING = 'CITA_PUBLISHED_PRICE_MISSING' as const;

export const CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM = [
  10, 22, 30,
] as const;

export const CITA_PUBLISHED_PRICE_BAND_SEEDS = [
  {
    minWidthMm: 10,
    maxWidthMm: 20,
    cashPrice: '115',
    cardPrice: '138',
    thicknessMm: [12, 14, 16],
  },
  {
    minWidthMm: 30,
    maxWidthMm: 40,
    cashPrice: '145',
    cardPrice: '174',
    thicknessMm: [12, 14, 16],
  },
  {
    minWidthMm: 50,
    maxWidthMm: 60,
    cashPrice: '185',
    cardPrice: '222',
    thicknessMm: [12, 14, 16, 18],
  },
  {
    minWidthMm: 70,
    maxWidthMm: 80,
    cashPrice: '215',
    cardPrice: '258',
    thicknessMm: [12, 14, 16],
  },
] as const;

export type CitaPublishedPriceBandSeed =
  (typeof CITA_PUBLISHED_PRICE_BAND_SEEDS)[number];

export type CitaPublishedPriceBandView = {
  minWidthMm: number;
  maxWidthMm: number;
  cashPrice: string;
  cardPrice: string;
  thicknessMm: readonly number[];
  isActive: boolean;
  effectiveTo: Date | null;
};

export type CitaPublishedPriceLookup =
  | {
      cashPrice: string;
      cardPrice: string;
      statusCode: null;
      minWidthMm: number;
      maxWidthMm: number;
    }
  | {
      cashPrice: null;
      cardPrice: null;
      statusCode: typeof CITA_PUBLISHED_PRICE_MISSING;
    };

export function sameCitaPublishedThicknessSet(
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * Master lookup. Kartı nakit üzerinden hesaplamaz.
 * Calculator bağlanmaz; yalnız yayınlanmış band eşlemesi.
 */
export function selectCitaPublishedPrice(
  bands: readonly CitaPublishedPriceBandView[],
  query: { widthMm: number; thicknessMm: number },
): CitaPublishedPriceLookup {
  const matches = bands.filter(
    (band) =>
      band.isActive &&
      band.effectiveTo == null &&
      query.widthMm >= band.minWidthMm &&
      query.widthMm <= band.maxWidthMm &&
      band.thicknessMm.includes(query.thicknessMm),
  );
  if (matches.length === 0) {
    return {
      cashPrice: null,
      cardPrice: null,
      statusCode: CITA_PUBLISHED_PRICE_MISSING,
    };
  }
  if (matches.length > 1) {
    throw new Error(
      `CITA ${query.thicknessMm} mm / ${query.widthMm} mm için birden fazla aktif yayınlanmış fiyat bandı bulundu.`,
    );
  }
  const band = matches[0];
  return {
    cashPrice: band.cashPrice,
    cardPrice: band.cardPrice,
    statusCode: null,
    minWidthMm: band.minWidthMm,
    maxWidthMm: band.maxWidthMm,
  };
}

export function citaPublishedPriceBandViewsFromSeeds(): CitaPublishedPriceBandView[] {
  return CITA_PUBLISHED_PRICE_BAND_SEEDS.map((seed) => ({
    minWidthMm: seed.minWidthMm,
    maxWidthMm: seed.maxWidthMm,
    cashPrice: seed.cashPrice,
    cardPrice: seed.cardPrice,
    thicknessMm: seed.thicknessMm,
    isActive: true,
    effectiveTo: null,
  }));
}
