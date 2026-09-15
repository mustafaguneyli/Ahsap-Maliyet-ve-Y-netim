import { AuditAction, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';
import { assertPricingSetting } from './pricing-setting.validation';

const PRODUCT_GROUP_CODE = 'SUPURGELIK';

/**
 * Korunmuş Excel AC sayfası, satır 104-108:
 * productionCost + (productionCost * %20) -> ROUNDUP(..., 0).
 * KDV, kart farkı ve ROUNDUP sonrası normal ürün adjustment kaynağı yoktur.
 */
export const SUPURGELIK_PRICING_SEED = {
  vatRate: null,
  profitRate: '20',
  cardMarkupRate: null,
  cardFixedSurchargeAmount: null,
} as const;

export type SupurgelikPricingSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    field: string;
    sourceValue: string;
    existingValue: string;
  }>;
  duplicateActive: boolean;
  inactiveHistoryPreserved: boolean;
  missingProductGroup: boolean;
};

function label(value: { toString(): string } | null | undefined): string {
  return value == null ? 'null' : value.toString();
}

function sameDecimal(
  existing: { toString(): string } | null | undefined,
  expected: string | null,
): boolean {
  if (expected == null) return existing == null;
  if (existing == null) return false;
  return toDecimal(existing.toString()).equals(toDecimal(expected));
}

/**
 * Yalnız eksik SUPURGELIK group-scope PricingSetting kaydını oluşturur.
 * Aktif kullanıcı değerini veya inactive geçmişi değiştirmez. Yeni kayıt ile
 * audit olayı aynı transaction içinde yazılır.
 */
export async function seedSupurgelikPricingSetting(
  prisma: PrismaClient,
): Promise<SupurgelikPricingSeedReport> {
  return prisma.$transaction(async (tx) => {
    const report: SupurgelikPricingSeedReport = {
      created: 0,
      unchanged: 0,
      conflicts: [],
      duplicateActive: false,
      inactiveHistoryPreserved: false,
      missingProductGroup: false,
    };

    const group = await tx.productGroup.findUnique({
      where: { code: PRODUCT_GROUP_CODE },
    });
    if (!group?.isActive) {
      report.missingProductGroup = true;
      return report;
    }

    const active = await tx.pricingSetting.findMany({
      where: {
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });
    if (active.length > 1) {
      report.duplicateActive = true;
      return report;
    }

    if (active.length === 1) {
      const current = active[0];
      const fields = [
        ['vatRate', SUPURGELIK_PRICING_SEED.vatRate, current.vatRate],
        ['profitRate', SUPURGELIK_PRICING_SEED.profitRate, current.profitRate],
        ['cardMarkupRate', SUPURGELIK_PRICING_SEED.cardMarkupRate, current.cardMarkupRate],
        [
          'cardFixedSurchargeAmount',
          SUPURGELIK_PRICING_SEED.cardFixedSurchargeAmount,
          current.cardFixedSurchargeAmount,
        ],
      ] as const;

      for (const [field, sourceValue, existingValue] of fields) {
        if (!sameDecimal(existingValue, sourceValue)) {
          report.conflicts.push({
            field,
            sourceValue: sourceValue ?? 'null',
            existingValue: label(existingValue),
          });
        }
      }
      if (report.conflicts.length === 0) report.unchanged = 1;
      return report;
    }

    const historyCount = await tx.pricingSetting.count({
      where: {
        productGroupId: group.id,
        productId: null,
      },
    });
    if (historyCount > 0) {
      report.inactiveHistoryPreserved = true;
      return report;
    }

    assertPricingSetting({
      productGroupId: group.id,
      productId: null,
      vatRate: null,
      profitRate: SUPURGELIK_PRICING_SEED.profitRate,
      cardMarkupRate: null,
      cardFixedSurchargeAmount: null,
      productGroupIsActive: group.isActive,
    });

    const created = await tx.pricingSetting.create({
      data: {
        productGroupId: group.id,
        productId: null,
        vatRate: null,
        profitRate: new Decimal(SUPURGELIK_PRICING_SEED.profitRate),
        cardMarkupRate: null,
        cardFixedSurchargeAmount: null,
        isActive: true,
      },
    });
    await tx.auditEvent.create({
      data: {
        entityType: 'PricingSetting',
        entityId: created.id,
        action: AuditAction.CREATE,
        fieldName: 'profitRate',
        oldValue: null,
        newValue: toDecimal(SUPURGELIK_PRICING_SEED.profitRate).toFixed(4),
        reason: 'Excel normal Süpürgelik grup kâr oranı seed',
        actor: 'local-admin',
      },
    });
    report.created = 1;
    return report;
  });
}
