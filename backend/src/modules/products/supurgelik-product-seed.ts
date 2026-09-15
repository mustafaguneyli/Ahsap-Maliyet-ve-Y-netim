import { PrismaClient } from '@prisma/client';

export const SUPURGELIK_PRODUCT_GROUP_SEED = {
  code: 'SUPURGELIK',
  name: 'Süpürgelik',
} as const;

/**
 * Dört ürün, ileride tek bir temel Süpürgelik calculator'ının kullanacağı iki
 * bağımsız varyasyonu temsil eder. Bu metadata yalnız ürün kodlarının kapsamını
 * açık tutar; bu seed hesap, NET, fiyat veya maliyet kaydı oluşturmaz.
 */
export const SUPURGELIK_PRODUCT_SEEDS = [
  {
    code: 'DUZ_SUPURGELIK',
    name: 'Düz Süpürgelik',
    surfaceType: 'DUZ',
    ppSarma: false,
  },
  {
    code: 'DEKORATIF_SUPURGELIK',
    name: 'Dekoratif Süpürgelik',
    surfaceType: 'DEKORATIF',
    ppSarma: false,
  },
  {
    code: 'DUZ_PP_SARMA_SUPURGELIK',
    name: 'Düz PP Sarma Süpürgelik',
    surfaceType: 'DUZ',
    ppSarma: true,
  },
  {
    code: 'DEKORATIF_PP_SARMA_SUPURGELIK',
    name: 'Dekoratif PP Sarma Süpürgelik',
    surfaceType: 'DEKORATIF',
    ppSarma: true,
  },
] as const;

/** Canonical ölçü MM; kalınlık ProductSize kapsamına girmez. */
export const SUPURGELIK_PRODUCT_SIZE_SEEDS = [
  { widthMm: 80, lengthMm: 2800, displayName: '8×280' },
  { widthMm: 90, lengthMm: 2800, displayName: '9×280' },
  { widthMm: 100, lengthMm: 2800, displayName: '10×280' },
  { widthMm: 120, lengthMm: 2800, displayName: '12×280' },
  { widthMm: 150, lengthMm: 2800, displayName: '15×280' },
] as const;

export type SupurgelikProductMasterSeedReport = {
  productGroupCreated: boolean;
  productsCreated: number;
  productsSkippedExisting: number;
  sizesCreated: number;
  sizesSkippedExisting: number;
};

/**
 * Süpürgelik ürün ve ölçü master'ı.
 * Idempotent: mevcut kayıtları güncellemez; kullanıcı değişikliklerini korur.
 */
export async function seedSupurgelikProductMaster(
  prisma: PrismaClient,
): Promise<SupurgelikProductMasterSeedReport> {
  let productGroupCreated = false;
  let productsCreated = 0;
  let productsSkippedExisting = 0;
  let sizesCreated = 0;
  let sizesSkippedExisting = 0;

  let group = await prisma.productGroup.findUnique({
    where: { code: SUPURGELIK_PRODUCT_GROUP_SEED.code },
  });

  if (!group) {
    group = await prisma.productGroup.create({
      data: {
        code: SUPURGELIK_PRODUCT_GROUP_SEED.code,
        name: SUPURGELIK_PRODUCT_GROUP_SEED.name,
        isActive: true,
      },
    });
    productGroupCreated = true;
  }

  for (const seed of SUPURGELIK_PRODUCT_SEEDS) {
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

  for (const size of SUPURGELIK_PRODUCT_SIZE_SEEDS) {
    const existing = await prisma.productSize.findUnique({
      where: {
        widthMm_lengthMm: {
          widthMm: size.widthMm,
          lengthMm: size.lengthMm,
        },
      },
    });

    if (existing) {
      sizesSkippedExisting += 1;
      continue;
    }

    await prisma.productSize.create({ data: size });
    sizesCreated += 1;
  }

  return {
    productGroupCreated,
    productsCreated,
    productsSkippedExisting,
    sizesCreated,
    sizesSkippedExisting,
  };
}
