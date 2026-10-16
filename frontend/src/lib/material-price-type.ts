export type MaterialPriceType = 'CASH' | 'CARD_INSTALLMENT';

export const COST_MATERIAL_PRICE_TYPE: MaterialPriceType = 'CARD_INSTALLMENT';

export const DEFAULT_MATERIAL_PRICE_TYPE: MaterialPriceType =
  COST_MATERIAL_PRICE_TYPE;

export function materialPriceTypeLabel(value: MaterialPriceType): string {
  return value === 'CASH' ? 'Nakit (Peşin Alış)' : 'Kart / Taksitli Alış';
}

/** Maliyet sonucundaki son satış fiyatı sütunu / alanı etiketi. */
export function salePriceResultLabel(value: MaterialPriceType): string {
  return value === 'CASH' ? 'Nakit Satış' : 'Kart / Taksit Satış';
}

export function showsCashSalePrice(value: MaterialPriceType): boolean {
  return value === 'CASH';
}

export function showsCardSalePrice(value: MaterialPriceType): boolean {
  return value === 'CARD_INSTALLMENT';
}

export function missingPurchasePriceLabel(
  materialLabel: string,
  _value: MaterialPriceType = COST_MATERIAL_PRICE_TYPE,
): string {
  return `${materialLabel} için MDF kart/taksitli alış fiyatı tanımlı değil`;
}

export function withMaterialPriceType(
  path: string,
  materialPriceType: MaterialPriceType,
): string {
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}materialPriceType=${materialPriceType}`;
}

/** API iletisindeki alış türü kodlarını işletme diline çevirir. */
export function friendlyMaterialPriceError(message: string): string {
  return message
    .replace(/\bCARD_INSTALLMENT\b/g, 'Kart / Taksitli Alış')
    .replace(/\bCASH\b/g, 'Nakit');
}
