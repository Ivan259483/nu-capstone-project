/**
 * businessSettings.model.js
 *
 * Stores dynamic business configuration:
 * - Opening hours per day
 * - Slot duration
 * - Slot capacity (global default + per-slot overrides)
 * - Closed dates
 *
 * Only ONE document exists in the collection (singleton pattern).
 * Use BusinessSettings.getSettings() to retrieve it.
 */

import mongoose from 'mongoose';

const dayHoursSchema = new mongoose.Schema(
  {
    isOpen:  { type: Boolean, default: true },
    open:    { type: String, default: '08:00' },  // 'HH:MM' 24h
    close:   { type: String, default: '18:00' },  // 'HH:MM' 24h
  },
  { _id: false }
);

const customSlotCapacitySchema = new mongoose.Schema(
  {
    date:     { type: String, required: true }, // 'YYYY-MM-DD'
    time:     { type: String, required: true }, // 'HH:MM'
    capacity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const businessSettingsSchema = new mongoose.Schema(
  {
    // ── Business hours by day of week ─────────────────────────────────
    openingHours: {
      monday:    { type: dayHoursSchema, default: () => ({ isOpen: true,  open: '08:00', close: '18:00' }) },
      tuesday:   { type: dayHoursSchema, default: () => ({ isOpen: true,  open: '08:00', close: '18:00' }) },
      wednesday: { type: dayHoursSchema, default: () => ({ isOpen: true,  open: '08:00', close: '18:00' }) },
      thursday:  { type: dayHoursSchema, default: () => ({ isOpen: true,  open: '08:00', close: '18:00' }) },
      friday:    { type: dayHoursSchema, default: () => ({ isOpen: true,  open: '08:00', close: '18:00' }) },
      saturday:  { type: dayHoursSchema, default: () => ({ isOpen: true,  open: '09:00', close: '16:00' }) },
      sunday:    { type: dayHoursSchema, default: () => ({ isOpen: false, open: '09:00', close: '16:00' }) },
    },

    // ── Slot generation ───────────────────────────────────────────────
    slotDuration:        { type: Number, default: 60, min: 15 }, // minutes
    defaultSlotCapacity: { type: Number, default: 1,  min: 1  }, // bookings per slot

    // ── Per date+time overrides ───────────────────────────────────────
    customSlotCapacities: { type: [customSlotCapacitySchema], default: [] },

    // ── Closed dates (no bookings on these days) ──────────────────────
    closedDates: { type: [String], default: [] }, // 'YYYY-MM-DD'
  },
  { timestamps: true }
);

// ── Singleton accessor ────────────────────────────────────────────────────────
businessSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne().lean();
  if (!settings) {
    // Auto-create with defaults on first access
    const doc = await this.create({});
    settings = doc.toObject();
  }
  return settings;
};

const BusinessSettings = mongoose.model('BusinessSettings', businessSettingsSchema);
export default BusinessSettings;
