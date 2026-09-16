import { PrismaClient } from '@prisma/client';

export const CITA_PRODUCT_GROUP_SEED = {
  code: 'CITA',
  name: 'Çıta',
} as const;

/**
 * Tek temel Çıta ürünü. 1–8 cm grupları veya kalınlıklar ayrı Product değildir.
 * Hesap ileride CITA + ölçü + RawMaterial thickness üzerinden yapılacak.
 */
export const CITA_PRODUCT_SEED = {
  code: 'CITA',
  name: 'Çıta',
} as const;

/** Canonical ölçü MM. Kalınlık ProductSize kapsamına girmez. */
export const CITA_PRODUCT_SIZE_SEEDS = [
  { widthMm: 10, lengthMm: 2800, displayName: '1×280' },
  { widthMm: 20, lengthMm: 2800, displayName: '2×280' },
  { widthMm: 30, lengthMm: 2800, displayName: '3×280' },
  { widthMm: 40, lengthMm: 2800, displayName: '4×280' },
  { widthMm: 50, lengthMm: 2800, displayName: '5×280' },
  { widthMm: 60, lengthMm: 2800, displayName: '6×280' },
  { widthMm: 70, lengthMm: 2800, displayName: '7×280' },
  { widthMm: 80, lengthMm: 2800, displayName: '8×280' },
] as const;

export type CitaProductMasterSeedReport = {
  productGroupCreated: boolean;
  productsCreated: number;
  productsSkippedExisting: number;
  sizesCreated: number;
  sizesSkippedExisting: number;
};

/**
 * Çıta ürün ve standart ölçü master'ı.
 * Idempotent: mevcut kayıtları güncellemez; kullanıcı değişikliklerini korur.
 * ProductionYield / ExtraCost / pricing oluşturmaz.
 */
export async function seedCitaProductMaster(
  prisma: PrismaClient,
): Promise<CitaProductMasterSeedReport> {
  let productGroupCreated = false;
  let productsCreated = 0;
  let productsSkippedExisting = 0;
  let sizesCreated = 0;
  let sizesSkippedExisting = 0;

  let group = await prisma.productGroup.findUnique({
    where: { code: CITA_PRODUCT_GROUP_SEED.code },
  });

  if (!group) {
    group = await prisma.productGroup.create({
      data: {
        code: CITA_PRODUCT_GROUP_SEED.code,
        name: CITA_PRODUCT_GROUP_SEED.name,
        isActive: true,
      },
    });
    productGroupCreated = true;
  }

  const existingProduct = await prisma.product.findUnique({
    where: {
      productGroupId_code: {
        productGroupId: group.id,
        code: CITA_PRODUCT_SEED.code,
      },
    },
  });

  if (existingProduct) {
    productsSkippedExisting += 1;
  } else {
    await prisma.product.create({
      data: {
        productGroupId: group.id,
        code: CITA_PRODUCT_SEED.code,
        name: CITA_PRODUCT_SEED.name,
        isActive: true,
      },
    });
    productsCreated += 1;
  }

  for (const size of CITA_PRODUCT_SIZE_SEEDS) {
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
