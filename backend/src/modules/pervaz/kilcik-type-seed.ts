import { PrismaClient } from '@prisma/client';
import { KILCIK_TYPE_SPECS } from './kilcik-type.rules';

export type KilcikTypeSeedReport = {
  created: number;
  skippedExisting: number;
};

/**
 * STANDARD / WIDE kılçık tipi master. NET seed etmez; mevcut kaydı güncellemez.
 */
export async function seedKilcikTypes(prisma: PrismaClient): Promise<KilcikTypeSeedReport> {
  let created = 0;
  let skippedExisting = 0;

  for (const spec of Object.values(KILCIK_TYPE_SPECS)) {
    const existing = await prisma.kilcikType.findUnique({
      where: { code: spec.code },
    });
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    await prisma.kilcikType.create({
      data: {
        code: spec.code,
        name: spec.name,
        nominalWidthMm: spec.nominalWidthMm,
        bladeAllowanceMm: spec.bladeAllowanceMm,
        cutPitchMm: spec.cutPitchMm,
        isActive: true,
      },
    });
    created += 1;
  }

  return { created, skippedExisting };
}
