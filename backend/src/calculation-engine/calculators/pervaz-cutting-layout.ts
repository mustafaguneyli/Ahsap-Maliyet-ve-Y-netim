import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';
import {
  assertKilcikTypeAllowedForThickness,
  KILCIK_TYPE_SPECS,
  type KilcikTypeCode,
} from '../../modules/pervaz/kilcik-type.rules';

/**
 * Pervaz / kılçık MDF kesim yönü ve teorik (FLOOR) adet.
 * Maliyet NET ProductionYield / PervazKilcikYield'dan gelir; bu fonksiyonlar NET üretmez.
 */

export type KilcikProfile = KilcikTypeCode;

export const KILCIK_CUT_SPECS = KILCIK_TYPE_SPECS;

export type PervazSheetSides = {
  sheetWidthMm: number;
  sheetLengthMm: number;
};

export type PervazCuttingOrientation = {
  sheetShortSideMm: number;
  sheetLongSideMm: number;
  /** Parça boyunun hizalandığı tabaka kenarı */
  pieceAlongSideMm: number;
  /** Yan yana adet hesabında kullanılan kenar */
  countSideMm: number;
};

export type PervazTheoreticalQtyResult = {
  theoreticalQty: number;
  orientation: PervazCuttingOrientation;
  /** Ana pervaz: ürün eni. Kılçık: 43 veya 59 (bıçak payı dahil). */
  cutPitchMm: number;
  rounding: 'FLOOR';
};

function requirePositiveInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${name} pozitif tam sayı (mm) olmalıdır.`);
  }
}

function sheetSides(sheet: PervazSheetSides): {
  sheetShortSideMm: number;
  sheetLongSideMm: number;
} {
  requirePositiveInt('sheetWidthMm', sheet.sheetWidthMm);
  requirePositiveInt('sheetLengthMm', sheet.sheetLengthMm);
  return {
    sheetShortSideMm: Math.min(sheet.sheetWidthMm, sheet.sheetLengthMm),
    sheetLongSideMm: Math.max(sheet.sheetWidthMm, sheet.sheetLengthMm),
  };
}

/**
 * Parça kısa kenara sığıyorsa boy oraya oturur, adet uzun kenardan çıkar.
 * Sığmıyorsa boy uzun kenara yerleşir, adet kısa kenardan çıkar.
 * 220 boyu körü körüne 2800 mm varsaymaz; gerçek tabaka ölçüleri kullanılır.
 */
export function resolvePervazCuttingOrientation(
  sheet: PervazSheetSides,
  pieceLengthMm: number,
): PervazCuttingOrientation {
  requirePositiveInt('pieceLengthMm', pieceLengthMm);
  const { sheetShortSideMm, sheetLongSideMm } = sheetSides(sheet);

  if (pieceLengthMm <= sheetShortSideMm) {
    return {
      sheetShortSideMm,
      sheetLongSideMm,
      pieceAlongSideMm: sheetShortSideMm,
      countSideMm: sheetLongSideMm,
    };
  }

  if (pieceLengthMm <= sheetLongSideMm) {
    return {
      sheetShortSideMm,
      sheetLongSideMm,
      pieceAlongSideMm: sheetLongSideMm,
      countSideMm: sheetShortSideMm,
    };
  }

  throw new BadRequestException(
    `Parça boyu (${pieceLengthMm} mm) MDF tabakasına hiçbir yönde sığmıyor ` +
      `(${sheetShortSideMm} × ${sheetLongSideMm} mm).`,
  );
}

function floorQty(countSideMm: number, cutPitchMm: number): PervazTheoreticalQtyResult['theoreticalQty'] {
  const raw = toDecimal(countSideMm).div(cutPitchMm);
  const theoreticalQty = raw.floor().toNumber();
  if (!Number.isInteger(theoreticalQty) || theoreticalQty <= 0) {
    throw new BadRequestException(
      `Teorik adet geçersiz (${raw.toFixed()}). Kesim aralığı (${cutPitchMm} mm) ` +
        `kesim kenarına (${countSideMm} mm) sığmıyor olabilir.`,
    );
  }
  return theoreticalQty;
}

/**
 * Ana pervaz teorik adet: FLOOR(countSide / ürün eni). 4 mm bıçak payı yok.
 */
export function calculatePervazTheoreticalQty(input: {
  sheetWidthMm: number;
  sheetLengthMm: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
}): PervazTheoreticalQtyResult {
  requirePositiveInt('pieceWidthMm', input.pieceWidthMm);
  const orientation = resolvePervazCuttingOrientation(
    { sheetWidthMm: input.sheetWidthMm, sheetLengthMm: input.sheetLengthMm },
    input.pieceLengthMm,
  );
  const cutPitchMm = input.pieceWidthMm;
  return {
    theoreticalQty: floorQty(orientation.countSideMm, cutPitchMm),
    orientation,
    cutPitchMm,
    rounding: 'FLOOR',
  };
}

export function getKilcikCutSpec(profile: KilcikProfile): (typeof KILCIK_CUT_SPECS)[KilcikProfile] {
  const spec = KILCIK_CUT_SPECS[profile];
  if (!spec) {
    throw new BadRequestException(`Desteklenmeyen kılçık profili: ${String(profile)}`);
  }
  return spec;
}

export function assertKilcikProfileAllowed(
  pervazThicknessMm: string | number,
  profile: KilcikProfile,
): void {
  assertKilcikTypeAllowedForThickness(pervazThicknessMm, profile);
}

/**
 * Kılçık üretim pitch teorik adet (STANDARD 43 / WIDE 59).
 * Excel NET ve Excel kesim profili (42/45/50/55) için resolveKilcikExcelQty kullan.
 */
export function calculateKilcikTheoreticalQty(input: {
  sheetWidthMm: number;
  sheetLengthMm: number;
  pieceLengthMm: number;
  pervazThicknessMm: string | number;
  kilcikProfile: KilcikProfile;
}): PervazTheoreticalQtyResult & {
  kilcikProfile: KilcikProfile;
  nominalWidthMm: number;
  bladeAllowanceMm: number;
} {
  assertKilcikProfileAllowed(input.pervazThicknessMm, input.kilcikProfile);
  const spec = getKilcikCutSpec(input.kilcikProfile);
  const orientation = resolvePervazCuttingOrientation(
    { sheetWidthMm: input.sheetWidthMm, sheetLengthMm: input.sheetLengthMm },
    input.pieceLengthMm,
  );
  return {
    theoreticalQty: floorQty(orientation.countSideMm, spec.cutPitchMm),
    orientation,
    cutPitchMm: spec.cutPitchMm,
    rounding: 'FLOOR',
    kilcikProfile: spec.code,
    nominalWidthMm: spec.nominalWidthMm,
    bladeAllowanceMm: spec.bladeAllowanceMm,
  };
}
