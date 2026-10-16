import { parseDataStoreName } from './data-store.types';

describe('parseDataStoreName', () => {
  it('boş veya postgres varsayılanı postgres döner', () => {
    expect(parseDataStoreName(undefined)).toBe('postgres');
    expect(parseDataStoreName('')).toBe('postgres');
    expect(parseDataStoreName('postgres')).toBe('postgres');
    expect(parseDataStoreName('postgresql')).toBe('postgres');
  });

  it('firestore değerini kabul eder', () => {
    expect(parseDataStoreName('firestore')).toBe('firestore');
  });

  it('geçersiz değeri reddeder', () => {
    expect(() => parseDataStoreName('both')).toThrow(/postgres veya firestore/);
  });
});
