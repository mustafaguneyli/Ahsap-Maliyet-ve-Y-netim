import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import type { CitaMdfResult } from './cita-mdf-calculator';
import { CITA_EXTRA_COST_TYPE_ORDER } from '../../modules/extra-costs/cita-extra-cost';

export const CITA_EXTRA_COST_MISSING = 'EXTRA_COST_MISSING' as const;

export type CitaProductionExtraCost = {
  code: (typeof CITA_EXTRA_COST_TYPE_ORDER)[number];
  amount: string;
};

export type CitaProductionResult = CitaMdfResult & {
  extraCosts: CitaProductionExtraCost[];
  extraCostsTotal: string | null;
  productionCost: string | null;
  extraCostsAvailable: boolean;
  missingExtraCosts: Array<(typeof CITA_EXTRA_COST_TYPE_ORDER)[number]>;
  statusCode: typeof CITA_EXTRA_COST_MISSING | null;
};

/**
 * productionCost = mdfUnitCost + CUTTING + LABOR.
 * Eksik kalemde 0 uydurulmaz; productionCost null kalır.
 */
export function calculateCitaProductionCost(input: {
  mdf: CitaMdfResult;
  extraCosts: Array<{ code: string; amount: string | null }>;
}): CitaProductionResult {
  const byCode = new Map(
    input.extraCosts.map((item) => [item.code, item.amount]),
  );
  const present: CitaProductionExtraCost[] = [];
  const missing: Array<(typeof CITA_EXTRA_COST_TYPE_ORDER)[number]> = [];

  for (const code of CITA_EXTRA_COST_TYPE_ORDER) {
    const raw = byCode.get(code);
    if (raw == null || String(raw).trim() === '') {
      missing.push(code);
      continue;
    }

    const amount = toDecimal(raw);
    if (!amount.isFinite() || amount.lte(0)) {
      throw new BadRequestException(
        `Çıta ${code} tutarı 0’dan büyük bir Decimal olmalıdır.`,
      );
    }
    present.push({ code, amount: amount.toFixed() });
  }

  if (missing.length > 0) {
    return {
      ...input.mdf,
      extraCosts: present,
      extraCostsTotal: null,
      productionCost: null,
      extraCostsAvailable: false,
      missingExtraCosts: missing,
      statusCode: CITA_EXTRA_COST_MISSING,
    };
  }

  const extraCostsTotal = present.reduce(
    (sum, item) => sum.plus(item.amount),
    toDecimal(0),
  );
  const productionCost = toDecimal(input.mdf.mdfUnitCost).plus(extraCostsTotal);

  return {
    ...input.mdf,
    extraCosts: present,
    extraCostsTotal: extraCostsTotal.toFixed(),
    productionCost: productionCost.toFixed(),
    extraCostsAvailable: true,
    missingExtraCosts: [],
    statusCode: null,
  };
}
