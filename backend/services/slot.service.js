/**
 * slot.service.js
 *
 * Core slot generation and availability computation.
 * This is the single source of truth for all slot logic —
 * used by both the slot controller and the booking/approval validators.
 */

import Order from '../models/order.model.js';
import ShopAvailability, { normalizeRecurringSchedule } from '../models/shopAvailability.model.js';
import ScheduledClosure from '../models/scheduledClosure.model.js';
import BookingSlotCounter from '../models/bookingSlotCounter.model.js';

const DEFAULT_SLOT_DURATION_MINUTES = 60;
export const SHOP_TIME_ZONE = process.env.SHOP_TIME_ZONE || 'Asia/Manila';

const shopClockFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Current wall-clock date/time in the shop timezone (not the server timezone). */
export function getShopLocalClock(now = new Date()) {
  const parts = Object.fromEntries(
    shopClockFormatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// ── Statuses that consume a slot ──────────────────────────────────────────────
export const SLOT_CONSUMING_STATUSES = [
  'pending_confirmation',
  'pending',
  'approved',
  'confirmed',
  'assigned',
  'queued',
  'received',
  'in_progress',
  // Read-only legacy aliases found in existing deployments. New writes remain
  // constrained by the canonical Order schema enum.
  'in-progress',
  'processing',
  'quality_check',
];

const SLOT_CONSUMING_STATUS_SET = new Set(SLOT_CONSUMING_STATUSES);

export function isSlotConsumingStatus(status) {
  return SLOT_CONSUMING_STATUS_SET.has(String(status || '').trim());
}

/** Shared lifecycle predicate used by queries and status/archive transitions. */
export function orderOccupiesSlot(status, archived = false, isWalkIn = false) {
  return !archived && !isWalkIn && isSlotConsumingStatus(status);
}

export function captureOrderSlotOccupancy(order = {}) {
  const slot = buildSlotCounterKey(order.bookingDate, order.bookingTime);
  return {
    status: order.status,
    archived: order.archived === true,
    isWalkIn: order.isWalkIn === true,
    slot,
    occupies: Boolean(slot) && orderOccupiesSlot(order.status, order.archived, order.isWalkIn),
  };
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
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return null;
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // 12-hour format: '9:00 AM', '10:00 PM', '12:00 AM', etc.
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
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

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() !== year
      || parsed.getMonth() !== month - 1
      || parsed.getDate() !== day
    ) return null;
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return getLocalDateString(parsed);
}

async function getAvailabilityConfig() {
  const doc = await ShopAvailability.getSingleton();
  return {
    emergencyClosed: !!doc.emergencyClosed,
    recurringSchedule: normalizeRecurringSchedule(doc.recurringSchedule),
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

    const localDate = new Date(y, mo - 1, d);
    for (const month of [
      localDate.toLocaleString('en-US', { month: 'short' }),
      localDate.toLocaleString('en-US', { month: 'long' }),
    ]) {
      values.add(`${month} ${d}, ${y}`);
      const weekday = localDate.toLocaleString('en-US', { weekday: 'short' });
      values.add(`${weekday}, ${month} ${d}, ${y}`);
    }
    values.add(localDate.toDateString());

    // Known legacy String/JSON serialization of a date-only appointment.
    values.add(`${normalizedYyyyMmDd}T00:00:00.000Z`);
    values.add(`${normalizedYyyyMmDd}T00:00:00Z`);
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
    archived: { $ne: true },
    isWalkIn: { $ne: true },
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

  const rows = times.map((time) => {
    const booked = Math.max(0, Number(bookedCountByTime[time] || 0));
    const available = Math.max(0, capacity - booked);
    const ratio = capacity > 0 ? booked / capacity : 1;
    const status =
      booked > capacity
        ? 'OVER_CAPACITY'
        : capacity <= 0 || available <= 0
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
      overCapacityBy: Math.max(0, booked - capacity),
      status,
    };
  });

  // Preserve appointments that predate an Admin hours reduction. They are not
  // bookable slots anymore, but remain visible as capacity-zero overages.
  const generatedTimes = new Set(times);
  for (const [rawTime, rawBooked] of Object.entries(bookedCountByTime || {})) {
    const time = normalizeBookingTime(rawTime);
    const booked = Math.max(0, Number(rawBooked || 0));
    if (!time || booked <= 0 || generatedTimes.has(time)) continue;
    rows.push({
      time,
      label: formatSlotTimeForDisplay(time),
      capacity: 0,
      booked,
      available: 0,
      overCapacityBy: booked,
      status: 'OVER_CAPACITY',
      outOfSchedule: true,
    });
  }

  return rows.sort((a, b) => a.time.localeCompare(b.time));
}

function applyElapsedSlotState(slots, dateStr, shopClock = getShopLocalClock()) {
  if (dateStr > shopClock.date) return slots;

  return slots.map((slot) => {
    const elapsed = dateStr < shopClock.date || toMinutes(slot.time) <= shopClock.minutes;
    return elapsed
      ? {
          ...slot,
          available: 0,
          elapsed: true,
          status: slot.status === 'OVER_CAPACITY' ? slot.status : 'ELAPSED',
        }
      : slot;
  });
}

function summarizeSlotAvailability(slots) {
  const rows = Array.isArray(slots) ? slots : [];
  const totalCapacity = rows.reduce((sum, slot) => sum + Math.max(0, Number(slot.capacity || 0)), 0);
  const bookedSlots = rows.reduce(
    (sum, slot) => sum + Math.max(0, Number(slot.booked || 0)),
    0
  );
  const availableSlots = rows.reduce((sum, slot) => sum + Math.max(0, Number(slot.available || 0)), 0);
  const fullSlots = rows.filter((slot) => slot.status === 'FULL').length;
  const almostFullSlots = rows.filter((slot) => slot.status === 'ALMOST_FULL').length;
  const overCapacitySlots = rows.filter((slot) => slot.status === 'OVER_CAPACITY').length;
  const overCapacityBy = rows.reduce(
    (sum, slot) => sum + Math.max(0, Number(slot.overCapacityBy || 0)),
    0
  );

  return {
    totalCapacity,
    bookedSlots,
    availableSlots,
    fullSlots,
    almostFullSlots,
    overCapacitySlots,
    overCapacityBy,
    allSlotsFull: rows.length > 0 && rows.every(
      (slot) => Math.max(0, Number(slot.available || 0)) <= 0
    ),
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

async function ensureBookingSlotCounter(key) {
  await BookingSlotCounter.init();
  try {
    await BookingSlotCounter.updateOne(
      { date: key.date, time: key.time },
      {
        $setOnInsert: {
          date: key.date,
          time: key.time,
          count: 0,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    // Two first-time requests for the same slot may race to create the unique
    // counter row. The winning insert is exactly the row both requests need.
    if (error?.code !== 11000) throw error;
  }
}

export async function syncBookingSlotCounter(bookingDate, bookingTime, { excludeOrderId = null } = {}) {
  const key = buildSlotCounterKey(bookingDate, bookingTime);
  if (!key) return { ok: false, errorCode: 'INVALID_SLOT', message: 'Invalid booking date or time.' };

  const actualCount = await countActiveBookingsForSlot(key.date, key.time, excludeOrderId);
  await ensureBookingSlotCounter(key);
  await BookingSlotCounter.updateOne(
    { date: key.date, time: key.time },
    {
      $max: { count: actualCount },
      $set: { updatedAt: new Date() },
    },
    { upsert: false }
  );

  return { ok: true, ...key, actualCount };
}

async function getTimeSlotAvailability(bookingDate, bookingTime, { excludeOrderId = null } = {}) {
  const requestedDate = normalizeBookingDate(bookingDate);
  if (!requestedDate) {
    return {
      ok: false,
      errorCode: 'INVALID_DATE',
      message: 'Invalid booking date.',
      error: 'Invalid booking date.',
    };
  }
  if (requestedDate < getShopLocalClock().date) {
    return {
      ok: false,
      errorCode: 'DATE_IN_PAST',
      message: 'Appointments cannot be booked in the past.',
      error: 'Appointments cannot be booked in the past.',
    };
  }

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

  if (slot.elapsed === true || slot.status === 'ELAPSED') {
    return {
      ok: false,
      errorCode: 'TIME_IN_PAST',
      message: 'Selected time slot has already elapsed.',
      error: 'Selected time slot has already elapsed.',
      slot,
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

  const shopClock = getShopLocalClock();
  const config = await getAvailabilityConfig();
  const daySchedule = getDaySchedule(config.recurringSchedule, normalizedDate);
  const closure = await findClosureForDate(normalizedDate);
  const bookings = await loadActiveBookingsForDate(normalizedDate, excludeOrderId);
  const { bookedCount, bookedCountByTime, bookedTimes } = aggregateBookingsForDate(bookings, normalizedDate);

  const slotsLimit = Math.max(0, Number(daySchedule?.slots || 0));
  const slots = applyElapsedSlotState(
    buildSlotAvailability(daySchedule, bookedCountByTime),
    normalizedDate,
    shopClock
  );
  const slotSummary = summarizeSlotAvailability(slots);
  const remaining = slotSummary.availableSlots;
  const today = shopClock.date;
  const closedBookingRows = applyElapsedSlotState(
    buildSlotAvailability({ open: false, slots: 0 }, bookedCountByTime),
    normalizedDate,
    shopClock
  );

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
      slots: closedBookingRows,
      totalCapacity: 0,
      fullTimes: closedBookingRows.map((slot) => slot.time),
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
      slots: closedBookingRows,
      totalCapacity: 0,
      fullTimes: closedBookingRows.map((slot) => slot.time),
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
      slots: closedBookingRows,
      totalCapacity: 0,
      fullTimes: closedBookingRows.map((slot) => slot.time),
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
      fullTimes: slots
        .filter((slot) => slot.status === 'FULL' || slot.status === 'OVER_CAPACITY')
        .map((slot) => slot.time),
      fullSlots: slotSummary.fullSlots,
      almostFullSlots: slotSummary.almostFullSlots,
      overCapacitySlots: slotSummary.overCapacitySlots,
      overCapacityBy: slotSummary.overCapacityBy,
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
    fullTimes: slots
      .filter((slot) => slot.status === 'FULL' || slot.status === 'OVER_CAPACITY')
      .map((slot) => slot.time),
    fullSlots: slotSummary.fullSlots,
    almostFullSlots: slotSummary.almostFullSlots,
    overCapacitySlots: slotSummary.overCapacitySlots,
    overCapacityBy: slotSummary.overCapacityBy,
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
    return {
      date: resolvedDate,
      isClosed: true,
      closedReason: snapshot.errorCode || 'DATE_UNAVAILABLE',
      bookedSlots: snapshot.bookedCount || 0,
      perSlotCapacity: 0,
      slots: snapshot.slots || [],
      status: 'CLOSED',
    };
  }

  if (snapshot.errorCode === 'INVALID_DATE') {
    return {
      date: resolvedDate,
      isClosed: true,
      closedReason: 'INVALID_DATE',
      bookedSlots: 0,
      perSlotCapacity: 0,
      slots: [],
      status: 'CLOSED',
    };
  }

  const status = snapshot.overCapacitySlots > 0
    ? 'OVER_CAPACITY'
    : snapshot.errorCode === 'DATE_FULL'
      ? 'FULL'
      : 'AVAILABLE';
  return {
    date: resolvedDate,
    isClosed: false,
    bookedSlots: snapshot.bookedCount || 0,
    perSlotCapacity: Math.max(0, Number(snapshot.daySchedule?.slots || 0)),
    totalCapacity: snapshot.totalCapacity || 0,
    availableSlots: snapshot.remaining || 0,
    overCapacitySlots: snapshot.overCapacitySlots || 0,
    overCapacityBy: snapshot.overCapacityBy || 0,
    slots: snapshot.slots || [],
    status,
  };
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
  const shopClock = getShopLocalClock();
  const today = shopClock.date;
  const config = await getAvailabilityConfig();

  const closures = await ScheduledClosure.find({
    fromDate: { $lte: endOfLocalDayFromDateString(endStr) },
    toDate: { $gte: startOfLocalDayFromDateString(startStr) },
  }).lean();

  const activeBookings = await Order.find({
    status: { $in: SLOT_CONSUMING_STATUSES },
    archived: { $ne: true },
    isWalkIn: { $ne: true },
  }).select('bookingDate bookingTime').lean();

  const pendingBookings = await Order.find({
    status: 'pending_confirmation',
    archived: { $ne: true },
    isWalkIn: { $ne: true },
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
      const closedReason = closedByEmergency
        ? 'emergency'
        : closure
          ? 'closure'
          : 'recurring';
      const closureLabel = closure
        ? [closure.reason, closure.note].filter(Boolean).join(' — ')
        : null;
      const bookedSlots = Object.values(bookedByDateTime[dateStr] || {}).reduce(
        (sum, count) => sum + Math.max(0, Number(count || 0)),
        0
      );
      return {
        date: dateStr,
        isClosed: true,
        closedReason,
        closureLabel,
        totalSlots: 0,
        bookedSlots,
        availableSlots: 0,
        /** Max bookings allowed in one time band (admin "Capacity per time slot"). */
        perSlotCapacity: 0,
        /** Smallest remaining seats in any single time band — matches admin number when day is empty. */
        minAvailablePerSlot: 0,
        /** Hour bands in range (e.g. 9 for 08:00–17:00 @ 60m). Client fallback if minAvailablePerSlot missing. */
        timeBandCount: 0,
        fullSlots: 0,
        almostFullSlots: 0,
        overCapacitySlots: 0,
        overCapacityBy: 0,
        pendingCount: pendingByDate[dateStr] || 0,
        status: 'CLOSED',
      };
    }

    const slots = applyElapsedSlotState(
      buildSlotAvailability(daySchedule, bookedByDateTime[dateStr] || {}),
      dateStr,
      shopClock
    );
    const summary = summarizeSlotAvailability(slots);
    const perSlotCapacity = Math.max(0, Number(daySchedule?.slots || 0));
    const stillBookable = slots.filter((s) => Math.max(0, Number(s.available || 0)) > 0);
    const minAvailablePerSlot =
      stillBookable.length > 0
        ? Math.min(...stillBookable.map((s) => Math.max(0, Number(s.available || 0))))
        : 0;
    const timeBandCount = slots.length;

    let status = 'AVAILABLE';
    if (dateStr < shopClock.date) status = 'PAST';
    else if (summary.overCapacitySlots > 0) status = 'OVER_CAPACITY';
    else if (summary.totalCapacity <= 0 || summary.allSlotsFull) status = 'FULL';
    else if (summary.availableSlots / summary.totalCapacity <= 0.2 || summary.almostFullSlots > 0) status = 'ALMOST_FULL';

    return {
      date: dateStr,
      isClosed: false,
      totalSlots: summary.totalCapacity,
      bookedSlots: summary.bookedSlots,
      availableSlots: summary.availableSlots,
      perSlotCapacity,
      minAvailablePerSlot,
      timeBandCount,
      fullSlots: summary.fullSlots,
      almostFullSlots: summary.almostFullSlots,
      overCapacitySlots: summary.overCapacitySlots,
      overCapacityBy: summary.overCapacityBy,
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
  if (!bookingDate || !bookingTime) {
    return {
      ok: false,
      errorCode: 'INVALID_SLOT',
      message: 'Both booking date and booking time are required.',
      error: 'Both booking date and booking time are required.',
    };
  }

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

  // Re-read the canonical Admin schedule after the atomic increment. If an
  // Admin closed/removed/lowered the slot before this linearization point, undo
  // this hold. A later Admin change preserves the reservation already won.
  const currentAvailability = await getTimeSlotAvailability(availability.date, availability.time);
  if (
    !currentAvailability.ok
    || counter.count > Math.max(0, Number(currentAvailability.slot?.capacity || 0))
  ) {
    await releaseBookingSlot(availability.date, availability.time);
    if (!currentAvailability.ok) return currentAvailability;
    return {
      ok: false,
      errorCode: 'SLOT_FULL',
      message: 'Selected time slot is fully booked.',
      error: 'Selected time slot is fully booked.',
      slot: currentAvailability.slot,
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

async function acquireExistingOrderSlotHold(slot, orderId) {
  await syncBookingSlotCounter(slot.date, slot.time, { excludeOrderId: orderId || null });
  await BookingSlotCounter.updateOne(
    { date: slot.date, time: slot.time },
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } }
  );
  return slot;
}

/** Persist an existing lifecycle change while accounting for its new slot hold before save. */
export async function saveOrderWithSlotTransition(order, beforeState, saveOptions = {}) {
  const before = beforeState?.slot !== undefined
    ? beforeState
    : captureOrderSlotOccupancy(beforeState || {});
  const planned = captureOrderSlotOccupancy(order);
  const samePlannedSlot = Boolean(
    before.slot
    && planned.slot
    && before.slot.date === planned.slot.date
    && before.slot.time === planned.slot.time
  );
  let acquiredSlot = null;

  if (planned.occupies && (!before.occupies || !samePlannedSlot)) {
    const reservation = await reserveBookingSlot(planned.slot.date, planned.slot.time);
    if (!reservation.ok) {
      const error = new Error(
        reservation.message || reservation.error || 'Selected time slot is no longer available.'
      );
      error.status = 409;
      error.statusCode = 409;
      error.code = reservation.errorCode || 'SLOT_FULL';
      error.errorCode = error.code;
      error.slotCheck = reservation;
      throw error;
    }
    acquiredSlot = { date: reservation.date, time: reservation.time };
  }

  try {
    await order.save(saveOptions);
  } catch (error) {
    if (acquiredSlot) await releaseBookingSlot(acquiredSlot.date, acquiredSlot.time);
    throw error;
  }

  const after = captureOrderSlotOccupancy(order);
  const acquiredStillApplies = Boolean(
    acquiredSlot
    && after.occupies
    && after.slot?.date === acquiredSlot.date
    && after.slot?.time === acquiredSlot.time
  );
  if (acquiredSlot && !acquiredStillApplies) {
    await releaseBookingSlot(acquiredSlot.date, acquiredSlot.time);
  }

  const sameFinalSlot = Boolean(
    before.slot
    && after.slot
    && before.slot.date === after.slot.date
    && before.slot.time === after.slot.time
  );
  if (before.occupies && (!after.occupies || !sameFinalSlot)) {
    await releaseBookingSlot(before.slot.date, before.slot.time);
  }

  return order;
}

/**
 * Reconcile a persisted lifecycle transition for an existing appointment.
 * This does not admit a new booking; it mirrors the saved Order in the atomic
 * counter, including legitimate over-capacity state after an Admin reduction.
 */
export async function reconcilePersistedOrderSlotTransition(beforeState, orderAfter) {
  const before = beforeState?.slot !== undefined
    ? beforeState
    : captureOrderSlotOccupancy(beforeState || {});
  const after = captureOrderSlotOccupancy(orderAfter || {});
  const sameSlot = Boolean(
    before.slot
    && after.slot
    && before.slot.date === after.slot.date
    && before.slot.time === after.slot.time
  );

  if (before.occupies && (!after.occupies || !sameSlot)) {
    await releaseBookingSlot(before.slot.date, before.slot.time);
  }
  if (after.occupies && (!before.occupies || !sameSlot)) {
    await acquireExistingOrderSlotHold(after.slot, orderAfter?._id);
  }

  return { before, after };
}

/**
 * Counter-safe companion for hard-delete cascades. Call only after the Order
 * deletion succeeds and reports deletedCount > 0. Callers preload the rows, so
 * that result guard prevents a concurrent duplicate cascade from releasing the
 * same counters twice.
 */
export async function releaseBookingSlotsForOrders(orders = []) {
  const grouped = new Map();
  for (const order of orders) {
    if (!orderOccupiesSlot(order?.status, order?.archived, order?.isWalkIn)) continue;
    const key = buildSlotCounterKey(order.bookingDate, order.bookingTime);
    if (!key) continue;
    const id = `${key.date}|${key.time}`;
    grouped.set(id, { ...key, count: (grouped.get(id)?.count || 0) + 1 });
  }

  await Promise.all(
    [...grouped.values()].map(async ({ date, time, count }) => {
      for (let i = 0; i < count; i += 1) {
        await releaseBookingSlot(date, time);
      }
    })
  );
  return { released: [...grouped.values()].reduce((sum, row) => sum + row.count, 0) };
}

/**
 * Atomically delete matching Orders one at a time and release capacity from
 * each document's state at the exact delete point. This avoids stale-preload
 * races with concurrent cancellation, completion, or archiving transitions.
 */
export async function deleteOrdersAndReleaseSlotCounters(filter) {
  if (!filter || typeof filter !== 'object' || Object.keys(filter).length === 0) {
    throw new Error('A scoped Order deletion filter is required.');
  }

  let deletedCount = 0;
  while (true) {
    const deleted = await Order.findOneAndDelete(filter)
      .select('bookingDate bookingTime status archived isWalkIn')
      .lean();
    if (!deleted) break;

    deletedCount += 1;
    await releaseBookingSlotsForOrders([deleted]);
  }

  return { acknowledged: true, deletedCount };
}
