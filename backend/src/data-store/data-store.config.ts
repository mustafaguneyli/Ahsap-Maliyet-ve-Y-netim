import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { parseDataStoreName, type DataStoreName } from './data-store.types';

@Injectable()
export class DataStoreConfig implements OnModuleInit {
  private readonly logger = new Logger(DataStoreConfig.name);
  readonly name: DataStoreName;

  constructor(
    config: ConfigService,
    private readonly firebase: FirebaseService,
  ) {
    this.name = parseDataStoreName(config.get<string>('DATA_STORE'));
  }

  isPostgres(): boolean {
    return this.name === 'postgres';
  }

  isFirestore(): boolean {
    return this.name === 'firestore';
  }

  onModuleInit(): void {
    if (this.isFirestore() && !this.firebase.isEnabled) {
      throw new Error(
        'DATA_STORE=firestore ama Firestore Admin bağlı değil. GOOGLE_APPLICATION_CREDENTIALS veya FIREBASE_USE_ADC gerekir.',
      );
    }
    this.logger.log(`DATA_STORE=${this.name}`);
  }
}
