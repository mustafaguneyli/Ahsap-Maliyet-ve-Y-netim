import { PrismaClient } from '@prisma/client';

const PRODUCT_GROUP = {
  code: 'door_frame',
  name: 'Kapı Kasası',
} as const;

/**
 * Kapı Kasası ürün master'ı.
 * code değerleri maliyet hesabı variant parametresi ile aynıdır: 34_MM / 30_MM.
 */
export const DOOR_FRAME_PRODUCT_SEEDS = [
  { code: '34_MM', name: '34 MM MDF Kasa' },
  { code: '30_MM', name: '30 MM MDF Kasa' },
] as const;

export type DoorFrameProductSeedReport = {
  productGroupCreated: boolean;
  productsCreated: number;
  productsSkippedExisting: number;
};

export async function seedDoorFrameProducts(
  prisma: PrismaClient,
): Promise<DoorFrameProductSeedReport> {
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

  for (const seed of DOOR_FRAME_PRODUCT_SEEDS) {
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
