import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('PricingSetting card method CHECK', () => {
  const prisma = new PrismaClient();
  let productId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const group = await prisma.productGroup.findUnique({ where: { code: 'PERVAZ' } });
    const product = group
      ? await prisma.product.findUnique({
          where: {
            productGroupId_code: { productGroupId: group.id, code: 'AYARLI_PERVAZ' },
          },
        })
      : null;
    if (!product) {
      throw new Error('CHECK testi için AYARLI_PERVAZ gerekir.');
    }
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('cardMarkupRate ve cardFixedSurchargeAmount aynı anda dolu olamaz', async () => {
    await expect(
      prisma.pricingSetting.create({
        data: {
          productId,
          productGroupId: null,
          vatRate: null,
          profitRate: new Decimal('15'),
          cardMarkupRate: new Decimal('20'),
          cardFixedSurchargeAmount: new Decimal('2'),
          isActive: false,
        },
      }),
    ).rejects.toThrow();
  });
});
