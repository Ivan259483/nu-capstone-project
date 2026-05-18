/**
 * Customer Payment History — keep in sync with web
 * `activeSection === 'payments'` block in CustomerDashboard.tsx (~3695–3870).
 */

import type { BookingRecord } from '@/services/api/types';

export const CUSTOMER_PAYMENT_RESERVATION_FEE = 500;

export function normCustomerBookingStatus(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

/** Bookings that appear in payment history (excludes pending / cancelled / failed). */
export function filterBookingsForPaymentHistory(bookings: BookingRecord[]): BookingRecord[] {
  return bookings.filter((b) => {
    const s = normCustomerBookingStatus(b?.status);
    return !['pending', 'cancelled', 'failed'].includes(s);
  });
}

export function countPaymentHistoryBookings(bookings: BookingRecord[]): number {
  return filterBookingsForPaymentHistory(bookings).length;
}

/** Web summary: count of bookings in approved+ pipeline × ₱500. */
export function sumReservationFeesDisplayed(bookings: BookingRecord[]): number {
  const eligible = [
    'approved',
    'confirmed',
    'received',
    'in_progress',
    'completed',
    'released',
    'paid',
  ];
  const n = bookings.filter((b) =>
    eligible.includes(normCustomerBookingStatus(b?.status))
  ).length;
  return n * CUSTOMER_PAYMENT_RESERVATION_FEE;
}

/** Web summary: sum of total for bookings considered fully paid for reporting. */
export function sumFullPaymentsDisplayed(bookings: BookingRecord[]): number {
  return bookings
    .filter((b) => {
      const s = normCustomerBookingStatus(b?.status);
      return (
        String(b.paymentStatus || '').toLowerCase() === 'paid' ||
        ['completed', 'released', 'paid'].includes(s)
      );
    })
    .reduce((sum, b) => sum + Number(b.totalPrice || b.totalAmount || 0), 0);
}

export function sortBookingsNewestFirst(bookings: BookingRecord[]): BookingRecord[] {
  return [...bookings].sort((a, b) => {
    const tb = new Date(b.createdAt || b.date || b.bookingDate || 0).getTime();
    const ta = new Date(a.createdAt || a.date || a.bookingDate || 0).getTime();
    return tb - ta;
  });
}
