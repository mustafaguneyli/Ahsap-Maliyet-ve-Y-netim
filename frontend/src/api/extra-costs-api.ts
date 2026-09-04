import { apiRequest } from '../lib/api';

export type ExtraCostItem = {
  typeId: string;
  typeCode: string;
  typeName: string;
  valueId: string | null;
  amount: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type ExtraCostListResponse = {
  productGroupCode: string;
  productGroupName: string;
  asOf: string;
  items: ExtraCostItem[];
  totalAmount: string;
};

export type UpdateExtraCostValueInput = {
  productGroup: 'door_frame';
  amount: string;
  effectiveFrom: string;
};

export function listExtraCosts(productGroup: 'door_frame' = 'door_frame') {
  return apiRequest<ExtraCostListResponse>(
    `/extra-costs?productGroup=${encodeURIComponent(productGroup)}`,
  );
}

export function updateExtraCostValue(
  typeCode: string,
  input: UpdateExtraCostValueInput,
) {
  return apiRequest<ExtraCostListResponse>(
    `/extra-costs/${encodeURIComponent(typeCode)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}
