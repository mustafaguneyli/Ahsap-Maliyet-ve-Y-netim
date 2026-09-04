export type DoorFrameVariantCode = '34_MM' | '30_MM';

export type DoorFrameSizeCm = {
  widthCm: number;
  lengthCm: number;
};

const FRAME_34_SIZES: DoorFrameSizeCm[] = [
  { widthCm: 10, lengthCm: 210 },
  { widthCm: 11, lengthCm: 210 },
  { widthCm: 12, lengthCm: 210 },
  { widthCm: 13, lengthCm: 210 },
  { widthCm: 14, lengthCm: 210 },
  { widthCm: 14, lengthCm: 220 },
  { widthCm: 14, lengthCm: 230 },
  { widthCm: 15, lengthCm: 210 },
  { widthCm: 15, lengthCm: 215 },
  { widthCm: 16, lengthCm: 210 },
  { widthCm: 16, lengthCm: 235 },
  { widthCm: 17, lengthCm: 210 },
  { widthCm: 18, lengthCm: 210 },
  { widthCm: 19, lengthCm: 210 },
  { widthCm: 20, lengthCm: 210 },
  { widthCm: 20, lengthCm: 230 },
  { widthCm: 21, lengthCm: 210 },
  { widthCm: 22, lengthCm: 210 },
  { widthCm: 22, lengthCm: 215 },
  { widthCm: 23, lengthCm: 210 },
  { widthCm: 24, lengthCm: 210 },
  { widthCm: 25, lengthCm: 210 },
  { widthCm: 30, lengthCm: 210 },
  { widthCm: 35, lengthCm: 210 },
];

const FRAME_30_SIZES: DoorFrameSizeCm[] = [
  { widthCm: 10, lengthCm: 210 },
  { widthCm: 12, lengthCm: 210 },
  { widthCm: 14, lengthCm: 210 },
  { widthCm: 16, lengthCm: 210 },
  { widthCm: 18, lengthCm: 210 },
  { widthCm: 20, lengthCm: 210 },
  { widthCm: 22, lengthCm: 210 },
  { widthCm: 24, lengthCm: 210 },
];

/** Excel: 14×220, 14×230, 15×215 → 12 MM MDF 220×280 */
const SECONDARY_12_SHEET_220 = new Set(['14x220', '14x230', '15x215']);

export const DOOR_FRAME_MATERIAL_CODES = {
  PRIMARY_22: 'MDF-22-2100X2800-ZIMPARALI',
  PRIMARY_18: 'MDF-18-2100X2800-ZIMPARALI',
  SECONDARY_12_210: 'MDF-12-2100X2800-ZIMPARALI',
  SECONDARY_12_220: 'MDF-12-2200X2800-ZIMPARALI',
} as const;

export function getDoorFrameSizes(variant: DoorFrameVariantCode): DoorFrameSizeCm[] {
  return variant === '34_MM' ? FRAME_34_SIZES : FRAME_30_SIZES;
}

export function getPrimaryMaterialCode(variant: DoorFrameVariantCode): string {
  return variant === '34_MM'
    ? DOOR_FRAME_MATERIAL_CODES.PRIMARY_22
    : DOOR_FRAME_MATERIAL_CODES.PRIMARY_18;
}

export function getSecondary12MaterialCode(widthCm: number, lengthCm: number): string {
  const key = `${widthCm}x${lengthCm}`;
  if (SECONDARY_12_SHEET_220.has(key)) {
    return DOOR_FRAME_MATERIAL_CODES.SECONDARY_12_220;
  }
  return DOOR_FRAME_MATERIAL_CODES.SECONDARY_12_210;
}

export function formatDoorFrameSizeLabel(widthCm: number, lengthCm: number): string {
  return `${widthCm}×${lengthCm}`;
}
