import { apiRequest } from '../lib/api';
import type { MaterialPriceType } from '../lib/material-price-type';
import type { OrderUpsertInput } from './order-documents-api';

export type DoorBuildManualCostCode =
  | 'ISKELET'
  | 'CNC'
  | 'CITA'
  | 'PRES'
  | 'BOYA'
  | 'DIGER'
  | 'UZUN_BASLIK';

export type DoorBuildManualCostScope = 'PER_DOOR' | 'ORDER_TOTAL';

export type DoorBuildManualCostLineInput = {
  code: DoorBuildManualCostCode;
  included: boolean;
  amount?: string;
  scope: DoorBuildManualCostScope;
};

export type DoorBuildFrameSelection = {
  productCode: '34_MM' | '30_MM';
  widthMm: number;
  lengthMm: number;
  /** Sipariş toplamı kasa miktarı (boy); kapı adediyle tekrar çarpılmaz */
  totalBoyQuantity: string;
};

export type DoorBuildPervazSelection = {
  productCode:
    | 'AYARLI_PERVAZ'
    | 'DEKORATIF_PERVAZ'
    | 'DEKORATIF_PERVAZ_GENIS_KILCIK';
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  /** Gönderilse de backend normal pervaz için 4 kullanır */
  piecesPerDoor?: number;
};

export type DoorBuildHeaderSelection = {
  productCode:
    | 'AYARLI_PERVAZ'
    | 'DEKORATIF_PERVAZ'
    | 'DEKORATIF_PERVAZ_GENIS_KILCIK';
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
};

export type DoorBuildPhysicalMaterialInput = {
  materialNameText: string;
  thicknessMm?: string;
  sheetWidthMm?: number;
  sheetLengthMm?: number;
  surfaceType?: string;
  quantity: string;
  unitText: string;
  note?: string;
};

export type DoorBuildQuoteRequest = {
  doorHeightMm: number;
  doorWidthMm: number;
  quantity: number;
  surfaceRawMaterialId: string;
  materialPriceType?: MaterialPriceType;
  frame?: DoorBuildFrameSelection | null;
  sideTrims?: DoorBuildPervazSelection | null;
  header?: DoorBuildHeaderSelection | null;
  manualCostLines: DoorBuildManualCostLineInput[];
  physicalMaterials?: DoorBuildPhysicalMaterialInput[];
  profitRate?: string;
  vatRate?: string;
  cardMarkupRate?: string;
};

export type DoorBuildComponentState = {
  status: 'RESOLVED' | 'UNRESOLVED' | 'NOT_SELECTED';
  unitProductionCost: string | null;
  unitsPerDoor: string | null;
  lineTotal: string | null;
  message?: string;
  unitMeaning?: string;
  businessBoyNote?: string;
  selection?: unknown;
  displayName?: string | null;
  selectedProduct?: { productCode: string; productName: string } | null;
  selectedSize?: {
    widthMm: number;
    lengthMm: number;
    sizeLabelCm: string;
  } | null;
  boyQuantityPerDoor?: string | null;
  totalBoyQuantity?: string | null;
  fullBoyQuantityPerDoor?: string | null;
  halfBoyQuantityPerDoor?: string | null;
  fullBoyPrice?: string | null;
  halfBoyPrice?: string | null;
  pricePerBoy?: string | null;
  costPerDoor?: string | null;
  totalCost?: string | null;
  ruleSource?: string | null;
  piecesPerDoor?: number | null;
  totalPieces?: string | null;
};

export type DoorBuildMaterialDraftRole =
  | 'YUZAY_MDF'
  | 'FRAME'
  | 'SIDE_TRIM'
  | 'HEADER'
  | 'MANUAL_PHYSICAL';

export type DoorBuildMaterialDraftLine = {
  role: DoorBuildMaterialDraftRole;
  label: string;
  productCode: string | null;
  productName: string | null;
  sizeLabel: string | null;
  thicknessMm: string | null;
  quantity: string | null;
  pieceQuantity: string | null;
  sheetQuantity: string | null;
  unitText: string | null;
  rawMaterialId: string | null;
  rawMaterialCode: string | null;
  rawMaterialName: string | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  surfaceType: string | null;
  unverified: boolean;
  note: string | null;
};

export type DoorBuildQuoteResult = {
  doorHeightMm: number;
  doorWidthMm: number;
  doorSizeLabelCm: string;
  quantity: number;
  materialPriceType: MaterialPriceType;
  materialPriceTypeLabel: string;
  rawMaterial: {
    id: string;
    code: string;
    name: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
    surfaceType: string | null;
  };
  sheetPrice: string;
  surfaceStatus: 'RESOLVED' | 'UNRESOLVED';
  surfaceMessage: string | null;
  facesPerSheet: number | null;
  facesPerDoor: number | null;
  theoreticalSheetsPerDoor: string | null;
  unitMdfSurfaceCost: string | null;
  totalFaces: number | null;
  requiredFullSheets: number | null;
  unusedFaces: number | null;
  totalAllocatedMdfCost: string | null;
  catalogNote: string | null;
  frame: DoorBuildComponentState;
  sideTrims: DoorBuildComponentState;
  header: DoorBuildComponentState;
  componentCostBreakdown: Array<{
    code: string;
    label: string;
    status: string;
    lineTotal: string | null;
    message: string | null;
  }>;
  manualCosts: Array<{
    code: DoorBuildManualCostCode;
    label: string;
    included: boolean;
    scope: DoorBuildManualCostScope;
    scopeLabel: string;
    unitAmount: string | null;
    lineTotal: string | null;
  }>;
  manualCostsTotal: string;
  baseSubtotalBeforeWidthCoefficient: string;
  widthCoefficient: string | null;
  widthCoefficientStatus: 'RESOLVED' | 'UNRESOLVED';
  widthCoefficientMessage: string | null;
  widthAdjustedSubtotal: string | null;
  partialSubtotal: string;
  partialSubtotalLabel: string;
  sale: {
    status: 'COMPUTED' | 'NOT_COMPUTED';
    productionBase: string | null;
    profitRate: string | null;
    profitAmount: string | null;
    beforeVat: string | null;
    vatRate: string | null;
    vatAmount: string | null;
    cashSale: string | null;
    cardMarkupRate: string | null;
    cardSale: string | null;
    cardStatusMessage: string | null;
    reason: string | null;
  };
  allSelectedComponentsResolved: boolean;
  phaseNote: string;
  missingSources: string[];
  materialDraft: DoorBuildMaterialDraftLine[];
};

export type DoorBuildSalePriceSource = 'CASH' | 'CARD' | 'MANUAL';

export type DoorBuildOrderTransferRequest = {
  quote: DoorBuildQuoteRequest;
  salePriceSource: DoorBuildSalePriceSource;
  unitPrice?: string;
  discountRate?: string;
  vatRate: string;
  customerName: string;
  customerAddress?: string;
  taxOffice?: string;
  customerPhone?: string;
  taxNumber?: string;
  documentDateText?: string;
};

export type DoorBuildOrderDraftResult = {
  upsert: OrderUpsertInput;
  warnings: string[];
  materialDraft: DoorBuildMaterialDraftLine[];
  doorSizeLabelCm: string;
  quantity: number;
  note: string;
};

export type DoorBuildWorkshopPreviewResult = {
  orderNumber: string;
  isDraft: boolean;
  html: string;
  materialCount: number;
  note: string;
};

export const DOOR_BUILD_MANUAL_COST_OPTIONS: Array<{
  code: DoorBuildManualCostCode;
  label: string;
}> = [
  { code: 'ISKELET', label: 'İskelet' },
  { code: 'CNC', label: 'CNC' },
  { code: 'CITA', label: 'Çıta' },
  { code: 'PRES', label: 'Pres' },
  { code: 'BOYA', label: 'Boya' },
  { code: 'DIGER', label: 'Diğer' },
  { code: 'UZUN_BASLIK', label: 'Uzun Başlık' },
];

export const DOOR_BUILD_PERVAZ_PRODUCTS = [
  { code: 'AYARLI_PERVAZ' as const, label: 'Ayarlı Pervaz' },
  { code: 'DEKORATIF_PERVAZ' as const, label: 'Dekoratif Pervaz' },
  {
    code: 'DEKORATIF_PERVAZ_GENIS_KILCIK' as const,
    label: 'Dekoratif Geniş Kılçık',
  },
];

export const DOOR_BUILD_ORDER_DRAFT_STORAGE_KEY = 'zirve.doorBuild.orderDraft.v1';

export function quoteDoorBuild(
  payload: DoorBuildQuoteRequest,
): Promise<DoorBuildQuoteResult> {
  return apiRequest<DoorBuildQuoteResult>('/door-build/quote', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function transferDoorBuildToOrderDraft(
  payload: DoorBuildOrderTransferRequest,
): Promise<DoorBuildOrderDraftResult> {
  return apiRequest<DoorBuildOrderDraftResult>('/door-build/order-draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function previewDoorBuildWorkshop(
  payload: DoorBuildQuoteRequest,
): Promise<DoorBuildWorkshopPreviewResult> {
  return apiRequest<DoorBuildWorkshopPreviewResult>(
    '/door-build/workshop-preview',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}
