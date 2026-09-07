import { KILCIK_TYPE_SPECS } from './kilcik-type.rules';
import { seedKilcikTypes } from './kilcik-type-seed';

describe('seedKilcikTypes', () => {
  it('ilk çalışmada STANDARD ve WIDE oluşturur', async () => {
    const created: string[] = [];
    const prisma = {
      kilcikType: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: { code: string } }) => {
          created.push(data.code);
          return Promise.resolve({ id: data.code, ...data });
        }),
      },
    };

    const report = await seedKilcikTypes(prisma as never);

    expect(report.created).toBe(2);
    expect(report.skippedExisting).toBe(0);
    expect(created).toEqual(['STANDARD', 'WIDE']);
    expect(prisma.kilcikType.create.mock.calls[0][0].data).toMatchObject({
      code: 'STANDARD',
      nominalWidthMm: 39,
      bladeAllowanceMm: 4,
      cutPitchMm: 43,
      isActive: true,
    });
    expect(prisma.kilcikType.create.mock.calls[1][0].data).toMatchObject({
      code: 'WIDE',
      nominalWidthMm: 55,
      cutPitchMm: 59,
    });
    expect(KILCIK_TYPE_SPECS.STANDARD.cutPitchMm).toBe(43);
  });

  it('idempotent: mevcut tipleri yeniden yazmaz', async () => {
    const prisma = {
      kilcikType: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
      },
    };

    const report = await seedKilcikTypes(prisma as never);

    expect(report.created).toBe(0);
    expect(report.skippedExisting).toBe(2);
    expect(prisma.kilcikType.create).not.toHaveBeenCalled();
  });
});
