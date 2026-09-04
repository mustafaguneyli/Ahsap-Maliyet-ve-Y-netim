import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const PRODUCT_GROUP_CODE = 'door_frame';
const PRODUCT_CODE = '34_MM';

/**
 * 2026-4 basılı fiyat listesi — yalnızca hesaplanan nakitten sapma olan ölçüler.
 * 12/16/22/24×210 eklenmez (hesaplanan = basılı).
 */
export const DOOR_FRAME_34MM_CASH_OVERRIDE_SEEDS = [
  { widthCm: 10, lengthCm: 210, cashPrice: '300', reason: '2026-4 basılı fiyat listesi' },
  { widthCm: 14, lengthCm: 210, cashPrice: '415', reason: '2026-4 basılı fiyat listesi' },
  { widthCm: 18, lengthCm: 210, cashPrice: '525', reason: '2026-4 basılı fiyat listesi' },
  { widthCm: 20, lengthCm: 210, cashPrice: '600', reason: '2026-4 basılı fiyat listesi' },
] as const;

export type DoorFramePriceOverrideSeedReport = {
  created: number;
  skippedExisting: number;
  missingProduct: boolean;
  missingSizes: string[];
};

/**
 * Idempotent: product+size için herhangi bir override (aktif veya geçmiş) varsa dokunmaz.
 * Kullanıcı değerini veya kaldırdığı override'ı seed geri yazmaz.
 */
export async function seedDoorFramePriceOverrides(
  prisma: PrismaClient,
): Promise<DoorFramePriceOverrideSeedReport> {
  const report: DoorFramePriceOverrideSeedReport = {
    created: 0,
    skippedExisting: 0,
    missingProduct: false,
    missingSizes: [],
  };

  const group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP_CODE },
  });
  if (!group) {
    report.missingProduct = true;
    return report;
  }

  const product = await prisma.product.findUnique({
    where: {
      productGroupId_code: {
        productGroupId: group.id,
        code: PRODUCT_CODE,
      },
    },
  });
  if (!product) {
    report.missingProduct = true;
    return report;
  }

  for (const seed of DOOR_FRAME_34MM_CASH_OVERRIDE_SEEDS) {
    const widthMm = seed.widthCm * 10;
    const lengthMm = seed.lengthCm * 10;
    const size = await prisma.productSize.findUnique({
      where: {
        widthMm_lengthMm: { widthMm, lengthMm },
      },
    });
    if (!size) {
      report.missingSizes.push(`${seed.widthCm}x${seed.lengthCm}`);
      continue;
    }

    const existingCount = await prisma.priceOverride.count({
      where: {
        productId: product.id,
        productSizeId: size.id,
      },
    });
    if (existingCount > 0) {
      report.skippedExisting += 1;
      continue;
    }

    await prisma.priceOverride.create({
      data: {
        productId: product.id,
        productSizeId: size.id,
        cashPrice: new Decimal(seed.cashPrice),
        reason: seed.reason,
        isActive: true,
      },
    });
    report.created += 1;
  }

  return report;
}
