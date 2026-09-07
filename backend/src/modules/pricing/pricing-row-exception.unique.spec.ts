import { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const SENTINEL_THICKNESS_MM = 91;
const SENTINEL_WIDTH_MM = 13;
const SENTINEL_LENGTH_MM = 9191;
const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');

describe('PricingRowException unique / CHECK', () => {
  const prisma = new PrismaClient();
  let productId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const group = await prisma.productGroup.findUnique({ where: { code: 'PERVAZ' } });
    const product = group
      ? await prisma.product.findUnique({
          where: { productGroupId_code: { productGroupId: group.id, code: 'AYARLI_PERVAZ' } },
        })
      : null;
    if (!product) {
      throw new Error('Unique test için AYARLI_PERVAZ seed kaydı gerekir.');
    }
    productId = product.id;
  });

  afterAll(async () => {
    if (productId) {
      await prisma.pricingRowException.deleteMany({
        where: { productId, lengthMm: SENTINEL_LENGTH_MM },
      });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.pricingRowException.deleteMany({
      where: { productId, lengthMm: SENTINEL_LENGTH_MM },
    });
  });

  it('aynı aktif açık satır ikinci kez oluşturulamaz', async () => {
    await prisma.pricingRowException.create({
      data: {
        productId,
        thicknessMm: SENTINEL_THICKNESS_MM,
        widthMm: SENTINEL_WIDTH_MM,
        lengthMm: SENTINEL_LENGTH_MM,
        profitRate: new Decimal('20'),
        adjustmentAmount: null,
        isActive: true,
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: null,
      },
    });

    await expect(
      prisma.pricingRowException.create({
        data: {
          productId,
          thicknessMm: SENTINEL_THICKNESS_MM,
          widthMm: SENTINEL_WIDTH_MM,
          lengthMm: SENTINEL_LENGTH_MM,
          profitRate: new Decimal('25'),
          adjustmentAmount: null,
          isActive: true,
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it('inactive geçmiş aynı satır anahtarıyla tutulabilir', async () => {
    await prisma.pricingRowException.create({
      data: {
        productId,
        thicknessMm: SENTINEL_THICKNESS_MM,
        widthMm: SENTINEL_WIDTH_MM,
        lengthMm: SENTINEL_LENGTH_MM,
        profitRate: new Decimal('20'),
        adjustmentAmount: null,
        isActive: false,
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const current = await prisma.pricingRowException.create({
      data: {
        productId,
        thicknessMm: SENTINEL_THICKNESS_MM,
        widthMm: SENTINEL_WIDTH_MM,
        lengthMm: SENTINEL_LENGTH_MM,
        profitRate: new Decimal('22'),
        adjustmentAmount: null,
        isActive: true,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveTo: null,
      },
    });

    const rows = await prisma.pricingRowException.findMany({
      where: {
        productId,
        thicknessMm: SENTINEL_THICKNESS_MM,
        widthMm: SENTINEL_WIDTH_MM,
        lengthMm: SENTINEL_LENGTH_MM,
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.isActive)).toHaveLength(1);
    expect(current.profitRate?.toString()).toBe('22');
  });

  it('profitRate ve adjustmentAmount ikisi de null ise CHECK reddeder', async () => {
    await expect(
      prisma.pricingRowException.create({
        data: {
          productId,
          thicknessMm: SENTINEL_THICKNESS_MM,
          widthMm: SENTINEL_WIDTH_MM,
          lengthMm: SENTINEL_LENGTH_MM,
          profitRate: null,
          adjustmentAmount: null,
          isActive: true,
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: null,
        },
      }),
    ).rejects.toThrow();
  });
});
