import Order from '../models/order.model.js';
import { resolvePlainVehiclePlate } from '../utils/vehiclePlate.utils.js';
import { getIO } from '../utils/socket.utils.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { onOrderStatusChange } from '../utils/workflow.utils.js';
import { generateQCPDF } from '../utils/pdf.utils.js';
import Notification from '../models/notification.model.js';
import {
  TRACKER_GATE_STAGES,
  countGatePhotos,
  REQUIRED_GATE_PHOTOS,
  gatePhotoStageToValidateForAdvance,
  requiredGatePhotosForValidation,
} from '../utils/trackerGatePhotos.utils.js';
import { normalizeToCanonical } from '../constants/roles.js';
import { applyPickupGateCompleteSideEffects } from '../utils/readyPickupPaymentFlow.utils.js';
import { isSlotConsumingStatus, releaseBookingSlot } from '../services/slot.service.js';

const QC_JOB_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment', 'completed', 'released'];
const QC_APPROVED_ORDER_STATUSES = ['completed', 'released'];
const QC_APPROVED_TRACKER_STAGES = ['ready_pickup', 'completed', 'released'];
const QC_JOBS_DEFAULT_LIMIT = 20;
const QC_JOBS_MAX_LIMIT = 100;

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
    };

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
        notes: o.notes || '',
        vehicleYear: o.vehicleYear || '',
        vehicleMake: o.vehicleMake || '',
        vehicleModel: o.vehicleModel || '',
        vehicleColor: o.vehicleColor || '',
        technicianNotes: '',
        assignedTechnician: technicianName,
        customerPhone: '',
        customerEmail: '',
        customerNotes: o.notes || '',
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // All statuses that represent active or completed service work
    const ACTIVE_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment', 'completed', 'released'];
    const QUEUE_STATUSES  = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment'];

    const [
      awaitingCount,
      approvedTodayRows,
      returnedCount,
      serviceDistribution,
    ] = await Promise.all([
      // Awaiting validation: any active order not yet released/completed
      Order.countDocuments({
        status: { $in: QUEUE_STATUSES },
        archived: { $ne: true },
      }),

      // Approved today: explicit QC completion, ready-for-pickup, completed, or released today.
      Order.aggregate([
        { $match: getQCApprovedOutcomeMatch() },
        { $project: { approvalDate: getQCApprovalDateExpression() } },
        { $match: { approvalDate: { $gte: today, $lt: tomorrow } } },
        { $count: 'count' },
      ]),

      // Returned: orders with a [QC_RETURN] staff note
      Order.countDocuments({
        archived: { $ne: true },
        'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' },
      }),

      // Service type breakdown — all orders ever processed
      Order.aggregate([
        {
          $match: {
            archived: { $ne: true },
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
    ]);
    const approvedTodayCount = approvedTodayRows?.[0]?.count || 0;

    // Avg review time — QC-cleared jobs: qcCompletedAt − createdAt (meaningful duration)
    const avgTimeResult = await Order.aggregate([
      {
        $match: {
          archived: { $ne: true },
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
    ]);

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const mmddKey = (d) => {
      const x = new Date(d);
      const m = String(x.getMonth() + 1).padStart(2, '0');
      const day = String(x.getDate()).padStart(2, '0');
      return `${m}/${day}`;
    };

    // Trend: approved = count of QC completions per day; returned = unique orders with a return note that day
    const [trendApprovedRaw, trendReturnedRaw] = await Promise.all([
      Order.aggregate([
        { $match: getQCApprovedOutcomeMatch() },
        { $project: { approvalDate: getQCApprovalDateExpression() } },
        { $match: { approvalDate: { $gte: fourteenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%m/%d', date: '$approvalDate' } },
            c: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        { $match: { archived: { $ne: true }, staffNotes: { $exists: true, $ne: [] } } },
        { $unwind: '$staffNotes' },
        {
          $match: {
            'staffNotes.createdAt': { $gte: fourteenDaysAgo },
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
    ]);

    const trendMap = new Map();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = mmddKey(d);
      trendMap.set(key, { date: key, approved: 0, returned: 0 });
    }
    trendApprovedRaw.forEach((row) => {
      const entry = trendMap.get(row._id);
      if (entry) entry.approved += row.c;
    });
    trendReturnedRaw.forEach((row) => {
      const entry = trendMap.get(row._id);
      if (entry) entry.returned += row.c;
    });
    const trendData = [...trendMap.values()];

    // Reports KPIs — lifetime QC outcomes (do not use approvedToday for approval %)
    const [qcApprovedLifetime, totalQCReviewed] = await Promise.all([
      Order.countDocuments(getQCApprovedOutcomeMatch()),
      Order.countDocuments({
        archived: { $ne: true },
        $or: [
          ...getQCApprovedOutcomeConditions(),
          { staffNotes: { $elemMatch: { content: { $regex: /^\[QC_RETURN\]/, $options: 'i' } } } },
        ],
      }),
    ]);
    const qcApprovalRatePct =
      totalQCReviewed > 0 ? Math.round((qcApprovedLifetime / totalQCReviewed) * 100) : 0;
    const qcReturnRatePct =
      totalQCReviewed > 0 ? Math.round((returnedCount / totalQCReviewed) * 100) : 0;

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

    // AI detections pending — any active order with damage annotations
    const aiPendingCount = await Order.countDocuments({
      status: { $in: QUEUE_STATUSES },
      archived: { $ne: true },
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
        serviceDistribution: serviceDistribution.map((s) => ({
          name: s._id || 'Other',
          value: s.count,
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
    }
    await order.save();
    if (isSlotConsumingStatus(prevStatus) && !isSlotConsumingStatus(order.status)) {
      await releaseBookingSlot(order.bookingDate, order.bookingTime);
    }

    // ── Emit real-time update to customer ───────────────────────────
    try {
      const io = getIO();
      // Broad event for staff dashboards
      io.emit('orderUpdated', {
        orderId: order._id,
        status: order.status,
        paymentStatus: order.paymentStatus || null,
        trackerStageMedia: order.trackerStageMedia || [],
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
          paymentStatus: order.paymentStatus || null,
          serviceStaffAssignments: order.serviceStaffAssignments || [],
          trackerStageMedia: order.trackerStageMedia || [],
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('[QC] Socket emit failed:', e.message);
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

    await order.save();

    // Emit socket update
    try {
      getIO().emit('orderUpdated', { orderId: order._id, status: order.status, qcReturned: true });
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
 */
export const updateQCChecklist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items must be an array' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.qcChecklist = items.map((item) => ({
      item: item.item || item.name || '',
      passed: Boolean(item.passed || item.checked),
      note: item.note || '',
      checkedBy: req.user.id,
      checkedAt: new Date(),
    }));

    await order.save();

    res.json({ success: true, message: 'QC checklist saved', data: { id: order._id, qcChecklist: order.qcChecklist } });
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

    const previousStatus = order.status;
    const gateMediaStages = new Set(TRACKER_GATE_STAGES);
    const actorRole = normalizeToCanonical(req.user?.role);
    if (gateMediaStages.has(stage)) {
      const validateStage = gatePhotoStageToValidateForAdvance(stage);
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

    if (stage === 'released') {
      if (String(order.paymentStatus || '').toLowerCase() !== 'paid') {
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

    // ── Mark payment as paid when the car is physically released ─────────
    if (stage === 'released') {
      order.paymentStatus = 'paid';
    }

    await order.save();
    if (isSlotConsumingStatus(previousStatus) && !isSlotConsumingStatus(order.status)) {
      await releaseBookingSlot(order.bookingDate, order.bookingTime);
    }

    // ── Emit real-time updates ──────────────────────────────────
    try {
      const io = getIO();
      // Broad event for staff dashboards
      io.emit('orderUpdated', {
        orderId: order._id,
        status: order.status,
        serviceTrackingStage: stage,
        paymentStatus: order.paymentStatus || null,
        invoiceId: order.invoiceId || null,
        trackerStageMedia: order.trackerStageMedia || [],
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
      const stageMessages = {
        received:      { title: '🚗 Vehicle Arrived',              message: 'Your vehicle has arrived at the shop. Our team will begin service shortly.' },
        in_progress:   { title: '🔧 Service In Progress',          message: "We've started working on your vehicle. Sit back and relax!" },
        quality_check: { title: '🛡️ Quality Check Underway',     message: 'Your vehicle is undergoing final quality inspection.' },
        ready_pickup:  { title: '🎉 Ready for Pickup!',            message: 'Your vehicle service is complete. You can now pick it up at the shop!' },
        released:      { title: '🏁 Vehicle Released',             message: 'Your vehicle has been handed back. Thank you for choosing AutoSPF+!' },
      };
      const msg = stageMessages[stage];
      if (msg) {
        const customerId = typeof order.customer === 'object'
          ? order.customer?._id : order.customer;
        if (customerId) {
          const notif = await Notification.create({
            title: msg.title,
            message: msg.message,
            type: 'booking',
            recipientUserId: customerId,
            metadata: { orderId: order._id, stage },
          });
          // Real-time push to customer
          try {
            const io = getIO();
            io.to(`user:${customerId.toString()}`).emit('notification:customer', {
              id: notif._id, title: notif.title, message: notif.message,
              type: notif.type, isRead: false, createdAt: notif.createdAt,
            });
          } catch (_) {}
        }
      }
    } catch (ne) { console.warn('[QC] Failed to create stage notification:', ne.message); }

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

    order.serviceStaffAssignments = assignments.map((a) => ({
      slot: a.slot,
      name: a.name || '',
      role: a.role || '',
      assignedAt: new Date(),
      assignedBy: req.user?.name || 'QC Checker',
    }));

    await order.save();

    try {
      const io = getIO();
      // Broad event for staff dashboards
      io.emit('orderUpdated', {
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
      io.emit('orderUpdated', {
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
