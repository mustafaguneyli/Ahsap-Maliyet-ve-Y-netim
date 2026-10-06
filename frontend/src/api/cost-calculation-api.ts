import { apiRequest } from '../lib/api';
import {
  DEFAULT_MATERIAL_PRICE_TYPE,
  withMaterialPriceType,
  type MaterialPriceType,
} from '../lib/material-price-type';

export type { MaterialPriceType };

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
  profitRateSource?: string;
  profitAmount: string;
  priceBeforeRounding: string;
  roundedSalePrice: string;
  cashSalePrice: string;
  cardMarkupRate: string | null;
  cardPriceBeforeRounding: string | null;
  cardSalePrice: string | null;
  calculatedCashPrice: string;
  cashOverride: {
    id: string;
    cashPrice: string;
    reason: string | null;
  } | null;
  publishedCashPrice: string;
  publishedCardPrice: string | null;
  cardStatusCode?: string | null;
  cardStatusMessage?: string | null;
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
  materialPriceType?: MaterialPriceType;
  extraCosts: DoorFrameExtraCosts;
  vatRate: string;
  profitRate: string;
  cardMarkupRate: string | null;
  rows: DoorFrameMdfRow[];
};

export function fetchDoorFrameMdfCosts(
  variant: '34_MM' | '30_MM',
  materialPriceType: MaterialPriceType = DEFAULT_MATERIAL_PRICE_TYPE,
): Promise<DoorFrameMdfResponse> {
  return apiRequest<DoorFrameMdfResponse>(
    withMaterialPriceType(
      `/cost-calculation/door-frame/mdf?variant=${variant}`,
      materialPriceType,
    ),
  );
}

export type AyarliPervazMdfPart = {
  rawMaterialCode: string;
  sheetPriceType: MaterialPriceType;
  sheetPrice: string;
  netQty: number;
  yieldSource: string;
  unitCost: string;
};

export type AyarliPervazPricing = {
  profitRate: string;
  profitRateSource:
    | 'SIZE_OVERRIDE'
    | 'PRODUCT_OVERRIDE'
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
  cardPricingType: 'PERCENT_MARKUP' | 'NONE';
  cardMarkupRate: string | null;
  cardSalePrice: string | null;
  cardStatusCode: string | null;
  cardStatusMessage: string | null;
};

export type AyarliPervazMdfRow = {
  productGroupCode: 'PERVAZ';
  productGroupName: string;
  productCode: 'AYARLI_PERVAZ';
  priceType: MaterialPriceType;
  materialPriceType?: MaterialPriceType;
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

export function fetchAyarliPervazMdfCosts(
  materialPriceType: MaterialPriceType = DEFAULT_MATERIAL_PRICE_TYPE,
): Promise<AyarliPervazMdfResponse> {
  return apiRequest<AyarliPervazMdfResponse>(
    withMaterialPriceType('/cost-calculation/pervaz/ayarli', materialPriceType),
  );
}

export type DekoratifPervazPricing = {
  profitRate: string;
  profitRateSource:
    | 'SIZE_OVERRIDE'
    | 'PRODUCT_OVERRIDE'
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
  cardPricingType: 'PERCENT_MARKUP' | 'NONE';
  cardMarkupRate: string | null;
  cardSalePrice: string | null;
  cardStatusCode: string | null;
  cardStatusMessage: string | null;
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

export function fetchDekoratifPervazCosts(
  materialPriceType: MaterialPriceType = DEFAULT_MATERIAL_PRICE_TYPE,
): Promise<DekoratifPervazResponse> {
  return apiRequest<DekoratifPervazResponse>(
    withMaterialPriceType(
      '/cost-calculation/pervaz/dekoratif',
      materialPriceType,
    ),
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

export function fetchDekoratifGenisKilcikCosts(
  materialPriceType: MaterialPriceType = DEFAULT_MATERIAL_PRICE_TYPE,
): Promise<DekoratifGenisKilcikResponse> {
  return apiRequest<DekoratifGenisKilcikResponse>(
    withMaterialPriceType(
      '/cost-calculation/pervaz/dekoratif-genis-kilcik',
      materialPriceType,
    ),
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
  publishedCardPrice: string | null;
  cardMarkupRate?: string | null;
  cardStatusCode?: string | null;
  cardStatusMessage?: string | null;
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
    priceType: MaterialPriceType;
    amount: string;
  } | null;
  materialPriceType?: MaterialPriceType;
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
  materialPriceType?: MaterialPriceType;
  asOf: string;
  masterCount: number;
  rowCount: number;
  rows: SupurgelikCostRow[];
};

export function fetchSupurgelikCosts(
  productCode: SupurgelikProductCode,
  materialPriceType: MaterialPriceType = DEFAULT_MATERIAL_PRICE_TYPE,
): Promise<SupurgelikCostsResponse> {
  return apiRequest<SupurgelikCostsResponse>(
    withMaterialPriceType(
      `/cost-calculation/supurgelik?productCode=${encodeURIComponent(productCode)}`,
      materialPriceType,
    ),
  );
}

/** Frontend hesap yapmaz; bu alanlar API response contract’ıdır. */
type SupurgelikCostRowContract = {
  productionYield: { netQty: number; productId: null };
  sheetPrice: { priceType: MaterialPriceType; amount: string } | null;
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
  cardStatusCode?: string | null;
  cardStatusMessage?: string | null;
  statusCode: CitaPublishedPriceStatusCode;
  profitRate?: string | null;
  profitRateSource?: string | null;
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
    priceType: MaterialPriceType;
    amount: string;
  } | null;
  materialPriceType?: MaterialPriceType;
  mdfUnitCost: string | null;
  extraCosts: Array<{
    code: CitaExtraCostCode;
    amount: string;
  }>;
  extraCostsTotal: string | null;
  productionCost: string | null;
  cuttingBatchCost?: string | null;
  cuttingUnitCost?: string | null;
  extraCostsAvailable?: boolean;
  missingExtraCosts: CitaExtraCostCode[];
  statusCode: CitaStatusCode;
  pricing?: CitaPublishedPricing;
};

export type CitaCostListResponse = {
  productCode: 'CITA';
  productName: string;
  materialPriceType?: MaterialPriceType;
  asOf: string;
  verifiedMeasureCount: number;
  rows: CitaCostRow[];
};

export function fetchCitaCostList(
  materialPriceType: MaterialPriceType = DEFAULT_MATERIAL_PRICE_TYPE,
): Promise<CitaCostListResponse> {
  return apiRequest<CitaCostListResponse>(
    withMaterialPriceType('/cost-calculation/cita/list', materialPriceType),
  );
}

export function fetchCitaProductionCost(query: {
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  materialPriceType?: MaterialPriceType;
}): Promise<CitaCostRow> {
  const params = new URLSearchParams({
    thicknessMm: query.thicknessMm,
    widthMm: query.widthMm,
    lengthMm: query.lengthMm,
    materialPriceType: query.materialPriceType ?? DEFAULT_MATERIAL_PRICE_TYPE,
  });
  return apiRequest<CitaCostRow>(`/cost-calculation/cita?${params.toString()}`);
}

export type CatalogItemMode = 'NEW_GROUP' | 'NEW_PRODUCT' | 'NEW_SIZE';

export type CatalogItemProductGroup = string;

export type RecipeCalculationMode =
  | 'PER_PIECE'
  | 'PER_SHEET_YIELD'
  | 'PER_METER'
  | 'PER_SQUARE_METER'
  | 'FIXED_QUANTITY';

export type GenericRecipeItemPayload = {
  rawMaterialId: string;
  calculationMode: RecipeCalculationMode;
  quantity: string;
  quantityUnit?: string;
  wasteRate?: string;
  productionYieldId?: string;
  newNetQty?: number;
  pieceWidthMm?: number;
  pieceLengthMm?: number;
  sortOrder?: number;
};

export type GenericExtraCostPayload = {
  typeCode: string;
  amount: string;
  calculationMode: 'FIXED' | 'PER_PRODUCT_QUANTITY' | 'PER_RECIPE_QUANTITY';
  scope: 'GROUP' | 'PRODUCT';
};

export type CreateCatalogItemPayload = {
  mode: CatalogItemMode;
  productGroupCode?: string;
  newGroupCode?: string;
  newGroupName?: string;
  productCode?: string;
  newProductCode?: string;
  productName?: string;
  productUnit?: 'ADET' | 'BOY' | 'METRE' | 'M2';
  hasSizes?: boolean;
  isActive?: boolean;
  widthMm: number;
  lengthMm: number;
  displayName?: string;
  rawMaterialId?: string;
  netQty?: number;
  secondaryRawMaterialId?: string;
  secondaryNetQty?: number;
  kilcikRawMaterialId?: string;
  kilcikNetQty?: number;
  kilcikTypeId?: string;
  useGroupExtraCostDefaults?: boolean;
  recipeItems?: GenericRecipeItemPayload[];
  extraCosts?: GenericExtraCostPayload[];
  copyRecipeFromSizeId?: string;
  materialPriceType?: MaterialPriceType;
  reason?: string;
};

export type CreateCatalogItemResponse = {
  mode: CatalogItemMode;
  productGroupCode: string;
  productGroupName?: string;
  productCode: string;
  productName: string;
  calculatorType?: string;
  size: {
    id: string;
    widthMm: number;
    lengthMm: number;
    displayName: string;
    thicknessMm?: number;
  };
  yields?: Array<{ role: string; id: string; netQty: number }>;
  recipeId?: string;
  recipeIds?: string[];
  message: string;
};

export function createCatalogItem(
  payload: CreateCatalogItemPayload,
): Promise<CreateCatalogItemResponse> {
  return apiRequest<CreateCatalogItemResponse>('/cost-calculation/catalog-items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type DeactivateCatalogTarget = 'SIZE' | 'PRODUCT' | 'GROUP';

export type DeactivateCatalogItemPayload = {
  target: DeactivateCatalogTarget;
  recipeId?: string;
  productId?: string;
  productGroupCode?: string;
  reason?: string;
};

export type DeactivateCatalogItemResponse = {
  target: DeactivateCatalogTarget;
  changed: boolean;
  message: string;
  recipeId?: string;
  productId?: string;
  sizeId?: string;
  productGroupCode?: string;
};

export function deactivateCatalogItem(
  payload: DeactivateCatalogItemPayload,
): Promise<DeactivateCatalogItemResponse> {
  return apiRequest<DeactivateCatalogItemResponse>(
    '/cost-calculation/catalog-items/deactivate',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export type GenericCostRow = {
  status: 'OK' | 'MISSING_SOURCE';
  productCode: string;
  productName: string;
  productId?: string;
  sizeId?: string;
  recipeId?: string;
  widthMm: number;
  lengthMm: number;
  displayName: string;
  materialCosts: Array<{
    rawMaterialName: string;
    netQty: number | null;
    lineCost: string;
  }>;
  materialCostTotal: string | null;
  extraCostTotal: string | null;
  productionCost: string | null;
  missingSources: string[];
  pricing: {
    cashSalePrice: string | null;
    cardSalePrice: string | null;
    cardStatusMessage?: string | null;
    profitRate?: string | null;
  } | null;
};

export type GenericCostListResponse = {
  productGroupCode: string;
  productGroupName: string;
  calculatorType: string;
  materialPriceType: MaterialPriceType;
  rows: GenericCostRow[];
};

export function fetchGenericCostList(
  productGroupCode: string,
  materialPriceType: MaterialPriceType = DEFAULT_MATERIAL_PRICE_TYPE,
): Promise<GenericCostListResponse> {
  return apiRequest<GenericCostListResponse>(
    withMaterialPriceType(
      `/cost-calculation/generic?productGroupCode=${encodeURIComponent(productGroupCode)}`,
      materialPriceType,
    ),
  );
}

export type GenericPreviewPayload = {
  productGroupCode?: string;
  productGroupName?: string;
  productCode?: string;
  productName?: string;
  productUnit?: 'ADET' | 'BOY' | 'METRE' | 'M2';
  widthMm: number;
  lengthMm: number;
  displayName?: string;
  materialPriceType?: MaterialPriceType;
  recipeItems: GenericRecipeItemPayload[];
  extraCosts?: GenericExtraCostPayload[];
};

export function previewGenericCatalog(
  payload: GenericPreviewPayload,
): Promise<GenericCostRow & { warnings?: string[] }> {
  return apiRequest('/cost-calculation/generic-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
