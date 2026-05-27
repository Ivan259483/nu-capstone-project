// ── Shared types for Sales Smart Calendar ────────────────────────────────────

export interface CalendarBooking {
  _id: string;
  id?: string;
  orderNumber?: string;
  customerName: string;
  customerPhone?: string;
  vehiclePlate?: string;
  vehicleType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  serviceName?: string;
  serviceType?: string;
  bookingDate?: string;
  bookingTime?: string;
  date?: string;
  time?: string;
  status: string;
  totalPrice?: number;
  totalAmount?: number;
  paymentProofUrl?: string;
  hasPaymentProof?: boolean;
  bookingReference?: string;
}

/** Statuses that do NOT consume a slot (excluded from counts) */
export const EXCLUDED_STATUSES = new Set([
  'rejected', 'cancelled', 'expired', 'no_show', 'failed',
]);

export type DayStatus = 'available' | 'almost_full' | 'full' | 'closed';
