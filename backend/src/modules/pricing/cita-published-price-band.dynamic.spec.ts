import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';
import { seedCitaProductMaster } from '../products/cita-product-seed';
import {
  CITA_PUBLISHED_PRICE_BAND_SEEDS,
  CITA_PUBLISHED_PRICE_MISSING,
  CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM,
  selectCitaPublishedPrice,
} from './cita-published-price-band-data';
import { seedCitaPublishedPriceBands } from './cita-published-price-band-seed';

const OTHER_GROUP_CODES = ['door_frame', 'PERVAZ', 'SUPURGELIK'] as const;

describe('CITA published price band DB seed', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dört bandı yazar; 10/22/30 yoktur; 18 mm yalnız 5–6 cm; diğer ürünler değişmez', async () => {
    await seedCitaProductMaster(prisma);

    const otherPricingBefore = await prisma.pricingSetting.count();
    const extraCostBefore = await prisma.extraCostValue.count();
    const yieldBefore = await prisma.productionYield.count();
    const overrideBefore = await prisma.priceOverride.count();
    const otherGroupBandBefore = await Promise.all(
      OTHER_GROUP_CODES.map(async (code) => {
        const other = await prisma.productGroup.findUnique({ where: { code } });
        return other
          ? prisma.citaPublishedPriceBand.count({
              where: { productGroupId: other.id },
            })
          : 0;
      }),
    );

    const first = await seedCitaPublishedPriceBands(prisma);
    const second = await seedCitaPublishedPriceBands(prisma);

    const group = await prisma.productGroup.findUnique({
      where: { code: 'CITA' },
    });
    const bands = await prisma.citaPublishedPriceBand.findMany({
      where: { productGroupId: group!.id, isActive: true, effectiveTo: null },
      include: { thicknesses: { orderBy: { thicknessMm: 'asc' } } },
      orderBy: { minWidthMm: 'asc' },
    });

    expect(first.totalExpected).toBe(4);
    expect(first.conflicts).toEqual([]);
    expect(first.created + first.unchanged).toBe(4);
    expect(second.created).toBe(0);
    expect(second.unchanged).toBe(4);
    expect(bands).toHaveLength(4);
    expect(
      bands.map((row) => ({
        minWidthMm: row.minWidthMm,
        maxWidthMm: row.maxWidthMm,
        cashPrice: toDecimal(row.cashPrice.toString()).toString(),
        cardPrice: toDecimal(row.cardPrice.toString()).toString(),
        thicknessMm: row.thicknesses.map((item) => item.thicknessMm),
      })),
    ).toEqual(
      CITA_PUBLISHED_PRICE_BAND_SEEDS.map((seed) => ({
        minWidthMm: seed.minWidthMm,
        maxWidthMm: seed.maxWidthMm,
        cashPrice: seed.cashPrice,
        cardPrice: seed.cardPrice,
        thicknessMm: [...seed.thicknessMm],
      })),
    );

    const views = bands.map((row) => ({
      minWidthMm: row.minWidthMm,
      maxWidthMm: row.maxWidthMm,
      cashPrice: toDecimal(row.cashPrice.toString()).toString(),
      cardPrice: toDecimal(row.cardPrice.toString()).toString(),
      thicknessMm: row.thicknesses.map((item) => item.thicknessMm),
      isActive: row.isActive,
      effectiveTo: row.effectiveTo,
    }));
    expect(selectCitaPublishedPrice(views, { widthMm: 10, thicknessMm: 12 })).toMatchObject({
      cashPrice: '115',
      cardPrice: '138',
    });
    expect(selectCitaPublishedPrice(views, { widthMm: 20, thicknessMm: 16 })).toMatchObject({
      cashPrice: '115',
      cardPrice: '138',
    });
    expect(selectCitaPublishedPrice(views, { widthMm: 50, thicknessMm: 18 })).toMatchObject({
      cashPrice: '185',
      cardPrice: '222',
    });
    for (const thicknessMm of CITA_PUBLISHED_PRICE_UNSUPPORTED_THICKNESSES_MM) {
      expect(
        selectCitaPublishedPrice(views, { widthMm: 50, thicknessMm }),
      ).toMatchObject({
        cashPrice: null,
        cardPrice: null,
        statusCode: CITA_PUBLISHED_PRICE_MISSING,
      });
    }
    expect(
      selectCitaPublishedPrice(views, { widthMm: 10, thicknessMm: 18 }),
    ).toMatchObject({ statusCode: CITA_PUBLISHED_PRICE_MISSING });

    await expect(
      prisma.citaPublishedPriceBand.create({
        data: {
          productGroupId: group!.id,
          minWidthMm: 10,
          maxWidthMm: 20,
          cashPrice: new Decimal('999'),
          cardPrice: new Decimal('999'),
          isActive: true,
          effectiveFrom: new Date('2026-09-16T00:00:00.000Z'),
          effectiveTo: null,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.citaPublishedPriceBand.create({
        data: {
          productGroupId: group!.id,
          minWidthMm: 90,
          maxWidthMm: 100,
          cashPrice: new Decimal('0'),
          cardPrice: new Decimal('10'),
          isActive: false,
          effectiveFrom: new Date('2026-09-16T00:00:00.000Z'),
          effectiveTo: null,
        },
      }),
    ).rejects.toThrow();

    const twelveBand = bands.find((row) => row.minWidthMm === 10);
    await expect(
      prisma.citaPublishedPriceBandThickness.create({
        data: { bandId: twelveBand!.id, thicknessMm: 12 },
      }),
    ).rejects.toThrow();

    expect(await prisma.pricingSetting.count()).toBe(otherPricingBefore);
    expect(await prisma.extraCostValue.count()).toBe(extraCostBefore);
    expect(await prisma.productionYield.count()).toBe(yieldBefore);
    expect(await prisma.priceOverride.count()).toBe(overrideBefore);
    const otherGroupBandAfter = await Promise.all(
      OTHER_GROUP_CODES.map(async (code) => {
        const other = await prisma.productGroup.findUnique({ where: { code } });
        return other
          ? prisma.citaPublishedPriceBand.count({
              where: { productGroupId: other.id },
            })
          : 0;
      }),
    );
    expect(otherGroupBandAfter).toEqual(otherGroupBandBefore);
    expect(otherGroupBandAfter.every((count) => count === 0)).toBe(true);
  });
});
