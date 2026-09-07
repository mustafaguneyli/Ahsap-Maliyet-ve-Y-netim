import { Prisma, PrismaClient } from '@prisma/client';

const SENTINEL_LENGTH_MM = 9191;
const EXPECTED_EXCEL_MASTERS = [
  { pervazThicknessMm: 9, pieceLengthMm: 2200, netQty: 66, excelCutWidthMm: 42 },
  { pervazThicknessMm: 9, pieceLengthMm: 2300, netQty: 52, excelCutWidthMm: 42 },
  { pervazThicknessMm: 9, pieceLengthMm: 2500, netQty: 52, excelCutWidthMm: 42 },
  { pervazThicknessMm: 9, pieceLengthMm: 2550, netQty: 52, excelCutWidthMm: 42 },
  { pervazThicknessMm: 12, pieceLengthMm: 2200, netQty: 66, excelCutWidthMm: 42 },
  { pervazThicknessMm: 12, pieceLengthMm: 2500, netQty: 52, excelCutWidthMm: 42 },
  { pervazThicknessMm: 14, pieceLengthMm: 2200, netQty: 62, excelCutWidthMm: 45 },
  { pervazThicknessMm: 14, pieceLengthMm: 2500, netQty: 48, excelCutWidthMm: 45 },
  { pervazThicknessMm: 16, pieceLengthMm: 2200, netQty: 56, excelCutWidthMm: 50 },
  { pervazThicknessMm: 16, pieceLengthMm: 2500, netQty: 44, excelCutWidthMm: 50 },
  { pervazThicknessMm: 18, pieceLengthMm: 2200, netQty: 50, excelCutWidthMm: 55 },
  { pervazThicknessMm: 18, pieceLengthMm: 2500, netQty: 40, excelCutWidthMm: 55 },
] as const;

describe('PervazKilcikYield unique / nullable kilcikTypeId', () => {
  const prisma = new PrismaClient();
  let productId = '';
  let rawMaterialId = '';
  let wideTypeId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const group = await prisma.productGroup.findUnique({ where: { code: 'PERVAZ' } });
    const product = group
      ? await prisma.product.findUnique({
          where: { productGroupId_code: { productGroupId: group.id, code: 'AYARLI_PERVAZ' } },
        })
      : null;
    const material = await prisma.rawMaterial.findUnique({
      where: { code: 'MDF-4-2200X2800-ZIMPARALI' },
    });
    const wide = await prisma.kilcikType.findUnique({ where: { code: 'WIDE' } });
    if (!product || !material || !wide) {
      throw new Error(
        'Unique test için AYARLI_PERVAZ, MDF-4-2200X2800-ZIMPARALI ve WIDE seed kayıtları gerekir.',
      );
    }
    productId = product.id;
    rawMaterialId = material.id;
    wideTypeId = wide.id;
  });

  afterAll(async () => {
    if (productId) {
      await prisma.pervazKilcikYield.deleteMany({
        where: { productId, pieceLengthMm: SENTINEL_LENGTH_MM },
      });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.pervazKilcikYield.deleteMany({
      where: { productId, pieceLengthMm: SENTINEL_LENGTH_MM },
    });
  });

  it('STANDARD / WIDE kılçık tipi master kayıtları bozulmaz', async () => {
    const types = await prisma.kilcikType.findMany({ orderBy: { code: 'asc' } });
    expect(types.map((t) => t.code)).toEqual(['STANDARD', 'WIDE']);
    expect(types.find((t) => t.code === 'STANDARD')).toMatchObject({
      nominalWidthMm: 39,
      bladeAllowanceMm: 4,
      cutPitchMm: 43,
    });
    expect(types.find((t) => t.code === 'WIDE')).toMatchObject({
      nominalWidthMm: 55,
      bladeAllowanceMm: 4,
      cutPitchMm: 59,
    });
  });

  it('AYARLI_PERVAZ 12 aktif EXCEL_MASTER tipsizdir; 2800 yoktur', async () => {
    const rows = await prisma.pervazKilcikYield.findMany({
      where: {
        productId,
        source: 'EXCEL_MASTER',
        isActive: true,
        pieceLengthMm: { not: SENTINEL_LENGTH_MM },
      },
    });
    expect(rows).toHaveLength(12);
    expect(rows.some((r) => r.pieceLengthMm === 2800)).toBe(false);
    for (const expected of EXPECTED_EXCEL_MASTERS) {
      const row = rows.find(
        (r) =>
          r.pervazThicknessMm === expected.pervazThicknessMm &&
          r.pieceLengthMm === expected.pieceLengthMm,
      );
      expect(row).toMatchObject({
        netQty: expected.netQty,
        source: 'EXCEL_MASTER',
        kilcikTypeId: null,
        excelCutWidthMm: expected.excelCutWidthMm,
        isActive: true,
      });
    }
  });

  it('EXCEL_MASTER kilcikTypeId olmadan oluşturulabilir', async () => {
    const created = await prisma.pervazKilcikYield.create({
      data: {
        productId,
        rawMaterialId,
        pervazThicknessMm: 9,
        pieceLengthMm: SENTINEL_LENGTH_MM,
        netQty: 66,
        source: 'EXCEL_MASTER',
        excelCutWidthMm: 42,
        isActive: true,
      },
    });
    expect(created.kilcikTypeId).toBeNull();
    expect(created.source).toBe('EXCEL_MASTER');
    expect(created.excelCutWidthMm).toBe(42);
  });

  it('aynı product + thickness + length için ikinci aktif EXCEL_MASTER reddedilir', async () => {
    await prisma.pervazKilcikYield.create({
      data: {
        productId,
        rawMaterialId,
        pervazThicknessMm: 16,
        pieceLengthMm: SENTINEL_LENGTH_MM,
        netQty: 56,
        source: 'EXCEL_MASTER',
        excelCutWidthMm: 50,
        isActive: true,
      },
    });

    await expect(
      prisma.pervazKilcikYield.create({
        data: {
          productId,
          rawMaterialId,
          pervazThicknessMm: 16,
          pieceLengthMm: SENTINEL_LENGTH_MM,
          netQty: 57,
          source: 'EXCEL_MASTER',
          isActive: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it('farklı thickness aynı length ile birlikte tutulabilir', async () => {
    await prisma.pervazKilcikYield.create({
      data: {
        productId,
        rawMaterialId,
        pervazThicknessMm: 9,
        pieceLengthMm: SENTINEL_LENGTH_MM,
        netQty: 66,
        source: 'EXCEL_MASTER',
        isActive: true,
      },
    });
    const second = await prisma.pervazKilcikYield.create({
      data: {
        productId,
        rawMaterialId,
        pervazThicknessMm: 12,
        pieceLengthMm: SENTINEL_LENGTH_MM,
        netQty: 66,
        source: 'EXCEL_MASTER',
        isActive: true,
      },
    });
    expect(second.pervazThicknessMm).toBe(12);
  });

  it('inactive geçmiş tutulabilir; yeni aktif EXCEL_MASTER aynı bağlamda açılabilir', async () => {
    const previous = await prisma.pervazKilcikYield.create({
      data: {
        productId,
        rawMaterialId,
        pervazThicknessMm: 14,
        pieceLengthMm: SENTINEL_LENGTH_MM,
        netQty: 61,
        source: 'EXCEL_MASTER',
        kilcikTypeId: wideTypeId,
        isActive: true,
      },
    });
    await prisma.pervazKilcikYield.update({
      where: { id: previous.id },
      data: { isActive: false },
    });

    const current = await prisma.pervazKilcikYield.create({
      data: {
        productId,
        rawMaterialId,
        pervazThicknessMm: 14,
        pieceLengthMm: SENTINEL_LENGTH_MM,
        netQty: 62,
        source: 'EXCEL_MASTER',
        isActive: true,
      },
    });

    expect(current.kilcikTypeId).toBeNull();
    const archived = await prisma.pervazKilcikYield.findUnique({ where: { id: previous.id } });
    expect(archived?.isActive).toBe(false);
    expect(archived?.netQty).toBe(61);
    expect(archived?.kilcikTypeId).toBe(wideTypeId);
  });
});
