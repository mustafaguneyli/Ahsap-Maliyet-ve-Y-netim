import { apiRequest } from '../lib/api';

export type DekoratifPervazPremiumProductCode =
  | 'DEKORATIF_PERVAZ'
  | 'DEKORATIF_PERVAZ_GENIS_KILCIK';

export type DekoratifPervazPremiumItem = {
  exceptionId: string | null;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  rate: string | null;
  isActive: boolean;
};

export type DekoratifPervazPremiumsResponse = {
  productGroupCode: 'PERVAZ';
  productCode: DekoratifPervazPremiumProductCode;
  productName: string;
  items: DekoratifPervazPremiumItem[];
};

export function listDekoratifPervazPremiums(
  productCode: DekoratifPervazPremiumProductCode,
) {
  return apiRequest<DekoratifPervazPremiumsResponse>(
    `/pricing-row-exceptions/dekoratif-pervaz/${productCode}`,
  );
}

export function updateDekoratifPervazPremium(
  productCode: DekoratifPervazPremiumProductCode,
  input: {
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
    rate: string;
  },
) {
  return apiRequest<DekoratifPervazPremiumsResponse>(
    `/pricing-row-exceptions/dekoratif-pervaz/${productCode}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}
