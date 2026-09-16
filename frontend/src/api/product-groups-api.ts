import { apiRequest } from '../lib/api';

export type ProductGroupProduct = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

export type ProductGroupSummary = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  activeProductCount: number;
  products: ProductGroupProduct[];
};

export type ProductGroupListResponse = {
  items: ProductGroupSummary[];
};

export function listProductGroups(): Promise<ProductGroupListResponse> {
  return apiRequest<ProductGroupListResponse>('/product-groups');
}
