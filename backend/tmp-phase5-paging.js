/**
 * Sayfalama için 21 TEST siparişi; ardından sayfa 1/2 doğrula ve temizle.
 */
const BASE = 'http://127.0.0.1:3000';
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  const ids = [];
  for (let i = 1; i <= 21; i += 1) {
    const created = await api('POST', '/order-documents', {
      customerName: `TEST AŞAMA5 PAGE ${String(i).padStart(2, '0')}`,
      documentDateText: '01.01.2026',
      vatRate: '20',
      lines: [
        {
          kind: 'FREE_TEXT',
          productNameText: `PAGE LINE ${i}`,
          quantity: '1',
          unitText: 'ADET',
          discountRate: '0',
          unitPrice: String(i),
          priceSource: 'ENTERED',
        },
      ],
    });
    if (created.status >= 200 && created.status < 300) {
      ids.push(created.json);
      console.log('created', created.json.orderNumber);
    } else {
      console.log('FAIL create', i, created.status, created.json);
    }
  }

  const page1 = await api('GET', '/order-documents?page=1&pageSize=20');
  const page2 = await api('GET', '/order-documents?page=2&pageSize=20');
  const items1 = page1.json.items || [];
  const items2 = page2.json.items || [];
  const nos1 = items1.map((x) => x.orderNumber);
  const nos2 = items2.map((x) => x.orderNumber);
  const overlap = nos1.filter((n) => nos2.includes(n));
  console.log('PAGE1', nos1.length, nos1.join(','));
  console.log('PAGE2', nos2.length, nos2.join(','));
  console.log('TOTAL', page1.json.total);
  console.log('OVERLAP', overlap);
  console.log(
    'PAGINATION_OK',
    items1.length === 20 &&
      items2.length >= 1 &&
      overlap.length === 0 &&
      page1.json.total >= 22,
  );

  // DT vs createdAt: documentDateText 01.01.2026 ama createdAt bugün
  const byDt = await api(
    'GET',
    '/order-documents?dateFrom=2026-01-01&dateTo=2026-01-02&pageSize=50',
  );
  const dtItems = byDt.json.items || [];
  console.log(
    'DATE_FILTER_createdAt_not_DT',
    dtItems.length,
    'expected 0 if filter uses createdAt',
    dtItems.map((x) => x.orderNumber).join(','),
  );

  for (const o of ids) {
    await p.orderMaterialLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderDocument.delete({ where: { id: o.id } });
  }
  console.log('cleaned', ids.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
