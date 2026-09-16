import { PrismaClient } from '@prisma/client';
import { seedCitaProductMaster } from '../products/cita-product-seed';
import {
  CITA_PRODUCTION_YIELD_SEEDS,
  CITA_YIELD_FORBIDDEN_MATERIAL_CODES,
  CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM,
  CITA_YIELD_NET_SET,
  seedCitaProductionYields,
} from './cita-yield-seed-data';

const OTHER_GROUP_CODES = ['door_frame', 'PERVAZ', 'SUPURGELIK'] as const;

async function productScopedYieldCount(
  prisma: PrismaClient,
  groupCode: string,
): Promise<number> {
  const group = await prisma.productGroup.findUnique({ where: { code: groupCode } });
  if (!group) {
    return 0;
  }
  const products = await prisma.product.findMany({
    where: { productGroupId: group.id },
    select: { id: true },
  });
  if (products.length === 0) {
    return 0;
  }
  return prisma.productionYield.count({
    where: { productId: { in: products.map((product) => product.id) } },
  });
}

describe('CITA ProductionYield DB seed (product-scoped, generic yazmaz)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('56 aktif CITA yield yazar; diğer ürünler, generic ve ExtraCost değişmez', async () => {
    await seedCitaProductMaster(prisma);

    const otherYieldsBefore = await Promise.all(
      OTHER_GROUP_CODES.map(async (code) => ({
        code,
        count: await productScopedYieldCount(prisma, code),
      })),
    );
    const genericBefore = await prisma.productionYield.count({
      where: { productId: null },
    });
    const extraCostValueBefore = await prisma.extraCostValue.count();
    const extraCostTypeBefore = await prisma.extraCostType.count();
    const pricingSettingBefore = await prisma.pricingSetting.count();

    const first = await seedCitaProductionYields(prisma);
    const second = await seedCitaProductionYields(prisma);

    const group = await prisma.productGroup.findUnique({
      where: { code: 'CITA' },
    });
    const product = await prisma.product.findUnique({
      where: {
        productGroupId_code: {
          productGroupId: group!.id,
          code: 'CITA',
        },
      },
    });

    const citaYields = await prisma.productionYield.findMany({
      where: { productId: product!.id, isActive: true },
      include: { rawMaterial: true },
      orderBy: [{ rawMaterialId: 'asc' }, { pieceWidthMm: 'asc' }],
    });

    expect(citaYields).toHaveLength(56);
    expect(citaYields.every((row) => row.productId === product!.id)).toBe(true);
    expect(
      await prisma.productionYield.count({
        where: { productId: null, id: { in: citaYields.map((row) => row.id) } },
      }),
    ).toBe(0);

    const keys = citaYields.map(
      (row) =>
        `${row.rawMaterial.code}|${row.pieceWidthMm}|${row.pieceLengthMm}`,
    );
    expect(new Set(keys).size).toBe(56);

    for (const [thickness, materialCode] of Object.entries(
      CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM,
    )) {
      const rows = citaYields
        .filter((row) => row.rawMaterial.code === materialCode)
        .sort((a, b) => a.pieceWidthMm - b.pieceWidthMm);
      expect(rows).toHaveLength(8);
      expect(rows.map((row) => row.pieceWidthMm)).toEqual([
        10, 20, 30, 40, 50, 60, 70, 80,
      ]);
      expect(rows.every((row) => row.pieceLengthMm === 2800)).toBe(true);
      expect(rows.map((row) => row.netQty)).toEqual([...CITA_YIELD_NET_SET]);
      expect(Number(thickness)).toBeGreaterThan(0);
    }

    expect(
      citaYields.filter((row) => row.rawMaterial.code.startsWith('MDF-18-')),
    ).toHaveLength(8);
    expect(
      citaYields
        .filter((row) => row.rawMaterial.code.startsWith('MDF-18-'))
        .every((row) => row.rawMaterial.code === 'MDF-18-2100X2800-ZIMPARALI'),
    ).toBe(true);

    const usedCodes = new Set(citaYields.map((row) => row.rawMaterial.code));
    for (const forbidden of CITA_YIELD_FORBIDDEN_MATERIAL_CODES) {
      expect(usedCodes.has(forbidden)).toBe(false);
    }
    expect(
      citaYields.some((row) => [35, 47, 65].includes(row.pieceWidthMm)),
    ).toBe(false);

    expect(first.conflicts).toEqual([]);
    expect(first.missingMaterials).toEqual([]);
    expect(first.missingProduct).toBe(false);
    expect(first.created + first.unchanged).toBe(56);
    expect(second).toEqual({
      created: 0,
      unchanged: 56,
      conflicts: [],
      missingMaterials: [],
      missingProduct: false,
      totalExpected: 56,
    });

    expect(await prisma.productionYield.count({ where: { productId: null } })).toBe(
      genericBefore,
    );
    expect(await prisma.extraCostValue.count()).toBe(extraCostValueBefore);
    expect(await prisma.extraCostType.count()).toBe(extraCostTypeBefore);
    expect(await prisma.pricingSetting.count()).toBe(pricingSettingBefore);

    for (const before of otherYieldsBefore) {
      expect(await productScopedYieldCount(prisma, before.code)).toBe(
        before.count,
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          first,
          second,
          materials: Object.entries(CITA_YIELD_MATERIAL_CODES_BY_THICKNESS_MM),
          netSet: [...CITA_YIELD_NET_SET],
          expectedRows: CITA_PRODUCTION_YIELD_SEEDS.length,
          citaActiveYields: citaYields.length,
        },
        null,
        2,
      )}\n`,
    );
  });
});
