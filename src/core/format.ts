const UNITS = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** Compact number: 950, 1.25K, 34.1M */
export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 > 0.05 ? n.toFixed(1) : String(Math.floor(n + 1e-9));
  let i = -1;
  while (n >= 1000 && i < UNITS.length - 1) {
    n /= 1000;
    i++;
  }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0)) + UNITS[i];
}

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return 'un momento';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
