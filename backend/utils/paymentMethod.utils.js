export const SUPPORTED_POS_PAYMENT_METHODS = Object.freeze(['cash', 'gcash']);
export const LEGACY_TRANSACTION_PAYMENT_METHODS = Object.freeze([
  'cash', 'gcash', 'maya', 'card', 'split',
]);

/**
 * Return the canonical persisted POS payment method, or null when the input is
 * missing/unsupported. Callers must reject null rather than silently assuming cash.
 */
export function normalizePosPaymentMethod(value) {
  return normalizePaymentMethod(value, SUPPORTED_POS_PAYMENT_METHODS);
}

/** Normalize an existing payment surface without introducing a new field name. */
export function normalizePaymentMethod(value, allowedMethods = LEGACY_TRANSACTION_PAYMENT_METHODS) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return allowedMethods.includes(normalized) ? normalized : null;
}
