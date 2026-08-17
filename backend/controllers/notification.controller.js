import mongoose from 'mongoose';
import Notification, {
  ADMIN_NOTIFICATION_CATEGORIES,
  NOTIFICATION_SEVERITIES,
} from '../models/notification.model.js';
import NotificationUserState from '../models/notificationUserState.model.js';
import {
  getNotificationAudiencesForRole,
  isCustomerRole,
  normalizeToCanonical,
} from '../constants/roles.js';
import {
  getSalesBookingApprovalNotificationQuery,
  syncMissingSalesBalancePickupNotifications,
} from '../utils/bookingManagerNotifications.utils.js';
import { syncMissingCustomerStageNotifications } from '../utils/customerStageNotifications.utils.js';
import { syncMissingCustomerReceiptNotifications } from '../utils/customerReceiptNotification.utils.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_BULK_SIZE = 200;

const CATEGORY_ALIASES = Object.freeze({
  appointment: 'appointments',
  booking: 'appointments',
  bookings: 'appointments',
  job: 'live_tracking',
  jobs: 'live_tracking',
  tracking: 'live_tracking',
  live: 'live_tracking',
  live_tracking: 'live_tracking',
  payment: 'payments',
  revenue: 'payments',
  stock: 'inventory',
  admin: 'security',
  audit: 'security',
  notifications: 'system',
});

const CATEGORY_SET = new Set(ADMIN_NOTIFICATION_CATEGORIES);
const SEVERITY_SET = new Set(NOTIFICATION_SEVERITIES);

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitQueryValues(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parsePositiveInteger(value, fallback, field, max = Number.MAX_SAFE_INTEGER) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw requestError(`${field} must be an integer between 1 and ${max}.`);
  }
  return parsed;
}

function parseBoolean(value, field) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw requestError(`${field} must be true or false.`);
}

function normalizeCategory(value) {
  const normalized = CATEGORY_ALIASES[value] || value;
  return CATEGORY_SET.has(normalized) ? normalized : null;
}

function parseCategories(value, field = 'category') {
  const values = splitQueryValues(value);
  const invalid = values.filter((entry) => !normalizeCategory(entry));
  if (invalid.length) {
    throw requestError(
      `${field} contains unsupported value(s): ${invalid.join(', ')}. `
      + `Allowed categories: ${ADMIN_NOTIFICATION_CATEGORIES.join(', ')}.`
    );
  }
  return [...new Set(values.map(normalizeCategory))];
}

function parseSeverities(value) {
  const values = splitQueryValues(value);
  const invalid = values.filter((entry) => !SEVERITY_SET.has(entry));
  if (invalid.length) {
    throw requestError(
      `severity contains unsupported value(s): ${invalid.join(', ')}. `
      + `Allowed severities: ${NOTIFICATION_SEVERITIES.join(', ')}.`
    );
  }
  return [...new Set(values)];
}

function parseEventTypes(value) {
  const values = splitQueryValues(value);
  const invalid = values.filter(
    (entry) => entry.length > 100 || !/^[a-z0-9_.:-]+$/.test(entry)
  );
  if (invalid.length) throw requestError('type contains an invalid notification type.');
  return [...new Set(values)];
}

function parseDate(value, field, endOfDay = false) {
  if (value == null || value === '') return null;
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw requestError(`${field} must be a valid date.`);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function getUserObjectId(req) {
  const id = req.user?._id || req.user?.id;
  if (!mongoose.isValidObjectId(id)) throw requestError('Authenticated user ID is invalid.', 401);
  return new mongoose.Types.ObjectId(id);
}

export function buildNotificationsQuery(role, userId) {
  if (normalizeToCanonical(role) === 'sales') {
    return getSalesBookingApprovalNotificationQuery();
  }

  const recipientRoles = getNotificationAudiencesForRole(role);
  const broadcastRoles = recipientRoles.filter((recipientRole) => recipientRole !== 'customer');

  return {
    $or: [
      ...(broadcastRoles.length > 0
        ? [{
            recipientRole: { $in: broadcastRoles },
            $or: [
              { recipientUserId: null },
              { recipientUserId: { $exists: false } },
            ],
          }]
        : []),
      { recipientUserId: userId },
    ],
  };
}

function legacyCategoryExpression() {
  const type = { $toLower: { $ifNull: ['$type', ''] } };
  return {
    $switch: {
      branches: [
        { case: { $in: [type, ['booking', 'appointment', 'appointments']] }, then: 'appointments' },
        { case: { $in: [type, ['job', 'tracking', 'live_tracking']] }, then: 'live_tracking' },
        { case: { $in: [type, ['payment', 'payments', 'revenue']] }, then: 'payments' },
        { case: { $in: [type, ['inventory', 'stock']] }, then: 'inventory' },
        { case: { $in: [type, ['security', 'audit']] }, then: 'security' },
      ],
      default: 'system',
    },
  };
}

function legacySeverityExpression() {
  const type = { $toLower: { $ifNull: ['$type', ''] } };
  return {
    $switch: {
      branches: [
        { case: { $in: [type, ['error', 'critical']] }, then: 'critical' },
        { case: { $eq: [type, 'warning'] }, then: 'warning' },
        { case: { $eq: [type, 'success'] }, then: 'success' },
        { case: { $eq: ['$priority', 'high'] }, then: 'warning' },
      ],
      default: 'info',
    },
  };
}

function commonNotificationPipeline(role, userId, extraMatch = null) {
  const accessQuery = buildNotificationsQuery(role, userId);
  const initialMatch = extraMatch
    ? { $and: [accessQuery, extraMatch] }
    : accessQuery;

  const latestOccurrence = { $ifNull: ['$lastOccurredAt', '$createdAt'] };
  const hasExplicitReadState = {
    $ne: [{ $ifNull: ['$__userState.readStateChangedAt', null] }, null],
  };
  const stateReadCoversLatestOccurrence = {
    $and: [
      { $ne: [{ $ifNull: ['$__userState.readAt', null] }, null] },
      { $gte: ['$__userState.readAt', latestOccurrence] },
    ],
  };
  const stateArchiveCoversLatestOccurrence = {
    $and: [
      { $ne: [{ $ifNull: ['$__userState.archivedAt', null] }, null] },
      { $gte: ['$__userState.archivedAt', latestOccurrence] },
    ],
  };
  const stateClearCoversLatestOccurrence = {
    $and: [
      { $ne: [{ $ifNull: ['$__userState.clearedAt', null] }, null] },
      { $gte: ['$__userState.clearedAt', latestOccurrence] },
    ],
  };
  const legacyTargetedRead = {
    $and: [
      { $eq: ['$recipientUserId', userId] },
      { $eq: ['$isRead', true] },
    ],
  };

  return [
    { $match: initialMatch },
    {
      $lookup: {
        from: NotificationUserState.collection.name,
        let: { notificationId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$notificationId', '$$notificationId'] },
                  { $eq: ['$userId', userId] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: '__userStates',
      },
    },
    { $set: { __userState: { $arrayElemAt: ['$__userStates', 0] } } },
    {
      $set: {
        category: { $ifNull: ['$category', legacyCategoryExpression()] },
        severity: { $ifNull: ['$severity', legacySeverityExpression()] },
        event: { $ifNull: ['$event', '$type'] },
        isRead: {
          $cond: [hasExplicitReadState, stateReadCoversLatestOccurrence, legacyTargetedRead],
        },
        readAt: {
          $cond: [
            hasExplicitReadState,
            {
              $cond: [
                stateReadCoversLatestOccurrence,
                '$__userState.readAt',
                null,
              ],
            },
            {
              $cond: [
                legacyTargetedRead,
                { $ifNull: ['$readAt', { $ifNull: ['$updatedAt', '$createdAt'] }] },
                null,
              ],
            },
          ],
        },
        archivedAt: {
          $cond: [stateArchiveCoversLatestOccurrence, '$__userState.archivedAt', null],
        },
        clearedAt: {
          $cond: [stateClearCoversLatestOccurrence, '$__userState.clearedAt', null],
        },
        groupCount: { $ifNull: ['$groupCount', 1] },
        firstOccurredAt: { $ifNull: ['$firstOccurredAt', '$createdAt'] },
        lastOccurredAt: { $ifNull: ['$lastOccurredAt', '$createdAt'] },
      },
    },
    {
      $set: {
        source: { $ifNull: ['$source', '$category'] },
        sourceModule: { $ifNull: ['$source', '$category'] },
        destination: '$link',
        quickAction: '$action',
        actionRequired: {
          $or: [
            { $eq: ['$actionRequired', true] },
            { $in: ['$severity', ['critical', 'warning']] },
          ],
        },
        isArchived: {
          $ne: [{ $ifNull: ['$archivedAt', null] }, null],
        },
        id: { $toString: '$_id' },
      },
    },
  ];
}

const publicProjection = {
  __userStates: 0,
  __userState: 0,
  clearedAt: 0,
  groupingBucket: 0,
};

function visibleMatch() {
  return { clearedAt: null, archivedAt: null };
}

function parseListOptions(query = {}) {
  const page = parsePositiveInteger(query.page, 1, 'page');
  const limit = parsePositiveInteger(query.limit, DEFAULT_PAGE_SIZE, 'limit', MAX_PAGE_SIZE);
  const search = String(query.search || '').trim();
  if (search.length > 160) throw requestError('search may not exceed 160 characters.');

  const categories = parseCategories(query.category);
  const severities = parseSeverities(query.severity);
  const typeValues = splitQueryValues(query.type);
  const categoryTypes = [];
  const eventTypes = [];
  for (const value of typeValues) {
    const category = normalizeCategory(value);
    if (category) categoryTypes.push(category);
    else eventTypes.push(...parseEventTypes(value));
  }

  let readStatus = String(query.readStatus ?? query.readState ?? 'all').trim().toLowerCase();
  if (query.isRead != null || query.read != null) {
    readStatus = parseBoolean(query.isRead ?? query.read, 'isRead') ? 'read' : 'unread';
  }
  const tab = String(query.tab || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (tab === 'unread') readStatus = 'unread';
  if (!['all', 'read', 'unread'].includes(readStatus)) {
    throw requestError('readStatus must be all, read, or unread.');
  }

  let archived = String(query.archived ?? 'exclude').trim().toLowerCase();
  if (archived === 'false') archived = 'exclude';
  if (archived === 'true') archived = 'only';
  if (archived === 'all') archived = 'include';
  if (!['exclude', 'include', 'only'].includes(archived)) {
    throw requestError('archived must be exclude, include, or only.');
  }

  let actionRequired = query.actionRequired == null
    ? null
    : parseBoolean(query.actionRequired, 'actionRequired');
  if (tab === 'action_required' || tab === 'action') actionRequired = true;

  const source = String(query.source || '').trim();
  if (source.length > 120) throw requestError('source may not exceed 120 characters.');

  const from = parseDate(query.from, 'from');
  const to = parseDate(query.to, 'to', true);
  if (from && to && from > to) throw requestError('from must be earlier than or equal to to.');

  const sort = String(query.sort || 'newest').trim().toLowerCase();
  if (!['newest', 'oldest'].includes(sort)) {
    throw requestError('sort must be newest or oldest.');
  }

  return {
    page,
    limit,
    search,
    categories,
    categoryTypes: [...new Set(categoryTypes)],
    eventTypes,
    severities,
    readStatus,
    archived,
    actionRequired,
    systemTab: tab === 'system',
    source,
    from,
    to,
    sort,
  };
}

function listFilterStages(options) {
  const stages = [];

  if (options.search) {
    const regex = new RegExp(escapeRegex(options.search), 'i');
    stages.push({
      $match: {
        $or: [
          { title: regex },
          { message: regex },
          { source: regex },
          { type: regex },
        ],
      },
    });
  }

  if (options.categories.length) {
    stages.push({ $match: { category: { $in: options.categories } } });
  }

  if (options.categoryTypes.length || options.eventTypes.length) {
    const clauses = [];
    if (options.categoryTypes.length) {
      clauses.push({ category: { $in: options.categoryTypes } });
    }
    if (options.eventTypes.length) {
      clauses.push({
        $or: [
          { event: { $in: options.eventTypes } },
          { type: { $in: options.eventTypes } },
        ],
      });
    }
    stages.push({ $match: clauses.length === 1 ? clauses[0] : { $or: clauses } });
  }

  if (options.severities.length) {
    stages.push({ $match: { severity: { $in: options.severities } } });
  }

  if (options.systemTab) {
    stages.push({ $match: { category: { $in: ['system', 'security'] } } });
  }

  if (options.source) {
    stages.push({ $match: { source: new RegExp(`^${escapeRegex(options.source)}$`, 'i') } });
  }

  if (options.readStatus !== 'all') {
    stages.push({ $match: { isRead: options.readStatus === 'read' } });
  }

  if (options.actionRequired != null) {
    stages.push({ $match: { actionRequired: options.actionRequired } });
  }

  if (options.archived === 'exclude') stages.push({ $match: { archivedAt: null } });
  if (options.archived === 'only') stages.push({ $match: { archivedAt: { $ne: null } } });
  stages.push({ $match: { clearedAt: null } });

  if (options.from || options.to) {
    const dateQuery = {};
    if (options.from) dateQuery.$gte = options.from;
    if (options.to) dateQuery.$lte = options.to;
    stages.push({ $match: { lastOccurredAt: dateQuery } });
  }

  return stages;
}

function sortFor(options) {
  const direction = options.sort === 'oldest' ? 1 : -1;
  return { lastOccurredAt: direction, createdAt: direction, _id: direction };
}

function countFromFacet(rows) {
  return rows?.[0]?.count || 0;
}

function facetMap(rows = []) {
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

async function unreadCountFor(role, userId) {
  const rows = await Notification.aggregate([
    ...commonNotificationPipeline(role, userId),
    { $match: visibleMatch() },
    { $match: { isRead: false } },
    { $count: 'count' },
  ]);
  return countFromFacet(rows);
}

async function enrichedNotificationById(role, userId, notificationId) {
  const rows = await Notification.aggregate([
    ...commonNotificationPipeline(role, userId, { _id: notificationId }),
    { $project: publicProjection },
    { $limit: 1 },
  ]);
  return rows[0] || null;
}

async function syncNotificationsForCurrentUser(role, userId) {
  if (isCustomerRole(role)) {
    try {
      await syncMissingCustomerStageNotifications(userId);
    } catch (error) {
      console.warn('[notifications] Stage sync failed:', error.message);
    }
    try {
      await syncMissingCustomerReceiptNotifications(userId);
    } catch (error) {
      console.warn('[notifications] Receipt sync failed:', error.message);
    }
  }

  if (normalizeToCanonical(role) === 'sales') {
    try {
      await syncMissingSalesBalancePickupNotifications();
    } catch (error) {
      console.warn('[notifications] Balance pickup sync failed:', error.message);
    }
  }
}

/**
 * Searchable, filterable and paginated notifications for the current user.
 * Mutable state is enriched from NotificationUserState before filters run.
 */
export const getNotifications = async (req, res, next) => {
  try {
    const role = req.user.role;
    const userId = getUserObjectId(req);
    const options = parseListOptions(req.query);
    await syncNotificationsForCurrentUser(role, userId);

    const filters = listFilterStages(options);
    const [result = {}] = await Notification.aggregate([
      ...commonNotificationPipeline(role, userId),
      {
        $facet: {
          data: [
            ...filters,
            { $sort: sortFor(options) },
            { $skip: (options.page - 1) * options.limit },
            { $limit: options.limit },
            { $project: publicProjection },
          ],
          total: [...filters, { $count: 'count' }],
          unread: [
            { $match: visibleMatch() },
            { $match: { isRead: false } },
            { $count: 'count' },
          ],
          summary: [
            { $match: visibleMatch() },
            {
              $group: {
                _id: null,
                all: { $sum: 1 },
                unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
                actionRequired: {
                  $sum: { $cond: [{ $eq: ['$actionRequired', true] }, 1, 0] },
                },
                system: {
                  $sum: {
                    $cond: [{ $in: ['$category', ['system', 'security']] }, 1, 0],
                  },
                },
              },
            },
          ],
          categoryCounts: [
            { $match: visibleMatch() },
            { $group: { _id: '$category', count: { $sum: 1 } } },
          ],
          severityCounts: [
            { $match: visibleMatch() },
            { $group: { _id: '$severity', count: { $sum: 1 } } },
          ],
        },
      },
    ]).allowDiskUse(true);

    const total = countFromFacet(result.total);
    const unreadCount = countFromFacet(result.unread);
    const summary = result.summary?.[0] || {};
    const pages = Math.ceil(total / options.limit);

    res.json({
      success: true,
      data: result.data || [],
      unreadCount,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages,
        hasNextPage: options.page < pages,
        hasPreviousPage: options.page > 1,
      },
      facets: {
        all: summary.all || 0,
        unread: summary.unread || 0,
        actionRequired: summary.actionRequired || 0,
        system: summary.system || 0,
        categories: facetMap(result.categoryCounts),
        severities: facetMap(result.severityCounts),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = getUserObjectId(req);
    const unreadCount = await unreadCountFor(req.user.role, userId);
    res.json({ success: true, unreadCount });
  } catch (error) {
    next(error);
  }
};

function normalizeNotificationIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw requestError('ids must be a non-empty array.');
  }
  if (value.length > MAX_BULK_SIZE) {
    throw requestError(`A maximum of ${MAX_BULK_SIZE} notification IDs may be changed at once.`);
  }

  const stringIds = [...new Set(value.map((entry) => String(entry)))];
  const invalid = stringIds.filter((id) => !mongoose.isValidObjectId(id));
  if (invalid.length) throw requestError('ids contains an invalid notification ID.');
  return stringIds.map((id) => new mongoose.Types.ObjectId(id));
}

async function findAccessibleNotifications(role, userId, notificationIds) {
  return Notification.find({
    $and: [
      buildNotificationsQuery(role, userId),
      { _id: { $in: notificationIds } },
    ],
  })
    .select('_id recipientUserId isRead readAt')
    .lean();
}

async function applyUserState(userId, notificationIds, statePatch) {
  if (!notificationIds.length) return;
  const operations = notificationIds.map((notificationId) => ({
    updateOne: {
      filter: { notificationId, userId },
      update: {
        $setOnInsert: { notificationId, userId },
        $set: statePatch,
      },
      upsert: true,
    },
  }));
  await NotificationUserState.bulkWrite(operations, { ordered: false });
}

async function mirrorTargetedLegacyReadState(userId, notifications, isRead, readAt) {
  const targetedIds = notifications
    .filter((notification) => String(notification.recipientUserId || '') === String(userId))
    .map((notification) => notification._id);
  if (!targetedIds.length) return;
  await Notification.updateMany(
    { _id: { $in: targetedIds }, recipientUserId: userId },
    { $set: { isRead, readAt } }
  );
}

/** Mark one notification read or unread. Omitted body remains legacy read=true. */
export const markAsRead = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw requestError('Notification ID is invalid.');
    }
    const isRead = req.body?.isRead == null ? true : parseBoolean(req.body.isRead, 'isRead');
    const userId = getUserObjectId(req);
    const notificationId = new mongoose.Types.ObjectId(req.params.id);
    const notifications = await findAccessibleNotifications(
      req.user.role,
      userId,
      [notificationId]
    );
    if (!notifications.length) {
      throw requestError('Notification not found.', 404);
    }

    const changedAt = new Date();
    const readAt = isRead ? changedAt : null;
    await applyUserState(userId, [notificationId], { readAt, readStateChangedAt: changedAt });
    await mirrorTargetedLegacyReadState(userId, notifications, isRead, readAt);

    const [notification, unreadCount] = await Promise.all([
      enrichedNotificationById(req.user.role, userId, notificationId),
      unreadCountFor(req.user.role, userId),
    ]);
    res.json({ success: true, data: notification, unreadCount });
  } catch (error) {
    next(error);
  }
};

/** Mark every visible accessible notification read for only the current user. */
export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = getUserObjectId(req);
    const rows = await Notification.aggregate([
      ...commonNotificationPipeline(req.user.role, userId),
      { $match: visibleMatch() },
      { $match: { isRead: false } },
      { $project: { _id: 1, recipientUserId: 1 } },
    ]).allowDiskUse(true);
    const notificationIds = rows.map((row) => row._id);
    const readAt = new Date();
    await applyUserState(userId, notificationIds, { readAt, readStateChangedAt: readAt });
    await mirrorTargetedLegacyReadState(userId, rows, true, readAt);
    const unreadCount = await unreadCountFor(req.user.role, userId);

    res.json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount: notificationIds.length,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

/** Bulk read/unread toggle for an explicitly scoped set of notifications. */
export const bulkSetReadState = async (req, res, next) => {
  try {
    const requestedIds = normalizeNotificationIds(req.body?.ids);
    if (req.body?.isRead == null) throw requestError('isRead is required.');
    const isRead = parseBoolean(req.body.isRead, 'isRead');
    const userId = getUserObjectId(req);
    const notifications = await findAccessibleNotifications(req.user.role, userId, requestedIds);
    const notificationIds = notifications.map((notification) => notification._id);
    const changedAt = new Date();
    const readAt = isRead ? changedAt : null;
    await applyUserState(userId, notificationIds, { readAt, readStateChangedAt: changedAt });
    await mirrorTargetedLegacyReadState(userId, notifications, isRead, readAt);
    const unreadCount = await unreadCountFor(req.user.role, userId);

    res.json({
      success: true,
      modifiedCount: notificationIds.length,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

/** Archive/restore is per user; source broadcast rows are never destroyed. */
export const bulkSetArchivedState = async (req, res, next) => {
  try {
    const requestedIds = normalizeNotificationIds(req.body?.ids);
    const archived = req.body?.archived == null
      ? true
      : parseBoolean(req.body.archived, 'archived');
    const userId = getUserObjectId(req);
    const notifications = await findAccessibleNotifications(req.user.role, userId, requestedIds);
    const notificationIds = notifications.map((notification) => notification._id);
    await applyUserState(userId, notificationIds, {
      archivedAt: archived ? new Date() : null,
    });
    const unreadCount = await unreadCountFor(req.user.role, userId);

    res.json({
      success: true,
      archived,
      modifiedCount: notificationIds.length,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear is a per-user soft removal and requires explicit IDs. This preserves the
 * operational record and cannot clear another administrator's notification.
 */
export const clearNotifications = async (req, res, next) => {
  try {
    const requestedIds = normalizeNotificationIds(req.body?.ids);
    const userId = getUserObjectId(req);
    const notifications = await findAccessibleNotifications(req.user.role, userId, requestedIds);
    const notificationIds = notifications.map((notification) => notification._id);
    const now = new Date();
    await applyUserState(userId, notificationIds, {
      clearedAt: now,
      readAt: now,
      readStateChangedAt: now,
    });
    await mirrorTargetedLegacyReadState(userId, notifications, true, now);
    const unreadCount = await unreadCountFor(req.user.role, userId);

    res.json({
      success: true,
      clearedCount: notificationIds.length,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

/** Create a new notification (legacy internal utility). */
export const createNotification = async (data) => {
  try {
    return await Notification.create(data);
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
};
