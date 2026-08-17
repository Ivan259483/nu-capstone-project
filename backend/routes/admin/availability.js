import { Router } from 'express';
import mongoose from 'mongoose';
import ShopAvailability, {
  normalizeRecurringSchedule,
  validateRecurringScheduleInput,
} from '../../models/shopAvailability.model.js';
import ScheduledClosure from '../../models/scheduledClosure.model.js';
import { emitAvailabilityUpdated } from '../../utils/availabilityBroadcast.utils.js';
import {
  getBusinessClock,
  getEffectiveEmergencyClosureState,
} from '../../utils/businessAvailability.utils.js';
import { logActivity } from '../../utils/logActivity.utils.js';
import { authorize } from '../../middleware/auth.middleware.js';
import { SETTINGS_MANAGER_ROLES } from '../../constants/roles.js';
import {
  buildAdminDeepLink,
  buildAdminGroupingKey,
  createAdminNotification,
} from '../../services/adminNotification.service.js';

const router = Router();
const requireAvailabilityAdmin = authorize(...SETTINGS_MANAGER_ROLES);

const CLOSURE_REASONS = new Set(['Holiday', 'Renovation', 'Emergency', 'Staff Leave', 'Custom']);

async function notifyAvailabilityChange({
  event,
  title,
  message,
  severity = 'info',
  actionRequired = false,
  groupingIdentity = [],
  metadata = {},
}) {
  try {
    const link = buildAdminDeepLink('availability');
    await createAdminNotification({
      category: 'appointments',
      event,
      severity,
      title,
      message,
      source: 'Availability Controls',
      actionRequired,
      groupingKey: buildAdminGroupingKey('appointments', event, groupingIdentity),
      groupingWindowMs: 30 * 60 * 1000,
      link,
      action: { label: 'Review availability', link },
      metadata,
    });
  } catch (error) {
    console.warn('[availability] Admin notification failed:', error.message);
  }
}

function startOfLocalDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatLocalDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function toEmergencyResponse(state) {
  return {
    emergencyClosed: state.emergencyClosed,
    emergencyClosureDate: state.emergencyClosureDate,
    affectedBusinessDate: state.affectedBusinessDate,
    businessDate: state.businessDate,
    timeZone: state.businessTimeZone,
    businessTimeZone: state.businessTimeZone,
  };
}

router.get('/emergency', async (_req, res, next) => {
  try {
    const [doc, businessClock] = await Promise.all([
      ShopAvailability.getSingleton(),
      getBusinessClock(),
    ]);
    return res.json(toEmergencyResponse(
      getEffectiveEmergencyClosureState(doc, businessClock)
    ));
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

    const [doc, businessClock] = await Promise.all([
      ShopAvailability.getSingleton(),
      getBusinessClock(),
    ]);
    const previousState = getEffectiveEmergencyClosureState(doc, businessClock);
    const actionBusinessDate = closed
      ? businessClock.date
      : previousState.affectedBusinessDate || businessClock.date;

    doc.emergencyClosed = closed;
    doc.emergencyClosureDate = closed ? businessClock.date : null;
    await doc.save();

    const state = getEffectiveEmergencyClosureState(doc, businessClock);
    emitAvailabilityUpdated({
      type: 'emergency',
      dates: [actionBusinessDate],
      emergencyClosed: state.emergencyClosed,
      affectedBusinessDate: actionBusinessDate,
      businessDate: state.businessDate,
      businessTimeZone: state.businessTimeZone,
    });

    const action = closed ? 'Emergency Closure Enabled' : 'Emergency Closure Disabled';
    await logActivity({
      req,
      type: 'settings',
      module: 'Settings',
      action,
      description: `${req.user?.name || 'Admin'} ${closed ? 'enabled' : 'disabled'} emergency closure for business date ${actionBusinessDate}.`,
      status: closed ? 'warning' : 'info',
      metadata: {
        emergencyClosed: closed,
        affectedBusinessDate: actionBusinessDate,
        businessDate: state.businessDate,
        businessTimeZone: state.businessTimeZone,
      },
    });

    await notifyAvailabilityChange({
      event: closed ? 'emergency_closure_enabled' : 'emergency_closure_disabled',
      title: closed ? 'Emergency closure enabled' : 'Emergency closure disabled',
      message: closed
        ? `Customer bookings are blocked for ${actionBusinessDate} until the emergency closure is removed.`
        : `Customer booking availability for ${actionBusinessDate} has been restored.`,
      severity: closed ? 'critical' : 'success',
      actionRequired: closed,
      groupingIdentity: [actionBusinessDate],
      metadata: {
        emergencyClosed: closed,
        affectedBusinessDate: actionBusinessDate,
        businessDate: state.businessDate,
        businessTimeZone: state.businessTimeZone,
        changedBy: req.user?.name || req.user?.email || 'Admin',
      },
    });

    return res.json(toEmergencyResponse(state));
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
      const firstDate = formatLocalDate(payloads[0].fromDate);
      const lastDate = formatLocalDate(payloads[payloads.length - 1].toDate);
      await notifyAvailabilityChange({
        event: 'scheduled_closure_added',
        title: `${created.length} scheduled closures added`,
        message: `Booking availability was blocked for ${created.length} scheduled closure periods from ${firstDate} through ${lastDate}.`,
        severity: 'warning',
        actionRequired: true,
        groupingIdentity: [firstDate, lastDate],
        metadata: {
          closureIds: created.map((closure) => closure._id),
          count: created.length,
          fromDate: firstDate,
          toDate: lastDate,
          changedBy: req.user?.name || req.user?.email || 'Admin',
        },
      });
      return res.status(201).json(created);
    }

    const created = await ScheduledClosure.create(payloads[0]);
    emitAvailabilityUpdated({ type: 'closure' });
    const fromDate = formatLocalDate(created.fromDate);
    const toDate = formatLocalDate(created.toDate);
    await notifyAvailabilityChange({
      event: 'scheduled_closure_added',
      title: 'Scheduled closure added',
      message: `${created.reason || 'Scheduled closure'} blocks customer booking availability from ${fromDate} through ${toDate}.`,
      severity: 'warning',
      actionRequired: true,
      groupingIdentity: [created._id],
      metadata: {
        closureId: created._id,
        fromDate,
        toDate,
        reason: created.reason || null,
        note: created.note || null,
        changedBy: req.user?.name || req.user?.email || 'Admin',
      },
    });
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
    const fromDate = formatLocalDate(deleted.fromDate);
    const toDate = formatLocalDate(deleted.toDate);
    await notifyAvailabilityChange({
      event: 'scheduled_closure_removed',
      title: 'Scheduled closure removed',
      message: `Booking availability was restored for ${fromDate} through ${toDate}.`,
      severity: 'success',
      actionRequired: false,
      groupingIdentity: [deleted._id],
      metadata: {
        closureId: deleted._id,
        fromDate,
        toDate,
        reason: deleted.reason || null,
        changedBy: req.user?.name || req.user?.email || 'Admin',
      },
    });
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
    await notifyAvailabilityChange({
      event: 'availability_controls_changed',
      title: 'Recurring availability updated',
      message: `${req.user?.name || 'An admin'} changed the recurring appointment schedule.`,
      severity: 'info',
      groupingIdentity: ['recurring'],
      metadata: {
        updatedDays: normalized.map((row) => row.dow),
        changedBy: req.user?.name || req.user?.email || 'Admin',
      },
    });
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
    await notifyAvailabilityChange({
      event: 'availability_controls_changed',
      title: 'Appointment hours updated',
      message: `${req.user?.name || 'An admin'} changed appointment hours or daily capacity.`,
      severity: 'info',
      groupingIdentity: ['hours'],
      metadata: {
        updatedDays: incoming.map((row) => row.dow),
        changedBy: req.user?.name || req.user?.email || 'Admin',
      },
    });
    return res.json(normalizeRecurringSchedule(doc.recurringSchedule));
  } catch (err) {
    return next(err);
  }
});

export default router;
