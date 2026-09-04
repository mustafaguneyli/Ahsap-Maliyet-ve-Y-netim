import { apiRequest } from '../lib/api';

export type RawMaterial = {
  id: string;
  code: string;
  name: string;
  thicknessMm: string;
  sheetWidthMm: number;
  sheetLengthMm: number;
  surfaceType: string | null;
  supplierName: string | null;
  isActive: boolean;
  cashPrice: string | null;
  cardInstallmentPrice: string | null;
  lastPriceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListRawMaterialsParams = {
  isActive?: boolean;
  search?: string;
  thicknessMm?: number;
};

export type UpdatePricesPayload = {
  cashPrice: string;
  cardInstallmentPrice: string;
  effectiveFrom: string;
};

function toQuery(params: ListRawMaterialsParams): string {
  const search = new URLSearchParams();
  if (params.isActive !== undefined) search.set('isActive', String(params.isActive));
  if (params.search) search.set('search', params.search);
  if (params.thicknessMm !== undefined) search.set('thicknessMm', String(params.thicknessMm));
  const q = search.toString();
  return q ? `?${q}` : '';
}

export function listRawMaterials(params: ListRawMaterialsParams = {}): Promise<RawMaterial[]> {
  return apiRequest<RawMaterial[]>(`/raw-materials${toQuery(params)}`);
}

export function updateRawMaterialPrices(
  id: string,
  payload: UpdatePricesPayload,
): Promise<RawMaterial> {
  return apiRequest<RawMaterial>(`/raw-materials/${id}/prices`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
