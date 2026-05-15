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
import BookingSlotCounter from '../models/bookingSlotCounter.model.js';

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

const SLOT_CONSUMING_STATUS_SET = new Set(SLOT_CONSUMING_STATUSES);

export function isSlotConsumingStatus(status) {
  return SLOT_CONSUMING_STATUS_SET.has(String(status || '').trim());
}

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

export function formatSlotTimeForDisplay(timeStr) {
  const normalized = normalizeBookingTime(timeStr);
  if (!normalized) return String(timeStr || '').trim();

  const [hourRaw, minute] = normalized.split(':').map(Number);
  const period = hourRaw >= 12 ? 'PM' : 'AM';
  const hour12 = hourRaw % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
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

/**
 * Known string shapes for `bookingDate` that still normalize to the same
 * YYYY-MM-DD in aggregateBookingsForDate. Keeps the Mongo filter index-friendly
 * ($in of small literals) instead of scanning all slot-consuming orders.
 */
function buildBookingDateMatchValues(normalizedYyyyMmDd) {
  if (!normalizedYyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedYyyyMmDd)) {
    return [];
  }
  const values = new Set([normalizedYyyyMmDd]);
  const [y, mo, d] = normalizedYyyyMmDd.split('-').map(Number);
  if (y && mo && d) {
    values.add(`${y}/${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
    values.add(`${mo}/${d}/${y}`);
    values.add(`${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`);
  }
  return [...values];
}

/**
 * Slot-consuming orders for one calendar day only (see getDateAvailabilitySnapshot).
 * Previously this loaded every active booking app-wide and filtered in JS — O(n)
 * on the whole orders collection and the main cause of slow /available-slots.
 */
async function loadActiveBookingsForDate(normalizedDate, excludeOrderId = null) {
  const dateValues = buildBookingDateMatchValues(normalizedDate);
  if (dateValues.length === 0) return [];

  const query = {
    status: { $in: SLOT_CONSUMING_STATUSES },
    bookingDate: { $in: dateValues },
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

function buildSlotAvailability(daySchedule, bookedCountByTime = {}) {
  const capacity = Math.max(0, Number(daySchedule?.slots || 0));
  const times = generateTimeSlots(daySchedule, DEFAULT_SLOT_DURATION_MINUTES);

  return times.map((time) => {
    const booked = Math.max(0, Number(bookedCountByTime[time] || 0));
    const available = Math.max(0, capacity - booked);
    const ratio = capacity > 0 ? booked / capacity : 1;
    const status =
      capacity <= 0 || available <= 0
        ? 'FULL'
        : ratio >= 0.8
          ? 'ALMOST_FULL'
          : 'AVAILABLE';

    return {
      time,
      label: formatSlotTimeForDisplay(time),
      capacity,
      booked,
      available,
      status,
    };
  });
}

function summarizeSlotAvailability(slots) {
  const rows = Array.isArray(slots) ? slots : [];
  const totalCapacity = rows.reduce((sum, slot) => sum + Math.max(0, Number(slot.capacity || 0)), 0);
  const bookedSlots = rows.reduce((sum, slot) => {
    const capacity = Math.max(0, Number(slot.capacity || 0));
    const booked = Math.max(0, Number(slot.booked || 0));
    return sum + Math.min(booked, capacity);
  }, 0);
  const availableSlots = rows.reduce((sum, slot) => sum + Math.max(0, Number(slot.available || 0)), 0);
  const fullSlots = rows.filter((slot) => slot.status === 'FULL').length;
  const almostFullSlots = rows.filter((slot) => slot.status === 'ALMOST_FULL').length;

  return {
    totalCapacity,
    bookedSlots,
    availableSlots,
    fullSlots,
    almostFullSlots,
    allSlotsFull: rows.length > 0 && rows.every((slot) => slot.status === 'FULL'),
  };
}

function buildSlotCounterKey(bookingDate, bookingTime) {
  const date = normalizeBookingDate(bookingDate);
  const time = normalizeBookingTime(bookingTime);
  if (!date || !time) return null;
  return { date, time };
}

async function countActiveBookingsForSlot(normalizedDate, normalizedTime, excludeOrderId = null) {
  const bookings = await loadActiveBookingsForDate(normalizedDate, excludeOrderId);
  return bookings.reduce((count, booking) => {
    const bookingTime = normalizeBookingTime(booking.bookingTime);
    return bookingTime === normalizedTime ? count + 1 : count;
  }, 0);
}

export async function syncBookingSlotCounter(bookingDate, bookingTime, { excludeOrderId = null } = {}) {
  const key = buildSlotCounterKey(bookingDate, bookingTime);
  if (!key) return { ok: false, errorCode: 'INVALID_SLOT', message: 'Invalid booking date or time.' };

  const actualCount = await countActiveBookingsForSlot(key.date, key.time, excludeOrderId);
  await BookingSlotCounter.updateOne(
    { date: key.date, time: key.time },
    {
      $max: { count: actualCount },
      $set: { updatedAt: new Date() },
      $setOnInsert: { date: key.date, time: key.time, createdAt: new Date() },
    },
    { upsert: true }
  );

  return { ok: true, ...key, actualCount };
}

async function getTimeSlotAvailability(bookingDate, bookingTime, { excludeOrderId = null } = {}) {
  const snapshot = await getDateAvailabilitySnapshot(bookingDate, { excludeOrderId });
  if (snapshot.errorCode === 'INVALID_DATE') {
    return {
      ok: false,
      errorCode: snapshot.errorCode,
      message: snapshot.message,
      error: snapshot.error,
    };
  }

  if (
    !snapshot.ok
    && snapshot.errorCode !== 'DATE_FULL'
  ) {
    return {
      ok: false,
      errorCode: snapshot.errorCode,
      message: snapshot.message,
      error: snapshot.error,
    };
  }

  const normalizedTime = normalizeBookingTime(bookingTime);
  if (!normalizedTime) {
    return {
      ok: false,
      errorCode: 'INVALID_TIME',
      message: 'Invalid booking time.',
      error: 'Invalid booking time.',
    };
  }

  const slot = (snapshot.slots || []).find((row) => row.time === normalizedTime);
  if (!slot) {
    return {
      ok: false,
      errorCode: 'SLOT_UNAVAILABLE',
      message: 'Selected time is outside the shop operating hours.',
      error: 'Selected time is outside the shop operating hours.',
    };
  }

  if (slot.available <= 0) {
    return {
      ok: false,
      errorCode: 'SLOT_FULL',
      message: 'Selected time slot is fully booked.',
      error: 'Selected time slot is fully booked.',
      slot,
    };
  }

  return {
    ok: true,
    date: snapshot.date,
    time: normalizedTime,
    remaining: slot.available,
    slot,
  };
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
  const bookings = await loadActiveBookingsForDate(normalizedDate, excludeOrderId);
  const { bookedCount, bookedCountByTime, bookedTimes } = aggregateBookingsForDate(bookings, normalizedDate);

  const slotsLimit = Math.max(0, Number(daySchedule?.slots || 0));
  const slots = buildSlotAvailability(daySchedule, bookedCountByTime);
  const slotSummary = summarizeSlotAvailability(slots);
  const remaining = slotSummary.availableSlots;
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
      slots: [],
      totalCapacity: 0,
      fullTimes: [],
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
      slots: [],
      totalCapacity: 0,
      fullTimes: [],
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
      slots: [],
      totalCapacity: 0,
      fullTimes: [],
    };
  }

  if (slots.length === 0 || slotSummary.totalCapacity <= 0 || slotSummary.allSlotsFull) {
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
      slots,
      totalCapacity: slotSummary.totalCapacity,
      fullTimes: slots.filter((slot) => slot.status === 'FULL').map((slot) => slot.time),
      fullSlots: slotSummary.fullSlots,
      almostFullSlots: slotSummary.almostFullSlots,
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
    slots,
    totalCapacity: slotSummary.totalCapacity,
    fullTimes: slots.filter((slot) => slot.status === 'FULL').map((slot) => slot.time),
    fullSlots: slotSummary.fullSlots,
    almostFullSlots: slotSummary.almostFullSlots,
  };
}

/**
 * Returns raw booked time strings for compatibility with legacy clients.
 */
export async function getBookedTimeStringsForDate(bookingDate) {
  const normalizedDate = normalizeBookingDate(bookingDate);
  if (!normalizedDate) return [];

  const bookings = await loadActiveBookingsForDate(normalizedDate);
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

  if (snapshot.errorCode === 'INVALID_DATE') {
    return { date: resolvedDate, isClosed: true, slots: [] };
  }

  return { date: resolvedDate, isClosed: false, slots: snapshot.slots || [] };
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
  }).select('bookingDate bookingTime').lean();

  const pendingBookings = await Order.find({
    status: 'pending_confirmation',
  }).select('bookingDate').lean();

  const bookedByDateTime = {};
  for (const booking of activeBookings) {
    const dateKey = normalizeBookingDate(booking.bookingDate);
    if (!dateKey || !dateSet.has(dateKey)) continue;
    const timeKey = normalizeBookingTime(booking.bookingTime);
    if (!timeKey) continue;
    if (!bookedByDateTime[dateKey]) bookedByDateTime[dateKey] = {};
    bookedByDateTime[dateKey][timeKey] = (bookedByDateTime[dateKey][timeKey] || 0) + 1;
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

    const slots = buildSlotAvailability(daySchedule, bookedByDateTime[dateStr] || {});
    const summary = summarizeSlotAvailability(slots);

    let status = 'AVAILABLE';
    if (summary.totalCapacity <= 0 || summary.allSlotsFull) status = 'FULL';
    else if (summary.availableSlots / summary.totalCapacity <= 0.2 || summary.almostFullSlots > 0) status = 'ALMOST_FULL';

    return {
      date: dateStr,
      isClosed: false,
      totalSlots: summary.totalCapacity,
      bookedSlots: summary.bookedSlots,
      availableSlots: summary.availableSlots,
      fullSlots: summary.fullSlots,
      almostFullSlots: summary.almostFullSlots,
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

  return getTimeSlotAvailability(bookingDate, bookingTime, { excludeOrderId });
}

export async function reserveBookingSlot(bookingDate, bookingTime) {
  const availability = await getTimeSlotAvailability(bookingDate, bookingTime);
  if (!availability.ok) return availability;

  await syncBookingSlotCounter(availability.date, availability.time);

  const counter = await BookingSlotCounter.findOneAndUpdate(
    {
      date: availability.date,
      time: availability.time,
      count: { $lt: availability.slot.capacity },
    },
    {
      $inc: { count: 1 },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  ).lean();

  if (!counter) {
    return {
      ok: false,
      errorCode: 'SLOT_FULL',
      message: 'Selected time slot is fully booked.',
      error: 'Selected time slot is fully booked.',
    };
  }

  return {
    ok: true,
    date: availability.date,
    time: availability.time,
    remaining: Math.max(0, availability.slot.capacity - counter.count),
  };
}

export async function releaseBookingSlot(bookingDate, bookingTime) {
  const key = buildSlotCounterKey(bookingDate, bookingTime);
  if (!key) return { ok: false };

  await BookingSlotCounter.findOneAndUpdate(
    { date: key.date, time: key.time, count: { $gt: 0 } },
    {
      $inc: { count: -1 },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  );

  return { ok: true, ...key };
}
