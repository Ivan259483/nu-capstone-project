import mongoose from 'mongoose';

export const AVAILABILITY_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const AVAILABILITY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const SHOP_AVAILABILITY_SINGLETON_KEY = 'primary';
export const APPOINTMENT_DURATION_MINUTES = 60;

/** Cold start is intentionally fail-closed until an Admin saves availability. */
export const buildDefaultRecurringSchedule = () => Array.from({ length: 7 }, (_, dow) => ({
  dow,
  open: false,
  from: '00:00',
  to: '00:00',
  slots: 0,
}));

function toMinutes(hhmm) {
  const [hour, minute] = String(hhmm || '').split(':').map(Number);
  return hour * 60 + minute;
}

export function countCompleteAppointmentStarts(from, to, duration = APPOINTMENT_DURATION_MINUTES) {
  if (!AVAILABILITY_TIME_RE.test(String(from || '')) || !AVAILABILITY_TIME_RE.test(String(to || ''))) {
    return 0;
  }
  const windowMinutes = toMinutes(to) - toMinutes(from);
  const safeDuration = Number.isInteger(duration) && duration > 0
    ? duration
    : APPOINTMENT_DURATION_MINUTES;
  return windowMinutes > 0 ? Math.floor(windowMinutes / safeDuration) : 0;
}

export function normalizeRecurringSchedule(schedule) {
  const source = Array.isArray(schedule) ? schedule : [];
  const byDow = new Map();

  for (const entry of source) {
    const plainEntry = typeof entry?.toObject === 'function' ? entry.toObject() : entry;
    if (
      !plainEntry
      || !Number.isInteger(plainEntry.dow)
      || plainEntry.dow < 0
      || plainEntry.dow > 6
    ) continue;

    const validOpen = typeof plainEntry.open === 'boolean';
    const validFrom = typeof plainEntry.from === 'string' && AVAILABILITY_TIME_RE.test(plainEntry.from);
    const validTo = typeof plainEntry.to === 'string' && AVAILABILITY_TIME_RE.test(plainEntry.to);
    const validSlots = Number.isInteger(plainEntry.slots) && plainEntry.slots >= 0;
    const validHours = validFrom && validTo && toMinutes(plainEntry.from) < toMinutes(plainEntry.to);
    const validRow = validOpen && validHours && validSlots;

    byDow.set(plainEntry.dow, {
      dow: plainEntry.dow,
      open: validRow ? plainEntry.open : false,
      from: validFrom ? plainEntry.from : '00:00',
      to: validTo ? plainEntry.to : '00:00',
      slots: validSlots ? plainEntry.slots : 0,
    });
  }

  return Array.from({ length: 7 }, (_, dow) => ({
    ...(byDow.get(dow) || { dow, open: false, from: '00:00', to: '00:00', slots: 0 }),
  }));
}

/**
 * Validate and sanitize the recurring availability payload shared by every
 * compatibility/admin write path. `slots` is the maximum number of active
 * appointments admitted for the day. Operating hours generate the concrete
 * one-customer appointment times independently.
 */
export function validateRecurringScheduleInput(schedule, { requireAllDays = true } = {}) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { error: 'Schedule must be a non-empty array.' };
  }

  const seen = new Set();
  const sanitized = [];

  for (let i = 0; i < schedule.length; i += 1) {
    const row = schedule[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { error: `Schedule row ${i + 1} must be an object.` };
    }

    const dow = Number(row.dow);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return { error: `Schedule row ${i + 1} has invalid dow. Expected 0..6.` };
    }
    if (seen.has(dow)) {
      return { error: `Schedule has duplicate dow ${dow}.` };
    }
    seen.add(dow);

    if (typeof row.open !== 'boolean') {
      return { error: `Schedule row ${i + 1} must include boolean "open".` };
    }
    if (typeof row.from !== 'string' || !AVAILABILITY_TIME_RE.test(row.from)) {
      return { error: `Schedule row ${i + 1} has invalid "from". Expected HH:MM.` };
    }
    if (typeof row.to !== 'string' || !AVAILABILITY_TIME_RE.test(row.to)) {
      return { error: `Schedule row ${i + 1} has invalid "to". Expected HH:MM.` };
    }
    if (row.open && toMinutes(row.from) >= toMinutes(row.to)) {
      return { error: `Schedule row ${i + 1} must have "from" earlier than "to" when open is true.` };
    }

    const slots = Number(row.slots);
    if (!Number.isInteger(slots) || slots < 0) {
      return { error: `Schedule row ${i + 1} has invalid "slots". Expected a non-negative integer.` };
    }
    if (row.open && slots < 1) {
      return { error: `Schedule row ${i + 1} must allow at least one daily appointment when open is true.` };
    }
    if (row.open) {
      const appointmentStarts = countCompleteAppointmentStarts(row.from, row.to);
      if (appointmentStarts < 1) {
        return { error: `Schedule row ${i + 1} must contain at least one complete 60-minute appointment.` };
      }
      if (slots > appointmentStarts) {
        return {
          error: `Schedule row ${i + 1} daily capacity cannot exceed ${appointmentStarts} appointment time${appointmentStarts === 1 ? '' : 's'} within its operating hours.`,
        };
      }
    }

    sanitized.push({ dow, open: row.open, from: row.from, to: row.to, slots });
  }

  if (requireAllDays && seen.size !== 7) {
    return { error: 'Recurring schedule must include all days (dow 0..6).' };
  }

  return { schedule: sanitized.sort((a, b) => a.dow - b.dow) };
}

const recurringScheduleSchema = new mongoose.Schema(
  {
    dow: { type: Number, required: true, min: 0, max: 6 },
    open: { type: Boolean, required: true },
    from: { type: String, required: true, match: AVAILABILITY_TIME_RE },
    to: { type: String, required: true, match: AVAILABILITY_TIME_RE },
    slots: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Daily appointment slots must be a non-negative integer.',
      },
    },
  },
  { _id: false }
);

const shopAvailabilitySchema = new mongoose.Schema(
  {
    // Legacy deployments may contain more than one unkeyed row. Exactly one
    // deterministic row is promoted to this key; the others are preserved but
    // ignored so migration never destroys an administrator's historical data.
    singletonKey: { type: String, trim: true },
    // Legacy clients may still inspect this flag, but all effective closure
    // decisions are derived from emergencyClosureDate + the business clock.
    emergencyClosed: { type: Boolean, default: false },
    emergencyClosureDate: {
      type: String,
      default: null,
      trim: true,
      match: AVAILABILITY_DATE_RE,
    },
    recurringSchedule: {
      type: [recurringScheduleSchema],
      default: undefined,
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: 'version', optimisticConcurrency: true }
);

shopAvailabilitySchema.index(
  { singletonKey: 1 },
  {
    unique: true,
    partialFilterExpression: { singletonKey: { $type: 'string' } },
    name: 'uniq_shop_availability_singleton_key',
  }
);

shopAvailabilitySchema.pre('save', function syncUpdatedAt(next) {
  this.updatedAt = new Date();
  next();
});

shopAvailabilitySchema.statics.getSingleton = async function getSingleton() {
  // Do not allow the first concurrent requests to race an unindexed upsert.
  await this.init();
  const canonicalFilter = { singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY };
  let doc = await this.findOne(canonicalFilter).sort({ _id: 1 });
  if (doc) return doc;

  // Promote the most recently edited legacy row. `_id` is a stable tie-breaker
  // so every process selects the same candidate during a rolling deployment.
  const legacy = await this.findOne({
    $or: [
      { singletonKey: { $exists: false } },
      { singletonKey: null },
    ],
  }).sort({ updatedAt: -1, _id: 1 });

  if (legacy) {
    try {
      doc = await this.findOneAndUpdate(
        {
          _id: legacy._id,
          $or: [
            { singletonKey: { $exists: false } },
            { singletonKey: null },
          ],
        },
        { $set: canonicalFilter },
        { new: true }
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    if (doc) return doc;
    doc = await this.findOne(canonicalFilter).sort({ _id: 1 });
    if (doc) return doc;
  }

  try {
    doc = await this.findOneAndUpdate(
      canonicalFilter,
      {
        $setOnInsert: {
          singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY,
          emergencyClosed: false,
          emergencyClosureDate: null,
          recurringSchedule: buildDefaultRecurringSchedule(),
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // A concurrent first request may win the unique-key upsert.
    if (error?.code !== 11000) throw error;
    doc = await this.findOne(canonicalFilter).sort({ _id: 1 });
  }

  if (!doc) throw new Error('Unable to initialize the canonical shop availability configuration.');
  return doc;
};

const ShopAvailability = mongoose.model('ShopAvailability', shopAvailabilitySchema);
export default ShopAvailability;
