/**
 * Aşama 6 — A5 PDF doğrulama (test script; üretim bağımlılığı değil).
 * puppeteer-core + sistem Chrome, preferCSSPageSize ile @page A5.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { PrismaClient } = require('./node_modules/@prisma/client');

const BASE = 'http://127.0.0.1:3000';
const OUT_DIR = path.join(__dirname, 'tmp-a5-pdf');
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const A5_W_PT = 148 * (72 / 25.4);
const A5_H_PT = 210 * (72 / 25.4);
const PT_TOL = 2.5;

function ok(name, pass, detail) {
  console.log(pass ? 'PASS' : 'FAIL', name, detail || '');
  return !!pass;
}

async function api(method, pathName, body) {
  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

function freeLine(i) {
  return {
    kind: 'FREE_TEXT',
    productNameText: `TEST A5 ÜRÜN ${i} KAPİ KASASI 34 MM 10x210 ÖZEL UZUN AD`,
    quantity: String(10 + i),
    unitText: 'ADET',
    discountRate: i % 2 === 0 ? '0' : '12.5',
    unitPrice: '10.25',
    priceSource: 'ENTERED',
    productionNote:
      i === 1
        ? 'UZUN ÜRETİM NOTU: sol yön özel kanal teslim öncesi kalite kontrol ve etiket'
        : undefined,
  };
}

function parsePdfPageSizes(pdfBuf) {
  const text = pdfBuf.toString('latin1');
  const sizes = [];
  const re = /\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g;
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

function isA5(size) {
  const portrait =
    Math.abs(size.wPt - A5_W_PT) <= PT_TOL && Math.abs(size.hPt - A5_H_PT) <= PT_TOL;
  const landscape =
    Math.abs(size.wPt - A5_H_PT) <= PT_TOL && Math.abs(size.hPt - A5_W_PT) <= PT_TOL;
  return portrait || landscape;
}

async function htmlToPdf(browser, name, html) {
  const pdfPath = path.join(OUT_DIR, `${name}.pdf`);
  const cleaned = html.replace(/<div class="print-bar">[\s\S]*?<\/div>/, '');
  const page = await browser.newPage();
  await page.setContent(cleaned, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.pdf({
    path: pdfPath,
    preferCSSPageSize: true,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await page.close();
  const buf = fs.readFileSync(pdfPath);
  const sizes = parsePdfPageSizes(buf);
  return { pdfPath, sizes, pageCount: sizes.length, bytes: buf.length };
}

async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error('Chrome bulunamadı:', CHROME);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const health = await api('GET', '/health');
  if (health.status !== 200) {
    console.error('Backend health yok — Nest start:dev gerekli');
    process.exitCode = 1;
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const results = [];
  const track = (name, pass, detail) => {
    results.push({ name, pass });
    ok(name, pass, detail);
  };

  try {
    for (const sc of [
      { n: 1, label: '1satir' },
      { n: 11, label: '11satir' },
      { n: 12, label: '12satir' },
      { n: 24, label: '24satir' },
    ]) {
      const created = await api('POST', '/order-documents', {
        customerName:
          'TEST AŞAMA6 A5 UZUN MÜŞTERİ ÜNVANI VE TİCARET LİMİTED ŞİRKETİ KARATAY KONYA',
        documentDateText: '28.09.2026',
        vatRate: '20',
        lines: Array.from({ length: sc.n }, (_, i) => freeLine(i + 1)),
      });
      track(
        `create ${sc.label}`,
        created.status >= 200 && created.status < 300,
        created.json?.orderNumber,
      );
      if (!created.json?.id) continue;

      const cust = await api(
        'GET',
        `/order-documents/${created.json.id}/prints/customer-priced.html`,
      );
      const work = await api(
        'GET',
        `/order-documents/${created.json.id}/prints/workshop-material.html`,
      );
      track(`html müşteri A5 ${sc.label}`, cust.status === 200 && /size:\s*A5/.test(cust.text));
      track(`html üretim A5 ${sc.label}`, work.status === 200 && /size:\s*A5/.test(work.text));
      track(`html scale yok ${sc.label}`, !/scale\(|transform:\s*scale/i.test(cust.text));

      const contentPages = Math.ceil(sc.n / 8);
      const expectedCustomerPages = contentPages * 2;
      const sheetCount = (cust.text.match(/class="sheet"/g) || []).length;
      track(
        `sheet ${sc.label}`,
        sheetCount === expectedCustomerPages,
        `${sheetCount}/${expectedCustomerPages}`,
      );

      const copy1 = [...cust.text.matchAll(/data-copy="1">([\s\S]*?)<\/section>/g)].map(
        (m) => m[1],
      );
      const copy2 = [...cust.text.matchAll(/data-copy="2">([\s\S]*?)<\/section>/g)].map(
        (m) => m[1],
      );
      track(
        `nüsha eşit ${sc.label}`,
        copy1.length === copy2.length && copy1.every((h, i) => h === copy2[i]),
        `pairs=${copy1.length}`,
      );
      track(`YENİ×2 ${sc.label}`, (cust.text.match(/YENİ TOPLAM/g) || []).length === 2);

      const pdf = await htmlToPdf(browser, `customer-${sc.label}`, cust.text);
      track(
        `PDF A5 ${sc.label}`,
        pdf.sizes.length > 0 && pdf.sizes.every(isA5),
        pdf.sizes.map((s) => `${s.wMm.toFixed(2)}×${s.hMm.toFixed(2)}mm`).join(' | ') ||
          'MediaBox yok',
      );
      track(
        `PDF sayfa ${sc.label}`,
        pdf.pageCount === expectedCustomerPages,
        `${pdf.pageCount}/${expectedCustomerPages}`,
      );
      console.log('  ->', pdf.pdfPath);

      const wpdf = await htmlToPdf(browser, `workshop-${sc.label}`, work.text);
      track(
        `üretim PDF A5 ${sc.label}`,
        wpdf.sizes.length > 0 && wpdf.sizes.every(isA5),
        wpdf.sizes.map((s) => `${s.wMm.toFixed(2)}×${s.hMm.toFixed(2)}mm`).join(' | '),
      );
      track(
        `üretim sızıntı yok ${sc.label}`,
        !/₺|İSKONTO|BİRİM FİYATI|GENEL TOPLAM|unitPrice/i.test(work.text),
      );
    }
  } finally {
    await browser.close();
  }

  const p = new PrismaClient();
  try {
    const orders = await p.orderDocument.findMany({
      where: { customerName: { startsWith: 'TEST AŞAMA6' } },
      select: { id: true, orderNumber: true },
    });
    for (const o of orders) {
      await p.orderMaterialLine.deleteMany({ where: { orderDocumentId: o.id } });
      await p.orderLine.deleteMany({ where: { orderDocumentId: o.id } });
      await p.orderDocument.delete({ where: { id: o.id } });
    }
    console.log('CLEANED', orders.map((o) => o.orderNumber).join(','));
    console.log('SOURCE', {
      prices: await p.rawMaterialPrice.count(),
      yields: await p.productionYield.count(),
      pricing: await p.pricingSetting.count(),
    });
  } finally {
    await p.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  console.log('SUMMARY', results.length - failed.length, '/', results.length);
  if (failed.length) {
    console.log('FAILED', failed);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
