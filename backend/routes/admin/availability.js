import { Router } from 'express';
import mongoose from 'mongoose';
import ShopAvailability, { buildDefaultRecurringSchedule } from '../../models/shopAvailability.model.js';
import ScheduledClosure from '../../models/scheduledClosure.model.js';
import { emitAvailabilityUpdated } from '../../utils/availabilityBroadcast.utils.js';

const router = Router();

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CLOSURE_REASONS = new Set(['Holiday', 'Renovation', 'Emergency', 'Staff Leave', 'Custom']);

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
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
    if (plainEntry && Number.isInteger(plainEntry.dow) && plainEntry.dow >= 0 && plainEntry.dow <= 6) {
      byDow.set(plainEntry.dow, {
        ...defaultsByDow.get(plainEntry.dow),
        ...plainEntry,
      });
    }
  }

  return Array.from({ length: 7 }, (_, dow) => ({
    ...defaultsByDow.get(dow),
    ...(byDow.get(dow) || {}),
    dow,
  }));
}

function validateScheduleInput(schedule, { requireAllDays }) {
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

    if (typeof row.from !== 'string' || !TIME_RE.test(row.from)) {
      return { error: `Schedule row ${i + 1} has invalid "from". Expected HH:MM.` };
    }

    if (typeof row.to !== 'string' || !TIME_RE.test(row.to)) {
      return { error: `Schedule row ${i + 1} has invalid "to". Expected HH:MM.` };
    }

    if (row.open && toMinutes(row.from) >= toMinutes(row.to)) {
      return { error: `Schedule row ${i + 1} must have "from" earlier than "to" when open is true.` };
    }

    const slots = Number(row.slots);
    if (!Number.isFinite(slots) || slots < 0) {
      return { error: `Schedule row ${i + 1} has invalid "slots". Expected a non-negative number.` };
    }

    sanitized.push({
      dow,
      open: row.open,
      from: row.from,
      to: row.to,
      slots,
    });
  }

  if (requireAllDays && seen.size !== 7) {
    return { error: 'Recurring schedule must include all days (dow 0..6).' };
  }

  return {
    schedule: sanitized.sort((a, b) => a.dow - b.dow),
  };
}

function startOfLocalDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function sanitizeClosureInput(input, index = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: `Closure row ${index + 1} must be an object.` };
  }

  if (!input.fromDate || !input.toDate) {
    return { error: `Closure row ${index + 1} requires "fromDate" and "toDate".` };
  }

  const fromDate = startOfLocalDay(input.fromDate);
  const toDate = endOfLocalDay(input.toDate);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return { error: `Closure row ${index + 1} has invalid dates.` };
  }

  if (fromDate > toDate) {
    return { error: `Closure row ${index + 1} must have fromDate <= toDate.` };
  }

  const payload = {
    fromDate,
    toDate,
  };

  if (input.reason != null) {
    if (!CLOSURE_REASONS.has(input.reason)) {
      return { error: `Closure row ${index + 1} has invalid "reason".` };
    }
    payload.reason = input.reason;
  }

  if (input.note != null && typeof input.note !== 'string') {
    return { error: `Closure row ${index + 1} has invalid "note".` };
  }
  if (typeof input.note === 'string') payload.note = input.note;

  return { payload };
}

async function getMergedRecurringSchedule() {
  const doc = await ShopAvailability.findOne().lean();
  return normalizeRecurringSchedule(doc?.recurringSchedule);
}

router.get('/emergency', async (_req, res, next) => {
  try {
    const doc = await ShopAvailability.findOne().lean();
    return res.json({ emergencyClosed: !!doc?.emergencyClosed });
  } catch (err) {
    return next(err);
  }
});

router.patch('/emergency', async (req, res, next) => {
  try {
    const { closed } = req.body || {};
    if (typeof closed !== 'boolean') {
      return res.status(400).json({ error: '"closed" must be a boolean.' });
    }

    const doc = await ShopAvailability.findOneAndUpdate(
      {},
      {
        $set: {
          emergencyClosed: closed,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          recurringSchedule: buildDefaultRecurringSchedule(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    emitAvailabilityUpdated({ type: 'emergency' });
    return res.json({ emergencyClosed: !!doc.emergencyClosed });
  } catch (err) {
    return next(err);
  }
});

router.get('/closures', async (_req, res, next) => {
  try {
    const closures = await ScheduledClosure.find({}).sort({ fromDate: 1 }).lean();
    return res.json(closures);
  } catch (err) {
    return next(err);
  }
});

router.post('/closures', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : [req.body];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'At least one closure is required.' });
    }

    const payloads = [];
    for (let i = 0; i < rows.length; i += 1) {
      const { payload, error } = sanitizeClosureInput(rows[i], i);
      if (error) return res.status(400).json({ error });
      payloads.push(payload);
    }

    if (Array.isArray(req.body)) {
      const created = await ScheduledClosure.insertMany(payloads);
      emitAvailabilityUpdated({ type: 'closures', count: created.length });
      return res.status(201).json(created);
    }

    const created = await ScheduledClosure.create(payloads[0]);
    emitAvailabilityUpdated({ type: 'closure' });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

router.delete('/closures/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid closure id.' });
    }

    const deleted = await ScheduledClosure.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Closure not found.' });
    }

    emitAvailabilityUpdated({ type: 'closure_delete' });
    return res.json({ deleted: true });
  } catch (err) {
    return next(err);
  }
});

router.get('/recurring', async (_req, res, next) => {
  try {
    const recurringSchedule = await getMergedRecurringSchedule();
    return res.json(recurringSchedule);
  } catch (err) {
    return next(err);
  }
});

router.put('/recurring', async (req, res, next) => {
  try {
    const { schedule } = req.body || {};
    const { schedule: normalized, error } = validateScheduleInput(schedule, { requireAllDays: true });
    if (error) return res.status(400).json({ error });

    const doc = await ShopAvailability.findOneAndUpdate(
      {},
      {
        $set: {
          recurringSchedule: normalized,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          emergencyClosed: false,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    emitAvailabilityUpdated({ type: 'recurring' });
    return res.json(normalizeRecurringSchedule(doc.recurringSchedule));
  } catch (err) {
    return next(err);
  }
});

router.get('/hours', async (_req, res, next) => {
  try {
    const recurringSchedule = await getMergedRecurringSchedule();
    return res.json(recurringSchedule);
  } catch (err) {
    return next(err);
  }
});

router.put('/hours', async (req, res, next) => {
  try {
    const { hours } = req.body || {};
    const { schedule: incoming, error } = validateScheduleInput(hours, { requireAllDays: false });
    if (error) return res.status(400).json({ error });

    const current = await getMergedRecurringSchedule();
    const byDow = new Map(current.map((row) => [row.dow, row]));
    for (const row of incoming) {
      byDow.set(row.dow, row);
    }

    const merged = Array.from(byDow.values()).sort((a, b) => a.dow - b.dow);

    const doc = await ShopAvailability.findOneAndUpdate(
      {},
      {
        $set: {
          recurringSchedule: merged,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          emergencyClosed: false,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    emitAvailabilityUpdated({ type: 'hours' });
    return res.json(normalizeRecurringSchedule(doc.recurringSchedule));
  } catch (err) {
    return next(err);
  }
});

export default router;
