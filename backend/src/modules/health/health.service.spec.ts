import { HealthService } from './health.service';

describe('HealthService', () => {
  it('veritabanı yanıt verince ok döner', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const service = new HealthService(prisma as never);

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('veritabanı hatasında error döner', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const service = new HealthService(prisma as never);

    const result = await service.getHealth();

    expect(result.status).toBe('error');
    expect(result.database).toBe('down');
  });
});
