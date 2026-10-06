import { readFileSync } from 'fs';
import { join } from 'path';
import { toDecimal } from '../../common/decimal/decimal.util';
import { formatDocumentTitle, ZIRVE_LETTERHEAD } from './order-letterhead';
import { materialIdentityKey } from './order-material-plan';
import {
  formatOrderMoney,
  formatOrderQuantity,
  formatPercent,
  ORDER_LINES_PER_PAGE,
  paginateOrderLines,
} from './order-totals';

export type CustomerPrintLine = {
  lineNo: number;
  productNameText: string;
  quantity: string;
  unitText: string;
  discountRate: string;
  unitPrice: string;
  lineAmount: string;
};

export type CustomerPrintModel = {
  documentDateText: string | null;
  customerName: string;
  customerAddress: string | null;
  taxOffice: string | null;
  customerPhone: string | null;
  taxNumber: string | null;
  lines: CustomerPrintLine[];
  grossTotal: string;
  discountAmount: string;
  netTotal: string;
  vatLabel: string;
  vatAmount: string;
  grandTotal: string;
};

export type WorkshopPrintLine = {
  lineNo: number;
  productNameText: string;
  productKindText: string | null;
  sizeText: string | null;
  thicknessText: string | null;
  decorText: string | null;
  productionNote: string | null;
  quantity: string;
  unitText: string;
  materialMessage: string | null;
};

export type WorkshopMaterialRow = {
  source: 'RECIPE' | 'MANUAL';
  lineNo: number | null;
  rawMaterialId: string | null;
  componentRole: string | null;
  materialNameText: string;
  thicknessMm: string | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  surfaceType: string | null;
  quantity: string | null;
  pieceQuantity: string | null;
  sheetQuantity: string | null;
  unitText: string | null;
  note: string | null;
  unverified: boolean;
};

export type WorkshopPrintModel = {
  orderNumber: string;
  documentDateText: string | null;
  lines: WorkshopPrintLine[];
  materials: WorkshopMaterialRow[];
};

const WORKSHOP_FORBIDDEN_KEYS = [
  'unitPrice',
  'lineAmount',
  'lineDiscountAmount',
  'discountRate',
  'discountAmount',
  'vatRate',
  'vatAmount',
  'vatLabel',
  'grossTotal',
  'netTotal',
  'grandTotal',
  'unitCashPrice',
  'unitCardPrice',
  'productionCost',
  'unitProductionCost',
  'profit',
  'profitAmount',
  'profitRate',
  'cardMarkupRate',
  'cashSale',
  'cardSale',
  'beforeVat',
  'widthAdjustedSubtotal',
  'baseSubtotalBeforeWidthCoefficient',
  'partialSubtotal',
  'unitCost',
  'sheetPrice',
  'cashPrice',
  'cardInstallmentPrice',
  'priceSource',
] as const;

export function assertWorkshopHasNoPriceFields(value: unknown): void {
  const found = collectForbiddenKeys(value, new Set(WORKSHOP_FORBIDDEN_KEYS));
  if (found.length > 0) {
    throw new Error(`Atölye çıktısında fiyat alanı var: ${found.join(', ')}`);
  }
}

function collectForbiddenKeys(value: unknown, forbidden: Set<string>, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenKeys(item, forbidden, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) found.push(key);
      collectForbiddenKeys(child, forbidden, found);
    }
  }
  return found;
}

let logoDataUri: string | null = null;

function zirveLogoSrc(): string {
  if (logoDataUri) return logoDataUri;
  const candidates = [
    join(__dirname, 'brand', 'zirve-logo.jpeg'),
    join(process.cwd(), 'src', 'modules', 'order-documents', 'brand', 'zirve-logo.jpeg'),
    join(process.cwd(), 'dist', 'modules', 'order-documents', 'brand', 'zirve-logo.jpeg'),
    join(process.cwd(), 'dist', 'src', 'modules', 'order-documents', 'brand', 'zirve-logo.jpeg'),
  ];
  const path = candidates.find((candidate) => {
    try {
      readFileSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
  if (!path) {
    throw new Error('Zirve Ahşap logosu bulunamadı.');
  }
  const bytes = readFileSync(path);
  logoDataUri = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  return logoDataUri;
}

export function renderCustomerPrintHtml(model: CustomerPrintModel): string {
  const pages = paginateOrderLines(model.lines);
  const body = pages
    .map((pageLines, index) =>
      renderCustomerPage(model, pageLines, index === pages.length - 1),
    )
    .join('');
  return htmlDocument(formatDocumentTitle(model.documentDateText), customerCss(), body);
}

export function renderWorkshopPrintHtml(model: WorkshopPrintModel): string {
  assertWorkshopHasNoPriceFields(model);
  const pages = paginateOrderLines(model.lines);
  const body = pages
    .map((pageLines, index) =>
      renderWorkshopPage(model, pageLines, index === pages.length - 1),
    )
    .join('');
  return htmlDocument(`Üretim formu ${escapeHtml(model.orderNumber)}`, workshopCss(), body);
}

/**
 * Tek document: kısa/orta siparişte tek A4’te müşteri + kesim boşluğu + üretim;
 * sığmayan uzun siparişte kontrollü devam sayfaları (paginateOrderLines).
 * Aynı sipariş snapshot'ından üretilir; ikinci nüsha müşteri kopyası yoktur.
 */
export function renderCombinedPrintHtml(
  customer: CustomerPrintModel,
  workshop: WorkshopPrintModel,
): string {
  assertWorkshopHasNoPriceFields(workshop);
  const customerChunks = paginateOrderLines(customer.lines);
  const workshopChunks = paginateOrderLines(workshop.lines);

  // Kısa form: her iki bölüm de tek chunk → tek A4 birleşik sayfa
  if (customerChunks.length === 1 && workshopChunks.length === 1) {
    const body = renderCombinedA4Sheet(
      customer,
      customerChunks[0],
      workshop,
      workshopChunks[0],
    );
    return htmlDocument(
      formatDocumentTitle(customer.documentDateText),
      combinedCss(),
      body,
    );
  }

  // Uzun form: müşteri devam sayfaları, sonra üretim devam sayfaları (A4)
  const customerPages = customerChunks
    .map((pageLines, index, all) =>
      renderCustomerPage(customer, pageLines, index === all.length - 1),
    )
    .join('');
  const workshopPages = workshopChunks
    .map((pageLines, index, all) =>
      renderWorkshopPage(workshop, pageLines, index === all.length - 1),
    )
    .join('');
  const body =
    `<div class="combined-section" data-section="customer">${customerPages}</div>` +
    `<div class="combined-section" data-section="workshop">${workshopPages}</div>`;
  return htmlDocument(
    formatDocumentTitle(customer.documentDateText),
    `${customerCss()}\n${workshopCss()}`,
    body,
  );
}

/** Tek A4 müşteri sayfası (çift nüsha yok). */
function renderCustomerPage(
  model: CustomerPrintModel,
  pageLines: CustomerPrintLine[],
  showTotals: boolean,
): string {
  const form = renderCustomerForm(model, pageLines, showTotals);
  return `<section class="sheet" data-section="customer">${form}</section>`;
}

/** Kısa sipariş: üst müşteri, orta kesim boşluğu, alt üretim — tek A4. */
function renderCombinedA4Sheet(
  customer: CustomerPrintModel,
  customerLines: CustomerPrintLine[],
  workshop: WorkshopPrintModel,
  workshopLines: WorkshopPrintLine[],
): string {
  return `<section class="sheet a4-combined">
    <div class="a4-customer" data-section="customer">${renderCustomerForm(customer, customerLines, true, { compact: true })}</div>
    <div class="cut-gap" aria-hidden="true">
      <span class="cut-gap-line"></span>
      <span class="cut-gap-label">✂ kes</span>
      <span class="cut-gap-line"></span>
    </div>
    <div class="a4-workshop" data-section="workshop">${renderWorkshopForm(workshop, workshopLines, true)}</div>
  </section>`;
}

function renderCustomerForm(
  model: CustomerPrintModel,
  pageLines: CustomerPrintLine[],
  showTotals: boolean,
  options?: { compact?: boolean },
): string {
  const padTo = options?.compact
    ? Math.max(pageLines.length, Math.min(4, ORDER_LINES_PER_PAGE))
    : ORDER_LINES_PER_PAGE;
  const rows = paddedRows(pageLines, padTo)
    .map((line) => {
      if (!line) {
        return `<tr>
          <td></td><td></td><td></td><td>ADET</td><td></td><td></td><td></td>
        </tr>`;
      }
      return `<tr>
        <td class="center">${line.lineNo}</td>
        <td class="name">${escapeHtml(line.productNameText)}</td>
        <td class="center">${escapeHtml(formatOrderQuantity(line.quantity))}</td>
        <td class="center">${escapeHtml(line.unitText)}</td>
        <td class="center">${escapeHtml(formatPercent(line.discountRate))}</td>
        <td class="money">${escapeHtml(formatOrderMoney(line.unitPrice))}</td>
        <td class="money">${escapeHtml(formatOrderMoney(line.lineAmount))}</td>
      </tr>`;
    })
    .join('');

  const totals = showTotals
    ? `<table class="totals">
        <tr><th>GENEL TOPLAM</th><td>${escapeHtml(formatOrderMoney(model.grossTotal))}</td></tr>
        <tr><th>İSKONTO</th><td>${escapeHtml(formatOrderMoney(model.discountAmount))}</td></tr>
        <tr><th>ARA TOPLAM</th><td>${escapeHtml(formatOrderMoney(model.netTotal))}</td></tr>
        <tr><th>${escapeHtml(model.vatLabel)}</th><td>${escapeHtml(formatOrderMoney(model.vatAmount))}</td></tr>
        <tr><th>YENİ TOPLAM</th><td>${escapeHtml(formatOrderMoney(model.grandTotal))}</td></tr>
      </table>`
    : '';

  return `<article class="form">
    <header class="letterhead">
      <img class="logo" alt="Zirve Ahşap" src="${zirveLogoSrc()}" />
      <div class="identity">
        <div class="doc-title">${escapeHtml(formatDocumentTitle(model.documentDateText))}</div>
        <div class="company">${escapeHtml(ZIRVE_LETTERHEAD.companyName)}</div>
        <div>${escapeHtml(ZIRVE_LETTERHEAD.address)}</div>
        <div class="phone">${escapeHtml(ZIRVE_LETTERHEAD.phone)}</div>
      </div>
      <img class="logo" alt="" src="${zirveLogoSrc()}" />
    </header>
    <table class="party">
      <tr><th>FİRMA</th><td colspan="3">${escapeHtml(model.customerName)}</td></tr>
      <tr><th>ADRES</th><td colspan="3">${escapeHtml(model.customerAddress ?? '')}</td></tr>
      <tr><th>V.D.</th><td>${escapeHtml(model.taxOffice ?? '')}</td><th>TEL. :</th><td>${escapeHtml(model.customerPhone ?? '')}</td></tr>
      <tr><th>VERGİ NO</th><td colspan="3">${escapeHtml(model.taxNumber ?? '')}</td></tr>
    </table>
    <table class="lines">
      <colgroup>
        <col style="width:6%" />
        <col style="width:36%" />
        <col style="width:9%" />
        <col style="width:8%" />
        <col style="width:8%" />
        <col style="width:16%" />
        <col style="width:17%" />
      </colgroup>
      <thead>
        <tr>
          <th>S.NO</th>
          <th>ÜRÜN ADI</th>
          <th>MİKTAR</th>
          <th>BİRİM</th>
          <th style="width:8%">İSK.%</th>
          <th style="width:16%">BİRİM FİYATI</th>
          <th style="width:17%">TUTAR</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${totals}
  </article>`;
}

function renderWorkshopPage(
  model: WorkshopPrintModel,
  pageLines: WorkshopPrintLine[],
  showMaterials: boolean,
): string {
  return `<section class="sheet workshop" data-section="workshop">${renderWorkshopForm(model, pageLines, showMaterials)}</section>`;
}

function renderWorkshopForm(
  model: WorkshopPrintModel,
  pageLines: WorkshopPrintLine[],
  showMaterials: boolean,
): string {
  const rows = pageLines
    .map(
      (line) => `<tr>
        <td class="center">${line.lineNo}</td>
        <td>${escapeHtml(line.productNameText)}</td>
        <td>${escapeHtml(line.productKindText ?? '')}</td>
        <td>${escapeHtml(line.sizeText ?? '')}</td>
        <td>${escapeHtml(line.thicknessText ?? '')}</td>
        <td>${escapeHtml(line.decorText ?? '')}</td>
        <td>${escapeHtml(line.productionNote ?? '')}</td>
        <td class="center">${escapeHtml(formatOrderQuantity(line.quantity))}</td>
        <td class="center">${escapeHtml(line.unitText)}</td>
        <td>${escapeHtml(line.materialMessage ?? '')}</td>
      </tr>`,
    )
    .join('');

  const materials = showMaterials ? renderMaterialTable(model.materials) : '';

  return `<header class="workshop-head">
      <img class="logo" alt="Zirve Ahşap" src="${zirveLogoSrc()}" />
      <div>
        <div class="company">${escapeHtml(ZIRVE_LETTERHEAD.companyName)}</div>
        <div class="doc-title">ÜRETİM FORMU</div>
        <div>Sipariş no: ${escapeHtml(model.orderNumber)}</div>
        ${
          model.documentDateText?.trim()
            ? `<div>D.T: ${escapeHtml(model.documentDateText.trim())}</div>`
            : ''
        }
      </div>
    </header>
    <table class="lines">
      <thead>
        <tr>
          <th>S.NO</th>
          <th>ÜRÜN ADI</th>
          <th>MODEL / TÜR</th>
          <th>ÖLÇÜ</th>
          <th>KALINLIK</th>
          <th>DEKOR / RENK</th>
          <th>ÜRETİM NOTU</th>
          <th>MİKTAR</th>
          <th>BİRİM</th>
          <th>MALZEME</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${materials}`;
}

function renderMaterialTable(materials: WorkshopMaterialRow[]): string {
  if (materials.length === 0) {
    return '<p class="warn">Malzeme miktarı doğrulanamadı.</p>';
  }
  const rows = materials
    .map((item) => {
      const sheet = sheetLabel(item);
      const source = materialSourceLabel(item);
      return `<tr>
        <td>${item.lineNo ?? ''}</td>
        <td>${escapeHtml(roleLabel(item.componentRole))}</td>
        <td>${escapeHtml(item.materialNameText)}</td>
        <td>${escapeHtml(item.thicknessMm ?? '')}</td>
        <td>${escapeHtml(sheet)}</td>
        <td>${escapeHtml(item.surfaceType ?? '')}</td>
        <td>${escapeHtml(amountText(item.pieceQuantity ?? item.quantity, item.unverified))}</td>
        <td>${escapeHtml(amountText(item.sheetQuantity, item.unverified))}</td>
        <td>${escapeHtml(item.unitText ?? '')}</td>
        <td>${escapeHtml(source)}</td>
        <td>${escapeHtml(item.note ?? '')}</td>
      </tr>`;
    })
    .join('');
  return `<h2>Ürün bazlı malzeme listesi</h2>
    <table class="lines">
      <thead>
        <tr>
          <th>Satır</th><th>Parça</th><th>Malzeme</th><th>Kalınlık mm</th><th>Tabaka ebadı</th>
          <th>Yüzey</th><th>Parça adedi</th><th>Tabaka ihtiyacı</th><th>Birim</th><th>Kaynak</th><th>Not</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${renderMaterialSummary(materials)}`;
}

function renderMaterialSummary(materials: WorkshopMaterialRow[]): string {
  const buckets = new Map<
    string,
    {
      name: string;
      thickness: string;
      sheet: string;
      surface: string;
      unit: string;
      pieces: ReturnType<typeof toDecimal>;
      sheets: ReturnType<typeof toDecimal> | null;
    }
  >();
  for (const item of materials) {
    if (item.unverified) continue;
    const piece = item.pieceQuantity ?? item.quantity;
    if (!piece || !item.unitText) continue;
    const key = `${materialIdentityKey(item)}|${item.unitText}`;
    const current = buckets.get(key);
    const pieceQty = toDecimal(piece);
    const sheetQty = item.sheetQuantity ? toDecimal(item.sheetQuantity) : null;
    if (!current) {
      buckets.set(key, {
        name: item.materialNameText,
        thickness: item.thicknessMm ?? '',
        sheet: sheetLabel(item),
        surface: item.surfaceType ?? '',
        unit: item.unitText,
        pieces: pieceQty,
        sheets: sheetQty,
      });
      continue;
    }
    current.pieces = current.pieces.plus(pieceQty);
    if (current.sheets && sheetQty) current.sheets = current.sheets.plus(sheetQty);
    else current.sheets = null;
  }
  if (buckets.size === 0) return '';
  const rows = [...buckets.values()]
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.thickness)}</td>
        <td>${escapeHtml(item.sheet)}</td>
        <td>${escapeHtml(item.surface)}</td>
        <td>${escapeHtml(formatOrderQuantity(item.pieces))}</td>
        <td>${escapeHtml(item.sheets ? formatOrderQuantity(item.sheets) : '')}</td>
        <td>${escapeHtml(item.unit)}</td>
      </tr>`,
    )
    .join('');
  return `<h2>Malzeme özeti</h2>
    <p>Aynı malzeme kimliği ve birimi toplanır. Kalınlık, tabaka ebadı veya yüzey farklıysa satırlar ayrı kalır. Tabaka hücresi boşsa tabaka ihtiyacı doğrulanmamıştır.</p>
    <table class="lines">
      <thead>
        <tr>
          <th>Malzeme</th><th>Kalınlık mm</th><th>Tabaka ebadı</th><th>Yüzey</th>
          <th>Parça toplamı</th><th>Tabaka toplamı</th><th>Birim</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function sheetLabel(item: { sheetWidthMm: number | null; sheetLengthMm: number | null }): string {
  if (item.sheetWidthMm == null || item.sheetLengthMm == null) return '';
  return `${item.sheetWidthMm}×${item.sheetLengthMm} mm`;
}

function amountText(value: string | null, unverified: boolean): string {
  if (unverified || value == null || value.trim() === '') return '';
  return formatOrderQuantity(value);
}

function materialSourceLabel(item: WorkshopMaterialRow): string {
  if (item.unverified) return 'Doğrulanamadı';
  return item.source === 'MANUAL' ? 'Manuel' : 'Otomatik';
}

function roleLabel(role: string | null): string {
  if (role === 'ANA_PARCA') return 'Ana parça';
  if (role === 'IKINCI_PARCA') return 'İkinci parça';
  if (role === 'KILCIK') return 'Kılçık';
  if (role === 'RECETE') return 'Reçete';
  if (role === 'MANUEL') return 'Manuel';
  if (role === 'YUZAY_MDF') return 'MDF yüzeyi';
  if (role === 'FRAME') return 'Kapı kasası';
  if (role === 'SIDE_TRIM') return 'Yan pervaz';
  if (role === 'HEADER') return 'Başlık';
  if (role === 'MANUAL_PHYSICAL') return 'Manuel malzeme';
  return role ?? '';
}

function paddedRows(
  lines: CustomerPrintLine[],
  minRows: number = ORDER_LINES_PER_PAGE,
): Array<CustomerPrintLine | null> {
  const rows: Array<CustomerPrintLine | null> = [...lines];
  while (rows.length < minRows) rows.push(null);
  return rows;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlDocument(title: string, css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${css}
    .print-bar { margin: 0 0 8px; }
    .print-bar button { font: inherit; padding: 6px 10px; }
    @media print { .print-bar { display: none; } }
  </style>
</head>
<body>
  <div class="print-bar"><button type="button" onclick="window.print()">Yazdır / PDF kaydet</button><span> Açılan pencerede hedef olarak PDF kaydetmeyi seçin.</span></div>
  ${body}
</body>
</html>`;
}

function customerCss(): string {
  return `
    @page { size: A4 portrait; margin: 8mm 8mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #000; font-family: Calibri, "Segoe UI", sans-serif; font-size: 9px; }
    .sheet { width: 100%; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .form { border: 1px solid #000; margin: 0; padding: 3mm 3.5mm; break-inside: avoid; page-break-inside: avoid; }
    .letterhead { display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; gap: 4px; text-align: center; }
    .logo { width: 46px; height: auto; justify-self: center; }
    .identity { min-width: 0; }
    .doc-title { font-size: 11px; font-weight: 700; line-height: 1.2; }
    .company { font-size: 12px; font-weight: 700; margin-top: 1px; }
    .address, .phone { line-height: 1.2; overflow-wrap: anywhere; }
    .phone { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; line-height: 1.25; }
    .party { margin-top: 2.5mm; }
    .party th, .party td { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .party th { width: 56px; text-align: left; font-weight: 700; }
    .lines { margin-top: 2.5mm; table-layout: fixed; }
    .lines th { text-align: center; font-weight: 700; font-size: 8.5px; }
    .lines td { font-size: 9px; }
    .lines td.name { text-align: left; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .center { text-align: center; }
    .money { text-align: right; white-space: nowrap; }
    .totals { width: 48%; max-width: 72mm; margin-left: auto; margin-top: 2.5mm; page-break-inside: avoid; break-inside: avoid; }
    .totals th { text-align: left; font-weight: 700; }
    .totals td { text-align: right; font-weight: 700; white-space: nowrap; }
  `;
}

function workshopCss(): string {
  return `
    @page { size: A4 portrait; margin: 8mm 8mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #000; font-family: Calibri, "Segoe UI", sans-serif; font-size: 9px; }
    .sheet { width: 100%; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .workshop-head { display: flex; gap: 8px; align-items: center; margin-bottom: 3mm; }
    .logo { width: 52px; height: auto; }
    .company { font-size: 13px; font-weight: 700; }
    .doc-title { font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #000; padding: 2px 3px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    th { text-align: left; font-size: 8.5px; }
    .center { text-align: center; }
    h2 { font-size: 11px; margin: 3mm 0 1.5mm; page-break-after: avoid; }
    .warn { font-weight: 700; }
    .lines { page-break-inside: auto; }
    .lines tr { page-break-inside: avoid; break-inside: avoid; }
  `;
}

/** Kısa sipariş birleşik A4: üst müşteri, orta kesim boşluğu, alt üretim. */
function combinedCss(): string {
  return `
    @page { size: A4 portrait; margin: 6mm 7mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #000; font-family: Calibri, "Segoe UI", sans-serif; font-size: 7.5px; }
    .sheet.a4-combined {
      width: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      page-break-after: auto;
      break-after: auto;
    }
    .a4-customer { flex: 0 0 auto; }
    .a4-workshop { flex: 0 0 auto; }
    .cut-gap {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 4mm;
      margin: 3.5mm 0;
      padding: 2mm 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .cut-gap-line {
      flex: 1 1 auto;
      border-top: 1.5px dashed #666;
      height: 0;
    }
    .cut-gap-label {
      flex: 0 0 auto;
      font-size: 8px;
      color: #555;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .form { border: 1px solid #000; margin: 0; padding: 1.5mm 2mm; }
    .letterhead { display: grid; grid-template-columns: 34px 1fr 34px; align-items: center; gap: 2px; text-align: center; }
    .logo { width: 32px; height: auto; justify-self: center; }
    .a4-workshop .logo { width: 36px; }
    .identity { min-width: 0; }
    .doc-title { font-size: 9px; font-weight: 700; line-height: 1.15; }
    .company { font-size: 10px; font-weight: 700; margin-top: 0; }
    .address, .phone { line-height: 1.15; overflow-wrap: anywhere; }
    .phone { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 1px 2px; vertical-align: middle; line-height: 1.15; }
    .party { margin-top: 1.2mm; }
    .party th, .party td { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .party th { width: 48px; text-align: left; font-weight: 700; }
    .lines { margin-top: 1.2mm; table-layout: fixed; }
    .lines th { text-align: center; font-weight: 700; font-size: 7px; }
    .lines td { font-size: 7.5px; }
    .lines td.name { text-align: left; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .center { text-align: center; }
    .money { text-align: right; white-space: nowrap; }
    .totals { width: 46%; max-width: 58mm; margin-left: auto; margin-top: 1.2mm; }
    .totals th { text-align: left; font-weight: 700; }
    .totals td { text-align: right; font-weight: 700; white-space: nowrap; }
    .workshop-head { display: flex; gap: 6px; align-items: center; margin-bottom: 1.5mm; }
    .a4-workshop .company { font-size: 10px; font-weight: 700; }
    .a4-workshop .doc-title { font-size: 9px; font-weight: 700; }
    .a4-workshop table { table-layout: fixed; }
    .a4-workshop th, .a4-workshop td { vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    .a4-workshop th { text-align: left; font-size: 7px; }
    h2 { font-size: 8.5px; margin: 1.5mm 0 1mm; }
    .warn { font-weight: 700; }
  `;
}
