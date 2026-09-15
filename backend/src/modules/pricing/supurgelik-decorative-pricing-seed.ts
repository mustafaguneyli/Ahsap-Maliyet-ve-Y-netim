import { PricingModifierType, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../common/decimal/decimal.util';
import { assertPricingThicknessModifier } from './pricing-thickness-modifier.validation';

const PRODUCT_GROUP_CODE = 'SUPURGELIK';
const DECORATIVE_PRODUCT_CODE = 'DEKORATIF_SUPURGELIK';
const EFFECTIVE_FROM = new Date('2026-03-01T00:00:00.000Z');

/** Doğrulanmış Excel dekoratif oranları; 16 mm standart matriste olmadığı için yoktur. */
export const SUPURGELIK_DECORATIVE_RATE_SEEDS = [
  { thicknessMm: 12, rate: '25' },
  { thicknessMm: 14, rate: '25' },
  { thicknessMm: 18, rate: '45' },
] as const;

export type SupurgelikDecorativePricingSeedReport = {
  created: number;
  unchanged: number;
  conflicts: Array<{
    thicknessMm: number;
    existingRate: string;
    seedRate: string;
  }>;
  duplicateActiveThicknesses: number[];
  missingProductGroup: boolean;
  missingDecorativeProduct: boolean;
  inactiveHistoryPreserved: boolean;
  totalExpected: number;
};

export async function seedSupurgelikDecorativePricingRates(
  prisma: PrismaClient,
): Promise<SupurgelikDecorativePricingSeedReport> {
  const report: SupurgelikDecorativePricingSeedReport = {
    created: 0,
    unchanged: 0,
    conflicts: [],
    duplicateActiveThicknesses: [],
    missingProductGroup: false,
    missingDecorativeProduct: false,
    inactiveHistoryPreserved: true,
    totalExpected: SUPURGELIK_DECORATIVE_RATE_SEEDS.length,
  };

  const group = await prisma.productGroup.findUnique({
    where: { code: PRODUCT_GROUP_CODE },
  });
  if (!group?.isActive) {
    report.missingProductGroup = true;
    return report;
  }

  const product = await prisma.product.findUnique({
    where: {
      productGroupId_code: {
        productGroupId: group.id,
        code: DECORATIVE_PRODUCT_CODE,
      },
    },
  });
  if (!product?.isActive) {
    report.missingDecorativeProduct = true;
    return report;
  }

  const inactiveBefore = await prisma.pricingThicknessModifier.count({
    where: {
      productGroupId: group.id,
      modifierType: PricingModifierType.DECORATIVE,
      isActive: false,
    },
  });
  const activeRows = await prisma.pricingThicknessModifier.findMany({
    where: {
      productGroupId: group.id,
      modifierType: PricingModifierType.DECORATIVE,
      isActive: true,
      effectiveTo: null,
    },
  });

  for (const seed of SUPURGELIK_DECORATIVE_RATE_SEEDS) {
    const matching = activeRows.filter(
      (row) => row.thicknessMm === seed.thicknessMm,
    );
    if (matching.length > 1) {
      report.duplicateActiveThicknesses.push(seed.thicknessMm);
      continue;
    }
    const active = matching[0];
    if (active) {
      if (toDecimal(active.rate.toString()).equals(seed.rate)) {
        report.unchanged += 1;
      } else {
        report.conflicts.push({
          thicknessMm: seed.thicknessMm,
          existingRate: active.rate.toString(),
          seedRate: seed.rate,
        });
      }
      continue;
    }

    assertPricingThicknessModifier({
      productGroupId: group.id,
      modifierType: PricingModifierType.DECORATIVE,
      thicknessMm: seed.thicknessMm,
      rate: seed.rate,
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      productGroupIsActive: group.isActive,
    });

    await prisma.$transaction(async (tx) => {
      const created = await tx.pricingThicknessModifier.create({
        data: {
          productGroupId: group.id,
          modifierType: PricingModifierType.DECORATIVE,
          thicknessMm: seed.thicknessMm,
          rate: new Decimal(seed.rate),
          isActive: true,
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: 'PricingThicknessModifier',
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'rate',
          oldValue: null,
          newValue: toDecimal(seed.rate).toFixed(4),
          reason: `Süpürgelik dekoratif oranı Excel kaynağı (${seed.thicknessMm} mm)`,
          actor: 'local-admin',
        },
      });
    });
    report.created += 1;
  }

  const inactiveAfter = await prisma.pricingThicknessModifier.count({
    where: {
      productGroupId: group.id,
      modifierType: PricingModifierType.DECORATIVE,
      isActive: false,
    },
  });
  report.inactiveHistoryPreserved = inactiveAfter === inactiveBefore;
  return report;
}
