import { apiRequest } from '../lib/api';

export type ProductionYield = {
  id: string;
  rawMaterialId: string;
  pieceWidthMm: number;
  pieceLengthMm: number;
  netQty: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  rawMaterial: {
    id: string;
    code: string;
    name: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
    surfaceType: string | null;
    isActive: boolean;
  };
};

export type ListProductionYieldsParams = {
  rawMaterialId?: string;
  thickness?: number;
  pieceWidth?: number;
  pieceLength?: number;
  isActive?: boolean;
};

export type CreateProductionYieldPayload = {
  rawMaterialId: string;
  pieceWidthMm: number;
  pieceLengthMm: number;
  netQty: number;
  isActive?: boolean;
};

function toQuery(params: ListProductionYieldsParams): string {
  const search = new URLSearchParams();
  if (params.rawMaterialId) search.set('rawMaterialId', params.rawMaterialId);
  if (params.thickness !== undefined) search.set('thickness', String(params.thickness));
  if (params.pieceWidth !== undefined) search.set('pieceWidth', String(params.pieceWidth));
  if (params.pieceLength !== undefined) search.set('pieceLength', String(params.pieceLength));
  if (params.isActive !== undefined) search.set('isActive', String(params.isActive));
  const q = search.toString();
  return q ? `?${q}` : '';
}

export function listProductionYields(
  params: ListProductionYieldsParams = {},
): Promise<ProductionYield[]> {
  return apiRequest<ProductionYield[]>(`/production-yields${toQuery(params)}`);
}

export function getProductionYield(id: string): Promise<ProductionYield> {
  return apiRequest<ProductionYield>(`/production-yields/${id}`);
}

export function createProductionYield(
  payload: CreateProductionYieldPayload,
): Promise<ProductionYield> {
  return apiRequest<ProductionYield>('/production-yields', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type ReplaceProductionYieldPayload = {
  netQty: number;
  reason: string;
};

export function replaceProductionYield(
  id: string,
  payload: ReplaceProductionYieldPayload,
): Promise<ProductionYield> {
  return apiRequest<ProductionYield>(`/production-yields/${id}/replace`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type CalculateProductionYieldPayload = {
  rawMaterialId: string;
  pieceWidthMm: number;
  pieceLengthMm: number;
};

export type CalculateProductionYieldResult = {
  calculatedQty: number;
  calculation: {
    sheetCutSideMm: number;
    sheetShortSideMm: number;
    sheetLongSideMm: number;
    effectivePieceWidthMm: number;
    rawResult: string;
    rounding: 'FLOOR';
    rule: 'PRIMARY_PLUS_5MM' | 'SECONDARY_MINUS_40MM';
  };
};

export function calculateProductionYield(
  payload: CalculateProductionYieldPayload,
): Promise<CalculateProductionYieldResult> {
  return apiRequest<CalculateProductionYieldResult>('/production-yields/calculate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
