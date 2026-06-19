const MONGO_OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export type NormalizedQueuedPickupOrder = {
  raw: any;
  orderId: string;
  bookingId: string;
  bookingReference: string;
  customerName: string;
  plateNumber: string;
  remainingBalance: number;
  readyForPaymentAt: string | null;
  disabledReason?: string;
  usedFallbackIdentity?: boolean;
};

export function idString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object') {
    const record = value as { _id?: unknown; $oid?: unknown; toString?: () => string };
    if (record._id !== undefined) return idString(record._id);
    if (record.$oid !== undefined) return idString(record.$oid);
    if (typeof record.toString === 'function') {
      const stringified = record.toString();
      return stringified === '[object Object]' ? '' : String(stringified).trim();
    }
  }
  return '';
}

export function isValidMongoObjectId(value: unknown): boolean {
  return MONGO_OBJECT_ID_RE.test(idString(value));
}

export function normalizeMoney(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d.-]/g, '');
    if (!normalized || normalized === '-' || normalized === '.') return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function shouldLogPosQueueDebug(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem('POS_QUEUE_DEBUG') === 'true';
  } catch {
    return false;
  }
}

export function posQueueDebug(label: string, payload?: unknown): void {
  if (!shouldLogPosQueueDebug()) return;
  if (payload === undefined) {
    console.debug(label);
  } else {
    console.debug(label, payload);
  }
}

export function normalizeQueuedPickupOrder(row: any): NormalizedQueuedPickupOrder {
  const directOrderId = idString(row?.orderId);
  const fallbackOrderId =
    directOrderId ||
    idString(row?._id) ||
    idString(row?.id) ||
    idString(row?.order?._id) ||
    idString(row?.booking?._id);
  const usedBookingFallback = !directOrderId && Boolean(idString(row?.booking?._id));
  const orderId = fallbackOrderId;
  const bookingId = idString(row?.bookingId) || idString(row?.booking?._id) || orderId;
  const disabledReason = !orderId
    ? 'Missing order ID'
    : !isValidMongoObjectId(orderId)
      ? 'Invalid queue record'
      : undefined;

  if (!directOrderId && orderId) {
    posQueueDebug('[POS Queue] fallback identity used', {
      orderId,
      source: usedBookingFallback ? 'booking._id' : 'legacy id field',
      row,
    });
  }

  if (disabledReason) {
    posQueueDebug('[POS Queue] load disabled reason', { reason: disabledReason, row });
  }

  return {
    raw: row,
    orderId,
    bookingId,
    bookingReference: String(row?.bookingReference || row?.orderNumber || orderId || ''),
    customerName: String(row?.customerName || row?.customer?.name || ''),
    plateNumber: String(row?.vehiclePlate || row?.plateNumber || row?.vehicle?.plateNumber || row?.vehicle?.plate || ''),
    remainingBalance: normalizeMoney(row?.remainingBalance),
    readyForPaymentAt: row?.readyForPaymentAt ? String(row.readyForPaymentAt) : null,
    disabledReason,
    usedFallbackIdentity: !directOrderId && Boolean(orderId),
  };
}
