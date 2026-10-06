import Decimal from 'decimal.js';
import { toDecimal } from '../../common/decimal/decimal.util';
import {
  calculateDoorLeafSurfaceYield,
  DoorLeafSurfaceRuleMissingError,
  type DoorLeafSurfaceRule,
  type DoorLeafSurfaceYieldResult,
} from './door-leaf-surface-yield';

export const DOOR_BUILD_MANUAL_COST_CODES = [
  'ISKELET',
  'CNC',
  'CITA',
  'PRES',
  'BOYA',
  'DIGER',
  'UZUN_BASLIK',
] as const;

export type DoorBuildManualCostCode =
  (typeof DOOR_BUILD_MANUAL_COST_CODES)[number];

export const DOOR_BUILD_MANUAL_COST_LABELS: Record<
  DoorBuildManualCostCode,
  string
> = {
  ISKELET: 'İskelet',
  CNC: 'CNC',
  CITA: 'Çıta',
  PRES: 'Pres',
  BOYA: 'Boya',
  DIGER: 'Diğer',
  UZUN_BASLIK: 'Uzun Başlık',
};

export type DoorBuildManualCostScope = 'PER_DOOR' | 'ORDER_TOTAL';

export type DoorBuildManualCostLineInput = {
  code: DoorBuildManualCostCode;
  included: boolean;
  amount?: string | null;
  scope: DoorBuildManualCostScope;
};

export type DoorBuildManualCostLineResult = {
  code: DoorBuildManualCostCode;
  label: string;
  included: boolean;
  scope: DoorBuildManualCostScope;
  scopeLabel: string;
  unitAmount: string | null;
  lineTotal: string | null;
};

/**
 * Kapı Kasası calculator productionCost birimi:
 * seçilen katalog ölçüsünde bir tam kasa (iki MDF parçası + ek maliyetler).
 * Kapı İmalatı maliyeti: bu birim maliyet × kullanıcının girdiği Toplam Kasa Miktarı (Boy).
 * Sabit 750 / 950 TL kasa fiyatı kullanılmaz.
 */
export const DOOR_FRAME_CATALOG_UNIT_MEANING =
  'ONE_COMPLETE_DOOR_FRAME_OF_SELECTED_CATALOG_SIZE' as const;

export const DOOR_FRAME_BUSINESS_BOY_NOTE =
  'Toplam kasa miktarı (boy) kullanıcı tarafından girilir. Kapı adediyle otomatik çarpılmaz; sabit boy/fiyat kuralı uygulanmaz.';

export const DOOR_BUILD_FRAME_QUANTITY_REQUIRED_MESSAGE =
  'Toplam kasa miktarı (boy) girilmelidir.';

export const DOOR_BUILD_FRAME_QUANTITY_INVALID_MESSAGE =
  'Toplam kasa miktarı (boy) 0’dan büyük olmalıdır.';

/** Yüzey kesim masterı yok — tabaka/yüzey uydurulmaz. */
export const DOOR_BUILD_SURFACE_RULE_MISSING_MESSAGE =
  'Bu kapı ölçüsü için doğrulanmış MDF yüzey kesim kuralı bulunmuyor.';

/** Doğrulanmış yan pervaz: kapı başına 4 adet (başlık hariç). */
export const DOOR_BUILD_SIDE_TRIM_PIECES_PER_DOOR = 4;

/** Kapı eni maliyet katsayısı sınırları (mm, dahil). */
export const DOOR_BUILD_WIDTH_COEFF_TIER1_MAX_MM = 1000;
export const DOOR_BUILD_WIDTH_COEFF_TIER2_MAX_MM = 1700;
export const DOOR_BUILD_WIDTH_COEFF_TIER3_MAX_MM = 2300;
export const DOOR_BUILD_WIDTH_COEFF_TIER1 = '1';
export const DOOR_BUILD_WIDTH_COEFF_TIER2 = '1.5';
export const DOOR_BUILD_WIDTH_COEFF_TIER3 = '2';
export const DOOR_BUILD_WIDTH_COEFF_MISSING_MESSAGE =
  'Bu kapı eni için doğrulanmış maliyet katsayısı bulunmuyor.';

export type DoorBuildWidthCoefficientResolved = {
  status: 'RESOLVED';
  widthCoefficient: string;
  message: null;
};

export type DoorBuildWidthCoefficientUnresolved = {
  status: 'UNRESOLVED';
  widthCoefficient: null;
  message: string;
};

export type DoorBuildWidthCoefficientResult =
  | DoorBuildWidthCoefficientResolved
  | DoorBuildWidthCoefficientUnresolved;

/**
 * Kapı enine göre doğrulanmış maliyet katsayısı.
 * Fiziksel yüzey/tabaka hesabını değiştirmez.
 */
export function resolveDoorBuildWidthCoefficient(
  doorWidthMm: number,
): DoorBuildWidthCoefficientResult {
  if (!Number.isInteger(doorWidthMm) || doorWidthMm < 1) {
    throw new Error('Kapı eni 1 veya daha büyük tam sayı (mm) olmalıdır.');
  }
  if (doorWidthMm <= DOOR_BUILD_WIDTH_COEFF_TIER1_MAX_MM) {
    return {
      status: 'RESOLVED',
      widthCoefficient: DOOR_BUILD_WIDTH_COEFF_TIER1,
      message: null,
    };
  }
  if (doorWidthMm <= DOOR_BUILD_WIDTH_COEFF_TIER2_MAX_MM) {
    return {
      status: 'RESOLVED',
      widthCoefficient: DOOR_BUILD_WIDTH_COEFF_TIER2,
      message: null,
    };
  }
  if (doorWidthMm <= DOOR_BUILD_WIDTH_COEFF_TIER3_MAX_MM) {
    return {
      status: 'RESOLVED',
      widthCoefficient: DOOR_BUILD_WIDTH_COEFF_TIER3,
      message: null,
    };
  }
  return {
    status: 'UNRESOLVED',
    widthCoefficient: null,
    message: DOOR_BUILD_WIDTH_COEFF_MISSING_MESSAGE,
  };
}

/** Ara toplam × en katsayısı; JavaScript Number kullanmaz. */
export function applyDoorBuildWidthCoefficient(
  baseSubtotal: string,
  widthCoefficient: string,
): string {
  const base = toDecimal(baseSubtotal);
  const coeff = toDecimal(widthCoefficient);
  if (!base.isFinite() || base.lt(0)) {
    throw new Error('Katsayı öncesi ara toplam geçersiz.');
  }
  if (!coeff.isFinite() || coeff.lte(0)) {
    throw new Error('En katsayısı 0’dan büyük olmalıdır.');
  }
  return base.times(coeff).toFixed();
}


export type DoorBuildResolvedComponentCost = {
  status: 'RESOLVED';
  unitProductionCost: string;
  unitsPerDoor: string;
  lineTotal: string;
};

export type DoorBuildUnresolvedComponentCost = {
  status: 'UNRESOLVED';
  message: string;
  unitProductionCost: null;
  unitsPerDoor: string | null;
  lineTotal: null;
};

export type DoorBuildNotSelectedComponent = {
  status: 'NOT_SELECTED';
  unitProductionCost: null;
  unitsPerDoor: null;
  lineTotal: null;
};

export type DoorBuildComponentCostState =
  | DoorBuildResolvedComponentCost
  | DoorBuildUnresolvedComponentCost
  | DoorBuildNotSelectedComponent;

export type DoorBuildQuoteCalcInput = {
  doorHeightMm: number;
  doorWidthMm: number;
  quantity: number;
  sheetPrice: string;
  manualCostLines: DoorBuildManualCostLineInput[];
  /** Sipariş toplamı boy × katalog productionCost; kapı adediyle tekrar çarpılmaz */
  frame?: {
    unitProductionCost: string;
    totalBoyQuantity: string;
  } | null;
  frameUnresolvedMessage?: string | null;
  sideTrims?: {
    unitProductionCost: string;
    piecesPerDoor: number;
  } | null;
  sideTrimsUnresolvedMessage?: string | null;
  header?: {
    unitProductionCost: string;
    /** Kapı başına; işletme tarifi = 1 */
    piecesPerDoor: number;
  } | null;
  headerUnresolvedMessage?: string | null;
};

export type DoorBuildComponentCostBreakdownItem = {
  code: 'SURFACE_MDF' | 'FRAME' | 'SIDE_TRIMS' | 'HEADER' | 'MANUAL';
  label: string;
  status: 'RESOLVED' | 'UNRESOLVED' | 'NOT_SELECTED';
  lineTotal: string | null;
  message: string | null;
};

export type DoorBuildQuoteCalcResult = {
  surface: DoorLeafSurfaceYieldResult | null;
  surfaceStatus: 'RESOLVED' | 'UNRESOLVED';
  surfaceMessage: string | null;
  sheetPrice: string;
  unitMdfSurfaceCost: string | null;
  totalAllocatedMdfCost: string | null;
  frame: DoorBuildComponentCostState & {
    unitMeaning: typeof DOOR_FRAME_CATALOG_UNIT_MEANING;
    businessBoyNote: string;
  };
  sideTrims: DoorBuildComponentCostState;
  header: DoorBuildComponentCostState;
  manualCosts: DoorBuildManualCostLineResult[];
  manualCostsTotal: string;
  componentCostBreakdown: DoorBuildComponentCostBreakdownItem[];
  /** Bileşen toplamı (en katsayısı öncesi) */
  baseSubtotalBeforeWidthCoefficient: string;
  widthCoefficient: string | null;
  widthCoefficientStatus: 'RESOLVED' | 'UNRESOLVED';
  widthCoefficientMessage: string | null;
  /** base × widthCoefficient; unresolved ise null (0 uydurulmaz) */
  widthAdjustedSubtotal: string | null;
  /**
   * Ana ara toplam: katsayı çözüldüyse ayarlı; değilse katsayı öncesi.
   * Nihai kapı maliyeti değildir.
   */
  partialSubtotal: string;
  allSelectedComponentsResolved: boolean;
  missingSources: string[];
};

export type DoorBuildMaterialDraftRole =
  | 'YUZAY_MDF'
  | 'FRAME'
  | 'SIDE_TRIM'
  | 'HEADER'
  | 'MANUAL_PHYSICAL';

export type DoorBuildMaterialDraftLine = {
  role: DoorBuildMaterialDraftRole;
  label: string;
  productCode: string | null;
  productName: string | null;
  sizeLabel: string | null;
  thicknessMm: string | null;
  quantity: string | null;
  pieceQuantity: string | null;
  sheetQuantity: string | null;
  unitText: string | null;
  rawMaterialId: string | null;
  rawMaterialCode: string | null;
  rawMaterialName: string | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  surfaceType: string | null;
  unverified: boolean;
  note: string | null;
};

/** Eski yüzey-only önizleme; materialDraft tercih edilir. */
export type DoorBuildMaterialPreview = {
  doorSizeLabelCm: string;
  quantity: number;
  surfaceFaceQuantity: number;
  rawMaterialId: string | null;
  rawMaterialCode: string | null;
  rawMaterialName: string | null;
  thicknessMm: string | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  surfaceType: string | null;
  requiredFullSheets: number;
  componentRole: 'YUZAY_MDF';
};

export function isDoorBuildManualCostCode(
  value: string,
): value is DoorBuildManualCostCode {
  return (DOOR_BUILD_MANUAL_COST_CODES as readonly string[]).includes(value);
}

export function theoreticalSheetsPerDoorDecimal(
  rule: DoorLeafSurfaceRule,
): Decimal {
  return toDecimal(rule.facesPerDoor).div(rule.facesPerSheet);
}

export function calculateUnitMdfSurfaceCost(
  sheetPrice: string,
  rule: DoorLeafSurfaceRule,
): Decimal {
  const price = toDecimal(sheetPrice);
  if (!price.isFinite() || price.lte(0)) {
    throw new Error('Tabaka fiyatı 0’dan büyük olmalıdır.');
  }
  return price.times(theoreticalSheetsPerDoorDecimal(rule));
}

export function normalizeManualCostLines(
  lines: DoorBuildManualCostLineInput[],
): DoorBuildManualCostLineInput[] {
  const seen = new Set<string>();
  for (const line of lines) {
    if (!isDoorBuildManualCostCode(line.code)) {
      throw new Error(`Geçersiz manuel gider kodu: ${line.code}`);
    }
    if (seen.has(line.code)) {
      throw new Error(
        `${DOOR_BUILD_MANUAL_COST_LABELS[line.code]} gideri iki kez eklenemez.`,
      );
    }
    seen.add(line.code);
    if (line.scope !== 'PER_DOOR' && line.scope !== 'ORDER_TOTAL') {
      throw new Error('Manuel gider kapsamı PER_DOOR veya ORDER_TOTAL olmalıdır.');
    }
    if (line.included) {
      if (line.amount == null || String(line.amount).trim() === '') {
        throw new Error(
          `${DOOR_BUILD_MANUAL_COST_LABELS[line.code]} için tutar girilmelidir.`,
        );
      }
      const amount = toDecimal(line.amount);
      if (!amount.isFinite() || amount.lt(0)) {
        throw new Error(
          `${DOOR_BUILD_MANUAL_COST_LABELS[line.code]} tutarı 0 veya pozitif olmalıdır.`,
        );
      }
    }
  }
  return lines;
}

function scopeLabel(scope: DoorBuildManualCostScope): string {
  return scope === 'PER_DOOR' ? 'Kapı başına' : 'Sipariş toplamı';
}

export function calculateManualCostLines(
  lines: DoorBuildManualCostLineInput[],
  quantity: number,
): { lines: DoorBuildManualCostLineResult[]; total: Decimal } {
  const normalized = normalizeManualCostLines(lines);
  let total = toDecimal(0);
  const results: DoorBuildManualCostLineResult[] = [];

  for (const line of normalized) {
    const label = DOOR_BUILD_MANUAL_COST_LABELS[line.code];
    if (!line.included) {
      results.push({
        code: line.code,
        label,
        included: false,
        scope: line.scope,
        scopeLabel: scopeLabel(line.scope),
        unitAmount: null,
        lineTotal: null,
      });
      continue;
    }

    const unitAmount = toDecimal(line.amount!);
    const lineTotal =
      line.scope === 'PER_DOOR' ? unitAmount.times(quantity) : unitAmount;
    total = total.plus(lineTotal);
    results.push({
      code: line.code,
      label,
      included: true,
      scope: line.scope,
      scopeLabel: scopeLabel(line.scope),
      unitAmount: unitAmount.toFixed(),
      lineTotal: lineTotal.toFixed(),
    });
  }

  return { lines: results, total };
}

function resolveComponent(input: {
  selected: boolean;
  unresolvedMessage?: string | null;
  unitProductionCost?: string;
  unitsPerDoor?: string;
  doorQuantity: number;
}): DoorBuildComponentCostState {
  if (!input.selected) {
    return {
      status: 'NOT_SELECTED',
      unitProductionCost: null,
      unitsPerDoor: null,
      lineTotal: null,
    };
  }
  if (input.unresolvedMessage) {
    return {
      status: 'UNRESOLVED',
      message: input.unresolvedMessage,
      unitProductionCost: null,
      unitsPerDoor: input.unitsPerDoor ?? null,
      lineTotal: null,
    };
  }
  if (
    input.unitProductionCost == null ||
    input.unitsPerDoor == null ||
    String(input.unitsPerDoor).trim() === ''
  ) {
    return {
      status: 'UNRESOLVED',
      message: DOOR_FRAME_BUSINESS_BOY_NOTE,
      unitProductionCost: null,
      unitsPerDoor: input.unitsPerDoor ?? null,
      lineTotal: null,
    };
  }
  const units = toDecimal(input.unitsPerDoor);
  if (!units.isFinite() || units.lte(0)) {
    throw new Error('Kapı başına bileşen miktarı 0’dan büyük olmalıdır.');
  }
  const unitCost = toDecimal(input.unitProductionCost);
  if (!unitCost.isFinite() || unitCost.lt(0)) {
    throw new Error('Bileşen üretim maliyeti geçersiz.');
  }
  const lineTotal = unitCost.times(units).times(input.doorQuantity);
  return {
    status: 'RESOLVED',
    unitProductionCost: unitCost.toFixed(),
    unitsPerDoor: units.toFixed(),
    lineTotal: lineTotal.toFixed(),
  };
}

/**
 * Kasa: katalog birim maliyet × toplam boy.
 * Kapı adediyle tekrar çarpılmaz (çift çarpım yok).
 */
function resolveFrameComponent(input: {
  selected: boolean;
  unresolvedMessage?: string | null;
  unitProductionCost?: string;
  totalBoyQuantity?: string;
}): DoorBuildComponentCostState {
  if (!input.selected) {
    return {
      status: 'NOT_SELECTED',
      unitProductionCost: null,
      unitsPerDoor: null,
      lineTotal: null,
    };
  }
  if (input.unresolvedMessage) {
    return {
      status: 'UNRESOLVED',
      message: input.unresolvedMessage,
      unitProductionCost: null,
      unitsPerDoor: input.totalBoyQuantity ?? null,
      lineTotal: null,
    };
  }
  if (
    input.unitProductionCost == null ||
    input.totalBoyQuantity == null ||
    String(input.totalBoyQuantity).trim() === ''
  ) {
    return {
      status: 'UNRESOLVED',
      message: DOOR_BUILD_FRAME_QUANTITY_REQUIRED_MESSAGE,
      unitProductionCost: null,
      unitsPerDoor: input.totalBoyQuantity ?? null,
      lineTotal: null,
    };
  }
  const totalBoy = toDecimal(input.totalBoyQuantity);
  if (!totalBoy.isFinite() || totalBoy.lte(0)) {
    throw new Error(DOOR_BUILD_FRAME_QUANTITY_INVALID_MESSAGE);
  }
  const unitCost = toDecimal(input.unitProductionCost);
  if (!unitCost.isFinite() || unitCost.lt(0)) {
    throw new Error('Kasa üretim maliyeti geçersiz.');
  }
  return {
    status: 'RESOLVED',
    unitProductionCost: unitCost.toFixed(),
    unitsPerDoor: totalBoy.toFixed(),
    lineTotal: unitCost.times(totalBoy).toFixed(),
  };
}

/**
 * Yüzey MDF + isteğe bağlı kasa/pervaz/başlık productionCost + manuel giderler.
 * Satış fiyatı eklenmez. En katsayısı yalnız ara toplama uygulanır; fiziksel miktarları değiştirmez.
 * Yüzey kesim adedi boy bandına göredir (en değiştirmez). Boy bandı dışındaysa tabaka/yüzey uydurulmaz.
 */
export function calculateDoorBuildQuote(
  input: DoorBuildQuoteCalcInput,
): DoorBuildQuoteCalcResult {
  const widthRule = resolveDoorBuildWidthCoefficient(input.doorWidthMm);

  let surface: DoorLeafSurfaceYieldResult | null = null;
  let surfaceStatus: 'RESOLVED' | 'UNRESOLVED' = 'RESOLVED';
  let surfaceMessage: string | null = null;
  let unitMdf: Decimal | null = null;
  let totalAllocatedMdf: Decimal = toDecimal(0);

  try {
    surface = calculateDoorLeafSurfaceYield({
      doorHeightMm: input.doorHeightMm,
      doorWidthMm: input.doorWidthMm,
      quantity: input.quantity,
    });
    unitMdf = calculateUnitMdfSurfaceCost(input.sheetPrice, surface.rule);
    totalAllocatedMdf = unitMdf.times(input.quantity);
  } catch (error) {
    if (error instanceof DoorLeafSurfaceRuleMissingError) {
      surface = null;
      surfaceStatus = 'UNRESOLVED';
      surfaceMessage = DOOR_BUILD_SURFACE_RULE_MISSING_MESSAGE;
      unitMdf = null;
      totalAllocatedMdf = toDecimal(0);
    } else {
      throw error;
    }
  }

  const manual = calculateManualCostLines(
    input.manualCostLines,
    input.quantity,
  );

  const frameSelected =
    input.frame != null || Boolean(input.frameUnresolvedMessage);
  const frame = {
    ...resolveFrameComponent({
      selected: frameSelected,
      unresolvedMessage: input.frameUnresolvedMessage,
      unitProductionCost: input.frame?.unitProductionCost,
      totalBoyQuantity: input.frame?.totalBoyQuantity,
    }),
    unitMeaning: DOOR_FRAME_CATALOG_UNIT_MEANING,
    businessBoyNote: DOOR_FRAME_BUSINESS_BOY_NOTE,
  };

  const sideSelected =
    input.sideTrims != null || Boolean(input.sideTrimsUnresolvedMessage);
  const sideTrims = resolveComponent({
    selected: sideSelected,
    unresolvedMessage: input.sideTrimsUnresolvedMessage,
    unitProductionCost: input.sideTrims?.unitProductionCost,
    unitsPerDoor:
      input.sideTrims != null
        ? String(input.sideTrims.piecesPerDoor)
        : undefined,
    doorQuantity: input.quantity,
  });

  const headerSelected =
    input.header != null || Boolean(input.headerUnresolvedMessage);
  const header = resolveComponent({
    selected: headerSelected,
    unresolvedMessage: input.headerUnresolvedMessage,
    unitProductionCost: input.header?.unitProductionCost,
    unitsPerDoor:
      input.header != null ? String(input.header.piecesPerDoor) : undefined,
    doorQuantity: input.quantity,
  });

  const missingSources: string[] = [];
  if (surfaceStatus === 'UNRESOLVED' && surfaceMessage) {
    missingSources.push(surfaceMessage);
  }
  if (frame.status === 'UNRESOLVED') missingSources.push(frame.message);
  if (sideTrims.status === 'UNRESOLVED')
    missingSources.push(sideTrims.message);
  if (header.status === 'UNRESOLVED') missingSources.push(header.message);
  if (widthRule.status === 'UNRESOLVED') missingSources.push(widthRule.message);

  let basePartial = totalAllocatedMdf.plus(manual.total);
  if (frame.status === 'RESOLVED')
    basePartial = basePartial.plus(frame.lineTotal);
  if (sideTrims.status === 'RESOLVED')
    basePartial = basePartial.plus(sideTrims.lineTotal);
  if (header.status === 'RESOLVED')
    basePartial = basePartial.plus(header.lineTotal);

  const baseSubtotalBeforeWidthCoefficient = basePartial.toFixed();
  const widthAdjustedSubtotal =
    widthRule.status === 'RESOLVED'
      ? applyDoorBuildWidthCoefficient(
          baseSubtotalBeforeWidthCoefficient,
          widthRule.widthCoefficient,
        )
      : null;

  const selectedResolved =
    surfaceStatus === 'RESOLVED' &&
    (!frameSelected || frame.status === 'RESOLVED') &&
    (!sideSelected || sideTrims.status === 'RESOLVED') &&
    (!headerSelected || header.status === 'RESOLVED') &&
    widthRule.status === 'RESOLVED';

  const componentCostBreakdown: DoorBuildComponentCostBreakdownItem[] = [
    {
      code: 'SURFACE_MDF',
      label: 'MDF yüzeyi',
      status: surfaceStatus,
      lineTotal:
        surfaceStatus === 'RESOLVED' ? totalAllocatedMdf.toFixed() : null,
      message: surfaceMessage,
    },
    {
      code: 'FRAME',
      label: 'Kapı kasası',
      status: frame.status,
      lineTotal: frame.lineTotal,
      message: frame.status === 'UNRESOLVED' ? frame.message : null,
    },
    {
      code: 'SIDE_TRIMS',
      label: 'Yan pervaz',
      status: sideTrims.status,
      lineTotal: sideTrims.lineTotal,
      message: sideTrims.status === 'UNRESOLVED' ? sideTrims.message : null,
    },
    {
      code: 'HEADER',
      label: 'Başlık',
      status: header.status,
      lineTotal: header.lineTotal,
      message: header.status === 'UNRESOLVED' ? header.message : null,
    },
    {
      code: 'MANUAL',
      label: 'Manuel ek giderler',
      status: 'RESOLVED',
      lineTotal: manual.total.toFixed(),
      message: null,
    },
  ];

  return {
    surface,
    surfaceStatus,
    surfaceMessage,
    sheetPrice: toDecimal(input.sheetPrice).toFixed(),
    unitMdfSurfaceCost: unitMdf?.toFixed() ?? null,
    totalAllocatedMdfCost:
      surfaceStatus === 'RESOLVED' ? totalAllocatedMdf.toFixed() : null,
    frame,
    sideTrims,
    header,
    manualCosts: manual.lines,
    manualCostsTotal: manual.total.toFixed(),
    componentCostBreakdown,
    baseSubtotalBeforeWidthCoefficient,
    widthCoefficient: widthRule.widthCoefficient,
    widthCoefficientStatus: widthRule.status,
    widthCoefficientMessage: widthRule.message,
    widthAdjustedSubtotal,
    partialSubtotal:
      widthAdjustedSubtotal ?? baseSubtotalBeforeWidthCoefficient,
    allSelectedComponentsResolved: selectedResolved,
    missingSources,
  };
}

export function buildDoorBuildMaterialPreview(input: {
  rule: DoorLeafSurfaceRule;
  quantity: number;
  totalFaces: number;
  requiredFullSheets: number;
  rawMaterial: {
    id: string;
    code: string;
    name: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
    surfaceType: string | null;
  };
}): DoorBuildMaterialPreview {
  return {
    doorSizeLabelCm: input.rule.sizeLabelCm,
    quantity: input.quantity,
    surfaceFaceQuantity: input.totalFaces,
    rawMaterialId: input.rawMaterial.id,
    rawMaterialCode: input.rawMaterial.code,
    rawMaterialName: input.rawMaterial.name,
    thicknessMm: input.rawMaterial.thicknessMm,
    sheetWidthMm: input.rawMaterial.sheetWidthMm,
    sheetLengthMm: input.rawMaterial.sheetLengthMm,
    surfaceType: input.rawMaterial.surfaceType,
    requiredFullSheets: input.requiredFullSheets,
    componentRole: 'YUZAY_MDF',
  };
}

export const DOOR_BUILD_MATERIAL_PREVIEW_FORBIDDEN_KEYS = [
  'sheetPrice',
  'unitMdfSurfaceCost',
  'totalAllocatedMdfCost',
  'partialSubtotal',
  'baseSubtotalBeforeWidthCoefficient',
  'widthAdjustedSubtotal',
  'manualCostsTotal',
  'unitProductionCost',
  'cashPrice',
  'cardInstallmentPrice',
  'unitPrice',
  'profit',
  'profitAmount',
  'profitRate',
  'vatAmount',
  'vatRate',
  'cashSale',
  'cardSale',
  'cardMarkupRate',
  'beforeVat',
  'productionCost',
  'productionBase',
] as const;

export function assertNoPriceLeakage(value: unknown): void {
  const forbidden = new Set<string>(DOOR_BUILD_MATERIAL_PREVIEW_FORBIDDEN_KEYS);
  const found: string[] = [];
  walk(value, forbidden, found);
  if (found.length > 0) {
    throw new Error(`Malzeme taslağında fiyat alanı var: ${found.join(', ')}`);
  }
}

function walk(
  value: unknown,
  forbidden: Set<string>,
  found: string[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, forbidden, found);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) found.push(key);
      walk(child, forbidden, found);
    }
  }
}
