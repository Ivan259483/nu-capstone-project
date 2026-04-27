/**
 * slot.controller.js
 *
 * Handles all /api/slots endpoints.
 * Delegates all logic to slot.service.js.
 */

import { getSlotsForDate, getSlotsForRange } from '../services/slot.service.js';
import BusinessSettings from '../models/businessSettings.model.js';

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
export const getBusinessSettings = async (req, res, next) => {
  try {
    const settings = await BusinessSettings.getSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/slots/settings ─────────────────────────────────────────────────
// Admin-only — update opening hours, slot duration, capacity, closed dates
export const updateBusinessSettings = async (req, res, next) => {
  try {
    const { openingHours, slotDuration, defaultSlotCapacity, customSlotCapacities, closedDates } = req.body;

    const settings = await BusinessSettings.findOne();
    const doc = settings || new BusinessSettings();

    if (openingHours)           doc.openingHours = openingHours;
    if (slotDuration != null)   doc.slotDuration = slotDuration;
    if (defaultSlotCapacity != null) doc.defaultSlotCapacity = defaultSlotCapacity;
    if (customSlotCapacities)   doc.customSlotCapacities = customSlotCapacities;
    if (closedDates)            doc.closedDates = closedDates;

    await doc.save();
    return res.json({ success: true, data: doc.toObject() });
  } catch (err) {
    next(err);
  }
};
