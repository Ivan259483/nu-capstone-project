/**
 * calendarService.ts
 * All API calls for the Sales Smart Calendar.
 * Keeps HTTP logic out of hooks and components.
 */

import type { CalendarBooking } from './calendarTypes';
import type { RecurringScheduleRow } from '@/lib/shopSlotBands';

function getToken(): string {
  return (
    localStorage.getItem('autospf_token') ||
    sessionStorage.getItem('autospf_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    ''
  );
}

const authHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

// ── Slot range summary (new endpoint) ─────────────────────────────────────────
// GET /api/slots/range?start=YYYY-MM-DD&end=YYYY-MM-DD
export interface RangeSlotSummary {
  date: string;
  isClosed: boolean;
  closedReason?: 'emergency' | 'closure' | 'recurring' | null;
  closureLabel?: string | null;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  /** Admin "Capacity per time slot" (max seats in one hourly window). */
  perSlotCapacity?: number;
  /** Least remaining seats in any single window — use for month cells so 5 ≠ 9×5. */
  minAvailablePerSlot?: number;
  /** Open-hour bands that day (e.g. 9). Used if minAvailablePerSlot is missing (stale cache / old server). */
  timeBandCount?: number;
  almostFullSlots: number;
  fullSlots: number;
  pendingCount: number;
  status: 'AVAILABLE' | 'ALMOST_FULL' | 'FULL' | 'CLOSED';
}

export async function fetchSlotRange(start: string, end: string): Promise<RangeSlotSummary[]> {
  const res = await fetch(`/api/slots/range?start=${start}&end=${end}&_cal=2`, {
    headers: authHeaders(),
  });
  // 401/403 = session expired/invalid — return empty, don't throw
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) throw new Error(`Slot range fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];
  return json.data as RangeSlotSummary[];
}

/** Weekly hours + per-slot capacity (same source as Availability Controls). */
export async function fetchRecurringHoursSchedule(): Promise<RecurringScheduleRow[] | null> {
  const res = await fetch('/api/admin/availability/hours', { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? (data as RecurringScheduleRow[]) : null;
}

// ── Single-date full slot detail ───────────────────────────────────────────────
// GET /api/slots?date=YYYY-MM-DD
export interface SlotDetail {
  time: string;
  label?: string;
  capacity: number;
  booked: number;
  available: number;
  status: 'AVAILABLE' | 'ALMOST_FULL' | 'FULL';
}
export interface DateSlotDetail {
  date: string;
  isClosed: boolean;
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
// Still uses bulk fetch + client-side filter (backend has no ?date= on /orders).
// Performance is acceptable: 500-record cap, result cached per-date in the hook.
export async function fetchBookingsByDate(date: string): Promise<CalendarBooking[]> {
  const res = await fetch(`/api/orders?limit=500`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Orders fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];
  return (json.data as CalendarBooking[]).filter(b => {
    const bDate = b.bookingDate || '';
    return bDate === date || bDate.startsWith(date);
  });
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
