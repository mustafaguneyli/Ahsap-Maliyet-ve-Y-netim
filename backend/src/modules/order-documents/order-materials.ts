import { toDecimal } from '../../common/decimal/decimal.util';

export const MATERIAL_UNVERIFIED_MESSAGE =
  'Malzeme miktarı doğrulanamadı. NET adet sipariş miktarına çevrilmedi.';

export type RecipeMaterialInput = {
  quantity: string;
  rawMaterialId: string;
  materialName: string;
  thicknessMm: string;
  sheetWidthMm: number;
  sheetLengthMm: number;
  surfaceType: string | null;
};

export type OrderMaterialDraft = {
  source: 'RECIPE' | 'MANUAL';
  lineNo: number | null;
  rawMaterialId: string | null;
  materialNameText: string;
  thicknessMm: string | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  surfaceType: string | null;
  quantity: string | null;
  unitText: string | null;
  note: string | null;
  unverified: boolean;
};

export type ManualMaterialInput = {
  lineNo?: number | null;
  materialNameText: string;
  thicknessMm?: string | null;
  sheetWidthMm?: number | null;
  sheetLengthMm?: number | null;
  surfaceType?: string | null;
  quantity: string;
  unitText: string;
  note?: string | null;
};

/**
 * Reçete kalemi miktarı × sipariş adedi.
 * NET adede bölünmez; tabaka tüketimi üretilmez.
 * Reçete yoksa miktar yazılmaz, uyarı satırı üretilir.
 */
export function buildMaterialDrafts(input: {
  lines: Array<{
    lineNo: number;
    productNameText: string;
    quantity: string;
    recipeItems: RecipeMaterialInput[] | null;
  }>;
  manual: ManualMaterialInput[];
}): OrderMaterialDraft[] {
  const drafts: OrderMaterialDraft[] = [];

  for (const line of input.lines) {
    if (!line.recipeItems || line.recipeItems.length === 0) {
      drafts.push({
        source: 'RECIPE',
        lineNo: line.lineNo,
        rawMaterialId: null,
        materialNameText: line.productNameText,
        thicknessMm: null,
        sheetWidthMm: null,
        sheetLengthMm: null,
        surfaceType: null,
        quantity: null,
        unitText: null,
        note: MATERIAL_UNVERIFIED_MESSAGE,
        unverified: true,
      });
      continue;
    }

    const orderQty = toDecimal(line.quantity);
    for (const item of line.recipeItems) {
      const recipeQty = toDecimal(item.quantity);
      drafts.push({
        source: 'RECIPE',
        lineNo: line.lineNo,
        rawMaterialId: item.rawMaterialId,
        materialNameText: item.materialName,
        thicknessMm: item.thicknessMm,
        sheetWidthMm: item.sheetWidthMm,
        sheetLengthMm: item.sheetLengthMm,
        surfaceType: item.surfaceType,
        quantity: orderQty.times(recipeQty).toFixed(),
        unitText: 'ADET',
        note: 'Reçete miktarı × sipariş adedi. NET adede bölünmedi.',
        unverified: false,
      });
    }
  }

  for (const manual of input.manual) {
    const quantity = toDecimal(manual.quantity.replace(',', '.'));
    if (!quantity.isFinite() || quantity.lte(0)) {
      throw new Error('Manuel malzeme miktarı 0’dan büyük olmalıdır.');
    }
    drafts.push({
      source: 'MANUAL',
      lineNo: manual.lineNo ?? null,
      rawMaterialId: null,
      materialNameText: manual.materialNameText.trim(),
      thicknessMm: blankToNull(manual.thicknessMm),
      sheetWidthMm: manual.sheetWidthMm ?? null,
      sheetLengthMm: manual.sheetLengthMm ?? null,
      surfaceType: blankToNull(manual.surfaceType),
      quantity: quantity.toFixed(),
      unitText: manual.unitText.trim(),
      note: blankToNull(manual.note),
      unverified: false,
    });
  }

  return drafts;
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text === '' ? null : text;
}
