import { PrismaClient } from '@prisma/client';

const PRODUCT_GROUP = {
  code: 'PERVAZ',
  name: 'Pervaz',
} as const;

/**
 * Pervaz ürün master'ı.
 * Ham madde / kalınlık ürüne bağlanmaz: aynı kalınlıkta Ayarlı ve Dekoratif
 * farklı tabaka kullanabilir; reçete ileride ölçü bazında seçilecek.
 * Calculator, NET, ek maliyet ve fiyatlandırma bu seed'de yoktur.
 */
export const PERVAZ_PRODUCT_SEEDS = [
  { code: 'AYARLI_PERVAZ', name: 'Ayarlı Pervaz' },
  { code: 'DEKORATIF_PERVAZ', name: 'Dekoratif Pervaz' },
  { code: 'DEKORATIF_PERVAZ_GENIS_KILCIK', name: 'Dekoratif Pervaz - Geniş Kılçık' },
] as const;

export type PervazProductSeedReport = {
  productGroupCreated: boolean;
  productsCreated: number;
  productsSkippedExisting: number;
};

export async function seedPervazProducts(
  prisma: PrismaClient,
): Promise<PervazProductSeedReport> {
  let productGroupCreated = false;
  let productsCreated = 0;
  let productsSkippedExisting = 0;

  let group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP.code },
  });

  if (!group) {
    group = await prisma.productGroup.create({
      data: {
        code: PRODUCT_GROUP.code,
        name: PRODUCT_GROUP.name,
        isActive: true,
      },
    });
    productGroupCreated = true;
  }

  for (const seed of PERVAZ_PRODUCT_SEEDS) {
    const existing = await prisma.product.findUnique({
      where: {
        productGroupId_code: {
          productGroupId: group.id,
          code: seed.code,
        },
      },
    });

    if (existing) {
      productsSkippedExisting += 1;
      continue;
    }

    await prisma.product.create({
      data: {
        productGroupId: group.id,
        code: seed.code,
        name: seed.name,
        isActive: true,
      },
    });
    productsCreated += 1;
  }

  return {
    productGroupCreated,
    productsCreated,
    productsSkippedExisting,
  };
}
