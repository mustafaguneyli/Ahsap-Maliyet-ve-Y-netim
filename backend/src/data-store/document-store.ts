import type { FirestoreCollectionName } from '../firebase/firestore.collections';
import type { FirestoreQueryFilter } from './firestore-query';

/**
 * Persistence soyutlaması. Business service Firestore SDK çağırmaz.
 * postgres: PrismaService (mevcut).
 * firestore: FirestoreDocumentStore.
 */
export interface StoreTransaction {
  getById<T extends Record<string, unknown>>(
    collection: FirestoreCollectionName,
    id: string,
  ): Promise<T | null>;
  upsert(collection: FirestoreCollectionName, id: string, data: Record<string, unknown>): Promise<void>;
  remove(collection: FirestoreCollectionName, id: string): Promise<void>;
  nextOrderNumber(): Promise<string>;
}

export interface DocumentStore {
  createId(): string;
  getById<T extends Record<string, unknown>>(
    collection: FirestoreCollectionName,
    id: string,
  ): Promise<T | null>;
  list<T extends Record<string, unknown>>(collection: FirestoreCollectionName): Promise<T[]>;
  query<T extends Record<string, unknown>>(
    collection: FirestoreCollectionName,
    filters: readonly FirestoreQueryFilter[],
  ): Promise<T[]>;
  getAllByIds<T extends Record<string, unknown>>(
    collection: FirestoreCollectionName,
    ids: readonly string[],
  ): Promise<T[]>;
  upsert(collection: FirestoreCollectionName, id: string, data: Record<string, unknown>): Promise<void>;
  remove(collection: FirestoreCollectionName, id: string): Promise<void>;
  runTransaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T>;
  readCount(): number;
}
