const RECEIPT_PHONE_FIELDS = [
  'customerPhone',
  'phone',
  'phoneNumber',
  'contactNumber',
  'mobileNumber',
  'contactNo',
] as const;

const RECEIPT_PHONE_CONTAINERS = [
  'customer',
  'user',
  'booking',
  'payment',
  'receipt',
] as const;

const ENCRYPTED_VALUE_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;
const EMPTY_PHONE_VALUES = new Set(['null', 'undefined', 'none', 'n/a', 'na', '-']);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const normalizeReceiptPhone = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || EMPTY_PHONE_VALUES.has(trimmed.toLowerCase())) return undefined;
  if (ENCRYPTED_VALUE_PATTERN.test(trimmed)) return undefined;

  const compact = trimmed.replace(/[\s().-]/g, '');
  return /^\+?\d{7,15}$/.test(compact) ? trimmed : undefined;
};

export const resolveReceiptPhone = (...sources: unknown[]): string | undefined => {
  const seen = new Set<object>();

  const visit = (source: unknown): string | undefined => {
    const directValue = normalizeReceiptPhone(source);
    if (directValue) return directValue;

    const record = asRecord(source);
    if (!record || seen.has(record)) return undefined;
    seen.add(record);

    for (const field of RECEIPT_PHONE_FIELDS) {
      const value = normalizeReceiptPhone(record[field]);
      if (value) return value;
    }

    for (const container of RECEIPT_PHONE_CONTAINERS) {
      const value = visit(record[container]);
      if (value) return value;
    }

    return undefined;
  };

  for (const source of sources) {
    const value = visit(source);
    if (value) return value;
  }

  return undefined;
};
