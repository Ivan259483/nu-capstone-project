import Notification from '../models/notification.model.js';
import { getIO } from '../utils/socket.utils.js';

export const ADMIN_NOTIFICATION_CATEGORIES = Object.freeze([
  'appointments',
  'live_tracking',
  'payments',
  'inventory',
  'security',
  'system',
]);

export const ADMIN_NOTIFICATION_SEVERITIES = Object.freeze([
  'critical',
  'warning',
  'info',
  'success',
]);

export const ADMIN_NOTIFICATION_ROOM = 'admin:chat';
export const ADMIN_NOTIFICATION_EVENT = 'admin:notification';
export const DEFAULT_ADMIN_NOTIFICATION_RECIPIENT_ROLE = 'admin_family';
export const DEFAULT_ADMIN_NOTIFICATION_GROUPING_WINDOW_MS = 10 * 60 * 1000;

const CATEGORY_SET = new Set(ADMIN_NOTIFICATION_CATEGORIES);
const SEVERITY_SET = new Set(ADMIN_NOTIFICATION_SEVERITIES);

const DEFAULT_SOURCE_BY_CATEGORY = Object.freeze({
  appointments: 'Appointments',
  live_tracking: 'Live Tracking',
  payments: 'Payments',
  inventory: 'Inventory',
  security: 'Security',
  system: 'System',
});

export const ADMIN_NOTIFICATION_DESTINATIONS = Object.freeze({
  appointments: '/admin/dashboard?tab=scheduling',
  availability: '/admin/dashboard?tab=scheduling&panel=availability',
  live_tracking: '/admin/dashboard?tab=live_tracking',
  payments: '/admin/dashboard?tab=dashboard&panel=payments',
  inventory: '/admin/dashboard?tab=inventory',
  security: '/admin/dashboard?tab=logs',
  users: '/admin/dashboard?tab=users',
  system: '/admin/dashboard',
});

const CRITICAL_EVENTS = new Set([
  'emergency_closure_enabled',
  'out_of_stock',
  'payment_failed',
  'sla_breached',
  'security_alert',
  'account_locked',
  'suspicious_login',
]);

const WARNING_EVENTS = new Set([
  'low_stock',
  'payment_pending',
  'payment_pending_review',
  'nearing_capacity',
  'unassigned_technician',
  'job_delayed',
  'sla_at_risk',
  'required_item_unavailable',
]);

const SUCCESS_EVENTS = new Set([
  'payment_completed',
  'refund_processed',
  'service_completed',
  'stock_replenished',
  'emergency_closure_disabled',
]);

function keyOf(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function cleanRequiredText(value, field, maxLength) {
  const text = String(value || '').trim();
  if (!text) throw new TypeError(`${field} is required`);
  return text.slice(0, maxLength);
}

function cleanOptionalText(value, maxLength) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function asDate(value, fallback) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  if (Number.isNaN(date.getTime())) throw new TypeError('occurredAt must be a valid date');
  return date;
}

function positiveWindow(value, fallback = DEFAULT_ADMIN_NOTIFICATION_GROUPING_WINDOW_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), 30 * 24 * 60 * 60 * 1000);
}

export function buildAdminGroupingBucket(occurredAt, groupingWindowMs) {
  const date = asDate(occurredAt, new Date());
  const windowMs = positiveWindow(groupingWindowMs);
  return `${windowMs}:${Math.floor(date.getTime() / windowMs)}`;
}

function idOf(value) {
  if (value === null || value === undefined || value === '') return null;
  return value?._id || value;
}

/**
 * Produce stable, human-auditable grouping keys. Identity parts are optional:
 * omit them to group an event across records (for example all new bookings), or
 * include a record id to group repeated alerts for only that record.
 */
export function buildAdminGroupingKey(category, event, ...identityParts) {
  const normalizedCategory = keyOf(category);
  const normalizedEvent = keyOf(event);
  if (!CATEGORY_SET.has(normalizedCategory)) {
    throw new TypeError(`Unsupported admin notification category: ${category}`);
  }
  if (!normalizedEvent) throw new TypeError('A grouping event name is required');

  const parts = identityParts
    .flat()
    .map((part) => keyOf(part))
    .filter(Boolean);
  return [normalizedCategory, normalizedEvent, ...parts].join(':').slice(0, 240);
}

/** Infer product severity from a canonical event name, while allowing a caller override. */
export function inferAdminNotificationSeverity(event, fallback = 'info') {
  const normalized = keyOf(event);
  if (CRITICAL_EVENTS.has(normalized)) return 'critical';
  if (WARNING_EVENTS.has(normalized)) return 'warning';
  if (SUCCESS_EVENTS.has(normalized)) return 'success';
  return SEVERITY_SET.has(keyOf(fallback)) ? keyOf(fallback) : 'info';
}

/** Replace {count} in grouped copy without accepting executable formatters. */
export function formatAdminGroupedCopy(template, count) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  return String(template || '').replaceAll('{count}', String(safeCount));
}

/**
 * Only internal paths are accepted. This prevents notification metadata from
 * becoming an open redirect or a javascript: URL when rendered by the client.
 */
export function normalizeAdminDeepLink(value, fallback = ADMIN_NOTIFICATION_DESTINATIONS.system) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const candidate = raw.startsWith('/') ? raw : `/${raw}`;
  if (candidate.startsWith('//') || /[\u0000-\u001f]/.test(candidate)) return fallback;

  try {
    const parsed = new URL(candidate, 'https://autospf.local');
    if (parsed.origin !== 'https://autospf.local') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/** Build a safe Admin Hub link and append only scalar query parameters. */
export function buildAdminDeepLink(destination, params = {}) {
  const base = ADMIN_NOTIFICATION_DESTINATIONS[destination]
    || (CATEGORY_SET.has(keyOf(destination))
      ? ADMIN_NOTIFICATION_DESTINATIONS[keyOf(destination)]
      : ADMIN_NOTIFICATION_DESTINATIONS.system);
  const parsed = new URL(base, 'https://autospf.local');

  for (const [rawKey, rawValue] of Object.entries(params || {})) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(rawKey)) continue;
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) continue;
    const value = String(rawValue).trim();
    if (value) parsed.searchParams.set(rawKey, value.slice(0, 300));
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function normalizeAction(action, fallbackLink) {
  if (!action || typeof action !== 'object') return undefined;
  const label = cleanOptionalText(action.label, 80);
  if (!label) return undefined;
  return {
    label,
    link: normalizeAdminDeepLink(action.link || fallbackLink),
  };
}

function legacyTypeFor(category, severity, requestedType) {
  const requested = keyOf(requestedType);
  const legacyTypes = new Set(['info', 'success', 'warning', 'error', 'booking', 'inventory', 'chat']);
  if (legacyTypes.has(requested)) return requested;
  if (category === 'appointments') return 'booking';
  if (category === 'inventory') return 'inventory';
  if (severity === 'critical') return 'error';
  if (severity === 'warning' || severity === 'success') return severity;
  return 'info';
}

function priorityFor(severity) {
  if (severity === 'critical' || severity === 'warning') return 'high';
  return 'normal';
}

function plainValue(doc, key, fallback) {
  const value = doc?.[key];
  return value === undefined ? fallback : value;
}

/** Socket payload shared by initial creates and grouping updates. */
export function toAdminNotificationPayload(notification) {
  if (!notification) return null;
  const raw = typeof notification.toObject === 'function'
    ? notification.toObject({ virtuals: true })
    : notification;
  const id = raw?._id?.toString?.() || raw?.id?.toString?.() || raw?._id || raw?.id;
  if (!id) return null;

  return {
    id: String(id),
    _id: String(id),
    title: raw.title,
    message: raw.message,
    type: raw.type || 'info',
    event: raw.event || raw.metadata?.event || raw.type || 'update',
    category: raw.category || 'system',
    severity: raw.severity || 'info',
    source: raw.source || DEFAULT_SOURCE_BY_CATEGORY[raw.category] || 'System',
    priority: raw.priority || priorityFor(raw.severity),
    isRead: Boolean(raw.isRead),
    readAt: raw.readAt || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    firstOccurredAt: raw.firstOccurredAt || raw.createdAt || null,
    lastOccurredAt: raw.lastOccurredAt || raw.createdAt || null,
    link: raw.link,
    action: raw.action,
    actionRequired: raw.actionRequired === undefined
      ? raw.severity === 'critical' || raw.severity === 'warning'
      : Boolean(raw.actionRequired),
    groupingKey: raw.groupingKey,
    groupCount: Math.max(1, Number(raw.groupCount) || 1),
    metadata: raw.metadata || {},
  };
}

/**
 * Dependency-injected factory used by focused unit tests and background jobs.
 * Production callers should normally import createAdminNotification below.
 */
export function createAdminNotificationService({
  NotificationModel = Notification,
  getSocketIO = getIO,
  now = () => new Date(),
  logger = console,
} = {}) {
  async function emit(notification) {
    const payload = toAdminNotificationPayload(notification);
    if (!payload) return;
    try {
      getSocketIO()
        .to(ADMIN_NOTIFICATION_ROOM)
        .emit(ADMIN_NOTIFICATION_EVENT, payload);
    } catch (error) {
      // Real-time delivery is an optimization. The persisted row remains the
      // source of truth and will be returned on the next API refetch.
      logger?.warn?.('[adminNotification] Socket emission unavailable:', error.message);
    }
  }

  async function create(input = {}) {
    const category = keyOf(input.category);
    if (!CATEGORY_SET.has(category)) {
      throw new TypeError(`Unsupported admin notification category: ${input.category}`);
    }

    const event = keyOf(input.event || input.kind || input.type || 'update');
    const severity = input.severity
      ? keyOf(input.severity)
      : inferAdminNotificationSeverity(event);
    if (!SEVERITY_SET.has(severity)) {
      throw new TypeError(`Unsupported admin notification severity: ${input.severity}`);
    }

    const occurredAt = asDate(input.occurredAt, now());
    const fallbackLink = buildAdminDeepLink(category);
    const link = normalizeAdminDeepLink(input.link, fallbackLink);
    const recipientUserId = idOf(input.recipientUserId);
    const recipientRole = cleanOptionalText(
      input.recipientRole || DEFAULT_ADMIN_NOTIFICATION_RECIPIENT_ROLE,
      80,
    );
    const groupingKey = cleanOptionalText(input.groupingKey, 240);
    const baseDocument = {
      title: cleanRequiredText(input.title, 'title', 180),
      message: cleanRequiredText(input.message, 'message', 1200),
      type: legacyTypeFor(category, severity, input.type),
      event,
      category,
      severity,
      source: cleanOptionalText(input.source, 120) || DEFAULT_SOURCE_BY_CATEGORY[category],
      priority: priorityFor(severity),
      recipientRole,
      recipientUserId,
      link,
      action: normalizeAction(input.action, link),
      actionRequired: input.actionRequired === undefined
        ? severity === 'critical' || severity === 'warning'
        : Boolean(input.actionRequired),
      metadata: {
        ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
        event,
      },
      firstOccurredAt: occurredAt,
      lastOccurredAt: occurredAt,
      groupCount: 1,
      ...(groupingKey ? { groupingKey } : {}),
    };

    let notification;
    if (!groupingKey) {
      notification = await NotificationModel.create(baseDocument);
    } else {
      const groupingWindowMs = positiveWindow(input.groupingWindowMs);
      const cutoff = new Date(occurredAt.getTime() - groupingWindowMs);
      const groupingBucket = buildAdminGroupingBucket(occurredAt, groupingWindowMs);
      const query = {
        recipientRole,
        recipientUserId,
        groupingKey,
        groupingBucket,
        lastOccurredAt: { $gte: cutoff },
      };
      const { firstOccurredAt: _firstOccurredAt, groupCount: _groupCount, ...refreshable } = baseDocument;
      refreshable.groupingBucket = groupingBucket;
      const update = {
        $set: refreshable,
        $setOnInsert: { firstOccurredAt: occurredAt },
        $inc: { groupCount: 1 },
      };
      const updateOptions = {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        sort: { lastOccurredAt: -1 },
      };

      try {
        notification = await NotificationModel.findOneAndUpdate(query, update, updateOptions);
      } catch (error) {
        if (error?.code !== 11000) throw error;
        // Two workers can both observe an empty group. The unique bucket index
        // chooses one insert; the loser retries as an increment on that row.
        notification = await NotificationModel.findOneAndUpdate(
          { recipientRole, recipientUserId, groupingKey, groupingBucket },
          { $set: refreshable, $inc: { groupCount: 1 } },
          { new: true, runValidators: true },
        );
        if (!notification) throw error;
      }

      const count = Math.max(1, Number(plainValue(notification, 'groupCount', 1)) || 1);
      const groupedTitle = count > 1 && input.groupedTitle
        ? formatAdminGroupedCopy(input.groupedTitle, count).slice(0, 180)
        : null;
      const groupedMessage = count > 1 && input.groupedMessage
        ? formatAdminGroupedCopy(input.groupedMessage, count).slice(0, 1200)
        : null;

      if (groupedTitle || groupedMessage) {
        const copyUpdate = {
          ...(groupedTitle ? { title: groupedTitle } : {}),
          ...(groupedMessage ? { message: groupedMessage } : {}),
        };
        if (typeof notification?.set === 'function' && typeof notification?.save === 'function') {
          notification.set(copyUpdate);
          notification = await notification.save();
        } else if (typeof NotificationModel.findByIdAndUpdate === 'function') {
          notification = await NotificationModel.findByIdAndUpdate(
            notification?._id || notification?.id,
            { $set: copyUpdate },
            { new: true, runValidators: true },
          );
        } else {
          Object.assign(notification, copyUpdate);
        }
      }
    }

    await emit(notification);
    return notification;
  }

  return Object.freeze({ createAdminNotification: create, emitAdminNotification: emit });
}

const defaultService = createAdminNotificationService();

export const createAdminNotification = defaultService.createAdminNotification;
export const emitAdminNotification = defaultService.emitAdminNotification;
