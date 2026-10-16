import Decimal from 'decimal.js';
import { moneyFromFirestore, moneyToFirestore } from './firestore-money';

describe('firestore-money', () => {
  it('Decimal değeri string olarak yazar', () => {
    expect(moneyToFirestore(new Decimal('250.2307692307692307692307692'))).toBe(
      '250.2307692307692307692307692',
    );
  });

  it('Number para yazımını reddeder', () => {
    expect(() => moneyToFirestore(300 as never)).toThrow(/Number kabul etmez/);
  });

  it('eksik değeri 0 yapmaz', () => {
    expect(() => moneyFromFirestore(null, 'cashPrice')).toThrow(/eksik/);
  });

  it('Number okumayı reddeder', () => {
    expect(() => moneyFromFirestore(300, 'cashPrice')).toThrow(/Number/);
  });

  it('string Decimal okur', () => {
    expect(moneyFromFirestore('300', 'cashPrice').toFixed()).toBe('300');
  });

  it('canonical ölçekli string yazar', () => {
    expect(moneyToFirestore('1885', 4)).toBe('1885.0000');
    expect(moneyToFirestore('0.125', 4)).toBe('0.1250');
    expect(moneyToFirestore('22.5', 4)).toBe('22.5000');
  });
});
