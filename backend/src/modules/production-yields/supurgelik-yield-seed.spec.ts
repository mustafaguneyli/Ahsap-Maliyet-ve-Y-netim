import {
  SUPURGELIK_PRODUCTION_YIELD_SEEDS,
  seedSupurgelikProductionYields,
} from './supurgelik-yield-seed-data';

const MATERIAL_IDS: Record<string, string> = {
  'MDF-8-2100X2800-ZIMPARALI': 'material-8',
  'MDF-9-2100X2800-ZIMPARALI': 'material-9',
  'MDF-10-2100X2800-ZIMPARALI': 'material-10',
  'MDF-12-2100X2800-ZIMPARALI': 'material-12',
  'MDF-14-2100X2800-ZIMPARALI': 'material-14',
  'MDF-18-2100X2800-ZIMPARALI': 'material-18',
};

function materialMock(code: string) {
  return Promise.resolve({
    id: MATERIAL_IDS[code],
    code,
    isActive: true,
  });
}

describe('SUPURGELIK_PRODUCTION_YIELD_SEEDS', () => {
  it('8/9/10/12/14/18 mm için 30 tekil generic anahtar içerir', () => {
    expect(SUPURGELIK_PRODUCTION_YIELD_SEEDS).toHaveLength(30);
    const keys = SUPURGELIK_PRODUCTION_YIELD_SEEDS.map(
      (row) => `${row.materialCode}|${row.pieceWidthMm}|${row.pieceLengthMm}`,
    );
    expect(new Set(keys).size).toBe(30);
    expect(
      SUPURGELIK_PRODUCTION_YIELD_SEEDS.every(
        (row) => row.pieceLengthMm === 2800,
      ),
    ).toBe(true);
  });

  it.each([8, 9, 10])(
    '%i mm calculated NET dizisini 25/22/20/17/13 olarak tutar',
    (thicknessMm) => {
      const rows = SUPURGELIK_PRODUCTION_YIELD_SEEDS.filter((row) =>
        row.materialCode.startsWith(`MDF-${thicknessMm}-`),
      );
      expect(rows.map((row) => row.pieceWidthMm)).toEqual([80, 90, 100, 120, 150]);
      expect(rows.map((row) => row.netQty)).toEqual([25, 22, 20, 17, 13]);
      expect(rows.every((row) => row.source === 'CALCULATED_CUT_RULE')).toBe(true);
    },
  );

  it('9 mm için yalnız doğrulanmış 2100×2800 MDF kodunu kullanır ve fiyat taşımaz', () => {
    const rows = SUPURGELIK_PRODUCTION_YIELD_SEEDS.filter((row) =>
      row.materialCode.startsWith('MDF-9-'),
    );

    expect(rows).toHaveLength(5);
    expect(
      rows.every(
        (row) => row.materialCode === 'MDF-9-2100X2800-ZIMPARALI',
      ),
    ).toBe(true);
    expect(
      SUPURGELIK_PRODUCTION_YIELD_SEEDS.some(
        (row) => String(row.materialCode) === 'MDF-9-2200X2800-ZIMPARALI',
      ),
    ).toBe(false);
    for (const row of rows) {
      expect(row).not.toHaveProperty('price');
      expect(row).not.toHaveProperty('cashPrice');
      expect(row).not.toHaveProperty('cardPrice');
    }
  });

  it.each([12, 14, 18])(
    '%i mm NET dizisini 25/22/20/16/13 olarak korur',
    (thicknessMm) => {
      const rows = SUPURGELIK_PRODUCTION_YIELD_SEEDS.filter((row) =>
        row.materialCode.startsWith(`MDF-${thicknessMm}-`),
      );
      expect(rows.map((row) => row.pieceWidthMm)).toEqual([80, 90, 100, 120, 150]);
      expect(rows.map((row) => row.netQty)).toEqual([25, 22, 20, 16, 13]);
    },
  );

  it('4 Excel master ve 26 calculated cut-rule kaynağını ayırır', () => {
    const excelRows = SUPURGELIK_PRODUCTION_YIELD_SEEDS.filter(
      (row) => row.source === 'EXCEL_MASTER',
    );
    const calculatedRows = SUPURGELIK_PRODUCTION_YIELD_SEEDS.filter(
      (row) => row.source === 'CALCULATED_CUT_RULE',
    );

    expect(excelRows).toHaveLength(4);
    expect(calculatedRows).toHaveLength(26);
    expect(
      excelRows.map((row) => [row.materialCode, row.pieceWidthMm, row.netQty]),
    ).toEqual([
      ['MDF-12-2100X2800-ZIMPARALI', 120, 16],
      ['MDF-14-2100X2800-ZIMPARALI', 120, 16],
      ['MDF-18-2100X2800-ZIMPARALI', 100, 20],
      ['MDF-18-2100X2800-ZIMPARALI', 120, 16],
    ]);
  });
});

describe('seedSupurgelikProductionYields', () => {
  it('ilk çalışmada yalnız productId NULL olan 30 aktif yield oluşturur', async () => {
    const prisma = {
      rawMaterial: {
        findUnique: jest.fn().mockImplementation(
          ({ where: { code } }: { where: { code: string } }) => materialMock(code),
        ),
      },
      productionYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const report = await seedSupurgelikProductionYields(prisma as never);

    expect(report).toEqual({
      created: 30,
      unchanged: 0,
      conflicts: [],
      missingMaterials: [],
      totalExpected: 30,
    });
    expect(prisma.rawMaterial.findUnique).toHaveBeenCalledTimes(6);
    expect(prisma.productionYield.findFirst).toHaveBeenCalledTimes(30);
    expect(prisma.productionYield.create).toHaveBeenCalledTimes(30);
    for (const [arg] of prisma.productionYield.findFirst.mock.calls) {
      expect(arg.where).toMatchObject({ productId: null, isActive: true });
    }
    for (const [arg] of prisma.productionYield.create.mock.calls) {
      expect(arg.data).toMatchObject({
        productId: null,
        pieceLengthMm: 2800,
        isActive: true,
      });
    }
  });

  it('aynı aktif NET varken ikinci çalışmada duplicate oluşturmaz', async () => {
    const prisma = {
      rawMaterial: {
        findUnique: jest.fn().mockImplementation(
          ({ where: { code } }: { where: { code: string } }) => materialMock(code),
        ),
      },
      productionYield: {
        findFirst: jest.fn().mockImplementation(
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
            const row = SUPURGELIK_PRODUCTION_YIELD_SEEDS.find(
              (candidate) =>
                candidate.materialCode === materialCode &&
                candidate.pieceWidthMm === where.pieceWidthMm &&
                candidate.pieceLengthMm === where.pieceLengthMm,
            );
            return Promise.resolve({ id: 'existing-yield', netQty: row?.netQty });
          },
        ),
        create: jest.fn(),
      },
    };

    const report = await seedSupurgelikProductionYields(prisma as never);

    expect(report).toEqual({
      created: 0,
      unchanged: 30,
      conflicts: [],
      missingMaterials: [],
      totalExpected: 30,
    });
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
  });

  it('farklı aktif NET değerini overwrite etmez ve conflict raporlar', async () => {
    const prisma = {
      rawMaterial: {
        findUnique: jest.fn().mockImplementation(
          ({ where: { code } }: { where: { code: string } }) => materialMock(code),
        ),
      },
      productionYield: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-yield', netQty: 99 }),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const report = await seedSupurgelikProductionYields(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toHaveLength(30);
    expect(report.conflicts[0]).toMatchObject({
      seedNetQty: 25,
      existingNetQty: 99,
    });
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
    expect(prisma.productionYield.update).not.toHaveBeenCalled();
    expect(prisma.productionYield.delete).not.toHaveBeenCalled();
  });

  it('eksik veya inactive ham madde için yield oluşturmaz', async () => {
    const prisma = {
      rawMaterial: {
        findUnique: jest.fn().mockImplementation(
          ({ where: { code } }: { where: { code: string } }) =>
            code.includes('14')
              ? Promise.resolve({ id: 'material-14', code, isActive: false })
              : materialMock(code),
        ),
      },
      productionYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const report = await seedSupurgelikProductionYields(prisma as never);

    expect(report.created).toBe(25);
    expect(report.missingMaterials).toEqual([
      'MDF-14-2100X2800-ZIMPARALI',
    ]);
    expect(prisma.productionYield.create).toHaveBeenCalledTimes(25);
  });
});
