/**
 * Live tracker — per-stage + slot customer photos & notes (QC / service staff).
 * PATCH /api/orders/:id/stage-photo — JSON { stage, slot?, photoUrl?, description? }
 * POST  /api/orders/:id/stage-photo — multipart: stage, slot?, description?, photo
 * DELETE /api/orders/:id/stage-photo?stage=&slot=
 */
import Order from '../models/order.model.js';
import { getIO } from '../utils/socket.utils.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { uploadVehicleScanImages } from '../utils/cloudinaryStorage.utils.js';
import { SERVICE_OPERATION_ROLES, normalizeToCanonical } from '../constants/roles.js';
import {
  TRACKER_GATE_STAGES,
  normalizePhotoSlot,
} from '../utils/trackerGatePhotos.utils.js';
import {
  applyPickupGateCompleteSideEffects,
  revertReadyForPaymentIfPickupIncomplete,
} from '../utils/readyPickupPaymentFlow.utils.js';

/** Same coarse stages as QC `service-status`; `confirmed` is optional text-only for customers. */
const TRACKER_MEDIA_STAGES = ['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup'];
const INLINE_STAGE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const FAST_INLINE_STAGE_PHOTO_MAX_BYTES = 1024 * 1024;
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

function isGateStage(stage) {
  return TRACKER_GATE_STAGES.includes(stage);
}

function gateSlotInvalidMessage(stage, forQuery = false) {
  if (stage === 'received') {
    return forQuery
      ? 'slot query is required (front, rear, left, right, close_up, or preassessment_form for QC checklist)'
      : `slot is required for stage ${stage}. Use one of: front, rear, left, right, close_up, preassessment_form (QC checklist)`;
  }
  if (stage === 'quality_check') {
    return forQuery
      ? 'slot query is required (qc_form for QC checklist / inspection, or legacy angle slots)'
      : `slot is required for stage ${stage}. Use qc_form (QC checklist / inspection photo), or standard angle keys for legacy rows`;
  }
  return forQuery
    ? 'slot query is required (front, rear, left, right, close_up)'
    : `slot is required for stage ${stage}. Use one of: front, rear, left, right, close_up`;
}

function wantsFastInlineUpload(req) {
  const value = String(req.body?.fastInline || req.body?.preferInline || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'fast'].includes(value);
}

/** Index of row to update for (stage, slot), or merge legacy slotless row into `front`. */
function findGateMediaIndex(order, stage, normalizedSlot) {
  const list = order.trackerStageMedia || [];
  const idx = list.findIndex(
    (e) => e.stage === stage && normalizePhotoSlot(e.slot, e.stage) === normalizedSlot
  );
  if (idx >= 0) return idx;
  if (normalizedSlot === 'front') {
    return list.findIndex(
      (e) =>
        e.stage === stage &&
        String(e.photoUrl || '').trim() &&
        !normalizePhotoSlot(e.slot, e.stage)
    );
  }
  return -1;
}

function assertPreassessmentSlotAllowed(req, stage, slot) {
  if (slot !== 'preassessment_form') return null;
  if (stage !== 'received') {
    return { status: 400, message: 'checklist slot is only valid for the received stage' };
  }
  if (normalizeToCanonical(req.user?.role) !== 'staff_quality_checker') {
    return {
      status: 403,
      message: 'Only Quality Checker staff can add or remove the pre-assessment checklist photo.',
    };
  }
  return null;
}

function upsertTrackerStageMediaGate(order, { stage, slot, photoUrl, description, actorName, actorId }) {
  if (!order.trackerStageMedia) order.trackerStageMedia = [];
  const desc = typeof description === 'string' ? description.trim().slice(0, 2000) : '';
  const url = typeof photoUrl === 'string' ? photoUrl.trim() : '';
  const idx = findGateMediaIndex(order, stage, slot);
  const base = {
    stage,
    slot,
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
      slot,
      photoUrl: url || prev.photoUrl || '',
    };
  } else {
    order.trackerStageMedia.push(base);
  }
}

/** Single row per `confirmed` (no slot). */
function upsertTrackerStageMediaConfirmed(order, { stage, photoUrl, description, actorName, actorId }) {
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
      paymentStatus: order.paymentStatus || null,
      invoiceId: order.invoiceId || null,
      trackerStageMedia: media,
      updatedAt: new Date().toISOString(),
    };
    io.emit('orderUpdated', payload);

    const customerId =
      typeof order.customer === 'object'
        ? order.customer?._id?.toString?.()
        : order.customer?.toString?.();
    if (customerId) {
      io.to(`user:${customerId}`).emit('booking:status', {
        bookingId: order._id.toString(),
        status: order.status,
        serviceTrackingStage: order.serviceTrackingStage || null,
        paymentStatus: order.paymentStatus || null,
        invoiceId: order.invoiceId || null,
        serviceStaffAssignments: order.serviceStaffAssignments || [],
        trackerStageMedia: media,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[tracker] Socket emit failed:', e.message);
  }
}

function queueCloudinaryStagePhotoBackfill({
  orderId,
  stage,
  slot,
  inlineUrl,
  file,
  description,
  actorName,
  actorId,
}) {
  if (!file?.buffer?.length || !inlineUrl) return;

  setImmediate(async () => {
    try {
      const urls = await uploadVehicleScanImages([file], { folder: 'live-tracker-stages' });
      const hostedUrl = urls[0] || '';
      if (!hostedUrl) return;

      const order = await Order.findById(orderId);
      if (!order) return;

      let idx = -1;
      if (isGateStage(stage)) {
        idx = findGateMediaIndex(order, stage, slot);
      } else {
        idx = (order.trackerStageMedia || []).findIndex((e) => e.stage === stage);
      }

      if (idx < 0 || order.trackerStageMedia[idx]?.photoUrl !== inlineUrl) return;

      if (isGateStage(stage)) {
        upsertTrackerStageMediaGate(order, {
          stage,
          slot,
          photoUrl: hostedUrl,
          description,
          actorName,
          actorId,
        });
      } else {
        upsertTrackerStageMediaConfirmed(order, {
          stage,
          photoUrl: hostedUrl,
          description,
          actorName,
          actorId,
        });
      }

      order.markModified('trackerStageMedia');
      await order.save({ validateBeforeSave: false });
      emitTrackerStageMediaUpdate(order);
    } catch (error) {
      console.warn(
        `[tracker] Background Cloudinary stage photo upload failed: ${cloudinaryErrorMessage(error)}`
      );
    }
  });
}

/**
 * PATCH /api/orders/:id/stage-photo
 * Body: { stage, slot?, photoUrl?, description? }
 */
export const patchTrackerStagePhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stage, photoUrl, description, slot: rawSlot } = req.body || {};

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

    if (isGateStage(stage)) {
      const slot = normalizePhotoSlot(rawSlot, stage);
      if (!slot) {
        return res.status(400).json({
          success: false,
          message: gateSlotInvalidMessage(stage, false),
        });
      }
      const slotErr = assertPreassessmentSlotAllowed(req, stage, slot);
      if (slotErr) {
        return res.status(slotErr.status).json({ success: false, message: slotErr.message });
      }
      if (!url) {
        return res.status(400).json({ success: false, message: 'photoUrl is required for this stage' });
      }
      upsertTrackerStageMediaGate(order, {
        stage,
        slot,
        photoUrl: url,
        description,
        actorName: req.user?.name,
        actorId: req.user?.id,
      });
    } else {
      if (stage !== 'confirmed' && !url) {
        return res.status(400).json({ success: false, message: 'photoUrl is required for this stage' });
      }

      if (stage === 'confirmed' && !url && !(typeof description === 'string' && description.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Provide a description or photoUrl for confirmed stage',
        });
      }

      upsertTrackerStageMediaConfirmed(order, {
        stage,
        photoUrl: url,
        description,
        actorName: req.user?.name,
        actorId: req.user?.id,
      });
    }

    if (stage === 'ready_pickup') {
      await applyPickupGateCompleteSideEffects(order);
    }

    await order.save({ validateBeforeSave: false });
    emitTrackerStageMediaUpdate(order);

    logActivity({
      req,
      type: 'booking_updated',
      module: 'Service',
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
 * multipart/form-data: stage (required), slot (required for gate stages), description?, photo
 */
export const postTrackerStagePhotoUpload = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stage = req.body?.stage;
    const description = req.body?.description;
    const rawSlot = req.body?.slot;

    if (!TRACKER_MEDIA_STAGES.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Use one of: ${TRACKER_MEDIA_STAGES.join(', ')}`,
      });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let slot = null;
    if (isGateStage(stage)) {
      slot = normalizePhotoSlot(rawSlot, stage);
      if (!slot) {
        return res.status(400).json({
          success: false,
          message: gateSlotInvalidMessage(stage, false),
        });
      }
      const slotErr = assertPreassessmentSlotAllowed(req, stage, slot);
      if (slotErr) {
        return res.status(slotErr.status).json({ success: false, message: slotErr.message });
      }
    }

    let photoUrl = '';
    let storage = 'none';
    if (req.file?.buffer) {
      const useFastInline = wantsFastInlineUpload(req) && req.file.buffer.length <= FAST_INLINE_STAGE_PHOTO_MAX_BYTES;
      if (useFastInline) {
        photoUrl = buildInlineStagePhotoUrl(req.file);
        storage = 'inline_fast';
      } else {
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
    }

    if (!photoUrl && stage !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Image file is required for this stage' });
    }

    if (stage === 'confirmed' && !photoUrl && !(typeof description === 'string' && description.trim())) {
      return res.status(400).json({ success: false, message: 'Provide a photo or a description for confirmed stage' });
    }

    if (isGateStage(stage)) {
      upsertTrackerStageMediaGate(order, {
        stage,
        slot,
        photoUrl,
        description,
        actorName: req.user?.name,
        actorId: req.user?.id,
      });
    } else {
      upsertTrackerStageMediaConfirmed(order, {
        stage,
        photoUrl,
        description,
        actorName: req.user?.name,
        actorId: req.user?.id,
      });
    }

    if (stage === 'ready_pickup') {
      await applyPickupGateCompleteSideEffects(order);
    }

    await order.save({ validateBeforeSave: false });
    emitTrackerStageMediaUpdate(order);

    if (storage === 'inline_fast') {
      queueCloudinaryStagePhotoBackfill({
        orderId: order._id,
        stage,
        slot,
        inlineUrl: photoUrl,
        file: req.file,
        description,
        actorName: req.user?.name,
        actorId: req.user?.id,
      });
    }

    logActivity({
      req,
      type: 'booking_updated',
      module: 'Service',
      action: 'Stage photo uploaded',
      description: `${req.user?.name || 'Staff'} uploaded tracker stage media (${stage}) for order ${order.orderNumber || id}.`,
      status: 'success',
      referenceId: order._id,
      metadata: { stage, slot, storage },
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

/**
 * DELETE /api/orders/:id/stage-photo?stage=&slot=
 */
export const deleteTrackerStagePhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stage = req.query?.stage || req.body?.stage;
    const rawSlot = req.query?.slot || req.body?.slot;

    if (!TRACKER_MEDIA_STAGES.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Use one of: ${TRACKER_MEDIA_STAGES.join(', ')}`,
      });
    }

    if (!isGateStage(stage)) {
      return res.status(400).json({
        success: false,
        message: 'Only gate stages support slot delete (received, in_progress, quality_check, ready_pickup)',
      });
    }

    const slot = normalizePhotoSlot(rawSlot, stage);
    if (!slot) {
      return res.status(400).json({
        success: false,
        message: gateSlotInvalidMessage(stage, true),
      });
    }

    const slotErr = assertPreassessmentSlotAllowed(req, stage, slot);
    if (slotErr) {
      return res.status(slotErr.status).json({ success: false, message: slotErr.message });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const idx = findGateMediaIndex(order, stage, slot);
    if (idx < 0) {
      return res.status(404).json({ success: false, message: 'No photo for that stage and slot' });
    }

    order.trackerStageMedia.splice(idx, 1);
    order.markModified('trackerStageMedia');

    if (stage === 'ready_pickup') {
      revertReadyForPaymentIfPickupIncomplete(order);
    }

    await order.save({ validateBeforeSave: false });
    emitTrackerStageMediaUpdate(order);

    logActivity({
      req,
      type: 'booking_updated',
      module: 'Service',
      action: 'Stage photo removed',
      description: `${req.user?.name || 'Staff'} removed tracker slot (${stage}/${slot}) for order ${order.orderNumber || id}.`,
      status: 'success',
      referenceId: order._id,
      metadata: { stage, slot },
    });

    res.json({
      success: true,
      message: 'Stage photo removed',
      data: { id: order._id, trackerStageMedia: order.trackerStageMedia },
    });
  } catch (error) {
    next(error);
  }
};
