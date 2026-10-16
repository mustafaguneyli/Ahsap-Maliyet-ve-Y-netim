export const DATA_STORE_NAMES = ['postgres', 'firestore'] as const;

export type DataStoreName = (typeof DATA_STORE_NAMES)[number];

export function parseDataStoreName(value: string | undefined): DataStoreName {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'postgres' || normalized === 'postgresql' || normalized === 'prisma') {
    return 'postgres';
  }
  if (normalized === 'firestore') {
    return 'firestore';
  }
  throw new Error('DATA_STORE postgres veya firestore olmalıdır.');
}
