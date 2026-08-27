import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import { safeDecryptOrderField } from '../utils/orderFieldDecrypt.utils.js';
import { resolvePlainVehiclePlate } from '../utils/vehiclePlate.utils.js';
import { getIO } from '../utils/socket.utils.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { onOrderStatusChange } from '../utils/workflow.utils.js';
import { generateQCPDF } from '../utils/pdf.utils.js';
import {
  createCustomerStageNotification,
} from '../utils/customerStageNotifications.utils.js';
import {
  TRACKER_GATE_STAGES,
  countGatePhotos,
  REQUIRED_GATE_PHOTOS,
  gatePhotoStageToValidateForAdvance,
  requiredGatePhotosForValidation,
} from '../utils/trackerGatePhotos.utils.js';
import { normalizeToCanonical } from '../constants/roles.js';
import {
  applyPickupGateCompleteSideEffects,
  computeOrderBalanceDue,
  evaluateReadyForPickupQueueEligibility,
} from '../utils/readyPickupPaymentFlow.utils.js';
import { notifySalesBalancePickupQueue } from '../utils/bookingManagerNotifications.utils.js';
import {
  captureOrderSlotOccupancy,
  saveOrderWithSlotTransition,
} from '../services/slot.service.js';
import {
  buildAdminDeepLink,
  buildAdminGroupingKey,
  createAdminNotification,
} from '../services/adminNotification.service.js';
import {
  handleQualityStageTransition,
  notifyQualityQcFailed,
  notifyQualityReadyForPickup,
} from '../services/qualityNotification.service.js';
import {
  invalidateResponseCache,
} from '../utils/responseCache.utils.js';
import {
  getOrderLedger,
  getOrderServiceTotal,
  summarizeLedgerRows,
  syncOrderFinancialSnapshot,
} from '../services/financialLedger.service.js';

const QC_JOB_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment', 'completed', 'released'];
const QC_APPROVED_ORDER_STATUSES = ['completed', 'released'];
const QC_APPROVED_TRACKER_STAGES = ['ready_pickup', 'completed', 'released'];
const QC_JOBS_DEFAULT_LIMIT = 20;
const QC_JOBS_MAX_LIMIT = 100;

const notifyTrackedStage = async (order, stage, actor) => {
  const spec = {
    in_progress: {
      event: 'job_in_progress',
      title: 'Job in progress',
      severity: 'info',
      message: `${order.orderNumber || order.bookingReference || order._id} was moved to In Progress.`,
    },
    ready_pickup: {
      event: 'ready_for_pickup',
      title: 'Ready for pickup',
      severity: 'success',
      message: `${order.orderNumber || order.bookingReference || order._id} is ready for customer pickup.`,
    },
    completed: {
      event: 'service_completed',
      title: 'Service completed',
      severity: 'success',
      message: `${order.orderNumber || order.bookingReference || order._id} was marked completed.`,
    },
  }[stage];
  if (!spec) return null;

  return createAdminNotification({
    title: spec.title,
    message: spec.message,
    category: 'live_tracking',
    event: spec.event,
    severity: spec.severity,
    source: 'Live Tracking',
    actionRequired: false,
    groupingKey: buildAdminGroupingKey('live_tracking', spec.event, order._id),
    groupingWindowMs: 24 * 60 * 60 * 1000,
    link: buildAdminDeepLink('live_tracking', { orderId: String(order._id) }),
    action: { label: 'View job' },
    metadata: {
      orderId: order._id,
      bookingReference: order.bookingReference || order.orderNumber,
      stage,
      actorUserId: actor?.id || actor?._id,
      actorName: actor?.name || actor?.email,
    },
  });
};

const QC_JOBS_PROJECTION = [
  'orderNumber',
  'bookingReference',
  'customerName',
  'serviceType',
  'status',
  'createdAt',
  'updatedAt',
  'assignedDetailer',
  'vehicleYear',
  'vehicleMake',
  'vehicleModel',
  'vehicleColor',
  'vehiclePlate',
  'notes',
  'photos.before',
  'photos.after',
  'staffNotes.content',
  'serviceProper.completedAt',
  'qcCompletedAt',
  /** Live Tracker checklist — was omitted, so refetches always sent [] and UI reset to 0/11 after save/reload */
  'qcChecklist',
  'serviceTrackingStage',
  'serviceTrackingUpdatedAt',
  'serviceStaffAssignments',
  'trackerStageMedia.stage',
  'trackerStageMedia.slot',
  'trackerStageMedia.description',
  'trackerStageMedia.uploadedAt',
  'trackerStageMedia.uploadedBy',
  'paymentStatus',
  'invoiceId',
  'bookingDate',
  'bookingTime',
  'qcHandoffSheet',
  'warrantyAndReceipt.existingFwsAndShade',
].join(' ');

function buildSlimTrackerStageMedia(media) {
  return (Array.isArray(media) ? media : [])
    .filter(Boolean)
    .map((entry) => ({
      stage: entry.stage,
      ...(entry.slot ? { slot: entry.slot } : {}),
      ...(typeof entry.description === 'string' && entry.description.trim()
        ? { description: entry.description.trim() }
        : {}),
      ...(entry.uploadedAt ? { uploadedAt: entry.uploadedAt } : {}),
      ...(entry.uploadedBy ? { uploadedBy: entry.uploadedBy } : {}),
      hasPhoto: entry.stage !== 'confirmed',
    }));
}

const getQCApprovedOutcomeConditions = () => [
  { qcCompletedAt: { $exists: true, $ne: null } },
  { serviceTrackingStage: { $in: QC_APPROVED_TRACKER_STAGES } },
  { status: { $in: QC_APPROVED_ORDER_STATUSES } },
];

const getQCApprovedOutcomeMatch = () => ({
  archived: { $ne: true },
  $or: getQCApprovedOutcomeConditions(),
});

const getQCApprovalDateExpression = () => ({
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

const normalizeRangeDays = (value) => {
  const n = Number(value);
  if (n === 30 || n === 14 || n === 7 || n === 1) return n;
  return 14;
};

const makeDateMidnight = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDateForTrend = (d) => {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${m}/${day}`;
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

  const trendWindowDays = safeDays * 2;
  const trendStart = new Date(today);
  trendStart.setDate(today.getDate() - (trendWindowDays - 1));

  return { safeDays, todayEnd, currentStart, previousStart, trendStart };
};

const resolveQcScopeFilter = (req) => {
  const scopeValue = String(req.query.scope || req.query.myJobsScope || '').toLowerCase();
  const scopeMine =
    scopeValue === 'mine'
    || scopeValue === 'my-jobs'
    || scopeValue === 'myjobs'
    || scopeValue === 'me';
  const flag = String(req.query.myJobs || req.query.my_jobs || req.query.mine || '').toLowerCase();
  const mineByFlag = flag === '1' || flag === 'true';

  if (!scopeMine && !mineByFlag) return {};

  const userId = req?.user?.id || req?.user?._id;
  if (!userId) return {};

  const normalizedUserId = String(userId);
  return {
    assignedDetailer: mongoose.Types.ObjectId.isValid(normalizedUserId)
      ? new mongoose.Types.ObjectId(normalizedUserId)
      : normalizedUserId,
  };
};

const invalidateQcReadCaches = () => invalidateResponseCache('qc:');

const makeTrendMap = (days, startDate, endDate) => {
  const trendMap = new Map();
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = formatDateForTrend(d);
    trendMap.set(key, { date: key, approved: 0, returned: 0 });
  }

  return trendMap;
};

const sumTrendWindow = (trend, startInclusive, endExclusive) => {
  let approved = 0;
  let returned = 0;

  trend.forEach((item) => {
    approved += Number(item.approved) || 0;
    returned += Number(item.returned) || 0;
  });

  const throughput = approved + returned;
  const reviewedOutcomes = throughput;
  const approvalRate = reviewedOutcomes > 0 ? Math.round((approved / reviewedOutcomes) * 100) : 0;

  return {
    approved,
    returned,
    throughput,
    reviewedOutcomes,
    approvalRate,
  };
};

/**
 * GET /api/qc/jobs
 * Returns a bounded page of in-progress orders awaiting QC review.
 */
export const getQCJobs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit, 10) || QC_JOBS_DEFAULT_LIMIT),
      QC_JOBS_MAX_LIMIT
    );
    const skip = (page - 1) * limit;
    const filter = {
      status: { $in: QC_JOB_STATUSES },
      archived: false,
      ...resolveQcScopeFilter(req),
    };
    const requestedOrderId = String(req.query.orderId || '').trim();
    if (requestedOrderId) {
      if (!mongoose.isValidObjectId(requestedOrderId)) {
        return res.status(400).json({ success: false, message: 'orderId is invalid' });
      }
      filter._id = new mongoose.Types.ObjectId(requestedOrderId);
    }

    const rows = await Order.find(filter)
      .select(QC_JOBS_PROJECTION)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit + 1)
      .maxTimeMS(5000)
      .lean();
    const hasNextPage = rows.length > limit;
    const orders = hasNextPage ? rows.slice(0, limit) : rows;

    const now = Date.now();

    const jobs = orders.map((o) => {
      const submittedAt = o.serviceProper?.completedAt || o.updatedAt || o.createdAt;
      const elapsedMs = submittedAt ? now - new Date(submittedAt).getTime() : 0;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const elapsedHours = Math.floor(elapsedMinutes / 60);
      const elapsedDisplay =
        elapsedHours > 0
          ? `${elapsedHours}h ${elapsedMinutes % 60}m`
          : `${elapsedMinutes}m`;

      // Map internal status to QC-facing status
      let qcStatus = 'pending-review';
      if (o.qcCompletedAt) qcStatus = 'approved';
      else if (o.status === 'completed') qcStatus = 'approved';
      // check staffNotes for a "returned" flag
      const hasReturn = Array.isArray(o.staffNotes) && o.staffNotes.some((n) => n.content?.startsWith('[QC_RETURN]'));
      if (hasReturn) qcStatus = 'needs-fix';

      const aiFlag = false;

      const customerName =
        o.customerName ||
        (typeof o.customer === 'object' ? o.customer?.name : '') ||
        'Unknown';

      const technicianName =
        Array.isArray(o.serviceStaffAssignments) && o.serviceStaffAssignments[0]?.name
          ? o.serviceStaffAssignments[0].name
          : o.assignedDetailer
            ? 'Assigned'
          : 'Unassigned';

      const vehicleStr = [o.vehicleYear, o.vehicleMake, o.vehicleModel]
        .filter(Boolean)
        .join(' ') || 'Unknown Vehicle';

      const platePlain = resolvePlainVehiclePlate(o.vehiclePlate);
      const plainNotes = safeDecryptOrderField(o.notes, 'notes');
      const existingFwsAndShade = String(o.warrantyAndReceipt?.existingFwsAndShade || '').trim();

      return {
        id: o._id.toString(),
        jobId: o.orderNumber || o.bookingReference || o._id.toString(),
        orderId: o.orderNumber || o.bookingReference || o._id.toString(),
        customer: customerName,
        customerName,
        vehicle: vehicleStr,
        vehicleInfo: vehicleStr,
        make: o.vehicleMake || '',
        plate: platePlain,
        existingFwsAndShade,
        service: o.serviceType || 'Service',
        serviceType: o.serviceType || 'Service',
        technician: technicianName,
        technicianId: o.assignedDetailer?.toString?.(),
        submittedAt: submittedAt ? new Date(submittedAt).toISOString() : new Date(o.createdAt).toISOString(),
        elapsed: elapsedDisplay,
        elapsedMinutes,
        status: qcStatus,
        qcStatus,
        orderStatus: o.status,                                          // raw backend status
        serviceTrackingStage: o.serviceTrackingStage || null,           // QC-controlled fine stage
        currentGate: o.serviceTrackingStage || null,
        serviceTrackingUpdatedAt: o.serviceTrackingUpdatedAt || null,
        serviceTrackingUpdatedBy: null,
        serviceStaffAssignments: o.serviceStaffAssignments || [],        // assigned named staff
        trackerStageMedia: buildSlimTrackerStageMedia(o.trackerStageMedia),
        paymentStatus: o.paymentStatus || 'unpaid',
        invoiceId: o.invoiceId || null,
        aiFlag,
        priority: elapsedMinutes > 120 ? 'high' : elapsedMinutes > 60 ? 'medium' : 'normal',
        // Raw order data for detail view
        photos: o.photos || { before: [], after: [] },
        staffNotes: o.staffNotes || [],
        qcChecklist: o.qcChecklist || [],
        damageAnnotations: [],
        notes: plainNotes,
        vehicleYear: o.vehicleYear || '',
        vehicleMake: o.vehicleMake || '',
        vehicleModel: o.vehicleModel || '',
        vehicleColor: o.vehicleColor || '',
        technicianNotes: '',
        assignedTechnician: technicianName,
        customerPhone: '',
        customerEmail: '',
        customerNotes: plainNotes,
        bookingDate: o.bookingDate || '',
        bookingTime: o.bookingTime || '',
        qcHandoffSheet: o.qcHandoffSheet && typeof o.qcHandoffSheet === 'object'
          ? {
              clientName: String(o.qcHandoffSheet.clientName || ''),
              serviceDate: String(o.qcHandoffSheet.serviceDate || ''),
              makeModel: String(o.qcHandoffSheet.makeModel || ''),
              plateNo: String(o.qcHandoffSheet.plateNo || ''),
              tintShadeInstalled: String(o.qcHandoffSheet.tintShadeInstalled || ''),
              installer: String(o.qcHandoffSheet.installer || ''),
            }
          : {
              clientName: '',
              serviceDate: '',
              makeModel: '',
              plateNo: '',
              tintShadeInstalled: '',
              installer: '',
            },
      };
    });

    const total = skip + jobs.length + (hasNextPage ? 1 : 0);
    const totalPages = page + (hasNextPage ? 1 : 0);

    res.json({
      success: true,
      data: jobs,
      jobs,
      count: jobs.length,
      total,
      page,
      limit,
      totalPages,
      pagination: {
        page,
        limit,
        returned: jobs.length,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/qc/dashboard/stats
 * Aggregated KPIs for the QC dashboard.
 */
export const getQCStats = async (req, res, next) => {
  try {
    const { safeDays, todayEnd, currentStart, previousStart, trendStart } = resolveTrendRange(
      req.query.rangeDays || req.query.days || 14
    );
    const today = makeDateMidnight(new Date());
    const scopeMatch = resolveQcScopeFilter(req);

    // All statuses that represent active or completed service work
    const ACTIVE_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment', 'completed', 'released'];
    const QUEUE_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment'];

    const [
      awaitingCount,
      approvedTodayRows,
      returnedCount,
      rangeApprovedCurrentRows,
      rangeReturnedCurrentRows,
      rangeApprovedPreviousRows,
      rangeReturnedPreviousRows,
      serviceDistribution,
      qcApprovedLifetime,
      totalQCReviewed,
      avgTimeResult,
      trendApprovedRaw,
      trendReturnedRaw,
      topReturnReasonsRaw,
    ] = await Promise.all([
      // Awaiting validation: any active order not yet released/completed
      Order.countDocuments({
        status: { $in: QUEUE_STATUSES },
        archived: { $ne: true },
        ...scopeMatch,
      }),

      // Approved today: explicit QC completion, ready-for-pickup, completed, or released today.
      Order.aggregate([
        { $match: { ...getQCApprovedOutcomeMatch(), ...scopeMatch } },
        { $project: { approvalDate: getQCApprovalDateExpression() } },
        { $match: { approvalDate: { $gte: today, $lt: todayEnd } } },
        { $count: 'count' },
      ]),

      // Returned: orders with a [QC_RETURN] staff note
      Order.countDocuments({
        archived: { $ne: true },
        ...scopeMatch,
        'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' },
      }),

      // Approved in selected period
      Order.aggregate([
        { $match: { ...getQCApprovedOutcomeMatch(), ...scopeMatch } },
        { $project: { approvalDate: getQCApprovalDateExpression() } },
        { $match: { approvalDate: { $gte: currentStart, $lt: todayEnd } } },
        { $count: 'count' },
      ]),

      // Returned in selected period
      Order.aggregate([
        {
          $match: {
            archived: { $ne: true },
            ...scopeMatch,
            staffNotes: { $exists: true, $ne: [] },
          },
        },
        { $unwind: '$staffNotes' },
        {
          $match: {
            'staffNotes.createdAt': { $gte: currentStart, $lt: todayEnd },
            'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' },
          },
        },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]),

      // Approved in previous period
      Order.aggregate([
        { $match: { ...getQCApprovedOutcomeMatch(), ...scopeMatch } },
        { $project: { approvalDate: getQCApprovalDateExpression() } },
        { $match: { approvalDate: { $gte: previousStart, $lt: currentStart } } },
        { $count: 'count' },
      ]),

      // Returned in previous period
      Order.aggregate([
        {
          $match: {
            archived: { $ne: true },
            ...scopeMatch,
            staffNotes: { $exists: true, $ne: [] },
          },
        },
        { $unwind: '$staffNotes' },
        {
          $match: {
            'staffNotes.createdAt': { $gte: previousStart, $lt: currentStart },
            'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' },
          },
        },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]),

      // Service type breakdown — all orders ever processed
      Order.aggregate([
        {
          $match: {
            archived: { $ne: true },
            ...scopeMatch,
            status: { $in: ACTIVE_STATUSES },
          },
        },
        {
          $group: {
            _id: '$serviceType',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),

      // Reports KPIs — lifetime QC outcomes (do not use approvedToday for approval %)
      Order.countDocuments({
        ...getQCApprovedOutcomeMatch(),
        ...scopeMatch,
      }),
      Order.countDocuments({
        archived: { $ne: true },
        ...scopeMatch,
        $or: [
          ...getQCApprovedOutcomeConditions(),
          { staffNotes: { $elemMatch: { content: { $regex: /^\[QC_RETURN\]/, $options: 'i' } } } },
        ],
      }),

      // Avg review time — QC-cleared jobs: qcCompletedAt − createdAt (meaningful duration)
      Order.aggregate([
        {
          $match: {
            archived: { $ne: true },
            ...scopeMatch,
            qcCompletedAt: { $exists: true, $ne: null },
          },
        },
        {
          $project: {
            reviewTimeMs: {
              $subtract: ['$qcCompletedAt', '$createdAt'],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgMs: { $avg: '$reviewTimeMs' },
          },
        },
      ]),

      // Trend: approved = count of QC completions per day; returned = unique orders with a return note that day
      Order.aggregate([
        { $match: { ...getQCApprovedOutcomeMatch(), ...scopeMatch } },
        { $project: { approvalDate: getQCApprovalDateExpression() } },
        { $match: { approvalDate: { $gte: trendStart, $lt: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%m/%d', date: '$approvalDate' } },
            c: { $sum: 1 },
          },
        },
      ]),

      Order.aggregate([
        {
          $match: {
            archived: { $ne: true },
            ...scopeMatch,
            staffNotes: { $exists: true, $ne: [] },
          },
        },
        { $unwind: '$staffNotes' },
        {
          $match: {
            'staffNotes.createdAt': { $gte: trendStart, $lt: todayEnd },
            'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' },
          },
        },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%m/%d', date: '$staffNotes.createdAt' } },
              oid: '$_id',
            },
          },
        },
        { $group: { _id: '$_id.day', c: { $sum: 1 } } },
      ]),

      Order.aggregate([
        {
          $match: {
            archived: { $ne: true },
            ...scopeMatch,
            staffNotes: { $exists: true, $ne: [] },
          },
        },
        { $unwind: '$staffNotes' },
        {
          $match: {
            'staffNotes.createdAt': { $gte: currentStart, $lt: todayEnd },
            'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' },
          },
        },
        {
          $addFields: {
            returnReason: {
              $trim: {
                input: {
                  $toLower: {
                    $substrBytes: ['$staffNotes.content', 10, 180],
                  },
                },
              },
            },
          },
        },
        { $match: { returnReason: { $ne: '' } } },
        { $group: { _id: '$returnReason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
    ]);

    const approvedTodayCount = approvedTodayRows?.[0]?.count || 0;
    const approvedCurrent = rangeApprovedCurrentRows?.[0]?.count || 0;
    const returnedCurrent = rangeReturnedCurrentRows?.[0]?.count || 0;
    const approvedPrevious = rangeApprovedPreviousRows?.[0]?.count || 0;
    const returnedPrevious = rangeReturnedPreviousRows?.[0]?.count || 0;

    const trendMap = makeTrendMap(safeDays * 2, trendStart, today);
    trendApprovedRaw.forEach((row) => {
      const entry = trendMap.get(row._id);
      if (entry) entry.approved += row.c;
    });
    trendReturnedRaw.forEach((row) => {
      const entry = trendMap.get(row._id);
      if (entry) entry.returned += row.c;
    });

    const trendDataAll = [...trendMap.values()];
    const previousTrendData = trendDataAll.slice(0, safeDays);
    const trendData = trendDataAll.slice(-safeDays);
    const currentSummary = sumTrendWindow(trendData, currentStart, todayEnd);
    const previousSummary = sumTrendWindow(previousTrendData, previousStart, currentStart);

    // Avg review time in hours/minutes
    const avgMs = avgTimeResult?.[0]?.avgMs || 0;
    const avgMinutes = Math.round(avgMs / 60000);
    let avgDisplay = '—';
    if (avgMinutes > 0) {
      if (avgMinutes >= 60) {
        const h = Math.floor(avgMinutes / 60);
        const m = avgMinutes % 60;
        avgDisplay = m > 0 ? `${h}h ${m}m` : `${h}h`;
      } else {
        avgDisplay = `${avgMinutes}m`;
      }
    }

    const qcApprovalRatePct =
      totalQCReviewed > 0 ? Math.round((qcApprovedLifetime / totalQCReviewed) * 100) : 0;
    const qcReturnRatePct =
      totalQCReviewed > 0 ? Math.round((returnedCount / totalQCReviewed) * 100) : 0;

    const periodApproved = approvedCurrent || currentSummary.approved;
    const periodReturned = returnedCurrent || currentSummary.returned;
    const periodThroughput = periodApproved + periodReturned;
    const periodApprovalRate = periodThroughput > 0
      ? Math.round((periodApproved / periodThroughput) * 100)
      : 0;

    const previousThroughput = approvedPrevious || previousSummary.throughput;
    const previousApprovalRate = previousThroughput > 0
      ? Math.round((approvedPrevious / previousThroughput) * 100)
      : 0;

    // AI detections pending — any active order with damage annotations
    const aiPendingCount = await Order.countDocuments({
      status: { $in: QUEUE_STATUSES },
      archived: { $ne: true },
      ...scopeMatch,
      'damageAnnotations.0': { $exists: true },
    });

    res.json({
      success: true,
      data: {
        awaiting: awaitingCount,
        approvedToday: approvedTodayCount,
        returned: returnedCount,
        qcApprovedLifetime,
        totalQCReviewed,
        qcApprovalRatePct,
        qcReturnRatePct,
        aiPending: aiPendingCount,
        avgReviewTime: avgDisplay,
        trendData,
        rangeSummary: {
          days: safeDays,
          label: safeDays === 1 ? 'Today' : `Last ${safeDays} Days`,
          approved: periodApproved,
          returned: periodReturned,
          throughput: periodThroughput,
          reviewedOutcomes: periodThroughput,
          approvalRate: periodApprovalRate,
          previous: {
            approved: approvedPrevious || previousSummary.approved,
            returned: returnedPrevious || previousSummary.returned,
            throughput: previousThroughput,
            reviewedOutcomes: previousThroughput,
            approvalRate: previousApprovalRate || previousSummary.approvalRate,
          },
        },
        serviceDistribution: serviceDistribution.map((s) => ({
          name: s._id || 'Other',
          value: s.count,
        })),
        topReturnReasons: topReturnReasonsRaw.map((entry) => ({
          reason: (entry._id || 'Unspecified').trim(),
          count: entry.count || 0,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};


/**
 * PATCH /api/qc/jobs/:id/approve
 * Approve a job — mark order as completed, generate QC PDF.
 */
export const approveJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate('customer', 'name email phone avatar')
      .populate('items.product');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const occupancyBefore = captureOrderSlotOccupancy(order);

    if (order.status === 'ready_for_payment') {
      return res.status(400).json({
        success: false,
        message: 'Balance is due at POS. Process payment before QC completion.',
      });
    }

    // Allow quality_check stage orders too — QC presses Approve after QC step
    if (!['in_progress', 'completed', 'received', 'quality_check'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve order with status: ${order.status}`,
      });
    }

    const actorRole = normalizeToCanonical(req.user?.role);
    const qcUploaded = countGatePhotos(order, 'quality_check');
    const qcRequired = requiredGatePhotosForValidation('quality_check', actorRole);
    if (qcUploaded < qcRequired) {
      return res.status(400).json({
        success: false,
        message: `${qcRequired} QC form photo required before approving this job.`,
        uploaded: qcUploaded,
        required: qcRequired,
      });
    }

    const readyUploaded = countGatePhotos(order, 'ready_pickup');
    if (readyUploaded < REQUIRED_GATE_PHOTOS) {
      return res.status(400).json({
        success: false,
        message: `${REQUIRED_GATE_PHOTOS} final output photos required before approving this job.`,
        uploaded: readyUploaded,
        required: REQUIRED_GATE_PHOTOS,
      });
    }

    // Generate QC PDF (non-blocking on failure)
    try {
      const qcUrl = await generateQCPDF(order);
      if (qcUrl) {
        order.legalCompliance = { ...order.legalCompliance, qcPdf: qcUrl };
      }
    } catch (err) {
      console.warn('[QC] QC PDF generation failed (non-fatal):', err.message);
    }

    const prevStatus = order.status;

    // ── Step through ready_pickup BEFORE completing ─────────────────
    // Always set ready_pickup first so the customer sees Step 5 before
    // the order is marked complete. This is the stage that triggers 100%.
    order.serviceTrackingStage = 'ready_pickup';
    order.serviceTrackingUpdatedAt = new Date();
    order.serviceTrackingUpdatedBy = req.user?.name || 'QC Checker';
    order.qcCompletedAt = new Date();
    if (String(order.paymentStatus || '').toLowerCase() === 'paid') {
      order.status = 'completed';
    } else {
      order.status = 'ready_for_payment';
      await evaluateReadyForPickupQueueEligibility(order, {
        persist: false,
        emit: true,
        notify: true,
      });
    }
    await saveOrderWithSlotTransition(order, occupancyBefore);
    invalidateQcReadCaches();

    try {
      await notifyQualityReadyForPickup(order);
    } catch (ne) {
      console.warn('[QC] Failed to create Quality pickup notification:', ne.message);
    }

    // ── Emit real-time update to customer ───────────────────────────
    try {
      const io = getIO();
      // Broad event for staff dashboards
      io.to('realtime:staff').emit('orderUpdated', {
        orderId: order._id,
        status: order.status,
        serviceTrackingStage: 'ready_pickup',
        serviceTrackingUpdatedAt: order.serviceTrackingUpdatedAt || new Date(),
        paymentStatus: order.paymentStatus || null,
        serviceStaffAssignments: order.serviceStaffAssignments || [],
        trackerStageMedia: order.trackerStageMedia || [],
        updatedAt: new Date().toISOString(),
      });
      // Targeted event for the customer's live tracker
      const customerId = typeof order.customer === 'object'
        ? order.customer?._id?.toString?.()
        : order.customer?.toString?.();
      if (customerId) {
        io.to(`user:${customerId}`).emit('booking:status', {
          bookingId: order._id.toString(),
          status: order.status,
          serviceTrackingStage: 'ready_pickup',
          serviceTrackingUpdatedAt: order.serviceTrackingUpdatedAt || new Date(),
          paymentStatus: order.paymentStatus || null,
          serviceStaffAssignments: order.serviceStaffAssignments || [],
          trackerStageMedia: order.trackerStageMedia || [],
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('[QC] Socket emit failed:', e.message);
    }

    try {
      await createCustomerStageNotification(order, 'ready_pickup');
    } catch (ne) {
      console.warn('[QC] Failed to create stage notification:', ne.message);
    }

    if (order.status === 'ready_for_payment') {
      try {
        const balanceDue = await computeOrderBalanceDue(order);
        await notifySalesBalancePickupQueue(order, { balanceDue });
      } catch (ne) {
        console.warn('[QC] Failed to notify sales balance pickup:', ne.message);
      }

      try {
        await notifyTrackedStage(order, 'ready_pickup', req.user);
      } catch (ne) {
        console.warn('[QC] Failed to notify Admin about pickup readiness:', ne.message);
      }
    }

    // Trigger workflow orchestrator (async, non-blocking)
    onOrderStatusChange(order, prevStatus, req.user).catch((err) =>
      console.error('[QC] Workflow orchestrator error:', err.message)
    );

    logActivity({
      req,
      type: 'qc_approved',
      module: 'QualityChecker',
      action: 'QC_APPROVED',
      description: `QC Checker approved job ${order.orderNumber} — tracker advanced to Ready for Pickup`,
      referenceId: order._id,
      status: 'success',
    });

    res.json({ success: true, message: 'Job approved successfully', data: { id: order._id, status: order.status, serviceTrackingStage: 'ready_pickup', paymentStatus: order.paymentStatus || null } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/qc/jobs/:id/return
 * Return a job to the technician with a reason/note.
 */
export const returnJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, note } = req.body;

    if (!reason && !note) {
      return res.status(400).json({ success: false, message: 'A return reason or note is required' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const occupancyBefore = captureOrderSlotOccupancy(order);

    // Add QC return note (prefixed so we can detect it for stats)
    const returnContent = `[QC_RETURN] ${reason || note}`;
    order.staffNotes = order.staffNotes || [];
    order.staffNotes.push({
      content: returnContent,
      detailerId: req.user.id,
      detailerName: req.user.name || 'QC Checker',
      createdAt: new Date(),
    });

    // Revert status back to in_progress if it was completed
    if (order.status === 'completed') {
      order.status = 'in_progress';
    }
    // Clear qcCompletedAt if set
    order.qcCompletedAt = undefined;

    await saveOrderWithSlotTransition(order, occupancyBefore);
    invalidateQcReadCaches();

    try {
      const returnEntry = order.staffNotes?.[order.staffNotes.length - 1];
      await notifyQualityQcFailed(order, reason || note, returnEntry?._id);
    } catch (ne) {
      console.warn('[QC] Failed to create Quality return notification:', ne.message);
    }

    // Emit socket update
    try {
      getIO().to('realtime:staff').emit('orderUpdated', { orderId: order._id, status: order.status, qcReturned: true });
    } catch (e) {
      console.warn('[QC] Socket emit failed:', e.message);
    }

    logActivity({
      req,
      type: 'qc_returned',
      module: 'QualityChecker',
      action: 'QC_RETURNED',
      description: `QC Checker returned job ${order.orderNumber}: ${reason || note}`,
      referenceId: order._id,
      status: 'warning',
    });

    res.json({ success: true, message: 'Job returned to technician', data: { id: order._id, status: order.status } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/qc/jobs/:id/checklist
 * Save QC checklist items for an order.
 *
 * Uses atomic `$set` on `qcChecklist` only — avoids `doc.save()` racing other writers
 * (e.g. stage photos, handoff) and avoids marking `vehiclePlate` dirty from decrypt/init,
 * which triggered "No matching document found … version … modifiedPaths 'vehiclePlate, qcChecklist'".
 */
export const updateQCChecklist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items must be an array' });
    }

    const qcChecklist = items.map((item) => ({
      item: item.item || item.name || '',
      passed: Boolean(item.passed || item.checked),
      note: item.note || '',
      checkedBy: req.user?.id,
      checkedAt: new Date(),
    }));

    const updated = await Order.findByIdAndUpdate(
      id,
      { $set: { qcChecklist } },
      { new: true, runValidators: true, select: 'qcChecklist' }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      message: 'QC checklist saved',
      data: { id: updated._id, qcChecklist: updated.qcChecklist },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/qc/jobs/:id/service-status
 * Advance the live service tracking stage (controlled by QC Checker).
 * Allowed stages: received | in_progress | quality_check | ready_pickup | completed
 */
export const updateServiceStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;

    const VALID_STAGES = ['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup', 'completed', 'released'];
    if (!VALID_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, message: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}` });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const occupancyBefore = captureOrderSlotOccupancy(order);

    const previousStatus = order.status;
    const previousTrackingStage = order.serviceTrackingStage || order.status;
    const gateMediaStages = new Set(TRACKER_GATE_STAGES);
    const actorRole = normalizeToCanonical(req.user?.role);
    if (gateMediaStages.has(stage)) {
      const validateStage = gatePhotoStageToValidateForAdvance(stage);
      if (validateStage) {
        const uploaded = countGatePhotos(order, validateStage);
        const requiredPhotos = requiredGatePhotosForValidation(validateStage, actorRole);
        if (uploaded < requiredPhotos) {
          return res.status(400).json({
            success: false,
            message: `${requiredPhotos} photos required before advancing`,
            error: `${requiredPhotos} photos required before advancing`,
            uploaded,
            required: requiredPhotos,
          });
        }
      }
    }

    if (stage === 'released') {
      const ledgerRows = await getOrderLedger(order._id);
      const ledger = summarizeLedgerRows(ledgerRows, getOrderServiceTotal(order));
      await syncOrderFinancialSnapshot(order, ledgerRows);
      if (ledger.outstandingBalance > 0.009 || ledger.netVerified <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Collect the final balance in Sales POS before releasing the vehicle to the customer.',
        });
      }
      const uploaded = countGatePhotos(order, 'ready_pickup');
      if (uploaded < REQUIRED_GATE_PHOTOS) {
        return res.status(400).json({
          success: false,
          message: '5 photos required before advancing',
          error: '5 photos required before advancing',
          uploaded,
          required: REQUIRED_GATE_PHOTOS,
        });
      }
    }

    // Store fine-grained tracking stage on the order
    order.serviceTrackingStage = stage;
    order.serviceTrackingUpdatedAt = new Date();
    order.serviceTrackingUpdatedBy = req.user?.name || 'QC Checker';

    // Map stage to top-level order status.
    // IMPORTANT: ready_pickup does NOT set status=completed — the vehicle is still
    // in the shop. Only approveJob (QC explicit approval) sets status=completed.
    // Setting completed here would hide the live tracker and show the rejected-booking
    // card if the customer has any old rejected order.
    const stageToStatus = {
      confirmed:      'confirmed',
      received:       'received',
      in_progress:    'in_progress',
      quality_check:  'in_progress',   // still actively in service
      completed:      'completed',     // set by approveJob
      released:       'released',      // vehicle handed back — hides customer tracker
    };
    if (stage === 'ready_pickup') {
      await applyPickupGateCompleteSideEffects(order);
    } else {
      order.status = stageToStatus[stage] ?? order.status;
    }

    if (QC_APPROVED_TRACKER_STAGES.includes(stage) && !order.qcCompletedAt) {
      order.qcCompletedAt = new Date();
    }

    await saveOrderWithSlotTransition(order, occupancyBefore);
    invalidateQcReadCaches();

    try {
      await handleQualityStageTransition(order, previousTrackingStage, stage);
    } catch (ne) {
      console.warn('[QC] Failed to synchronize Quality stage notifications:', ne.message);
    }

    // ── Emit real-time updates ──────────────────────────────────
    try {
      const io = getIO();
      // Broad event for staff dashboards
      io.to('realtime:staff').emit('orderUpdated', {
        orderId: order._id,
        status: order.status,
        serviceTrackingStage: stage,
        serviceTrackingUpdatedAt: order.serviceTrackingUpdatedAt || new Date(),
        paymentStatus: order.paymentStatus || null,
        invoiceId: order.invoiceId || null,
        serviceStaffAssignments: order.serviceStaffAssignments || [],
        trackerStageMedia: order.trackerStageMedia || [],
        updatedAt: new Date().toISOString(),
      });
      // Targeted event for the customer's live tracker
      const customerId = typeof order.customer === 'object'
        ? order.customer?._id?.toString?.()
        : order.customer?.toString?.();
      if (customerId) {
        io.to(`user:${customerId}`).emit('booking:status', {
          bookingId: order._id.toString(),
          status: order.status,
          serviceTrackingStage: stage,
          serviceTrackingUpdatedAt: order.serviceTrackingUpdatedAt || new Date(),
          paymentStatus: order.paymentStatus || null,
          invoiceId: order.invoiceId || null,
          serviceStaffAssignments: order.serviceStaffAssignments || [],
          trackerStageMedia: order.trackerStageMedia || [],
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) { console.warn('[QC] Socket emit failed:', e.message); }

    // ── Create per-stage customer notification ────────────────────────────
    try {
      await createCustomerStageNotification(order, stage);
    } catch (ne) { console.warn('[QC] Failed to create stage notification:', ne.message); }

    try {
      await notifyTrackedStage(order, stage, req.user);
    } catch (ne) {
      console.warn('[QC] Failed to create Admin stage notification:', ne.message);
    }

    logActivity({
      req, type: 'qc_stage_update', module: 'QualityChecker', action: 'SERVICE_STAGE_UPDATE',
      description: `QC Checker advanced job ${order.orderNumber || order._id} to stage: ${stage}`,
      referenceId: order._id, status: 'success',
    });

    res.json({
      success: true,
      message: `Service stage updated to: ${stage}`,
      data: { id: order._id, status: order.status, serviceTrackingStage: stage },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/qc/jobs/:id/assign-staff
 * Assign named service staff to a job (stored per-stage or as a flat list).
 */
export const assignServiceStaff = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { assignments } = req.body;
    // assignments: [{ slot: 'staff1'|'staff2'|'staff3'|'staff4', name: string, role: string }]

    if (!Array.isArray(assignments)) {
      return res.status(400).json({ success: false, message: 'assignments must be an array' });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const previousAssignments = Array.isArray(order.serviceStaffAssignments)
      ? order.serviceStaffAssignments.map((assignment) => ({
          name: assignment?.name || '',
          role: assignment?.role || '',
        }))
      : [];

    order.serviceStaffAssignments = assignments.map((a) => ({
      slot: a.slot,
      name: a.name || '',
      role: a.role || '',
      assignedAt: new Date(),
      assignedBy: req.user?.name || 'QC Checker',
    }));

    await order.save();
    invalidateQcReadCaches();

    const assignedNames = order.serviceStaffAssignments.map((assignment) => assignment.name).filter(Boolean);
    const previousNames = previousAssignments.map((assignment) => assignment.name).filter(Boolean);
    if (assignedNames.join('|') !== previousNames.join('|')) {
      try {
        const hasAssignments = assignedNames.length > 0;
        await createAdminNotification({
          title: hasAssignments ? 'Technician assigned' : 'No technician assigned',
          message: hasAssignments
            ? `${assignedNames.join(', ')} assigned to ${order.orderNumber || order.bookingReference || order._id}.`
            : `${order.orderNumber || order.bookingReference || order._id} no longer has an assigned technician.`,
          category: 'live_tracking',
          event: hasAssignments ? 'technician_assigned' : 'unassigned_technician',
          severity: hasAssignments ? 'info' : 'warning',
          source: 'Live Tracking',
          actionRequired: !hasAssignments,
          groupingKey: buildAdminGroupingKey(
            'live_tracking',
            hasAssignments ? 'technician_assigned' : 'unassigned_technician',
            order._id,
          ),
          groupingWindowMs: 10 * 60 * 1000,
          link: buildAdminDeepLink('live_tracking', { orderId: String(order._id) }),
          action: { label: hasAssignments ? 'View assignment' : 'Assign technician' },
          metadata: {
            orderId: order._id,
            bookingReference: order.bookingReference || order.orderNumber,
            assignments: order.serviceStaffAssignments,
            previousAssignments,
            actorUserId: req.user?.id || req.user?._id,
            actorName: req.user?.name || req.user?.email,
          },
        });
      } catch (notificationError) {
        console.warn('[QC] Failed to create assignment notification:', notificationError.message);
      }
    }

    try {
      const io = getIO();
      // Broad event for staff dashboards
      io.to('realtime:staff').emit('orderUpdated', {
        orderId: order._id,
        serviceStaffAssignments: order.serviceStaffAssignments,
      });
      // Targeted event for customer's live tracker team display
      const customerId = typeof order.customer === 'object'
        ? order.customer?._id?.toString?.()
        : order.customer?.toString?.();
      if (customerId) {
        io.to(`user:${customerId}`).emit('booking:status', {
          bookingId: order._id.toString(),
          status: order.status,
          serviceTrackingStage: order.serviceTrackingStage || null,
          serviceStaffAssignments: order.serviceStaffAssignments || [],
          trackerStageMedia: order.trackerStageMedia || [],
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) { console.warn('[QC] Socket emit failed:', e.message); }

    res.json({
      success: true,
      message: 'Staff assignments saved',
      data: { id: order._id, serviceStaffAssignments: order.serviceStaffAssignments },
    });
  } catch (error) {
    next(error);
  }
};

const QC_HANDOFF_KEYS = ['clientName', 'serviceDate', 'makeModel', 'plateNo', 'tintShadeInstalled', 'installer'];

/**
 * PATCH /api/qc/jobs/:id/handoff-sheet
 * Persist QC live-tracker "Vehicle information" handoff fields.
 */
export const updateQCHandoffSheet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const nextSheet = { ...(order.qcHandoffSheet || {}) };
    for (const key of QC_HANDOFF_KEYS) {
      if (body[key] !== undefined && body[key] !== null) {
        nextSheet[key] = String(body[key]).trim();
      }
    }
    nextSheet.updatedAt = new Date();
    nextSheet.updatedBy = req.user?.name || 'QC Checker';
    order.qcHandoffSheet = nextSheet;
    order.markModified('qcHandoffSheet');
    await order.save();

    try {
      const io = getIO();
      io.to('realtime:staff').emit('orderUpdated', {
        orderId: order._id,
        qcHandoffSheet: order.qcHandoffSheet,
      });
      const customerId =
        typeof order.customer === 'object' ? order.customer?._id?.toString?.() : order.customer?.toString?.();
      if (customerId) {
        io.to(`user:${customerId}`).emit('booking:status', {
          bookingId: order._id.toString(),
          status: order.status,
          serviceTrackingStage: order.serviceTrackingStage || null,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('[QC] Socket emit failed (handoff-sheet):', e.message);
    }

    logActivity({
      req,
      type: 'qc_handoff_sheet',
      module: 'QualityChecker',
      action: 'QC_HANDOFF_SHEET_UPDATE',
      description: `QC updated handoff sheet for ${order.orderNumber || order._id}`,
      referenceId: order._id,
      status: 'success',
    });

    res.json({
      success: true,
      message: 'Handoff details saved',
      data: { id: order._id, qcHandoffSheet: order.qcHandoffSheet },
    });
  } catch (error) {
    next(error);
  }
};
/**
 * GET /api/qc/activity
 * Recent QC review activity feed (approvals + returns), last 50 actions.
 */
export const getQCActivity = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    // Fetch recently completed or returned orders
    const recent = await Order.find({
      archived: { $ne: true },
      $or: [
        ...getQCApprovedOutcomeConditions(),
        { 'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' } },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .populate('customer', 'name')
      .lean();

    const activity = recent.map((o) => {
      const customerName =
        o.customerName ||
        (typeof o.customer === 'object' ? o.customer?.name : '') ||
        'Unknown';
      const vehicleStr = [o.vehicleYear, o.vehicleMake, o.vehicleModel]
        .filter(Boolean)
        .join(' ') || 'Unknown Vehicle';

      // Determine type from notes + qcCompletedAt
      const returnNote = (o.staffNotes || []).find((n) =>
        n.content?.startsWith('[QC_RETURN]')
      );
      const type = returnNote ? 'returned' : 'approved';
      const actorName = returnNote?.detailerName || 'QC Checker';
      const approvalTimestamp = o.qcCompletedAt ||
        (QC_APPROVED_TRACKER_STAGES.includes(o.serviceTrackingStage)
          ? o.serviceTrackingUpdatedAt || o.updatedAt
          : o.updatedAt);
      const timestamp = returnNote?.createdAt || approvalTimestamp;

      return {
        id: o._id.toString(),
        jobId: o.orderNumber || o.bookingReference || o._id.toString(),
        type,
        customer: customerName,
        vehicle: vehicleStr,
        service: o.serviceType || 'Service',
        actor: actorName,
        timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        note: returnNote ? returnNote.content.replace('[QC_RETURN] ', '') : null,
      };
    });

    res.json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/qc/reports/technicians
 * Per-technician QC performance: approved, returned, rate.
 */
export const getQCTechnicianReport = async (req, res, next) => {
  try {
    const techNameAddFields = [
      {
        $lookup: {
          from: 'users',
          localField: 'assignedDetailer',
          foreignField: '_id',
          as: 'detailerDoc',
        },
      },
      {
        $addFields: {
          leadFromStaff: {
            $let: {
              vars: {
                leads: {
                  $filter: {
                    input: { $ifNull: ['$serviceStaffAssignments', []] },
                    as: 'a',
                    cond: { $eq: ['$$a.slot', 'staff1'] },
                  },
                },
              },
              in: {
                $let: {
                  vars: { f: { $arrayElemAt: ['$$leads', 0] } },
                  in: { $ifNull: ['$$f.name', ''] },
                },
              },
            },
          },
          fromDetailer: { $ifNull: [{ $arrayElemAt: ['$detailerDoc.name', 0] }, ''] },
        },
      },
      {
        $addFields: {
          techName: {
            $cond: [
              { $gt: [{ $strLenCP: { $trim: { input: '$fromDetailer' } } }, 0] },
              '$fromDetailer',
              {
                $cond: [
                  { $gt: [{ $strLenCP: { $trim: { input: '$leadFromStaff' } } }, 0] },
                  '$leadFromStaff',
                  'Unassigned',
                ],
              },
            ],
          },
        },
      },
    ];

    const [approved, returned] = await Promise.all([
      Order.aggregate([
        { $match: getQCApprovedOutcomeMatch() },
        ...techNameAddFields,
        { $group: { _id: '$techName', approved: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { archived: { $ne: true }, 'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' } } },
        ...techNameAddFields,
        { $group: { _id: '$techName', returned: { $sum: 1 } } },
      ]),
    ]);

    // Merge into a unified map
    const techMap = new Map();
    approved.forEach((t) => {
      techMap.set(t._id, { name: t._id, approved: t.approved, returned: 0 });
    });
    returned.forEach((t) => {
      if (techMap.has(t._id)) {
        techMap.get(t._id).returned = t.returned;
      } else {
        techMap.set(t._id, { name: t._id, approved: 0, returned: t.returned });
      }
    });

    const techData = [...techMap.values()].map((t) => {
      const total = t.approved + t.returned;
      return {
        name: t.name,
        approved: t.approved,
        returned: t.returned,
        rate: total > 0 ? Math.round((t.approved / total) * 100) : 0,
      };
    }).sort((a, b) => b.rate - a.rate);

    res.json({ success: true, data: techData });
  } catch (error) {
    next(error);
  }
};
