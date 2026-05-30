export const SALES_ACCENTS = {
  orange: '#f97316',
  purple: '#7c3aed',
  blue: '#2563eb',
  teal: '#0d9488',
  green: '#16a34a',
  red: '#dc2626',
  amber: '#d97706',
  slate: '#64748b',
} as const;

export const SALES_ACCENT_SEQUENCE = [
  SALES_ACCENTS.orange,
  SALES_ACCENTS.purple,
  SALES_ACCENTS.blue,
  SALES_ACCENTS.teal,
  SALES_ACCENTS.green,
] as const;

export function hashToSalesAccent(value: string): string {
  const input = value.trim().toLowerCase() || 'customer';
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return SALES_ACCENT_SEQUENCE[hash % SALES_ACCENT_SEQUENCE.length];
}
