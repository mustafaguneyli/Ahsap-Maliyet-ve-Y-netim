import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export type YieldCalculationInput = {
  thicknessMm: string | number;
  sheetWidthMm: number;
  sheetLengthMm: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
};

export type YieldCalculationDetail = {
  sheetCutSideMm: number;
  sheetShortSideMm: number;
  sheetLongSideMm: number;
  effectivePieceWidthMm: number;
  rawResult: string;
  rounding: 'FLOOR';
  rule: 'PRIMARY_PLUS_5MM' | 'SECONDARY_MINUS_40MM';
};

export type YieldCalculationResult = {
  calculatedQty: number;
  calculation: YieldCalculationDetail;
};

/**
 * Kapı kasası Excel üretim önerisi (FLOOR).
 * NET master data formülle türetilmez; bu yalnızca kullanıcıya öneridir.
 *
 * 18/22 mm ana parça: effectiveWidth = pieceWidth + 5 mm
 * 12 mm ikinci parça: effectiveWidth = pieceWidth - 40 mm
 */
export function calculateDoorFrameSuggestedQty(
  input: YieldCalculationInput,
): YieldCalculationResult {
  if (!Number.isInteger(input.pieceWidthMm) || input.pieceWidthMm <= 0) {
    throw new BadRequestException('pieceWidthMm > 0 olmalıdır.');
  }
  if (!Number.isInteger(input.pieceLengthMm) || input.pieceLengthMm <= 0) {
    throw new BadRequestException('pieceLengthMm > 0 olmalıdır.');
  }
  if (!Number.isInteger(input.sheetWidthMm) || input.sheetWidthMm <= 0) {
    throw new BadRequestException('sheetWidthMm > 0 olmalıdır.');
  }
  if (!Number.isInteger(input.sheetLengthMm) || input.sheetLengthMm <= 0) {
    throw new BadRequestException('sheetLengthMm > 0 olmalıdır.');
  }

  const thickness = toDecimal(input.thicknessMm);
  const sheetShortSideMm = Math.min(input.sheetWidthMm, input.sheetLengthMm);
  const sheetLongSideMm = Math.max(input.sheetWidthMm, input.sheetLengthMm);

  let sheetCutSideMm: number;
  if (input.pieceLengthMm <= sheetShortSideMm) {
    sheetCutSideMm = sheetLongSideMm;
  } else if (input.pieceLengthMm <= sheetLongSideMm) {
    sheetCutSideMm = sheetShortSideMm;
  } else {
    throw new BadRequestException(
      `Parça boyu (${input.pieceLengthMm} mm) MDF tabakasına hiçbir yönde sığmıyor ` +
        `(${sheetShortSideMm} × ${sheetLongSideMm} mm).`,
    );
  }

  let effectivePieceWidthMm: number;
  let rule: YieldCalculationDetail['rule'];

  if (thickness.equals(22) || thickness.equals(18)) {
    effectivePieceWidthMm = input.pieceWidthMm + 5;
    rule = 'PRIMARY_PLUS_5MM';
  } else if (thickness.equals(12)) {
    if (input.pieceWidthMm <= 40) {
      throw new BadRequestException(
        '12 mm ikinci parça için parça eni 4 cm üretim payından büyük olmalıdır (pieceWidth > 40 mm).',
      );
    }
    effectivePieceWidthMm = input.pieceWidthMm - 40;
    rule = 'SECONDARY_MINUS_40MM';
  } else {
    throw new BadRequestException(
      `Otomatik NET önerisi yalnızca 18/22 mm (ana) veya 12 mm (ikinci) MDF için desteklenir. ` +
        `Seçilen kalınlık: ${thickness.toString()} mm.`,
    );
  }

  if (effectivePieceWidthMm <= 0) {
    throw new BadRequestException('Etkin parça eni pozitif olmalıdır.');
  }

  const raw = toDecimal(sheetCutSideMm).div(effectivePieceWidthMm);
  const calculatedQty = raw.floor().toNumber();

  if (!Number.isInteger(calculatedQty) || calculatedQty <= 0) {
    throw new BadRequestException(
      `Hesaplanan adet geçersiz (${raw.toFixed()}). Etkin en (${effectivePieceWidthMm} mm) ` +
        `kesim kenarına (${sheetCutSideMm} mm) sığmıyor olabilir.`,
    );
  }

  return {
    calculatedQty,
    calculation: {
      sheetCutSideMm,
      sheetShortSideMm,
      sheetLongSideMm,
      effectivePieceWidthMm,
      rawResult: raw.toFixed(),
      rounding: 'FLOOR',
      rule,
    },
  };
}
