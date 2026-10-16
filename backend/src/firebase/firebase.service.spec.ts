import { ConfigService } from '@nestjs/config';
import { FirebaseService } from './firebase.service';

describe('FirebaseService', () => {
  it('proje id yoksa Firestore kapalı kalır', async () => {
    const config = {
      get: jest.fn((key: string) => (key === 'FIREBASE_REQUIRED' ? 'false' : '')),
    };
    const service = new FirebaseService(config as unknown as ConfigService);

    await service.onModuleInit();

    expect(service.isEnabled).toBe(false);
    await expect(service.ping()).resolves.toBe('disabled');
    expect(() => service.firestore()).toThrow(/Firestore kapalı/);
    expect(() => {
      void service.verifyIdToken('token');
    }).toThrow(/Firebase Auth kapalı/);
  });

  it('FIREBASE_REQUIRED iken proje id boşsa hata verir', async () => {
    const config = {
      get: jest.fn((key: string) => (key === 'FIREBASE_REQUIRED' ? 'true' : '')),
    };
    const service = new FirebaseService(config as unknown as ConfigService);

    await expect(service.onModuleInit()).rejects.toThrow(/FIREBASE_PROJECT_ID boş/);
  });
});
