import { Timestamp } from 'firebase-admin/firestore';

export const FIRESTORE_DATE_FIELDS = [
  'effectiveFrom',
  'effectiveTo',
  'createdAt',
  'updatedAt',
] as const;

export type FirestoreDateField = (typeof FIRESTORE_DATE_FIELDS)[number];

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

export function toUtcDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`${fieldName} geçersiz Date.`);
    }
    return value;
  }
  if (isTimestampLike(value)) {
    return value.toDate();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${fieldName} geçersiz tarih string.`);
    }
    return parsed;
  }
  throw new Error(`${fieldName} Timestamp/Date olmalıdır; Number epoch kabul edilmez.`);
}

export function toOptionalUtcDate(value: unknown, fieldName: string): Date | null {
  if (value == null || value === '') {
    return null;
  }
  return toUtcDate(value, fieldName);
}

export function dateToFirestoreTimestamp(value: Date): Timestamp {
  return Timestamp.fromDate(value);
}

/**
 * Aktif dönem: effectiveFrom <= now AND (effectiveTo IS NULL OR effectiveTo > now).
 * Karşılaştırma epoch ms ile yapılır; timezone duvar saati aktif fiyatı değiştirmez.
 */
export function isCurrentlyEffective(
  effectiveFrom: Date,
  effectiveTo: Date | null,
  now: Date,
): boolean {
  const t = now.getTime();
  return effectiveFrom.getTime() <= t && (effectiveTo == null || effectiveTo.getTime() > t);
}

export function assertPeriodOrder(
  effectiveFrom: Date,
  effectiveTo: Date | null | undefined,
  fieldPrefix = 'effectiveTo',
): void {
  if (effectiveTo != null && !(effectiveTo.getTime() > effectiveFrom.getTime())) {
    throw new Error(`${fieldPrefix} varsa effectiveFrom tarihinden sonra olmalıdır.`);
  }
}

/** [from, to) açık uç +∞. Çakışma: aFrom < bToInf AND bFrom < aToInf */
export function periodsOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aToInf = aTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const bToInf = bTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return aFrom.getTime() < bToInf && bFrom.getTime() < aToInf;
}

export function encodeDateFields(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const field of FIRESTORE_DATE_FIELDS) {
    if (!(field in out)) {
      continue;
    }
    const value = out[field];
    if (value == null || value === '') {
      out[field] = null;
      continue;
    }
    out[field] = dateToFirestoreTimestamp(toUtcDate(value, field));
  }
  return out;
}

export function decodeDateFields(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const field of FIRESTORE_DATE_FIELDS) {
    if (!(field in out)) {
      continue;
    }
    out[field] = toOptionalUtcDate(out[field], field);
  }
  return out;
}
