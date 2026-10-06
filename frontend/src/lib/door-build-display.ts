/**
 * Kapı İmalatı / sipariş UI display formatları.
 * Hesap hassasiyetine dokunmaz; yalnız gösterim.
 */

function normalizeDecimalInput(value: string): string {
  return value.trim().replace(/\s/g, '').replace(',', '.');
}

/** Para: virgülden sonra 2 basamak, binlik nokta, TL soneki. */
export function formatMoneyDisplay(value: string): string {
  const normalized = normalizeDecimalInput(value);
  const negative = normalized.startsWith('-');
  const abs = negative ? normalized.slice(1) : normalized;
  const [rawWhole, rawFrac = ''] = abs.split('.');
  const whole = rawWhole.replace(/^0+(?=\d)/, '') || '0';
  const fracPadded = `${rawFrac}00`.slice(0, 2);
  // Display-only half-up on 3rd digit without touching source string precision elsewhere.
  let fracNum = Number(fracPadded);
  let carry = 0;
  if (rawFrac.length > 2) {
    const third = Number(rawFrac[2] ?? '0');
    if (third >= 5) fracNum += 1;
    if (fracNum >= 100) {
      fracNum = 0;
      carry = 1;
    }
  }
  let wholeNum = BigInt(whole) + BigInt(carry);
  const grouped = wholeNum
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fracOut = String(fracNum).padStart(2, '0');
  return `${negative ? '-' : ''}${grouped},${fracOut} TL`;
}

export function formatMoneyDisplayOrDash(
  value: string | null | undefined,
): string {
  if (value == null || value === '') return '—';
  return formatMoneyDisplay(value);
}

/**
 * Miktar: tam sayıysa tam; ondalıklıysa en fazla 2 basamak (virgül).
 * Gereksiz ",00" eklenmez.
 */
export function formatQuantityDisplay(value: string): string {
  const normalized = normalizeDecimalInput(value);
  if (!normalized) return value;
  const [whole, frac] = normalized.replace(/^-/, '').split('.');
  const negative = normalized.startsWith('-');
  if (!frac || /^0+$/.test(frac)) {
    return `${negative ? '-' : ''}${whole}`;
  }
  // Ondalıklı miktarda her zaman 2 basamak (7.5 → 7,50)
  const two = `${frac}00`.slice(0, 2);
  return `${negative ? '-' : ''}${whole},${two}`;
}

export function formatPercentDisplay(value: string): string {
  const normalized = normalizeDecimalInput(value);
  if (!normalized) return value;
  const [whole, frac] = normalized.split('.');
  if (!frac || /^0+$/.test(frac)) return whole;
  return `${whole},${frac.replace(/0+$/, '')}`;
}

export function formatCoefficientDisplay(value: string): string {
  return `×${formatPercentDisplay(value)}`;
}
