import { BadRequestException } from '@nestjs/common';
import { toDecimal } from '../../common/decimal/decimal.util';

export type CitaPublishedPriceBandInput = {
  productGroupId: string | null | undefined;
  minWidthMm: number;
  maxWidthMm: number;
  cashPrice: string | number;
  cardPrice: string | number;
  thicknessMm: readonly number[];
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  productGroupIsActive?: boolean | null;
};

export function citaPublishedWidthRangesOverlap(
  left: { minWidthMm: number; maxWidthMm: number },
  right: { minWidthMm: number; maxWidthMm: number },
): boolean {
  return left.minWidthMm <= right.maxWidthMm && right.minWidthMm <= left.maxWidthMm;
}

function assertPositivePrice(fieldName: string, value: string | number): void {
  let amount;
  try {
    amount = toDecimal(value);
  } catch {
    throw new BadRequestException(
      `${fieldName} geçerli bir Decimal olmalıdır; verilen değer: ${String(value)}.`,
    );
  }
  if (!amount.isFinite() || amount.lte(0)) {
    throw new BadRequestException(
      `${fieldName} 0’dan büyük olmalıdır; verilen değer: ${String(value)}.`,
    );
  }
}

/** Çıta yayınlanmış fiyat bandı uygulama katmanı doğrulaması. */
export function assertCitaPublishedPriceBand(
  input: CitaPublishedPriceBandInput,
): void {
  if (input.productGroupId == null || input.productGroupId === '') {
    throw new BadRequestException(
      'Çıta yayınlanmış fiyat bandı için productGroupId zorunludur.',
    );
  }
  if (!Number.isInteger(input.minWidthMm) || input.minWidthMm <= 0) {
    throw new BadRequestException('minWidthMm pozitif tam sayı (mm) olmalıdır.');
  }
  if (!Number.isInteger(input.maxWidthMm) || input.maxWidthMm < input.minWidthMm) {
    throw new BadRequestException(
      'maxWidthMm, minWidthMm değerine eşit veya büyük bir tam sayı olmalıdır.',
    );
  }

  assertPositivePrice('cashPrice', input.cashPrice);
  assertPositivePrice('cardPrice', input.cardPrice);

  if (input.thicknessMm.length === 0) {
    throw new BadRequestException(
      'Yayınlanmış fiyat bandı en az bir kalınlık kapsamı içermelidir.',
    );
  }
  const seen = new Set<number>();
  for (const thicknessMm of input.thicknessMm) {
    if (!Number.isInteger(thicknessMm) || thicknessMm <= 0) {
      throw new BadRequestException('thicknessMm pozitif tam sayı (mm) olmalıdır.');
    }
    if (seen.has(thicknessMm)) {
      throw new BadRequestException(
        `Aynı bantta duplicate kalınlık kapsamı olamaz: ${thicknessMm} mm.`,
      );
    }
    seen.add(thicknessMm);
  }

  if (input.effectiveTo != null && !(input.effectiveTo > input.effectiveFrom)) {
    throw new BadRequestException(
      'effectiveTo varsa effectiveFrom tarihinden sonra olmalıdır.',
    );
  }
  if (input.productGroupIsActive === false) {
    throw new BadRequestException(
      'Pasif ürün grubuna Çıta yayınlanmış fiyat bandı atanamaz.',
    );
  }
}
