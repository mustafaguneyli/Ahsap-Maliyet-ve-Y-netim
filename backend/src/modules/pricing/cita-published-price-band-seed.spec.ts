import { Decimal } from '@prisma/client/runtime/library';
import { CITA_PUBLISHED_PRICE_BAND_SEEDS } from './cita-published-price-band-data';
import { seedCitaPublishedPriceBands } from './cita-published-price-band-seed';

const group = { id: 'g-cita', code: 'CITA', isActive: true };

type ActiveRow = {
  id: string;
  productGroupId: string;
  minWidthMm: number;
  maxWidthMm: number;
  cashPrice: Decimal;
  cardPrice: Decimal;
  isActive: boolean;
  effectiveTo: Date | null;
  thicknesses: Array<{ thicknessMm: number }>;
};

function buildPrisma(options: {
  missingGroup?: boolean;
  inactiveCount?: number;
  active?: ActiveRow[];
} = {}) {
  const rows: ActiveRow[] = [...(options.active ?? [])];
  const audit: unknown[] = [];
  const tx = {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(
        options.missingGroup ? null : group,
      ),
    },
    citaPublishedPriceBand: {
      count: jest.fn().mockResolvedValue(options.inactiveCount ?? 0),
      findMany: jest.fn().mockImplementation(() => Promise.resolve(rows)),
      create: jest.fn().mockImplementation(({ data }) => {
        const created: ActiveRow = {
          id: `band-${data.minWidthMm}-${data.maxWidthMm}`,
          productGroupId: data.productGroupId,
          minWidthMm: data.minWidthMm,
          maxWidthMm: data.maxWidthMm,
          cashPrice: data.cashPrice,
          cardPrice: data.cardPrice,
          isActive: data.isActive,
          effectiveTo: data.effectiveTo,
          thicknesses: (data.thicknesses?.create ?? []).map(
            (row: { thicknessMm: number }) => ({
              thicknessMm: row.thicknessMm,
            }),
          ),
        };
        rows.push(created);
        return Promise.resolve(created);
      }),
    },
    auditEvent: {
      create: jest.fn().mockImplementation(({ data }) => {
        audit.push(data);
        return Promise.resolve(data);
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return { prisma, tx, rows, audit };
}

describe('seedCitaPublishedPriceBands', () => {
  it('ilk çalışmada dört bandı thickness kapsamıyla oluşturur ve audit eder', async () => {
    const { prisma, tx, rows } = buildPrisma({ inactiveCount: 1 });

    const report = await seedCitaPublishedPriceBands(prisma as never);

    expect(report).toMatchObject({
      created: 4,
      unchanged: 0,
      conflicts: [],
      duplicateActiveBands: [],
      overlappingActiveBands: [],
      missingProductGroup: false,
      inactiveHistoryPreserved: true,
      totalExpected: 4,
    });
    expect(tx.citaPublishedPriceBand.create).toHaveBeenCalledTimes(4);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(8);
    expect(
      rows.map((row) => [
        row.minWidthMm,
        row.maxWidthMm,
        row.cashPrice.toString(),
        row.cardPrice.toString(),
        row.thicknesses.map((item) => item.thicknessMm),
      ]),
    ).toEqual(
      CITA_PUBLISHED_PRICE_BAND_SEEDS.map((seed) => [
        seed.minWidthMm,
        seed.maxWidthMm,
        seed.cashPrice,
        seed.cardPrice,
        [...seed.thicknessMm],
      ]),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('ikinci çalıştırmada duplicate oluşturmaz', async () => {
    const { prisma, tx, rows } = buildPrisma();
    await seedCitaPublishedPriceBands(prisma as never);

    const second = await seedCitaPublishedPriceBands(prisma as never);

    expect(second.created).toBe(0);
    expect(second.unchanged).toBe(CITA_PUBLISHED_PRICE_BAND_SEEDS.length);
    expect(rows).toHaveLength(4);
    expect(tx.citaPublishedPriceBand.create).toHaveBeenCalledTimes(4);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(8);
  });

  it('kullanıcı tarafından değiştirilmiş aktif fiyatı overwrite etmez', async () => {
    const { prisma, rows } = buildPrisma({
      active: [
        {
          id: 'band-10-20',
          productGroupId: group.id,
          minWidthMm: 10,
          maxWidthMm: 20,
          cashPrice: new Decimal('120'),
          cardPrice: new Decimal('138'),
          isActive: true,
          effectiveTo: null,
          thicknesses: [{ thicknessMm: 12 }, { thicknessMm: 14 }, { thicknessMm: 16 }],
        },
      ],
    });

    const report = await seedCitaPublishedPriceBands(prisma as never);

    expect(report.created).toBe(3);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toEqual([
      expect.objectContaining({
        minWidthMm: 10,
        maxWidthMm: 20,
        existingCashPrice: '120',
        seedCashPrice: '115',
      }),
    ]);
    expect(rows.find((row) => row.minWidthMm === 10)?.cashPrice.toString()).toBe(
      '120',
    );
  });

  it('CITA grubu yoksa yazmaz', async () => {
    const { prisma, tx } = buildPrisma({ missingGroup: true });

    const report = await seedCitaPublishedPriceBands(prisma as never);

    expect(report.missingProductGroup).toBe(true);
    expect(report.created).toBe(0);
    expect(tx.citaPublishedPriceBand.create).not.toHaveBeenCalled();
  });
});
