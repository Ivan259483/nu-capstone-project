/**
 * Customer-facing booking lifecycle helpers.
 * Keeps Home "active" count / hero aligned with Tracker default row selection.
 */

const TERMINAL_DONE = new Set(['completed', 'released', 'cancelled', 'failed', 'paid']);

/**
 * Bookings that count toward Home "active" pill + live hero (excludes rejected so
 * a declined payment does not block "all clear" / new booking UX).
 */
export function isBookingCountedAsActiveOnHome(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .toLowerCase()
    .trim();
  if (!s) return false;
  if (s === 'rejected') return false;
  return !TERMINAL_DONE.has(s);
}

/**
 * Latest row shown on Tracker by default: any non–fully-done status (includes
 * rejected + pending_confirmation so customer can still re-upload / see state).
 */
export function isDefaultTrackBookingRow(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .toLowerCase()
    .trim();
  if (!s) return false;
  return !TERMINAL_DONE.has(s);
}
