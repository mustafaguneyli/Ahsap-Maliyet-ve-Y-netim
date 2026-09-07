import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';

const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');
const PRODUCT_GROUP_CODE = 'PERVAZ';

/**
 * Excel PERVAZ MASRAF MALİYETLERİ (L4:L6). Product group kapsamı.
 * TOTAL kaydı yok; 4+4+4 runtime toplanır. N4:N7 ve T78 seed edilmez.
 * ExtraCostType reuse: CUTTING / GLUE / LABOR (OTHER yok).
 */
export const PERVAZ_EXTRA_COST_SEEDS = [
  { code: 'CUTTING', amount: '4' },
  { code: 'GLUE', amount: '4' },
  { code: 'LABOR', amount: '4' },
] as const;

export const PERVAZ_EXTRA_COST_TYPE_ORDER = ['CUTTING', 'GLUE', 'LABOR'] as const;

export type PervazExtraCostSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    typeCode: string;
    excelAmount: string;
    existingAmount: string;
  }>;
  missingProductGroup: boolean;
  missingTypes: string[];
  totalExpected: number;
};

export async function seedPervazExtraCosts(
  prisma: PrismaClient,
): Promise<PervazExtraCostSeedReport> {
  const report: PervazExtraCostSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    missingProductGroup: false,
    missingTypes: [],
    totalExpected: PERVAZ_EXTRA_COST_SEEDS.length,
  };

  const group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP_CODE },
  });
  if (!group || !group.isActive) {
    report.missingProductGroup = true;
    return report;
  }

  for (const seed of PERVAZ_EXTRA_COST_SEEDS) {
    const type = await prisma.extraCostType.findUnique({
      where: { code: seed.code },
    });
    if (!type || !type.isActive) {
      report.missingTypes.push(seed.code);
      continue;
    }

    const active = await prisma.extraCostValue.findFirst({
      where: {
        extraCostTypeId: type.id,
        productGroupId: group.id,
        productId: null,
        isActive: true,
      },
    });

    if (active) {
      const sameAmount = toDecimal(active.amount.toString()).equals(toDecimal(seed.amount));
      if (sameAmount) {
        report.unchanged += 1;
      } else {
        report.conflicts.push({
          typeCode: seed.code,
          excelAmount: seed.amount,
          existingAmount: active.amount.toString(),
        });
      }
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
    report.created += 1;
  }

  return report;
}
