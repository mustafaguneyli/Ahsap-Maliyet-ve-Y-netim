export const ORDER_NUMBER_PREFIX = 'SP-';
export const ORDER_COUNTER_COLLECTION = '_counters';
export const ORDER_COUNTER_ID = 'order_document_number';

export function formatOrderNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error('Sipariş sıra numarası pozitif tam sayı olmalıdır.');
  }
  return `${ORDER_NUMBER_PREFIX}${String(sequence).padStart(6, '0')}`;
}

export function parseOrderSequence(orderNumber: string): number | null {
  const match = /^SP-(\d{6})$/.exec(orderNumber);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

/** Mevcut SP-000001… numaralarını değiştirmez; bir sonraki boş sırayı üretir. */
export function nextOrderSequence(existingNumbers: readonly string[]): number {
  let max = 0;
  for (const value of existingNumbers) {
    const parsed = parseOrderSequence(value);
    if (parsed != null && parsed > max) {
      max = parsed;
    }
  }
  return max + 1;
}
