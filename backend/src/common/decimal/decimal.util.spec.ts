import {
  normalizeNearWholeTl,
  roundUpToWholeTl,
  toDecimal,
} from './decimal.util';

describe('normalizeNearWholeTl', () => {
  it('çok küçük Decimal residue ile 655 üstünü 655 yapar', () => {
    const noisy = toDecimal('4400')
      .div(12)
      .plus(toDecimal('2185').div(15))
      .plus('33.5')
      .times('1.2');
    expect(noisy.gt('655')).toBe(true);
    expect(normalizeNearWholeTl(noisy).toString()).toBe('655');
  });

  it('655.0001 gibi gerçek kesri değiştirmez', () => {
    expect(normalizeNearWholeTl('655.0001').toString()).toBe('655.0001');
  });

  it('300.276... gibi anlamlı kesri değiştirmez', () => {
    const raw = '300.2769230769230769230';
    expect(normalizeNearWholeTl(raw).equals(toDecimal(raw))).toBe(true);
  });
});

describe('roundUpToWholeTl (Excel ROUNDUP(..., 0))', () => {
  it('655 + çok küçük Decimal residue → 655', () => {
    const noisy = toDecimal('4400')
      .div(12)
      .plus(toDecimal('2185').div(15))
      .plus('33.5')
      .times('1.2');
    expect(roundUpToWholeTl(noisy).toString()).toBe('655');
  });

  it('655.0001 → 656', () => {
    expect(roundUpToWholeTl('655.0001').toString()).toBe('656');
  });

  it('300.276... → 301', () => {
    expect(roundUpToWholeTl('300.2769230769230769230').toString()).toBe('301');
  });

  it('325.75 → 326', () => {
    expect(roundUpToWholeTl('325.75').toString()).toBe('326');
  });

  it('kesirli pozitif değerleri bir üst tam TL yapar', () => {
    expect(roundUpToWholeTl('355.11').toString()).toBe('356');
    expect(roundUpToWholeTl('388.78').toString()).toBe('389');
    expect(roundUpToWholeTl('552.34').toString()).toBe('553');
    expect(roundUpToWholeTl('249.0738461538461538461').toString()).toBe('250');
  });

  it('tam sayıyı değiştirmez', () => {
    expect(roundUpToWholeTl('301').toString()).toBe('301');
    expect(roundUpToWholeTl(toDecimal('250.0')).toString()).toBe('250');
    expect(roundUpToWholeTl('655').toString()).toBe('655');
  });
});
