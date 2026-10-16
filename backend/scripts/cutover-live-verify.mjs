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
  return {
    method,
    path,
    code: res.status,
    ms: Date.now() - started,
    json,
    text: text.slice(0, 800),
  };
}

function pickRow(rows, w, l) {
  return (rows ?? []).find(
    (r) => Number(r.widthCm) === w && Number(r.lengthCm) === l,
  );
}

function sample(obj, keys) {
  const out = {};
  for (const key of keys) out[key] = obj?.[key];
  return out;
}

const report = {};

const health = await api('GET', '/health');
report.health = { code: health.code, json: health.json };

const [
  groups,
  materials,
  yields,
  products,
  pricing,
  extras,
  catalog,
] = await Promise.all([
  api('GET', '/product-groups'),
  api('GET', '/raw-materials'),
  api('GET', '/production-yields'),
  api('GET', '/products'),
  api('GET', '/pricing-settings/door-frame/34_MM'),
  api('GET', '/extra-costs?productGroup=door_frame'),
  api('GET', '/order-documents/catalog'),
]);

const groupItems = groups.json?.items ?? groups.json ?? [];
const materialItems = Array.isArray(materials.json) ? materials.json : materials.json?.items ?? [];
const yieldItems = Array.isArray(yields.json) ? yields.json : yields.json?.items ?? [];
const productItems = Array.isArray(products.json) ? products.json : products.json?.items ?? [];

report.reads = {
  groups: { code: groups.code, count: Array.isArray(groupItems) ? groupItems.length : 0, ms: groups.ms },
  materials: { code: materials.code, count: materialItems.length, ms: materials.ms },
  yields: { code: yields.code, count: yieldItems.length, ms: yields.ms },
  products: { code: products.code, count: productItems.length, ms: products.ms },
  pricing34: { code: pricing.code, profitRate: pricing.json?.profitRate },
  extras: extras.code,
  catalog: { code: catalog.code, ms: catalog.ms, groups: catalog.json?.groups?.length ?? catalog.json?.items?.length },
};

const df = await api('GET', '/cost-calculation/door-frame/mdf?variant=34_MM');
const dfRows = df.json?.rows ?? [];
report.doorFrame = {
  code: df.code,
  ms: df.ms,
  variant: df.json?.variant,
  profitRate: df.json?.profitRate ?? dfRows[0]?.pricing?.profitRate,
  sizes: [ [10, 210], [11, 210], [12, 210] ].map(([w, l]) => {
    const row = pickRow(dfRows, w, l);
    return {
      size: `${w}x${l}`,
      found: Boolean(row),
      productionCost: row?.productionCost,
      profitRate: row?.pricing?.profitRate,
      cashSale: row?.pricing?.cashSalePrice,
      cardSale: row?.pricing?.cardSalePrice,
    };
  }),
};

const [ayarli, deko, genis] = await Promise.all([
  api('GET', '/cost-calculation/pervaz/ayarli'),
  api('GET', '/cost-calculation/pervaz/dekoratif'),
  api('GET', '/cost-calculation/pervaz/dekoratif-genis-kilcik'),
]);
function pervazSummary(res) {
  const rows = res.json?.rows ?? res.json?.items ?? (Array.isArray(res.json) ? res.json : []);
  const first = rows[0];
  return {
    code: res.code,
    ms: res.ms,
    count: rows.length,
    sample: first
      ? {
          thickness: first.thicknessMm ?? first.thickness,
          width: first.widthMm ?? first.widthCm,
          length: first.lengthMm ?? first.lengthCm,
          net: first.netQty,
          productionCost: first.productionCost,
          cash: first.pricing?.cashSalePrice ?? first.cashSalePrice,
          missing: first.missingReason ?? first.pricing?.missingReason,
        }
      : null,
  };
}
report.pervaz = {
  ayarli: pervazSummary(ayarli),
  dekoratif: pervazSummary(deko),
  genisKilcik: pervazSummary(genis),
};

const [supDuz, supDek, supDuzPp, supDekPp] = await Promise.all([
  api('GET', '/cost-calculation/supurgelik?variant=DUZ'),
  api('GET', '/cost-calculation/supurgelik?variant=DEKORATIF'),
  api('GET', '/cost-calculation/supurgelik?variant=DUZ_PP_SARMA'),
  api('GET', '/cost-calculation/supurgelik?variant=DEKORATIF_PP_SARMA'),
]);
function zeroFake(rows) {
  return (rows ?? []).filter((r) => {
    const cash = Number(r.pricing?.cashSalePrice ?? r.cashSalePrice ?? NaN);
    const missing = r.missingReason ?? r.pricing?.missingReason;
    return missing && cash === 0;
  }).length;
}
function supSummary(res, label) {
  const rows = res.json?.rows ?? [];
  return {
    label,
    code: res.code,
    ms: res.ms,
    count: rows.length,
    missing: rows.filter((r) => r.missingReason ?? r.pricing?.missingReason).length,
    zeroWithMissing: zeroFake(rows),
    sample: rows[0]
      ? {
          productionCost: rows[0].productionCost,
          cash: rows[0].pricing?.cashSalePrice,
          missing: rows[0].missingReason ?? rows[0].pricing?.missingReason,
        }
      : null,
  };
}
report.supurgelik = [
  supSummary(supDuz, 'DUZ'),
  supSummary(supDek, 'DEKORATIF'),
  supSummary(supDuzPp, 'DUZ_PP_SARMA'),
  supSummary(supDekPp, 'DEKORATIF_PP_SARMA'),
];

const cita = await api('GET', '/cost-calculation/cita');
const citaRows = cita.json?.rows ?? [];
report.cita = {
  code: cita.code,
  ms: cita.ms,
  count: citaRows.length,
  missing: citaRows.filter((r) => (r.missingReason ?? r.pricing?.missingReason ?? '').includes('CITA')).length,
  zeroWithMissing: zeroFake(citaRows),
  sample: citaRows[0]
    ? {
        cash: citaRows[0].pricing?.cashSalePrice ?? citaRows[0].cashSalePrice,
        card: citaRows[0].pricing?.cardSalePrice ?? citaRows[0].cardSalePrice,
        missing: citaRows[0].missingReason ?? citaRows[0].pricing?.missingReason,
      }
    : null,
};

const priceList = await api('GET', '/price-list');
const plGroups = priceList.json?.groups ?? priceList.json?.sections ?? [];
const plRows = priceList.json?.rows ?? [];
report.priceList = {
  code: priceList.code,
  ms: priceList.ms,
  keys: priceList.json ? Object.keys(priceList.json).slice(0, 12) : [],
  groupCount: Array.isArray(plGroups) ? plGroups.length : 0,
  rowCount: Array.isArray(plRows) ? plRows.length : priceList.json?.rowCount,
  missingCount: priceList.json?.missingCount,
};

const mat = materialItems.find((m) => m.isActive !== false) ?? materialItems[0];
const genericBody = {
  productGroupCode: 'TEST_CUTOVER_GROUP',
  productGroupName: 'Cutover Test Grup',
  productCode: 'TEST_CUTOVER_PRODUCT',
  productName: 'Cutover Test Ürün',
  productUnit: 'ADET',
  widthMm: 80,
  lengthMm: 2100,
  displayName: '8×210',
  recipeItems: [
    {
      rawMaterialId: mat?.id,
      calculationMode: 'PER_SHEET_YIELD',
      quantity: '1',
      newNetQty: 18,
      pieceWidthMm: 80,
      pieceLengthMm: 2100,
      sortOrder: 1,
    },
  ],
  extraCosts: [
    { typeCode: 'CUTTING', amount: '5', calculationMode: 'FIXED', scope: 'GROUP' },
  ],
  profitRate: '20',
};
const preview = await api('POST', '/cost-calculation/generic-preview', genericBody);
const existingGeneric = await api('GET', '/cost-calculation/generic?productGroupCode=TEST_CUTOVER_GROUP');
const existingRows = existingGeneric.json?.rows ?? [];
let save = { code: 0, json: null, text: 'skipped' };
if (existingRows.length === 0) {
  save = await api('POST', '/cost-calculation/catalog-items', {
    mode: 'NEW_GROUP',
    newGroupCode: 'TEST_CUTOVER_GROUP',
    newGroupName: 'Cutover Test Grup',
    newProductCode: 'TEST_CUTOVER_PRODUCT',
    productName: 'Cutover Test Ürün',
    productUnit: 'ADET',
    widthMm: 80,
    lengthMm: 2100,
    displayName: '8×210',
    recipeItems: genericBody.recipeItems,
    extraCosts: genericBody.extraCosts,
    profitRate: '20',
    reason: 'Cutover live write test',
  });
}
const dup = await api('POST', '/cost-calculation/catalog-items', {
  mode: 'NEW_GROUP',
  newGroupCode: 'TEST_CUTOVER_GROUP',
  newGroupName: 'Cutover Test Grup',
  newProductCode: 'TEST_CUTOVER_PRODUCT',
  productName: 'Cutover Test Ürün',
  productUnit: 'ADET',
  widthMm: 80,
  lengthMm: 2100,
  recipeItems: genericBody.recipeItems,
  reason: 'duplicate unique guard',
});
const genericList = await api('GET', '/cost-calculation/generic?productGroupCode=TEST_CUTOVER_GROUP');
const genericRows = genericList.json?.rows ?? [];
const genericProductId =
  save.json?.productId ??
  genericRows[0]?.productId ??
  'bad98a91-24bc-4311-98e5-69a2f967bd0e';
const genericRecipeId =
  save.json?.recipeId ??
  genericRows[0]?.recipeId ??
  '47d91ae6-88d6-453e-97c0-0c388eddbc56';
const catalogHasGeneric = JSON.stringify(catalog.json ?? {}).includes('TEST_CUTOVER');
report.generic = {
  preview: preview.code,
  previewErr: preview.code >= 400 ? preview.text : null,
  save: save.code,
  saveMode: save.json?.mode,
  uniqueDup: dup.code,
  list: genericList.code,
  listRows: genericRows.length,
  sampleCash: genericRows[0]?.pricing?.cashSalePrice ?? genericRows[0]?.cashSalePrice,
  catalogHasGeneric,
  productId: genericProductId,
  recipeId: genericRecipeId,
};

const before10 = pickRow(dfRows, 10, 210);
const before11 = pickRow(dfRows, 11, 210);
const ov = await api('POST', '/pricing-settings/profit-rate', {
  productGroupCode: 'door_frame',
  productCode: '34_MM',
  widthMm: 100,
  lengthMm: 2100,
  profitRate: '25',
  reason: 'Cutover profit override test 20->25',
});
const afterDf = await api('GET', '/cost-calculation/door-frame/mdf?variant=34_MM');
const after10 = pickRow(afterDf.json?.rows, 10, 210);
const after11 = pickRow(afterDf.json?.rows, 11, 210);
const noop = await api('POST', '/pricing-settings/profit-rate', {
  productGroupCode: 'door_frame',
  productCode: '34_MM',
  widthMm: 100,
  lengthMm: 2100,
  profitRate: '25',
  reason: 'Cutover profit override no-op',
});
const restore = await api('POST', '/pricing-settings/profit-rate', {
  productGroupCode: 'door_frame',
  productCode: '34_MM',
  widthMm: 100,
  lengthMm: 2100,
  profitRate: null,
  reason: 'Cutover profit override restore',
});
const finalDf = await api('GET', '/cost-calculation/door-frame/mdf?variant=34_MM');
const final10 = pickRow(finalDf.json?.rows, 10, 210);
report.profit = {
  ov: ov.code,
  ovSource: ov.json?.source,
  ovRate: ov.json?.profitRate,
  ovChanged: ov.json?.changed,
  noopChanged: noop.json?.changed,
  before10: { pr: before10?.pricing?.profitRate, cash: before10?.pricing?.cashSalePrice },
  after10: { pr: after10?.pricing?.profitRate, cash: after10?.pricing?.cashSalePrice },
  after11same: after11?.pricing?.cashSalePrice === before11?.pricing?.cashSalePrice,
  restore: restore.code,
  restoreChanged: restore.json?.changed,
  final10: { pr: final10?.pricing?.profitRate, cash: final10?.pricing?.cashSalePrice },
  ovText: ov.code >= 400 ? ov.text : undefined,
};

const createOrder = await api('POST', '/order-documents', {
  customerName: 'CUTOVER TEST',
  vatRate: '0.20',
  documentDateText: '08.10.2026',
  lines: [
    {
      kind: 'FREE_TEXT',
      productNameText: 'Cutover test satiri',
      quantity: '1',
      unitText: 'ADET',
      discountRate: '0',
      unitPrice: '100',
      priceSource: 'ENTERED',
    },
  ],
});
const orderId = createOrder.json?.id;
const orderNo = createOrder.json?.orderNumber;
const detail1 = orderId ? await api('GET', `/order-documents/${orderId}`) : { code: 0 };
const snapshotGross = detail1.json?.grossTotal;
const update = orderId
  ? await api('PUT', `/order-documents/${orderId}`, {
      customerName: 'CUTOVER TEST UPDATED',
      vatRate: '0.20',
      documentDateText: '08.10.2026',
      lines: [
        {
          kind: 'FREE_TEXT',
          productNameText: 'Cutover test satiri',
          quantity: '2',
          unitText: 'ADET',
          discountRate: '0',
          unitPrice: '100',
          priceSource: 'ENTERED',
        },
      ],
    })
  : { code: 0, json: null, text: '' };
const recalc = orderId
  ? await api('POST', `/order-documents/${orderId}/materials/recalculate`, { confirm: true })
  : { code: 0 };
const printNew = orderId ? await api('GET', `/order-documents/${orderId}/prints/combined.html`) : { code: 0, text: '' };
const workshop = orderId ? await api('GET', `/order-documents/${orderId}/prints/workshop-material.html`) : { code: 0, text: '' };
const afterSourceChange = orderId ? await api('GET', `/order-documents/${orderId}`) : { code: 0 };
report.order = {
  create: createOrder.code,
  number: orderNo,
  id: orderId,
  detail: detail1.code,
  snapshotGross,
  update: update.code,
  updateName: update.json?.customerName,
  updateQty: update.json?.lines?.[0]?.quantity,
  updateErr: update.code >= 400 ? update.text : undefined,
  recalc: recalc.code,
  print: printNew.code,
  workshop: workshop.code,
  workshopHasPrice: /100[,.]00/.test(workshop.text) && /TL/.test(workshop.text),
  snapshotUnchanged: afterSourceChange.json?.grossTotal === snapshotGross,
  createErr: createOrder.code >= 400 ? createOrder.text : undefined,
};

const listed = await api('GET', '/order-documents');
const listedItems = listed.json?.items ?? listed.json ?? [];
const existing = (Array.isArray(listedItems) ? listedItems : []).slice(0, 12);
const existingChecks = [];
for (const row of existing) {
  const id = row.id;
  const det = await api('GET', `/order-documents/${id}`);
  const html = await api('GET', `/order-documents/${id}/prints/combined.html`);
  existingChecks.push({
    id,
    number: row.orderNumber ?? det.json?.orderNumber,
    detail: det.code,
    print: html.code,
    grand: det.json?.grandTotal,
    snapshot: Boolean(det.json?.lines?.[0]?.unitPrice),
  });
}
report.existingOrders = { list: listed.code, count: Array.isArray(listedItems) ? listedItems.length : 0, checks: existingChecks };

const surface =
  materialItems.find((m) => String(m.thicknessMm).startsWith('16') && Number(m.sheetWidthMm) === 2100) ??
  materialItems.find((m) => String(m.name ?? '').toLowerCase().includes('zımpara')) ??
  materialItems[0];
const dbQuote = await api('POST', '/door-build/quote', {
  doorHeightMm: 2100,
  doorWidthMm: 900,
  quantity: 1,
  surfaceRawMaterialId: surface?.id,
  frame: {
    productCode: '34_MM',
    widthMm: 100,
    lengthMm: 2100,
    totalBoyQuantity: '2.5',
  },
  sideTrims: {
    productCode: 'AYARLI_PERVAZ',
    thicknessMm: '12',
    widthMm: '100',
    lengthMm: '2200',
  },
  manualCostLines: [],
  profitRate: '20',
  vatRate: '20',
  cardMarkupRate: '10',
});
const wsPrev = await api('POST', '/door-build/workshop-preview', {
  doorHeightMm: 2100,
  doorWidthMm: 900,
  quantity: 1,
  surfaceRawMaterialId: surface?.id,
  manualCostLines: [],
});
const wsText = wsPrev.json?.html ?? wsPrev.text;
report.doorBuild = {
  surface: sample(surface, ['id', 'code', 'name', 'thicknessMm']),
  quote: dbQuote.code,
  ms: dbQuote.ms,
  frame: dbQuote.json?.frame?.status,
  frameCost: dbQuote.json?.frame?.lineTotal ?? dbQuote.json?.frame?.productionCost,
  sale: dbQuote.json?.sale
    ? sample(dbQuote.json.sale, ['status', 'cashSale', 'cardSale', 'profitRate', 'vatRate', 'vatAmount'])
    : null,
  cashTop: dbQuote.json?.cashSale,
  cardTop: dbQuote.json?.cardSale,
  workshop: wsPrev.code,
  workshopA4: typeof wsText === 'string' && wsText.includes('@page'),
  err: dbQuote.code >= 400 ? dbQuote.text : undefined,
};

const deactSize = await api('POST', '/cost-calculation/catalog-items/deactivate', {
  target: 'SIZE',
  recipeId: genericRecipeId,
  reason: 'Cutover live test size off',
});
const deactProduct = await api('POST', '/cost-calculation/catalog-items/deactivate', {
  target: 'PRODUCT',
  productId: genericProductId,
  reason: 'Cutover live test product off',
});
const deactGroup = await api('POST', '/cost-calculation/catalog-items/deactivate', {
  target: 'GROUP',
  productGroupCode: 'TEST_CUTOVER_GROUP',
  reason: 'Cutover live test group off',
});
report.generic.deactivate = {
  size: deactSize.code,
  product: deactProduct.code,
  group: deactGroup.code,
  sizeErr: deactSize.code >= 400 ? deactSize.text : undefined,
  productErr: deactProduct.code >= 400 ? deactProduct.text : undefined,
  groupErr: deactGroup.code >= 400 ? deactGroup.text : undefined,
};

console.log(JSON.stringify(report, null, 2));
