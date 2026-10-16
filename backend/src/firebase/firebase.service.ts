import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import type { FirestoreCollectionName } from './firestore.collections';

export type FirestoreHealth = 'up' | 'down' | 'disabled';

@Injectable()
export class FirebaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;
  private db: admin.firestore.Firestore | null = null;

  constructor(private readonly config: ConfigService) {}

  get isEnabled(): boolean {
    return this.db != null;
  }

  async onModuleInit(): Promise<void> {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')?.trim();
    const required = this.config.get<string>('FIREBASE_REQUIRED') === 'true';

    if (!projectId) {
      this.logger.warn(
        'FIREBASE_PROJECT_ID yok; Firestore kapalı. PostgreSQL/Prisma çalışmaya devam eder.',
      );
      if (required) {
        throw new Error('FIREBASE_REQUIRED=true ama FIREBASE_PROJECT_ID boş.');
      }
      return;
    }

    if (!this.hasAdminCredential()) {
      this.logger.warn(
        `FIREBASE_PROJECT_ID=${projectId} ama Admin kimliği yok. Servis hesabı eklenene kadar PostgreSQL kaynağı durur.`,
      );
      if (required) {
        throw new Error('FIREBASE_REQUIRED=true ama servis hesabı yok.');
      }
      return;
    }

    try {
      const reused = admin.apps.length > 0;
      this.app = reused
        ? admin.app()
        : admin.initializeApp({
            credential: this.buildCredential(),
            projectId,
          });
      this.db = this.app.firestore();
      if (!reused) {
        this.db.settings({ ignoreUndefinedProperties: true });
      }
      this.logger.log(`Firestore Admin bağlandı: ${projectId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bilinmeyen hata';
      this.logger.error(`Firestore başlatılamadı: ${message}`);
      this.app = null;
      this.db = null;
      if (required) {
        throw error;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.db = null;
    this.app = null;
  }

  firestore(): admin.firestore.Firestore {
    if (!this.db) {
      throw new Error('Firestore kapalı. FIREBASE_PROJECT_ID ve servis hesabını tanımlayın.');
    }
    return this.db;
  }

  collection(name: FirestoreCollectionName): admin.firestore.CollectionReference {
    return this.firestore().collection(name);
  }

  verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.app) {
      throw new Error('Firebase Auth kapalı. FIREBASE_PROJECT_ID ve servis hesabını tanımlayın.');
    }
    return this.app.auth().verifyIdToken(idToken);
  }

  async ping(): Promise<FirestoreHealth> {
    if (!this.db) {
      return 'disabled';
    }
    try {
      await this.db.collection('product_groups').limit(1).get();
      return 'up';
    } catch {
      return 'down';
    }
  }

  private hasAdminCredential(): boolean {
    if (this.config.get<string>('FIREBASE_USE_ADC') === 'true') {
      return true;
    }
    if (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS')?.trim()) {
      return true;
    }
    if (this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim()) {
      return true;
    }
    const email = this.config.get<string>('FIREBASE_CLIENT_EMAIL')?.trim();
    const key = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.trim();
    return Boolean(email && key);
  }

  private buildCredential(): admin.credential.Credential {
    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
    if (json) {
      const parsed = JSON.parse(json) as admin.ServiceAccount;
      return admin.credential.cert(parsed);
    }

    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL')?.trim();
    const privateKey = this.config
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n')
      .trim();
    if (clientEmail && privateKey) {
      return admin.credential.cert({
        projectId: this.config.get<string>('FIREBASE_PROJECT_ID')?.trim(),
        clientEmail,
        privateKey,
      });
    }

    return admin.credential.applicationDefault();
  }
}
