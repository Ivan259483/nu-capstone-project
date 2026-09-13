/**
 * Live tracker — per-stage + slot customer photos & notes (QC / service staff).
 *
 * Direct upload (preferred):
 *   POST /api/orders/:id/stage-evidence/intents             — { stage, items:[{ slot, bytes, originalBytes }] }
 *   POST /api/orders/:id/stage-evidence/:evidenceId/commit  — Cloudinary upload response fields + attemptId
 *   POST /api/orders/:id/stage-evidence/:evidenceId/fail    — { attemptId, code, message }
 *   GET  /api/orders/:id/stage-evidence?stage=              — latest ledger state per slot
 *
 * Fallback / legacy:
 *   PATCH  /api/orders/:id/stage-photo — JSON { stage, slot?, photoUrl?, description? }
 *   POST   /api/orders/:id/stage-photo — multipart: stage, slot?, description?, photo (server-side Cloudinary)
 *   DELETE /api/orders/:id/stage-photo?stage=&slot=
 *
 * Every write requires `checkOrderEvidenceWriteAccess` (assigned Quality Checker or admin) and
 * changes exactly one `trackerStageMedia` row atomically via stageEvidence.service.
 */
import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { uploadVehicleScanImages } from '../utils/cloudinaryStorage.utils.js';
import { SERVICE_OPERATION_ROLES, normalizeToCanonical } from '../constants/roles.js';
import {
  TRACKER_GATE_STAGES,
  REQUIRED_READY_PICKUP_SLOTS,
  normalizePhotoSlot,
} from '../utils/trackerGatePhotos.utils.js';
import {
  applyPickupGateCompleteSideEffects,
  revertReadyForPaymentIfPickupIncomplete,
} from '../utils/readyPickupPaymentFlow.utils.js';
import {
  createCustomerStageMediaNotification,
  notifyReadyForPickupIfGateComplete,
} from '../utils/customerStageNotifications.utils.js';
import {
  captureOrderSlotOccupancy,
  saveOrderWithSlotTransition,
} from '../services/slot.service.js';
import {
  notifyQualityEvidenceReplacement,
  syncQualityEvidenceAttention,
} from '../services/qualityNotification.service.js';
import { registerCloudinaryManagedAsset } from '../services/managedAsset.service.js';
import { runInBackground, timeOperation } from '../utils/performance.utils.js';
import {
  parseInlineImageDataUrl,
  trackerMediaPhotoVersion,
  verifyTrackerMediaPhotoSignature,
} from '../utils/trackerMediaPhotoUrl.utils.js';
import {
  EVIDENCE_ACCESS_PROJECTION,
  checkOrderEvidenceWriteAccess,
} from '../utils/stageEvidenceAccess.utils.js';
import StageEvidencePhoto from '../models/stageEvidencePhoto.model.js';
import {
  StageEvidenceError,
  applyTrackerMediaRow,
  buildResponsiveTrackerMedia,
  commitEvidence,
  createEvidenceIntents,
  failEvidence,
  listEvidenceStatus,
  loadOrderForTrackerEmit,
  recordHostedEvidence,
  removeTrackerMediaRow,
  scheduleTrackerMediaEmit,
} from '../services/stageEvidence.service.js';

export { buildResponsiveTrackerMedia };

/** Same coarse stages as QC `service-status`; `confirmed` is optional text-only for customers. */
const TRACKER_MEDIA_STAGES = ['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup'];
const STAGE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const TRACKER_STAGE_MEDIA_ROLES = [...SERVICE_OPERATION_ROLES];

function isHttpsUrl(s) {
  return typeof s === 'string' && /^https:\/\//i.test(s.trim()) && s.length < 4096;
}

function cloudinaryErrorMessage(error) {
  const data = error?.response?.data;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data === 'string') return data;
  return error?.message || 'Cloudinary upload failed';
}

function isGateStage(stage) {
  return TRACKER_GATE_STAGES.includes(stage);
}

function gateSlotInvalidMessage(stage, forQuery = false) {
  const readyPickupSlotList = REQUIRED_READY_PICKUP_SLOTS.join(', ');
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
  if (stage === 'ready_pickup') {
    return forQuery
      ? `slot query is required (${readyPickupSlotList})`
      : `slot is required for stage ${stage}. Use one of: ${readyPickupSlotList}`;
  }
  return forQuery
    ? 'slot query is required (front, rear, left, right, close_up)'
    : `slot is required for stage ${stage}. Use one of: front, rear, left, right, close_up`;
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

function sendEvidenceError(error, res, next) {
  if (error instanceof StageEvidenceError || error?.statusCode) {
    return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
  }
  return next(error);
}

/** Lean access read + assignment guard. Sends the error response and returns null when denied. */
async function loadOrderForEvidenceWrite(req, res) {
  const id = String(req.params.id || '');
  if (!OBJECT_ID_PATTERN.test(id)) {
    res.status(400).json({ success: false, message: 'Invalid order id' });
    return null;
  }
  const order = await timeOperation(
    { req, res, kind: 'db', name: 'stageEvidence.order.access' },
    () => Order.findById(id).select(`${EVIDENCE_ACCESS_PROJECTION} orderNumber`).lean()
  );
  const access = checkOrderEvidenceWriteAccess(req.user, order);
  if (!access.ok) {
    res.status(access.status).json({ success: false, code: access.code, message: access.message });
    return null;
  }
  return order;
}

/** Status-only save for the pickup queue; the media array is never part of this write. */
async function settleReadyPickupQueue(orderId, { removed = false } = {}) {
  const order = await Order.findById(orderId);
  if (!order) return;
  const occupancyBefore = captureOrderSlotOccupancy(order);
  if (removed) {
    await revertReadyForPaymentIfPickupIncomplete(order);
  } else {
    await applyPickupGateCompleteSideEffects(order);
  }
  if (order.isModified()) {
    await saveOrderWithSlotTransition(order, occupancyBefore, { validateBeforeSave: false });
  }
}

async function buildMediaResponse(orderId, stage, slot) {
  const light = await loadOrderForTrackerEmit(orderId);
  const trackerStageMedia = buildResponsiveTrackerMedia(light?.trackerStageMedia);
  const savedMedia = [...trackerStageMedia].reverse().find((entry) => (
    entry.stage === stage && (!slot || normalizePhotoSlot(entry.slot, entry.stage) === slot)
  ));
  return { trackerStageMedia, savedMedia };
}

/**
 * Notifications, managed-asset registration and audit are not part of the upload
 * acknowledgement; they run after the response so they can never stall the QC workspace.
 */
function runEvidencePostProcessing(req, { orderId, orderNumber, stage, slot, asset, storage, hasPhoto = true }) {
  void runInBackground(
    { req, kind: 'background', name: 'stageEvidence.postUploadProcessing' },
    async () => {
      const operations = [];
      if (asset?.publicId && asset?.secureUrl) {
        operations.push(registerCloudinaryManagedAsset({
          publicId: asset.publicId,
          secureUrl: asset.secureUrl,
          resourceType: 'image',
          ownerCollection: 'Order',
          ownerId: orderId,
          fieldPath: `trackerStageMedia.${stage}.${slot || 'default'}`,
          byteSize: asset.bytes || null,
        }));
      }
      if (isGateStage(stage)) operations.push(syncQualityEvidenceAttention({ _id: orderId }, stage));
      if (stage === 'ready_pickup') operations.push(notifyReadyForPickupIfGateComplete(orderId));
      if (hasPhoto) operations.push(createCustomerStageMediaNotification(orderId, stage));
      operations.push(logActivity({
        req,
        type: 'booking_updated',
        module: 'Service',
        action: 'Stage photo uploaded',
        description: `${req.user?.name || 'Staff'} uploaded tracker stage media (${stage}) for order ${orderNumber || orderId}.`,
        status: 'success',
        referenceId: orderId,
        metadata: { stage, slot, storage },
      }));
      const outcomes = await Promise.allSettled(operations);
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
    }
  );
}

/**
 * GET /api/orders/:id/tracker-media/:mediaId/photo?v=&sig=
 * Serves one evidence photo by signed URL (issued only to viewers allowed to see that row),
 * so tracker JSON payloads can reference inline-stored photos without embedding base64.
 */
export const getTrackerMediaPhoto = async (req, res, next) => {
  try {
    const orderId = String(req.params.id || '');
    const mediaId = String(req.params.mediaId || '');
    const version = String(req.query.v || '');
    const notFound = () => res.status(404).json({ success: false, message: 'Photo not found' });

    if (
      !OBJECT_ID_PATTERN.test(orderId)
      || !OBJECT_ID_PATTERN.test(mediaId)
      || !verifyTrackerMediaPhotoSignature({ orderId, mediaId, version, signature: req.query.sig })
    ) {
      return notFound();
    }

    const [row] = await timeOperation(
      { req, res, kind: 'db', name: 'trackerMediaPhoto.order.mediaRow' },
      () => Order.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
        {
          $project: {
            _id: 0,
            media: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: { $ifNull: ['$trackerStageMedia', []] },
                    as: 'entry',
                    cond: { $eq: ['$$entry._id', new mongoose.Types.ObjectId(mediaId)] },
                  },
                },
                0,
              ],
            },
          },
        },
        { $project: { photoUrl: '$media.photoUrl', uploadedAt: '$media.uploadedAt' } },
      ])
    );

    if (!row?.photoUrl || trackerMediaPhotoVersion(row.uploadedAt) !== version) return notFound();

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    if (isHttpsUrl(row.photoUrl)) return res.redirect(302, row.photoUrl);

    const image = parseInlineImageDataUrl(row.photoUrl);
    if (!image) return notFound();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Content-Length', String(image.buffer.length));
    return res.end(image.buffer);
  } catch (error) {
    next(error);
  }
};

// ── Direct-to-Cloudinary evidence upload ───────────────────────────────────────

/** POST /api/orders/:id/stage-evidence/intents */
export const createStageEvidenceIntents = async (req, res, next) => {
  try {
    const order = await loadOrderForEvidenceWrite(req, res);
    if (!order) return;
    const intents = await timeOperation(
      { req, res, kind: 'db', name: 'stageEvidence.intents' },
      () => createEvidenceIntents({
        orderId: order._id,
        user: req.user,
        stage: req.body?.stage,
        items: req.body?.items,
      })
    );
    console.info('[STAGE-EVIDENCE] intents issued', {
      orderId: String(order._id),
      stage: req.body?.stage,
      slots: intents.map((intent) => intent.slot),
      origin: req.get('origin') || null,
      host: req.get('host') || null,
      pid: process.pid,
    });
    res.json({ success: true, data: { intents } });
  } catch (error) {
    sendEvidenceError(error, res, next);
  }
};

/** POST /api/orders/:id/stage-evidence/:evidenceId/commit */
export const commitStageEvidence = async (req, res, next) => {
  try {
    const order = await loadOrderForEvidenceWrite(req, res);
    if (!order) return;
    const result = await timeOperation(
      { req, res, kind: 'db', name: 'stageEvidence.commit' },
      () => commitEvidence({ orderId: order._id, evidenceId: req.params.evidenceId, body: req.body })
    );
    const { record } = result;

    if (!result.superseded && record.stage === 'ready_pickup') {
      await timeOperation(
        { req, res, kind: 'db', name: 'stageEvidence.readyPickupQueue' },
        () => settleReadyPickupQueue(order._id)
      );
    }
    scheduleTrackerMediaEmit(order._id);

    const { trackerStageMedia, savedMedia } = await timeOperation(
      { req, res, kind: 'db', name: 'stageEvidence.commit.response' },
      () => buildMediaResponse(order._id, record.stage, record.slot)
    );

    res.json({
      success: true,
      data: {
        id: String(order._id),
        evidenceId: String(record._id),
        status: record.status,
        superseded: result.superseded,
        alreadyCommitted: result.alreadyCommitted,
        photoUrl: result.photoUrl,
        savedMedia,
        trackerStageMedia,
      },
    });

    if (!result.superseded && !result.alreadyCommitted) {
      runEvidencePostProcessing(req, {
        orderId: order._id,
        orderNumber: order.orderNumber,
        stage: record.stage,
        slot: record.slot,
        asset: { publicId: record.cloudinaryPublicId, secureUrl: record.cloudinaryUrl, bytes: record.bytes },
        storage: 'direct',
      });
    }
  } catch (error) {
    sendEvidenceError(error, res, next);
  }
};

/** POST /api/orders/:id/stage-evidence/:evidenceId/fail */
export const failStageEvidence = async (req, res, next) => {
  try {
    const order = await loadOrderForEvidenceWrite(req, res);
    if (!order) return;
    const updated = await failEvidence({
      orderId: order._id,
      evidenceId: req.params.evidenceId,
      attemptId: req.body?.attemptId,
      code: req.body?.code,
      message: req.body?.message,
    });
    res.json({ success: true, data: { updated } });
  } catch (error) {
    sendEvidenceError(error, res, next);
  }
};

/** GET /api/orders/:id/stage-evidence?stage= */
export const getStageEvidenceStatus = async (req, res, next) => {
  try {
    const order = await loadOrderForEvidenceWrite(req, res);
    if (!order) return;
    const stage = req.query?.stage ? String(req.query.stage) : '';
    if (stage && !TRACKER_MEDIA_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, message: 'Invalid stage' });
    }
    const evidence = await listEvidenceStatus({ orderId: order._id, stage });
    res.json({ success: true, data: { evidence } });
  } catch (error) {
    sendEvidenceError(error, res, next);
  }
};

// ── Legacy / fallback routes ───────────────────────────────────────────────────

/**
 * PATCH /api/orders/:id/stage-photo
 * Body: { stage, slot?, photoUrl?, description? }
 */
export const patchTrackerStagePhoto = async (req, res, next) => {
  try {
    const { stage, photoUrl, description, slot: rawSlot } = req.body || {};

    if (!TRACKER_MEDIA_STAGES.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Use one of: ${TRACKER_MEDIA_STAGES.join(', ')}`,
      });
    }

    const order = await loadOrderForEvidenceWrite(req, res);
    if (!order) return;

    const url = typeof photoUrl === 'string' ? photoUrl.trim() : '';
    if (url && !isHttpsUrl(url)) {
      return res.status(400).json({ success: false, message: 'photoUrl must be a valid https URL' });
    }

    let slot = null;
    if (isGateStage(stage)) {
      slot = normalizePhotoSlot(rawSlot, stage);
      if (!slot) {
        return res.status(400).json({ success: false, message: gateSlotInvalidMessage(stage, false) });
      }
      const slotErr = assertPreassessmentSlotAllowed(req, stage, slot);
      if (slotErr) {
        return res.status(slotErr.status).json({ success: false, message: slotErr.message });
      }
      if (!url) {
        return res.status(400).json({ success: false, message: 'photoUrl is required for this stage' });
      }
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
    }

    await applyTrackerMediaRow(order._id, {
      stage,
      slot,
      photoUrl: url || undefined,
      description,
      uploadedByName: req.user?.name || String(req.user?.id || 'staff'),
    });

    if (stage === 'ready_pickup') await settleReadyPickupQueue(order._id);
    scheduleTrackerMediaEmit(order._id);

    const { trackerStageMedia } = await buildMediaResponse(order._id, stage, slot);
    res.json({
      success: true,
      message: 'Stage photo saved',
      data: { id: order._id, trackerStageMedia },
    });

    runEvidencePostProcessing(req, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      stage,
      slot,
      storage: 'external_url',
      hasPhoto: Boolean(url),
    });
  } catch (error) {
    sendEvidenceError(error, res, next);
  }
};

/**
 * POST /api/orders/:id/stage-photo
 * multipart/form-data: stage (required), slot (required for gate stages), description?, photo
 * Server-side Cloudinary upload; used when the browser cannot reach api.cloudinary.com.
 * Photos are never stored inline in the order document.
 */
export const postTrackerStagePhotoUpload = async (req, res, next) => {
  try {
    const stage = req.body?.stage;
    const description = req.body?.description;
    const rawSlot = req.body?.slot;

    if (!TRACKER_MEDIA_STAGES.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Use one of: ${TRACKER_MEDIA_STAGES.join(', ')}`,
      });
    }

    const order = await loadOrderForEvidenceWrite(req, res);
    if (!order) return;

    let slot = null;
    if (isGateStage(stage)) {
      slot = normalizePhotoSlot(rawSlot, stage);
      if (!slot) {
        return res.status(400).json({ success: false, message: gateSlotInvalidMessage(stage, false) });
      }
      const slotErr = assertPreassessmentSlotAllowed(req, stage, slot);
      if (slotErr) {
        return res.status(slotErr.status).json({ success: false, message: slotErr.message });
      }
    }

    let asset = null;
    if (req.file?.buffer?.length) {
      if (!STAGE_PHOTO_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Upload a JPG, PNG, or WebP image.' });
      }
      try {
        const assets = await timeOperation(
          { req, res, kind: 'external', name: 'stagePhoto.cloudinary.upload' },
          () => uploadVehicleScanImages([req.file], { folder: 'live-tracker-stages', returnMetadata: true })
        );
        asset = assets[0] || null;
      } catch (uploadError) {
        console.warn(`[tracker] Cloudinary stage photo upload failed: ${cloudinaryErrorMessage(uploadError)}`);
        return res.status(502).json({
          success: false,
          code: 'CLOUDINARY_UPLOAD_FAILED',
          message: 'Photo storage is temporarily unavailable. Please retry.',
        });
      }
    }

    if (!asset?.secureUrl && stage !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Image file is required for this stage' });
    }
    if (stage === 'confirmed' && !asset && !(typeof description === 'string' && description.trim())) {
      return res.status(400).json({ success: false, message: 'Provide a photo or a description for confirmed stage' });
    }

    let superseded = false;
    if (asset && isGateStage(stage)) {
      ({ superseded } = await timeOperation(
        { req, res, kind: 'db', name: 'stagePhoto.recordHostedEvidence' },
        () => recordHostedEvidence({ orderId: order._id, user: req.user, stage, slot, asset, description })
      ));
    } else {
      await applyTrackerMediaRow(order._id, {
        stage,
        slot,
        photoUrl: asset?.secureUrl,
        description,
        uploadedByName: req.user?.name || String(req.user?.id || 'staff'),
        cloudinaryPublicId: asset?.publicId,
      });
    }

    if (stage === 'ready_pickup' && !superseded) await settleReadyPickupQueue(order._id);
    scheduleTrackerMediaEmit(order._id);

    const { trackerStageMedia, savedMedia } = await buildMediaResponse(order._id, stage, slot);
    res.json({
      success: true,
      message: 'Stage photo uploaded',
      data: {
        id: order._id,
        photoUrl: savedMedia?.photoUrl,
        photoStorage: asset ? 'cloudinary' : 'none',
        savedMedia,
        trackerStageMedia,
        verificationStatus: 'verified',
      },
    });

    runEvidencePostProcessing(req, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      stage,
      slot,
      asset,
      storage: 'proxy',
      hasPhoto: Boolean(asset),
    });
  } catch (error) {
    sendEvidenceError(error, res, next);
  }
};

/**
 * DELETE /api/orders/:id/stage-photo?stage=&slot=
 */
export const deleteTrackerStagePhoto = async (req, res, next) => {
  try {
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
      return res.status(400).json({ success: false, message: gateSlotInvalidMessage(stage, true) });
    }
    const slotErr = assertPreassessmentSlotAllowed(req, stage, slot);
    if (slotErr) {
      return res.status(slotErr.status).json({ success: false, message: slotErr.message });
    }

    const order = await loadOrderForEvidenceWrite(req, res);
    if (!order) return;

    const removed = await removeTrackerMediaRow(order._id, { stage, slot });
    if (!removed) {
      return res.status(404).json({ success: false, message: 'No photo for that stage and slot' });
    }
    await StageEvidencePhoto.updateMany(
      { orderId: order._id, stage, slot, status: 'SUCCESS', supersededAt: null },
      { $set: { supersededAt: new Date() } }
    );

    if (stage === 'ready_pickup') await settleReadyPickupQueue(order._id, { removed: true });
    scheduleTrackerMediaEmit(order._id);

    const { trackerStageMedia } = await buildMediaResponse(order._id, stage, slot);
    res.json({
      success: true,
      message: 'Stage photo removed',
      data: { id: order._id, trackerStageMedia },
    });

    void runInBackground(
      { req, kind: 'background', name: 'stageEvidence.removeProcessing' },
      async () => {
        await notifyQualityEvidenceReplacement({ _id: order._id }, stage, slot);
        await logActivity({
          req,
          type: 'booking_updated',
          module: 'Service',
          action: 'Stage photo removed',
          description: `${req.user?.name || 'Staff'} removed tracker slot (${stage}/${slot}) for order ${order.orderNumber || order._id}.`,
          status: 'success',
          referenceId: order._id,
          metadata: { stage, slot },
        });
      }
    );
  } catch (error) {
    sendEvidenceError(error, res, next);
  }
};
