import { FIRESTORE_COLLECTIONS } from '../firebase/firestore.collections';
import type { DocumentStore } from './document-store';

export type OrderLineSnapshot = {
  lineNo: number;
  kind: string;
  productId: string | null;
  productGroupCode: string | null;
  productGroupName: string | null;
  catalogProductName: string | null;
  productNameText: string;
  widthMm: string | null;
  lengthMm: string | null;
  thicknessMm: string | null;
  decorText: string | null;
  productionNote: string | null;
  quantity: string;
  unitText: string;
  discountRate: string;
  unitPrice: string;
  lineAmount: string;
  lineDiscountAmount: string;
  priceSource: string;
};

export type OrderMaterialSnapshot = {
  source: string;
  lineNo: number | null;
  rawMaterialId: string | null;
  materialNameText: string;
  thicknessMm: string | null;
  sheetWidthMm: number | null;
  sheetLengthMm: number | null;
  surfaceType: string | null;
  quantity: string | null;
  pieceQuantity: string | null;
  sheetQuantity: string | null;
  netQtySnapshot: number | null;
  componentRole: string | null;
  unitText: string | null;
  note: string | null;
  unverified: boolean;
};

export type OrderHeaderSnapshot = {
  customerName: string;
  customerAddress: string | null;
  taxOffice: string | null;
  customerPhone: string | null;
  taxNumber: string | null;
  documentDateText: string | null;
  vatRate: string;
  grossTotal: string;
  discountAmount: string;
  netTotal: string;
  vatAmount: string;
  grandTotal: string;
};

export type StoredOrder = OrderHeaderSnapshot & {
  id: string;
  orderNumber: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lines: Array<OrderLineSnapshot & { id: string; orderDocumentId: string }>;
  materialLines: Array<OrderMaterialSnapshot & { id: string; orderDocumentId: string }>;
};

/**
 * Sipariş snapshot repository. Katalog fiyatı/NET sonradan değişse bile
 * kayıtlı unitPrice / netQtySnapshot / malzeme satırı değişmez.
 */
export class FirestoreOrderRepository {
  constructor(private readonly store: DocumentStore) {}

  async create(input: {
    header: OrderHeaderSnapshot;
    lines: OrderLineSnapshot[];
    materials: OrderMaterialSnapshot[];
  }): Promise<StoredOrder> {
    const id = this.store.createId();
    return this.store.runTransaction(async (tx) => {
      const orderNumber = await tx.nextOrderNumber();
      const now = new Date();
      await tx.upsert(FIRESTORE_COLLECTIONS.orderDocuments, id, {
        ...input.header,
        id,
        orderNumber,
        createdAt: now,
        updatedAt: now,
      });
      for (const line of input.lines) {
        const lineId = this.store.createId();
        await tx.upsert(FIRESTORE_COLLECTIONS.orderLines, lineId, {
          ...line,
          id: lineId,
          orderDocumentId: id,
        });
      }
      for (const material of input.materials) {
        const materialId = this.store.createId();
        await tx.upsert(FIRESTORE_COLLECTIONS.orderMaterialLines, materialId, {
          ...material,
          id: materialId,
          orderDocumentId: id,
        });
      }
      const auditId = this.store.createId();
      await tx.upsert(FIRESTORE_COLLECTIONS.auditEvents, auditId, {
        id: auditId,
        entityType: 'OrderDocument',
        entityId: id,
        action: 'CREATE',
        fieldName: null,
        oldValue: null,
        newValue: orderNumber,
        actor: 'local-admin',
      });
      return this.assemble(id, orderNumber, input);
    });
  }

  async update(
    id: string,
    input: {
      header: OrderHeaderSnapshot;
      lines: OrderLineSnapshot[];
      materials: OrderMaterialSnapshot[];
    },
  ): Promise<StoredOrder> {
    return this.store.runTransaction(async (tx) => {
      const existing = await tx.getById<Record<string, unknown>>(
        FIRESTORE_COLLECTIONS.orderDocuments,
        id,
      );
      if (!existing) {
        throw new Error('Sipariş bulunamadı.');
      }
      const orderNumber = String(existing.orderNumber);
      await tx.upsert(FIRESTORE_COLLECTIONS.orderDocuments, id, {
        ...existing,
        ...input.header,
        id,
        orderNumber,
        createdAt: existing.createdAt ?? new Date(),
        updatedAt: new Date(),
      });
      const [allLines, allMaterials] = await Promise.all([
        this.store.query(FIRESTORE_COLLECTIONS.orderLines, [
          { field: 'orderDocumentId', op: '==', value: id },
        ]),
        this.store.query(FIRESTORE_COLLECTIONS.orderMaterialLines, [
          { field: 'orderDocumentId', op: '==', value: id },
        ]),
      ]);
      const existingLines = allLines.filter((row) => row.orderDocumentId === id);
      const usedLineIds = new Set<string>();
      for (const line of input.lines) {
        const previous = existingLines.find(
          (row) => Number(row.lineNo) === line.lineNo && !usedLineIds.has(String(row.id)),
        );
        const lineId = previous ? String(previous.id) : this.store.createId();
        usedLineIds.add(lineId);
        await tx.upsert(FIRESTORE_COLLECTIONS.orderLines, lineId, {
          ...line,
          id: lineId,
          orderDocumentId: id,
        });
      }
      for (const row of existingLines) {
        if (!usedLineIds.has(String(row.id))) {
          await tx.remove(FIRESTORE_COLLECTIONS.orderLines, String(row.id));
        }
      }
      const existingMaterials = allMaterials.filter((row) => row.orderDocumentId === id);
      const usedMaterialIds = new Set<string>();
      for (const material of input.materials) {
        const previous = existingMaterials.find((row) => !usedMaterialIds.has(String(row.id)));
        const materialId = previous ? String(previous.id) : this.store.createId();
        usedMaterialIds.add(materialId);
        await tx.upsert(FIRESTORE_COLLECTIONS.orderMaterialLines, materialId, {
          ...material,
          id: materialId,
          orderDocumentId: id,
        });
      }
      for (const row of existingMaterials) {
        if (!usedMaterialIds.has(String(row.id))) {
          await tx.remove(FIRESTORE_COLLECTIONS.orderMaterialLines, String(row.id));
        }
      }
      return this.assemble(id, orderNumber, input);
    });
  }

  async get(id: string): Promise<StoredOrder | null> {
    const header = await this.store.getById<Record<string, unknown>>(
      FIRESTORE_COLLECTIONS.orderDocuments,
      id,
    );
    if (!header) {
      return null;
    }
    const [lines, materials] = await Promise.all([
      this.store.query(FIRESTORE_COLLECTIONS.orderLines, [
        { field: 'orderDocumentId', op: '==', value: id },
      ]),
      this.store.query(FIRESTORE_COLLECTIONS.orderMaterialLines, [
        { field: 'orderDocumentId', op: '==', value: id },
      ]),
    ]);
    lines.sort((a, b) => Number(a.lineNo) - Number(b.lineNo));
    return {
      ...(header as unknown as OrderHeaderSnapshot),
      id,
      orderNumber: String(header.orderNumber),
      createdAt: header.createdAt as Date | string | undefined,
      updatedAt: header.updatedAt as Date | string | undefined,
      lines: lines as StoredOrder['lines'],
      materialLines: materials as StoredOrder['materialLines'],
    };
  }

  async list(): Promise<StoredOrder[]> {
    const [headers, allLines, allMaterials] = await Promise.all([
      this.store.list(FIRESTORE_COLLECTIONS.orderDocuments),
      this.store.list(FIRESTORE_COLLECTIONS.orderLines),
      this.store.list(FIRESTORE_COLLECTIONS.orderMaterialLines),
    ]);
    const linesByOrder = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const orderId = String(line.orderDocumentId);
      const bucket = linesByOrder.get(orderId) ?? [];
      bucket.push(line);
      linesByOrder.set(orderId, bucket);
    }
    const materialsByOrder = new Map<string, typeof allMaterials>();
    for (const row of allMaterials) {
      const orderId = String(row.orderDocumentId);
      const bucket = materialsByOrder.get(orderId) ?? [];
      bucket.push(row);
      materialsByOrder.set(orderId, bucket);
    }
    return headers
      .map((header) => {
        const id = String(header.id);
        const lines = (linesByOrder.get(id) ?? []).sort(
          (a, b) => Number(a.lineNo) - Number(b.lineNo),
        );
        return {
          ...(header as unknown as OrderHeaderSnapshot),
          id,
          orderNumber: String(header.orderNumber),
          createdAt: header.createdAt as Date | string | undefined,
          updatedAt: header.updatedAt as Date | string | undefined,
          lines: lines as StoredOrder['lines'],
          materialLines: (materialsByOrder.get(id) ?? []) as StoredOrder['materialLines'],
        };
      })
      .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  }

  private assemble(
    id: string,
    orderNumber: string,
    input: { header: OrderHeaderSnapshot; lines: OrderLineSnapshot[]; materials: OrderMaterialSnapshot[] },
  ): StoredOrder {
    const now = new Date();
    return {
      ...input.header,
      id,
      orderNumber,
      createdAt: now,
      updatedAt: now,
      lines: input.lines.map((line) => ({ ...line, id: '', orderDocumentId: id })),
      materialLines: input.materials.map((row) => ({ ...row, id: '', orderDocumentId: id })),
    };
  }
}
