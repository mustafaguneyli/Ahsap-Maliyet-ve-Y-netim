const BASE = 'https://zirve-ahsap-backend-wu6qaogkka-ew.a.run.app';

async function api(method, path, body) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { code: res.status, ms: Date.now() - started, json, text: text.slice(0, 600) };
}

const report = {};

const groupsAfter = await api('GET', '/product-groups');
report.groupsAfterDeactivate = {
  code: groupsAfter.code,
  count: (groupsAfter.json?.items ?? groupsAfter.json ?? []).length,
  codes: (groupsAfter.json?.items ?? groupsAfter.json ?? []).map((g) => g.code),
};

const codes = [
  'DUZ_SUPURGELIK',
  'DEKORATIF_SUPURGELIK',
  'DUZ_PP_SARMA_SUPURGELIK',
  'DEKORATIF_PP_SARMA_SUPURGELIK',
];
report.supurgelik = [];
for (const productCode of codes) {
  const res = await api('GET', `/cost-calculation/supurgelik?productCode=${productCode}`);
  const rows = res.json?.rows ?? [];
  const zeroFake = rows.filter((r) => {
    const cash = Number(r.pricing?.cashSalePrice ?? r.cashSalePrice ?? NaN);
    const missing = r.missingReason ?? r.pricing?.missingReason;
    return Boolean(missing) && cash === 0;
  }).length;
  report.supurgelik.push({
    productCode,
    code: res.code,
    ms: res.ms,
    count: rows.length,
    missing: rows.filter((r) => r.missingReason ?? r.pricing?.missingReason).length,
    zeroWithMissing: zeroFake,
    sample: rows[0]
      ? {
          keys: Object.keys(rows[0]),
          productionCost: rows[0].productionCost,
          cash: rows[0].pricing?.cashSalePrice,
          missing: rows[0].missingReason ?? rows[0].pricing?.missingReason,
        }
      : res.text,
  });
}

const cita = await api('GET', '/cost-calculation/cita/list');
const citaRows = cita.json?.rows ?? [];
report.cita = {
  code: cita.code,
  ms: cita.ms,
  count: citaRows.length,
  missing: citaRows.filter((r) =>
    String(r.missingReason ?? r.pricing?.missingReason ?? '').includes('CITA'),
  ).length,
  zeroWithMissing: citaRows.filter((r) => {
    const cash = Number(r.pricing?.cashSalePrice ?? r.publishedCash ?? r.cashSalePrice ?? NaN);
    const missing = r.missingReason ?? r.pricing?.missingReason;
    return Boolean(missing) && cash === 0;
  }).length,
  sample: citaRows[0]
    ? {
        keys: Object.keys(citaRows[0]),
        cash: citaRows[0].pricing?.cashSalePrice ?? citaRows[0].publishedCashPrice,
        card: citaRows[0].pricing?.cardSalePrice ?? citaRows[0].publishedCardPrice,
        missing: citaRows[0].missingReason ?? citaRows[0].pricing?.missingReason,
      }
    : cita.text,
};

const ayarli = await api('GET', '/cost-calculation/pervaz/ayarli');
const aRow = (ayarli.json?.rows ?? [])[0];
report.pervazKeys = aRow ? Object.keys(aRow) : ayarli.text;
report.pervazPricing = aRow?.pricing ?? aRow?.sale ?? null;
report.pervazCash = aRow?.pricing?.cashSalePrice ?? aRow?.cashSalePrice ?? aRow?.salePrice;

const df = await api('GET', '/cost-calculation/door-frame/mdf?variant=34_MM');
const df10 = (df.json?.rows ?? []).find((r) => Number(r.widthCm) === 10 && Number(r.lengthCm) === 210);
const pl = await api('GET', '/price-list');
const groups = pl.json?.groups ?? [];
report.priceList = {
  code: pl.code,
  ms: pl.ms,
  groupNames: groups.map((g) => g.name ?? g.code ?? g.productGroupCode ?? g.title),
  groupRowCounts: groups.map((g) => ({
    name: g.name ?? g.code ?? g.productGroupCode ?? g.title,
    rows: (g.rows ?? g.items ?? []).length,
    missing: g.missingCount,
  })),
  rowCount: pl.json?.rowCount,
  missingCount: pl.json?.missingCount,
};
function flattenPl(gs) {
  const rows = [];
  for (const g of gs) {
    for (const r of g.rows ?? g.items ?? []) rows.push({ group: g.name ?? g.code, ...r });
  }
  return rows;
}
const flat = flattenPl(groups);
const pl10 = flat.find((r) =>
  String(r.sizeText ?? r.size ?? r.displayName ?? '').includes('10') &&
  String(r.sizeText ?? r.size ?? r.displayName ?? '').includes('210') &&
  String(r.productCode ?? r.group ?? r.productName ?? '').includes('34'),
) ?? flat.find((r) => Number(r.widthCm) === 10 && Number(r.lengthCm) === 210);
report.priceListMatch = {
  dfCash: df10?.pricing?.cashSalePrice,
  dfCard: df10?.pricing?.cardSalePrice,
  plRow: pl10
    ? {
        keys: Object.keys(pl10).slice(0, 20),
        cash: pl10.cashSalePrice ?? pl10.pricing?.cashSalePrice ?? pl10.cash,
        card: pl10.cardSalePrice ?? pl10.pricing?.cardSalePrice ?? pl10.card,
        product: pl10.productCode ?? pl10.productName,
        size: pl10.sizeText ?? pl10.size ?? pl10.displayName,
      }
    : null,
  cashMatch: (pl10?.cashSalePrice ?? pl10?.pricing?.cashSalePrice ?? pl10?.cash) === df10?.pricing?.cashSalePrice,
};

const catalog = await api('GET', '/order-documents/catalog');
const catGroups = catalog.json?.groups ?? catalog.json?.items ?? [];
let frameProduct = null;
for (const g of catGroups) {
  for (const p of g.products ?? g.items ?? []) {
    if (p.code === '34_MM' || p.productCode === '34_MM') {
      frameProduct = { group: g.code ?? g.name, ...p };
    }
  }
}
report.catalog34 = frameProduct
  ? { id: frameProduct.id, code: frameProduct.code ?? frameProduct.productCode, name: frameProduct.name }
  : { keys: catalog.json ? Object.keys(catalog.json) : [], sample: JSON.stringify(catalog.json).slice(0, 400) };

let snapshot = {};
if (frameProduct?.id) {
  const quote = await api('POST', '/cost-calculation/order-quote', {
    productId: frameProduct.id,
    quantity: 1,
    widthMm: '100',
    lengthMm: '2100',
  });
  snapshot.quote = {
    code: quote.code,
    unit: quote.json?.unitPrice ?? quote.json?.cashSalePrice ?? quote.json?.suggestedCash,
    err: quote.code >= 400 ? quote.text : undefined,
    keys: quote.json ? Object.keys(quote.json) : [],
  };
  const unitPrice = String(
    quote.json?.unitPrice ??
      quote.json?.cashSale ??
      quote.json?.suggestedCashSale ??
      quote.json?.lineAmount ??
      df10?.pricing?.cashSalePrice ??
      '301',
  );
  const created = await api('POST', '/order-documents', {
    customerName: 'CUTOVER SNAPSHOT',
    vatRate: '0.20',
    documentDateText: '08.10.2026',
    lines: [
      {
        kind: 'CATALOG',
        productId: frameProduct.id,
        productNameText: frameProduct.name ?? '34 MM',
        widthMm: '100',
        lengthMm: '2100',
        quantity: '1',
        unitText: 'ADET',
        discountRate: '0',
        unitPrice,
        priceSource: 'SUGGESTED_CASH',
      },
    ],
  });
  snapshot.create = { code: created.code, number: created.json?.orderNumber, err: created.code >= 400 ? created.text : undefined };
  const beforePrice = created.json?.lines?.[0]?.unitPrice;
  await api('POST', '/pricing-settings/profit-rate', {
    productGroupCode: 'door_frame',
    productCode: '34_MM',
    widthMm: 100,
    lengthMm: 2100,
    profitRate: '25',
    reason: 'snapshot isolation test',
  });
  const afterCalc = await api('GET', '/cost-calculation/door-frame/mdf?variant=34_MM');
  const live10 = (afterCalc.json?.rows ?? []).find((r) => Number(r.widthCm) === 10 && Number(r.lengthCm) === 210);
  const detail = created.json?.id ? await api('GET', `/order-documents/${created.json.id}`) : { json: null };
  snapshot.afterSourceChange = {
    liveCash: live10?.pricing?.cashSalePrice,
    storedUnit: detail.json?.lines?.[0]?.unitPrice,
    storedUnchanged: detail.json?.lines?.[0]?.unitPrice === beforePrice,
    beforePrice,
  };
  await api('POST', '/pricing-settings/profit-rate', {
    productGroupCode: 'door_frame',
    productCode: '34_MM',
    widthMm: 100,
    lengthMm: 2100,
    profitRate: null,
    reason: 'snapshot isolation restore',
  });
  const restored = await api('GET', '/cost-calculation/door-frame/mdf?variant=34_MM');
  const rest10 = (restored.json?.rows ?? []).find((r) => Number(r.widthCm) === 10 && Number(r.lengthCm) === 210);
  snapshot.restoredCash = rest10?.pricing?.cashSalePrice;
}
report.snapshot = snapshot;

const genericList = await api('GET', '/cost-calculation/generic?productGroupCode=TEST_CUTOVER_GROUP');
report.genericAfterDeactivate = {
  code: genericList.code,
  rows: (genericList.json?.rows ?? []).length,
  text: genericList.code >= 400 ? genericList.text : undefined,
};

console.log(JSON.stringify(report, null, 2));
