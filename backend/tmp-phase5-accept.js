/**
 * Aşama 5 API kabul kontrolleri. TEST ön ekli kayıtlar; sequence sıfırlanmaz.
 * Çalıştırma: node tmp-phase5-accept.js (backend dizininden, sunucu :3000 açık)
 */
const { PrismaClient } = require('./node_modules/@prisma/client');

const BASE = 'http://127.0.0.1:3000';
const p = new PrismaClient();
const results = [];

function ok(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
  console.log(pass ? 'PASS' : 'FAIL', name, detail || '');
}

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

function freeLine(overrides = {}) {
  return {
    kind: 'FREE_TEXT',
    productNameText: 'TEST Ürün',
    quantity: '1',
    unitText: 'ADET',
    discountRate: '0',
    unitPrice: '10',
    priceSource: 'ENTERED',
    ...overrides,
  };
}

function baseDto(overrides = {}) {
  return {
    customerName: 'TEST AŞAMA5 API',
    documentDateText: '28.09.2026',
    vatRate: '20',
    lines: [freeLine()],
    ...overrides,
  };
}

async function main() {
  const health = await api('GET', '/health');
  ok('health', health.status === 200, JSON.stringify(health.json));

  const before = {
    orders: await p.orderDocument.count(),
    lines: await p.orderLine.count(),
    materials: await p.orderMaterialLine.count(),
    prices: await p.rawMaterialPrice.count(),
    yields: await p.productionYield.count(),
    pricing: await p.pricingSetting.count(),
    audit: await p.auditEvent.count(),
  };
  console.log('COUNTS_BEFORE', JSON.stringify(before));

  // --- Örnek sipariş toplamları (kaynak SP-000008 veya yeni) ---
  const samplePreview = await api('POST', '/order-documents/preview', {
    customerName: 'TEST AŞAMA5 Örnek',
    documentDateText: '28.09.2026',
    vatRate: '20',
    lines: [
      freeLine({
        productNameText: 'Pervaz TEST',
        quantity: '400',
        unitPrice: '50',
        discountRate: '10',
      }),
      freeLine({
        productNameText: 'Çıta TEST',
        quantity: '100',
        unitPrice: '80',
        discountRate: '5',
      }),
    ],
  });
  const t = samplePreview.json;
  ok(
    'örnek toplamlar',
    samplePreview.status === 201 || samplePreview.status === 200,
    `status=${samplePreview.status}`,
  );
  if (t?.grossTotal != null) {
    ok('GENEL', t.grossTotal === '28000', t.grossTotal);
    ok('İSKONTO', t.discountAmount === '2400', t.discountAmount);
    ok('ARA', t.netTotal === '25600', t.netTotal);
    ok('KDV', t.vatAmount === '5120', t.vatAmount);
    ok('YENİ', t.grandTotal === '30720', t.grandTotal);
  } else {
    ok('örnek totals payload', false, JSON.stringify(samplePreview.json).slice(0, 300));
  }

  // --- Sınır değerler ---
  const boundaries = [
    {
      name: 'ondalık miktar+fiyat+isk %12,5',
      dto: baseDto({
        lines: [
          freeLine({ quantity: '1,5', unitPrice: '10,25', discountRate: '12,5' }),
        ],
      }),
      expectOk: true,
    },
    {
      name: '%0 iskonto',
      dto: baseDto({ lines: [freeLine({ discountRate: '0' })] }),
      expectOk: true,
    },
    {
      name: '%100 iskonto',
      dto: baseDto({ lines: [freeLine({ discountRate: '100' })] }),
      expectOk: true,
    },
    {
      name: '%100 üzeri iskonto',
      dto: baseDto({ lines: [freeLine({ discountRate: '100.1' })] }),
      expectOk: false,
    },
    {
      name: 'negatif miktar',
      dto: baseDto({ lines: [freeLine({ quantity: '-1' })] }),
      expectOk: false,
    },
    {
      name: 'negatif fiyat',
      dto: baseDto({ lines: [freeLine({ unitPrice: '-5' })] }),
      expectOk: false,
    },
    {
      name: 'boş birim fiyat',
      dto: baseDto({ lines: [freeLine({ unitPrice: '' })] }),
      expectOk: false,
    },
    {
      name: 'boş KDV',
      dto: baseDto({ vatRate: '' }),
      expectOk: false,
    },
    {
      name: 'açık %0 KDV',
      dto: baseDto({ vatRate: '0' }),
      expectOk: true,
    },
    {
      name: 'negatif KDV',
      dto: baseDto({ vatRate: '-1' }),
      expectOk: false,
    },
  ];

  for (const caseItem of boundaries) {
    const res = await api('POST', '/order-documents/preview', caseItem.dto);
    const success = res.status >= 200 && res.status < 300;
    ok(
      `sınır:${caseItem.name}`,
      caseItem.expectOk ? success : !success,
      `status=${res.status} msg=${JSON.stringify(res.json?.message || res.json).slice(0, 160)}`,
    );
  }

  // Türkçe MinLength mesajı
  const emptyName = await api(
    'POST',
    '/order-documents/preview',
    baseDto({ lines: [freeLine({ productNameText: '' })] }),
  );
  const msg = JSON.stringify(emptyName.json?.message || emptyName.json);
  ok(
    'Türkçe ürün adı mesajı',
    !msg.includes('must be longer') && msg.includes('Ürün adı'),
    msg.slice(0, 200),
  );

  // --- Kapı kasası malzeme (34mm 10x210, qty 10) ---
  const catalog = await api('GET', '/order-documents/catalog');
  const doorGroup = (catalog.json?.groups || catalog.json || []).find?.(
    (g) => g.code === 'door_frame' || g.id === 'door_frame',
  );
  // catalog shape may vary
  let doorProduct = null;
  let catalogRoot = catalog.json;
  if (Array.isArray(catalogRoot?.products)) {
    doorProduct = catalogRoot.products.find((x) =>
      String(x.name || x.productName || '').toLowerCase().includes('34'),
    );
  }
  if (!doorProduct && Array.isArray(catalogRoot?.groups)) {
    const g = catalogRoot.groups.find(
      (x) => x.code === 'door_frame' || x.key === 'door_frame',
    );
    doorProduct = g?.products?.find((x) =>
      String(x.name || '').includes('34'),
    );
  }
  // Fallback: query DB
  const doorDb = await p.product.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { contains: '34', mode: 'insensitive' } },
        { code: { contains: '34', mode: 'insensitive' } },
      ],
      productGroup: { code: 'door_frame' },
    },
  });
  ok('kapı ürün bulundu', !!doorDb, doorDb ? `${doorDb.id} ${doorDb.name}` : 'yok');

  let doorOrder = null;
  if (doorDb) {
    const createDoor = await api('POST', '/order-documents', {
      customerName: 'TEST AŞAMA5 Kapı Kasası',
      documentDateText: '28.09.2026',
      vatRate: '20',
      lines: [
        {
          kind: 'CATALOG',
          productId: doorDb.id,
          productNameText: doorDb.name,
          widthMm: '100',
          lengthMm: '2100',
          thicknessMm: '34',
          quantity: '10',
          unitText: 'ADET',
          discountRate: '0',
          unitPrice: '100',
          priceSource: 'ENTERED',
        },
      ],
    });
    doorOrder = createDoor.json;
    ok(
      'kapı sipariş create',
      createDoor.status >= 200 && createDoor.status < 300,
      createDoor.json?.orderNumber || JSON.stringify(createDoor.json).slice(0, 200),
    );
    const getDoor = await api('GET', `/order-documents/${doorOrder.id}`);
    const materials = getDoor.json?.materialLines || getDoor.json?.materials || [];
    console.log(
      'DOOR_MATERIALS',
      JSON.stringify(
        materials.map((m) => ({
          name: m.materialNameText,
          th: m.thicknessMm,
          qty: m.quantity,
          sheet: m.sheetQuantity,
          pieces: m.pieceQuantity,
          source: m.source,
        })),
      ),
    );
    const m22 = materials.find(
      (m) => String(m.thicknessMm) === '22' || String(m.materialNameText).includes('22'),
    );
    const m12 = materials.find(
      (m) =>
        (String(m.thicknessMm) === '12' || String(m.materialNameText).includes('12')) &&
        m !== m22,
    );
    ok(
      'kapı 22mm parça=10 tabaka=1',
      m22 &&
        String(m22.pieceQuantity ?? m22.quantity) === '10' &&
        String(m22.sheetQuantity) === '1',
      JSON.stringify(m22),
    );
    ok(
      'kapı 12mm parça=10 tabaka=1',
      m12 &&
        String(m12.pieceQuantity ?? m12.quantity) === '10' &&
        String(m12.sheetQuantity) === '1',
      JSON.stringify(m12),
    );

    // miktar 12 → yeniden hesap
    const updateDoor = await api('PUT', `/order-documents/${doorOrder.id}`, {
      customerName: 'TEST AŞAMA5 Kapı Kasası',
      documentDateText: '28.09.2026',
      vatRate: '20',
      lines: [
        {
          kind: 'CATALOG',
          productId: doorDb.id,
          productNameText: doorDb.name,
          widthMm: '100',
          lengthMm: '2100',
          thicknessMm: '34',
          quantity: '12',
          unitText: 'ADET',
          discountRate: '0',
          unitPrice: '100',
          priceSource: 'ENTERED',
        },
      ],
      manualMaterials: [
        {
          materialNameText: 'TEST Manuel Malzeme',
          quantity: '3',
          unitText: 'ADET',
          note: 'manuel korunmalı',
        },
      ],
    });
    ok(
      'kapı qty12 update',
      updateDoor.status >= 200 && updateDoor.status < 300,
      updateDoor.json?.orderNumber,
    );
    const get2 = await api('GET', `/order-documents/${doorOrder.id}`);
    const mats2 = get2.json?.materialLines || get2.json?.materials || [];
    const auto22 = mats2.find(
      (m) =>
        m.source !== 'MANUAL' &&
        (String(m.thicknessMm) === '22' || String(m.materialNameText).includes('22')),
    );
    const manual = mats2.find(
      (m) =>
        m.source === 'MANUAL' ||
        String(m.materialNameText).includes('TEST Manuel'),
    );
    ok(
      'kapı qty12 parça=12',
      auto22 && String(auto22.pieceQuantity ?? auto22.quantity) === '12',
      JSON.stringify(auto22),
    );
    ok('manuel malzeme korundu', !!manual, JSON.stringify(manual));
    ok(
      'aynı sipariş no',
      get2.json?.orderNumber === doorOrder.orderNumber,
      get2.json?.orderNumber,
    );
  }

  // --- Kaydedilmiş örnek sipariş snapshot ---
  const saved = await p.orderDocument.findFirst({
    where: { orderNumber: 'SP-000008' },
    include: { lines: true },
  });
  ok('SP-000008 DB', !!saved, saved?.id);
  if (saved) {
    ok('DB GENEL', saved.grossTotal.toString() === '28000', saved.grossTotal.toString());
    ok(
      'DB İSKONTO',
      saved.discountAmount.toString() === '2400',
      saved.discountAmount.toString(),
    );
    ok('DB ARA', saved.netTotal.toString() === '25600', saved.netTotal.toString());
    ok('DB KDV', saved.vatAmount.toString() === '5120', saved.vatAmount.toString());
    ok(
      'DB YENİ',
      saved.grandTotal.toString() === '30720',
      saved.grandTotal.toString(),
    );

    // fiyat snapshot: update aynı fiyatlarla, satır fiyatını kontrol et
    const linePrice = saved.lines.find((l) => l.productNameText.includes('Pervaz'));
    ok(
      'snapshot pervaz 50',
      linePrice && linePrice.unitPrice.toString() === '50',
      linePrice?.unitPrice?.toString(),
    );

    // müşteri / üretim HTML
    const cust = await api(
      'GET',
      `/order-documents/${saved.id}/prints/customer-priced.html`,
    );
    const work = await api(
      'GET',
      `/order-documents/${saved.id}/prints/workshop-material.html`,
    );
    ok('müşteri HTML 200', cust.status === 200, `len=${cust.text.length}`);
    ok('üretim HTML 200', work.status === 200, `len=${work.text.length}`);
    ok(
      'müşteri logo',
      /zirve-logo|ZİRVE|Zirve/i.test(cust.text),
      'logo/marka',
    );
    ok(
      'müşteri toplamlar',
      cust.text.includes('28,000') || cust.text.includes('28000'),
      'genel',
    );
    ok(
      'müşteri sipariş no YOK',
      !cust.text.includes('SP-000008'),
      'no leak order no',
    );
    ok('üretim sipariş no VAR', work.text.includes('SP-000008'), 'order no');

    const priceLeakPatterns = [
      /Birim\s*Fiyat/i,
      /BİRİM FİYATI/i,
      /İSKONTO/i,
      /KDV/i,
      /YENİ TOPLAM/i,
      /GENEL TOPLAM/i,
      /unitPrice/i,
      /grossTotal/i,
      /vatAmount/i,
      /₺50/,
      /₺80/,
      /30,?720/,
    ];
    const leaks = priceLeakPatterns.filter((re) => re.test(work.text));
    ok(
      'üretim HTML fiyat sızıntısı yok',
      leaks.length === 0,
      leaks.map(String).join(','),
    );

    // workshop JSON DTO (get order still has prices - that's OK for edit form)
    // workshopPrint API returns html only; check service via workshop endpoint only
    const workJsonHint = /"unitPrice"|"grossTotal"|"discountAmount"|"vatAmount"/i.test(
      work.text,
    );
    ok('üretim HTML JSON fiyat alanı yok', !workJsonHint, '');

    // 1 / 11 / 12 / 24 satır baskı pagination via unit already; create stress order
    const stressLines = (n) =>
      Array.from({ length: n }, (_, i) =>
        freeLine({
          productNameText: `TEST STRESS UZUN ÜRÜN ADI ${i + 1} KAPİ KASASI ÖZEL`,
          quantity: String(i + 1),
          unitPrice: String(1000 + i),
          discountRate: i % 2 === 0 ? '0' : '5',
        }),
      );
    for (const n of [1, 11, 12, 24]) {
      const created = await api('POST', '/order-documents', {
        customerName: `TEST AŞAMA5 STRESS ${n} satır ÇOK UZUN MÜŞTERİ ADI FİRMA LTD ŞTİ`,
        documentDateText: '28.09.2026',
        vatRate: '20',
        lines: stressLines(n),
      });
      ok(
        `stress create ${n}`,
        created.status >= 200 && created.status < 300,
        created.json?.orderNumber,
      );
      if (created.json?.id) {
        const html = await api(
          'GET',
          `/order-documents/${created.json.id}/prints/customer-priced.html`,
        );
        const sheets = (html.text.match(/class="sheet"/g) || []).length;
        // Her sheet içinde iki nüsha (form×2); satır/11 kadar sheet
        const expectedSheets = Math.ceil(n / 11);
        ok(
          `stress ${n} sheet≈${expectedSheets}`,
          sheets === expectedSheets,
          `sheets=${sheets}`,
        );
        const forms = (html.text.match(/class="form"/g) || []).length;
        ok(
          `stress ${n} form nüsha×2`,
          forms === expectedSheets * 2,
          `forms=${forms}`,
        );
        // totals only once per copy on last page roughly: count YENİ TOPLAM
        const yeniCount = (html.text.match(/YENİ TOPLAM/g) || []).length;
        ok(
          `stress ${n} YENİ TOPLAM×2 nüsha`,
          yeniCount === 2,
          `count=${yeniCount}`,
        );
      }
    }
  }

  // --- Liste / arama / sayfalama ---
  const listQ = await api(
    'GET',
    '/order-documents?q=TEST%20A%C5%9EAMA5%20M%C3%BC%C5%9Fteri%20A&page=1&pageSize=20',
  );
  ok(
    'liste müşteri ara',
    listQ.status === 200 &&
      (listQ.json?.items || listQ.json?.data || []).some?.(
        (x) => x.orderNumber === 'SP-000008',
      ),
    JSON.stringify(listQ.json).slice(0, 200),
  );
  const listNo = await api('GET', '/order-documents?q=SP-000008');
  ok(
    'liste sipariş no ara',
    listNo.status === 200 &&
      (listNo.json?.items || []).some?.((x) => x.orderNumber === 'SP-000008'),
    '',
  );

  // olmayan sipariş
  const missing = await api(
    'GET',
    '/order-documents/00000000-0000-4000-8000-000000000099',
  );
  ok('olmayan sipariş 404', missing.status === 404, `status=${missing.status}`);

  // --- Cleanup TEST orders (audit/prices/yields korunur) ---
  const testOrders = await p.orderDocument.findMany({
    where: { customerName: { startsWith: 'TEST AŞAMA5' } },
    select: { id: true, orderNumber: true },
  });
  console.log(
    'CLEANUP_CANDIDATES',
    testOrders.map((o) => o.orderNumber).join(','),
  );
  // Keep SP-000008 for browser print visual; clean stress + kapı
  const toDelete = testOrders.filter((o) => o.orderNumber !== 'SP-000008');
  for (const o of toDelete) {
    await p.orderMaterialLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderDocument.delete({ where: { id: o.id } });
  }
  console.log('CLEANED', toDelete.map((o) => o.orderNumber).join(','));

  const after = {
    orders: await p.orderDocument.count(),
    lines: await p.orderLine.count(),
    materials: await p.orderMaterialLine.count(),
    prices: await p.rawMaterialPrice.count(),
    yields: await p.productionYield.count(),
    pricing: await p.pricingSetting.count(),
    audit: await p.auditEvent.count(),
  };
  console.log('COUNTS_AFTER', JSON.stringify(after));
  ok(
    'fiyat/NET/pricing korundu',
    after.prices === before.prices &&
      after.yields === before.yields &&
      after.pricing === before.pricing,
    `prices ${before.prices}->${after.prices} yields ${before.yields}->${after.yields}`,
  );
  ok(
    'audit silinmedi',
    after.audit >= before.audit,
    `${before.audit}->${after.audit}`,
  );

  const seq = await p.$queryRawUnsafe(
    'SELECT last_value, is_called FROM order_document_number_seq',
  );
  console.log('SEQ_AFTER', String(seq[0].last_value), seq[0].is_called);
  ok('seq sıfırlanmadı', Number(seq[0].last_value) >= 8, String(seq[0].last_value));

  const failed = results.filter((r) => !r.pass);
  console.log('SUMMARY', results.length - failed.length, '/', results.length, 'passed');
  if (failed.length) {
    console.log('FAILED', JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
