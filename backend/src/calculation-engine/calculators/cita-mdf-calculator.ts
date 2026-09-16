import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import type { CitaNetSource } from './cita-net-calculator';
import { CITA_NET_PRODUCT_CODE } from './cita-net-calculator';

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
    priceType: 'CARD_INSTALLMENT';
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
  sheetPrice: {
    priceType: 'CARD_INSTALLMENT';
    amount: string;
  };
  mdfUnitCost: string;
};

/**
 * Çıta temel MDF maliyeti: activeSheetPrice / netQty.
 * Ara yuvarlama yok. ExtraCost / productionCost / kâr bu fazda yok.
 */
export function calculateCitaMdfCost(input: CitaMdfInput): CitaMdfResult {
  if (input.productCode !== CITA_NET_PRODUCT_CODE) {
    throw new BadRequestException('Çıta MDF maliyeti yalnız CITA ürünü için hesaplanır.');
  }
  if (input.sheetPrice.priceType !== 'CARD_INSTALLMENT') {
    throw new BadRequestException(
      'Çıta MDF maliyeti yalnız CARD_INSTALLMENT alış fiyatı ile hesaplanır.',
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
    sheetPrice: {
      priceType: 'CARD_INSTALLMENT',
      amount: sheetPrice.toFixed(),
    },
    mdfUnitCost: mdfUnitCost.toFixed(),
  };
}
