/**
 * slot.service.js
 *
 * Core slot generation and availability computation.
 * This is the single source of truth for all slot logic —
 * used by both the slot controller and the booking/approval validators.
 */

import Order from '../models/order.model.js';
import ShopAvailability, { buildDefaultRecurringSchedule } from '../models/shopAvailability.model.js';
import ScheduledClosure from '../models/scheduledClosure.model.js';

const DEFAULT_SLOT_DURATION_MINUTES = 60;

// ── Statuses that consume a slot ──────────────────────────────────────────────
export const SLOT_CONSUMING_STATUSES = [
  'pending_confirmation',
  'confirmed',
  'approved',
  'assigned',
  'received',
  'in_progress',
  'queued',
  'processing',
  'quality_check',
];

// ── Parse 'HH:MM' into total minutes since midnight ───────────────────────────
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ── Format total minutes back to 'HH:MM' ─────────────────────────────────────
function fromMinutes(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function startOfLocalDayFromDateString(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfLocalDayFromDateString(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * normalizeBookingTime(timeStr)
 *
 * Converts ANY booking time string to 24-hour HH:MM so it can be matched
 * against generated slot keys.
 */
export function normalizeBookingTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();

  // Already HH:MM (24-hour) format
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // 12-hour format: '9:00 AM', '10:00 PM', '12:00 AM', etc.
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === 'AM') {
      if (h === 12) h = 0;
    } else if (h !== 12) {
      h += 12;
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

/**
 * normalizeBookingDate(dateStr)
 *
 * Converts a booking date to YYYY-MM-DD regardless of original format.
 */
export function normalizeBookingDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return getLocalDateString(parsed);
}

function normalizeRecurringSchedule(schedule) {
  const defaultsByDow = new Map(
    buildDefaultRecurringSchedule().map((entry) => [entry.dow, entry])
  );

  const toPlainEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.toObject === 'function') {
      return entry.toObject();
    }
    return entry;
  };

  const source = Array.isArray(schedule) && schedule.length > 0
    ? schedule
    : buildDefaultRecurringSchedule();

  const byDow = new Map();
  for (const entry of source) {
    const plainEntry = toPlainEntry(entry);
    if (!plainEntry || !Number.isInteger(plainEntry.dow) || plainEntry.dow < 0 || plainEntry.dow > 6) continue;
    byDow.set(plainEntry.dow, {
      ...defaultsByDow.get(plainEntry.dow),
      ...plainEntry,
    });
  }

  return Array.from({ length: 7 }, (_, dow) => ({
    ...defaultsByDow.get(dow),
    ...(byDow.get(dow) || {}),
    dow,
  }));
}

async function getAvailabilityConfig() {
  const doc = await ShopAvailability.findOne().lean();
  return {
    emergencyClosed: !!doc?.emergencyClosed,
    recurringSchedule: normalizeRecurringSchedule(doc?.recurringSchedule),
  };
}

function getDaySchedule(recurringSchedule, dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dow = new Date(year, month - 1, day).getDay();
  const dayConfig = recurringSchedule.find((entry) => entry.dow === dow);
  return dayConfig || normalizeRecurringSchedule([])[dow];
}

function isDateWithinClosure(dateStr, closure) {
  const dayStart = startOfLocalDayFromDateString(dateStr);
  const dayEnd = endOfLocalDayFromDateString(dateStr);
  return closure.fromDate <= dayEnd && closure.toDate >= dayStart;
}

async function findClosureForDate(dateStr) {
  const dayStart = startOfLocalDayFromDateString(dateStr);
  const dayEnd = endOfLocalDayFromDateString(dateStr);
  return ScheduledClosure
    .findOne({ fromDate: { $lte: dayEnd }, toDate: { $gte: dayStart } })
    .sort({ fromDate: 1 })
    .lean();
}

async function loadActiveBookings(excludeOrderId = null) {
  const query = {
    status: { $in: SLOT_CONSUMING_STATUSES },
    ...(excludeOrderId ? { _id: { $ne: excludeOrderId } } : {}),
  };

  return Order.find(query).select('bookingDate bookingTime').lean();
}

function aggregateBookingsForDate(bookings, targetDate) {
  let bookedCount = 0;
  const bookedCountByTime = {};
  const bookedTimes = [];

  for (const booking of bookings) {
    const normalizedDate = normalizeBookingDate(booking.bookingDate);
    if (normalizedDate !== targetDate) continue;

    bookedCount += 1;

    const rawTime = typeof booking.bookingTime === 'string' ? booking.bookingTime.trim() : '';
    if (rawTime) bookedTimes.push(rawTime);

    const normalizedTime = normalizeBookingTime(booking.bookingTime);
    if (normalizedTime) {
      bookedCountByTime[normalizedTime] = (bookedCountByTime[normalizedTime] || 0) + 1;
    }
  }

  return { bookedCount, bookedCountByTime, bookedTimes };
}

/**
 * generateTimeSlots(dayConfig, slotDuration)
 * Returns an ordered array of 'HH:MM' strings for a given day's config.
 * Returns [] if the day is closed.
 */
export function generateTimeSlots(dayConfig, slotDuration = DEFAULT_SLOT_DURATION_MINUTES) {
  if (!dayConfig?.open) return [];
  const openMin = toMinutes(dayConfig.from);
  const closeMin = toMinutes(dayConfig.to);
  if (!Number.isFinite(openMin) || !Number.isFinite(closeMin) || openMin >= closeMin) return [];

  const step = Number(slotDuration) > 0 ? Number(slotDuration) : DEFAULT_SLOT_DURATION_MINUTES;
  const slots = [];
  for (let t = openMin; t < closeMin; t += step) {
    slots.push(fromMinutes(t));
  }
  return slots;
}

/**
 * Returns per-date availability decision used by all availability checks.
 */
export async function getDateAvailabilitySnapshot(bookingDate, { excludeOrderId = null } = {}) {
  const normalizedDate = normalizeBookingDate(bookingDate);
  if (!normalizedDate) {
    return {
      ok: false,
      date: null,
      errorCode: 'INVALID_DATE',
      message: 'Invalid booking date.',
      error: 'Invalid booking date.',
    };
  }

  const config = await getAvailabilityConfig();
  const daySchedule = getDaySchedule(config.recurringSchedule, normalizedDate);
  const closure = await findClosureForDate(normalizedDate);
  const bookings = await loadActiveBookings(excludeOrderId);
  const { bookedCount, bookedCountByTime, bookedTimes } = aggregateBookingsForDate(bookings, normalizedDate);

  const slotsLimit = Math.max(0, Number(daySchedule?.slots || 0));
  const remaining = Math.max(0, slotsLimit - bookedCount);
  const today = getLocalDateString(new Date());

  if (config.emergencyClosed && normalizedDate === today) {
    return {
      ok: false,
      date: normalizedDate,
      errorCode: 'EMERGENCY_CLOSED',
      message: 'Bookings are temporarily closed for today due to an emergency closure.',
      error: 'Bookings are temporarily closed for today due to an emergency closure.',
      unavailable: true,
      daySchedule,
      slotsLimit,
      bookedCount,
      remaining,
      bookedCountByTime,
      bookedTimes,
    };
  }

  if (closure) {
    return {
      ok: false,
      date: normalizedDate,
      errorCode: 'CLOSED_BY_SCHEDULED_CLOSURE',
      message: 'Bookings are unavailable on this date due to a scheduled closure.',
      error: 'Bookings are unavailable on this date due to a scheduled closure.',
      unavailable: true,
      closure,
      daySchedule,
      slotsLimit,
      bookedCount,
      remaining,
      bookedCountByTime,
      bookedTimes,
    };
  }

  if (!daySchedule?.open) {
    return {
      ok: false,
      date: normalizedDate,
      errorCode: 'CLOSED_BY_RECURRING_DAY',
      message: 'The shop is closed on this day.',
      error: 'The shop is closed on this day.',
      unavailable: true,
      daySchedule,
      slotsLimit,
      bookedCount,
      remaining,
      bookedCountByTime,
      bookedTimes,
    };
  }

  if (bookedCount >= slotsLimit) {
    return {
      ok: false,
      date: normalizedDate,
      errorCode: 'DATE_FULL',
      message: 'All booking slots for this date are fully booked.',
      error: 'All booking slots for this date are fully booked.',
      unavailable: true,
      daySchedule,
      slotsLimit,
      bookedCount,
      remaining,
      bookedCountByTime,
      bookedTimes,
    };
  }

  return {
    ok: true,
    date: normalizedDate,
    unavailable: false,
    daySchedule,
    slotsLimit,
    bookedCount,
    remaining,
    bookedCountByTime,
    bookedTimes,
  };
}

/**
 * Returns raw booked time strings for compatibility with legacy clients.
 */
export async function getBookedTimeStringsForDate(bookingDate) {
  const normalizedDate = normalizeBookingDate(bookingDate);
  if (!normalizedDate) return [];

  const bookings = await loadActiveBookings();
  return aggregateBookingsForDate(bookings, normalizedDate).bookedTimes;
}

/**
 * getSlotsForDate(dateStr)
 *
 * Returns full slot availability for a single YYYY-MM-DD date.
 * Shape: {
 *   date, isClosed,
 *   slots: [{ time, capacity, booked, available, status }]
 * }
 */
export async function getSlotsForDate(dateStr) {
  const snapshot = await getDateAvailabilitySnapshot(dateStr);
  const resolvedDate = snapshot.date || normalizeBookingDate(dateStr) || dateStr;

  // Emergency/closure/recurring closed => day is closed
  if (
    !snapshot.ok
    && snapshot.errorCode !== 'DATE_FULL'
    && snapshot.errorCode !== 'INVALID_DATE'
  ) {
    return { date: resolvedDate, isClosed: true, slots: [] };
  }

  const daySchedule = snapshot.daySchedule || getDaySchedule(normalizeRecurringSchedule([]), resolvedDate);
  const times = generateTimeSlots(daySchedule, DEFAULT_SLOT_DURATION_MINUTES);

  if (times.length === 0 || snapshot.errorCode === 'INVALID_DATE') {
    return { date: resolvedDate, isClosed: true, slots: [] };
  }

  const dayIsFull = snapshot.errorCode === 'DATE_FULL';
  const ratio = snapshot.slotsLimit > 0 ? snapshot.bookedCount / snapshot.slotsLimit : 1;
  const openStatus = ratio >= 0.8 ? 'ALMOST_FULL' : 'AVAILABLE';

  const slots = times.map((time) => ({
    time,
    capacity: snapshot.slotsLimit,
    booked: snapshot.bookedCount,
    available: Math.max(0, snapshot.remaining),
    status: dayIsFull ? 'FULL' : openStatus,
  }));

  return { date: resolvedDate, isClosed: false, slots };
}

/**
 * getSlotsForRange(startStr, endStr)
 *
 * Returns a summary array for each date in the range.
 */
export async function getSlotsForRange(startStr, endStr) {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const startDate = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);

  const dates = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(getLocalDateString(d));
  }

  const dateSet = new Set(dates);
  const today = getLocalDateString(new Date());
  const config = await getAvailabilityConfig();

  const closures = await ScheduledClosure.find({
    fromDate: { $lte: endOfLocalDayFromDateString(endStr) },
    toDate: { $gte: startOfLocalDayFromDateString(startStr) },
  }).lean();

  const activeBookings = await Order.find({
    status: { $in: SLOT_CONSUMING_STATUSES },
  }).select('bookingDate').lean();

  const pendingBookings = await Order.find({
    status: 'pending_confirmation',
  }).select('bookingDate').lean();

  const bookedByDate = {};
  for (const booking of activeBookings) {
    const dateKey = normalizeBookingDate(booking.bookingDate);
    if (!dateKey || !dateSet.has(dateKey)) continue;
    bookedByDate[dateKey] = (bookedByDate[dateKey] || 0) + 1;
  }

  const pendingByDate = {};
  for (const booking of pendingBookings) {
    const dateKey = normalizeBookingDate(booking.bookingDate);
    if (!dateKey || !dateSet.has(dateKey)) continue;
    pendingByDate[dateKey] = (pendingByDate[dateKey] || 0) + 1;
  }

  return dates.map((dateStr) => {
    const closedByEmergency = config.emergencyClosed && dateStr === today;
    const closure = closures.find((row) => isDateWithinClosure(dateStr, row));
    const daySchedule = getDaySchedule(config.recurringSchedule, dateStr);

    if (closedByEmergency || closure || !daySchedule?.open) {
      return {
        date: dateStr,
        isClosed: true,
        totalSlots: 0,
        bookedSlots: 0,
        availableSlots: 0,
        fullSlots: 0,
        almostFullSlots: 0,
        pendingCount: pendingByDate[dateStr] || 0,
        status: 'CLOSED',
      };
    }

    const totalSlots = Math.max(0, Number(daySchedule.slots || 0));
    const bookedSlots = bookedByDate[dateStr] || 0;
    const availableSlots = Math.max(0, totalSlots - bookedSlots);
    const ratio = totalSlots > 0 ? bookedSlots / totalSlots : 1;

    let status = 'AVAILABLE';
    if (bookedSlots >= totalSlots) status = 'FULL';
    else if (ratio >= 0.8) status = 'ALMOST_FULL';

    return {
      date: dateStr,
      isClosed: false,
      totalSlots,
      bookedSlots,
      availableSlots,
      fullSlots: status === 'FULL' ? 1 : 0,
      almostFullSlots: status === 'ALMOST_FULL' ? 1 : 0,
      pendingCount: pendingByDate[dateStr] || 0,
      status,
    };
  });
}

/**
 * validateSlotAvailability(bookingDate, bookingTime, excludeOrderId?)
 *
 * Checks if a date can accept one more booking.
 * Returns { ok: true } or { ok: false, errorCode, message, error }.
 */
export async function validateSlotAvailability(bookingDate, bookingTime, excludeOrderId = null) {
  if (!bookingDate || !bookingTime) return { ok: true };

  const snapshot = await getDateAvailabilitySnapshot(bookingDate, { excludeOrderId });
  if (!snapshot.ok) {
    return {
      ok: false,
      errorCode: snapshot.errorCode,
      message: snapshot.message,
      error: snapshot.error,
    };
  }

  return {
    ok: true,
    remaining: snapshot.remaining,
  };
}
