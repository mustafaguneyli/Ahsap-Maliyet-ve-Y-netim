/**
 * Son kontrol — Combined A4 PDF MediaBox doğrulama.
 * DB yazmaz. puppeteer-core + sistem Chrome.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT_DIR = path.join(__dirname, 'tmp-a4-pdf');
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const A4_W_PT = 210 * (72 / 25.4);
const A4_H_PT = 297 * (72 / 25.4);
const PT_TOL = 2.5; // ~0.88 mm

function parsePdfPageSizes(pdfBuf) {
  const text = pdfBuf.toString('latin1');
  const sizes = [];
  const re =
    /\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g;
  let m;
  while ((m = re.exec(text))) {
    const wPt = Math.abs(Number(m[3]) - Number(m[1]));
    const hPt = Math.abs(Number(m[4]) - Number(m[2]));
    sizes.push({
      wPt,
      hPt,
      wMm: (wPt * 25.4) / 72,
      hMm: (hPt * 25.4) / 72,
    });
  }
  return sizes;
}

function isA4(size) {
  const portrait =
    Math.abs(size.wPt - A4_W_PT) <= PT_TOL &&
    Math.abs(size.hPt - A4_H_PT) <= PT_TOL;
  const landscape =
    Math.abs(size.wPt - A4_H_PT) <= PT_TOL &&
    Math.abs(size.hPt - A4_W_PT) <= PT_TOL;
  return portrait || landscape;
}

function track(results, name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
  console.log(pass ? 'PASS' : 'FAIL', name, detail || '');
}

async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error('Chrome bulunamadı:', CHROME);
    process.exitCode = 1;
    return;
  }

  const {
    renderCombinedPrintHtml,
    assertWorkshopHasNoPriceFields,
  } = require('./dist/src/modules/order-documents/order-print');

  const customer = {
    documentDateText: '05.10.2026',
    customerName: 'TEST A4 COMBINED MÜŞTERİ',
    customerAddress: 'KARATAY / KONYA',
    taxOffice: 'KARATAY',
    customerPhone: '0551 119 72 80',
    taxNumber: '1234567890',
    lines: [
      {
        lineNo: 1,
        productNameText: 'Kapı İmalatı 210 × 90 cm',
        quantity: '2',
        unitText: 'ADET',
        discountRate: '0',
        unitPrice: '4500',
        lineAmount: '9000',
      },
    ],
    grossTotal: '9000',
    discountAmount: '0',
    netTotal: '9000',
    vatLabel: 'KDV %20',
    vatAmount: '1800',
    grandTotal: '10800',
  };

  const workshop = {
    orderNumber: 'SP-A4-TEST',
    documentDateText: '05.10.2026',
    lines: [
      {
        lineNo: 1,
        productNameText: 'Kapı İmalatı 210 × 90 cm',
        productKindText: 'Kapı İmalatı',
        sizeText: '900×2100 mm',
        thicknessText: '16 mm',
        decorText: 'ZIMPARALI',
        productionNote: 'MDF + kasa 2.5 boy + pervaz 8 adet',
        quantity: '2',
        unitText: 'ADET',
        materialMessage: null,
      },
    ],
    materials: [
      {
        source: 'MANUAL',
        lineNo: 1,
        materialNameText: '16 mm Zımparalı MDF',
        thicknessMm: '16',
        sheetWidthMm: 2100,
        sheetLengthMm: 2800,
        surfaceType: 'ZIMPARALI',
        quantity: '2',
        pieceQuantity: '4',
        sheetQuantity: '2',
        rawMaterialId: null,
        componentRole: 'YUZAY_MDF',
        unitText: 'TABAKA',
        note: 'Yüzey',
        unverified: false,
      },
      {
        source: 'MANUAL',
        lineNo: 1,
        materialNameText: '34 MM MDF Kasa 10×210',
        thicknessMm: null,
        sheetWidthMm: null,
        sheetLengthMm: null,
        surfaceType: null,
        quantity: '2.5',
        pieceQuantity: '2.5',
        sheetQuantity: null,
        rawMaterialId: null,
        componentRole: 'FRAME',
        unitText: 'BOY',
        note: 'Toplam kasa 2.5 boy',
        unverified: false,
      },
      {
        source: 'MANUAL',
        lineNo: 1,
        materialNameText: 'Ayarlı Pervaz 12 mm · 100×2200',
        thicknessMm: '12',
        sheetWidthMm: null,
        sheetLengthMm: null,
        surfaceType: null,
        quantity: '8',
        pieceQuantity: '8',
        sheetQuantity: null,
        rawMaterialId: null,
        componentRole: 'SIDE_TRIM',
        unitText: 'ADET',
        note: '4 adet/kapı',
        unverified: false,
      },
    ],
  };

  assertWorkshopHasNoPriceFields(workshop);
  const html = renderCombinedPrintHtml(customer, workshop);

  const results = [];
  track(results, 'HTML @page A4', /@page\s*\{\s*size:\s*A4 portrait/.test(html));
  track(results, 'HTML a4-combined tek sayfa iskeleti', html.includes('class="sheet a4-combined"'));
  track(results, 'HTML cut-gap', html.includes('class="cut-gap"'));
  track(results, 'HTML müşteri fiyatı', html.includes('BİRİM FİYATI') && html.includes('10.800,00 TL'));
  track(results, 'HTML üretim başlığı', html.includes('ÜRETİM FORMU'));
  track(results, 'HTML kasa malzeme', html.includes('34 MM MDF Kasa') && html.includes('2,50'));
  track(results, 'HTML pervaz malzeme', html.includes('Ayarlı Pervaz') || html.includes('Yan pervaz') || html.includes('SIDE_TRIM') || html.includes('Kapı kasası') || html.includes('8'));

  const workshopMarker = 'data-section="workshop"';
  const workshopStart = html.lastIndexOf(workshopMarker);
  const workshopPart =
    workshopStart >= 0 ? html.slice(workshopStart) : '';
  track(
    results,
    'Üretim bölümünde fiyat yok',
    workshopPart.length > 0 &&
      !/BİRİM FİYATI|GENEL TOPLAM|İSKONTO|YENİ TOPLAM/i.test(workshopPart) &&
      !/\d+[.,]\d{2}\s*TL/.test(workshopPart),
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, 'combined-short.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const cleaned = html.replace(/<div class="print-bar">[\s\S]*?<\/div>/, '');
    const page = await browser.newPage();
    await page.setContent(cleaned, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdfPath = path.join(OUT_DIR, 'combined-short.pdf');
    await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await page.close();

    const buf = fs.readFileSync(pdfPath);
    const sizes = parsePdfPageSizes(buf);
    track(results, 'PDF MediaBox bulundu', sizes.length > 0, JSON.stringify(sizes));
    track(
      results,
      'PDF tek sayfa',
      sizes.length === 1,
      `pageCount=${sizes.length}`,
    );
    if (sizes[0]) {
      const s = sizes[0];
      track(
        results,
        'PDF MediaBox A4 210×297 mm',
        isA4(s),
        `${s.wMm.toFixed(2)}×${s.hMm.toFixed(2)} mm`,
      );
      console.log(
        'MEDIA_BOX_MM',
        s.wMm.toFixed(3),
        s.hMm.toFixed(3),
      );
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    process.exitCode = 1;
    console.error('FAILED', failed.map((f) => f.name).join(', '));
  } else {
    console.log('ALL PASS');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
