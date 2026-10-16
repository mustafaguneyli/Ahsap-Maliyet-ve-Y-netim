import { Injectable } from '@nestjs/common';
import type { firestore } from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import {
  FIRESTORE_COLLECTIONS,
  FIRESTORE_UNIQUE_COLLECTION,
  type FirestoreCollectionName,
} from '../firebase/firestore.collections';
import { newEntityId, requireEntityId } from '../firebase/firestore-ids';
import { decodeDocument, encodeDocument } from './firestore-codec';
import { assertFirestoreChecks } from './firestore-checks';
import { mergeUniqueNet, type UniqueGuard } from './firestore-uniques';
import { UniqueConstraintError } from './store-errors';
import { assertAuditHasCompanionWrite, assertWritePolicy, isNoOpDocument } from './firestore-write-policy';
import {
  formatOrderNumber,
  nextOrderSequence,
  ORDER_COUNTER_COLLECTION,
  ORDER_COUNTER_ID,
} from './firestore-order-number';
import type { DocumentStore, StoreTransaction } from './document-store';
import type { FirestoreQueryFilter } from './firestore-query';

type PendingOp = {
  collection: FirestoreCollectionName;
  id: string;
  previous: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
};

@Injectable()
export class FirestoreDocumentStore implements DocumentStore {
  private reads = 0;

  constructor(private readonly firebase: FirebaseService) {}

  createId(): string {
    return newEntityId();
  }

  async getById<T extends Record<string, unknown>>(
    collection: FirestoreCollectionName,
    id: string,
  ): Promise<T | null> {
    requireEntityId(id);
    this.reads += 1;
    const snap = await this.firebase.collection(collection).doc(id).get();
    if (!snap.exists) {
      return null;
    }
    return decodeDocument(snap.data() as Record<string, unknown>) as T;
  }

  async list<T extends Record<string, unknown>>(collection: FirestoreCollectionName): Promise<T[]> {
    this.reads += 1;
    const snap = await this.firebase.collection(collection).get();
    return snap.docs.map((doc) => decodeDocument(doc.data() as Record<string, unknown>) as T);
  }

  async query<T extends Record<string, unknown>>(
    collection: FirestoreCollectionName,
    filters: readonly FirestoreQueryFilter[],
  ): Promise<T[]> {
    this.reads += 1;
    let ref: firestore.Query = this.firebase.collection(collection);
    for (const filter of filters) {
      ref = ref.where(filter.field, filter.op, filter.value);
    }
    const snap = await ref.get();
    return snap.docs.map((doc) => decodeDocument(doc.data() as Record<string, unknown>) as T);
  }

  async getAllByIds<T extends Record<string, unknown>>(
    collection: FirestoreCollectionName,
    ids: readonly string[],
  ): Promise<T[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) {
      return [];
    }
    this.reads += Math.ceil(unique.length / 100);
    const rows: T[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const refs = chunk.map((id) => this.firebase.collection(collection).doc(id));
      const snaps = await this.firebase.firestore().getAll(...refs);
      for (const snap of snaps) {
        if (snap.exists) {
          rows.push(decodeDocument(snap.data() as Record<string, unknown>) as T);
        }
      }
    }
    return rows;
  }

  readCount(): number {
    return this.reads;
  }

  async upsert(
    collection: FirestoreCollectionName,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.runTransaction(async (tx) => {
      await tx.upsert(collection, id, data);
    });
  }

  async remove(collection: FirestoreCollectionName, id: string): Promise<void> {
    await this.runTransaction(async (tx) => {
      await tx.remove(collection, id);
    });
  }

  async runTransaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T> {
    const db = this.firebase.firestore();
    return db.runTransaction(async (raw) => {
      const tx = new FirestoreStoreTransaction(this.firebase, raw);
      const result = await fn(tx);
      await tx.commit();
      return result;
    });
  }
}

class FirestoreStoreTransaction implements StoreTransaction {
  private readonly pending = new Map<string, PendingOp>();
  private pendingOrderSequence: number | null = null;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tx: firestore.Transaction,
  ) {}

  async getById<T extends Record<string, unknown>>(
    collection: FirestoreCollectionName,
    id: string,
  ): Promise<T | null> {
    requireEntityId(id);
    const queued = this.pending.get(this.entityKey(collection, id));
    if (queued) {
      return (queued.next as T | null) ?? null;
    }
    const snap = await this.tx.get(this.firebase.collection(collection).doc(id));
    if (!snap.exists) {
      return null;
    }
    return decodeDocument(snap.data() as Record<string, unknown>) as T;
  }

  async upsert(
    collection: FirestoreCollectionName,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    requireEntityId(id);
    const previous = await this.originalPrevious(collection, id);
    const payload = { ...data, id };
    assertWritePolicy(collection, previous, payload);
    assertFirestoreChecks(collection, payload);
    this.pending.set(this.entityKey(collection, id), {
      collection,
      id,
      previous,
      next: payload,
    });
  }

  async remove(collection: FirestoreCollectionName, id: string): Promise<void> {
    requireEntityId(id);
    const previous = await this.originalPrevious(collection, id);
    if (!previous) {
      return;
    }
    assertWritePolicy(collection, previous, null);
    this.pending.set(this.entityKey(collection, id), {
      collection,
      id,
      previous,
      next: null,
    });
  }

  async nextOrderNumber(): Promise<string> {
    if (this.pendingOrderSequence != null) {
      this.pendingOrderSequence += 1;
      return formatOrderNumber(this.pendingOrderSequence);
    }
    const counterRef = this.firebase
      .firestore()
      .collection(ORDER_COUNTER_COLLECTION)
      .doc(ORDER_COUNTER_ID);
    const counterSnap = await this.tx.get(counterRef);
    let last = 0;
    if (counterSnap.exists) {
      last = Number((counterSnap.data() as { last?: unknown }).last);
    } else {
      const existing = await this.tx.get(
        this.firebase.collection(FIRESTORE_COLLECTIONS.orderDocuments),
      );
      last =
        nextOrderSequence(
          existing.docs.map((doc) => String((doc.data() as { orderNumber?: string }).orderNumber ?? '')),
        ) - 1;
    }
    this.pendingOrderSequence = last + 1;
    return formatOrderNumber(this.pendingOrderSequence);
  }

  async commit(): Promise<void> {
    const ops = [...this.pending.values()].filter(
      (op) => !(op.next != null && isNoOpDocument(op.previous, op.next)),
    );
    assertAuditHasCompanionWrite(ops);

    const uniqueReads = mergeUniqueNet(ops);

    const uniqueSnaps = await Promise.all(
      uniqueReads.map((item) => this.tx.get(this.uniqueRef(item.guard))),
    );

    for (let i = 0; i < uniqueReads.length; i += 1) {
      const item = uniqueReads[i];
      const snap = uniqueSnaps[i];
      const existingOwner = snap.exists ? (snap.data()?.ownerId as string | undefined) : undefined;
      if (item.op === 'claim' && existingOwner && existingOwner !== item.ownerId) {
        if (item.releasedFrom !== existingOwner) {
          throw new UniqueConstraintError(item.guard.constraint, item.guard.key);
        }
      }
    }

    for (let i = 0; i < uniqueReads.length; i += 1) {
      const item = uniqueReads[i];
      const ref = this.uniqueRef(item.guard);
      if (item.op === 'claim') {
        this.tx.set(ref, {
          ownerId: item.ownerId,
          constraint: item.guard.constraint,
          key: item.guard.key,
        });
      } else {
        const snap = uniqueSnaps[i];
        const existingOwner = snap.exists ? (snap.data()?.ownerId as string | undefined) : undefined;
        if (!existingOwner || existingOwner === item.ownerId) {
          this.tx.delete(ref);
        }
      }
    }

    if (this.pendingOrderSequence != null) {
      this.tx.set(
        this.firebase.firestore().collection(ORDER_COUNTER_COLLECTION).doc(ORDER_COUNTER_ID),
        { last: this.pendingOrderSequence },
      );
    }

    for (const op of ops) {
      const ref = this.firebase.collection(op.collection).doc(op.id);
      if (op.next == null) {
        this.tx.delete(ref);
      } else {
        this.tx.set(ref, encodeDocument(op.collection, op.id, op.next, op.previous));
      }
    }
  }

  private async originalPrevious(
    collection: FirestoreCollectionName,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const queued = this.pending.get(this.entityKey(collection, id));
    if (queued) {
      return queued.previous;
    }
    const snap = await this.tx.get(this.firebase.collection(collection).doc(id));
    if (!snap.exists) {
      return null;
    }
    return decodeDocument(snap.data() as Record<string, unknown>);
  }

  private entityKey(collection: FirestoreCollectionName, id: string): string {
    return `${collection}/${id}`;
  }

  private uniqueRef(guard: UniqueGuard): firestore.DocumentReference {
    return this.firebase
      .firestore()
      .collection(FIRESTORE_UNIQUE_COLLECTION)
      .doc(guard.constraint)
      .collection('keys')
      .doc(guard.key);
  }
}
