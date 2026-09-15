import {
  buildAyarliPervazYieldSeedRows,
  seedAyarliPervazProductionYields,
} from './pervaz-ayarli-yield-seed-data';

describe('buildAyarliPervazYieldSeedRows', () => {
  const rows = buildAyarliPervazYieldSeedRows();

  it('tam 20 tekil PERVAZ parçası üretir', () => {
    expect(rows).toHaveLength(20);
    const keys = rows.map((r) => `${r.materialCode}|${r.pieceWidthMm}|${r.pieceLengthMm}`);
    expect(new Set(keys).size).toBe(20);
  });

  it('kılçık / 4 mm ham madde içermez', () => {
    expect(rows.every((r) => !r.materialCode.includes('MDF-4-'))).toBe(true);
  });

  it('9 mm tüm satırları 220×280 9 mm tabakaya bağlar', () => {
    const nine = rows.filter((r) => r.materialCode === 'MDF-9-2200X2800-ZIMPARALI');
    expect(nine).toHaveLength(8);
    expect(nine.map((r) => [r.pieceWidthMm, r.pieceLengthMm, r.netQty])).toEqual([
      [70, 2200, 40],
      [80, 2200, 35],
      [80, 2300, 27],
      [90, 2200, 31],
      [90, 2500, 24],
      [100, 2200, 28],
      [100, 2550, 22],
      [120, 2200, 23],
    ]);
  });

  it('12 mm 10×250 210×280 kullanır; diğer 12 mm 220×280 kullanır', () => {
    const twelve220 = rows.filter((r) => r.materialCode === 'MDF-12-2200X2800-ZIMPARALI');
    expect(twelve220).toHaveLength(4);
    expect(
      rows.find(
        (r) =>
          r.materialCode === 'MDF-12-2100X2800-ZIMPARALI' &&
          r.pieceWidthMm === 100 &&
          r.pieceLengthMm === 2500,
      )?.netQty,
    ).toBe(22);
    expect(
      rows.some(
        (r) =>
          r.materialCode === 'MDF-12-2200X2800-ZIMPARALI' &&
          r.pieceWidthMm === 100 &&
          r.pieceLengthMm === 2500,
      ),
    ).toBe(false);
  });

  it('18 mm satırlar 220×280 kullanır; 210×280 18 mm kullanmaz', () => {
    const eighteen = rows.filter((r) => r.materialCode.startsWith('MDF-18-'));
    expect(eighteen).toHaveLength(3);
    expect(eighteen.every((r) => r.materialCode === 'MDF-18-2200X2800-ZIMPARALI')).toBe(true);
    expect(eighteen.map((r) => [r.pieceWidthMm, r.pieceLengthMm, r.netQty])).toEqual([
      [100, 2200, 28],
      [80, 2200, 35],
      [100, 2500, 21],
    ]);
  });

  it('14 mm ve 16 mm 210×280 kullanır', () => {
    expect(
      rows.filter((r) => r.materialCode === 'MDF-14-2100X2800-ZIMPARALI').map((r) => r.netQty),
    ).toEqual([21, 21]);
    expect(
      rows.filter((r) => r.materialCode === 'MDF-16-2100X2800-ZIMPARALI').map((r) => r.netQty),
    ).toEqual([21, 21]);
  });
});

describe('seedAyarliPervazProductionYields', () => {
  const materialIds: Record<string, string> = {
    'MDF-9-2200X2800-ZIMPARALI': 'm9',
    'MDF-12-2200X2800-ZIMPARALI': 'm12-220',
    'MDF-12-2100X2800-ZIMPARALI': 'm12-210',
    'MDF-14-2100X2800-ZIMPARALI': 'm14',
    'MDF-16-2100X2800-ZIMPARALI': 'm16',
    'MDF-18-2200X2800-ZIMPARALI': 'm18-220',
  };

  it('ilk çalışmada 20 aktif yield oluşturur', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pervaz-group', isActive: true }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ayarli-product', isActive: true }),
      },
      rawMaterial: {
        findUnique: jest.fn().mockImplementation(({ where: { code } }: { where: { code: string } }) =>
          Promise.resolve({ id: materialIds[code], code }),
        ),
      },
      productionYield: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const report = await seedAyarliPervazProductionYields(prisma as never);

    expect(report.totalExpected).toBe(20);
    expect(report.created).toBe(20);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toEqual([]);
    expect(report.missingMaterials).toEqual([]);
    expect(prisma.productionYield.create).toHaveBeenCalledTimes(20);
    expect(prisma.productionYield.create.mock.calls[12][0].data).toMatchObject({
      productId: 'ayarli-product',
      rawMaterialId: 'm12-210',
      pieceWidthMm: 100,
      pieceLengthMm: 2500,
      netQty: 22,
      isActive: true,
    });
  });

  it('aynı NET varken duplicate oluşturmaz', async () => {
    const rows = buildAyarliPervazYieldSeedRows();
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pervaz-group', isActive: true }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ayarli-product', isActive: true }),
      },
      rawMaterial: {
        findUnique: jest.fn().mockImplementation(({ where: { code } }: { where: { code: string } }) =>
          Promise.resolve({ id: materialIds[code], code }),
        ),
      },
      productionYield: {
        findFirst: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: { rawMaterialId: string; pieceWidthMm: number; pieceLengthMm: number };
          }) => {
            const materialCode = Object.entries(materialIds).find(
              ([, id]) => id === where.rawMaterialId,
            )?.[0];
            const row = rows.find(
              (r) =>
                r.materialCode === materialCode &&
                r.pieceWidthMm === where.pieceWidthMm &&
                r.pieceLengthMm === where.pieceLengthMm,
            );
            return Promise.resolve({ id: 'existing', netQty: row?.netQty });
          },
        ),
        create: jest.fn(),
      },
    };

    const report = await seedAyarliPervazProductionYields(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(20);
    expect(report.conflicts).toEqual([]);
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
  });

  it('farklı aktif NET varsa overwrite etmez, conflict raporlar', async () => {
    const prisma = {
      productGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pervaz-group', isActive: true }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ayarli-product', isActive: true }),
      },
      rawMaterial: {
        findUnique: jest.fn().mockImplementation(({ where: { code } }: { where: { code: string } }) =>
          Promise.resolve({ id: materialIds[code], code }),
        ),
      },
      productionYield: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing', netQty: 99 }),
        create: jest.fn(),
      },
    };

    const report = await seedAyarliPervazProductionYields(prisma as never);

    expect(report.created).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.conflicts).toHaveLength(20);
    expect(report.conflicts[0]).toMatchObject({
      excelNetQty: 40,
      existingNetQty: 99,
    });
    expect(prisma.productionYield.create).not.toHaveBeenCalled();
  });
});
