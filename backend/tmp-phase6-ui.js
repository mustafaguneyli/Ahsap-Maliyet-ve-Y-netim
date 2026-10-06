/**
 * Aşama 6 UI senaryoları: Kapı Kasası, Süpürgelik, serbest ürün, öneri, offline.
 */
const BASE = 'http://127.0.0.1:3000';
const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
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

function ok(n, pass, d) {
  console.log(pass ? 'PASS' : 'FAIL', n, d || '');
  return !!pass;
}

async function main() {
  const results = [];
  const track = (n, pass, d) => {
    results.push({ n, pass });
    ok(n, pass, d);
  };

  const catalog = await api('GET', '/order-documents/catalog');
  const groups = catalog.json.groups || [];
  const door = groups
    .find((g) => g.code === 'door_frame')
    ?.products?.find((x) => x.code === '34_MM');
  const sup = groups.find((g) => g.code === 'SUPURGELIK')?.products?.[0];
  const sizes = catalog.json.sizes || catalog.json.productSizes || [];
  track('katalog kapı', !!door, door?.name);
  track('katalog süpürgelik', !!sup, sup?.name);

  // sizes may be nested per product — check catalog shape
  console.log('CATALOG_KEYS', Object.keys(catalog.json));
  const doorSize =
    (catalog.json.doorFrameSizes?.['34_MM'] || []).find(
      (s) => s.widthMm === 100 && s.lengthMm === 2100,
    ) || { widthMm: 100, lengthMm: 2100 };
  const supSize = (catalog.json.groupSizes?.SUPURGELIK || [])[0] || {
    widthMm: 80,
    lengthMm: 2800,
  };

  // 1) Kapı Kasası create + reopen
  const doorCreate = await api('POST', '/order-documents', {
    customerName: 'TEST AŞAMA6 Kapı UI',
    documentDateText: '28.09.2026',
    vatRate: '20',
    lines: [
      {
        kind: 'CATALOG',
        productId: door.id,
        productNameText: door.name,
        widthMm: String(doorSize.widthMm),
        lengthMm: String(doorSize.lengthMm),
        thicknessMm: '34',
        quantity: '5',
        unitText: 'ADET',
        discountRate: '0',
        unitPrice: '250',
        priceSource: 'ENTERED',
      },
    ],
  });
  track('kapı create', doorCreate.status < 300, doorCreate.json?.orderNumber);
  const doorGet = await api('GET', `/order-documents/${doorCreate.json.id}`);
  track(
    'kapı reopen',
    doorGet.json?.lines?.[0]?.productNameText?.includes('34') &&
      doorGet.json.lines[0].unitPrice === '250' &&
      doorGet.json.lines[0].quantity === '5',
    JSON.stringify(doorGet.json?.lines?.[0]),
  );
  track(
    'kapı malzeme',
    (doorGet.json?.materialLines || []).some((m) => m.thicknessMm === '22') &&
      (doorGet.json?.materialLines || []).some((m) => m.thicknessMm === '12'),
    String((doorGet.json?.materialLines || []).length),
  );

  // 2) Süpürgelik
  let supCreate = { status: 0, json: null };
  if (sup) {
    // find a common size from catalog if exposed
    const supSizes = catalog.json.supurgelikSizes || [
      { widthMm: 80, lengthMm: 2800 },
    ];
    const ss = { widthMm: Number(supSize.widthMm), lengthMm: Number(supSize.lengthMm) };
    supCreate = await api('POST', '/order-documents', {
      customerName: 'TEST AŞAMA6 Süpürgelik UI',
      documentDateText: '28.09.2026',
      vatRate: '20',
      lines: [
        {
          kind: 'CATALOG',
          productId: sup.id,
          productNameText: sup.name,
          widthMm: String(ss.widthMm),
          lengthMm: String(ss.lengthMm),
          thicknessMm: '12',
          quantity: '20',
          unitText: 'ADET',
          discountRate: '5',
          unitPrice: '45.5',
          priceSource: 'ENTERED',
        },
      ],
    });
    track('süpürgelik create', supCreate.status < 300, JSON.stringify(supCreate.json?.message || supCreate.json?.orderNumber).slice(0, 120));
    if (supCreate.json?.id) {
      const sg = await api('GET', `/order-documents/${supCreate.json.id}`);
      track(
        'süpürgelik reopen',
        sg.json?.lines?.[0]?.unitPrice === '45.5' &&
          sg.json.lines[0].discountRate === '5',
        sg.json?.orderNumber,
      );
    }
  }

  // 3) Serbest ürün
  const free = await api('POST', '/order-documents', {
    customerName: 'TEST AŞAMA6 Serbest UI',
    documentDateText: '28.09.2026',
    vatRate: '20',
    lines: [
      {
        kind: 'FREE_TEXT',
        productNameText: 'TEST Serbest Özel Kesim Panel',
        quantity: '3.5',
        unitText: 'ADET',
        discountRate: '12.5',
        unitPrice: '99.9',
        priceSource: 'ENTERED',
        productionNote: 'Serbest satır notu',
      },
    ],
  });
  track('serbest create', free.status < 300, free.json?.orderNumber);
  const freeGet = await api('GET', `/order-documents/${free.json.id}`);
  track(
    'serbest reopen',
    freeGet.json?.lines?.[0]?.kind === 'FREE_TEXT' &&
      freeGet.json.lines[0].unitPrice === '99.9' &&
      freeGet.json.grandTotal ===
        // 3.5*99.9=349.65, isk 12.5% = 43.70625, net=305.94375, kdv20%=61.18875, grand=367.1325
        freeGet.json.grandTotal,
    freeGet.json?.grandTotal,
  );
  track(
    'serbest hesap',
    freeGet.json?.grossTotal === '349.65' &&
      freeGet.json?.discountAmount === '43.70625' &&
      freeGet.json?.netTotal === '305.94375' &&
      freeGet.json?.vatAmount === '61.18875' &&
      freeGet.json?.grandTotal === '367.1325',
    JSON.stringify({
      g: freeGet.json?.grossTotal,
      d: freeGet.json?.discountAmount,
      n: freeGet.json?.netTotal,
      v: freeGet.json?.vatAmount,
      t: freeGet.json?.grandTotal,
    }),
  );

  // 4) Satış fiyatı öner — order-quote
  const quote = await api('POST', '/cost-calculation/order-quote', {
    productId: door.id,
    quantity: 1,
    widthMm: '100',
    lengthMm: '2100',
    thicknessMm: '34',
    materialPriceType: 'CASH',
  });
  console.log('QUOTE', quote.status, JSON.stringify(quote.json).slice(0, 400));
  track(
    'order-quote nakit/kart',
    quote.status < 300 &&
      (quote.json?.salePriceAvailable
        ? !!quote.json.unitCashPrice
        : Array.isArray(quote.json?.missingMessages)),
    quote.json?.salePriceAvailable
      ? `cash=${quote.json.unitCashPrice} card=${quote.json.unitCardPrice}`
      : `msg=${(quote.json?.missingMessages || quote.json?.salePriceMessage || '').toString().slice(0, 120)}`,
  );

  // 5) Offline simulation: fetch to dead port
  let offlineMsg = '';
  try {
    await fetch('http://127.0.0.1:3999/order-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: 'x', vatRate: '20', lines: [] }),
    });
  } catch (e) {
    offlineMsg = String(e.message || e);
  }
  track('offline network fail yakalandı', /fetch|network|ECONNREFUSED|failed/i.test(offlineMsg), offlineMsg.slice(0, 120));

  // Verify SP-000008 still TEST
  const sp8 = await p.orderDocument.findFirst({
    where: { orderNumber: 'SP-000008' },
  });
  track(
    'SP-000008 test kaydı',
    !!sp8 && sp8.customerName.startsWith('TEST AŞAMA5'),
    sp8?.customerName,
  );

  // A5 print for SP-000008 if exists
  if (sp8) {
    const html = await api(
      'GET',
      `/order-documents/${sp8.id}/prints/customer-priced.html`,
    );
    track('SP-000008 A5 HTML', /size:\s*A5/.test(html.text));
  }

  // cleanup AŞAMA6 test orders (keep SP-000008)
  const toClean = await p.orderDocument.findMany({
    where: { customerName: { startsWith: 'TEST AŞAMA6' } },
    select: { id: true, orderNumber: true },
  });
  for (const o of toClean) {
    await p.orderMaterialLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderDocument.delete({ where: { id: o.id } });
  }
  console.log('CLEANED', toClean.map((o) => o.orderNumber).join(','));
  console.log('SOURCE', {
    prices: await p.rawMaterialPrice.count(),
    yields: await p.productionYield.count(),
    pricing: await p.pricingSetting.count(),
  });

  const failed = results.filter((r) => !r.pass);
  console.log('SUMMARY', results.length - failed.length, '/', results.length);
  if (failed.length) {
    console.log('FAILED', failed);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
