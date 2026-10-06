import { apiRequest } from '../lib/api';
import type { MaterialPriceType } from '../lib/material-price-type';

export type OrderCatalog = {
  groups: Array<{
    id: string;
    code: string;
    name: string;
    products: Array<{ id: string; code: string; name: string }>;
  }>;
  doorFrameSizes: Record<string, Array<{ widthMm: number; lengthMm: number; displayName: string }>>;
  groupSizes: Record<string, Array<{ widthMm: number; lengthMm: number; displayName: string }>>;
  citaThicknessesMm: number[];
  pervazThicknessesMm: string[];
  citaAllowsCustomSize: boolean;
  priceBasisNote: string;
};

export type OrderLineInput = {
  kind: 'CATALOG' | 'FREE_TEXT';
  productId?: string;
  productNameText: string;
  widthMm?: string;
  lengthMm?: string;
  thicknessMm?: string;
  decorText?: string;
  productionNote?: string;
  quantity: string;
  unitText: string;
  discountRate: string;
  unitPrice: string;
  priceSource: 'ENTERED' | 'SUGGESTED_CASH' | 'SUGGESTED_CARD';
};

export type OrderManualMaterialInput = {
  lineNo?: number;
  rawMaterialId?: string;
  materialNameText: string;
  thicknessMm?: string;
  sheetWidthMm?: number;
  sheetLengthMm?: number;
  surfaceType?: string;
  quantity: string;
  pieceQuantity?: string;
  sheetQuantity?: string;
  unitText: string;
  componentRole?: string;
  note?: string;
  unverified?: boolean;
};

export type OrderUpsertInput = {
  customerName: string;
  customerAddress?: string;
  taxOffice?: string;
  customerPhone?: string;
  taxNumber?: string;
  documentDateText?: string;
  vatRate: string;
  lines: OrderLineInput[];
  manualMaterials?: OrderManualMaterialInput[];
};

export type OrderPreview = {
  documentTitle: string;
  vatLabel: string;
  pricesAreVatExclusive: boolean;
  lines: Array<{
    lineNo: number;
    productNameText: string;
    quantity: string;
    unitText: string;
    discountRate: string;
    unitPrice: string;
    unitPriceDisplay: string;
    lineAmount: string;
    lineAmountDisplay: string;
    lineDiscountAmount: string;
    lineDiscountAmountDisplay: string;
  }>;
  grossTotal: string;
  grossTotalDisplay: string;
  discountAmount: string;
  discountAmountDisplay: string;
  netTotal: string;
  netTotalDisplay: string;
  vatAmount: string;
  vatAmountDisplay: string;
  grandTotal: string;
  grandTotalDisplay: string;
  materials: OrderPreviewMaterial[];
  warnings?: string[];
};

export type OrderPreviewMaterial = {
  source: 'RECIPE' | 'MANUAL';
  lineNo: number | null;
  rawMaterialId?: string | null;
  componentRole?: string | null;
  materialNameText: string;
  quantity: string | null;
  pieceQuantity?: string | null;
  sheetQuantity?: string | null;
  unitText: string | null;
  unverified: boolean;
  note: string | null;
  thicknessMm: string | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  surfaceType: string | null;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerAddress: string | null;
  taxOffice: string | null;
  customerPhone: string | null;
  taxNumber: string | null;
  documentDateText: string | null;
  documentTitle: string;
  vatRate: string;
  vatLabel: string;
  pricesAreVatExclusive: true;
  grossTotal: string;
  grossTotalDisplay: string;
  discountAmount: string;
  discountAmountDisplay: string;
  netTotal: string;
  netTotalDisplay: string;
  vatAmount: string;
  vatAmountDisplay: string;
  grandTotal: string;
  grandTotalDisplay: string;
  lines: Array<
    OrderLineInput & {
      lineNo: number;
      productGroupCode: string | null;
      productGroupName: string | null;
      catalogProductName: string | null;
      unitPriceDisplay: string;
      lineAmount: string;
      lineAmountDisplay: string;
      lineDiscountAmount: string;
      lineDiscountAmountDisplay: string;
    }
  >;
  materialLines: OrderPreviewMaterial[];
};

export type OrderListItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  documentDateText: string | null;
  grandTotal: string;
  grandTotalDisplay: string;
  lineCount: number;
  totalQuantity: string;
  totalQuantityDisplay: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderListQuery = {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type OrderListResponse = {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function fetchOrderCatalog() {
  return apiRequest<OrderCatalog>('/order-documents/catalog');
}

export function listOrderDocuments(query: OrderListQuery = {}) {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const search = params.toString();
  return apiRequest<OrderListResponse>(`/order-documents${search ? `?${search}` : ''}`);
}

export function getOrderDocument(id: string) {
  return apiRequest<OrderDetail>(`/order-documents/${id}`);
}

export function previewOrderDocument(input: OrderUpsertInput) {
  return apiRequest<OrderPreview>('/order-documents/preview', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createOrderDocument(input: OrderUpsertInput) {
  return apiRequest<OrderDetail>('/order-documents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateOrderDocument(id: string, input: OrderUpsertInput) {
  return apiRequest<OrderDetail>(`/order-documents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function recalculateOrderMaterials(id: string) {
  return apiRequest<OrderDetail>(`/order-documents/${id}/materials/recalculate`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });
}

export async function openOrderPrint(
  id: string,
  variant: 'customer-priced' | 'workshop-material' | 'combined',
) {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
  const label =
    variant === 'customer-priced'
      ? 'Müşteri formu'
      : variant === 'workshop-material'
        ? 'Üretim formu'
        : 'Sipariş formu';
  let response: Response;
  try {
    response = await fetch(
      `${apiUrl}/order-documents/${id}/prints/${variant}.html?t=${Date.now()}`,
      { cache: 'no-store' },
    );
  } catch {
    throw new Error(`Bağlantı kesildi. ${label} açılamadı. Kayıtlı sipariş duruyor.`);
  }
  const html = await response.text();
  if (response.status === 404) {
    throw new Error('Sipariş bulunamadı. Kayıtlı sipariş duruyor.');
  }
  if (!response.ok) {
    throw new Error(`${label} oluşturulamadı. Kayıtlı sipariş duruyor.`);
  }
  const popup = window.open('about:blank', '_blank');
  if (!popup) {
    throw new Error('Tarayıcı yeni pencereyi engelledi. Kayıtlı sipariş duruyor.');
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

export type { MaterialPriceType };
