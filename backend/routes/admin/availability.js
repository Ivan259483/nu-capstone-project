import { Router } from 'express';
import mongoose from 'mongoose';
import ShopAvailability, {
  normalizeRecurringSchedule,
  validateRecurringScheduleInput,
} from '../../models/shopAvailability.model.js';
import ScheduledClosure from '../../models/scheduledClosure.model.js';
import { emitAvailabilityUpdated } from '../../utils/availabilityBroadcast.utils.js';
import { authorize } from '../../middleware/auth.middleware.js';
import { SETTINGS_MANAGER_ROLES } from '../../constants/roles.js';

const router = Router();
const requireAvailabilityAdmin = authorize(...SETTINGS_MANAGER_ROLES);

const CLOSURE_REASONS = new Set(['Holiday', 'Renovation', 'Emergency', 'Staff Leave', 'Custom']);

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
  const doc = await ShopAvailability.getSingleton();
  return normalizeRecurringSchedule(doc.recurringSchedule);
}

router.get('/emergency', async (_req, res, next) => {
  try {
    const doc = await ShopAvailability.getSingleton();
    return res.json({ emergencyClosed: !!doc.emergencyClosed });
  } catch (err) {
    return next(err);
  }
});

router.patch('/emergency', requireAvailabilityAdmin, async (req, res, next) => {
  try {
    const { closed } = req.body || {};
    if (typeof closed !== 'boolean') {
      return res.status(400).json({ error: '"closed" must be a boolean.' });
    }

    const doc = await ShopAvailability.getSingleton();
    doc.emergencyClosed = closed;
    await doc.save();

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

router.post('/closures', requireAvailabilityAdmin, async (req, res, next) => {
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

router.delete('/closures/:id', requireAvailabilityAdmin, async (req, res, next) => {
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

router.put('/recurring', requireAvailabilityAdmin, async (req, res, next) => {
  try {
    const { schedule } = req.body || {};
    const { schedule: normalized, error } = validateRecurringScheduleInput(schedule, { requireAllDays: true });
    if (error) return res.status(400).json({ error });

    const doc = await ShopAvailability.getSingleton();
    doc.recurringSchedule = normalized;
    await doc.save();

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

router.put('/hours', requireAvailabilityAdmin, async (req, res, next) => {
  try {
    const { hours } = req.body || {};
    const { schedule: incoming, error } = validateRecurringScheduleInput(hours, { requireAllDays: false });
    if (error) return res.status(400).json({ error });

    const doc = await ShopAvailability.getSingleton();
    const current = normalizeRecurringSchedule(doc.recurringSchedule);
    const byDow = new Map(current.map((row) => [row.dow, row]));
    for (const row of incoming) {
      byDow.set(row.dow, row);
    }

    const merged = Array.from(byDow.values()).sort((a, b) => a.dow - b.dow);

    doc.recurringSchedule = merged;
    await doc.save();

    emitAvailabilityUpdated({ type: 'hours' });
    return res.json(normalizeRecurringSchedule(doc.recurringSchedule));
  } catch (err) {
    return next(err);
  }
});

export default router;
