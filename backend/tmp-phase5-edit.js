/**
 * Düzenleme: miktar/fiyat değişimi, sıra, silme, aynı orderNumber, çift kayıt.
 */
const BASE = 'http://127.0.0.1:3000';
const id = 'c9c1172d-7158-47c0-baf0-9304a54f5cf5';

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
  const before = await api('GET', `/order-documents/${id}`);
  const lines = before.json.lines;
  console.log(
    'BEFORE',
    before.json.orderNumber,
    lines.map((l) => ({ n: l.lineNo, name: l.productNameText, q: l.quantity, p: l.unitPrice })),
  );

  // swap order + change qty of cita to 90 + change pervaz price to 55, keep both
  const swapped = [
    {
      kind: lines[1].kind,
      productId: lines[1].productId || undefined,
      productNameText: lines[1].productNameText,
      widthMm: lines[1].widthMm || undefined,
      lengthMm: lines[1].lengthMm || undefined,
      thicknessMm: lines[1].thicknessMm || undefined,
      quantity: '90',
      unitText: lines[1].unitText,
      discountRate: lines[1].discountRate,
      unitPrice: lines[1].unitPrice,
      priceSource: lines[1].priceSource,
    },
    {
      kind: lines[0].kind,
      productId: lines[0].productId || undefined,
      productNameText: lines[0].productNameText,
      widthMm: lines[0].widthMm || undefined,
      lengthMm: lines[0].lengthMm || undefined,
      thicknessMm: lines[0].thicknessMm || undefined,
      quantity: lines[0].quantity,
      unitText: lines[0].unitText,
      discountRate: lines[0].discountRate,
      unitPrice: '55',
      priceSource: 'ENTERED',
    },
  ];

  const dto = {
    customerName: before.json.customerName,
    customerAddress: before.json.customerAddress || undefined,
    documentDateText: before.json.documentDateText || undefined,
    vatRate: before.json.vatRate,
    lines: swapped,
  };

  const [u1, u2] = await Promise.all([
    api('PUT', `/order-documents/${id}`, dto),
    api('PUT', `/order-documents/${id}`, dto),
  ]);
  console.log('DOUBLE_PUT', u1.status, u2.status, u1.json?.orderNumber, u2.json?.orderNumber);

  const after = await api('GET', `/order-documents/${id}`);
  console.log(
    'AFTER',
    after.json.orderNumber,
    after.json.lines.map((l) => ({
      n: l.lineNo,
      name: l.productNameText,
      q: l.quantity,
      p: l.unitPrice,
    })),
    'grand',
    after.json.grandTotal,
  );

  // restore original sample for report consistency
  const restore = {
    customerName: 'TEST AŞAMA5 Müşteri A',
    customerAddress: 'TEST adres satırı',
    documentDateText: '28.09.2026',
    vatRate: '20',
    lines: [
      {
        kind: lines[0].kind,
        productId: lines[0].productId || undefined,
        productNameText: lines[0].productNameText,
        widthMm: lines[0].widthMm || undefined,
        lengthMm: lines[0].lengthMm || undefined,
        thicknessMm: lines[0].thicknessMm || undefined,
        quantity: '400',
        unitText: 'ADET',
        discountRate: '10',
        unitPrice: '50',
        priceSource: 'ENTERED',
      },
      {
        kind: lines[1].kind,
        productId: lines[1].productId || undefined,
        productNameText: lines[1].productNameText,
        widthMm: lines[1].widthMm || undefined,
        lengthMm: lines[1].lengthMm || undefined,
        thicknessMm: lines[1].thicknessMm || undefined,
        quantity: '100',
        unitText: 'ADET',
        discountRate: '5',
        unitPrice: '80',
        priceSource: 'ENTERED',
      },
    ],
  };
  const r = await api('PUT', `/order-documents/${id}`, restore);
  console.log('RESTORED', r.status, r.json?.orderNumber, r.json?.grandTotal);

  const list = await api('GET', '/order-documents?q=TEST%20A%C5%9EAMA5');
  const count = (list.json.items || []).length;
  console.log('ORDER_COUNT_TEST', count, (list.json.items || []).map((x) => x.orderNumber));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
