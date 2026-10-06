import Decimal from 'decimal.js';
import {
  getPrimaryMaterialCode,
  getSecondary12MaterialCode,
  type DoorFrameVariantCode,
} from '../../calculation-engine/calculators/door-frame-variants';
import { toDecimal } from '../../common/decimal/decimal.util';

export const MATERIAL_UNVERIFIED_MESSAGE = 'Malzeme miktarı doğrulanamadı.';

export const SHEET_UNVERIFIED_NOTE =
  'Parça adedi doğrulandı. Tabaka ihtiyacı doğrulanamadı.';

export const SHEET_VERIFIED_NOTE =
  'Parça adedi sipariş miktarı ile çarpıldı. Tabaka ihtiyacı yukarı yuvarlanmış parça/NET oranıdır. Farklı ölçüler aynı tabakada birleştirilmedi.';

export type MaterialComponent = {
  role: string;
  rawMaterialId: string;
  materialName: string;
  thicknessMm: string;
  sheetWidthMm: number;
  sheetLengthMm: number;
  surfaceType: string | null;
  piecesPerUnit: string;
  netQty: number | null;
};

export type PlannedMaterial = {
  source: 'RECIPE' | 'MANUAL';
  lineNo: number | null;
  rawMaterialId: string | null;
  materialNameText: string;
  thicknessMm: string | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  surfaceType: string | null;
  quantity: string | null;
  pieceQuantity: string | null;
  sheetQuantity: string | null;
  netQtySnapshot: number | null;
  componentRole: string | null;
  unitText: string | null;
  note: string | null;
  unverified: boolean;
};

export function doorFrameMaterialCodes(
  variant: string,
  widthMm: number,
  lengthMm: number,
): Array<{ role: string; materialCode: string }> | null {
  if (variant !== '34_MM' && variant !== '30_MM') return null;
  if (widthMm % 10 !== 0 || lengthMm % 10 !== 0) return null;
  const widthCm = widthMm / 10;
  const lengthCm = lengthMm / 10;
  return [
    { role: 'ANA_PARCA', materialCode: getPrimaryMaterialCode(variant as DoorFrameVariantCode) },
    { role: 'IKINCI_PARCA', materialCode: getSecondary12MaterialCode(widthCm, lengthCm) },
  ];
}

/**
 * Parça adedi = birim başına parça × sipariş adedi.
 * Tabaka = yukarı yuvarla(parça / NET). NET yoksa tabaka yazılmaz.
 * Fiyat kullanılmaz.
 */
export function planPieceAndSheet(input: {
  orderQuantity: string;
  piecesPerUnit: string;
  netQty: number | null;
}): { pieceQuantity: Decimal; sheetQuantity: Decimal | null } {
  const pieces = toDecimal(input.orderQuantity).times(toDecimal(input.piecesPerUnit));
  if (!pieces.isFinite() || pieces.lte(0)) {
    throw new Error('Parça adedi 0’dan büyük olmalıdır.');
  }
  if (input.netQty == null) {
    return { pieceQuantity: pieces, sheetQuantity: null };
  }
  if (!Number.isInteger(input.netQty) || input.netQty <= 0) {
    return { pieceQuantity: pieces, sheetQuantity: null };
  }
  const sheets = pieces.div(input.netQty).toDecimalPlaces(0, Decimal.ROUND_UP);
  return { pieceQuantity: pieces, sheetQuantity: sheets };
}

export function planComponents(input: {
  lineNo: number;
  orderQuantity: string;
  components: MaterialComponent[] | null;
  unverifiedName: string;
}): PlannedMaterial[] {
  if (!input.components || input.components.length === 0) {
    return [
      {
        source: 'RECIPE',
        lineNo: input.lineNo,
        rawMaterialId: null,
        materialNameText: input.unverifiedName,
        thicknessMm: null,
        sheetWidthMm: null,
        sheetLengthMm: null,
        surfaceType: null,
        quantity: null,
        pieceQuantity: null,
        sheetQuantity: null,
        netQtySnapshot: null,
        componentRole: null,
        unitText: null,
        note: MATERIAL_UNVERIFIED_MESSAGE,
        unverified: true,
      },
    ];
  }

  return input.components.map((component) => {
    const planned = planPieceAndSheet({
      orderQuantity: input.orderQuantity,
      piecesPerUnit: component.piecesPerUnit,
      netQty: component.netQty,
    });
    return {
      source: 'RECIPE' as const,
      lineNo: input.lineNo,
      rawMaterialId: component.rawMaterialId,
      materialNameText: component.materialName,
      thicknessMm: component.thicknessMm,
      sheetWidthMm: component.sheetWidthMm,
      sheetLengthMm: component.sheetLengthMm,
      surfaceType: component.surfaceType,
      quantity: planned.pieceQuantity.toFixed(),
      pieceQuantity: planned.pieceQuantity.toFixed(),
      sheetQuantity: planned.sheetQuantity?.toFixed() ?? null,
      netQtySnapshot: component.netQty,
      componentRole: component.role,
      unitText: 'ADET',
      note: planned.sheetQuantity ? SHEET_VERIFIED_NOTE : SHEET_UNVERIFIED_NOTE,
      unverified: false,
    };
  });
}

export function materialIdentityKey(item: {
  rawMaterialId?: string | null;
  materialNameText: string;
  thicknessMm?: string | null;
  sheetWidthMm?: number | null;
  sheetLengthMm?: number | null;
  surfaceType?: string | null;
}): string {
  if (item.rawMaterialId) {
    return [
      item.rawMaterialId,
      item.thicknessMm ?? '',
      item.sheetWidthMm ?? '',
      item.sheetLengthMm ?? '',
      item.surfaceType ?? '',
    ].join('|');
  }
  return [
    item.materialNameText.trim().toLocaleLowerCase('tr'),
    item.thicknessMm ?? '',
    item.sheetWidthMm ?? '',
    item.sheetLengthMm ?? '',
    item.surfaceType ?? '',
  ].join('|');
}

export function duplicateMaterialWarnings(
  items: Array<{
    rawMaterialId?: string | null;
    materialNameText: string;
    thicknessMm?: string | null;
    sheetWidthMm?: number | null;
    sheetLengthMm?: number | null;
    surfaceType?: string | null;
    unverified?: boolean;
  }>,
): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.unverified) continue;
    const key = materialIdentityKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const warnings: string[] = [];
  for (const count of counts.values()) {
    if (count > 1) {
      warnings.push(
        'Aynı malzeme birden fazla satırda görünüyor. Farklı bir amaçla ikinci satır bırakılabilir.',
      );
      break;
    }
  }
  return warnings;
}
