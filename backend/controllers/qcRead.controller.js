import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import { getOrSetResponseCache } from '../utils/responseCache.utils.js';

const QC_APPROVED_ORDER_STATUSES = ['completed', 'released'];
const QC_APPROVED_TRACKER_STAGES = ['ready_pickup', 'completed', 'released'];
const ACTIVE_STATUSES = [
  'approved',
  'confirmed',
  'assigned',
  'received',
  'in_progress',
  'ready_for_payment',
  'paid',
  'completed',
  'released',
];
const QUEUE_STATUSES = [
  'approved',
  'confirmed',
  'assigned',
  'received',
  'in_progress',
  'ready_for_payment',
  'paid',
];
const RETURN_NOTE_PATTERN = /^\[QC_RETURN\]/i;
const QC_STATS_CACHE_TTL_MS = 30_000;
const QC_ACTIVITY_CACHE_TTL_MS = 10_000;
const QC_TECHNICIAN_CACHE_TTL_MS = 60_000;

const normalizeRangeDays = (value) => {
  const days = Number(value);
  return [1, 7, 14, 30].includes(days) ? days : 14;
};

const makeDateMidnight = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatTrendDate = (value) => {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
};

const resolveTrendRange = (rangeDays) => {
  const safeDays = normalizeRangeDays(rangeDays);
  const today = makeDateMidnight(new Date());
  const todayEnd = new Date(today);
  todayEnd.setDate(today.getDate() + 1);

  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - (safeDays - 1));
  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - safeDays);
  const trendStart = new Date(today);
  trendStart.setDate(today.getDate() - ((safeDays * 2) - 1));

  return { safeDays, today, todayEnd, currentStart, previousStart, trendStart };
};

const resolveQcScopeFilter = (req) => {
  const scope = String(req.query.scope || req.query.myJobsScope || '').toLowerCase();
  const flag = String(req.query.myJobs || req.query.my_jobs || req.query.mine || '').toLowerCase();
  const mine = ['mine', 'my-jobs', 'myjobs', 'me'].includes(scope)
    || flag === '1'
    || flag === 'true';
  if (!mine) return {};

  const userId = String(req.user?.id || req.user?._id || '');
  if (!userId) return {};
  return {
    assignedDetailer: mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId,
  };
};

const getScopeCacheKey = (scopeMatch) =>
  scopeMatch.assignedDetailer ? `mine:${String(scopeMatch.assignedDetailer)}` : 'all';

const getApprovalDateExpression = () => ({
  $ifNull: [
    '$qcCompletedAt',
    {
      $cond: [
        { $in: ['$serviceTrackingStage', QC_APPROVED_TRACKER_STAGES] },
        { $ifNull: ['$serviceTrackingUpdatedAt', '$updatedAt'] },
        {
          $cond: [
            { $in: ['$status', QC_APPROVED_ORDER_STATUSES] },
            '$updatedAt',
            null,
          ],
        },
      ],
    },
  ],
});

const dateInRange = (dateExpression, start, end) => ({
  $and: [
    { $gte: [dateExpression, start] },
    { $lt: [dateExpression, end] },
  ],
});

const sumCondition = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

const makeTrendData = (days, start, approvedRows, returnedRows) => {
  const rows = new Map();
  const end = new Date(start);
  end.setDate(end.getDate() + (days * 2) - 1);

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const key = formatTrendDate(date);
    rows.set(key, { date: key, approved: 0, returned: 0 });
  }
  for (const row of approvedRows || []) {
    const target = rows.get(row._id);
    if (target) target.approved = Number(row.count) || 0;
  }
  for (const row of returnedRows || []) {
    const target = rows.get(row._id);
    if (target) target.returned = Number(row.count) || 0;
  }
  return [...rows.values()];
};

const makeRangeSummary = (approved, returned) => {
  const throughput = approved + returned;
  return {
    approved,
    returned,
    throughput,
    reviewedOutcomes: throughput,
    approvalRate: throughput > 0 ? Math.round((approved / throughput) * 100) : 0,
  };
};

const formatAverageDuration = (averageMs) => {
  const minutes = Math.round((Number(averageMs) || 0) / 60_000);
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const buildStatsData = async (scopeMatch, range) => {
  const [result = {}] = await Order.aggregate([
    { $match: { archived: false, ...scopeMatch } },
    {
      $project: {
        _id: 1,
        status: 1,
        serviceType: 1,
        createdAt: 1,
        qcCompletedAt: 1,
        approvalDate: getApprovalDateExpression(),
        hasDamageAnnotations: {
          $gt: [{ $size: { $ifNull: ['$damageAnnotations', []] } }, 0],
        },
        returnEvents: {
          $filter: {
            input: { $ifNull: ['$staffNotes', []] },
            as: 'note',
            cond: {
              $regexMatch: {
                input: { $ifNull: ['$$note.content', ''] },
                regex: RETURN_NOTE_PATTERN,
              },
            },
          },
        },
      },
    },
    {
      $set: {
        isApproved: { $ne: ['$approvalDate', null] },
        isReturned: { $gt: [{ $size: '$returnEvents' }, 0] },
      },
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              awaiting: sumCondition({ $in: ['$status', QUEUE_STATUSES] }),
              approvedToday: sumCondition({
                $and: [
                  '$isApproved',
                  dateInRange('$approvalDate', range.today, range.todayEnd),
                ],
              }),
              returned: sumCondition('$isReturned'),
              approvedCurrent: sumCondition({
                $and: [
                  '$isApproved',
                  dateInRange('$approvalDate', range.currentStart, range.todayEnd),
                ],
              }),
              approvedPrevious: sumCondition({
                $and: [
                  '$isApproved',
                  dateInRange('$approvalDate', range.previousStart, range.currentStart),
                ],
              }),
              returnedCurrent: {
                $sum: {
                  $size: {
                    $filter: {
                      input: '$returnEvents',
                      as: 'event',
                      cond: dateInRange('$$event.createdAt', range.currentStart, range.todayEnd),
                    },
                  },
                },
              },
              returnedPrevious: {
                $sum: {
                  $size: {
                    $filter: {
                      input: '$returnEvents',
                      as: 'event',
                      cond: dateInRange('$$event.createdAt', range.previousStart, range.currentStart),
                    },
                  },
                },
              },
              qcApprovedLifetime: sumCondition('$isApproved'),
              totalQCReviewed: sumCondition({ $or: ['$isApproved', '$isReturned'] }),
              aiPending: sumCondition({
                $and: [
                  { $in: ['$status', QUEUE_STATUSES] },
                  '$hasDamageAnnotations',
                ],
              }),
              averageReviewMs: {
                $avg: {
                  $cond: [
                    { $ne: ['$qcCompletedAt', null] },
                    { $subtract: ['$qcCompletedAt', '$createdAt'] },
                    null,
                  ],
                },
              },
            },
          },
        ],
        serviceDistribution: [
          { $match: { status: { $in: ACTIVE_STATUSES } } },
          { $group: { _id: '$serviceType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 6 },
        ],
        approvedTrend: [
          {
            $match: {
              isApproved: true,
              approvalDate: { $gte: range.trendStart, $lt: range.todayEnd },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%m/%d', date: '$approvalDate' } },
              count: { $sum: 1 },
            },
          },
        ],
        returnedTrend: [
          { $unwind: '$returnEvents' },
          {
            $match: {
              'returnEvents.createdAt': { $gte: range.trendStart, $lt: range.todayEnd },
            },
          },
          {
            $group: {
              _id: {
                day: { $dateToString: { format: '%m/%d', date: '$returnEvents.createdAt' } },
                orderId: '$_id',
              },
            },
          },
          { $group: { _id: '$_id.day', count: { $sum: 1 } } },
        ],
        topReturnReasons: [
          { $unwind: '$returnEvents' },
          {
            $match: {
              'returnEvents.createdAt': { $gte: range.currentStart, $lt: range.todayEnd },
            },
          },
          {
            $project: {
              reason: {
                $trim: {
                  input: {
                    $toLower: {
                      $replaceOne: {
                        input: { $ifNull: ['$returnEvents.content', ''] },
                        find: '[QC_RETURN]',
                        replacement: '',
                      },
                    },
                  },
                },
              },
            },
          },
          { $match: { reason: { $ne: '' } } },
          { $group: { _id: '$reason', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 6 },
        ],
      },
    },
  ]).option({ maxTimeMS: 5_000 });

  const summary = result.summary?.[0] || {};
  const allTrendData = makeTrendData(
    range.safeDays,
    range.trendStart,
    result.approvedTrend,
    result.returnedTrend
  );
  const trendData = allTrendData.slice(-range.safeDays);
  const currentSummary = makeRangeSummary(
    Number(summary.approvedCurrent) || 0,
    Number(summary.returnedCurrent) || 0
  );
  const previousSummary = makeRangeSummary(
    Number(summary.approvedPrevious) || 0,
    Number(summary.returnedPrevious) || 0
  );
  const approvedLifetime = Number(summary.qcApprovedLifetime) || 0;
  const returnedLifetime = Number(summary.returned) || 0;
  const totalReviewed = Number(summary.totalQCReviewed) || 0;

  return {
    awaiting: Number(summary.awaiting) || 0,
    approvedToday: Number(summary.approvedToday) || 0,
    returned: returnedLifetime,
    qcApprovedLifetime: approvedLifetime,
    totalQCReviewed: totalReviewed,
    qcApprovalRatePct: totalReviewed > 0
      ? Math.round((approvedLifetime / totalReviewed) * 100)
      : 0,
    qcReturnRatePct: totalReviewed > 0
      ? Math.round((returnedLifetime / totalReviewed) * 100)
      : 0,
    aiPending: Number(summary.aiPending) || 0,
    avgReviewTime: formatAverageDuration(summary.averageReviewMs),
    trendData,
    rangeSummary: {
      days: range.safeDays,
      label: range.safeDays === 1 ? 'Today' : `Last ${range.safeDays} Days`,
      ...currentSummary,
      previous: previousSummary,
    },
    serviceDistribution: (result.serviceDistribution || []).map((entry) => ({
      name: entry._id || 'Other',
      value: entry.count,
    })),
    topReturnReasons: (result.topReturnReasons || []).map((entry) => ({
      reason: String(entry._id || 'Unspecified').trim(),
      count: Number(entry.count) || 0,
    })),
  };
};

export const readQCStats = async (req, rangeDays = 14) => {
  const range = resolveTrendRange(rangeDays);
  const scopeMatch = resolveQcScopeFilter(req);
  const cacheKey = `qc:stats:${getScopeCacheKey(scopeMatch)}:days:${range.safeDays}`;
  return getOrSetResponseCache(
    cacheKey,
    QC_STATS_CACHE_TTL_MS,
    () => buildStatsData(scopeMatch, range)
  );
};

export const getQCStatsOptimized = async (req, res, next) => {
  try {
    const cached = await readQCStats(req, req.query.rangeDays || req.query.days || 14);
    res.setHeader?.('X-Response-Cache', cached.status);
    return res.json({ success: true, data: cached.value });
  } catch (error) {
    return next(error);
  }
};

const encodeActivityCursor = (order) => Buffer.from(JSON.stringify({
  updatedAt: new Date(order.updatedAt).toISOString(),
  id: String(order._id),
})).toString('base64url');

const decodeActivityCursor = (value) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime()) || !mongoose.Types.ObjectId.isValid(parsed.id)) return null;
    return { updatedAt, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch {
    return null;
  }
};

export const readQCActivity = async (req, options = {}) => {
  const limit = Math.min(Math.max(Number.parseInt(options.limit, 10) || 20, 1), 50);
  const rawCursor = String(options.cursor || '').trim();
  const cursor = decodeActivityCursor(rawCursor);
  if (rawCursor && !cursor) return null;

  const scopeMatch = resolveQcScopeFilter(req);
  const cacheKey = `qc:activity:${getScopeCacheKey(scopeMatch)}:limit:${limit}:cursor:${rawCursor || 'first'}`;
  return getOrSetResponseCache(cacheKey, QC_ACTIVITY_CACHE_TTL_MS, async () => {
    const filters = [
      { archived: false },
      scopeMatch,
      {
        $or: [
          { qcCompletedAt: { $exists: true, $ne: null } },
          { serviceTrackingStage: { $in: QC_APPROVED_TRACKER_STAGES } },
          { status: { $in: QC_APPROVED_ORDER_STATUSES } },
          { 'staffNotes.content': RETURN_NOTE_PATTERN },
        ],
      },
    ];
    if (cursor) {
      filters.push({
        $or: [
          { updatedAt: { $lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
        ],
      });
    }

    const rows = await Order.find({ $and: filters })
      .select([
        'orderNumber',
        'bookingReference',
        'customerName',
        'vehicleYear',
        'vehicleMake',
        'vehicleModel',
        'serviceType',
        'staffNotes.content',
        'staffNotes.detailerName',
        'staffNotes.createdAt',
        'qcCompletedAt',
        'serviceTrackingStage',
        'serviceTrackingUpdatedAt',
        'updatedAt',
      ].join(' '))
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .maxTimeMS(5_000)
      .lean();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const data = pageRows.map((order) => {
      const returnNote = [...(order.staffNotes || [])]
        .reverse()
        .find((note) => RETURN_NOTE_PATTERN.test(String(note.content || '')));
      const approvalTimestamp = order.qcCompletedAt
        || (QC_APPROVED_TRACKER_STAGES.includes(order.serviceTrackingStage)
          ? order.serviceTrackingUpdatedAt || order.updatedAt
          : order.updatedAt);

      return {
        id: String(order._id),
        jobId: order.orderNumber || order.bookingReference || String(order._id),
        type: returnNote ? 'returned' : 'approved',
        customer: order.customerName || 'Unknown',
        vehicle: [order.vehicleYear, order.vehicleMake, order.vehicleModel]
          .filter(Boolean)
          .join(' ') || 'Unknown Vehicle',
        service: order.serviceType || 'Service',
        actor: returnNote?.detailerName || 'QC Checker',
        timestamp: new Date(returnNote?.createdAt || approvalTimestamp || order.updatedAt).toISOString(),
        note: returnNote
          ? String(returnNote.content || '').replace(/^\[QC_RETURN\]\s*/i, '')
          : null,
      };
    });

    return {
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && pageRows.length
          ? encodeActivityCursor(pageRows[pageRows.length - 1])
          : null,
      },
    };
  });
};

export const getQCActivityOptimized = async (req, res, next) => {
  try {
    const cached = await readQCActivity(req, {
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    if (!cached) {
      return res.status(400).json({ success: false, message: 'Invalid activity cursor.' });
    }
    res.setHeader?.('X-Response-Cache', cached.status);
    return res.json({ success: true, ...cached.value });
  } catch (error) {
    return next(error);
  }
};

const buildTechnicianReport = async (scopeMatch) => {
  const rows = await Order.aggregate([
    {
      $match: {
        archived: false,
        ...scopeMatch,
        $or: [
          { qcCompletedAt: { $exists: true, $ne: null } },
          { serviceTrackingStage: { $in: QC_APPROVED_TRACKER_STAGES } },
          { status: { $in: QC_APPROVED_ORDER_STATUSES } },
          { 'staffNotes.content': RETURN_NOTE_PATTERN },
        ],
      },
    },
    {
      $project: {
        assignedDetailer: 1,
        approved: {
          $cond: [
            {
              $or: [
                { $ne: [{ $ifNull: ['$qcCompletedAt', null] }, null] },
                { $in: ['$serviceTrackingStage', QC_APPROVED_TRACKER_STAGES] },
                { $in: ['$status', QC_APPROVED_ORDER_STATUSES] },
              ],
            },
            1,
            0,
          ],
        },
        returned: {
          $cond: [
            {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ['$staffNotes', []] },
                      as: 'note',
                      cond: {
                        $regexMatch: {
                          input: { $ifNull: ['$$note.content', ''] },
                          regex: RETURN_NOTE_PATTERN,
                        },
                      },
                    },
                  },
                },
                0,
              ],
            },
            1,
            0,
          ],
        },
        fallbackName: {
          $let: {
            vars: {
              lead: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: { $ifNull: ['$serviceStaffAssignments', []] },
                      as: 'assignment',
                      cond: { $eq: ['$$assignment.slot', 'staff1'] },
                    },
                  },
                  0,
                ],
              },
            },
            in: { $ifNull: ['$$lead.name', ''] },
          },
        },
      },
    },
    {
      $group: {
        _id: { assignedDetailer: '$assignedDetailer', fallbackName: '$fallbackName' },
        approved: { $sum: '$approved' },
        returned: { $sum: '$returned' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.assignedDetailer',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 0, name: 1 } }],
        as: 'detailer',
      },
    },
    {
      $project: {
        approved: 1,
        returned: 1,
        name: {
          $let: {
            vars: {
              detailerName: {
                $trim: { input: { $ifNull: [{ $arrayElemAt: ['$detailer.name', 0] }, ''] } },
              },
              fallbackName: { $trim: { input: { $ifNull: ['$_id.fallbackName', ''] } } },
            },
            in: {
              $cond: [
                { $gt: [{ $strLenCP: '$$detailerName' }, 0] },
                '$$detailerName',
                {
                  $cond: [
                    { $gt: [{ $strLenCP: '$$fallbackName' }, 0] },
                    '$$fallbackName',
                    'Unassigned',
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$name',
        approved: { $sum: '$approved' },
        returned: { $sum: '$returned' },
      },
    },
  ]).option({ maxTimeMS: 5_000 });

  return rows
    .map((row) => {
      const total = row.approved + row.returned;
      return {
        name: row._id,
        approved: row.approved,
        returned: row.returned,
        rate: total > 0 ? Math.round((row.approved / total) * 100) : 0,
      };
    })
    .sort((left, right) => right.rate - left.rate || right.approved - left.approved);
};

export const getQCTechnicianReportOptimized = async (req, res, next) => {
  try {
    const scopeMatch = resolveQcScopeFilter(req);
    const cacheKey = `qc:technicians:${getScopeCacheKey(scopeMatch)}`;
    const cached = await getOrSetResponseCache(
      cacheKey,
      QC_TECHNICIAN_CACHE_TTL_MS,
      () => buildTechnicianReport(scopeMatch)
    );
    res.setHeader?.('X-Response-Cache', cached.status);
    return res.json({ success: true, data: cached.value });
  } catch (error) {
    return next(error);
  }
};
