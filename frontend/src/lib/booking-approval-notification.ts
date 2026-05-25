import type { SystemNotification } from './notification-service';

export const BOOKING_APPROVAL_KINDS = ['booking', 'reservation_fee', 'balance_pickup'] as const;

export const SALES_BELL_KINDS = BOOKING_APPROVAL_KINDS;

export function isSalesBellNotification(
  n: Pick<SystemNotification, 'type' | 'message' | 'metadata'> | null | undefined
): boolean {
  if (!n || n.type === 'chat') return false;
  if (n.type !== 'booking') return false;

  const kind = (n.metadata as { kind?: string } | undefined)?.kind;
  if (kind && (SALES_BELL_KINDS as readonly string[]).includes(kind)) return true;

  const orderId = (n.metadata as { orderId?: string } | undefined)?.orderId;
  const msg = String(n.message || '');
  if (orderId && /Booking Approvals/i.test(msg)) return true;
  if (orderId && /Balance.*pickup/i.test(msg)) return true;
  return false;
}

/** @deprecated Use isSalesBellNotification */
export function isBookingApprovalNotification(
  n: Pick<SystemNotification, 'type' | 'message' | 'metadata'> | null | undefined
): boolean {
  return isSalesBellNotification(n);
}

export function isBalancePickupNotification(
  n: Pick<SystemNotification, 'metadata'> | null | undefined
): boolean {
  return (n?.metadata as { kind?: string } | undefined)?.kind === 'balance_pickup';
}

/** GCash ₱500 reservation proof — opens proof review modal (not POS). */
export function isGcashProofApprovalNotification(
  n: Pick<SystemNotification, 'type' | 'message' | 'metadata'> | null | undefined
): boolean {
  if (!n || isBalancePickupNotification(n)) return false;
  const kind = (n.metadata as { kind?: string } | undefined)?.kind;
  if (kind === 'reservation_fee') return true;
  const msg = String(n.message || '');
  const orderId = (n.metadata as { orderId?: string } | undefined)?.orderId;
  if (kind === 'booking' && orderId && /reservation|gcash|proof/i.test(msg)) return true;
  if (orderId && /sent a reservation|gcash proof/i.test(msg)) return true;
  return false;
}
