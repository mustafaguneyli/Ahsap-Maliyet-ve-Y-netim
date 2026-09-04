import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');

const PRODUCT_GROUP = {
  code: 'door_frame',
  name: 'Kapı Kasası',
} as const;

/**
 * Excel Kapı Kasası ek maliyetleri (product group seviyesi).
 * Seed yalnızca hiç değer yoksa yazar; mevcut/geçmiş kayıtları ve kullanıcı
 * güncellemelerini eski değere döndürmez.
 */
export const DOOR_FRAME_EXTRA_COST_SEEDS = [
  { code: 'CUTTING', name: 'Kesim', amount: '8' },
  { code: 'GLUE', name: 'Tutkal', amount: '3.5' },
  { code: 'LABOR', name: 'İşçilik', amount: '17' },
  { code: 'OTHER', name: 'Diğer', amount: '5' },
] as const;

export type ExtraCostSeedReport = {
  productGroupCreated: boolean;
  typesCreated: number;
  valuesCreated: number;
  valuesSkippedExisting: number;
};

export async function seedDoorFrameExtraCosts(
  prisma: PrismaClient,
): Promise<ExtraCostSeedReport> {
  let productGroupCreated = false;
  let typesCreated = 0;
  let valuesCreated = 0;
  let valuesSkippedExisting = 0;

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

  for (const seed of DOOR_FRAME_EXTRA_COST_SEEDS) {
    let type = await prisma.extraCostType.findUnique({
      where: { code: seed.code },
    });

    if (!type) {
      type = await prisma.extraCostType.create({
        data: {
          code: seed.code,
          name: seed.name,
          isActive: true,
        },
      });
      typesCreated += 1;
    }

    const existingCount = await prisma.extraCostValue.count({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        productId: null,
      },
    });

    if (existingCount > 0) {
      valuesSkippedExisting += 1;
      continue;
    }

    await prisma.extraCostValue.create({
      data: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        productId: null,
        amount: new Decimal(seed.amount),
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: null,
        isActive: true,
      },
    });
    valuesCreated += 1;
  }

  return {
    productGroupCreated,
    typesCreated,
    valuesCreated,
    valuesSkippedExisting,
  };
}
