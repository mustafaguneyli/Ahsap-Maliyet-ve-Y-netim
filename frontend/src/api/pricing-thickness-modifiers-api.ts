import { apiRequest } from '../lib/api';

export type SupurgelikDecorativeRateItem = {
  modifierId: string | null;
  thicknessMm: number;
  rate: string | null;
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
  thicknessMm: number,
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
  return [...items].sort((left, right) => left.thicknessMm - right.thicknessMm);
}
