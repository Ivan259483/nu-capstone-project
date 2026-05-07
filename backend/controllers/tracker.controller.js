/**
 * Live tracker — per-stage customer photos & notes (QC / service staff).
 * PATCH /api/orders/:id/stage-photo — JSON { stage, photoUrl?, description? }
 * POST  /api/orders/:id/stage-photo — multipart: stage, description?, photo (file → Cloudinary)
 */
import Order from '../models/order.model.js';
import { getIO } from '../utils/socket.utils.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { uploadVehicleScanImages } from '../utils/cloudinaryStorage.utils.js';
import { SERVICE_OPERATION_ROLES } from '../constants/roles.js';

/** Same coarse stages as QC `service-status`; `confirmed` is optional text-only for customers. */
const TRACKER_MEDIA_STAGES = ['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup'];

export const TRACKER_STAGE_MEDIA_ROLES = [
  ...SERVICE_OPERATION_ROLES,
  'office_admin',
  'hr',
];

function isHttpsUrl(s) {
  return typeof s === 'string' && /^https:\/\//i.test(s.trim()) && s.length < 4096;
}

function upsertTrackerStageMedia(order, { stage, photoUrl, description, actorName, actorId }) {
  if (!order.trackerStageMedia) order.trackerStageMedia = [];
  const desc = typeof description === 'string' ? description.trim().slice(0, 2000) : '';
  const url = typeof photoUrl === 'string' ? photoUrl.trim() : '';
  const idx = order.trackerStageMedia.findIndex((e) => e.stage === stage);
  const base = {
    stage,
    photoUrl: url,
    description: desc,
    uploadedAt: new Date(),
    uploadedBy: actorName || String(actorId || 'staff'),
  };
  if (idx >= 0) {
    const prev = order.trackerStageMedia[idx];
    order.trackerStageMedia[idx] = {
      ...prev,
      ...base,
      photoUrl: url || prev.photoUrl || '',
    };
  } else {
    order.trackerStageMedia.push(base);
  }
}

function emitTrackerStageMediaUpdate(order) {
  try {
    const io = getIO();
    const media = order.trackerStageMedia || [];
    const payload = {
      orderId: order._id.toString(),
      status: order.status,
      serviceTrackingStage: order.serviceTrackingStage || null,
      trackerStageMedia: media,
      updatedAt: new Date().toISOString(),
    };
    io.emit('orderUpdated', payload);

    const customerId = typeof order.customer === 'object'
      ? order.customer?._id?.toString?.()
      : order.customer?.toString?.();
    if (customerId) {
      io.to(`user:${customerId}`).emit('booking:status', {
        bookingId: order._id.toString(),
        status: order.status,
        serviceTrackingStage: order.serviceTrackingStage || null,
        serviceStaffAssignments: order.serviceStaffAssignments || [],
        trackerStageMedia: media,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[tracker] Socket emit failed:', e.message);
  }
}

/**
 * PATCH /api/orders/:id/stage-photo
 * Body: { stage, photoUrl?, description? }
 */
export const patchTrackerStagePhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stage, photoUrl, description } = req.body || {};

    if (!TRACKER_MEDIA_STAGES.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Use one of: ${TRACKER_MEDIA_STAGES.join(', ')}`,
      });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const url = typeof photoUrl === 'string' ? photoUrl.trim() : '';
    if (url && !isHttpsUrl(url)) {
      return res.status(400).json({ success: false, message: 'photoUrl must be a valid https URL' });
    }

    if (stage !== 'confirmed' && !url) {
      return res.status(400).json({ success: false, message: 'photoUrl is required for this stage' });
    }

    if (stage === 'confirmed' && !url && !(typeof description === 'string' && description.trim())) {
      return res.status(400).json({ success: false, message: 'Provide a description or photoUrl for confirmed stage' });
    }

    upsertTrackerStageMedia(order, {
      stage,
      photoUrl: url,
      description,
      actorName: req.user?.name,
      actorId: req.user?.id,
    });

    await order.save();
    emitTrackerStageMediaUpdate(order);

    logActivity({
      req,
      type: 'system',
      module: 'LiveTracker',
      action: 'Stage media updated',
      description: `${req.user?.name || 'Staff'} updated tracker stage media (${stage}) for order ${order.orderNumber || id}.`,
      status: 'success',
      referenceId: order._id,
      metadata: { stage, hasPhoto: Boolean(url) },
    });

    res.json({
      success: true,
      message: 'Stage photo saved',
      data: { id: order._id, trackerStageMedia: order.trackerStageMedia },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/:id/stage-photo
 * multipart/form-data: stage (required), description (optional), photo (file, optional if photoUrl in body is not used)
 */
export const postTrackerStagePhotoUpload = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stage = req.body?.stage;
    const description = req.body?.description;

    if (!TRACKER_MEDIA_STAGES.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Use one of: ${TRACKER_MEDIA_STAGES.join(', ')}`,
      });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let photoUrl = '';
    if (req.file?.buffer) {
      const urls = await uploadVehicleScanImages([req.file], { folder: 'live-tracker-stages' });
      photoUrl = urls[0] || '';
    }

    if (!photoUrl && stage !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Image file is required for this stage' });
    }

    if (stage === 'confirmed' && !photoUrl && !(typeof description === 'string' && description.trim())) {
      return res.status(400).json({ success: false, message: 'Provide a photo or a description for confirmed stage' });
    }

    upsertTrackerStageMedia(order, {
      stage,
      photoUrl,
      description,
      actorName: req.user?.name,
      actorId: req.user?.id,
    });

    await order.save();
    emitTrackerStageMediaUpdate(order);

    logActivity({
      req,
      type: 'system',
      module: 'LiveTracker',
      action: 'Stage photo uploaded',
      description: `${req.user?.name || 'Staff'} uploaded tracker stage media (${stage}) for order ${order.orderNumber || id}.`,
      status: 'success',
      referenceId: order._id,
      metadata: { stage },
    });

    res.json({
      success: true,
      message: 'Stage photo uploaded',
      data: { id: order._id, photoUrl, trackerStageMedia: order.trackerStageMedia },
    });
  } catch (error) {
    if (error?.code === 'CLOUDINARY_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: error.message });
    }
    next(error);
  }
};
