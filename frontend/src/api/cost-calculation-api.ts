import { apiRequest } from '../lib/api';

export type DoorFrameMdfPart = {
  thicknessMm: string;
  rawMaterialId: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  calculatedQty: number | null;
  calculatedQtyError: string | null;
  netQty: number;
  sheetPrice: string;
  unitCost: string;
};

export type DoorFrameExtraCosts = {
  cutting: string;
  glue: string;
  labor: string;
  other: string;
  total?: string;
};

export type DoorFrameVatPricing = {
  vatRate: string;
  vatAmount: string;
  costWithVat: string;
  profitRate: string;
  profitAmount: string;
  priceBeforeRounding: string;
  roundedSalePrice: string;
  cashSalePrice: string;
  cardMarkupRate: string;
  cardPriceBeforeRounding: string;
  cardSalePrice: string;
  calculatedCashPrice: string;
  cashOverride: {
    id: string;
    cashPrice: string;
    reason: string | null;
  } | null;
  publishedCashPrice: string;
  publishedCardPrice: string;
};

export type DoorFrameMdfRow = {
  widthCm: number;
  lengthCm: number;
  displayName: string;
  parts: DoorFrameMdfPart[];
  mdfCost: string;
  extraCosts: DoorFrameExtraCosts;
  productionCost: string;
  pricing: DoorFrameVatPricing;
};

export type DoorFrameMdfResponse = {
  productGroupCode: string;
  productGroupName: string;
  variant: '34_MM' | '30_MM';
  priceType: string;
  extraCosts: DoorFrameExtraCosts;
  vatRate: string;
  profitRate: string;
  cardMarkupRate: string;
  rows: DoorFrameMdfRow[];
};

export function fetchDoorFrameMdfCosts(
  variant: '34_MM' | '30_MM',
): Promise<DoorFrameMdfResponse> {
  return apiRequest<DoorFrameMdfResponse>(
    `/cost-calculation/door-frame/mdf?variant=${variant}`,
  );
}

export type AyarliPervazMdfPart = {
  rawMaterialCode: string;
  sheetPriceType: 'CARD_INSTALLMENT';
  sheetPrice: string;
  netQty: number;
  yieldSource: string;
  unitCost: string;
};

export type AyarliPervazPricing = {
  profitRate: string;
  profitRateSource:
    | 'ROW_EXCEPTION'
    | 'PRODUCT_PRICING_SETTING'
    | 'GROUP_PRICING_SETTING'
    | 'GLOBAL_PRICING_SETTING';
  profitAmount: string;
  priceBeforeRounding: string;
  roundedSalePrice: string;
  adjustmentAmount: string | null;
  adjustmentSource: 'ROW_EXCEPTION' | 'NONE';
  publishedSalePrice: string;
  cardSaleAvailable: boolean;
  cardPricingType: 'FIXED_SURCHARGE' | 'NONE';
  cardFixedSurchargeAmount: string | null;
  cardSalePrice: string | null;
};

export type AyarliPervazMdfRow = {
  productGroupCode: 'PERVAZ';
  productGroupName: string;
  productCode: 'AYARLI_PERVAZ';
  priceType: 'CARD_INSTALLMENT';
  asOf: string;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  mainPiece: AyarliPervazMdfPart;
  kilcik: AyarliPervazMdfPart;
  totalMdfCost: string;
  extraCosts: {
    cutting: string;
    glue: string;
    labor: string;
    total: string;
  };
  productionCost: string;
  pricing: AyarliPervazPricing;
};

export type AyarliPervazMdfResponse = {
  productCode: 'AYARLI_PERVAZ';
  productName: string;
  asOf: string;
  verifiedMeasureCount: number;
  rows: AyarliPervazMdfRow[];
};

export function fetchAyarliPervazMdfCosts(): Promise<AyarliPervazMdfResponse> {
  return apiRequest<AyarliPervazMdfResponse>(
    '/cost-calculation/pervaz/ayarli',
  );
}

export type DekoratifPervazPricing = {
  profitRate: string;
  profitRateSource:
    | 'ROW_EXCEPTION'
    | 'PRODUCT_PRICING_SETTING'
    | 'GROUP_PRICING_SETTING'
    | 'GLOBAL_PRICING_SETTING';
  profitAmount: string;
  baseSalePrice: string;
  decorativePremiumRate: string;
  decorativePremiumAmount: string;
  priceBeforeRounding: string;
  roundedSalePrice: string;
  adjustmentAmount: null;
  publishedSalePrice: string;
  cardSaleAvailable: boolean;
  cardPricingType: 'FIXED_SURCHARGE' | 'NONE';
  cardFixedSurchargeAmount: string | null;
  cardSalePrice: string | null;
};

export type DekoratifPervazRow = Omit<
  AyarliPervazMdfRow,
  'productCode' | 'pricing'
> & {
  productCode: 'DEKORATIF_PERVAZ';
  pricing: DekoratifPervazPricing;
};

export type DekoratifPervazResponse = {
  productCode: 'DEKORATIF_PERVAZ';
  productName: string;
  asOf: string;
  verifiedMeasureCount: number;
  rows: DekoratifPervazRow[];
};

export function fetchDekoratifPervazCosts(): Promise<DekoratifPervazResponse> {
  return apiRequest<DekoratifPervazResponse>(
    '/cost-calculation/pervaz/dekoratif',
  );
}

export type DekoratifGenisKilcikRow = Omit<
  DekoratifPervazRow,
  'productCode'
> & {
  productCode: 'DEKORATIF_PERVAZ_GENIS_KILCIK';
};

export type DekoratifGenisKilcikResponse = Omit<
  DekoratifPervazResponse,
  'productCode' | 'rows'
> & {
  productCode: 'DEKORATIF_PERVAZ_GENIS_KILCIK';
  rows: DekoratifGenisKilcikRow[];
};

export function fetchDekoratifGenisKilcikCosts(): Promise<DekoratifGenisKilcikResponse> {
  return apiRequest<DekoratifGenisKilcikResponse>(
    '/cost-calculation/pervaz/dekoratif-genis-kilcik',
  );
}
