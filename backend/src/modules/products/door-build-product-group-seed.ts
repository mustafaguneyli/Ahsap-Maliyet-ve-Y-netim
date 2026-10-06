import type { PrismaClient } from '@prisma/client';

export const DOOR_BUILD_PRODUCT_GROUP_CODE = 'KAPI_IMALATI' as const;
export const DOOR_BUILD_PRODUCT_GROUP_NAME = 'Kapı İmalatı';

export type DoorBuildProductGroupSeedReport = {
  created: boolean;
  unchanged: boolean;
  groupId: string | null;
};

/**
 * Yalnız ProductGroup kimliği. Oran uydurmaz; PricingSetting oluşturmaz.
 * Idempotent: mevcut aktif grubu değiştirmez.
 */
export async function seedDoorBuildProductGroup(
  prisma: PrismaClient,
): Promise<DoorBuildProductGroupSeedReport> {
  const existing = await prisma.productGroup.findUnique({
    where: { code: DOOR_BUILD_PRODUCT_GROUP_CODE },
  });
  if (existing) {
    return {
      created: false,
      unchanged: true,
      groupId: existing.id,
    };
  }
  const created = await prisma.productGroup.create({
    data: {
      code: DOOR_BUILD_PRODUCT_GROUP_CODE,
      name: DOOR_BUILD_PRODUCT_GROUP_NAME,
      calculatorType: 'DOOR_BUILD',
      isActive: true,
    },
  });
  return {
    created: true,
    unchanged: false,
    groupId: created.id,
  };
}
