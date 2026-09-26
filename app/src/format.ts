const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function money(cents: number | null | undefined): string {
  return cents == null ? '—' : usd.format(cents / 100);
}

/** "12.34" / "$1,234" → 1234 / 123400 cents; null if not a valid non-negative amount. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

// YYYY-MM-DD strings are calendar dates; build them in local time to avoid TZ shifts.
function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d ?? 1);
}

export function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  return localDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function monthLabel(monthKey: string): string {
  return localDate(monthKey).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
