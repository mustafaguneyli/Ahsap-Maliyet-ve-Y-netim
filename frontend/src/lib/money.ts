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
