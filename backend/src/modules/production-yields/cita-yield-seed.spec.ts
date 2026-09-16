import {
  CITA_PRODUCTION_YIELD_SEEDS,
  CITA_YIELD_FORBIDDEN_MATERIAL_CODES,
  CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM,
  CITA_YIELD_NET_SET,
  seedCitaProductionYields,
} from './cita-yield-seed-data';
import { CITA_STANDARD_FALLBACK_NET } from '../products/cita-cut-rule.fixture';

const MATERIAL_IDS: Record<string, string> = {
  'MDF-10-2100X2800-ZIMPARALI': 'material-10',
  'MDF-12-2100X2800-ZIMPARALI': 'material-12',
  'MDF-14-2100X2800-ZIMPARALI': 'material-14',
  'MDF-16-2100X2800-ZIMPARALI': 'material-16',
  'MDF-18-2100X2800-ZIMPARALI': 'material-18',
  'MDF-22-2100X2800-ZIMPARALI': 'material-22',
  'MDF-30-2100X2800-ZIMPARALI': 'material-30',
};

function materialMock(code: string) {
  return Promise.resolve({
    id: MATERIAL_IDS[code],
    code,
    isActive: true,
  });
}

function citaProductPrisma(overrides?: {
  group?: { id: string; isActive: boolean } | null;
  product?: { id: string; isActive: boolean } | null;
  materialFindUnique?: jest.Mock;
  yieldFindFirst?: jest.Mock;
  yieldCreate?: jest.Mock;
  yieldUpdate?: jest.Mock;
  yieldDelete?: jest.Mock;
}) {
  return {
    productGroup: {
      findUnique: jest.fn().mockResolvedValue(
        overrides && 'group' in overrides
          ? overrides.group
          : { id: 'g-cita', code: 'CITA', isActive: true },
      ),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue(
        overrides && 'product' in overrides
          ? overrides.product
          : { id: 'p-cita', code: 'CITA', isActive: true },
      ),
    },
    rawMaterial: {
      findUnique:
        overrides?.materialFindUnique ??
        jest.fn().mockImplementation(
          ({ where: { code } }: { where: { code: string } }) =>
            materialMock(code),
        ),
    },
    productionYield: {
      findFirst:
        overrides?.yieldFindFirst ?? jest.fn().mockResolvedValue(null),
      create: overrides?.yieldCreate ?? jest.fn().mockResolvedValue({}),
      update: overrides?.yieldUpdate ?? jest.fn(),
      delete: overrides?.yieldDelete ?? jest.fn(),
    },
  };
}

describe('CITA_PRODUCTION_YIELD_SEEDS', () => {
  it('7 kalınlık × 8 standart en = 56 tekil product-scoped anahtar üretir', () => {
    expect(CITA_PRODUCTION_YIELD_SEEDS).toHaveLength(56);
    const keys = CITA_PRODUCTION_YIELD_SEEDS.map(
      (row) => `${row.materialCode}|${row.pieceWidthMm}|${row.pieceLengthMm}`,
    );
    expect(new Set(keys).size).toBe(56);
    expect(
      CITA_PRODUCTION_YIELD_SEEDS.every((row) => row.pieceLengthMm === 2800),
    ).toBe(true);
    expect(
      CITA_PRODUCTION_YIELD_SEEDS.every(
        (row) => row.source === 'CALCULATED_CUT_RULE',
      ),
    ).toBe(true);
  });

  it.each([
    [10, 'MDF-10-2100X2800-ZIMPARALI'],
    [12, 'MDF-12-2100X2800-ZIMPARALI'],
    [14, 'MDF-14-2100X2800-ZIMPARALI'],
    [16, 'MDF-16-2100X2800-ZIMPARALI'],
    [18, 'MDF-18-2100X2800-ZIMPARALI'],
    [22, 'MDF-22-2100X2800-ZIMPARALI'],
    [30, 'MDF-30-2100X2800-ZIMPARALI'],
  ] as const)(
    '%i mm yalnız %s kullanır ve NET 150/87/61/47/38/32/28/25 tutar',
    (thicknessMm, materialCode) => {
      expect(CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM[thicknessMm]).toBe(
        materialCode,
      );
      const rows = CITA_PRODUCTION_YIELD_SEEDS.filter(
        (row) => row.materialCode === materialCode,
      );
      expect(rows).toHaveLength(8);
      expect(rows.map((row) => row.pieceWidthMm)).toEqual([
        10, 20, 30, 40, 50, 60, 70, 80,
      ]);
      expect(rows.map((row) => row.netQty)).toEqual([...CITA_YIELD_NET_SET]);
      expect(rows.map((row) => row.netQty)).toEqual(
        CITA_STANDARD_FALLBACK_NET.map((row) => row.netQty),
      );
    },
  );

  it('18 mm NEOPAN/Membranlık ve 22 mm UI-TEST kullanmaz', () => {
    const codes = CITA_PRODUCTION_YIELD_SEEDS.map((row) => row.materialCode);
    for (const forbidden of CITA_YIELD_FORBIDDEN_MATERIAL_CODES) {
      expect(codes).not.toContain(forbidden);
    }
    expect(
      CITA_PRODUCTION_YIELD_SEEDS.filter((row) =>
        row.materialCode.startsWith('MDF-18-'),
      ).every((row) => row.materialCode === 'MDF-18-2100X2800-ZIMPARALI'),
    ).toBe(true);
  });

  it('custom 35/47/65 mm en için yield satırı üretmez', () => {
    expect(
      CITA_PRODUCTION_YIELD_SEEDS.some((row) =>
        [35, 47, 65].includes(row.pieceWidthMm),
      ),
    ).toBe(false);
  });
});

describe('seedCitaProductionYields', () => {
  it('ilk çalışmada yalnız productId=CITA olan 56 aktif yield oluşturur', async () => {
    const prisma = citaProductPrisma();
    const report = await seedCitaProductionYields(prisma as never);

    expect(report).toEqual({
      created: 56,
      unchanged: 0,
      conflicts: [],
      missingMaterials: [],
      missingProduct: false,
      totalExpected: 56,
    });
    expect(prisma.productionYield.findFirst).toHaveBeenCalledTimes(56);
    expect(prisma.productionYield.create).toHaveBeenCalledTimes(56);
    for (const [arg] of prisma.productionYield.findFirst.mock.calls) {
      expect(arg.where).toMatchObject({
        productId: 'p-cita',
        isActive: true,
      });
      expect(arg.where.productId).not.toBeNull();
    }
    for (const [arg] of prisma.productionYield.create.mock.calls) {
      expect(arg.data).toMatchObject({
        productId: 'p-cita',
        pieceLengthMm: 2800,
        isActive: true,
      });
      expect(arg.data).not.toHaveProperty('source');
    }
  });

  it('aynı aktif NET varken ikinci çalışmada duplicate oluşturmaz', async () => {
    const prisma = citaProductPrisma({
      yieldFindFirst: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            rawMaterialId: string;
            pieceWidthMm: number;
            pieceLengthMm: number;
          };
        }) => {
          const materialCode = Object.entries(MATERIAL_IDS).find(
            ([, id]) => id === where.rawMaterialId,
          )?.[0];
          const row = CITA_PRODUCTION_YIELD_SEEDS.find(
            (candidate) =>
              candidate.materialCode === materialCode &&
              candidate.pieceWidthMm === where.pieceWidthMm &&
              candidate.pieceLengthMm === where.pieceLengthMm,
          );
          return Promise.resolve({ id: 'existing-yield', netQty: row?.netQty });
        },
      ),
      yieldCreate: jest.fn(),
    });

    const report = await seedCitaProductionYields(prisma as never);

    expect(report).toEqual({
      created: 0,
      unchanged: 56,
      conflicts: [],
      missingMaterials: [],
      missingProduct: false,
      totalExpected: 56,
    });
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
  });

  it('farklı aktif NET değerini overwrite etmez, silmez ve conflict raporlar', async () => {
    const prisma = citaProductPrisma({
      yieldFindFirst: jest.fn().mockResolvedValue({
        id: 'user-yield',
        netQty: 99,
      }),
    });

    const report = await seedCitaProductionYields(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toHaveLength(56);
    expect(report.conflicts[0]).toMatchObject({
      seedNetQty: 150,
      existingNetQty: 99,
    });
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
    expect(prisma.productionYield.update).not.toHaveBeenCalled();
    expect(prisma.productionYield.delete).not.toHaveBeenCalled();
  });

  it('CITA ürünü yoksa yield yazmaz', async () => {
    const prisma = citaProductPrisma({
      group: null,
      product: null,
    });

    const report = await seedCitaProductionYields(prisma as never);

    expect(report).toMatchObject({
      created: 0,
      missingProduct: true,
      totalExpected: 56,
    });
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
  });

  it('eksik veya inactive ham madde için yield oluşturmaz', async () => {
    const prisma = citaProductPrisma({
      materialFindUnique: jest.fn().mockImplementation(
        ({ where: { code } }: { where: { code: string } }) =>
          code.includes('16')
            ? Promise.resolve({ id: 'material-16', code, isActive: false })
            : materialMock(code),
      ),
    });

    const report = await seedCitaProductionYields(prisma as never);

    expect(report.created).toBe(48);
    expect(report.missingMaterials).toEqual(['MDF-16-2100X2800-ZIMPARALI']);
    expect(prisma.productionYield.create).toHaveBeenCalledTimes(48);
  });
});
