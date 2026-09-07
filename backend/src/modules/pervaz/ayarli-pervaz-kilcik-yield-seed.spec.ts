import { getExcelKilcikCutWidthMm } from './excel-kilcik-cut-profile';
import {
  AYARLI_PERVAZ_KILCIK_YIELD_SEEDS,
  seedAyarliPervazKilcikYields,
} from './ayarli-pervaz-kilcik-yield-seed';

const group = { id: 'g-pervaz', code: 'PERVAZ', isActive: true };
const product = { id: 'p-ayarli', code: 'AYARLI_PERVAZ', isActive: true };
const material = { id: 'rm-4', code: 'MDF-4-2200X2800-ZIMPARALI', isActive: true };

function basePrisma() {
  return {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(group),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
    },
    rawMaterial: {
      findUnique: jest.fn().mockResolvedValue(material),
    },
  };
}

function matchingActive(row: (typeof AYARLI_PERVAZ_KILCIK_YIELD_SEEDS)[number]) {
  return {
    id: `existing-${row.pervazThicknessMm}-${row.pieceLengthMm}`,
    pervazThicknessMm: row.pervazThicknessMm,
    pieceLengthMm: row.pieceLengthMm,
    netQty: row.netQty,
    kilcikTypeId: null,
    excelCutWidthMm: getExcelKilcikCutWidthMm(row.pervazThicknessMm),
  };
}

describe('AYARLI_PERVAZ_KILCIK_YIELD_SEEDS', () => {
  it('12 Excel MASTER kombinasyonu içerir; 2800 yoktur', () => {
    expect(AYARLI_PERVAZ_KILCIK_YIELD_SEEDS).toEqual([
      { pervazThicknessMm: 9, pieceLengthMm: 2200, netQty: 66 },
      { pervazThicknessMm: 9, pieceLengthMm: 2300, netQty: 52 },
      { pervazThicknessMm: 9, pieceLengthMm: 2500, netQty: 52 },
      { pervazThicknessMm: 9, pieceLengthMm: 2550, netQty: 52 },
      { pervazThicknessMm: 12, pieceLengthMm: 2200, netQty: 66 },
      { pervazThicknessMm: 12, pieceLengthMm: 2500, netQty: 52 },
      { pervazThicknessMm: 14, pieceLengthMm: 2200, netQty: 62 },
      { pervazThicknessMm: 14, pieceLengthMm: 2500, netQty: 48 },
      { pervazThicknessMm: 16, pieceLengthMm: 2200, netQty: 56 },
      { pervazThicknessMm: 16, pieceLengthMm: 2500, netQty: 44 },
      { pervazThicknessMm: 18, pieceLengthMm: 2200, netQty: 50 },
      { pervazThicknessMm: 18, pieceLengthMm: 2500, netQty: 40 },
    ]);
    expect(AYARLI_PERVAZ_KILCIK_YIELD_SEEDS).toHaveLength(12);
    const lengths: number[] = AYARLI_PERVAZ_KILCIK_YIELD_SEEDS.map((r) => r.pieceLengthMm);
    expect(lengths).not.toContain(2800);
  });
});

describe('seedAyarliPervazKilcikYields', () => {
  it('boş DB’de 12 aktif EXCEL_MASTER oluşturur; kilcikTypeId null, excelCutWidth doldurulur', async () => {
    const prisma = {
      ...basePrisma(),
      pervazKilcikYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    };

    const report = await seedAyarliPervazKilcikYields(prisma as never);

    expect(report.totalExpected).toBe(12);
    expect(report.created).toBe(12);
    expect(report.unchanged).toBe(0);
    expect(report.normalized).toBe(0);
    expect(report.conflicts).toEqual([]);
    expect(prisma.pervazKilcikYield.create).toHaveBeenCalledTimes(12);
    expect(prisma.pervazKilcikYield.update).not.toHaveBeenCalled();
    expect(prisma.pervazKilcikYield.create.mock.calls[0][0].data).toMatchObject({
      productId: 'p-ayarli',
      pervazThicknessMm: 9,
      kilcikTypeId: null,
      rawMaterialId: 'rm-4',
      pieceLengthMm: 2200,
      netQty: 66,
      source: 'EXCEL_MASTER',
      excelCutWidthMm: 42,
      isActive: true,
    });
    expect(prisma.pervazKilcikYield.create.mock.calls[6][0].data).toMatchObject({
      pervazThicknessMm: 14,
      pieceLengthMm: 2200,
      netQty: 62,
      kilcikTypeId: null,
      excelCutWidthMm: 45,
    });
    expect(prisma.pervazKilcikYield.create.mock.calls[8][0].data).toMatchObject({
      pervazThicknessMm: 16,
      excelCutWidthMm: 50,
      kilcikTypeId: null,
    });
    expect(prisma.pervazKilcikYield.create.mock.calls[10][0].data).toMatchObject({
      pervazThicknessMm: 18,
      netQty: 50,
      excelCutWidthMm: 55,
      kilcikTypeId: null,
    });
  });

  it('eski 4 WIDE kalıntısını normalize eder, 8 yeni kayıt oluşturur, NET değiştirmez', async () => {
    const prisma = {
      ...basePrisma(),
      pervazKilcikYield: {
        findFirst: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: { pervazThicknessMm: number; pieceLengthMm: number };
          }) => {
            const row = AYARLI_PERVAZ_KILCIK_YIELD_SEEDS.find(
              (r) =>
                r.pervazThicknessMm === where.pervazThicknessMm &&
                r.pieceLengthMm === where.pieceLengthMm,
            );
            if (!row || (row.pervazThicknessMm !== 14 && row.pervazThicknessMm !== 18)) {
              return Promise.resolve(null);
            }
            return Promise.resolve({
              id: `legacy-${row.pervazThicknessMm}-${row.pieceLengthMm}`,
              pervazThicknessMm: row.pervazThicknessMm,
              pieceLengthMm: row.pieceLengthMm,
              netQty: row.netQty,
              kilcikTypeId: 't-wide',
              excelCutWidthMm: null,
            });
          },
        ),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const report = await seedAyarliPervazKilcikYields(prisma as never);

    expect(report.created).toBe(8);
    expect(report.normalized).toBe(4);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toEqual([]);
    expect(prisma.pervazKilcikYield.update).toHaveBeenCalledTimes(4);
    expect(prisma.pervazKilcikYield.create).toHaveBeenCalledTimes(8);
    expect(prisma.pervazKilcikYield.update.mock.calls[0][0].data).toEqual({
      kilcikTypeId: null,
      excelCutWidthMm: 45,
    });
    expect(prisma.pervazKilcikYield.update.mock.calls[2][0].data).toEqual({
      kilcikTypeId: null,
      excelCutWidthMm: 55,
    });
    expect(prisma.pervazKilcikYield.update.mock.calls.every((c: { [0]: { data: object } }) => !('netQty' in c[0].data))).toBe(
      true,
    );
  });

  it('aynı NET ve excelCutWidth varken duplicate oluşturmaz', async () => {
    const prisma = {
      ...basePrisma(),
      pervazKilcikYield: {
        findFirst: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: { pervazThicknessMm: number; pieceLengthMm: number };
          }) => {
            const row = AYARLI_PERVAZ_KILCIK_YIELD_SEEDS.find(
              (r) =>
                r.pervazThicknessMm === where.pervazThicknessMm &&
                r.pieceLengthMm === where.pieceLengthMm,
            );
            return Promise.resolve(row ? matchingActive(row) : null);
          },
        ),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const report = await seedAyarliPervazKilcikYields(prisma as never);

    expect(report.created).toBe(0);
    expect(report.normalized).toBe(0);
    expect(report.unchanged).toBe(12);
    expect(report.conflicts).toEqual([]);
    expect(prisma.pervazKilcikYield.create).not.toHaveBeenCalled();
    expect(prisma.pervazKilcikYield.update).not.toHaveBeenCalled();
  });

  it('farklı aktif NET varsa overwrite etmez, conflict raporlar', async () => {
    const prisma = {
      ...basePrisma(),
      pervazKilcikYield: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'existing',
          pervazThicknessMm: 9,
          pieceLengthMm: 2200,
          netQty: 99,
          kilcikTypeId: null,
          excelCutWidthMm: 42,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const report = await seedAyarliPervazKilcikYields(prisma as never);

    expect(report.created).toBe(0);
    expect(report.normalized).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toHaveLength(12);
    expect(report.conflicts[0]).toMatchObject({ excelNetQty: 66, existingNetQty: 99 });
    expect(prisma.pervazKilcikYield.create).not.toHaveBeenCalled();
    expect(prisma.pervazKilcikYield.update).not.toHaveBeenCalled();
  });

  it('farklı excelCutWidth varsa overwrite etmez, conflict raporlar', async () => {
    const prisma = {
      ...basePrisma(),
      pervazKilcikYield: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'existing',
          pervazThicknessMm: 16,
          pieceLengthMm: 2200,
          netQty: 56,
          kilcikTypeId: null,
          excelCutWidthMm: 43,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const report = await seedAyarliPervazKilcikYields(prisma as never);

    expect(report.created).toBe(0);
    expect(report.normalized).toBe(0);
    expect(report.conflicts).toHaveLength(12);
    expect(report.conflicts[8]).toMatchObject({
      pervazThicknessMm: 16,
      excelCutWidthMm: 50,
      existingExcelCutWidthMm: 43,
      excelNetQty: 56,
      existingNetQty: 56,
    });
    expect(prisma.pervazKilcikYield.update).not.toHaveBeenCalled();
  });
});
