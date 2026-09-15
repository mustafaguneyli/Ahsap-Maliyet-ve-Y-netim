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

export type AyarliPervazPricingSetting = {
  productGroupCode: 'PERVAZ';
  productCode:
    | 'AYARLI_PERVAZ'
    | 'DEKORATIF_PERVAZ'
    | 'DEKORATIF_PERVAZ_GENIS_KILCIK';
  productName: string;
  settingId: string;
  vatRate: null;
  profitRate: string;
  cardMarkupRate: null;
  cardFixedSurchargeAmount: string | null;
  isActive: boolean;
};

export function getAyarliPervazPricingSetting() {
  return apiRequest<AyarliPervazPricingSetting>(
    '/pricing-settings/pervaz/AYARLI_PERVAZ',
  );
}

export function updateAyarliPervazPricingSetting(profitRate: string) {
  return apiRequest<AyarliPervazPricingSetting>(
    '/pricing-settings/pervaz/AYARLI_PERVAZ',
    {
      method: 'PATCH',
      body: JSON.stringify({
        productGroup: 'PERVAZ',
        profitRate,
      }),
    },
  );
}

export function getPervazPricingSetting(
  productCode:
    | 'AYARLI_PERVAZ'
    | 'DEKORATIF_PERVAZ'
    | 'DEKORATIF_PERVAZ_GENIS_KILCIK',
) {
  return apiRequest<AyarliPervazPricingSetting>(
    `/pricing-settings/pervaz/${productCode}`,
  );
}

export type SupurgelikPricingSetting = {
  productGroupCode: 'SUPURGELIK';
  productGroupName: string;
  settingId: string;
  vatRate: string | null;
  profitRate: string;
  cardMarkupRate: string | null;
  cardFixedSurchargeAmount: string | null;
  isActive: boolean;
};

export function getSupurgelikPricingSetting() {
  return apiRequest<SupurgelikPricingSetting>('/pricing-settings/supurgelik');
}

export function updateSupurgelikPricingSetting(profitRate: string) {
  return apiRequest<SupurgelikPricingSetting>('/pricing-settings/supurgelik', {
    method: 'PATCH',
    body: JSON.stringify({
      productGroup: 'SUPURGELIK',
      profitRate,
    }),
  });
}

export function updatePervazPricingSetting(
  productCode:
    | 'AYARLI_PERVAZ'
    | 'DEKORATIF_PERVAZ'
    | 'DEKORATIF_PERVAZ_GENIS_KILCIK',
  profitRate: string,
  cardFixedSurchargeAmount?: string,
) {
  return apiRequest<AyarliPervazPricingSetting>(
    `/pricing-settings/pervaz/${productCode}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        productGroup: 'PERVAZ',
        profitRate,
        ...(cardFixedSurchargeAmount != null && cardFixedSurchargeAmount !== ''
          ? { cardFixedSurchargeAmount }
          : {}),
      }),
    },
  );
}
