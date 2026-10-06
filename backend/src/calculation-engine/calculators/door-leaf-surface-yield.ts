/**
 * Kapı kanadı MDF yüzey kesim kuralları.
 * Kapı Kasası NET öneri helper'ından bağımsızdır; genelleme yapılmaz.
 *
 * Doğrulanmış işletme kuralı (2100×2800 mm tabaka; ENE göre değil BOYA göre):
 * - doorHeightMm === 2100 → 3 yüzey / tabaka, 2 yüzey / kapı
 * - 2100 < doorHeightMm <= 2500 → 2 yüzey / tabaka, 2 yüzey / kapı
 * Kapı eni facesPerSheet / facesPerDoor değerlerini değiştirmez.
 */

export const DOOR_LEAF_FACES_PER_DOOR = 2;

export const DOOR_LEAF_VERIFIED_SHEET_WIDTH_MM = 2100;
export const DOOR_LEAF_VERIFIED_SHEET_LENGTH_MM = 2800;

/** Tam 210 cm boy → 3 yüzey/tabaka. */
export const DOOR_LEAF_HEIGHT_210_MM = 2100;
/** >210–250 cm boy üst sınırı (dahil) → 2 yüzey/tabaka. */
export const DOOR_LEAF_HEIGHT_MAX_250_MM = 2500;

export const DOOR_LEAF_FACES_PER_SHEET_210 = 3;
export const DOOR_LEAF_FACES_PER_SHEET_UP_TO_250 = 2;

export type DoorLeafSurfaceRule = {
  doorHeightMm: number;
  doorWidthMm: number;
  facesPerSheet: number;
  facesPerDoor: number;
  /** UI / rapor için cm etiket (gerçek seçilen ölçü) */
  sizeLabelCm: string;
  source: 'VERIFIED_PRODUCTION_RULE';
  /** Boy bandı özeti (en bağımsız) */
  heightBand: 'EXACT_210' | 'UP_TO_250';
};

/** Belge / UI için boy bandı özeti (eşleşme anahtarı değildir). */
export type DoorLeafSurfaceHeightBandSummary = {
  heightBand: 'EXACT_210' | 'UP_TO_250';
  facesPerSheet: number;
  facesPerDoor: number;
  labelCm: string;
  source: 'VERIFIED_PRODUCTION_RULE';
};

const HEIGHT_BAND_SUMMARIES: readonly DoorLeafSurfaceHeightBandSummary[] = [
  {
    heightBand: 'EXACT_210',
    facesPerSheet: DOOR_LEAF_FACES_PER_SHEET_210,
    facesPerDoor: DOOR_LEAF_FACES_PER_DOOR,
    labelCm: '210 cm → 3 yüzey/tabaka (en bağımsız)',
    source: 'VERIFIED_PRODUCTION_RULE',
  },
  {
    heightBand: 'UP_TO_250',
    facesPerSheet: DOOR_LEAF_FACES_PER_SHEET_UP_TO_250,
    facesPerDoor: DOOR_LEAF_FACES_PER_DOOR,
    labelCm: '>210–250 cm → 2 yüzey/tabaka (en bağımsız)',
    source: 'VERIFIED_PRODUCTION_RULE',
  },
];

export class DoorLeafSurfaceRuleMissingError extends Error {
  readonly code = 'DOOR_LEAF_SURFACE_RULE_MISSING';

  constructor(
    readonly doorHeightMm: number,
    readonly doorWidthMm: number,
  ) {
    const hCm = doorHeightMm / 10;
    const wCm = doorWidthMm / 10;
    super(
      `${hCm} × ${wCm} cm kapı ölçüsü için henüz doğrulanmış yüzey kesim kuralı yok.`,
    );
    this.name = 'DoorLeafSurfaceRuleMissingError';
  }
}

export function listVerifiedDoorLeafSurfaceRules(): readonly DoorLeafSurfaceHeightBandSummary[] {
  return HEIGHT_BAND_SUMMARIES;
}

/**
 * Yüzey kesim kuralı yalnız kapı boyuna göre.
 * Kapı eni etiket içindir; facesPerSheet / facesPerDoor değiştirmez.
 */
export function resolveDoorLeafSurfaceRule(
  doorHeightMm: number,
  doorWidthMm: number,
): DoorLeafSurfaceRule {
  if (!Number.isFinite(doorHeightMm) || doorHeightMm <= 0) {
    throw new DoorLeafSurfaceRuleMissingError(doorHeightMm, doorWidthMm);
  }
  if (!Number.isFinite(doorWidthMm) || doorWidthMm <= 0) {
    throw new DoorLeafSurfaceRuleMissingError(doorHeightMm, doorWidthMm);
  }

  let facesPerSheet: number;
  let heightBand: DoorLeafSurfaceRule['heightBand'];

  if (doorHeightMm === DOOR_LEAF_HEIGHT_210_MM) {
    facesPerSheet = DOOR_LEAF_FACES_PER_SHEET_210;
    heightBand = 'EXACT_210';
  } else if (
    doorHeightMm > DOOR_LEAF_HEIGHT_210_MM &&
    doorHeightMm <= DOOR_LEAF_HEIGHT_MAX_250_MM
  ) {
    facesPerSheet = DOOR_LEAF_FACES_PER_SHEET_UP_TO_250;
    heightBand = 'UP_TO_250';
  } else {
    throw new DoorLeafSurfaceRuleMissingError(doorHeightMm, doorWidthMm);
  }

  return {
    doorHeightMm,
    doorWidthMm,
    facesPerSheet,
    facesPerDoor: DOOR_LEAF_FACES_PER_DOOR,
    sizeLabelCm: `${doorHeightMm / 10} × ${doorWidthMm / 10}`,
    source: 'VERIFIED_PRODUCTION_RULE',
    heightBand,
  };
}

export type DoorLeafSurfaceYieldInput = {
  doorHeightMm: number;
  doorWidthMm: number;
  quantity: number;
};

export type DoorLeafSurfaceYieldResult = {
  rule: DoorLeafSurfaceRule;
  quantity: number;
  totalFaces: number;
  /** Bir kapıya düşen teorik tabaka payı = facesPerDoor / facesPerSheet */
  theoreticalSheetsPerDoor: string;
  /** Sipariş için ceil(totalFaces / facesPerSheet) */
  requiredFullSheets: number;
  /** requiredFullSheets × facesPerSheet − totalFaces */
  unusedFaces: number;
};

/**
 * Saf yüzey verimi. Decimal string oranı hesaplayan taraf quote katmanındadır;
 * burada yalnız tam sayı yüzey / tabaka adetleri üretilir.
 */
export function calculateDoorLeafSurfaceYield(
  input: DoorLeafSurfaceYieldInput,
): DoorLeafSurfaceYieldResult {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('Kapı adedi 1 veya daha büyük tam sayı olmalıdır.');
  }

  const rule = resolveDoorLeafSurfaceRule(
    input.doorHeightMm,
    input.doorWidthMm,
  );
  const totalFaces = input.quantity * rule.facesPerDoor;
  const requiredFullSheets = Math.ceil(totalFaces / rule.facesPerSheet);
  const unusedFaces =
    requiredFullSheets * rule.facesPerSheet - totalFaces;

  return {
    rule,
    quantity: input.quantity,
    totalFaces,
    theoreticalSheetsPerDoor: `${rule.facesPerDoor}/${rule.facesPerSheet}`,
    requiredFullSheets,
    unusedFaces,
  };
}
