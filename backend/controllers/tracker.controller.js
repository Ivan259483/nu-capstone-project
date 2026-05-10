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
const INLINE_STAGE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const INLINE_STAGE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const TRACKER_STAGE_MEDIA_ROLES = [...SERVICE_OPERATION_ROLES];

function isHttpsUrl(s) {
  return typeof s === 'string' && /^https:\/\//i.test(s.trim()) && s.length < 4096;
}

function isSupportedInlineStagePhoto(file) {
  return Boolean(file?.buffer?.length && INLINE_STAGE_PHOTO_MIME_TYPES.has(file.mimetype));
}

function cloudinaryErrorMessage(error) {
  const data = error?.response?.data;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data === 'string') return data;
  return error?.message || 'Cloudinary upload failed';
}

function buildInlineStagePhotoUrl(file) {
  if (!isSupportedInlineStagePhoto(file)) {
    const error = new Error('Upload a JPG, PNG, or WebP image.');
    error.statusCode = 400;
    throw error;
  }

  if (file.buffer.length > INLINE_STAGE_PHOTO_MAX_BYTES) {
    const error = new Error('Photo storage failed. Please upload a smaller JPG, PNG, or WebP image.');
    error.statusCode = 400;
    throw error;
  }

  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
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
    let storage = 'none';
    if (req.file?.buffer) {
      try {
        const urls = await uploadVehicleScanImages([req.file], { folder: 'live-tracker-stages' });
        photoUrl = urls[0] || '';
        storage = photoUrl ? 'cloudinary' : 'none';
      } catch (uploadError) {
        console.warn(
          `[tracker] Cloudinary stage photo upload failed; using inline fallback: ${cloudinaryErrorMessage(uploadError)}`
        );
        photoUrl = buildInlineStagePhotoUrl(req.file);
        storage = 'inline';
      }
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
      metadata: { stage, storage },
    });

    res.json({
      success: true,
      message: 'Stage photo uploaded',
      data: { id: order._id, photoUrl, photoStorage: storage, trackerStageMedia: order.trackerStageMedia },
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};
