import {
  assertWorkshopHasNoPriceFields,
  renderWorkshopPrintHtml,
  type WorkshopMaterialRow,
  type WorkshopPrintModel,
} from '../order-documents/order-print';
import type { DoorBuildMaterialDraftLine } from '../../calculation-engine/calculators/door-build-quote';

export const DOOR_BUILD_DRAFT_ORDER_NUMBER = 'TASLAK';

export type DoorBuildOrderUpsertPayload = {
  customerName: string;
  customerAddress?: string;
  taxOffice?: string;
  customerPhone?: string;
  taxNumber?: string;
  documentDateText?: string;
  vatRate: string;
  lines: Array<{
    kind: 'FREE_TEXT';
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
    priceSource: 'ENTERED';
  }>;
  manualMaterials: Array<{
    lineNo: number;
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
  }>;
};

export type DoorBuildQuoteTransferSource = {
  doorHeightMm: number;
  doorWidthMm: number;
  doorSizeLabelCm: string;
  quantity: number;
  widthCoefficient?: string | null;
  widthCoefficientStatus?: 'RESOLVED' | 'UNRESOLVED';
  sale?: {
    cashSale?: string | null;
    cardSale?: string | null;
    profitRate?: string | null;
    vatRate?: string | null;
    cardMarkupRate?: string | null;
  } | null;
  rawMaterial: {
    id: string;
    name: string;
    thicknessMm: string;
    surfaceType: string | null;
  };
  totalFaces?: number | null;
  requiredFullSheets?: number | null;
  surfaceStatus?: 'RESOLVED' | 'UNRESOLVED';
  surfaceMessage?: string | null;
  catalogNote?: string | null;
  frame: {
    status: string;
    selection?: unknown;
    displayName?: string | null;
    ruleSource?: string | null;
    boyQuantityPerDoor?: string | null;
    totalBoyQuantity?: string | null;
    selectedProduct?: { productCode: string; productName: string } | null;
    selectedSize?: {
      widthMm: number;
      lengthMm: number;
      sizeLabelCm: string;
    } | null;
  };
  sideTrims: {
    status: string;
    selection?: unknown;
    displayName?: string | null;
    piecesPerDoor?: number | null;
    totalPieces?: string | null;
  };
  header: {
    status: string;
    selection?: unknown;
    displayName?: string | null;
    piecesPerDoor?: number | null;
    totalPieces?: string | null;
  };
  materialDraft: DoorBuildMaterialDraftLine[];
  missingSources: string[];
};

function emptyToUndefined(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function materialName(line: DoorBuildMaterialDraftLine): string {
  if (line.rawMaterialName?.trim()) return line.rawMaterialName.trim();
  if (line.productName?.trim() && line.sizeLabel?.trim()) {
    return `${line.productName.trim()} ${line.sizeLabel.trim()}`;
  }
  if (line.productName?.trim()) return line.productName.trim();
  return line.label;
}

/** Doğrulanmış miktarı olan satırlar sipariş manuel malzemesine dönüşür; sahte 0 üretilmez. */
export function materialDraftToManualMaterials(
  draft: DoorBuildMaterialDraftLine[],
  lineNo = 1,
): {
  manuals: DoorBuildOrderUpsertPayload['manualMaterials'];
  skippedUnverified: string[];
} {
  const manuals: DoorBuildOrderUpsertPayload['manualMaterials'] = [];
  const skippedUnverified: string[] = [];

  for (const line of draft) {
    const qty = emptyToUndefined(line.quantity);
    if (line.unverified || qty == null) {
      skippedUnverified.push(
        line.note?.trim() ||
          `${line.label}: doğrulanmış miktar yok; siparişe miktar aktarılmadı.`,
      );
      continue;
    }
    manuals.push({
      lineNo,
      rawMaterialId: line.rawMaterialId ?? undefined,
      materialNameText: materialName(line),
      thicknessMm: emptyToUndefined(line.thicknessMm),
      sheetWidthMm: line.sheetWidthMm ?? undefined,
      sheetLengthMm: line.sheetLengthMm ?? undefined,
      surfaceType: emptyToUndefined(line.surfaceType),
      quantity: qty,
      pieceQuantity: emptyToUndefined(line.pieceQuantity),
      sheetQuantity: emptyToUndefined(line.sheetQuantity),
      unitText: emptyToUndefined(line.unitText) ?? 'ADET',
      componentRole: line.role,
      note: emptyToUndefined(line.note),
      unverified: false,
    });
  }

  return { manuals, skippedUnverified };
}

export function buildDoorBuildOrderUpsert(input: {
  quote: DoorBuildQuoteTransferSource;
  unitPrice: string;
  discountRate: string;
  vatRate: string;
  customerName: string;
  customerAddress?: string;
  taxOffice?: string;
  customerPhone?: string;
  taxNumber?: string;
  documentDateText?: string;
  salePriceSource?: 'CASH' | 'CARD' | 'MANUAL';
}): { upsert: DoorBuildOrderUpsertPayload; warnings: string[] } {
  const { manuals, skippedUnverified } = materialDraftToManualMaterials(
    input.quote.materialDraft,
    1,
  );

  // OrderDocuments productionNote MaxLength(400) — özet kısa tutulur; detay malzeme satırlarında.
  const noteParts: string[] = [
    `Kapı İmalatı · ${input.quote.doorSizeLabelCm} cm · ${input.quote.quantity} kapı`,
    `En: ${input.quote.doorWidthMm} mm`,
  ];
  if (input.quote.widthCoefficient) {
    noteParts.push(`En katsayısı: x${input.quote.widthCoefficient}`);
  } else if (input.quote.widthCoefficientStatus === 'UNRESOLVED') {
    noteParts.push('En katsayısı: doğrulanmamış');
  }
  if (input.salePriceSource) {
    noteParts.push(`Satış: ${input.salePriceSource}`);
  }
  if (
    input.quote.totalFaces != null &&
    input.quote.requiredFullSheets != null
  ) {
    noteParts.push(
      `MDF ${input.quote.totalFaces} yüzey/${input.quote.requiredFullSheets} tabaka`,
    );
  }
  if (input.quote.frame.status !== 'NOT_SELECTED') {
    const frameBits = [
      `Kasa ${input.quote.frame.selectedSize?.sizeLabelCm ?? ''}`.trim(),
    ];
    if (input.quote.frame.totalBoyQuantity) {
      frameBits.push(`${input.quote.frame.totalBoyQuantity} boy`);
    }
    if (input.quote.frame.status !== 'RESOLVED') {
      frameBits.push(input.quote.frame.status);
    }
    noteParts.push(frameBits.filter(Boolean).join(' '));
  }
  if (input.quote.sideTrims.status !== 'NOT_SELECTED') {
    noteParts.push(
      `Pervaz ${input.quote.sideTrims.totalPieces ?? '?'} adet${
        input.quote.sideTrims.status !== 'RESOLVED'
          ? ` (${input.quote.sideTrims.status})`
          : ''
      }`,
    );
  }
  if (input.quote.header.status !== 'NOT_SELECTED') {
    noteParts.push(
      `Başlık ${input.quote.header.totalPieces ?? '?'} adet${
        input.quote.header.status !== 'RESOLVED'
          ? ` (${input.quote.header.status})`
          : ''
      }`,
    );
  }
  if (skippedUnverified.length > 0) {
    noteParts.push(`Doğrulanamadı: ${skippedUnverified.length}`);
  }
  if (input.quote.missingSources.length > 0) {
    noteParts.push(`Eksik: ${input.quote.missingSources.length}`);
  }

  let productionNote = noteParts.join(' · ');
  if (productionNote.length > 400) {
    productionNote = `${productionNote.slice(0, 397)}...`;
  }

  const upsert: DoorBuildOrderUpsertPayload = {
    customerName: input.customerName.trim(),
    customerAddress: emptyToUndefined(input.customerAddress),
    taxOffice: emptyToUndefined(input.taxOffice),
    customerPhone: emptyToUndefined(input.customerPhone),
    taxNumber: emptyToUndefined(input.taxNumber),
    documentDateText: emptyToUndefined(input.documentDateText),
    vatRate: input.vatRate.replace(',', '.'),
    lines: [
      {
        kind: 'FREE_TEXT',
        productNameText: `Kapı İmalatı ${input.quote.doorSizeLabelCm} cm`,
        widthMm: String(input.quote.doorWidthMm),
        lengthMm: String(input.quote.doorHeightMm),
        thicknessMm: input.quote.rawMaterial.thicknessMm,
        decorText: emptyToUndefined(input.quote.rawMaterial.surfaceType),
        productionNote,
        quantity: String(input.quote.quantity),
        unitText: 'ADET',
        discountRate: input.discountRate.replace(',', '.') || '0',
        unitPrice: input.unitPrice.replace(',', '.'),
        priceSource: 'ENTERED',
      },
    ],
    // lineNo=1 → OrderDocuments otomatik RECIPE resolver'ı atlar (çift malzeme yok).
    manualMaterials: manuals,
  };

  return {
    upsert,
    warnings: [...skippedUnverified, ...input.quote.missingSources],
  };
}

export function materialDraftToWorkshopMaterials(
  draft: DoorBuildMaterialDraftLine[],
): WorkshopMaterialRow[] {
  return draft.map((line) => ({
    source: 'MANUAL' as const,
    lineNo: 1,
    rawMaterialId: line.rawMaterialId,
    componentRole: line.role,
    materialNameText: materialName(line),
    thicknessMm: line.thicknessMm,
    sheetWidthMm: line.sheetWidthMm,
    sheetLengthMm: line.sheetLengthMm,
    surfaceType: line.surfaceType,
    quantity: line.unverified ? null : line.quantity,
    pieceQuantity: line.unverified ? null : line.pieceQuantity,
    sheetQuantity: line.unverified ? null : line.sheetQuantity,
    unitText: line.unitText,
    note: line.note,
    unverified: line.unverified,
  }));
}

export function buildDoorBuildWorkshopPreview(input: {
  quote: DoorBuildQuoteTransferSource;
  documentDateText?: string | null;
}): { model: WorkshopPrintModel; html: string } {
  const infoParts: string[] = [];
  if (input.quote.widthCoefficient) {
    infoParts.push(`En Katsayısı: x${input.quote.widthCoefficient}`);
  }

  const warningParts: string[] = [];
  for (const line of input.quote.materialDraft) {
    if (line.unverified && line.note) warningParts.push(line.note);
  }
  for (const msg of input.quote.missingSources) warningParts.push(msg);

  const noteParts = [...infoParts, ...warningParts];

  const model: WorkshopPrintModel = {
    orderNumber: DOOR_BUILD_DRAFT_ORDER_NUMBER,
    documentDateText: input.documentDateText ?? null,
    lines: [
      {
        lineNo: 1,
        productNameText: `Kapı İmalatı ${input.quote.doorSizeLabelCm} cm`,
        productKindText: 'Kapı İmalatı (taslak)',
        sizeText: `${input.quote.doorWidthMm}×${input.quote.doorHeightMm} mm`,
        thicknessText: `${input.quote.rawMaterial.thicknessMm} mm`,
        decorText: input.quote.rawMaterial.surfaceType,
        productionNote: noteParts.length > 0 ? noteParts.join(' · ') : null,
        quantity: String(input.quote.quantity),
        unitText: 'ADET',
        materialMessage:
          warningParts.length > 0
            ? 'Eksik / doğrulanmamış malzeme var'
            : null,
      },
    ],
    materials: materialDraftToWorkshopMaterials(input.quote.materialDraft),
  };

  assertWorkshopHasNoPriceFields(model);
  const html = renderWorkshopPrintHtml(model);
  return { model, html };
}
