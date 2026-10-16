import { ConfigService } from '@nestjs/config';
import { DataStoreConfig } from './data-store.config';
import { FirebaseService } from '../firebase/firebase.service';

describe('DataStoreConfig', () => {
  it('DATA_STORE=postgres iken Firestore kapalı olsa da açılır', () => {
    const config = { get: () => 'postgres' };
    const firebase = { isEnabled: false };
    const store = new DataStoreConfig(
      config as unknown as ConfigService,
      firebase as unknown as FirebaseService,
    );
    expect(store.name).toBe('postgres');
    expect(() => store.onModuleInit()).not.toThrow();
  });

  it('DATA_STORE=firestore iken Admin yoksa boot reddedilir', () => {
    const config = { get: () => 'firestore' };
    const firebase = { isEnabled: false };
    const store = new DataStoreConfig(
      config as unknown as ConfigService,
      firebase as unknown as FirebaseService,
    );
    expect(store.isFirestore()).toBe(true);
    expect(() => store.onModuleInit()).toThrow(/Firestore Admin bağlı değil/);
  });
});
