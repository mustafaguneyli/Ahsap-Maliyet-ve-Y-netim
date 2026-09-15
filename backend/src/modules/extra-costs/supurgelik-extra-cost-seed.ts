import { AuditAction, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';

const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');
const PRODUCT_GROUP_CODE = 'SUPURGELIK';

/**
 * Korunmuş Excel AC sayfası:
 * K9:L12 "SÜPÜRGELİK MASRAF MALİYETLERİ"
 * - K10:L10 KESİM = 4
 * - K11:L11 İŞÇİLİK = 12
 * - K12:L12 TOPLAM = SUM(L10:L11) = 16
 *
 * TOPLAM ayrı bir ExtraCostValue değildir. Süpürgelik için açık bir TUTKAL
 * veya DİĞER değeri bulunmadığından bu iki tip seed edilmez.
 */
export const SUPURGELIK_EXTRA_COST_SEEDS = [
  { code: 'CUTTING', amount: '4' },
  { code: 'LABOR', amount: '12' },
] as const;

export const SUPURGELIK_EXTRA_COST_TYPE_ORDER = ['CUTTING', 'LABOR'] as const;

/** Ortak üretim gideri değildir; PP varyantlarına özel ExtraCostType. */
export const SUPURGELIK_PP_WRAPPING_TYPE_CODE = 'PP_WRAPPING' as const;
export const SUPURGELIK_PP_WRAPPING_TYPE_NAME = 'PP Sarma';

export const SUPURGELIK_UPDATABLE_EXTRA_COST_TYPE_ORDER = [
  ...SUPURGELIK_EXTRA_COST_TYPE_ORDER,
  SUPURGELIK_PP_WRAPPING_TYPE_CODE,
] as const;

export type SupurgelikExtraCostSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    typeCode: string;
    sourceAmount: string;
    existingAmount: string;
  }>;
  duplicateActiveTypes: string[];
  missingProductGroup: boolean;
  missingTypes: string[];
  totalExpected: number;
};

/**
 * Yalnız eksik SUPURGELIK group-scope değerlerini oluşturur.
 * Mevcut aktif kullanıcı değerini kapatmaz/değiştirmez; farklıysa conflict raporlar.
 * Yeni değer ve audit olayı aynı transaction içinde yazılır.
 */
export async function seedSupurgelikExtraCosts(
  prisma: PrismaClient,
): Promise<SupurgelikExtraCostSeedReport> {
  return prisma.$transaction(async (tx) => {
    const report: SupurgelikExtraCostSeedReport = {
      created: 0,
      unchanged: 0,
      conflicts: [],
      duplicateActiveTypes: [],
      missingProductGroup: false,
      missingTypes: [],
      totalExpected: SUPURGELIK_EXTRA_COST_SEEDS.length,
    };

    const group = await tx.productGroup.findUnique({
      where: { code: PRODUCT_GROUP_CODE },
    });
    if (!group || !group.isActive) {
      report.missingProductGroup = true;
      return report;
    }

    for (const seed of SUPURGELIK_EXTRA_COST_SEEDS) {
      const type = await tx.extraCostType.findUnique({
        where: { code: seed.code },
      });
      if (!type || !type.isActive) {
        report.missingTypes.push(seed.code);
        continue;
      }

      const activeOpen = await tx.extraCostValue.findMany({
        where: {
          extraCostTypeId: type.id,
          productGroupId: group.id,
          productId: null,
          isActive: true,
          effectiveTo: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (activeOpen.length > 1) {
        report.duplicateActiveTypes.push(seed.code);
        continue;
      }

      const active = activeOpen[0];
      if (active) {
        if (toDecimal(active.amount.toString()).equals(toDecimal(seed.amount))) {
          report.unchanged += 1;
        } else {
          report.conflicts.push({
            typeCode: seed.code,
            sourceAmount: seed.amount,
            existingAmount: active.amount.toString(),
          });
        }
        continue;
      }

      const created = await tx.extraCostValue.create({
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

      await tx.auditEvent.create({
        data: {
          entityType: 'ExtraCostValue',
          entityId: created.id,
          action: AuditAction.CREATE,
          fieldName: 'amount',
          oldValue: null,
          newValue: toDecimal(seed.amount).toFixed(4),
          reason: `Excel Süpürgelik ortak üretim gideri seed (${seed.code})`,
          actor: 'local-admin',
        },
      });
      report.created += 1;
    }

    return report;
  });
}

/**
 * Yalnız ExtraCostType kataloğunu oluşturur. ExtraCostValue / tutar yazmaz.
 */
export async function seedSupurgelikPpWrappingType(
  prisma: PrismaClient,
): Promise<{ created: boolean }> {
  const existing = await prisma.extraCostType.findUnique({
    where: { code: SUPURGELIK_PP_WRAPPING_TYPE_CODE },
  });
  if (existing) {
    return { created: false };
  }

  await prisma.extraCostType.create({
    data: {
      code: SUPURGELIK_PP_WRAPPING_TYPE_CODE,
      name: SUPURGELIK_PP_WRAPPING_TYPE_NAME,
      isActive: true,
    },
  });
  return { created: true };
}
