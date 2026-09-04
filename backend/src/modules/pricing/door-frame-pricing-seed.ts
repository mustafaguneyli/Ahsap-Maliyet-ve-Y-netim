import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { assertPricingSetting } from './pricing-setting.validation';

const PRODUCT_GROUP_CODE = 'door_frame';

/**
 * Excel Kapı Kasası KDV / kâr / kart farkı (yüzde değeri, örn. %20 = 20).
 * Product-level. Seed:
 * - hiç kayıt yoksa tam oluşturur
 * - aktif kayıtta cardMarkupRate null ise mevcut vat/profit korunarak 20 ile yeni sürüm açar
 * - cardMarkupRate doluysa dokunmaz (kullanıcı değerini geri almaz)
 */
export const DOOR_FRAME_PRICING_SEEDS = [
  { productCode: '34_MM', vatRate: '0', profitRate: '20', cardMarkupRate: '20' },
  { productCode: '30_MM', vatRate: '10', profitRate: '20', cardMarkupRate: '20' },
] as const;

export type DoorFramePricingSeedReport = {
  created: number;
  cardMarkupBackfilled: number;
  skippedExisting: number;
  missingProducts: string[];
};

export async function seedDoorFramePricingSettings(
  prisma: PrismaClient,
): Promise<DoorFramePricingSeedReport> {
  let created = 0;
  let cardMarkupBackfilled = 0;
  let skippedExisting = 0;
  const missingProducts: string[] = [];

  const group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP_CODE },
  });

  if (!group) {
    return {
      created: 0,
      cardMarkupBackfilled: 0,
      skippedExisting: 0,
      missingProducts: DOOR_FRAME_PRICING_SEEDS.map((s) => s.productCode),
    };
  }

  for (const seed of DOOR_FRAME_PRICING_SEEDS) {
    const product = await prisma.product.findUnique({
      where: {
        productGroupId_code: {
          productGroupId: group.id,
          code: seed.productCode,
        },
      },
    });

    if (!product) {
      missingProducts.push(seed.productCode);
      continue;
    }

    const active = await prisma.pricingSetting.findFirst({
      where: {
        productId: product.id,
        productGroupId: null,
        isActive: true,
      },
    });

    if (!active) {
      const anyCount = await prisma.pricingSetting.count({
        where: { productId: product.id },
      });
      if (anyCount > 0) {
        // Geçmiş var ama aktif yok — kullanıcı pasifleştirmiş olabilir; seed zorla yazmaz.
        skippedExisting += 1;
        continue;
      }

      assertPricingSetting({
        productGroupId: null,
        productId: product.id,
        vatRate: seed.vatRate,
        profitRate: seed.profitRate,
        cardMarkupRate: seed.cardMarkupRate,
        productIsActive: product.isActive,
      });

      await prisma.pricingSetting.create({
        data: {
          productGroupId: null,
          productId: product.id,
          vatRate: new Decimal(seed.vatRate),
          profitRate: new Decimal(seed.profitRate),
          cardMarkupRate: new Decimal(seed.cardMarkupRate),
          isActive: true,
        },
      });
      created += 1;
      continue;
    }

    if (active.cardMarkupRate != null) {
      skippedExisting += 1;
      continue;
    }

    // cardMarkupRate null: kullanıcı vat/profit'ini koruyarak 20 ile yeni sürüm aç.
    const vatRate = active.vatRate?.toString() ?? seed.vatRate;
    const profitRate = active.profitRate?.toString() ?? seed.profitRate;

    assertPricingSetting({
      productGroupId: null,
      productId: product.id,
      vatRate,
      profitRate,
      cardMarkupRate: seed.cardMarkupRate,
      productIsActive: product.isActive,
    });

    await prisma.pricingSetting.update({
      where: { id: active.id },
      data: { isActive: false },
    });

    await prisma.pricingSetting.create({
      data: {
        productGroupId: null,
        productId: product.id,
        vatRate: new Decimal(vatRate),
        profitRate: new Decimal(profitRate),
        cardMarkupRate: new Decimal(seed.cardMarkupRate),
        isActive: true,
      },
    });
    cardMarkupBackfilled += 1;
  }

  return { created, cardMarkupBackfilled, skippedExisting, missingProducts };
}
