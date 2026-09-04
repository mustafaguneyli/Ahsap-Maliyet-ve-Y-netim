import { apiRequest } from '../lib/api';

export type DoorFramePriceOverrideResponse = {
  productGroupCode: string;
  productCode: string;
  widthCm: number;
  lengthCm: number;
  displayName: string;
  overrideId: string | null;
  cashPrice: string | null;
  reason: string | null;
  isActive: boolean;
};

export type UpsertDoorFramePriceOverrideInput = {
  productGroup: 'door_frame';
  cashPrice: string;
  reason?: string;
};

function sizeKey(widthCm: number, lengthCm: number): string {
  return `${widthCm}x${lengthCm}`;
}

export function upsertDoorFrameCashOverride(
  productCode: '34_MM' | '30_MM',
  widthCm: number,
  lengthCm: number,
  input: UpsertDoorFramePriceOverrideInput,
) {
  return apiRequest<DoorFramePriceOverrideResponse>(
    `/price-overrides/door-frame/${encodeURIComponent(productCode)}/${encodeURIComponent(sizeKey(widthCm, lengthCm))}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
}

export function deactivateDoorFrameCashOverride(
  productCode: '34_MM' | '30_MM',
  widthCm: number,
  lengthCm: number,
) {
  return apiRequest<DoorFramePriceOverrideResponse>(
    `/price-overrides/door-frame/${encodeURIComponent(productCode)}/${encodeURIComponent(sizeKey(widthCm, lengthCm))}`,
    { method: 'DELETE' },
  );
}
