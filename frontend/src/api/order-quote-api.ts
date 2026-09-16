import { apiRequest } from '../lib/api';

export type OrderQuoteRequest = {
  productId: string;
  quantity: number;
  thicknessMm?: string;
  widthMm: string;
  lengthMm: string;
};

export type OrderQuoteResult = {
  productGroupName: string;
  productName: string;
  sizeLabel: string;
  quantity: number;
  productionCostAvailable: boolean;
  unitProductionCost: string | null;
  totalProductionCost: string | null;
  missingMessages: string[];
  salePriceAvailable: boolean;
  salePriceMessage: string | null;
  unitCashPrice: string | null;
  totalCashPrice: string | null;
  unitCardPrice: string | null;
  totalCardPrice: string | null;
};

export function quoteOrderCost(
  input: OrderQuoteRequest,
): Promise<OrderQuoteResult> {
  return apiRequest<OrderQuoteResult>('/cost-calculation/order-quote', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
