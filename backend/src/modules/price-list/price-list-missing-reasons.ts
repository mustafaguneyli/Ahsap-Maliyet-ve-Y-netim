/**
 * Calculator / service kodlarını fiyat listesi display metnine çevirir.
 * Enum ve calculator kodları değişmez; yalnız kullanıcı metni üretilir.
 */

export const PRICE_LIST_REASON_LABELS = {
  RAW_MATERIAL_PRICE_MISSING: 'MDF / Ham Madde Alış Fiyatı Tanımlı Değil',
  PRODUCTION_YIELD_MISSING: 'NET Üretim Adedi Tanımlı Değil',
  PROFIT_RATE_MISSING: 'Kâr Oranı Tanımlı Değil',
  CARD_MARKUP_MISSING: 'Kart Satış Oranı Tanımlı Değil',
  RECIPE_MISSING: 'Ürün Reçetesi Tanımlı Değil',
  PUBLISHED_PRICE_MISSING: 'Yayınlanmış Satış Fiyatı Tanımlı Değil',
  PRODUCT_SIZE_MISSING: 'Ürün Ölçüsü Tanımlı Değil',
  RAW_MATERIAL_MISSING: 'Ham Madde Tanımlı Değil',
  EXTRA_COST_SOURCE_MISSING: 'Gerekli Ek Maliyet Bilgisi Eksik',
  DECORATIVE_RATE_MISSING: 'Dekoratif oran tanımlı değil',
} as const;

const CODE_TO_KEY: Record<string, keyof typeof PRICE_LIST_REASON_LABELS> = {
  RAW_MATERIAL_PRICE_MISSING: 'RAW_MATERIAL_PRICE_MISSING',
  CITA_RAW_MATERIAL_PRICE_MISSING: 'RAW_MATERIAL_PRICE_MISSING',
  PRODUCTION_YIELD_MISSING: 'PRODUCTION_YIELD_MISSING',
  PROFIT_RATE_MISSING: 'PROFIT_RATE_MISSING',
  CARD_MARKUP_MISSING: 'CARD_MARKUP_MISSING',
  CARD_MARKUP_RATE_MISSING: 'CARD_MARKUP_MISSING',
  RECIPE_MISSING: 'RECIPE_MISSING',
  PUBLISHED_PRICE_MISSING: 'PUBLISHED_PRICE_MISSING',
  CITA_PUBLISHED_PRICE_MISSING: 'PUBLISHED_PRICE_MISSING',
  PRODUCT_SIZE_MISSING: 'PRODUCT_SIZE_MISSING',
  RAW_MATERIAL_MISSING: 'RAW_MATERIAL_MISSING',
  EXTRA_COST_SOURCE_MISSING: 'EXTRA_COST_SOURCE_MISSING',
  EXTRA_COST_MISSING: 'EXTRA_COST_SOURCE_MISSING',
  PP_WRAPPING_COST_MISSING: 'EXTRA_COST_SOURCE_MISSING',
  DECORATIVE_RATE_MISSING: 'DECORATIVE_RATE_MISSING',
};

const KNOWN_LABELS = new Set<string>(Object.values(PRICE_LIST_REASON_LABELS));

export function toMissingReasons(
  sources: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const source of sources) {
    if (source == null) continue;
    const trimmed = source.trim();
    if (!trimmed) continue;
    const label = reasonLabel(trimmed);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function reasonLabel(raw: string): string {
  if (KNOWN_LABELS.has(raw)) return raw;
  const fromCode = CODE_TO_KEY[raw];
  if (fromCode) return PRICE_LIST_REASON_LABELS[fromCode];
  const embedded = matchEmbeddedCode(raw);
  if (embedded) return PRICE_LIST_REASON_LABELS[embedded];
  return inferFromMessage(raw);
}

function matchEmbeddedCode(
  raw: string,
): keyof typeof PRICE_LIST_REASON_LABELS | null {
  for (const code of Object.keys(CODE_TO_KEY)) {
    if (raw.includes(code)) {
      return CODE_TO_KEY[code];
    }
  }
  return null;
}

function inferFromMessage(raw: string): string {
  if (/kart\s*\/\s*taksit oranı|kart satış oranı/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.CARD_MARKUP_MISSING;
  }
  if (/dekoratif oran/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.DECORATIVE_RATE_MISSING;
  }
  if (/pp sarma/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.EXTRA_COST_SOURCE_MISSING;
  }
  if (/ek maliyet/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.EXTRA_COST_SOURCE_MISSING;
  }
  if (/yayın/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.PUBLISHED_PRICE_MISSING;
  }
  if (/\bNET\b|üretim aded/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.PRODUCTION_YIELD_MISSING;
  }
  if (/reçete/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.RECIPE_MISSING;
  }
  if (/kâr oranı|profitRate|PricingSetting/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.PROFIT_RATE_MISSING;
  }
  if (/ölçü bulunamadı|ProductSize|ürün ölçüsü/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.PRODUCT_SIZE_MISSING;
  }
  if (/alış fiyat|MDF fiyat|sheetPrice/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.RAW_MATERIAL_PRICE_MISSING;
  }
  if (/ham madde/i.test(raw) && /tanıml|bulunamad|yok/i.test(raw)) {
    return PRICE_LIST_REASON_LABELS.RAW_MATERIAL_MISSING;
  }
  return raw.replace(/\bCARD_INSTALLMENT\b/g, 'Kart / Taksitli Alış').replace(
    /\bCASH\b/g,
    'Nakit',
  );
}

export const FALLBACK_SALE_REASON = 'Satış fiyatı hesaplanamadı.';
export const FALLBACK_CARD_REASON = PRICE_LIST_REASON_LABELS.CARD_MARKUP_MISSING;
