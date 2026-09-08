import { BadRequestException, NotFoundException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export type AyarliPervazProfitRateSource =
  | 'ROW_EXCEPTION'
  | 'PRODUCT_PRICING_SETTING'
  | 'GROUP_PRICING_SETTING'
  | 'GLOBAL_PRICING_SETTING';

export type EffectivePeriodRecord = {
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type ProfitRateHolder = {
  isActive: boolean;
  profitRate: { toString(): string } | string | null;
};

export type AyarliPervazProfitRateResolution = {
  profitRate: string;
  source: AyarliPervazProfitRateSource;
};

export type AyarliPervazAdjustmentSource = 'ROW_EXCEPTION' | 'NONE';

export type AyarliPervazAdjustmentResolution = {
  adjustmentAmount: string | null;
  source: AyarliPervazAdjustmentSource;
};

export type CardFixedHolder = {
  isActive: boolean;
  cardFixedSurchargeAmount?: { toString(): string } | string | null;
};

/**
 * ExtraCostValue / ham madde fiyatı ile aynı dönem kuralı:
 * isActive AND effectiveFrom <= now AND (effectiveTo IS NULL OR effectiveTo > now)
 */
export function selectCurrentEffectivePeriod<T extends EffectivePeriodRecord>(
  rows: T[],
  now: Date,
): T | null {
  const candidates = rows
    .filter(
      (row) =>
        row.isActive &&
        row.effectiveFrom.getTime() <= now.getTime() &&
        (row.effectiveTo == null || row.effectiveTo.getTime() > now.getTime()),
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return candidates[0] ?? null;
}

function readNonNegativeProfitRate(
  value: { toString(): string } | string | null | undefined,
): string | null {
  if (value == null || value === '') {
    return null;
  }
  const rate = toDecimal(typeof value === 'string' ? value : value.toString());
  if (rate.isNegative()) {
    throw new BadRequestException(
      `profitRate negatif olamaz; verilen değer: ${typeof value === 'string' ? value : value.toString()}.`,
    );
  }
  return rate.toFixed();
}

function firstActiveProfitRate(settings: ProfitRateHolder[]): string | null {
  for (const setting of settings) {
    if (!setting.isActive) {
      continue;
    }
    const rate = readNonNegativeProfitRate(setting.profitRate);
    if (rate != null) {
      return rate;
    }
  }
  return null;
}

/**
 * AYARLI_PERVAZ profitRate:
 * ROW_EXCEPTION (profitRate NOT NULL) >
 * PRODUCT_PRICING_SETTING >
 * GROUP_PRICING_SETTING >
 * GLOBAL_PRICING_SETTING
 *
 * Exception kaydı olup profitRate NULL ise (yalnız adjustment) default kâr kesilmez.
 * Sessiz %15 yok.
 *
 * PricingSetting modelinde effectiveFrom/To yoktur; aktif dönem isActive ile tutulur.
 */
export function resolveAyarliPervazProfitRate(input: {
  now: Date;
  productCode?: string;
  rowExceptions: Array<EffectivePeriodRecord & { profitRate: { toString(): string } | string | null }>;
  productSettings: ProfitRateHolder[];
  groupSettings?: ProfitRateHolder[];
  globalSettings?: ProfitRateHolder[];
}): AyarliPervazProfitRateResolution {
  const currentException = selectCurrentEffectivePeriod(input.rowExceptions, input.now);
  const rowProfit = currentException
    ? readNonNegativeProfitRate(currentException.profitRate)
    : null;
  if (rowProfit != null) {
    return { profitRate: rowProfit, source: 'ROW_EXCEPTION' };
  }

  const productProfit = firstActiveProfitRate(input.productSettings);
  if (productProfit != null) {
    return { profitRate: productProfit, source: 'PRODUCT_PRICING_SETTING' };
  }

  const groupProfit = firstActiveProfitRate(input.groupSettings ?? []);
  if (groupProfit != null) {
    return { profitRate: groupProfit, source: 'GROUP_PRICING_SETTING' };
  }

  const globalProfit = firstActiveProfitRate(input.globalSettings ?? []);
  if (globalProfit != null) {
    return { profitRate: globalProfit, source: 'GLOBAL_PRICING_SETTING' };
  }

  throw new NotFoundException(
    `${input.productCode ?? 'AYARLI_PERVAZ'} için şu an geçerli profitRate bulunamadı.`,
  );
}

export function resolveDekoratifPervazPremiumRate(input: {
  now: Date;
  rowExceptions: Array<
    EffectivePeriodRecord & {
      decorativePremiumRate: { toString(): string } | string | null;
    }
  >;
}): string {
  const currentException = selectCurrentEffectivePeriod(
    input.rowExceptions,
    input.now,
  );
  const rate = currentException
    ? readNonNegativeProfitRate(currentException.decorativePremiumRate)
    : null;
  if (rate == null) {
    throw new NotFoundException(
      'DEKORATIF_PERVAZ için şu an geçerli decorativePremiumRate bulunamadı.',
    );
  }
  return rate;
}

function readAdjustmentAmount(
  value: { toString(): string } | string | null | undefined,
): string | null {
  if (value == null || value === '') {
    return null;
  }
  const amount = toDecimal(typeof value === 'string' ? value : value.toString());
  return amount.toFixed();
}

/**
 * AYARLI_PERVAZ adjustmentAmount:
 * Aktif dönem PricingRowException.adjustmentAmount NOT NULL → ROW_EXCEPTION
 * Kayıt yoksa veya adjustmentAmount NULL ise → NONE (sahte 0 kaydı yok).
 * profitRate ile bağımsızdır; aynı exception her iki alanı da taşıyabilir.
 */
export function resolveAyarliPervazAdjustment(input: {
  now: Date;
  rowExceptions: Array<
    EffectivePeriodRecord & { adjustmentAmount: { toString(): string } | string | null }
  >;
}): AyarliPervazAdjustmentResolution {
  const currentException = selectCurrentEffectivePeriod(input.rowExceptions, input.now);
  const adjustmentAmount = currentException
    ? readAdjustmentAmount(currentException.adjustmentAmount)
    : null;
  if (adjustmentAmount != null) {
    return { adjustmentAmount, source: 'ROW_EXCEPTION' };
  }
  return { adjustmentAmount: null, source: 'NONE' };
}

export function resolveAyarliPervazCardSaleEnabled(input: {
  now: Date;
  rowExceptions: Array<EffectivePeriodRecord & { cardSaleEnabled?: boolean | null }>;
}): boolean {
  const currentException = selectCurrentEffectivePeriod(input.rowExceptions, input.now);
  return currentException?.cardSaleEnabled === true;
}

/**
 * Pervaz kart sabit TL: yalnız product-level PricingSetting.
 * Yoksa veya NULL ise kart yayınlanmaz (sessiz 0 yok).
 */
export function resolvePervazCardFixedSurchargeAmount(
  productSettings: CardFixedHolder[],
): string | null {
  for (const setting of productSettings) {
    if (!setting.isActive) {
      continue;
    }
    const raw = setting.cardFixedSurchargeAmount;
    if (raw == null || raw === '') {
      continue;
    }
    const value = typeof raw === 'string' ? raw : raw.toString();
    const amount = toDecimal(value);
    if (amount.isNegative()) {
      throw new BadRequestException(
        `cardFixedSurchargeAmount negatif olamaz; verilen değer: ${value}.`,
      );
    }
    return amount.toFixed();
  }
  return null;
}
