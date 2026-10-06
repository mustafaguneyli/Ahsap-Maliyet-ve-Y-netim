export type PriceListChannelStatus = 'CALCULATED' | 'MISSING_SOURCE';

export type PriceListRow = {
  productId: string | null;
  productCode: string;
  productSizeId: string | null;
  displayName: string;
  thicknessLabel: string | null;
  profitRate: string | null;
  cashSalePrice: string | null;
  cardSalePrice: string | null;
  cashStatus: PriceListChannelStatus;
  cardStatus: PriceListChannelStatus;
  cashMissingReasons: string[];
  cardMissingReasons: string[];
  /** Nakit kanalı: müşteri listesi / missingCount bununla sayılır. */
  status: PriceListChannelStatus;
  missingReasons: string[];
};

export type PriceListSubsection = {
  title: string;
  rows: PriceListRow[];
};

export type PriceListProduct = {
  productCode: string;
  productName: string;
  subsections: PriceListSubsection[];
};

export type PriceListGroup = {
  productGroupCode: string;
  productGroupName: string;
  calculatorType: string;
  products: PriceListProduct[];
  rowCount: number;
  missingCount: number;
  groupError: string | null;
};

export type PriceListDocument = {
  companyName: 'ZİRVE AHŞAP';
  title: 'ÜRÜN FİYAT LİSTESİ';
  asOf: string;
  groups: PriceListGroup[];
  rowCount: number;
  missingCount: number;
};
