import { PrismaClient } from '@prisma/client';
import { getDoorFrameSizes } from '../../calculation-engine/calculators/door-frame-variants';

function uniqueDoorFrameSizes(): Array<{ widthMm: number; lengthMm: number; displayName: string }> {
  const map = new Map<string, { widthMm: number; lengthMm: number; displayName: string }>();
  for (const variant of ['34_MM', '30_MM'] as const) {
    for (const size of getDoorFrameSizes(variant)) {
      const widthMm = size.widthCm * 10;
      const lengthMm = size.lengthCm * 10;
      const key = `${widthMm}x${lengthMm}`;
      if (!map.has(key)) {
        map.set(key, {
          widthMm,
          lengthMm,
          displayName: `${size.widthCm}×${size.lengthCm}`,
        });
      }
    }
  }
  return [...map.values()];
}

export type DoorFrameProductSizeSeedReport = {
  created: number;
  skippedExisting: number;
};

/**
 * Kapı Kasası ölçü master'ı (ProductSize). EN×BOY MM.
 * Idempotent: unique(widthMm, lengthMm) varsa dokunmaz.
 */
export async function seedDoorFrameProductSizes(
  prisma: PrismaClient,
): Promise<DoorFrameProductSizeSeedReport> {
  let created = 0;
  let skippedExisting = 0;

  for (const size of uniqueDoorFrameSizes()) {
    const existing = await prisma.productSize.findUnique({
      where: {
        widthMm_lengthMm: {
          widthMm: size.widthMm,
          lengthMm: size.lengthMm,
        },
      },
    });
    if (existing) {
      skippedExisting += 1;
      continue;
    }
    await prisma.productSize.create({
      data: {
        widthMm: size.widthMm,
        lengthMm: size.lengthMm,
        displayName: size.displayName,
      },
    });
    created += 1;
  }

  return { created, skippedExisting };
}
