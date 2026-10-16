import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DataStoreConfig } from './data-store.config';
import { FirestoreCatalogInterceptor } from './firestore-catalog.interceptor';
import { FirestoreDocumentStore } from './firestore.document-store';

@Global()
@Module({
  providers: [
    DataStoreConfig,
    FirestoreDocumentStore,
    { provide: APP_INTERCEPTOR, useClass: FirestoreCatalogInterceptor },
  ],
  exports: [DataStoreConfig, FirestoreDocumentStore],
})
export class DataStoreModule {}
