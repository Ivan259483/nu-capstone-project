/**
 * Customer Payment History — keep in sync with web
 * `activeSection === 'payments'` block in CustomerDashboard.tsx (~3695–3870).
 */

import type { BookingRecord } from '@/services/api/types';
import {
  CUSTOMER_RESERVATION_FEE,
  resolveCustomerPaymentState,
} from '@/utils/customer-payment-state';

export const CUSTOMER_PAYMENT_RESERVATION_FEE = CUSTOMER_RESERVATION_FEE;

export function normCustomerBookingStatus(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

/** Customer bookings with a payment lifecycle (only terminal invalid rows are excluded). */
export function filterBookingsForPaymentHistory(bookings: BookingRecord[]): BookingRecord[] {
  return bookings.filter((b) => {
    const s = normCustomerBookingStatus(b?.status);
    return !['cancelled', 'failed'].includes(s);
  });
}

export function countPaymentHistoryBookings(bookings: BookingRecord[]): number {
  return filterBookingsForPaymentHistory(bookings).length;
}

/** Only Sales-verified reservation transactions count as paid fees. */
export function sumReservationFeesDisplayed(bookings: BookingRecord[]): number {
  return filterBookingsForPaymentHistory(bookings).reduce((sum, booking) => {
    const state = resolveCustomerPaymentState(booking);
    return state.reservation === 'paid'
      ? sum + (state.verifiedReservationAmount || CUSTOMER_PAYMENT_RESERVATION_FEE)
      : sum;
  }, 0);
}

/** Full-payment KPI includes only bookings whose balance is verified as paid. */
export function sumFullPaymentsDisplayed(bookings: BookingRecord[]): number {
  return filterBookingsForPaymentHistory(bookings)
    .map((booking) => ({ booking, state: resolveCustomerPaymentState(booking) }))
    .filter(({ state }) => state.fullPayment === 'paid')
    .reduce(
      (sum, { booking }) => sum + Number(booking.totalPrice || booking.totalAmount || 0),
      0
    );
}

export function sortBookingsNewestFirst(bookings: BookingRecord[]): BookingRecord[] {
  return [...bookings].sort((a, b) => {
    const tb = new Date(b.createdAt || b.date || b.bookingDate || 0).getTime();
    const ta = new Date(a.createdAt || a.date || a.bookingDate || 0).getTime();
    return tb - ta;
  });
}
