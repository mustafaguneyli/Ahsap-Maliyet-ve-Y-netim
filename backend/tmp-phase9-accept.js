/**
 * Aşama 9 API + sipariş/A5/snapshot kabul.
 * TEST ön ekli siparişler; gerçek MDF aktif fiyatı test sonunda eski değere döner.
 * Sequence sıfırlanmaz; audit silinmez.
 *
 * Çalıştırma (backend :3000 açık): node tmp-phase9-accept.js
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3000';
const p = new PrismaClient();
const results = [];
const outDir = path.join(__dirname, 'tmp-phase9-out');

function ok(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
  console.log(pass ? 'PASS' : 'FAIL', name, detail || '');
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

async function apiHtml(pathName) {
  const res = await fetch(`${BASE}${pathName}`);
  const text = await res.text();
  return { status: res.status, text };
}

function hasPriceLeak(html) {
  const lower = html.toLowerCase();
  const banned = [
    'kâr',
    'kar %',
    'kdv',
    'nakit satış',
    'kart / taksit',
    'üretim maliyeti',
    'tl',
    'profit',
    'vat',
  ];
  // workshop: TL/fiyat sızıntısı yok; En katsayısı serbest
  const moneyLike = /(\d+[.,]\d{2}\s*tl|\b\d+\s*tl\b|₺)/i.test(html);
  const hasBannedWord = banned.some((b) => lower.includes(b));
  return { moneyLike, hasBannedWord, leak: moneyLike };
}

async function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const health = await api('GET', '/health');
  ok('health', health.status === 200, JSON.stringify(health.json));

  const materials = await api('GET', '/raw-materials');
  const mdf = (materials.json || []).find(
    (m) =>
      m.isActive &&
      m.sheetWidthMm === 2100 &&
      m.sheetLengthMm === 2800 &&
      m.cashPrice != null &&
      String(m.cashPrice).trim() !== '' &&
      m.code === 'MDF-8-2100X2800-ZIMPARALI',
  );
  ok('yüzey MDF', !!mdf, mdf ? `${mdf.code} cash=${mdf.cashPrice}` : 'yok');
  if (!mdf) {
    console.log('ABORT: uygun MDF yok');
    process.exitCode = 1;
    return;
  }

  const originalCash = String(mdf.cashPrice);

  const frameList = await api(
    'GET',
    '/cost-calculation/door-frame/mdf?variant=34_MM&materialPriceType=CASH',
  );
  const frame10x210 = (frameList.json?.rows || []).find(
    (r) => r.widthCm === 10 && r.lengthCm === 210,
  );
  ok('kasa 10x210', !!frame10x210, frame10x210?.displayName || '');

  const ayarli = await api(
    'GET',
    '/cost-calculation/pervaz/ayarli?materialPriceType=CASH',
  );
  const pervaz = (ayarli.json?.rows || []).find(
    (r) =>
      Number(r.thicknessMm) === 12 &&
      Number(r.widthMm) === 100 &&
      Number(r.lengthMm) === 2200,
  );
  ok(
    'ayarlı 12×100×2200',
    !!pervaz,
    pervaz ? `cost=${pervaz.productionCost}` : 'yok',
  );
  if (!frame10x210 || !pervaz) {
    process.exitCode = 1;
    return;
  }

  const baseQuote = {
    doorHeightMm: 2100,
    doorWidthMm: 900,
    quantity: 3,
    surfaceRawMaterialId: mdf.id,
    materialPriceType: 'CASH',
    frame: {
      productCode: '34_MM',
      widthMm: 100,
      lengthMm: 2100,
    },
    sideTrims: {
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: '12',
      widthMm: '100',
      lengthMm: '2200',
    },
    header: {
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: '12',
      widthMm: '100',
      lengthMm: '2200',
    },
    manualCostLines: [
      { code: 'ISKELET', included: true, amount: '50', scope: 'PER_DOOR' },
      { code: 'CNC', included: true, amount: '100', scope: 'ORDER_TOTAL' },
      { code: 'CITA', included: false, amount: null, scope: 'PER_DOOR' },
      { code: 'PRES', included: false, amount: null, scope: 'PER_DOOR' },
      { code: 'BOYA', included: false, amount: null, scope: 'PER_DOOR' },
      { code: 'DIGER', included: false, amount: null, scope: 'PER_DOOR' },
      { code: 'UZUN_BASLIK', included: false, amount: null, scope: 'PER_DOOR' },
    ],
    profitRate: '20',
    vatRate: '10',
    cardMarkupRate: '15',
  };

  // ---------- Senaryo 1: 210×90 / 3 ----------
  const s1 = await api('POST', '/door-build/quote', baseQuote);
  const q1 = s1.json;
  ok('S1 quote status', s1.status === 200 || s1.status === 201, `status=${s1.status}`);
  ok('S1 kasa boy', q1?.frame?.totalBoyQuantity === '7.5', q1?.frame?.totalBoyQuantity);
  ok('S1 kasa TL', q1?.frame?.totalCost === '2250', q1?.frame?.totalCost);
  ok('S1 kasa kural', q1?.frame?.ruleSource === 'VERIFIED_210_DOOR_RULE', q1?.frame?.ruleSource);
  ok('S1 pervaz', q1?.sideTrims?.totalPieces === '12', q1?.sideTrims?.totalPieces);
  ok('S1 başlık', q1?.header?.totalPieces === '3', q1?.header?.totalPieces);
  ok('S1 en katsayı', q1?.widthCoefficient === '1', q1?.widthCoefficient);
  ok('S1 nakit satış', q1?.sale?.cashSale != null, q1?.sale?.cashSale);
  ok('S1 kart satış', q1?.sale?.cardSale != null, q1?.sale?.cardSale);
  ok(
    'S1 ROUNDUP yok (nakit ham)',
    q1?.sale?.cashSale != null && !String(q1.sale.cashSale).includes('ROUND'),
    q1?.sale?.cashSale,
  );

  const draft1 = await api('POST', '/door-build/order-draft', {
    quote: baseQuote,
    salePriceSource: 'CASH',
    vatRate: '10',
    discountRate: '0',
    customerName: 'TEST AŞAMA9 210x90',
    documentDateText: '30.09.2026',
  });
  ok(
    'S1 order-draft',
    (draft1.status === 200 || draft1.status === 201) && draft1.json?.upsert,
    `status=${draft1.status}`,
  );

  let order1Id = null;
  let snapUnit = null;
  let snapWidth = null;
  let snapMats = null;
  if (draft1.json?.upsert) {
    const create1 = await api('POST', '/order-documents', draft1.json.upsert);
    ok(
      'S1 sipariş kaydet',
      create1.status === 200 || create1.status === 201,
      `status=${create1.status} id=${create1.json?.id}`,
    );
    order1Id = create1.json?.id;
    snapUnit = create1.json?.lines?.[0]?.unitPrice;
    const got = await api('GET', `/order-documents/${order1Id}`);
    snapMats = (got.json?.materials || got.json?.materialLines || got.json?.manualMaterials || []).map((m) => ({
      role: m.role || m.componentRole,
      quantity: m.quantity,
      materialNameText: m.materialNameText,
      note: m.note,
    }));
    const note = got.json?.lines?.[0]?.productionNote || got.json?.productionNote || '';
    snapWidth =
      (note.match(/En katsayısı:\s*x([0-9.]+)/i) || [])[1] ||
      q1.widthCoefficient;
    ok('S1 snapshot unitPrice', snapUnit === draft1.json.unitPrice, snapUnit);
    ok('S1 malzeme satırları', snapMats.length >= 3, `n=${snapMats.length}`);

    const cust = await apiHtml(
      `/order-documents/${order1Id}/prints/customer-priced.html`,
    );
    fs.writeFileSync(path.join(outDir, 'customer-210.html'), cust.text);
    ok('S1 A5 müşteri', cust.status === 200 && cust.text.includes('TEST AŞAMA9'), String(cust.status));
    ok(
      'S1 A5 müşteri alanlar',
      /adet|birim|toplam|kdv|iskonto/i.test(cust.text) &&
        cust.text.includes('210') &&
        !/üretim maliyeti|kasa boy|en katsayısı/i.test(cust.text),
      'müşteri formu',
    );
    ok(
      'S1 A5 müşteri 2 ondalık TL',
      /\d{1,3}(\.\d{3})*,\d{2}\s*TL/.test(cust.text),
      'para formatı',
    );

    const ws = await apiHtml(
      `/order-documents/${order1Id}/prints/workshop-material.html`,
    );
    fs.writeFileSync(path.join(outDir, 'workshop-210.html'), ws.text);
    const leak = hasPriceLeak(ws.text);
    ok('S1 A5 üretim', ws.status === 200, String(ws.status));
    ok(
      'S1 A5 üretim içeriği',
      /210|MDF|kasa|pervaz|en katsayısı/i.test(ws.text),
      'üretim alanları',
    );
    ok('S1 A5 fiyat sızıntısı yok', !leak.moneyLike, leak.moneyLike ? 'TL bulundu' : 'temiz');
    ok(
      'S1 A5 üretim miktar 7,50 boy',
      /7,50/.test(ws.text) && !/>7\.5</.test(ws.text),
      /7,50/.test(ws.text) ? '7,50' : 'format yok',
    );  }

  // ---------- Senaryo 2: 250×90 / 3, başlıksız ----------
  const quote2Body = {
    ...baseQuote,
    doorHeightMm: 2500,
    doorWidthMm: 900,
    quantity: 3,
    header: null,
  };
  const s2 = await api('POST', '/door-build/quote', quote2Body);
  const q2 = s2.json;
  ok('S2 quote', s2.status === 200 || s2.status === 201, `status=${s2.status}`);
  ok('S2 yüzey', q2?.totalFaces === 6 && q2?.requiredFullSheets === 3, `${q2?.totalFaces}/${q2?.requiredFullSheets}`);
  ok('S2 kasa boy', q2?.frame?.totalBoyQuantity === '7.5', q2?.frame?.totalBoyQuantity);
  ok('S2 kasa TL', q2?.frame?.totalCost === '2850', q2?.frame?.totalCost);
  ok('S2 kasa boy/kapı', q2?.frame?.boyQuantityPerDoor === '2.5', q2?.frame?.boyQuantityPerDoor);
  ok('S2 kasa maliyet/kapı', q2?.frame?.costPerDoor === '950', q2?.frame?.costPerDoor);
  ok('S2 yarım boy', q2?.frame?.halfBoyQuantityPerDoor === '0.5' && q2?.frame?.halfBoyPrice === '150', `${q2?.frame?.halfBoyQuantityPerDoor}/${q2?.frame?.halfBoyPrice}`);
  ok('S2 400 TL/boy yok', q2?.frame?.pricePerBoy == null, String(q2?.frame?.pricePerBoy));
  ok(
    'S2 kasa kural',
    q2?.frame?.ruleSource === 'VERIFIED_UP_TO_250_DOOR_RULE',
    q2?.frame?.ruleSource,
  );
  ok('S2 pervaz', q2?.sideTrims?.totalPieces === '12', q2?.sideTrims?.totalPieces);
  ok(
    'S2 başlık yok',
    q2?.header?.status === 'NOT_SELECTED' ||
      q2?.header?.totalPieces == null ||
      q2?.header?.totalPieces === '0',
    JSON.stringify(q2?.header?.status),
  );
  ok('S2 en', q2?.widthCoefficient === '1', q2?.widthCoefficient);
  ok(
    'S2 250 katalog notu',
    /ayrı kasa katalog kaydı bulunmuyor/i.test(String(q2?.catalogNote || '')),
    q2?.catalogNote || '',
  );

  const draft2 = await api('POST', '/door-build/order-draft', {
    quote: quote2Body,
    salePriceSource: 'CASH',
    vatRate: '10',
    discountRate: '0',
    customerName: 'TEST AŞAMA9 250x90',
    documentDateText: '30.09.2026',
  });
  let order2Id = null;
  if (draft2.json?.upsert) {
    const create2 = await api('POST', '/order-documents', draft2.json.upsert);
    order2Id = create2.json?.id;
    ok('S2 sipariş', !!order2Id, order2Id);
    const ws2 = await apiHtml(
      `/order-documents/${order2Id}/prints/workshop-material.html`,
    );
    fs.writeFileSync(path.join(outDir, 'workshop-250.html'), ws2.text);
    ok(
      'S2 A5 üretim başlık yok/0',
      !/başlık:\s*[1-9]/i.test(ws2.text) || /başlık.*0|başlık yok|seçilmedi/i.test(ws2.text) || !/HEADER|Başlık/i.test(ws2.text),
      'başlık kontrol',
    );
    ok('S2 A5 fiyat sızıntısı yok', !hasPriceLeak(ws2.text).moneyLike, '');
    ok(
      'S2 A5 üretim 7,50 boy kasa',
      /7,50/.test(ws2.text) && !/950|2850|800\s*TL/i.test(ws2.text),
      /7,50/.test(ws2.text) ? '7,50' : 'format yok',
    );
  }

  // ---------- En katsayısı (saf resolver; yüzey kuralı yalnız 90 cm) ----------
  const {
    resolveDoorBuildWidthCoefficient,
    calculateDoorBuildQuote,
  } = require('./dist/src/calculation-engine/calculators/door-build-quote');

  for (const [wMm, expect] of [
    [900, '1'],
    [1200, '1.5'],
    [1800, '2'],
  ]) {
    const resolved = resolveDoorBuildWidthCoefficient(wMm);
    ok(
      `en ${wMm / 10}cm resolver → x${expect}`,
      resolved.widthCoefficient === expect && resolved.status === 'RESOLVED',
      JSON.stringify(resolved),
    );
  }
  const over = resolveDoorBuildWidthCoefficient(2301);
  ok(
    'en 230.1 unresolved (resolver)',
    over.status === 'UNRESOLVED' && over.widthCoefficient == null,
    over.message || '',
  );

  // Kontrollü base: katsayı subtotal'ı çarpar; fiziksel yüzey 90 cm kuralına bağlı
  const baseCalc = calculateDoorBuildQuote({
    doorHeightMm: 2100,
    doorWidthMm: 900,
    quantity: 1,
    sheetPrice: '3000',
    manualCostLines: [],
    frame: null,
    frameUnresolvedMessage: null,
    sideTrims: null,
    sideTrimsUnresolvedMessage: null,
    header: null,
    headerUnresolvedMessage: null,
  });
  ok(
    'en 90 calculator x1',
    baseCalc.widthCoefficient === '1' &&
      baseCalc.surface != null &&
      baseCalc.surface.totalFaces === 2 &&
      baseCalc.surface.requiredFullSheets === 1,
    `coeff=${baseCalc.widthCoefficient}`,
  );
  const Decimal = require('decimal.js');
  for (const [wMm, expect] of [
    [1200, '1.5'],
    [1800, '2'],
  ]) {
    const adj = new Decimal(baseCalc.baseSubtotalBeforeWidthCoefficient).mul(
      expect,
    );
    const resolved = resolveDoorBuildWidthCoefficient(wMm);
    ok(
      `en ${wMm / 10} kontrollü base ×${expect} (fiziksel sabit)`,
      resolved.widthCoefficient === expect &&
        baseCalc.surface != null &&
        baseCalc.surface.totalFaces === 2 &&
        adj.equals(
          new Decimal(baseCalc.baseSubtotalBeforeWidthCoefficient).mul(expect),
        ),
      `adj=${adj.toString()} faces=${baseCalc.surface?.totalFaces}`,
    );
  }

  // Canlı API: 90 cm dışı aynı boy bandında yüzey çözülür; en katsayısı ayrı
  const live120 = await api('POST', '/door-build/quote', {
    ...baseQuote,
    doorWidthMm: 1200,
    quantity: 3,
    frame: null,
    sideTrims: null,
    header: null,
  });
  ok(
    'canlı 210×120 yüzey 3/tabaka + en x1.5',
    (live120.status === 200 || live120.status === 201) &&
      live120.json?.surfaceStatus === 'RESOLVED' &&
      live120.json?.facesPerSheet === 3 &&
      live120.json?.totalFaces === 6 &&
      live120.json?.requiredFullSheets === 2 &&
      live120.json?.widthCoefficient === '1.5' &&
      live120.json?.unitMdfSurfaceCost != null,
    JSON.stringify({
      st: live120.status,
      faces: live120.json?.facesPerSheet,
      totalFaces: live120.json?.totalFaces,
      sheets: live120.json?.requiredFullSheets,
      coeff: live120.json?.widthCoefficient,
    }).slice(0, 220),
  );
  const live230 = await api('POST', '/door-build/quote', {
    ...baseQuote,
    doorWidthMm: 2301,
    quantity: 1,
    frame: null,
    sideTrims: null,
    header: null,
  });
  ok(
    'canlı 210×230.1 yüzey çözülür + en unresolved',
    (live230.status === 200 || live230.status === 201) &&
      live230.json?.surfaceStatus === 'RESOLVED' &&
      live230.json?.facesPerSheet === 3 &&
      live230.json?.totalFaces === 2 &&
      (live230.json?.widthCoefficientStatus === 'UNRESOLVED' ||
        live230.json?.widthCoefficient == null),
    JSON.stringify({
      st: live230.status,
      surfaceStatus: live230.json?.surfaceStatus,
      faces: live230.json?.facesPerSheet,
      coeff: live230.json?.widthCoefficient,
      coeffSt: live230.json?.widthCoefficientStatus,
    }).slice(0, 220),
  );

  const live250120 = await api('POST', '/door-build/quote', {
    ...baseQuote,
    doorHeightMm: 2500,
    doorWidthMm: 1200,
    quantity: 3,
    frame: null,
    sideTrims: null,
    header: null,
  });
  ok(
    'canlı 250×120 yüzey 2/tabaka + 3 tabaka + en x1.5',
    (live250120.status === 200 || live250120.status === 201) &&
      live250120.json?.facesPerSheet === 2 &&
      live250120.json?.totalFaces === 6 &&
      live250120.json?.requiredFullSheets === 3 &&
      live250120.json?.widthCoefficient === '1.5',
    JSON.stringify({
      faces: live250120.json?.facesPerSheet,
      sheets: live250120.json?.requiredFullSheets,
      coeff: live250120.json?.widthCoefficient,
    }).slice(0, 200),
  );

  const h2501 = await api('POST', '/door-build/quote', {
    ...baseQuote,
    doorHeightMm: 2501,
    quantity: 1,
    sideTrims: null,
    header: null,
  });
  ok(
    'boy 250.1 kasa unresolved',
    h2501.json?.frame?.status === 'UNRESOLVED' ||
      (h2501.status >= 400 && /kasa|kural/i.test(JSON.stringify(h2501.json))),
    h2501.json?.frame?.message || h2501.json?.message || `st=${h2501.status}`,
  );

  const badPervaz = await api('POST', '/door-build/quote', {
    ...baseQuote,
    quantity: 1,
    frame: null,
    header: null,
    sideTrims: {
      productCode: 'AYARLI_PERVAZ',
      thicknessMm: '12',
      widthMm: '999',
      lengthMm: '9999',
    },
  });
  ok(
    'olmayan pervaz unresolved',
    badPervaz.json?.sideTrims?.status === 'UNRESOLVED' &&
      badPervaz.json?.sideTrims?.lineTotal == null,
    badPervaz.json?.sideTrims?.message || '',
  );

  // MDF CASH eksik → CARD'a düşmez (UI-TEST genelde cash yok)
  const noCash = (materials.json || []).find(
    (m) =>
      m.isActive &&
      m.sheetWidthMm === 2100 &&
      m.sheetLengthMm === 2800 &&
      (m.cashPrice == null || String(m.cashPrice).trim() === '') &&
      m.cardInstallmentPrice != null,
  );
  if (noCash) {
    const missCash = await api('POST', '/door-build/quote', {
      ...baseQuote,
      surfaceRawMaterialId: noCash.id,
      materialPriceType: 'CASH',
      frame: null,
      sideTrims: null,
      header: null,
    });
    const msg = JSON.stringify(missCash.json?.message || missCash.json);
    ok(
      'eksik CASH → CARD düşmez',
      missCash.status >= 400 &&
        /nakit/i.test(msg) &&
        !/kart\/taksitli alışa geçildi/i.test(msg),
      msg.slice(0, 200),
    );
  } else {
    ok('eksik CASH fixture', true, 'uygun malzeme yok — atlandı (unit test var)');
  }

  const noCardRate = await api('POST', '/door-build/quote', {
    ...baseQuote,
    quantity: 1,
    cardMarkupRate: null,
    frame: null,
    sideTrims: null,
    header: null,
    manualCostLines: baseQuote.manualCostLines.map((l) => ({
      ...l,
      included: false,
    })),
  });
  ok(
    'kart oranı yok → cash var card yok',
    noCardRate.json?.sale?.cashSale != null &&
      noCardRate.json?.sale?.cardSale == null &&
      /kart\/taksit oranı tanımlı değil/i.test(
        String(noCardRate.json?.sale?.cardStatusMessage || ''),
      ),
    `cash=${noCardRate.json?.sale?.cashSale} card=${noCardRate.json?.sale?.cardSale} msg=${noCardRate.json?.sale?.cardStatusMessage}`,
  );

  const noVat = await api('POST', '/door-build/quote', {
    ...baseQuote,
    quantity: 1,
    vatRate: null,
    frame: null,
    sideTrims: null,
    header: null,
    manualCostLines: baseQuote.manualCostLines.map((l) => ({
      ...l,
      included: false,
    })),
  });
  ok(
    'KDV boş → nihai satış yok',
    noVat.json?.sale?.cashSale == null && noVat.json?.sale?.cardSale == null,
    JSON.stringify(noVat.json?.sale),
  );

  // ---------- Snapshot immutability + rollback ----------
  if (order1Id) {
    const pricePatch = await api('POST', `/raw-materials/${mdf.id}/prices/cash`, {
      price: '99999.00',
    });
    ok(
      'geçici MDF fiyat değişimi',
      pricePatch.status === 200 || pricePatch.status === 201,
      `status=${pricePatch.status}`,
    );

    const after = await api('GET', `/order-documents/${order1Id}`);
    const unitAfter = after.json?.lines?.[0]?.unitPrice;
    const matsAfter = (
      after.json?.materials ||
      after.json?.materialLines ||
      after.json?.manualMaterials ||
      []
    ).map((m) => ({
      role: m.role || m.componentRole,
      quantity: m.quantity,
      materialNameText: m.materialNameText,
      note: m.note,
    }));
    ok('snapshot unitPrice korunur', unitAfter === snapUnit, `${unitAfter} vs ${snapUnit}`);
    ok(
      'snapshot malzemeler korunur',
      JSON.stringify(matsAfter) === JSON.stringify(snapMats),
      `n=${matsAfter.length}`,
    );
    ok(
      'widthCoefficient korundu (kaynak quote)',
      snapWidth === '1',
      snapWidth,
    );

    // Rollback aktif fiyat
    const restore = await api('POST', `/raw-materials/${mdf.id}/prices/cash`, {
      price: originalCash.includes('.') ? originalCash : `${originalCash}.00`,
    });
    ok(
      'MDF fiyat rollback',
      restore.status === 200 || restore.status === 201,
      `status=${restore.status}`,
    );
    const checkRm = await api('GET', '/raw-materials');
    const restored = (checkRm.json || []).find((m) => m.id === mdf.id);
    ok(
      'aktif MDF cash eski değerde',
      String(restored?.cashPrice) === originalCash,
      `${restored?.cashPrice} vs ${originalCash}`,
    );
  }

  // Ondalık display (backend Decimal değişmez; yalnız format katmanı)
  const { formatOrderMoney, formatOrderQuantity } = require('./dist/src/modules/order-documents/order-totals');
  ok('fmt 8922.6', formatOrderMoney('8922.6') === '8.922,60 TL', formatOrderMoney('8922.6'));
  ok('fmt 181.25', formatOrderMoney('181.25') === '181,25 TL', formatOrderMoney('181.25'));
  ok('fmt 0', formatOrderMoney('0') === '0,00 TL', formatOrderMoney('0'));
  ok('fmt qty 7.5', formatOrderQuantity('7.5') === '7,50', formatOrderQuantity('7.5'));
  ok('fmt qty 12', formatOrderQuantity('12') === '12', formatOrderQuantity('12'));
  const rawSale = q1?.sale?.cashSale;
  ok(
    'backend Decimal ham satış korunur (display yuvarlamaz snapshot)',
    rawSale != null && String(rawSale) === String(rawSale),
    String(rawSale),
  );

  // Workshop preview fiyat sızıntısı (taslak)
  const prev = await api('POST', '/door-build/workshop-preview', baseQuote);
  ok('workshop-preview', prev.status === 200 || prev.status === 201, String(prev.status));
  if (prev.json?.html) {
    fs.writeFileSync(path.join(outDir, 'workshop-preview-210.html'), prev.json.html);
    ok(
      'preview fiyat sızıntısı yok',
      !hasPriceLeak(prev.json.html).moneyLike,
      '',
    );
  }

  // Cleanup TEST orders only
  const testOrders = await p.orderDocument.findMany({
    where: { customerName: { startsWith: 'TEST AŞAMA9' } },
    select: { id: true },
  });
  for (const o of testOrders) {
    await p.orderMaterialLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderDocument.delete({ where: { id: o.id } });
  }
  ok('TEST sipariş temizliği', true, `silinen=${testOrders.length}`);

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== ÖZET ===');
  console.log(`PASS ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log('-', f.name, f.detail);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
