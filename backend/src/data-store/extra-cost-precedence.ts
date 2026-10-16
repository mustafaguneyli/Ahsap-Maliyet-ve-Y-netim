import { selectCurrentExtraCostValue } from '../modules/extra-costs/current-extra-cost-value';
import type { ExtraCostCalculationModeCode } from '../calculation-engine/calculators/generic-recipe-calculator';

export type ExtraCostPrecedenceRow = {
  id: string;
  extraCostTypeId: string;
  typeCode: string;
  typeName: string;
  typeIsActive: boolean;
  productGroupId: string | null;
  productId: string | null;
  amount: { toString(): string } | string;
  calculationMode: ExtraCostCalculationModeCode;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
};

export type ResolvedExtraCost = {
  typeCode: string;
  typeName: string;
  amount: string;
  calculationMode: ExtraCostCalculationModeCode;
  scope: 'GROUP' | 'PRODUCT';
};

/**
 * Product scope > Group scope. Aynı typeCode bir kez uygulanır (double-count yok).
 * Special calculator ExtraCost yüklemesine dokunmaz; generic recipe için.
 */
export function selectExtraCostsByPrecedence(
  rows: ExtraCostPrecedenceRow[],
  input: { productGroupId: string; productId?: string | null; now: Date },
): ResolvedExtraCost[] {
  const now = input.now;
  const relevant = rows.filter((row) => {
    if (!row.typeIsActive || !row.isActive) {
      return false;
    }
    const current = selectCurrentExtraCostValue([row], now);
    if (!current) {
      return false;
    }
    const groupMatch =
      row.productGroupId === input.productGroupId && row.productId == null;
    const productMatch =
      input.productId != null &&
      row.productId === input.productId &&
      row.productGroupId == null;
    return groupMatch || productMatch;
  });

  const byType = new Map<string, ExtraCostPrecedenceRow>();
  for (const row of relevant) {
    const existing = byType.get(row.typeCode);
    if (!existing) {
      byType.set(row.typeCode, row);
      continue;
    }
    if (row.productId != null && existing.productId == null) {
      byType.set(row.typeCode, row);
    }
  }

  return [...byType.values()].map((row) => ({
    typeCode: row.typeCode,
    typeName: row.typeName,
    amount: typeof row.amount === 'string' ? row.amount : row.amount.toString(),
    calculationMode: row.calculationMode,
    scope: row.productId ? ('PRODUCT' as const) : ('GROUP' as const),
  }));
}
