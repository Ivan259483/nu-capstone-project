import Order from '../models/order.model.js';
import { getIO } from '../utils/socket.utils.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { onOrderStatusChange } from '../utils/workflow.utils.js';
import { generateQCPDF } from '../utils/pdf.utils.js';

/**
 * GET /api/qc/jobs
 * Returns all in-progress orders awaiting QC review.
 */
export const getQCJobs = async (req, res, next) => {
  try {
    const orders = await Order.find({
      status: { $in: ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'completed'] },
      archived: { $ne: true },
    })
      .populate('customer', 'name email phone avatar')
      .populate('assignedDetailer', 'name email')
      .sort({ createdAt: -1 })
      .lean();

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

      const aiFlag = Array.isArray(o.damageAnnotations) && o.damageAnnotations.length > 0;

      const customerName =
        o.customerName ||
        (typeof o.customer === 'object' ? o.customer?.name : '') ||
        'Unknown';

      const technicianName =
        o.assignedDetailer && typeof o.assignedDetailer === 'object'
          ? (o.assignedDetailer?.name || 'Unassigned')
          : 'Unassigned';

      const vehicleStr = [o.vehicleYear, o.vehicleMake, o.vehicleModel]
        .filter(Boolean)
        .join(' ') || 'Unknown Vehicle';

      return {
        id: o._id.toString(),
        jobId: o.orderNumber || o.bookingReference || o._id.toString(),
        customer: customerName,
        vehicle: vehicleStr,
        make: o.vehicleMake || '',
        plate: o.vehiclePlate || '',
        service: o.serviceType || 'Service',
        serviceType: o.serviceType || 'Service',
        technician: technicianName,
        technicianId: typeof o.assignedDetailer === 'object' ? o.assignedDetailer?._id?.toString() : o.assignedDetailer?.toString(),
        submittedAt: submittedAt ? new Date(submittedAt).toISOString() : new Date(o.createdAt).toISOString(),
        elapsed: elapsedDisplay,
        elapsedMinutes,
        status: qcStatus,
        orderStatus: o.status,                                          // raw backend status
        serviceTrackingStage: o.serviceTrackingStage || null,           // QC-controlled fine stage
        serviceTrackingUpdatedAt: o.serviceTrackingUpdatedAt || null,
        serviceTrackingUpdatedBy: o.serviceTrackingUpdatedBy || null,
        serviceStaffAssignments: o.serviceStaffAssignments || [],        // assigned named staff
        aiFlag,
        priority: elapsedMinutes > 120 ? 'high' : elapsedMinutes > 60 ? 'medium' : 'normal',
        // Raw order data for detail view
        photos: o.photos || { before: [], after: [] },
        staffNotes: o.staffNotes || [],
        qcChecklist: o.qcChecklist || [],
        damageAnnotations: o.damageAnnotations || [],
        notes: o.notes || '',
        vehicleYear: o.vehicleYear || '',
        vehicleMake: o.vehicleMake || '',
        vehicleModel: o.vehicleModel || '',
        vehicleColor: o.vehicleColor || '',
        technicianNotes: o.serviceProper?.technicianNotes || '',
        customerPhone: typeof o.customer === 'object' ? o.customer?.phone : o.customerPhone || '',
        customerEmail: typeof o.customer === 'object' ? o.customer?.email : '',
        customerNotes: o.notes || '',
      };
    });

    res.json({ success: true, data: jobs, count: jobs.length });
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

    const [
      awaitingCount,
      approvedTodayCount,
      returnedCount,
      avgTimeResult,
      serviceDistribution,
    ] = await Promise.all([
      // Awaiting validation: in_progress, not yet QC'd
      Order.countDocuments({
        status: 'in_progress',
        archived: { $ne: true },
        qcCompletedAt: { $exists: false },
      }),

      // Approved today: completed today
      Order.countDocuments({
        status: 'completed',
        archived: { $ne: true },
        qcCompletedAt: { $gte: today, $lt: tomorrow },
      }),

      // Returned: staff notes with [QC_RETURN] prefix
      Order.countDocuments({
        archived: { $ne: true },
        'staffNotes.content': { $regex: /^\[QC_RETURN\]/, $options: 'i' },
      }),

      // Avg review time (ms between serviceProper.completedAt and qcCompletedAt)
      Order.aggregate([
        {
          $match: {
            status: 'completed',
            archived: { $ne: true },
            qcCompletedAt: { $exists: true },
            'serviceProper.completedAt': { $exists: true },
          },
        },
        {
          $project: {
            reviewTimeMs: {
              $subtract: ['$qcCompletedAt', '$serviceProper.completedAt'],
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

      // Service type breakdown for pie chart
      Order.aggregate([
        {
          $match: {
            archived: { $ne: true },
            status: { $in: ['in_progress', 'completed'] },
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

    // Trend data: last 14 days approved vs returned per day
    const trendRaw = await Order.aggregate([
      {
        $match: {
          archived: { $ne: true },
          qcCompletedAt: {
            $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: '%m/%d', date: '$qcCompletedAt' },
            },
            returned: {
              $cond: [
                { $regexMatch: { input: { $ifNull: [{ $arrayElemAt: ['$staffNotes.content', 0] }, ''] }, regex: /^\[QC_RETURN\]/ } },
                true,
                false,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    // Shape trend data
    const trendMap = new Map();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
      trendMap.set(key, { date: key, approved: 0, returned: 0 });
    }
    trendRaw.forEach((item) => {
      const entry = trendMap.get(item._id.date);
      if (entry) {
        if (item._id.returned) entry.returned += item.count;
        else entry.approved += item.count;
      }
    });
    const trendData = [...trendMap.values()];

    // Avg review time in minutes
    const avgMs = avgTimeResult?.[0]?.avgMs || 0;
    const avgMinutes = Math.round(avgMs / 60000);
    const avgDisplay = avgMinutes > 0 ? `${avgMinutes}m` : '—';

    // AI detections pending (orders with damageAnnotations, in_progress)
    const aiPendingCount = await Order.countDocuments({
      status: 'in_progress',
      archived: { $ne: true },
      'damageAnnotations.0': { $exists: true },
    });

    res.json({
      success: true,
      data: {
        awaiting: awaitingCount,
        approvedToday: approvedTodayCount,
        returned: returnedCount,
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

    // Allow quality_check stage orders too — QC presses Approve after QC step
    if (!['in_progress', 'completed', 'received', 'quality_check'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve order with status: ${order.status}`,
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
    order.status = 'completed';
    order.qcCompletedAt = new Date();
    await order.save();

    // ── Emit real-time update to customer ───────────────────────────
    try {
      const io = getIO();
      // Broad event for staff dashboards
      io.emit('orderUpdated', { orderId: order._id, status: order.status });
      // Targeted event for the customer's live tracker
      const customerId = typeof order.customer === 'object'
        ? order.customer?._id?.toString?.()
        : order.customer?.toString?.();
      if (customerId) {
        io.to(`user:${customerId}`).emit('booking:status', {
          bookingId: order._id.toString(),
          status: 'completed',
          serviceTrackingStage: 'ready_pickup',
          serviceStaffAssignments: order.serviceStaffAssignments || [],
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

    res.json({ success: true, message: 'Job approved successfully', data: { id: order._id, status: order.status, serviceTrackingStage: 'ready_pickup' } });
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

    const VALID_STAGES = ['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup', 'completed'];
    if (!VALID_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, message: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}` });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Store fine-grained tracking stage on the order
    order.serviceTrackingStage = stage;
    order.serviceTrackingUpdatedAt = new Date();
    order.serviceTrackingUpdatedBy = req.user?.name || 'QC Checker';

    // Map stage to top-level status for customer dashboard live tracker
    const stageToStatus = {
      received:       'received',
      in_progress:    'in_progress',
      quality_check:  'in_progress',   // still in shop
      ready_pickup:   'completed',
      completed:      'completed',
    };
    order.status = stageToStatus[stage] || order.status;

    await order.save();

    // ── Emit real-time updates ──────────────────────────────────
    try {
      const io = getIO();
      // Broad event for staff dashboards
      io.emit('orderUpdated', {
        orderId: order._id,
        status: order.status,
        serviceTrackingStage: stage,
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
          serviceStaffAssignments: order.serviceStaffAssignments || [],
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) { console.warn('[QC] Socket emit failed:', e.message); }

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
