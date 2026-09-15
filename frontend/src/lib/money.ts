/**
 * Para gösterimi — hesaplama yapmaz; yalnızca string Decimal'i TR formatına çevirir.
 * Örn. "3750.00" → "₺3.750,00"
 */
export function formatTry(value: string | null | undefined): string {
  if (value == null || value === '') return '—';

  const negative = value.startsWith('-');
  const raw = negative ? value.slice(1) : value;
  const [intPartRaw, fracRaw = ''] = raw.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const frac = `${fracRaw}00`.slice(0, 2);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${negative ? '-' : ''}₺${grouped},${frac}`;
}

/**
 * Para gösterimi için Decimal stringini iki ondalığa yuvarlar.
 * Number dönüşümü yapmaz ve kaynak/API değerini değiştirmez.
 */
export function formatTryTwoDecimals(
  value: string | null | undefined,
): string {
  if (value == null || value === '') return '—';

  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match) return '—';

  const negative = match[1] === '-';
  const whole = BigInt(match[2]);
  const fraction = match[3] ?? '';
  const cents = BigInt(`${fraction}00`.slice(0, 2));
  const roundsUp = (fraction[2] ?? '0') >= '5';
  const roundedCents = whole * 100n + cents + (roundsUp ? 1n : 0n);
  const roundedWhole = (roundedCents / 100n).toString();
  const roundedFraction = (roundedCents % 100n).toString().padStart(2, '0');
  const grouped = roundedWhole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${negative && roundedCents !== 0n ? '-' : ''}₺${grouped},${roundedFraction}`;
}

/** Oran gösterimi — hesap yapmaz. "0" → "%0", "10" → "%10" */
export function formatPercentRate(value: string | null | undefined): string {
  if (value == null || value === '') return '—';

  const negative = value.startsWith('-');
  const raw = negative ? value.slice(1) : value;
  const [intPartRaw, fracRaw = ''] = raw.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const fracTrim = fracRaw.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (!fracTrim) {
    return `${negative ? '-' : ''}%${grouped}`;
  }
  return `${negative ? '-' : ''}%${grouped},${fracTrim}`;
}

export function formatDateTr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
