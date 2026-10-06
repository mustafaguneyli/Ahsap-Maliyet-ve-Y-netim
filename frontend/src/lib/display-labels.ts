/**
 * Kullanıcıya görünen etiketler.
 * API / enum / DB kodları değişmez; yalnız display.
 */

const EXTRA_COST_TYPE_LABELS: Record<string, string> = {
  CUTTING: 'Kesim',
  GLUE: 'Tutkal',
  LABOR: 'İşçilik',
  OTHER: 'Diğer',
  PP_WRAPPING: 'PP Sarma',
};

const RECIPE_CALCULATION_MODE_LABELS: Record<string, string> = {
  PER_SHEET_YIELD: 'Tabaka / NET',
  PER_PIECE: 'Parça Başına',
  FIXED_QUANTITY: 'Sabit Miktar',
  PER_METER: 'Metre Başına',
  PER_SQUARE_METER: 'Metrekare Başına',
};

const EXTRA_CALCULATION_MODE_LABELS: Record<string, string> = {
  FIXED: 'Sabit',
  PER_PRODUCT_QUANTITY: 'Ürün Miktarı Başına',
  PER_RECIPE_QUANTITY: 'Reçete Miktarı Başına',
};

const EXTRA_COST_SCOPE_LABELS: Record<string, string> = {
  PRODUCT: 'Ürün',
  GROUP: 'Ürün Grubu',
};

const CALCULATOR_TYPE_LABELS: Record<string, string> = {
  GENERIC_RECIPE: 'Genel Reçete',
  DOOR_FRAME: 'Kapı Kasası',
  PERVAZ: 'Pervaz',
  SUPURGELIK: 'Süpürgelik',
  CITA: 'Çıta',
  DOOR_BUILD: 'Kapı İmalatı',
};

const COST_STATUS_LABELS: Record<string, string> = {
  OK: 'Tamam',
  CALCULATED: 'Hesaplandı',
  MISSING_SOURCE: 'Eksik kaynak',
};

const MATERIAL_PRICE_TYPE_SHORT_LABELS: Record<string, string> = {
  CASH: 'Nakit',
  CARD_INSTALLMENT: 'Kart / Taksitli Alış',
};

function labelFromMap(map: Record<string, string>, code: string): string {
  return map[code] ?? code;
}

export function extraCostTypeLabel(code: string): string {
  return labelFromMap(EXTRA_COST_TYPE_LABELS, code);
}

export function recipeCalculationModeLabel(code: string): string {
  return labelFromMap(RECIPE_CALCULATION_MODE_LABELS, code);
}

export function extraCalculationModeLabel(code: string): string {
  return labelFromMap(EXTRA_CALCULATION_MODE_LABELS, code);
}

export function extraCostScopeLabel(code: string): string {
  return labelFromMap(EXTRA_COST_SCOPE_LABELS, code);
}

export function calculatorTypeLabel(code: string): string {
  return labelFromMap(CALCULATOR_TYPE_LABELS, code);
}

export function costStatusLabel(code: string): string {
  return labelFromMap(COST_STATUS_LABELS, code);
}

export function materialPriceTypeShortLabel(code: string): string {
  return labelFromMap(MATERIAL_PRICE_TYPE_SHORT_LABELS, code);
}

/** Bilinen teknik kodları kullanıcı metnine çevirir (API mesajı display). */
export function friendlyTechnicalTerms(message: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bCARD_INSTALLMENT\b/g, 'Kart / Taksitli Alış'],
    [/\bPER_SQUARE_METER\b/g, 'Metrekare Başına'],
    [/\bPER_PRODUCT_QUANTITY\b/g, 'Ürün Miktarı Başına'],
    [/\bPER_RECIPE_QUANTITY\b/g, 'Reçete Miktarı Başına'],
    [/\bPER_SHEET_YIELD\b/g, 'Tabaka / NET'],
    [/\bFIXED_QUANTITY\b/g, 'Sabit Miktar'],
    [/\bGENERIC_RECIPE\b/g, 'Genel Reçete'],
    [/\bDOOR_FRAME\b/g, 'Kapı Kasası'],
    [/\bSUPURGELIK\b/g, 'Süpürgelik'],
    [/\bPER_PIECE\b/g, 'Parça Başına'],
    [/\bPER_METER\b/g, 'Metre Başına'],
    [/\bMISSING_SOURCE\b/g, 'Eksik kaynak'],
    [/\bPP_WRAPPING\b/g, 'PP Sarma'],
    [/\bDOOR_BUILD\b/g, 'Kapı İmalatı'],
    [/\bCUTTING\b/g, 'Kesim'],
    [/\bGLUE\b/g, 'Tutkal'],
    [/\bLABOR\b/g, 'İşçilik'],
    [/\bOTHER\b/g, 'Diğer'],
    [/\bPERVAZ\b/g, 'Pervaz'],
    [/\bCITA\b/g, 'Çıta'],
    [/\bCASH\b/g, 'Nakit'],
    [/\bFIXED\b/g, 'Sabit'],
    [/\bPRODUCT\b/g, 'Ürün'],
    [/\bGROUP\b/g, 'Ürün Grubu'],
  ];
  let out = message;
  for (const [pattern, label] of replacements) {
    out = out.replace(pattern, label);
  }
  return out;
}

export const STANDARD_EXTRA_COST_TYPE_CODES = [
  'CUTTING',
  'GLUE',
  'LABOR',
  'OTHER',
] as const;

export const RECIPE_CALCULATION_MODE_OPTIONS = [
  { value: 'PER_SHEET_YIELD', label: recipeCalculationModeLabel('PER_SHEET_YIELD') },
  { value: 'PER_PIECE', label: recipeCalculationModeLabel('PER_PIECE') },
  { value: 'FIXED_QUANTITY', label: recipeCalculationModeLabel('FIXED_QUANTITY') },
  { value: 'PER_METER', label: recipeCalculationModeLabel('PER_METER') },
  { value: 'PER_SQUARE_METER', label: recipeCalculationModeLabel('PER_SQUARE_METER') },
] as const;
