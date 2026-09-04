export type LengthUnit = 'MM' | 'CM';

export function toCanonicalMm(value: number, unit: LengthUnit): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Uzunluk değeri pozitif bir sayı olmalıdır.');
  }

  if (unit === 'MM') {
    return value;
  }

  if (unit === 'CM') {
    return value * 10;
  }

  throw new Error(`Desteklenmeyen uzunluk birimi: ${String(unit)}`);
}

export function buildDisplayNameFromCm(widthCm: number, lengthCm: number): string {
  return `${widthCm}x${lengthCm}`;
}
