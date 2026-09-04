import { apiRequest } from '../lib/api';

export type ProductPricingSetting = {
  productGroupCode: string;
  productCode: string;
  productName: string;
  settingId: string;
  vatRate: string;
  profitRate: string;
  cardMarkupRate: string;
  isActive: boolean;
};

export type UpdateProductPricingInput = {
  productGroup: 'door_frame';
  vatRate: string;
  profitRate: string;
  cardMarkupRate: string;
};

export function getDoorFramePricingSetting(productCode: '34_MM' | '30_MM') {
  return apiRequest<ProductPricingSetting>(
    `/pricing-settings/door-frame/${encodeURIComponent(productCode)}`,
  );
}

export function updateDoorFramePricingSetting(
  productCode: '34_MM' | '30_MM',
  input: UpdateProductPricingInput,
) {
  return apiRequest<ProductPricingSetting>(
    `/pricing-settings/door-frame/${encodeURIComponent(productCode)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}
