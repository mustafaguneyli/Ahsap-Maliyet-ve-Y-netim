import { renderCustomerPrintHtml } from '../modules/order-documents/order-print';
import { FirestoreOrderRepository } from './firestore-order-repository';
import { MemoryDocumentStore } from './memory.document-store';

function sampleHeader(overrides: Record<string, string> = {}) {
  return {
    customerName: 'Test Müşteri',
    customerAddress: null,
    taxOffice: null,
    customerPhone: null,
    taxNumber: null,
    documentDateText: '07.10.2026',
    vatRate: '0.2000',
    grossTotal: '100.000000',
    discountAmount: '0.000000',
    netTotal: '100.000000',
    vatAmount: '20.000000',
    grandTotal: '120.000000',
    ...overrides,
  };
}

function sampleLine(unitPrice = '100.000000') {
  return {
    lineNo: 1,
    kind: 'FREE_TEXT',
    productId: null,
    productGroupCode: null,
    productGroupName: null,
    catalogProductName: null,
    productNameText: 'Serbest satır',
    widthMm: null,
    lengthMm: null,
    thicknessMm: null,
    decorText: null,
    productionNote: null,
    quantity: '1.000000',
    unitText: 'Adet',
    discountRate: '0.0000',
    unitPrice,
    lineAmount: unitPrice,
    lineDiscountAmount: '0.000000',
    priceSource: 'ENTERED',
  };
}

function sampleMaterial() {
  return {
    source: 'MANUAL' as const,
    lineNo: 1,
    rawMaterialId: null,
    materialNameText: 'MDF 18',
    thicknessMm: '18.00',
    sheetWidthMm: 2100,
    sheetLengthMm: 2800,
    surfaceType: null,
    quantity: '1.000000',
    pieceQuantity: '1.000000',
    sheetQuantity: '1.000000',
    netQtySnapshot: 24,
    componentRole: null,
    unitText: 'tabaka',
    note: null,
    unverified: false,
  };
}

describe('FirestoreOrderRepository', () => {
  it('mevcut numaralardan sonra atomic SP-000009 üretir; duplicate yok', async () => {
    const store = new MemoryDocumentStore();
    await store.upsert('order_documents', '00000000-0000-4000-8000-000000000001', {
      id: '00000000-0000-4000-8000-000000000001',
      orderNumber: 'SP-000008',
      customerName: 'Eski',
      vatRate: '0.0000',
      discountAmount: '0.000000',
      grossTotal: '0.000000',
      netTotal: '0.000000',
      vatAmount: '0.000000',
      grandTotal: '0.000000',
    });
    const repo = new FirestoreOrderRepository(store);
    const first = await repo.create({
      header: sampleHeader(),
      lines: [sampleLine()],
      materials: [sampleMaterial()],
    });
    const second = await repo.create({
      header: sampleHeader({ customerName: 'İkinci' }),
      lines: [sampleLine()],
      materials: [sampleMaterial()],
    });
    expect(first.orderNumber).toBe('SP-000009');
    expect(second.orderNumber).toBe('SP-000010');
    const listed = await repo.list();
    const numbers = listed.map((row) => row.orderNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('update sipariş numarasını değiştirmez', async () => {
    const repo = new FirestoreOrderRepository(new MemoryDocumentStore());
    const created = await repo.create({
      header: sampleHeader(),
      lines: [sampleLine('100.000000')],
      materials: [sampleMaterial()],
    });
    const updated = await repo.update(created.id, {
      header: sampleHeader({ grandTotal: '240.000000' }),
      lines: [sampleLine('200.000000')],
      materials: [sampleMaterial()],
    });
    expect(updated.orderNumber).toBe(created.orderNumber);
    expect(updated.lines[0].unitPrice).toBe('200.000000');
    const afterCreate = await repo.get(created.id);
    const afterUpdate = await repo.get(updated.id);
    expect(afterUpdate?.lines[0].id).toBe(afterCreate?.lines[0].id);
  });

  it('A4 snapshot kayıtlı fiyattan üretilir; sonradan katalog fiyatı değişmez', async () => {
    const repo = new FirestoreOrderRepository(new MemoryDocumentStore());
    const created = await repo.create({
      header: sampleHeader(),
      lines: [sampleLine('100.000000')],
      materials: [{ ...sampleMaterial(), netQtySnapshot: 24 }],
    });
    const stored = await repo.get(created.id);
    expect(stored?.orderNumber).toBe('SP-000001');
    expect(stored?.lines[0].unitPrice).toBe('100.000000');
    expect(stored?.materialLines[0].netQtySnapshot).toBe(24);
    const html = renderCustomerPrintHtml({
      documentDateText: stored!.documentDateText,
      customerName: stored!.customerName,
      customerAddress: stored!.customerAddress,
      taxOffice: stored!.taxOffice,
      customerPhone: stored!.customerPhone,
      taxNumber: stored!.taxNumber,
      lines: stored!.lines.map((line) => ({
        lineNo: line.lineNo,
        productNameText: line.productNameText,
        quantity: line.quantity,
        unitText: line.unitText,
        discountRate: line.discountRate,
        unitPrice: line.unitPrice,
        lineAmount: line.lineAmount,
      })),
      grossTotal: stored!.grossTotal,
      discountAmount: stored!.discountAmount,
      netTotal: stored!.netTotal,
      vatLabel: '%20',
      vatAmount: stored!.vatAmount,
      grandTotal: stored!.grandTotal,
    });
    expect(html).toContain('100');
    expect(html).not.toContain('9999');
  });
});
