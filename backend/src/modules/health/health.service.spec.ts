import { HealthService } from './health.service';

describe('HealthService', () => {
  it('veritabanı yanıt verince ok döner', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const service = new HealthService(prisma as never);

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.api).toBe('ok');
    expect(result.dataStore).toBe('postgres');
    expect(result.database).toBe('up');
    expect(result.firestore).toBe('disabled');
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('DATA_STORE=firestore iken Firestore down ise error döner', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const firebase = { ping: jest.fn().mockResolvedValue('down') };
    const dataStore = { name: 'firestore' as const };
    const service = new HealthService(prisma as never, firebase as never, dataStore as never);

    const result = await service.getHealth();

    expect(result.status).toBe('error');
    expect(result.api).toBe('ok');
    expect(result.dataStore).toBe('firestore');
    expect(result.database).toBe('not-required');
    expect(result.firestore).toBe('down');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('DATA_STORE=firestore ve Firestore up iken PostgreSQL sorgulanmaz', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const firebase = { ping: jest.fn().mockResolvedValue('up') };
    const dataStore = { name: 'firestore' as const };
    const service = new HealthService(prisma as never, firebase as never, dataStore as never);

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.api).toBe('ok');
    expect(result.dataStore).toBe('firestore');
    expect(result.database).toBe('not-required');
    expect(result.firestore).toBe('up');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('veritabanı hatasında error döner', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const service = new HealthService(prisma as never);

    const result = await service.getHealth();

    expect(result.status).toBe('error');
    expect(result.api).toBe('ok');
    expect(result.dataStore).toBe('postgres');
    expect(result.database).toBe('down');
    expect(result.firestore).toBe('disabled');
  });
});
