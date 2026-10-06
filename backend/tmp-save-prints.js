const fs = require('fs');
const id = 'c9c1172d-7158-47c0-baf0-9304a54f5cf5';

async function save(file, path) {
  const t = await fetch(`http://127.0.0.1:3000${path}`).then((r) => r.text());
  fs.writeFileSync(file, t);
  return {
    len: t.length,
    sheets: (t.match(/class="sheet"/g) || []).length,
    forms: (t.match(/class="form"/g) || []).length,
    logo: (t.match(/zirve-logo|data:image/g) || []).length,
    yeni: (t.match(/YENİ TOPLAM/g) || []).length,
    genel: (t.match(/GENEL TOPLAM/g) || []).length,
    sp: t.includes('SP-000008'),
    priceLike: /₺50|₺80|İSKONTO|BİRİM FİYATI|GENEL TOPLAM|unitPrice/i.test(t),
    hasFirma: t.includes('TEST AŞAMA5 Müşteri A'),
  };
}

(async () => {
  console.log(
    'CUSTOMER',
    await save(
      'tmp-customer-print.html',
      `/order-documents/${id}/prints/customer-priced.html`,
    ),
  );
  console.log(
    'WORKSHOP',
    await save(
      'tmp-workshop-print.html',
      `/order-documents/${id}/prints/workshop-material.html`,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
