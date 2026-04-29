/**
 * slot.service.js
 *
 * Core slot generation and availability computation.
 * This is the single source of truth for all slot logic —
 * used by both the slot controller and the booking/approval validators.
 */

import BusinessSettings from '../models/businessSettings.model.js';
import Order from '../models/order.model.js';

// ── Day name map ──────────────────────────────────────────────────────────────
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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

/**
 * normalizeBookingTime(timeStr)
 *
 * Converts ANY booking time string to 24-hour HH:MM so it can be matched
 * against the slot engine's generated keys.
 *
 * Handles:
 *   '09:00'    → '09:00'  (already correct)
 *   '9:00 AM'  → '09:00'
 *   '10:00 AM' → '10:00'
 *   '12:00 PM' → '12:00'
 *   '3:00 PM'  → '15:00'
 *   '12:00 AM' → '00:00'
 */
function normalizeBookingTime(timeStr) {
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
      if (h === 12) h = 0;      // 12:xx AM → 0:xx
    } else {
      if (h !== 12) h += 12;   // 1:xx PM → 13:xx, but 12:xx PM stays 12
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null; // unrecognised format — skip this booking's time
}

/**
 * normalizeBookingDate(dateStr)
 *
 * Converts a booking date to YYYY-MM-DD regardless of the original format.
 *
 * Handles:
 *   '2026-04-15'  → '2026-04-15' (already correct)
 *   'Apr 15, 2026' → '2026-04-15'
 */
function normalizeBookingDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Parse anything else via Date (handles 'Apr 15, 2026', 'April 15 2026', etc.)
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  // Use local date parts to avoid UTC shift
  const y = parsed.getFullYear();
  const mo = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * generateTimeSlots(dayConfig, slotDuration)
 * Returns an ordered array of 'HH:MM' strings for a given day's config.
 * Returns [] if the day is closed.
 */
export function generateTimeSlots(dayConfig, slotDuration) {
  if (!dayConfig?.isOpen) return [];
  const openMin = toMinutes(dayConfig.open);
  const closeMin = toMinutes(dayConfig.close);
  const slots = [];
  for (let t = openMin; t < closeMin; t += slotDuration) {
    slots.push(fromMinutes(t));
  }
  return slots;
}

/**
 * getSlotsForDate(dateStr)
 *
 * Returns full slot availability for a single YYYY-MM-DD date.
 * Shape: {
 *   date, isClosed,
 *   slots: [{ time, capacity, booked, available, status }]
 * }
 *
 * Status values:
 *   AVAILABLE   — booked < capacity
 *   ALMOST_FULL — booked/capacity >= 0.8 but < 1.0
 *   FULL        — booked >= capacity
 *   CLOSED      — day is closed
 */
export async function getSlotsForDate(dateStr) {
  const settings = await BusinessSettings.getSettings();

  // ── Is this a manually closed date? ──────────────────────────────────
  if (settings.closedDates.includes(dateStr)) {
    return { date: dateStr, isClosed: true, slots: [] };
  }

  // ── Get day of week ───────────────────────────────────────────────────
  // Parse as local date to avoid UTC shift
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayName = DAY_NAMES[dateObj.getDay()];
  const dayConfig = settings.openingHours?.[dayName];

  if (!dayConfig?.isOpen) {
    return { date: dateStr, isClosed: true, slots: [] };
  }

  // ── Generate time slots ───────────────────────────────────────────────
  const times = generateTimeSlots(dayConfig, settings.slotDuration);

  if (times.length === 0) {
    return { date: dateStr, isClosed: true, slots: [] };
  }

  // ── Fetch bookings for this date in ONE query ─────────────────────────
  // Include both ISO (2026-04-15) and legacy human-readable (Apr 15, 2026) formats
  const bookings = await Order.find({
    $or: [
      { bookingDate: dateStr },
      { bookingDate: { $regex: new RegExp(dateStr.replace(/-/g, '.*'), 'i') } },
    ],
    status: { $in: SLOT_CONSUMING_STATUSES },
  }).select('bookingDate bookingTime').lean();

  // Count bookings per time slot — normalise both date AND time format
  const bookedCountByTime = {};
  for (const b of bookings) {
    const normDate = normalizeBookingDate(b.bookingDate);
    if (normDate !== dateStr) continue; // skip if date doesn't actually match
    const normTime = normalizeBookingTime(b.bookingTime);
    if (!normTime) continue;
    bookedCountByTime[normTime] = (bookedCountByTime[normTime] || 0) + 1;
  }

  // Build custom capacity lookup: 'time' → capacity
  const customCapMap = {};
  for (const cc of (settings.customSlotCapacities || [])) {
    if (cc.date === dateStr) {
      customCapMap[cc.time] = cc.capacity;
    }
  }

  // ── Build slot array ──────────────────────────────────────────────────
  const slots = times.map((time) => {
    const capacity = customCapMap[time] ?? settings.defaultSlotCapacity;
    const booked = bookedCountByTime[time] || 0;
    const available = Math.max(0, capacity - booked);
    const ratio = capacity > 0 ? booked / capacity : 1;

    let status;
    if (booked >= capacity) status = 'FULL';
    else if (ratio >= 0.8) status = 'ALMOST_FULL';
    else status = 'AVAILABLE';

    return { time, capacity, booked, available, status };
  });

  return { date: dateStr, isClosed: false, slots };
}

/**
 * getSlotsForRange(startStr, endStr)
 *
 * Returns a summary array for each date in the range.
 * Optimised: fetches all bookings for the range in ONE query.
 *
 * Shape: [{
 *   date, isClosed, totalSlots, bookedSlots,
 *   availableSlots, almostFullSlots, fullSlots,
 *   pendingCount, status
 * }]
 */
export async function getSlotsForRange(startStr, endStr) {
  const settings = await BusinessSettings.getSettings();

  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const startDate = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);

  // Collect all dates in the range
  const dates = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(d.toLocaleDateString('en-CA')); // YYYY-MM-DD
  }

  // Fetch all bookings in the date range in one query
  // Include both ISO (2026-04-15) and legacy human-readable (Apr 15, 2026) formats
  const bookings = await Order.find({
    status: { $in: SLOT_CONSUMING_STATUSES },
  }).select('bookingDate bookingTime status').lean();

  // Also get pending counts (a subset of SLOT_CONSUMING)
  const pendingBookings = await Order.find({
    status: 'pending_confirmation',
  }).select('bookingDate').lean();

  // Group booked slots by date — normalise both date AND time on the fly
  const bookedByDate = {};
  for (const b of bookings) {
    const normDate = normalizeBookingDate(b.bookingDate);
    if (!normDate || !dates.includes(normDate)) continue; // outside requested range
    if (!bookedByDate[normDate]) bookedByDate[normDate] = [];
    bookedByDate[normDate].push(normalizeBookingTime(b.bookingTime)); // normalised 24-hr time
  }

  // Group pending by date — normalise date
  const pendingByDate = {};
  for (const b of pendingBookings) {
    const normDate = normalizeBookingDate(b.bookingDate);
    if (!normDate || !dates.includes(normDate)) continue;
    pendingByDate[normDate] = (pendingByDate[normDate] || 0) + 1;
  }

  const customCapMap = {};
  for (const cc of (settings.customSlotCapacities || [])) {
    if (!customCapMap[cc.date]) customCapMap[cc.date] = {};
    customCapMap[cc.date][cc.time] = cc.capacity;
  }

  return dates.map((dateStr) => {
    // Check closed
    if (settings.closedDates.includes(dateStr)) {
      return { date: dateStr, isClosed: true, totalSlots: 0, bookedSlots: 0, availableSlots: 0, fullSlots: 0, almostFullSlots: 0, pendingCount: 0, status: 'CLOSED' };
    }

    const [yr, mo, dy] = dateStr.split('-').map(Number);
    const dayName = DAY_NAMES[new Date(yr, mo - 1, dy).getDay()];
    const dayConfig = settings.openingHours?.[dayName];

    if (!dayConfig?.isOpen) {
      return { date: dateStr, isClosed: true, totalSlots: 0, bookedSlots: 0, availableSlots: 0, fullSlots: 0, almostFullSlots: 0, pendingCount: 0, status: 'CLOSED' };
    }

    const times = generateTimeSlots(dayConfig, settings.slotDuration);
    const bookedTimesArr = bookedByDate[dateStr] || [];

    // Count bookings per time
    const countByTime = {};
    for (const t of bookedTimesArr) {
      if (t) countByTime[t] = (countByTime[t] || 0) + 1;
    }

    let fullSlots = 0, almostFullSlots = 0, availableSlots = 0, totalBooked = 0;
    for (const time of times) {
      const cap = customCapMap[dateStr]?.[time] ?? settings.defaultSlotCapacity;
      const booked = countByTime[time] || 0;
      totalBooked += booked;
      const ratio = cap > 0 ? booked / cap : 1;
      if (booked >= cap) fullSlots++;
      else if (ratio >= 0.8) almostFullSlots++;
      else availableSlots++;
    }

    const totalSlots = times.length;

    let status;
    if (totalSlots === 0) status = 'CLOSED';
    else if (fullSlots === totalSlots) status = 'FULL';
    else if (almostFullSlots + fullSlots >= Math.ceil(totalSlots * 0.8)) status = 'ALMOST_FULL';
    else status = 'AVAILABLE';

    return {
      date: dateStr,
      isClosed: false,
      totalSlots,
      bookedSlots: totalBooked,
      availableSlots,
      almostFullSlots,
      fullSlots,
      pendingCount: pendingByDate[dateStr] || 0,
      status,
    };
  });
}

/**
 * validateSlotAvailability(bookingDate, bookingTime, excludeOrderId?)
 *
 * Atomically checks if a slot can accept ONE more booking.
 * Returns { ok: true } or { ok: false, errorCode, message }.
 *
 * excludeOrderId — when approving an existing booking that is still
 *   'pending_confirmation', pass its _id so it is not double-counted
 *   against the capacity it is about to occupy.
 */
export async function validateSlotAvailability(bookingDate, bookingTime, excludeOrderId = null) {
  if (!bookingDate || !bookingTime) return { ok: true }; // no slot constraint

  const settings = await BusinessSettings.getSettings();

  // Normalise inputs so '9:00 AM' / 'Apr 15, 2026' are handled correctly
  const normDate = normalizeBookingDate(bookingDate) || bookingDate;
  const normTime = normalizeBookingTime(bookingTime) || bookingTime;

  // Check closed dates
  if (settings.closedDates.includes(normDate)) {
    return { ok: false, errorCode: 'SLOT_CLOSED', message: 'The business is closed on this date.' };
  }

  // Check day open
  const [yr, mo, dy] = normDate.split('-').map(Number);
  const dayName = DAY_NAMES[new Date(yr, mo - 1, dy).getDay()];
  if (!settings.openingHours?.[dayName]?.isOpen) {
    return { ok: false, errorCode: 'SLOT_CLOSED', message: 'The business is closed on this day.' };
  }

  // Get effective capacity for this specific slot (normalise stored custom capacities too)
  const customCap = (settings.customSlotCapacities || []).find(
    cc => (normalizeBookingDate(cc.date) || cc.date) === normDate
       && (normalizeBookingTime(cc.time) || cc.time) === normTime
  );
  const capacity = customCap ? customCap.capacity : settings.defaultSlotCapacity;

  // Atomic count of active bookings in this slot.
  // Count both the normalised time AND the raw time to catch legacy records
  // stored as '9:00 AM' when the incoming time is already '09:00'.
  const timeVariants = [...new Set([normTime, bookingTime])].filter(Boolean);
  const dateVariants = [...new Set([normDate, bookingDate])].filter(Boolean);
  const countQuery = {
    bookingDate: { $in: dateVariants },
    bookingTime: { $in: timeVariants },
    status: { $in: SLOT_CONSUMING_STATUSES },
    ...(excludeOrderId ? { _id: { $ne: excludeOrderId } } : {}),
  };
  const activeCount = await Order.countDocuments(countQuery);

  if (activeCount >= capacity) {
    return {
      ok: false,
      errorCode: 'SLOT_FULL',
      message: 'Slot is no longer available. Please select another time.',
    };
  }

  return { ok: true, remaining: capacity - activeCount };
}

