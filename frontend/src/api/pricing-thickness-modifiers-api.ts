import { apiRequest } from '../lib/api';

export const SUPURGELIK_DECORATIVE_RATE_THICKNESSES = [12, 14, 18] as const;

export type SupurgelikDecorativeRateThickness =
  (typeof SUPURGELIK_DECORATIVE_RATE_THICKNESSES)[number];

export type SupurgelikDecorativeRateItem = {
  modifierId: string;
  thicknessMm: SupurgelikDecorativeRateThickness;
  rate: string;
  isActive: boolean;
};

export type SupurgelikDecorativeRatesResponse = {
  productGroupCode: 'SUPURGELIK';
  productGroupName: string;
  items: SupurgelikDecorativeRateItem[];
};

export function listSupurgelikDecorativeRates() {
  return apiRequest<SupurgelikDecorativeRatesResponse>(
    '/pricing-thickness-modifiers?productGroup=SUPURGELIK',
  );
}

export function updateSupurgelikDecorativeRate(
  thicknessMm: SupurgelikDecorativeRateThickness,
  rate: string,
) {
  return apiRequest<SupurgelikDecorativeRatesResponse>(
    '/pricing-thickness-modifiers',
    {
      method: 'PATCH',
      body: JSON.stringify({
        productGroup: 'SUPURGELIK',
        thicknessMm,
        rate,
      }),
    },
  );
}

export function selectSupurgelikDecorativeRates(
  items: SupurgelikDecorativeRateItem[],
): SupurgelikDecorativeRateItem[] {
  const allowed = new Set<number>(SUPURGELIK_DECORATIVE_RATE_THICKNESSES);
  return items
    .filter((item) => allowed.has(item.thicknessMm) && item.isActive)
    .sort((left, right) => left.thicknessMm - right.thicknessMm);
}
