import { PrismaClient } from '@prisma/client';
import { CITA_PRODUCT_SIZE_SEEDS, seedCitaProductMaster } from './cita-product-seed';

const OTHER_GROUP_CODES = ['door_frame', 'PERVAZ', 'SUPURGELIK'] as const;

describe('CITA product master DB seed (ProductionYield yazmaz)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('CITA grubu ve tek ürünü oluşturur/reuse eder; diğer ürünler ve yield değişmez', async () => {
    const otherCountsBefore = await Promise.all(
      OTHER_GROUP_CODES.map(async (code) => {
        const group = await prisma.productGroup.findUnique({ where: { code } });
        const productCount = group
          ? await prisma.product.count({ where: { productGroupId: group.id } })
          : 0;
        return { code, productCount };
      }),
    );
    const yieldCountBefore = await prisma.productionYield.count();
    const citaGroupBefore = await prisma.productGroup.findUnique({
      where: { code: 'CITA' },
    });
    const citaProductBefore = citaGroupBefore
      ? await prisma.product.findUnique({
          where: {
            productGroupId_code: {
              productGroupId: citaGroupBefore.id,
              code: 'CITA',
            },
          },
        })
      : null;
    const citaYieldsBefore = citaProductBefore
      ? await prisma.productionYield.count({
          where: { productId: citaProductBefore.id },
        })
      : 0;
    const extraCostValueCountBefore = await prisma.extraCostValue.count();
    const extraCostTypeCountBefore = await prisma.extraCostType.count();
    const pricingSettingCountBefore = await prisma.pricingSetting.count();

    const first = await seedCitaProductMaster(prisma);
    const second = await seedCitaProductMaster(prisma);

    const group = await prisma.productGroup.findUnique({
      where: { code: 'CITA' },
    });
    expect(group?.isActive).toBe(true);
    expect(group?.name).toBe('Çıta');

    const products = await prisma.product.findMany({
      where: { productGroupId: group!.id },
    });
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      code: 'CITA',
      name: 'Çıta',
      isActive: true,
    });

    const sizes = await prisma.productSize.findMany({
      where: {
        OR: CITA_PRODUCT_SIZE_SEEDS.map((size) => ({
          widthMm: size.widthMm,
          lengthMm: size.lengthMm,
        })),
      },
      orderBy: { widthMm: 'asc' },
    });
    expect(sizes).toHaveLength(8);
    expect(sizes.map((size) => `${size.widthMm}×${size.lengthMm}`)).toEqual(
      CITA_PRODUCT_SIZE_SEEDS.map((size) => `${size.widthMm}×${size.lengthMm}`),
    );

    expect(
      await prisma.productionYield.count({
        where: { productId: products[0].id },
      }),
    ).toBe(citaYieldsBefore);
    expect(await prisma.productionYield.count()).toBe(yieldCountBefore);
    expect(await prisma.extraCostValue.count()).toBe(extraCostValueCountBefore);
    expect(await prisma.extraCostType.count()).toBe(extraCostTypeCountBefore);
    expect(await prisma.pricingSetting.count()).toBe(pricingSettingCountBefore);

    expect(second).toEqual({
      productGroupCreated: false,
      productsCreated: 0,
      productsSkippedExisting: 1,
      sizesCreated: 0,
      sizesSkippedExisting: 8,
    });
    expect(first.productsCreated + first.productsSkippedExisting).toBe(1);
    expect(first.sizesCreated + first.sizesSkippedExisting).toBe(8);

    process.stdout.write(
      `${JSON.stringify(
        {
          first,
          second,
          sizes: sizes.map((size) => ({
            widthMm: size.widthMm,
            lengthMm: size.lengthMm,
            displayName: size.displayName,
          })),
        },
        null,
        2,
      )}\n`,
    );

    for (const before of otherCountsBefore) {
      const groupAfter = await prisma.productGroup.findUnique({
        where: { code: before.code },
      });
      const productCountAfter = groupAfter
        ? await prisma.product.count({ where: { productGroupId: groupAfter.id } })
        : 0;
      expect(productCountAfter).toBe(before.productCount);
    }
  });
});
