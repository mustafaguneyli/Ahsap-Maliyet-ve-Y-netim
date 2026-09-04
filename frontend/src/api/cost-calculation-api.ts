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
