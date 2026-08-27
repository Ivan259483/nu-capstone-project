/**
 * calendarService.ts
 * All API calls for the Sales Smart Calendar.
 * Keeps HTTP logic out of hooks and components.
 */

import type { CalendarBooking } from './calendarTypes';

function getToken(): string {
  const token = localStorage.getItem('autospf_token') || '';
  return token && token !== 'undefined' && token !== 'null' ? token : '';
}

const authHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

// ── Slot range summary (new endpoint) ─────────────────────────────────────────
// GET /api/slots/range?start=YYYY-MM-DD&end=YYYY-MM-DD
export interface RangeSlotSummary {
  date: string;
  businessDate?: string;
  businessTimeZone?: string;
  isClosed: boolean;
  closedReason?: 'emergency' | 'closure' | 'recurring' | null;
  closureType?: 'emergency' | 'scheduled' | 'weekly' | 'recurring' | null;
  closureReason?: string | null;
  emergencyClosed?: boolean;
  closureLabel?: string | null;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  /** Maximum appointments for this date, directly from Availability Controls. */
  dailyCapacity: number;
  almostFullSlots: number;
  fullSlots: number;
  overCapacitySlots?: number;
  overCapacityBy?: number;
  pendingCount: number;
  status: 'AVAILABLE' | 'ALMOST_FULL' | 'FULL' | 'OVER_CAPACITY' | 'CLOSED' | 'PAST';
}

export async function fetchSlotRange(start: string, end: string): Promise<RangeSlotSummary[]> {
  const res = await fetch(`/api/slots/range?start=${start}&end=${end}&_cal=4`, {
    headers: authHeaders(),
  });
  // 401/403 = session expired/invalid — return empty, don't throw
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) throw new Error(`Slot range fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];
  return json.data as RangeSlotSummary[];
}

// ── Single-date full slot detail ───────────────────────────────────────────────
// GET /api/slots?date=YYYY-MM-DD
export interface SlotDetail {
  time: string;
  label?: string;
  capacity: number;
  booked: number;
  available: number;
  blockedByDailyCapacity?: boolean;
  status: 'AVAILABLE' | 'ALMOST_FULL' | 'FULL' | 'OVER_CAPACITY' | 'ELAPSED';
  elapsed?: boolean;
  outOfSchedule?: boolean;
  overCapacityBy?: number;
}
export interface DateSlotDetail {
  date: string;
  businessDate?: string;
  businessTimeZone?: string;
  isClosed: boolean;
  closedReason?: string | null;
  closureType?: 'emergency' | 'scheduled' | 'weekly' | 'recurring' | null;
  closureReason?: string | null;
  emergencyClosed?: boolean;
  status?: 'AVAILABLE' | 'FULL' | 'OVER_CAPACITY' | 'CLOSED';
  bookedSlots?: number;
  availableSlots?: number;
  dailyCapacity?: number;
  totalCapacity?: number;
  slots: SlotDetail[];
}

export async function fetchSlotsByDate(date: string): Promise<DateSlotDetail | null> {
  try {
    const res = await fetch(`/api/slots?date=${date}`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? (json as DateSlotDetail) : null;
  } catch {
    return null;
  }
}

// ── Fetch bookings for a specific date ─────────────────────────────────────────
export async function fetchBookingsByDate(date: string): Promise<CalendarBooking[]> {
  const params = new URLSearchParams({
    bookingDate: date,
    limit: '100',
    sortBy: 'bookingTime',
    sortOrder: 'asc',
  });
  const res = await fetch(`/api/orders?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Orders fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];
  return (json.data as CalendarBooking[]).filter(b => {
    const bDate = b.bookingDate || '';
    return bDate === date || bDate.startsWith(date);
  });
}

// ── Fetch bookings for a calendar range ───────────────────────────────────────
export async function fetchBookingsByRange(start: string, end: string): Promise<CalendarBooking[]> {
  const bookings: CalendarBooking[] = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const params = new URLSearchParams({
      bookingDateFrom: start,
      bookingDateTo: end,
      limit: String(limit),
      skip: String(skip),
      sortBy: 'bookingDate',
      sortOrder: 'asc',
    });
    const res = await fetch(`/api/orders?${params.toString()}`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return [];
    if (!res.ok) throw new Error(`Orders range fetch failed: ${res.status}`);

    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return bookings;

    const pageRows = json.data as CalendarBooking[];
    const rows = pageRows.filter((booking) => {
      const bookingDate = String(booking.bookingDate || '').slice(0, 10);
      return bookingDate >= start && bookingDate <= end;
    });
    bookings.push(...rows);

    // Pagination belongs to the raw server page. A page can contain only
    // legacy/non-canonical dates that this client filters out while later
    // pages still contain valid rows in the requested range.
    if (!json.pagination?.hasNextPage || pageRows.length === 0) return bookings;
    skip += limit;
  }
}

export interface AvailabilityClosure {
  _id: string;
  fromDate: string;
  toDate: string;
  reason?: string;
  note?: string;
}

export async function fetchAvailabilityClosures(): Promise<AvailabilityClosure[]> {
  const res = await fetch('/api/admin/availability/closures', { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) throw new Error(`Closure fetch failed: ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json as AvailabilityClosure[] : [];
}

export async function createAvailabilityClosure(date: string, note?: string): Promise<AvailabilityClosure> {
  const res = await fetch('/api/admin/availability/closures', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      fromDate: date,
      toDate: date,
      reason: 'Custom',
      note: note || 'Blocked from appointments calendar',
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || json?.message || `Closure create failed: ${res.status}`);
  }
  return json as AvailabilityClosure;
}

export async function deleteAvailabilityClosure(id: string): Promise<void> {
  const res = await fetch(`/api/admin/availability/closures/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error || json?.message || `Closure delete failed: ${res.status}`);
  }
}

// ── Approve a booking ──────────────────────────────────────────────────────────
export async function approveBooking(
  id: string
): Promise<{ success: boolean; message?: string; errorCode?: string }> {
  const res = await fetch(`/api/orders/${id}/approve`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  return res.json();
}

// ── Reject a booking ───────────────────────────────────────────────────────────
export async function rejectBooking(
  id: string, reason: string
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`/api/orders/${id}/reject`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ reason: reason || 'Rejected by sales team.' }),
  });
  return res.json();
}
