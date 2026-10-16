import { FIRESTORE_COLLECTIONS, type FirestoreCollectionName } from '../firebase/firestore.collections';
import { newEntityId, requireEntityId } from '../firebase/firestore-ids';
import { assertFirestoreChecks } from './firestore-checks';
import type { DocumentStore, StoreTransaction } from './document-store';
import { matchesQuery, type FirestoreQueryFilter } from './firestore-query';
import { formatOrderNumber, nextOrderSequence } from './firestore-order-number';
import { uniqueGuardDiff, uniqueGuardsFor } from './firestore-uniques';
import { assertAuditHasCompanionWrite, assertWritePolicy, isNoOpDocument } from './firestore-write-policy';
import { UniqueConstraintError } from './store-errors';

type Row = Record<string, unknown>;

/** Test / local in-memory DocumentStore. Firebase SDK çağırmaz. */
export class MemoryDocumentStore implements DocumentStore {
  private readonly data = new Map<string, Map<string, Row>>();
  readonly uniqueOwners = new Map<string, string>();
  private orderLast = 0;
  private reads = 0;

  createId(): string {
    return newEntityId();
  }

  async getById<T extends Row>(collection: FirestoreCollectionName, id: string): Promise<T | null> {
    this.reads += 1;
    return (this.bucket(collection).get(id) as T | undefined) ?? null;
  }

  async list<T extends Row>(collection: FirestoreCollectionName): Promise<T[]> {
    this.reads += 1;
    return [...this.bucket(collection).values()] as T[];
  }

  async query<T extends Row>(
    collection: FirestoreCollectionName,
    filters: readonly FirestoreQueryFilter[],
  ): Promise<T[]> {
    this.reads += 1;
    return ([...this.bucket(collection).values()] as T[]).filter((row) =>
      matchesQuery(row, filters),
    );
  }

  async getAllByIds<T extends Row>(
    collection: FirestoreCollectionName,
    ids: readonly string[],
  ): Promise<T[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    this.reads += unique.length === 0 ? 0 : 1;
    const rows: T[] = [];
    for (const id of unique) {
      const row = this.bucket(collection).get(id) as T | undefined;
      if (row) {
        rows.push(row);
      }
    }
    return rows;
  }

  readCount(): number {
    return this.reads;
  }

  async upsert(collection: FirestoreCollectionName, id: string, data: Row): Promise<void> {
    await this.runTransaction(async (tx) => tx.upsert(collection, id, data));
  }

  async remove(collection: FirestoreCollectionName, id: string): Promise<void> {
    await this.runTransaction(async (tx) => tx.remove(collection, id));
  }

  async runTransaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T> {
    const tx = new MemoryStoreTransaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }

  bucket(collection: string): Map<string, Row> {
    let rows = this.data.get(collection);
    if (!rows) {
      rows = new Map();
      this.data.set(collection, rows);
    }
    return rows;
  }

  readOrderLast(): number {
    if (this.orderLast > 0) {
      return this.orderLast;
    }
    const numbers = [...this.bucket(FIRESTORE_COLLECTIONS.orderDocuments).values()].map((row) =>
      String(row.orderNumber ?? ''),
    );
    this.orderLast = nextOrderSequence(numbers) - 1;
    return this.orderLast;
  }

  writeOrderLast(value: number): void {
    this.orderLast = value;
  }
}

class MemoryStoreTransaction implements StoreTransaction {
  private readonly pending = new Map<string, { collection: FirestoreCollectionName; id: string; previous: Row | null; next: Row | null }>();
  private pendingSequence: number | null = null;

  constructor(private readonly store: MemoryDocumentStore) {}

  async getById<T extends Row>(collection: FirestoreCollectionName, id: string): Promise<T | null> {
    const queued = this.pending.get(`${collection}/${id}`);
    if (queued) {
      return (queued.next as T | null) ?? null;
    }
    return this.store.getById(collection, id);
  }

  async upsert(collection: FirestoreCollectionName, id: string, data: Row): Promise<void> {
    requireEntityId(id);
    const previous = (await this.original(collection, id)) as Row | null;
    const payload = { ...data, id };
    assertWritePolicy(collection, previous, payload);
    assertFirestoreChecks(collection, payload);
    this.pending.set(`${collection}/${id}`, { collection, id, previous, next: payload });
  }

  async remove(collection: FirestoreCollectionName, id: string): Promise<void> {
    const previous = (await this.original(collection, id)) as Row | null;
    if (!previous) {
      return;
    }
    assertWritePolicy(collection, previous, null);
    this.pending.set(`${collection}/${id}`, { collection, id, previous, next: null });
  }

  async nextOrderNumber(): Promise<string> {
    if (this.pendingSequence == null) {
      this.pendingSequence = this.store.readOrderLast() + 1;
    } else {
      this.pendingSequence += 1;
    }
    return formatOrderNumber(this.pendingSequence);
  }

  commit(): void {
    const ops = [...this.pending.values()].filter(
      (op) => !(op.next != null && isNoOpDocument(op.previous, op.next)),
    );
    assertAuditHasCompanionWrite(ops);
    for (const op of ops) {
      const { claim, release } = uniqueGuardDiff(
        uniqueGuardsFor(op.collection, op.previous ?? {}),
        uniqueGuardsFor(op.collection, op.next ?? {}),
      );
      for (const guard of release) {
        const key = `${guard.constraint}/${guard.key}`;
        if (this.store.uniqueOwners.get(key) === op.id) {
          this.store.uniqueOwners.delete(key);
        }
      }
      for (const guard of claim) {
        const key = `${guard.constraint}/${guard.key}`;
        const owner = this.store.uniqueOwners.get(key);
        if (owner && owner !== op.id) {
          throw new UniqueConstraintError(guard.constraint, guard.key);
        }
        this.store.uniqueOwners.set(key, op.id);
      }
    }
    for (const op of ops) {
      if (op.next == null) {
        this.store.bucket(op.collection).delete(op.id);
      } else {
        this.store.bucket(op.collection).set(op.id, op.next);
      }
    }
    if (this.pendingSequence != null) {
      this.store.writeOrderLast(this.pendingSequence);
    }
  }

  private async original(collection: FirestoreCollectionName, id: string): Promise<Row | null> {
    const queued = this.pending.get(`${collection}/${id}`);
    if (queued) {
      return queued.previous;
    }
    return this.store.getById(collection, id);
  }
}
