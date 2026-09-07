import { BadRequestException } from '@nestjs/common';
import {
  calculatePervazTheoreticalQty,
  type PervazCuttingOrientation,
} from '../../calculation-engine/calculators/pervaz-cutting-layout';
import { getExcelKilcikCutWidthMm } from './excel-kilcik-cut-profile';

export type PervazQtySource = 'EXCEL_MASTER' | 'CALCULATED_EXCEL_RULE';

export type PervazQtyResolution = {
  netQty: number;
  source: PervazQtySource;
  calculatedQty: number;
  orientation: PervazCuttingOrientation;
  excelCutWidthMm: number;
};

function requireMasterNetQty(masterNetQty: number): number {
  if (!Number.isInteger(masterNetQty) || masterNetQty <= 0) {
    throw new BadRequestException('Master NET adedi pozitif tam sayı olmalıdır.');
  }
  return masterNetQty;
}

function withMasterPriority(
  calculatedQty: number,
  orientation: PervazCuttingOrientation,
  excelCutWidthMm: number,
  masterNetQty: number | null | undefined,
): PervazQtyResolution {
  if (masterNetQty != null) {
    const netQty = requireMasterNetQty(masterNetQty);
    return {
      netQty,
      source: 'EXCEL_MASTER',
      calculatedQty,
      orientation,
      excelCutWidthMm,
    };
  }

  return {
    netQty: calculatedQty,
    source: 'CALCULATED_EXCEL_RULE',
    calculatedQty,
    orientation,
    excelCutWidthMm,
  };
}

/**
 * Ana pervaz adet: aktif ProductionYield (EXCEL_MASTER) yoksa
 * FLOOR(countSide / pieceWidthMm). Bıçak payı yok. DB'ye yazılmaz.
 */
export function resolvePervazPieceQty(input: {
  sheetWidthMm: number;
  sheetLengthMm: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
  masterNetQty?: number | null;
}): PervazQtyResolution {
  const calculated = calculatePervazTheoreticalQty({
    sheetWidthMm: input.sheetWidthMm,
    sheetLengthMm: input.sheetLengthMm,
    pieceWidthMm: input.pieceWidthMm,
    pieceLengthMm: input.pieceLengthMm,
  });
  return withMasterPriority(
    calculated.theoreticalQty,
    calculated.orientation,
    input.pieceWidthMm,
    input.masterNetQty,
  );
}

/**
 * Kılçık adet: PervazKilcikYield (EXCEL_MASTER) yoksa
 * FLOOR(countSide / Excel profil eni 42|45|50|55). STANDARD/WIDE 43/59 kullanılmaz.
 * Fallback DB'ye yazılmaz.
 */
export function resolveKilcikExcelQty(input: {
  sheetWidthMm: number;
  sheetLengthMm: number;
  pieceLengthMm: number;
  pervazThicknessMm: string | number;
  masterNetQty?: number | null;
}): PervazQtyResolution {
  const excelCutWidthMm = getExcelKilcikCutWidthMm(input.pervazThicknessMm);
  const calculated = calculatePervazTheoreticalQty({
    sheetWidthMm: input.sheetWidthMm,
    sheetLengthMm: input.sheetLengthMm,
    pieceWidthMm: excelCutWidthMm,
    pieceLengthMm: input.pieceLengthMm,
  });
  return withMasterPriority(
    calculated.theoreticalQty,
    calculated.orientation,
    excelCutWidthMm,
    input.masterNetQty,
  );
}
