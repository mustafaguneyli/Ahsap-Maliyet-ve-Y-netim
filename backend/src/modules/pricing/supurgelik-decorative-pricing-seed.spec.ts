import { PricingModifierType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  seedSupurgelikDecorativePricingRates,
  SUPURGELIK_DECORATIVE_RATE_SEEDS,
} from './supurgelik-decorative-pricing-seed';

function buildDb(options: { existingRate12?: string; inactiveCount?: number } = {}) {
  const rows: Array<{
    id: string;
    productGroupId: string;
    modifierType: PricingModifierType;
    thicknessMm: number;
    rate: Decimal;
    isActive: boolean;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }> = [];
  if (options.existingRate12 != null) {
    rows.push({
      id: 'rate-12',
      productGroupId: 'group-supurgelik',
      modifierType: PricingModifierType.DECORATIVE,
      thicknessMm: 12,
      rate: new Decimal(options.existingRate12),
      isActive: true,
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null,
    });
  }
  for (let index = 0; index < (options.inactiveCount ?? 0); index += 1) {
    rows.push({
      id: `inactive-${index}`,
      productGroupId: 'group-supurgelik',
      modifierType: PricingModifierType.DECORATIVE,
      thicknessMm: 12,
      rate: new Decimal('24'),
      isActive: false,
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-03-01T00:00:00.000Z'),
    });
  }

  const prisma = {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'group-supurgelik',
        code: 'SUPURGELIK',
        isActive: true,
      }),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'product-dekoratif',
        code: 'DEKORATIF_SUPURGELIK',
        isActive: true,
      }),
    },
    pricingThicknessModifier: {
      count: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          rows.filter(
            (row) =>
              row.productGroupId === where.productGroupId &&
              row.modifierType === where.modifierType &&
              row.isActive === where.isActive,
          ).length,
        ),
      ),
      findMany: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          rows.filter(
            (row) =>
              row.productGroupId === where.productGroupId &&
              row.modifierType === where.modifierType &&
              row.isActive === where.isActive &&
              row.effectiveTo === where.effectiveTo,
          ),
        ),
      ),
      create: jest.fn().mockImplementation(({ data }) => {
        const created = { id: `rate-${data.thicknessMm}`, ...data };
        rows.push(created);
        return Promise.resolve(created);
      }),
    },
    auditEvent: { create: jest.fn().mockImplementation(({ data }) => data) },
    $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
  };

  return { prisma, rows };
}

describe('seedSupurgelikDecorativePricingRates', () => {
  it('12/14/18 oranlarını üç thickness-scoped kayıt olarak oluşturur ve audit eder', async () => {
    const { prisma, rows } = buildDb({ inactiveCount: 1 });

    const report = await seedSupurgelikDecorativePricingRates(prisma as never);

    expect(report).toMatchObject({
      created: 3,
      unchanged: 0,
      conflicts: [],
      duplicateActiveThicknesses: [],
      inactiveHistoryPreserved: true,
      totalExpected: 3,
    });
    expect(
      rows
        .filter((row) => row.isActive)
        .map((row) => [row.thicknessMm, row.rate.toString()]),
    ).toEqual([
      [12, '25'],
      [14, '25'],
      [18, '45'],
    ]);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(rows.filter((row) => !row.isActive)).toHaveLength(1);
  });

  it('ikinci çalıştırmada duplicate oluşturmaz', async () => {
    const { prisma, rows } = buildDb();
    await seedSupurgelikDecorativePricingRates(prisma as never);

    const second = await seedSupurgelikDecorativePricingRates(prisma as never);

    expect(second.created).toBe(0);
    expect(second.unchanged).toBe(SUPURGELIK_DECORATIVE_RATE_SEEDS.length);
    expect(rows.filter((row) => row.isActive)).toHaveLength(3);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(3);
  });

  it('kullanıcı tarafından değiştirilmiş aktif oranı overwrite etmez', async () => {
    const { prisma, rows } = buildDb({ existingRate12: '26' });

    const report = await seedSupurgelikDecorativePricingRates(prisma as never);

    expect(report.created).toBe(2);
    expect(report.conflicts).toEqual([
      { thicknessMm: 12, existingRate: '26', seedRate: '25' },
    ]);
    expect(rows.find((row) => row.thicknessMm === 12)?.rate.toString()).toBe('26');
  });
});
