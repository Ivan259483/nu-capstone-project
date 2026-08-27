import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import QualityNotificationRetry from '../models/qualityNotificationRetry.model.js';
import User from '../models/user.model.js';
import { getIO } from '../utils/socket.utils.js';
import { runTrackedSystemMutation } from '../middleware/systemLifecycle.middleware.js';
import {
  countGatePhotos,
  requiredGatePhotosForValidation,
} from '../utils/trackerGatePhotos.utils.js';

export const QUALITY_NOTIFICATION_SOURCE = 'Quality Command Center';
export const QUALITY_NOTIFICATION_CHANNEL = 'quality_control';
export const QUALITY_NOTIFICATION_ROLE = 'staff_quality_checker';

export const QUALITY_NOTIFICATION_TYPES = Object.freeze({
  JOB_ARRIVED: 'JOB_ARRIVED',
  EVIDENCE_REQUIRED: 'EVIDENCE_REQUIRED',
  EVIDENCE_REPLACEMENT_REQUIRED: 'EVIDENCE_REPLACEMENT_REQUIRED',
  READY_FOR_QC: 'READY_FOR_QC',
  QC_FAILED: 'QC_FAILED',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  JOB_ASSIGNED: 'JOB_ASSIGNED',
  JOB_REASSIGNED: 'JOB_REASSIGNED',
});

const QUALITY_NOTIFICATION_TYPE_SET = new Set(Object.values(QUALITY_NOTIFICATION_TYPES));
const QUALITY_GATE_STAGES = new Set(['received', 'in_progress', 'quality_check', 'ready_pickup']);
const QUALITY_TERMINAL_STAGES = new Set(['completed', 'released', 'cancelled', 'canceled', 'rejected']);
const QUALITY_RETRY_INTERVAL_MS = 60_000;
const QUALITY_RETRY_LOCK_MS = 2 * 60_000;
const QUALITY_RETRY_BATCH_SIZE = 50;
const QUALITY_RETRY_MAX_BACKOFF_MS = 15 * 60_000;

function idOf(value) {
  if (value == null || value === '') return '';
  return String(value?._id || value);
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function asPlain(value) {
  return value?.toObject ? value.toObject({ virtuals: true }) : value;
}

async function leanQuery(query) {
  return typeof query?.lean === 'function' ? query.lean() : query;
}

function orderReference(order) {
  return cleanText(order?.orderNumber || order?.bookingReference || order?._id, 120) || 'Order';
}

function customerName(order) {
  return cleanText(
    order?.customerName || (typeof order?.customer === 'object' ? order.customer?.name : ''),
    160,
  ) || 'Customer';
}

function vehicleLabel(order) {
  return [order?.vehicleYear, order?.vehicleMake, order?.vehicleModel]
    .map((part) => cleanText(part, 80))
    .filter(Boolean)
    .join(' ')
    .slice(0, 240) || 'Vehicle';
}

function jobContext(order) {
  return `${orderReference(order)} · ${customerName(order)}`;
}

function normalizedStage(value) {
  return cleanText(value, 80).toLowerCase().replace(/[\s-]+/g, '_');
}

function notificationEventName(type) {
  return type.toLowerCase();
}

function dedupeKeyFor(type, orderId, stage) {
  return ['QC', type, orderId, normalizedStage(stage)].filter(Boolean).join(':').slice(0, 240);
}

export function buildQualityNotificationLink({
  orderId,
  view = 'live-tracker',
  action,
  stage,
  evidenceId,
  qcId,
} = {}) {
  const target = new URL('/detailer/dashboard', 'https://autospf.local');
  target.searchParams.set('qcv', cleanText(view, 40) || 'live-tracker');
  if (orderId) target.searchParams.set('orderId', cleanText(orderId, 120));
  if (action) target.searchParams.set('action', cleanText(action, 80));
  if (stage) target.searchParams.set('stage', normalizedStage(stage));
  if (evidenceId) target.searchParams.set('evidenceId', cleanText(evidenceId, 160));
  if (qcId) target.searchParams.set('qcId', cleanText(qcId, 160));
  return `${target.pathname}${target.search}#qc_review`;
}

function toQualityNotificationPayload(notification) {
  const raw = asPlain(notification);
  const id = idOf(raw?._id || raw?.id);
  if (!id) return null;
  return {
    id,
    _id: id,
    title: raw.title,
    message: raw.message,
    type: raw.type,
    event: raw.event,
    category: raw.category,
    severity: raw.severity,
    source: raw.source,
    priority: raw.priority,
    actionRequired: Boolean(raw.actionRequired),
    isRead: Boolean(raw.isRead),
    readAt: raw.readAt || null,
    isResolved: Boolean(raw.resolvedAt),
    resolvedAt: raw.resolvedAt || null,
    resolutionReason: raw.resolutionReason,
    resolvedByEvent: raw.resolvedByEvent,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    lastOccurredAt: raw.lastOccurredAt || raw.createdAt,
    link: raw.link,
    action: raw.action,
    actionType: raw.actionType,
    actionId: raw.actionId,
    metadata: raw.metadata || {},
  };
}

function severityFor(type) {
  if (type === QUALITY_NOTIFICATION_TYPES.QC_FAILED) return 'critical';
  if (
    type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED
    || type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED
  ) return 'warning';
  if (
    type === QUALITY_NOTIFICATION_TYPES.READY_FOR_QC
    || type === QUALITY_NOTIFICATION_TYPES.READY_FOR_PICKUP
  ) return 'success';
  return 'info';
}

function priorityFor(type) {
  if (type === QUALITY_NOTIFICATION_TYPES.QC_FAILED) return 'high';
  if (
    type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED
    || type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED
    || type === QUALITY_NOTIFICATION_TYPES.READY_FOR_QC
  ) return 'high';
  return 'normal';
}

function internalPriorityFor(type) {
  if (type === QUALITY_NOTIFICATION_TYPES.QC_FAILED) return 'CRITICAL';
  if (type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED) return 'WARNING';
  if (
    type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED
    || type === QUALITY_NOTIFICATION_TYPES.READY_FOR_QC
  ) return 'ACTION';
  return 'INFO';
}

function actionRequiredFor(type) {
  return ![
    QUALITY_NOTIFICATION_TYPES.JOB_ARRIVED,
    QUALITY_NOTIFICATION_TYPES.READY_FOR_PICKUP,
  ].includes(type);
}

function evidenceRequirementCopy(stage, missingCount) {
  const count = Math.max(1, Number(missingCount) || 1);
  if (stage === 'received') {
    return `${count} arrival evidence ${count === 1 ? 'item is' : 'items are'} still required.`;
  }
  if (stage === 'quality_check') {
    return 'The Quality Check form photo is still required.';
  }
  if (stage === 'ready_pickup') {
    return `${count} final output ${count === 1 ? 'photo is' : 'photos are'} still required.`;
  }
  return `${count} service ${count === 1 ? 'photo is' : 'photos are'} still required.`;
}

function replacementCopy(slot, missingCount) {
  const label = cleanText(slot, 80).replace(/_/g, ' ');
  const count = Math.max(1, Number(missingCount) || 1);
  if (count > 1) return `${count} evidence photos require replacement.`;
  return `${label ? `${label[0].toUpperCase()}${label.slice(1)} photo` : 'One evidence photo'} requires replacement.`;
}

function conditionLinkFingerprint(value) {
  const raw = String(value || '');
  try {
    const target = new URL(raw, 'https://autospf.local');
    target.searchParams.delete('qcId');
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return raw;
  }
}

function fingerprint(value) {
  const raw = asPlain(value) || {};
  return JSON.stringify({
    title: raw.title,
    message: raw.message,
    link: conditionLinkFingerprint(raw.link),
    actionLabel: raw.action?.label,
    actionType: raw.actionType,
    stage: raw.metadata?.stage,
    slot: raw.metadata?.slot,
    missingCount: raw.metadata?.missingCount,
    assignedDetailerId: raw.metadata?.assignedDetailerId,
    evidenceId: raw.metadata?.evidenceId,
    // qcId is a note/audit-row identifier, not a new condition by itself. A
    // repeated request can create a fresh note ID before the same failure is
    // retried, and must not re-alert until the QC cycle has actually restarted.
  });
}

export function createQualityNotificationService({
  NotificationModel = Notification,
  OrderModel = Order,
  UserModel = User,
  getSocketIO = getIO,
  now = () => new Date(),
  logger = console,
} = {}) {
  async function resolveCurrentOrder(order) {
    const orderId = idOf(order?._id);
    if (!mongoose.isValidObjectId(orderId) || typeof OrderModel?.findById !== 'function') {
      return order;
    }
    const persistedOrder = await leanQuery(
      OrderModel.findById(orderId).select(
        'assignedDetailer trackerStageMedia serviceTrackingStage status updatedAt',
      ),
    );
    if (!persistedOrder) return order;
    return { ...asPlain(order), ...asPlain(persistedOrder) };
  }

  async function emit(notification, event = 'notification:new') {
    const payload = toQualityNotificationPayload(notification);
    if (!payload) return;
    const raw = asPlain(notification);
    const targetUserId = idOf(raw?.recipientUserId);
    const room = targetUserId
      ? `user:${targetUserId}`
      : `role:${raw?.recipientRole || QUALITY_NOTIFICATION_ROLE}`;
    try {
      getSocketIO().to(room).emit(event, payload);
    } catch (error) {
      logger?.warn?.('[qualityNotifications] Socket delivery unavailable:', error.message);
    }
  }

  async function resolveRecipient(order) {
    let assignedId = idOf(order?.assignedDetailer);
    const orderId = idOf(order?._id);
    if (mongoose.isValidObjectId(orderId) && typeof OrderModel?.findById === 'function') {
      const persistedOrder = await leanQuery(
        OrderModel.findById(orderId).select('assignedDetailer'),
      );
      // Production callers always pass a persisted order. Falling back only when
      // no row exists keeps the service independently testable without allowing a
      // stale controller snapshot to override the database's current assignment.
      if (persistedOrder) assignedId = idOf(persistedOrder.assignedDetailer);
    }
    if (mongoose.isValidObjectId(assignedId)) {
      const assigned = await leanQuery(
        UserModel.findOne({
          _id: assignedId,
          role: QUALITY_NOTIFICATION_ROLE,
          isActive: { $ne: false },
          isVerified: true,
          isDeleted: { $ne: true },
        }).select('_id role'),
      );
      if (assigned?._id) {
        return {
          recipientRole: QUALITY_NOTIFICATION_ROLE,
          recipientUserId: new mongoose.Types.ObjectId(idOf(assigned._id)),
        };
      }
    }
    return { recipientRole: QUALITY_NOTIFICATION_ROLE, recipientUserId: null };
  }

  async function resolveDocuments(documents, reason, resolvedByEvent) {
    const rows = (documents || []).map(asPlain).filter((row) => row?._id && !row.resolvedAt);
    if (!rows.length) return 0;
    const resolvedAt = now();
    const resolutionReason = cleanText(reason, 500) || 'Condition resolved';
    const resolutionEvent = cleanText(resolvedByEvent, 100) || 'condition_resolved';
    const winners = (await Promise.all(rows.map((row) => (
      NotificationModel.findOneAndUpdate(
        { _id: row._id, resolvedAt: null },
        {
          $set: {
            resolvedAt,
            resolutionReason,
            resolvedByEvent: resolutionEvent,
            isRead: true,
            readAt: resolvedAt,
          },
        },
        { new: true, runValidators: true },
      )
    )))).filter(Boolean);
    await Promise.all(winners.map((row) => emit(row, 'notification:resolved')));
    return winners.length;
  }

  async function resolveWhere(filter, reason, resolvedByEvent) {
    const rows = await leanQuery(NotificationModel.find({
      ...filter,
      'metadata.channel': QUALITY_NOTIFICATION_CHANNEL,
      resolvedAt: null,
    }));
    return resolveDocuments(rows, reason, resolvedByEvent);
  }

  async function resolveType(order, type, { stage, reason, resolvedByEvent } = {}) {
    const orderId = idOf(order?._id || order);
    if (!orderId) return 0;
    const filter = {
      'metadata.orderId': orderId,
      'metadata.notificationType': type,
      ...(stage ? { 'metadata.stage': normalizedStage(stage) } : {}),
    };
    return resolveWhere(filter, reason, resolvedByEvent);
  }

  async function upsert(input = {}) {
    const type = cleanText(input.type, 100).toUpperCase();
    if (!QUALITY_NOTIFICATION_TYPE_SET.has(type)) {
      throw new TypeError(`Unsupported Quality notification type: ${input.type}`);
    }
    const order = input.order;
    const orderId = idOf(order?._id);
    if (!mongoose.isValidObjectId(orderId)) {
      throw new TypeError('A persisted order is required for a Quality notification.');
    }

    const recipient = await resolveRecipient(order);
    const stage = normalizedStage(input.stage);
    const dedupeKey = cleanText(
      input.dedupeKey || dedupeKeyFor(type, orderId, stage),
      240,
    );
    const link = buildQualityNotificationLink({
      orderId,
      view: input.view,
      action: input.actionType,
      stage,
      evidenceId: input.evidenceId,
      qcId: input.qcId,
    });
    const occurredAt = now();
    const metadata = {
      ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
      channel: QUALITY_NOTIFICATION_CHANNEL,
      notificationType: type,
      orderId,
      orderNumber: orderReference(order),
      customerId: idOf(order?.customer),
      customerName: customerName(order),
      vehicleLabel: vehicleLabel(order),
      ...(stage ? { stage } : {}),
      ...(input.evidenceId ? { evidenceId: cleanText(input.evidenceId, 160) } : {}),
      ...(input.qcId ? { qcId: cleanText(input.qcId, 160) } : {}),
      ...(input.slot ? { slot: normalizedStage(input.slot) } : {}),
      priorityLevel: internalPriorityFor(type),
      actionTarget: {
        view: cleanText(input.view, 40) || 'live-tracker',
        action: cleanText(input.actionType, 80),
        orderId,
        ...(stage ? { stage } : {}),
      },
    };
    const severity = severityFor(type);
    const document = {
      title: cleanText(input.title, 180),
      message: cleanText(input.message, 2000),
      type,
      event: notificationEventName(type),
      category: 'live_tracking',
      severity,
      source: QUALITY_NOTIFICATION_SOURCE,
      actionRequired: input.actionRequired ?? actionRequiredFor(type),
      priority: priorityFor(type),
      recipientRole: recipient.recipientRole,
      recipientUserId: recipient.recipientUserId,
      link,
      action: {
        label: cleanText(input.actionLabel, 80) || 'Open job',
        link,
      },
      actionType: cleanText(input.actionType, 100) || 'OPEN_QC_JOB',
      actionId: orderId,
      metadata,
      dedupeKey,
      resolvedAt: null,
    };
    const { resolvedAt: _resolvedAt, ...activeDocument } = document;
    if (!document.title || !document.message) {
      throw new TypeError('Quality notification title and message are required.');
    }

    const target = {
      recipientRole: recipient.recipientRole,
      recipientUserId: recipient.recipientUserId,
      dedupeKey,
    };
    let existing = await leanQuery(NotificationModel.findOne(target));
    let notification;
    let shouldEmit = false;

    if (!existing) {
      try {
        notification = await NotificationModel.create({
          ...document,
          isRead: false,
          readAt: null,
          firstOccurredAt: occurredAt,
          lastOccurredAt: occurredAt,
          groupCount: 1,
        });
        shouldEmit = true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        existing = await leanQuery(NotificationModel.findOne(target));
      }
    }

    if (!notification && existing) {
      const meaningfulChange = fingerprint(existing) !== fingerprint(document);
      const reactivate = Boolean(existing.resolvedAt);
      const resurface = !reactivate && input.forceReactivate === true && meaningfulChange;
      const update = {
        ...(reactivate ? document : activeDocument),
        ...(reactivate || resurface
          ? { lastOccurredAt: occurredAt, isRead: false, readAt: null }
          : {}),
      };
      if (reactivate) {
        notification = await NotificationModel.findOneAndUpdate(
          { ...target, resolvedAt: { $ne: null } },
          {
            $set: update,
            $unset: { resolutionReason: 1, resolvedByEvent: 1 },
          },
          { new: true, runValidators: true },
        );
        shouldEmit = Boolean(notification);
        if (!notification) {
          notification = await NotificationModel.findOneAndUpdate(
            { ...target, resolvedAt: null },
            { $set: activeDocument },
            { new: true, runValidators: true },
          );
          if (!notification) notification = await NotificationModel.findOne(target);
        }
      } else {
        notification = await NotificationModel.findOneAndUpdate(
          { ...target, resolvedAt: null },
          { $set: update },
          { new: true, runValidators: true },
        );
        shouldEmit = resurface || (meaningfulChange && input.emitOnUpdate === true);
        if (!notification) {
          notification = await NotificationModel.findOne(target);
          shouldEmit = false;
        }
      }
    }

    if (!notification) throw new Error('Quality notification persistence failed.');

    // Re-check the persisted assignment after writing. This closes the race where
    // two workflow handlers start on different order snapshots during a reassignment.
    const currentRecipient = await resolveRecipient(order);
    const stillCurrent = (
      currentRecipient.recipientRole === notification.recipientRole
      && idOf(currentRecipient.recipientUserId) === idOf(notification.recipientUserId)
    );
    if (!stillCurrent) {
      await resolveDocuments(
        [notification],
        'Notification recipient changed before delivery.',
        'recipient_changed',
      );
      const reconcileDepth = Math.max(0, Number(input.__recipientReconcileDepth) || 0);
      if (reconcileDepth < 3) {
        return upsert({ ...input, __recipientReconcileDepth: reconcileDepth + 1 });
      }
      return notification;
    }

    const otherRecipients = await leanQuery(NotificationModel.find({
      _id: { $ne: notification._id },
      dedupeKey,
      resolvedAt: null,
    }));
    await resolveDocuments(
      otherRecipients,
      'Notification reassigned to the current Quality Checker.',
      'recipient_changed',
    );
    if (shouldEmit) await emit(notification);
    return notification;
  }

  async function hasActiveType(order, type, stage) {
    const orderId = idOf(order?._id || order);
    if (!orderId) return false;
    return Boolean(await leanQuery(NotificationModel.findOne({
      'metadata.channel': QUALITY_NOTIFICATION_CHANNEL,
      'metadata.orderId': orderId,
      'metadata.notificationType': type,
      ...(stage ? { 'metadata.stage': normalizedStage(stage) } : {}),
      resolvedAt: null,
    }).select('_id')));
  }

  async function notifyVehicleArrived(order) {
    return upsert({
      order,
      type: QUALITY_NOTIFICATION_TYPES.JOB_ARRIVED,
      title: 'Vehicle Arrived',
      message: `${jobContext(order)} — ${vehicleLabel(order)} has arrived.`,
      stage: 'received',
      actionType: 'UPLOAD_EVIDENCE',
      actionLabel: 'Upload Arrival Evidence',
    });
  }

  async function syncEvidenceAttention(order, requestedStage, options = {}) {
    order = await resolveCurrentOrder(order);
    const stage = normalizedStage(requestedStage);
    if (!QUALITY_GATE_STAGES.has(stage)) return null;
    const uploaded = countGatePhotos(order, stage);
    const required = requiredGatePhotosForValidation(stage, QUALITY_NOTIFICATION_ROLE);
    const missingCount = Math.max(0, required - uploaded);

    if (missingCount === 0) {
      await Promise.all([
        resolveType(order, QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED, {
          stage,
          reason: `${stage.replace(/_/g, ' ')} evidence is complete.`,
          resolvedByEvent: 'evidence_completed',
        }),
        resolveType(order, QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED, {
          stage,
          reason: 'Replacement evidence was uploaded.',
          resolvedByEvent: 'replacement_uploaded',
        }),
      ]);

      if (stage === 'received') {
        await resolveType(order, QUALITY_NOTIFICATION_TYPES.JOB_ARRIVED, {
          reason: 'Arrival evidence is complete.',
          resolvedByEvent: 'arrival_evidence_completed',
        });
      }
      if (stage === 'in_progress') {
        return upsert({
          order,
          type: QUALITY_NOTIFICATION_TYPES.READY_FOR_QC,
          title: 'Ready for Quality Check',
          message: `${jobContext(order)} — All required service evidence has been uploaded.`,
          stage,
          actionType: 'START_QC',
          actionLabel: 'Start QC',
        });
      }
      if (stage === 'ready_pickup') {
        return upsert({
          order,
          type: QUALITY_NOTIFICATION_TYPES.READY_FOR_PICKUP,
          title: 'Ready for Pickup Review',
          message: `${jobContext(order)} — All final output evidence is complete.`,
          stage,
          actionType: 'REVIEW_JOB',
          actionLabel: 'Review Job',
          actionRequired: false,
        });
      }
      return null;
    }

    if (stage === 'in_progress') {
      await resolveType(order, QUALITY_NOTIFICATION_TYPES.READY_FOR_QC, {
        reason: 'Service evidence is incomplete.',
        resolvedByEvent: 'evidence_became_incomplete',
      });
    }
    if (stage === 'ready_pickup') {
      await resolveType(order, QUALITY_NOTIFICATION_TYPES.READY_FOR_PICKUP, {
        reason: 'Final output evidence is incomplete.',
        resolvedByEvent: 'evidence_became_incomplete',
      });
    }

    if (
      stage === 'received'
      && await hasActiveType(order, QUALITY_NOTIFICATION_TYPES.JOB_ARRIVED, stage)
    ) {
      return null;
    }

    const replacementActive = await hasActiveType(
      order,
      QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED,
      stage,
    );
    const type = replacementActive
      ? QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED
      : QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED;
    return upsert({
      order,
      type,
      title: type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED
        ? 'Evidence Needs Replacement'
        : 'Evidence Required',
      message: type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED
        ? `${jobContext(order)} — ${replacementCopy(options.slot, missingCount)}`
        : `${jobContext(order)} — ${evidenceRequirementCopy(stage, missingCount)}`,
      stage,
      slot: options.slot,
      actionType: 'UPLOAD_EVIDENCE',
      actionLabel: type === QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED
        ? 'Review Evidence'
        : 'Upload Evidence',
      metadata: { uploadedCount: uploaded, requiredCount: required, missingCount },
    });
  }

  async function notifyEvidenceReplacement(order, stage, slot) {
    order = await resolveCurrentOrder(order);
    const normalized = normalizedStage(stage);
    const uploaded = countGatePhotos(order, normalized);
    const required = requiredGatePhotosForValidation(normalized, QUALITY_NOTIFICATION_ROLE);
    const missingCount = Math.max(1, required - uploaded);
    await resolveType(order, QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED, {
      stage: normalized,
      reason: 'A specific replacement request supersedes the general evidence reminder.',
      resolvedByEvent: 'replacement_requested',
    });
    if (normalized === 'in_progress') {
      await resolveType(order, QUALITY_NOTIFICATION_TYPES.READY_FOR_QC, {
        reason: 'Service evidence requires replacement.',
        resolvedByEvent: 'evidence_became_incomplete',
      });
    }
    if (normalized === 'ready_pickup') {
      await resolveType(order, QUALITY_NOTIFICATION_TYPES.READY_FOR_PICKUP, {
        reason: 'Final output evidence requires replacement.',
        resolvedByEvent: 'evidence_became_incomplete',
      });
    }
    return upsert({
      order,
      type: QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED,
      title: 'Evidence Needs Replacement',
      message: `${jobContext(order)} — ${replacementCopy(slot, missingCount)}`,
      stage: normalized,
      slot,
      actionType: 'REVIEW_EVIDENCE',
      actionLabel: 'Review Evidence',
      forceReactivate: true,
      metadata: { uploadedCount: uploaded, requiredCount: required, missingCount },
    });
  }

  async function handleStageTransition(order, previousStage, nextStage) {
    const previous = normalizedStage(previousStage);
    const next = normalizedStage(nextStage);
    if (next === 'quality_check' && previous !== next) {
      await Promise.all([
        resolveType(order, QUALITY_NOTIFICATION_TYPES.READY_FOR_QC, {
          reason: 'Quality Check has started.',
          resolvedByEvent: 'qc_started',
        }),
        resolveType(order, QUALITY_NOTIFICATION_TYPES.QC_FAILED, {
          reason: 'The corrected job is being reviewed again.',
          resolvedByEvent: 'qc_restarted',
        }),
      ]);
    }
    if (previous && previous !== next) {
      await Promise.all([
        resolveType(order, QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED, {
          stage: previous,
          reason: `Job advanced beyond ${previous.replace(/_/g, ' ')}.`,
          resolvedByEvent: 'stage_advanced',
        }),
        resolveType(order, QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED, {
          stage: previous,
          reason: `Job advanced beyond ${previous.replace(/_/g, ' ')}.`,
          resolvedByEvent: 'stage_advanced',
        }),
      ]);
    }
    if (next === 'received') await notifyVehicleArrived(order);
    else if (QUALITY_GATE_STAGES.has(next)) await syncEvidenceAttention(order, next);
    if (['completed', 'released'].includes(next)) {
      await resolveOrderAttention(order, 'The job workflow is complete.', 'job_completed');
    }
    if (['cancelled', 'canceled'].includes(next)) {
      await resolveOrderAttention(order, 'The job was cancelled.', 'job_cancelled');
    }
  }

  async function notifyQcFailed(order, reason, qcId) {
    await resolveType(order, QUALITY_NOTIFICATION_TYPES.READY_FOR_QC, {
      reason: 'Quality Check found an issue.',
      resolvedByEvent: 'qc_failed',
    });
    return upsert({
      order,
      type: QUALITY_NOTIFICATION_TYPES.QC_FAILED,
      title: 'QC Issue Found',
      message: `${jobContext(order)} — ${cleanText(reason, 500) || 'Quality Check requires corrective action.'}`,
      stage: 'quality_check',
      qcId,
      view: 'job-detail',
      actionType: 'VIEW_QC_ISSUES',
      actionLabel: 'View QC Issues',
      forceReactivate: true,
    });
  }

  async function notifyReadyForPickup(order) {
    await resolveOrderAttention(order, 'Quality Check passed.', 'qc_passed', {
      keepTypes: [QUALITY_NOTIFICATION_TYPES.READY_FOR_PICKUP],
    });
    return upsert({
      order,
      type: QUALITY_NOTIFICATION_TYPES.READY_FOR_PICKUP,
      title: 'Ready for Pickup',
      message: `${jobContext(order)} — Quality Check passed and the vehicle is ready for the next pickup step.`,
      stage: 'ready_pickup',
      actionType: 'REVIEW_JOB',
      actionLabel: 'Review Job',
      actionRequired: false,
    });
  }

  async function reconcileOrderRecipient(order) {
    order = await resolveCurrentOrder(order);
    const orderId = idOf(order?._id);
    if (!orderId) return 0;
    const currentRecipient = await resolveRecipient(order);
    const rows = await leanQuery(NotificationModel.find({
      'metadata.channel': QUALITY_NOTIFICATION_CHANNEL,
      'metadata.orderId': orderId,
      'metadata.notificationType': {
        $nin: [QUALITY_NOTIFICATION_TYPES.JOB_ASSIGNED, QUALITY_NOTIFICATION_TYPES.JOB_REASSIGNED],
      },
      resolvedAt: null,
    }));
    const staleRows = rows.filter((row) => (
      row.recipientRole !== currentRecipient.recipientRole
      || idOf(row.recipientUserId) !== idOf(currentRecipient.recipientUserId)
    ));
    for (const row of staleRows) {
      const metadata = row.metadata || {};
      const actionTarget = metadata.actionTarget || {};
      await upsert({
        order,
        type: metadata.notificationType || row.type,
        title: row.title,
        message: row.message,
        stage: metadata.stage,
        view: actionTarget.view,
        actionType: row.actionType || actionTarget.action,
        actionLabel: row.action?.label,
        evidenceId: metadata.evidenceId,
        qcId: metadata.qcId,
        slot: metadata.slot,
        actionRequired: row.actionRequired,
        dedupeKey: row.dedupeKey,
        metadata,
      });
    }
    return staleRows.length;
  }

  async function notifyAssignment(order, previousAssignedDetailerId) {
    order = await resolveCurrentOrder(order);
    const currentId = idOf(order?.assignedDetailer);
    const previousId = idOf(previousAssignedDetailerId);
    if (previousId === currentId) return null;
    if (!mongoose.isValidObjectId(currentId)) {
      // Unassignment moves every active condition back to the shared QC queue.
      await reconcileOrderRecipient(order);
      await resolveWhere({
        'metadata.orderId': idOf(order._id),
        'metadata.notificationType': {
          $in: [QUALITY_NOTIFICATION_TYPES.JOB_ASSIGNED, QUALITY_NOTIFICATION_TYPES.JOB_REASSIGNED],
        },
      }, 'The job is no longer privately assigned.', 'job_unassigned');
      return null;
    }
    const recipient = await resolveRecipient(order);
    if (idOf(recipient.recipientUserId) !== currentId) return null;
    const reassigned = Boolean(previousId);
    const notification = await upsert({
      order,
      type: reassigned
        ? QUALITY_NOTIFICATION_TYPES.JOB_REASSIGNED
        : QUALITY_NOTIFICATION_TYPES.JOB_ASSIGNED,
      title: reassigned ? 'Job Reassigned' : 'Job Assigned',
      message: `${orderReference(order)} · ${customerName(order)} is now assigned to you.`,
      stage: order?.serviceTrackingStage || order?.status,
      actionType: 'OPEN_JOB',
      actionLabel: 'Open Job',
      metadata: {
        previousAssignedDetailerId: previousId || null,
        assignedDetailerId: currentId,
      },
    });
    // Persist the new recipient's alert before resolving the previous assignment.
    // If persistence fails, the old alert remains available instead of silently
    // dropping the job from every Quality Checker's attention.
    await resolveWhere({
      _id: { $ne: notification._id },
      'metadata.orderId': idOf(order._id),
      'metadata.notificationType': {
        $in: [QUALITY_NOTIFICATION_TYPES.JOB_ASSIGNED, QUALITY_NOTIFICATION_TYPES.JOB_REASSIGNED],
      },
    }, 'The job assignment changed.', 'job_assignment_changed');
    await reconcileOrderRecipient(order);
    const stage = normalizedStage(order?.serviceTrackingStage || order?.status);
    if (stage === 'received') await notifyVehicleArrived(order);
    else if (QUALITY_GATE_STAGES.has(stage)) await syncEvidenceAttention(order, stage);
    return notification;
  }

  async function resolveOrderAttention(order, reason, resolvedByEvent, options = {}) {
    const keep = new Set(options.keepTypes || []);
    const types = Object.values(QUALITY_NOTIFICATION_TYPES)
      .filter((type) => !keep.has(type));
    return resolveWhere({
      'metadata.orderId': idOf(order?._id || order),
      'metadata.notificationType': { $in: types },
    }, reason, resolvedByEvent);
  }

  return Object.freeze({
    upsertQualityNotification: upsert,
    resolveQualityNotificationType: resolveType,
    resolveQualityOrderAttention: resolveOrderAttention,
    notifyQualityVehicleArrived: notifyVehicleArrived,
    syncQualityEvidenceAttention: syncEvidenceAttention,
    notifyQualityEvidenceReplacement: notifyEvidenceReplacement,
    handleQualityStageTransition: handleStageTransition,
    notifyQualityQcFailed: notifyQcFailed,
    notifyQualityReadyForPickup: notifyReadyForPickup,
    notifyQualityJobAssignment: notifyAssignment,
    reconcileQualityJobRecipient: reconcileOrderRecipient,
    resolveQualityRecipient: resolveRecipient,
  });
}

const defaultService = createQualityNotificationService();

function normalizedRetryPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value == null ? null : String(value)]),
  );
}

function qualityRetryKey(kind, orderId, payload) {
  const stablePayload = Object.fromEntries(
    Object.entries(payload).sort(([left], [right]) => left.localeCompare(right)),
  );
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify([kind, orderId, stablePayload]))
    .digest('hex');
  return `qc:${digest}`;
}

export async function enqueueQualityNotificationRetry(kind, order, payload = {}, cause = null) {
  const orderId = idOf(order?._id || order);
  if (!mongoose.isValidObjectId(orderId)) return null;
  const normalizedPayload = normalizedRetryPayload(payload);
  const retryKey = qualityRetryKey(kind, orderId, normalizedPayload);
  const now = new Date();
  const update = {
    $setOnInsert: {
      retryKey,
      kind,
      orderId: new mongoose.Types.ObjectId(orderId),
      attempts: 0,
      lockedAt: null,
    },
    $set: {
      payload: normalizedPayload,
      nextAttemptAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      lastError: cleanText(cause?.message || cause, 500) || 'Notification synchronization failed.',
    },
  };
  try {
    return await QualityNotificationRetry.findOneAndUpdate(
      { retryKey },
      update,
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    // Two processes may race before the unique retry key becomes visible to
    // the losing upsert. Convert that harmless insert race into a normal update.
    if (error?.code !== 11000) throw error;
    return QualityNotificationRetry.findOneAndUpdate(
      { retryKey },
      update,
      { new: true, runValidators: true },
    );
  }
}

async function withQualityNotificationRetry(kind, order, payload, operation) {
  try {
    return await operation();
  } catch (error) {
    try {
      await enqueueQualityNotificationRetry(kind, order, payload, error);
    } catch (retryError) {
      console.error(
        '[qualityNotifications] Failed to persist notification recovery item:',
        retryError.message,
      );
    }
    throw error;
  }
}

function currentQualityStageValues(order) {
  return new Set([
    normalizedStage(order?.status),
    normalizedStage(order?.serviceTrackingStage),
  ].filter(Boolean));
}

function hasGateSlotPhoto(order, stage, slot) {
  const targetStage = normalizedStage(stage);
  const targetSlot = normalizedStage(slot);
  return (Array.isArray(order?.trackerStageMedia) ? order.trackerStageMedia : []).some((entry) => (
    normalizedStage(entry?.stage) === targetStage
    && normalizedStage(entry?.slot) === targetSlot
    && Boolean(entry?.photoUrl)
  ));
}

function latestQcReturnNote(order) {
  return [...(Array.isArray(order?.staffNotes) ? order.staffNotes : [])]
    .reverse()
    .find((note) => /^\[QC_RETURN\]/i.test(String(note?.content || '')));
}

export async function reconcileQualityNotificationRetry(
  retry,
  { service = defaultService, OrderModel = Order } = {},
) {
  const orderId = idOf(retry?.orderId);
  if (!mongoose.isValidObjectId(orderId)) return { outcome: 'discarded', reason: 'invalid_order' };
  const order = await OrderModel.findById(orderId)
    .select(
      '_id orderNumber bookingReference customer customerName vehicleYear vehicleMake vehicleModel '
      + 'assignedDetailer status serviceTrackingStage serviceTrackingUpdatedAt trackerStageMedia '
      + 'staffNotes qcCompletedAt archived updatedAt',
    );
  if (!order) return { outcome: 'discarded', reason: 'order_missing' };

  const stages = currentQualityStageValues(order);
  if (order.archived || [...stages].some((stage) => QUALITY_TERMINAL_STAGES.has(stage))) {
    await service.resolveQualityOrderAttention(
      order,
      order.archived ? 'The job was archived.' : 'The job workflow is complete.',
      order.archived ? 'job_archived' : 'job_completed',
    );
    return { outcome: 'reconciled', reason: 'terminal' };
  }

  const payload = retry?.payload || {};
  const stageMatches = (stage) => stages.has(normalizedStage(stage));

  switch (retry.kind) {
    case 'vehicle_arrived':
      if (!stageMatches('received')) return { outcome: 'discarded', reason: 'stage_changed' };
      await service.notifyQualityVehicleArrived(order);
      break;

    case 'evidence_sync':
      if (!stageMatches(payload.stage)) return { outcome: 'discarded', reason: 'stage_changed' };
      await service.syncQualityEvidenceAttention(order, payload.stage);
      break;

    case 'evidence_replacement':
      if (!stageMatches(payload.stage)) return { outcome: 'discarded', reason: 'stage_changed' };
      if (hasGateSlotPhoto(order, payload.stage, payload.slot)) {
        await service.syncQualityEvidenceAttention(order, payload.stage);
        return { outcome: 'reconciled', reason: 'replacement_uploaded' };
      }
      await service.notifyQualityEvidenceReplacement(order, payload.stage, payload.slot);
      break;

    case 'stage_transition':
      if (!stageMatches(payload.nextStage)) return { outcome: 'discarded', reason: 'stage_changed' };
      await service.handleQualityStageTransition(order, payload.previousStage, payload.nextStage);
      break;

    case 'qc_failed': {
      const latestReturn = latestQcReturnNote(order);
      if (!latestReturn) return { outcome: 'discarded', reason: 'return_missing' };
      if (payload.qcId && idOf(latestReturn._id) !== String(payload.qcId)) {
        return { outcome: 'discarded', reason: 'newer_qc_result' };
      }
      const returnedAt = new Date(latestReturn.createdAt || 0).getTime();
      const workflowAdvancedAt = new Date(order.serviceTrackingUpdatedAt || 0).getTime();
      const completedAt = new Date(order.qcCompletedAt || 0).getTime();
      if (
        (returnedAt > 0 && workflowAdvancedAt > returnedAt)
        || (returnedAt > 0 && completedAt > returnedAt)
      ) {
        return { outcome: 'discarded', reason: 'qc_cycle_advanced' };
      }
      const reason = String(latestReturn.content || '').replace(/^\[QC_RETURN\]\s*/i, '')
        || payload.reason;
      await service.notifyQualityQcFailed(order, reason, latestReturn._id);
      break;
    }

    case 'ready_for_pickup': {
      if (!stageMatches('ready_pickup')) return { outcome: 'discarded', reason: 'stage_changed' };
      const required = requiredGatePhotosForValidation('ready_pickup', QUALITY_NOTIFICATION_ROLE);
      if (countGatePhotos(order, 'ready_pickup') < required) {
        await service.syncQualityEvidenceAttention(order, 'ready_pickup');
        return { outcome: 'reconciled', reason: 'pickup_evidence_incomplete' };
      }
      await service.notifyQualityReadyForPickup(order);
      break;
    }

    case 'job_assignment':
      if (idOf(order.assignedDetailer) !== String(payload.currentAssignedDetailerId || '')) {
        return { outcome: 'discarded', reason: 'assignment_changed' };
      }
      await service.notifyQualityJobAssignment(order, payload.previousAssignedDetailerId || null);
      break;

    case 'recipient_reconcile':
      await service.reconcileQualityJobRecipient(order);
      break;

    default:
      return { outcome: 'discarded', reason: 'unsupported_kind' };
  }

  return { outcome: 'reconciled' };
}

let qualityRetrySweepInFlight = null;

export function runQualityNotificationRetrySweep({
  limit = QUALITY_RETRY_BATCH_SIZE,
  now = new Date(),
  RetryModel = QualityNotificationRetry,
  reconcile = reconcileQualityNotificationRetry,
} = {}) {
  if (qualityRetrySweepInFlight) return qualityRetrySweepInFlight;
  qualityRetrySweepInFlight = (async () => {
    const boundedLimit = Math.max(1, Math.min(200, Number(limit) || QUALITY_RETRY_BATCH_SIZE));
    const lockExpiredBefore = new Date(now.getTime() - QUALITY_RETRY_LOCK_MS);
    const summary = { processed: 0, reconciled: 0, discarded: 0, failed: 0 };

    while (summary.processed < boundedLimit) {
      const lockedAt = new Date();
      const retry = await RetryModel.findOneAndUpdate(
        {
          nextAttemptAt: { $lte: now },
          $or: [
            { lockedAt: null },
            { lockedAt: { $exists: false } },
            { lockedAt: { $lt: lockExpiredBefore } },
          ],
        },
        { $set: { lockedAt } },
        { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } },
      );
      if (!retry) break;
      summary.processed += 1;

      try {
        const result = await reconcile(retry);
        await RetryModel.deleteOne({ _id: retry._id, lockedAt });
        if (result?.outcome === 'discarded') summary.discarded += 1;
        else summary.reconciled += 1;
      } catch (error) {
        summary.failed += 1;
        const attempts = Math.max(0, Number(retry.attempts) || 0) + 1;
        const delay = Math.min(
          QUALITY_RETRY_MAX_BACKOFF_MS,
          5_000 * (2 ** Math.min(8, attempts - 1)),
        );
        await RetryModel.updateOne(
          { _id: retry._id, lockedAt },
          {
            $set: {
              lockedAt: null,
              nextAttemptAt: new Date(now.getTime() + delay),
              lastError: cleanText(error?.message || error, 500) || 'Retry failed.',
            },
            $inc: { attempts: 1 },
          },
        );
      }
    }

    return summary;
  })().finally(() => {
    qualityRetrySweepInFlight = null;
  });
  return qualityRetrySweepInFlight;
}

export function startQualityNotificationRetryScheduler() {
  const run = () => {
    void runTrackedSystemMutation(() => runQualityNotificationRetrySweep()).catch((error) => {
      console.error('[SCHEDULER] Quality notification retry sweep failed:', error.message);
    });
  };
  run();
  const timer = setInterval(run, QUALITY_RETRY_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

export const upsertQualityNotification = defaultService.upsertQualityNotification;
export const resolveQualityNotificationType = defaultService.resolveQualityNotificationType;
export const resolveQualityOrderAttention = defaultService.resolveQualityOrderAttention;
export const notifyQualityVehicleArrived = (order) => withQualityNotificationRetry(
  'vehicle_arrived',
  order,
  {},
  () => defaultService.notifyQualityVehicleArrived(order),
);
export const syncQualityEvidenceAttention = (order, stage, options) => withQualityNotificationRetry(
  'evidence_sync',
  order,
  { stage: normalizedStage(stage) },
  () => defaultService.syncQualityEvidenceAttention(order, stage, options),
);
export const notifyQualityEvidenceReplacement = (order, stage, slot) => withQualityNotificationRetry(
  'evidence_replacement',
  order,
  { stage: normalizedStage(stage), slot: normalizedStage(slot) },
  () => defaultService.notifyQualityEvidenceReplacement(order, stage, slot),
);
export const handleQualityStageTransition = (order, previousStage, nextStage) => withQualityNotificationRetry(
  'stage_transition',
  order,
  { previousStage: normalizedStage(previousStage), nextStage: normalizedStage(nextStage) },
  () => defaultService.handleQualityStageTransition(order, previousStage, nextStage),
);
export const notifyQualityQcFailed = (order, reason, qcId) => withQualityNotificationRetry(
  'qc_failed',
  order,
  { reason: cleanText(reason, 500), qcId: idOf(qcId) || null },
  () => defaultService.notifyQualityQcFailed(order, reason, qcId),
);
export const notifyQualityReadyForPickup = (order) => withQualityNotificationRetry(
  'ready_for_pickup',
  order,
  {},
  () => defaultService.notifyQualityReadyForPickup(order),
);
export const notifyQualityJobAssignment = (order, previousAssignedDetailerId) => withQualityNotificationRetry(
  'job_assignment',
  order,
  {
    previousAssignedDetailerId: idOf(previousAssignedDetailerId) || null,
    currentAssignedDetailerId: idOf(order?.assignedDetailer) || null,
  },
  () => defaultService.notifyQualityJobAssignment(order, previousAssignedDetailerId),
);
export const reconcileQualityJobRecipient = (order) => withQualityNotificationRetry(
  'recipient_reconcile',
  order,
  {},
  () => defaultService.reconcileQualityJobRecipient(order),
);

export { toQualityNotificationPayload };
