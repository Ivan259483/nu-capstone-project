/**
 * slot.controller.js
 *
 * Handles all /api/slots endpoints.
 * Delegates all logic to slot.service.js.
 */

import { getSlotsForDate, getSlotsForRange } from '../services/slot.service.js';
import ShopAvailability, {
  normalizeRecurringSchedule,
  validateRecurringScheduleInput,
} from '../models/shopAvailability.model.js';
import { emitAvailabilityUpdated } from '../utils/availabilityBroadcast.utils.js';

const FIXED_SLOT_DURATION_MINUTES = 60;
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const toLegacySettingsPayload = (schedule) => {
  const recurringSchedule = normalizeRecurringSchedule(schedule);
  const openingHours = {};
  for (const row of recurringSchedule) {
    openingHours[DAY_NAMES[row.dow]] = {
      isOpen: row.open,
      open: row.from,
      close: row.to,
      capacityPerSlot: row.slots,
    };
  }

  const openCapacities = [...new Set(
    recurringSchedule.filter((row) => row.open).map((row) => row.slots)
  )];
  return {
    source: 'ShopAvailability',
    openingHours,
    recurringSchedule,
    slotDuration: FIXED_SLOT_DURATION_MINUTES,
    defaultSlotCapacity: openCapacities.length === 1 ? openCapacities[0] : null,
  };
};

// ── GET /api/slots?date=YYYY-MM-DD ────────────────────────────────────────────
export const getSlotsByDate = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Query param ?date=YYYY-MM-DD is required.',
      });
    }

    const result = await getSlotsForDate(date);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/slots/range?start=YYYY-MM-DD&end=YYYY-MM-DD ─────────────────────
export const getSlotsByRange = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!start || !end || !dateRe.test(start) || !dateRe.test(end)) {
      return res.status(400).json({
        success: false,
        message: 'Query params ?start=YYYY-MM-DD&end=YYYY-MM-DD are required.',
      });
    }

    if (start > end) {
      return res.status(400).json({ success: false, message: '`start` must be before or equal to `end`.' });
    }

    // Cap range to 62 days (2 months) to prevent abuse
    const startMs = new Date(start).getTime();
    const endMs   = new Date(end).getTime();
    const daysDiff = (endMs - startMs) / (1000 * 60 * 60 * 24);
    if (daysDiff > 62) {
      return res.status(400).json({ success: false, message: 'Date range cannot exceed 62 days.' });
    }

    const summary = await getSlotsForRange(start, end);
    return res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/slots/settings ───────────────────────────────────────────────────
// Public, occupancy-free projection for marketing/contact pages.
export const getPublicAvailabilitySchedule = async (_req, res, next) => {
  try {
    const availability = await ShopAvailability.getSingleton();
    const data = normalizeRecurringSchedule(availability.recurringSchedule).map((row) => ({
      dow: row.dow,
      open: row.open,
      from: row.from,
      to: row.to,
    }));
    return res.json({
      success: true,
      data,
      slotDurationMinutes: FIXED_SLOT_DURATION_MINUTES,
      updatedAt: availability.updatedAt || null,
    });
  } catch (err) {
    next(err);
  }
};

export const getBusinessSettings = async (req, res, next) => {
  try {
    const settings = await ShopAvailability.getSingleton();
    return res.json({ success: true, data: toLegacySettingsPayload(settings.recurringSchedule) });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/slots/settings ─────────────────────────────────────────────────
// Admin-only — update opening hours, slot duration, capacity, closed dates
export const updateBusinessSettings = async (req, res, next) => {
  try {
    const {
      openingHours,
      recurringSchedule: recurringInput,
      slotDuration,
      defaultSlotCapacity,
      customSlotCapacities,
      closedDates,
    } = req.body || {};

    if (slotDuration != null && Number(slotDuration) !== FIXED_SLOT_DURATION_MINUTES) {
      return res.status(400).json({
        success: false,
        message: 'Appointment intervals are fixed at 60 minutes. Configure hours and per-slot capacity in Availability Controls.',
      });
    }
    if (customSlotCapacities != null) {
      return res.status(400).json({
        success: false,
        message: 'Per-date capacity overrides are retired. Availability Controls is the authoritative recurring schedule.',
      });
    }
    if (closedDates != null) {
      return res.status(400).json({
        success: false,
        message: 'Use Admin Availability Controls scheduled closures for closed dates.',
      });
    }

    const doc = await ShopAvailability.getSingleton();
    let schedule = normalizeRecurringSchedule(doc.recurringSchedule);

    if (recurringInput != null) {
      const { schedule: validated, error } = validateRecurringScheduleInput(recurringInput, { requireAllDays: true });
      if (error) return res.status(400).json({ success: false, message: error });
      schedule = validated;
    }

    if (openingHours && typeof openingHours === 'object' && !Array.isArray(openingHours)) {
      schedule = schedule.map((row) => {
        const incoming = openingHours[DAY_NAMES[row.dow]];
        if (!incoming || typeof incoming !== 'object') return row;
        const capacity = incoming.capacityPerSlot ?? incoming.slots ?? row.slots;
        return {
          ...row,
          open: typeof incoming.isOpen === 'boolean' ? incoming.isOpen : row.open,
          from: typeof incoming.open === 'string'
            ? incoming.open
            : typeof incoming.from === 'string' ? incoming.from : row.from,
          to: typeof incoming.close === 'string'
            ? incoming.close
            : typeof incoming.to === 'string' ? incoming.to : row.to,
          slots: Number(capacity),
        };
      });
    }

    if (defaultSlotCapacity != null) {
      const capacity = Number(defaultSlotCapacity);
      schedule = schedule.map((row) => (row.open ? { ...row, slots: capacity } : row));
    }

    const { schedule: validated, error } = validateRecurringScheduleInput(schedule, { requireAllDays: true });
    if (error) return res.status(400).json({ success: false, message: error });

    doc.recurringSchedule = validated;
    await doc.save();
    emitAvailabilityUpdated({ type: 'legacy_settings_alias' });
    return res.json({ success: true, data: toLegacySettingsPayload(doc.recurringSchedule) });
  } catch (err) {
    next(err);
  }
};
