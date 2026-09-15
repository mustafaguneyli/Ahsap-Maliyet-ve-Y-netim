import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const SUPURGELIK_9MM_RAW_MATERIAL_SEED = {
  code: 'MDF-9-2100X2800-ZIMPARALI',
  name: '09 MM MDF 210×280 Zımparalı',
  thicknessMm: '9',
  sheetWidthMm: 2100,
  sheetLengthMm: 2800,
  surfaceType: 'Zımparalı',
  supplierName: 'DEMPAŞ',
  isActive: true,
} as const;

export type SupurgelikRawMaterialSeedConflict = {
  code: string;
  reason: 'PHYSICAL_PROPERTIES_MISMATCH' | 'INACTIVE_EXISTING';
};

export type SupurgelikRawMaterialSeedReport = {
  created: number;
  reused: number;
  conflicts: SupurgelikRawMaterialSeedConflict[];
};

/**
 * Süpürgelik için doğrulanmış 9 mm / 2100×2800 fiziksel MDF masterını oluşturur.
 *
 * Fiyat bu seed'in kapsamı değildir: RawMaterialPrice okunmaz veya yazılmaz.
 * Aynı kodla bulunan kullanıcı kaydı güncellenmez. Fiziksel özellikler farklıysa
 * ya da kayıt pasifse conflict raporlanır.
 */
export async function seedSupurgelik9MmRawMaterial(
  prisma: PrismaClient,
): Promise<SupurgelikRawMaterialSeedReport> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.rawMaterial.findUnique({
      where: { code: SUPURGELIK_9MM_RAW_MATERIAL_SEED.code },
    });

    if (existing) {
      const samePhysicalProperties =
        existing.thicknessMm.toString() ===
          SUPURGELIK_9MM_RAW_MATERIAL_SEED.thicknessMm &&
        existing.sheetWidthMm === SUPURGELIK_9MM_RAW_MATERIAL_SEED.sheetWidthMm &&
        existing.sheetLengthMm === SUPURGELIK_9MM_RAW_MATERIAL_SEED.sheetLengthMm &&
        existing.surfaceType === SUPURGELIK_9MM_RAW_MATERIAL_SEED.surfaceType;

      if (!samePhysicalProperties) {
        return {
          created: 0,
          reused: 0,
          conflicts: [
            {
              code: SUPURGELIK_9MM_RAW_MATERIAL_SEED.code,
              reason: 'PHYSICAL_PROPERTIES_MISMATCH',
            },
          ],
        };
      }

      if (!existing.isActive) {
        return {
          created: 0,
          reused: 0,
          conflicts: [
            {
              code: SUPURGELIK_9MM_RAW_MATERIAL_SEED.code,
              reason: 'INACTIVE_EXISTING',
            },
          ],
        };
      }

      return { created: 0, reused: 1, conflicts: [] };
    }

    const created = await tx.rawMaterial.create({
      data: {
        ...SUPURGELIK_9MM_RAW_MATERIAL_SEED,
        thicknessMm: new Decimal(SUPURGELIK_9MM_RAW_MATERIAL_SEED.thicknessMm),
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: 'RawMaterial',
        entityId: created.id,
        action: 'CREATE',
        fieldName: null,
        oldValue: null,
        newValue: JSON.stringify({
          code: created.code,
          name: created.name,
          thicknessMm: created.thicknessMm.toString(),
          sheetWidthMm: created.sheetWidthMm,
          sheetLengthMm: created.sheetLengthMm,
          surfaceType: created.surfaceType,
          supplierName: created.supplierName,
          isActive: created.isActive,
        }),
        reason: 'Süpürgelik için kullanıcı tarafından doğrulanan fiziksel MDF masterı',
        actor: 'local-admin',
      },
    });

    return { created: 1, reused: 0, conflicts: [] };
  });
}
