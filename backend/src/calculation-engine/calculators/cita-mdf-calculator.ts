import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import type { CitaNetSource } from './cita-net-calculator';
import { CITA_NET_PRODUCT_CODE } from './cita-net-calculator';

export const CITA_MATERIAL_PRICE_TYPES = ['CASH', 'CARD_INSTALLMENT'] as const;

export type CitaMaterialPriceType = (typeof CITA_MATERIAL_PRICE_TYPES)[number];

export function isCitaMaterialPriceType(
  value: string,
): value is CitaMaterialPriceType {
  return (CITA_MATERIAL_PRICE_TYPES as readonly string[]).includes(value);
}

export type CitaMdfInput = {
  productCode: typeof CITA_NET_PRODUCT_CODE;
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  rawMaterial: {
    code: string;
    thicknessMm: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
  };
  cut: {
    bladeAllowanceMm: number;
    countSideMm: number;
    effectiveCutPitchMm: string;
  };
  productionYield: {
    netQty: number;
    source: CitaNetSource;
  };
  sheetPrice: {
    priceType: CitaMaterialPriceType;
    amount: string;
  };
};

export type CitaMdfResult = {
  productCode: typeof CITA_NET_PRODUCT_CODE;
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  rawMaterial: CitaMdfInput['rawMaterial'];
  cut: CitaMdfInput['cut'];
  productionYield: CitaMdfInput['productionYield'];
  /** Seçilen MDF alış türü. Satış kart yüzdesinden ayrıdır. */
  materialPriceType: CitaMaterialPriceType;
  sheetPrice: {
    priceType: CitaMaterialPriceType;
    amount: string;
  };
  mdfUnitCost: string;
};

/**
 * Çıta temel MDF maliyeti: seçilen tabaka alış fiyatı / netQty.
 * CASH ve CARD_INSTALLMENT aynı formülü kullanır. Ara yuvarlama yok.
 */
export function calculateCitaMdfCost(input: CitaMdfInput): CitaMdfResult {
  if (input.productCode !== CITA_NET_PRODUCT_CODE) {
    throw new BadRequestException('Çıta MDF maliyeti yalnız CITA ürünü için hesaplanır.');
  }
  if (!isCitaMaterialPriceType(input.sheetPrice.priceType)) {
    throw new BadRequestException(
      'Çıta MDF alış türü CASH veya CARD_INSTALLMENT olmalıdır.',
    );
  }

  const netQty = input.productionYield.netQty;
  if (!Number.isInteger(netQty) || netQty < 1) {
    throw new BadRequestException('Çıta NET adedi pozitif tam sayı olmalıdır.');
  }

  const sheetPrice = toDecimal(input.sheetPrice.amount);
  if (!sheetPrice.isFinite() || sheetPrice.lte(0)) {
    throw new BadRequestException(
      `Çıta MDF tabaka fiyatı pozitif olmalıdır: ${input.rawMaterial.code}`,
    );
  }

  const mdfUnitCost = sheetPrice.div(String(netQty));

  return {
    productCode: input.productCode,
    thicknessMm: input.thicknessMm,
    widthMm: input.widthMm,
    lengthMm: input.lengthMm,
    rawMaterial: input.rawMaterial,
    cut: input.cut,
    productionYield: {
      netQty,
      source: input.productionYield.source,
    },
    materialPriceType: input.sheetPrice.priceType,
    sheetPrice: {
      priceType: input.sheetPrice.priceType,
      amount: sheetPrice.toFixed(),
    },
    mdfUnitCost: mdfUnitCost.toFixed(),
  };
}
