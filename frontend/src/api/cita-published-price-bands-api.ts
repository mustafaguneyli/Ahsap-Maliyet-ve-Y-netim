import { apiRequest } from '../lib/api';

export type CitaPublishedPriceBandItem = {
  id: string;
  minWidthMm: number;
  maxWidthMm: number;
  displayName: string;
  cashPrice: string;
  cardPrice: string;
  thicknessMm: number[];
  isActive: boolean;
};

export type CitaPublishedPriceBandsResponse = {
  productGroupCode: 'CITA';
  productGroupName: string;
  items: CitaPublishedPriceBandItem[];
};

export function listCitaPublishedPriceBands() {
  return apiRequest<CitaPublishedPriceBandsResponse>(
    '/cita-published-price-bands',
  );
}

export function updateCitaPublishedPriceBand(
  id: string,
  input: { cashPrice: string; cardPrice: string },
) {
  return apiRequest<CitaPublishedPriceBandsResponse>(
    `/cita-published-price-bands/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}
