import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { DataStoreConfig } from './data-store.config';
import { FirestoreDocumentStore } from './firestore.document-store';
import {
  FirestoreCatalogCache,
  currentCatalogCache,
  runWithCatalogCache,
} from './firestore-catalog-cache';

/**
 * DATA_STORE=firestore isteklerinde katalog cache'i yükler.
 * source-bridge Prisma'ya düşmez. /health preload etmez.
 */
@Injectable()
export class FirestoreCatalogInterceptor implements NestInterceptor {
  constructor(
    private readonly dataStore: DataStoreConfig,
    private readonly firestoreStore: FirestoreDocumentStore,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.dataStore.isFirestore()) {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<{ url?: string }>();
    const path = req.url ?? '';
    if (path.startsWith('/health') || currentCatalogCache()) {
      return next.handle();
    }
    return from(FirestoreCatalogCache.load(this.firestoreStore)).pipe(
      switchMap(
        (cache) =>
          new Observable((subscriber) =>
            runWithCatalogCache(cache, () => next.handle().subscribe(subscriber)),
          ),
      ),
    );
  }
}
