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

export const SUPURGELIK_PRODUCT_CODES = [
  'DUZ_SUPURGELIK',
  'DEKORATIF_SUPURGELIK',
  'DUZ_PP_SARMA_SUPURGELIK',
  'DEKORATIF_PP_SARMA_SUPURGELIK',
] as const;

export type SupurgelikProductCode = (typeof SUPURGELIK_PRODUCT_CODES)[number];

export type SupurgelikRowErrorCode =
  | 'RAW_MATERIAL_PRICE_MISSING'
  | 'DECORATIVE_RATE_MISSING'
  | 'PP_WRAPPING_COST_MISSING';

export type SupurgelikPricing = {
  profitRate?: string;
  source?: 'GROUP_PRICING_SETTING';
  profitAmount?: string | null;
  priceBeforeRounding?: string | null;
  roundedBaseSalePrice?: string | null;
  baseProductionCost?: string | null;
  ppWrappingCost?: string | null;
  ppProductionCost?: string | null;
  basePublishedCashPrice?: string | null;
  decorativeRate?: string | null;
  decorativeRateSource?: 'GROUP_THICKNESS_PRICING_MODIFIER' | null;
  decorativeAmount?: string | null;
  priceBeforeDecorativeRounding?: string | null;
  publishedCashPrice: string | null;
  statusCode?: SupurgelikRowErrorCode | null;
};

export type SupurgelikCostRow = {
  productCode: SupurgelikProductCode;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  rawMaterial: {
    code: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
  };
  sheetPrice: {
    priceType: 'CARD_INSTALLMENT';
    amount: string;
  } | null;
  productionYield: {
    netQty: number;
    scope: 'GENERIC';
    productId: null;
    productScoped: false;
  };
  priceAvailable: boolean;
  mdfUnitCost: string | null;
  extraCosts: Array<{
    code: string;
    name: string;
    amount: string;
  }>;
  extraCostsTotal: string;
  productionCost: string | null;
  pricing: SupurgelikPricing;
  errorCode: SupurgelikRowErrorCode | null;
  errorMessage: string | null;
};

export type SupurgelikCostsResponse = {
  productGroupCode: 'SUPURGELIK';
  productGroupName: string;
  productCode: SupurgelikProductCode;
  productName: string;
  asOf: string;
  masterCount: number;
  rowCount: number;
  rows: SupurgelikCostRow[];
};

export function fetchSupurgelikCosts(
  productCode: SupurgelikProductCode,
): Promise<SupurgelikCostsResponse> {
  return apiRequest<SupurgelikCostsResponse>(
    `/cost-calculation/supurgelik?productCode=${encodeURIComponent(productCode)}`,
  );
}

/** Frontend hesap yapmaz; bu alanlar API response contract’ıdır. */
type SupurgelikCostRowContract = {
  productionYield: { netQty: number; productId: null };
  sheetPrice: { priceType: 'CARD_INSTALLMENT'; amount: string } | null;
  mdfUnitCost: string | null;
  extraCostsTotal: string;
  productionCost: string | null;
  pricing: {
    profitRate?: string;
    publishedCashPrice: string | null;
    decorativeRate?: string | null;
    statusCode?: SupurgelikRowErrorCode | null;
  };
  errorCode: SupurgelikRowErrorCode | null;
};

const _supurgelikCostContractOk: SupurgelikCostRow extends SupurgelikCostRowContract
  ? true
  : never = true;
void _supurgelikCostContractOk;

export const CITA_CUSTOM_THICKNESS_MM = [
  '10',
  '12',
  '14',
  '16',
  '18',
  '22',
  '30',
] as const;

export type CitaCustomThicknessMm = (typeof CITA_CUSTOM_THICKNESS_MM)[number];
export type CitaNetSource = 'MASTER' | 'CALCULATED_CUT_RULE';
export type CitaExtraCostCode = 'CUTTING' | 'LABOR';
export type CitaStatusCode =
  | 'EXTRA_COST_MISSING'
  | 'RAW_MATERIAL_PRICE_MISSING'
  | null;

export type CitaPublishedPriceStatusCode = 'CITA_PUBLISHED_PRICE_MISSING' | null;

export type CitaPublishedPricing = {
  pricingAvailable: boolean;
  priceBand: {
    minWidthMm: number;
    maxWidthMm: number;
    displayName?: string;
  } | null;
  publishedCashPrice: string | null;
  publishedCardPrice: string | null;
  statusCode: CitaPublishedPriceStatusCode;
};

export type CitaCostRow = {
  productCode: 'CITA';
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  rawMaterial: {
    code: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
  };
  cut?: {
    bladeAllowanceMm: number;
    countSideMm: number;
    effectiveCutPitchMm: string;
  };
  productionYield: {
    netQty: number;
    source: CitaNetSource;
  };
  sheetPrice: {
    priceType: 'CARD_INSTALLMENT';
    amount: string;
  } | null;
  mdfUnitCost: string | null;
  extraCosts: Array<{
    code: CitaExtraCostCode;
    amount: string;
  }>;
  extraCostsTotal: string | null;
  productionCost: string | null;
  extraCostsAvailable?: boolean;
  missingExtraCosts: CitaExtraCostCode[];
  statusCode: CitaStatusCode;
  pricing?: CitaPublishedPricing;
};

export type CitaCostListResponse = {
  productCode: 'CITA';
  productName: string;
  asOf: string;
  verifiedMeasureCount: number;
  rows: CitaCostRow[];
};

export function fetchCitaCostList(): Promise<CitaCostListResponse> {
  return apiRequest<CitaCostListResponse>('/cost-calculation/cita/list');
}

export function fetchCitaProductionCost(query: {
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
}): Promise<CitaCostRow> {
  const params = new URLSearchParams({
    thicknessMm: query.thicknessMm,
    widthMm: query.widthMm,
    lengthMm: query.lengthMm,
  });
  return apiRequest<CitaCostRow>(`/cost-calculation/cita?${params.toString()}`);
}
