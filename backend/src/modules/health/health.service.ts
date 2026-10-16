import { Injectable, Optional } from '@nestjs/common';
import { DataStoreConfig } from '../../data-store/data-store.config';
import type { DataStoreName } from '../../data-store/data-store.types';
import { FirebaseService, type FirestoreHealth } from '../../firebase/firebase.service';
import { PrismaService } from '../../prisma/prisma.service';

export type DatabaseHealth = 'up' | 'down' | 'not-required';

export type HealthStatus = {
  status: 'ok' | 'error';
  api: 'ok';
  dataStore: DataStoreName;
  database: DatabaseHealth;
  firestore: FirestoreHealth;
  timestamp: string;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly firebase?: FirebaseService,
    @Optional() private readonly dataStore?: DataStoreConfig,
  ) {}

  async getHealth(): Promise<HealthStatus> {
    const dataStore = this.dataStore?.name ?? 'postgres';
    const firestore = this.firebase ? await this.firebase.ping() : 'disabled';

    if (dataStore === 'firestore') {
      return {
        status: firestore === 'up' ? 'ok' : 'error',
        api: 'ok',
        dataStore,
        database: 'not-required',
        firestore,
        timestamp: new Date().toISOString(),
      };
    }

    let database: DatabaseHealth = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'error',
      api: 'ok',
      dataStore,
      database,
      firestore,
      timestamp: new Date().toISOString(),
    };
  }
}
