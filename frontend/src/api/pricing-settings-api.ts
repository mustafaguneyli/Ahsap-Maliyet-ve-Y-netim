import { apiRequest } from '../lib/api';

export type ProductPricingSetting = {
  productGroupCode: string;
  productCode: string;
  productName: string;
  settingId: string;
  vatRate: string;
  profitRate: string;
  cardMarkupRate: string | null;
  groupCardMarkupRate: string | null;
  productCardMarkupRate: string | null;
  isActive: boolean;
};

export type UpdateProductPricingInput = {
  productGroup: 'door_frame';
  vatRate: string;
  profitRate: string;
  cardMarkupRate?: string;
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
  cardMarkupRate: string | null;
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

export function updateSupurgelikPricingSetting(
  profitRate: string,
  cardMarkupRate?: string,
) {
  return apiRequest<SupurgelikPricingSetting>('/pricing-settings/supurgelik', {
    method: 'PATCH',
    body: JSON.stringify({
      productGroup: 'SUPURGELIK',
      profitRate,
      ...(cardMarkupRate != null && cardMarkupRate !== ''
        ? { cardMarkupRate }
        : {}),
    }),
  });
}

export type CitaPricingSetting = {
  productGroupCode: 'CITA';
  productGroupName: string;
  settingId: string | null;
  cardMarkupRate: string | null;
  isActive: boolean;
};

export function getCitaPricingSetting() {
  return apiRequest<CitaPricingSetting>('/pricing-settings/cita');
}

export function updateCitaPricingSetting(cardMarkupRate: string) {
  return apiRequest<CitaPricingSetting>('/pricing-settings/cita', {
    method: 'PATCH',
    body: JSON.stringify({
      productGroup: 'CITA',
      cardMarkupRate,
    }),
  });
}

export type GroupCardMarkupRateItem = {
  productGroupCode: string;
  productGroupName: string;
  cardMarkupRate: string | null;
  productCardMarkupRate: string | null;
};

export function listGroupCardMarkupRates() {
  return apiRequest<{ items: GroupCardMarkupRateItem[] }>(
    '/pricing-settings/group-card-markup-rates',
  );
}

export function updateGroupCardMarkupRate(
  productGroupCode: string,
  cardMarkupRate: string,
) {
  return apiRequest<GroupCardMarkupRateItem>(
    '/pricing-settings/group-card-markup-rates',
    {
      method: 'PATCH',
      body: JSON.stringify({
        productGroup: productGroupCode,
        cardMarkupRate,
      }),
    },
  );
}

export function updatePervazPricingSetting(
  productCode:
    | 'AYARLI_PERVAZ'
    | 'DEKORATIF_PERVAZ'
    | 'DEKORATIF_PERVAZ_GENIS_KILCIK',
  profitRate: string,
  cardMarkupRate?: string,
) {
  return apiRequest<AyarliPervazPricingSetting>(
    `/pricing-settings/pervaz/${productCode}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        productGroup: 'PERVAZ',
        profitRate,
        ...(cardMarkupRate != null && cardMarkupRate !== ''
          ? { cardMarkupRate }
          : {}),
      }),
    },
  );
}

export type DoorBuildPricingSetting = {
  productGroupCode: 'KAPI_IMALATI';
  productGroupName: string;
  settingId: string | null;
  vatRate: string | null;
  profitRate: string | null;
  cardMarkupRate: string | null;
  isActive: boolean;
};

export function getDoorBuildPricingSetting() {
  return apiRequest<DoorBuildPricingSetting>('/pricing-settings/door-build');
}

export function updateDoorBuildPricingSetting(input: {
  profitRate: string;
  vatRate: string;
  cardMarkupRate?: string;
}) {
  return apiRequest<DoorBuildPricingSetting>('/pricing-settings/door-build', {
    method: 'PATCH',
    body: JSON.stringify({
      productGroup: 'KAPI_IMALATI',
      profitRate: input.profitRate,
      vatRate: input.vatRate,
      ...(input.cardMarkupRate != null && input.cardMarkupRate !== ''
        ? { cardMarkupRate: input.cardMarkupRate }
        : {}),
    }),
  });
}

export type SizeProfitRatePayload = {
  productId?: string;
  productGroupCode?: string;
  productCode?: string;
  productSizeId?: string;
  widthMm?: number;
  lengthMm?: number;
  profitRate: string | null;
};

export type SizeProfitRateResponse = {
  productId: string;
  productCode: string;
  productGroupCode: string;
  productSizeId: string;
  widthMm: number;
  lengthMm: number;
  profitRate: string | null;
  source: string | null;
  changed: boolean;
  message: string;
};

export function upsertSizeProfitRate(
  payload: SizeProfitRatePayload,
): Promise<SizeProfitRateResponse> {
  return apiRequest<SizeProfitRateResponse>('/pricing-settings/profit-rate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
