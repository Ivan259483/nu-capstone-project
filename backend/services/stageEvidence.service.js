/**
 * Live-tracker gate evidence — the single write path for stage photos.
 *
 * Flow: signed intents (one request per batch) → browser uploads straight to Cloudinary in
 * parallel → commit verifies Cloudinary's response signature → one atomic row update on
 * `order.trackerStageMedia` → coalesced socket emit.
 *
 * Every write here touches exactly one `trackerStageMedia` row with a positional `$set`,
 * `$push`, or `$pull`. Never hydrate an order and `save()` the media array: that replaced the
 * whole array and let concurrent slot uploads (and the old background backfill) overwrite
 * each other.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import StageEvidencePhoto from '../models/stageEvidencePhoto.model.js';
import { normalizeToCanonical } from '../constants/roles.js';
import { getIO } from '../utils/socket.utils.js';
import { TRACKER_GATE_STAGES, normalizePhotoSlot } from '../utils/trackerGatePhotos.utils.js';
import { getCustomerVisibleTrackerStageMedia } from '../utils/customerTrackerEvidence.utils.js';
import { withFetchableTrackerPhotoUrls } from '../utils/trackerMediaPhotoUrl.utils.js';
import { buildCustomerStagePayload } from '../utils/customerTrackerStage.utils.js';
import {
  buildCloudinaryImageDeliveryUrl,
  hasCloudinarySignedCredentials,
  signCloudinaryUploadParams,
  verifyCloudinaryUploadResponse,
} from '../utils/cloudinaryStorage.utils.js';

export const STAGE_EVIDENCE_PUBLIC_ID_ROOT = 'autospf/stage-evidence';
export const STAGE_EVIDENCE_EAGER_THUMB = 'c_fill,w_640,h_480,g_auto,f_webp,q_auto:eco';
export const STAGE_EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;
/** Cloudinary rejects signed requests whose timestamp is older than one hour. */
export const STAGE_EVIDENCE_INTENT_TTL_MS = 60 * 60 * 1000;

const ALLOWED_FORMATS = Object.freeze(['jpg', 'jpeg', 'png', 'webp']);
const MAX_INTENT_ITEMS = 6;
const IN_FLIGHT_STATUSES = ['PENDING', 'UPLOADING', 'RETRY'];

export class StageEvidenceError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function toObjectId(value, code = 'INVALID_ID') {
  const raw = String(value || '');
  if (!mongoose.Types.ObjectId.isValid(raw) || !/^[a-f\d]{24}$/i.test(raw)) {
    throw new StageEvidenceError(400, code, 'Invalid identifier');
  }
  return new mongoose.Types.ObjectId(raw);
}

function idString(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id && value._id !== value) return String(value._id);
  return String(value);
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function buildStageEvidencePublicId({ orderId, stage, slot, attemptId }) {
  return `${STAGE_EVIDENCE_PUBLIC_ID_ROOT}/orders/${idString(orderId)}/${stage}/${slot}_${attemptId}`;
}

// ── Responses & realtime ────────────────────────────────────────────────────────

/** Never serialize inline base64 blobs into QC list/socket/upload responses. */
export function buildResponsiveTrackerMedia(media) {
  return (Array.isArray(media) ? media : []).filter(Boolean).map((entry) => {
    const photoUrl = String(entry.photoUrl || '').trim();
    const inlinePending = photoUrl.startsWith('data:');
    return {
      ...(entry._id ? { id: String(entry._id) } : {}),
      stage: entry.stage,
      ...(entry.slot ? { slot: entry.slot } : {}),
      ...(photoUrl && !inlinePending ? { photoUrl } : {}),
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.uploadedAt ? { uploadedAt: entry.uploadedAt } : {}),
      ...(entry.uploadedBy ? { uploadedBy: entry.uploadedBy } : {}),
      hasPhoto: Boolean(photoUrl),
      ...(inlinePending ? { photoPending: true } : {}),
    };
  });
}

export function emitTrackerStageMediaUpdate(order) {
  try {
    const io = getIO();
    const media = buildResponsiveTrackerMedia(order.trackerStageMedia);
    const customerMedia = withFetchableTrackerPhotoUrls(
      order._id,
      buildResponsiveTrackerMedia(getCustomerVisibleTrackerStageMedia(order))
    );
    const payload = {
      orderId: order._id.toString(),
      status: order.status,
      serviceTrackingStage: order.serviceTrackingStage || null,
      ...buildCustomerStagePayload(order),
      paymentStatus: order.paymentStatus || null,
      posQueueStatus: order.posQueueStatus || null,
      readyForPickupEvidenceComplete: Boolean(order.readyForPickupEvidenceComplete),
      readyForPaymentAt: order.readyForPaymentAt || null,
      invoiceId: order.invoiceId || null,
      trackerStageMedia: media,
      updatedAt: new Date().toISOString(),
    };
    io.to('realtime:staff').emit('orderUpdated', payload);

    const customerId = idString(order.customer);
    if (customerId) {
      io.to(`user:${customerId}`).emit('booking:status', {
        bookingId: order._id.toString(),
        status: order.status,
        serviceTrackingStage: order.serviceTrackingStage || null,
        ...buildCustomerStagePayload(order),
        paymentStatus: order.paymentStatus || null,
        posQueueStatus: order.posQueueStatus || null,
        readyForPickupEvidenceComplete: Boolean(order.readyForPickupEvidenceComplete),
        readyForPaymentAt: order.readyForPaymentAt || null,
        invoiceId: order.invoiceId || null,
        serviceStaffAssignments: order.serviceStaffAssignments || [],
        trackerStageMedia: customerMedia,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[tracker] Socket emit failed:', e.message);
  }
}

/**
 * Inline `data:` photos are reduced to a `data:` marker so emit/notification consumers still see
 * "photo present, pending" without loading or serializing the base64 bytes.
 */
const TRACKER_MEDIA_LIGHT_MAP = {
  $map: {
    input: { $ifNull: ['$trackerStageMedia', []] },
    as: 'm',
    in: {
      _id: '$$m._id',
      stage: '$$m.stage',
      slot: '$$m.slot',
      description: '$$m.description',
      uploadedAt: '$$m.uploadedAt',
      uploadedBy: '$$m.uploadedBy',
      evidenceId: '$$m.evidenceId',
      cloudinaryPublicId: '$$m.cloudinaryPublicId',
      photoUrl: {
        $switch: {
          branches: [
            { case: { $regexMatch: { input: { $ifNull: ['$$m.photoUrl', ''] }, regex: /^https:\/\//i } }, then: '$$m.photoUrl' },
            { case: { $regexMatch: { input: { $ifNull: ['$$m.photoUrl', ''] }, regex: /^data:/ } }, then: 'data:' },
          ],
          default: '',
        },
      },
    },
  },
};

export async function loadOrderForTrackerEmit(orderId) {
  const [order] = await Order.aggregate([
    { $match: { _id: toObjectId(orderId) } },
    { $set: { trackerStageMedia: TRACKER_MEDIA_LIGHT_MAP } },
    { $project: { 'legalCompliance.preServicePhotos': 0, photos: 0, damagePhotos: 0 } },
  ]);
  return order || null;
}

const pendingEmits = new Map();

/** Coalesces a burst of commits on one order (e.g. 5 parallel slots) into 1–2 socket events. */
export function scheduleTrackerMediaEmit(orderId, { delayMs = 150, maxWaitMs = 500 } = {}) {
  const key = idString(orderId);
  const now = Date.now();
  const existing = pendingEmits.get(key);
  if (existing) clearTimeout(existing.timer);
  const firstAt = existing?.firstAt ?? now;
  const wait = Math.max(0, Math.min(delayMs, firstAt + maxWaitMs - now));
  const timer = setTimeout(() => {
    pendingEmits.delete(key);
    loadOrderForTrackerEmit(key)
      .then((order) => { if (order) emitTrackerStageMediaUpdate(order); })
      .catch((error) => console.warn(`[stage-evidence] coalesced emit failed: ${error.message}`));
  }, wait);
  timer.unref?.();
  pendingEmits.set(key, { timer, firstAt });
}

// ── Atomic trackerStageMedia row writes ─────────────────────────────────────────

function rowMatchFor(stage, slot) {
  return TRACKER_GATE_STAGES.includes(stage) ? { stage, slot } : { stage };
}

/**
 * Upserts one `trackerStageMedia` row without reading or rewriting the rest of the array.
 * Safe under any number of concurrent writers on the same order.
 */
export async function applyTrackerMediaRow(orderId, row) {
  const _id = toObjectId(orderId);
  const gate = TRACKER_GATE_STAGES.includes(row.stage);
  const slot = gate ? row.slot : undefined;
  // Omitting `photoUrl` (note-only update on `confirmed`) keeps whatever photo the row has.
  const values = {
    ...(row.photoUrl !== undefined ? { photoUrl: String(row.photoUrl || '') } : {}),
    description: cleanText(row.description, 2000),
    uploadedAt: row.uploadedAt || new Date(),
    uploadedBy: row.uploadedByName || 'staff',
    ...(row.evidenceId ? { evidenceId: row.evidenceId } : {}),
    ...(row.cloudinaryPublicId ? { cloudinaryPublicId: row.cloudinaryPublicId } : {}),
  };
  const positional = (extra = {}) => Object.fromEntries(
    Object.entries({ ...values, ...extra }).map(([key, value]) => [`trackerStageMedia.$.${key}`, value])
  );
  const rowMatch = rowMatchFor(row.stage, slot);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const updated = await Order.updateOne(
      { _id, trackerStageMedia: { $elemMatch: rowMatch } },
      { $set: positional() }
    );
    if (updated.matchedCount) return { operation: 'set' };

    if (gate && slot === 'front') {
      // Legacy rows written before slots existed are treated as the `front` angle.
      const legacy = await Order.updateOne(
        { _id, trackerStageMedia: { $elemMatch: { stage: row.stage, slot: { $in: [null, ''] }, photoUrl: { $nin: [null, ''] } } } },
        { $set: positional({ slot: 'front' }) }
      );
      if (legacy.matchedCount) return { operation: 'legacy-front' };
    }

    const pushed = await Order.updateOne(
      { _id, trackerStageMedia: { $not: { $elemMatch: rowMatch } } },
      { $push: { trackerStageMedia: { stage: row.stage, ...(gate ? { slot } : {}), photoUrl: '', ...values } } }
    );
    if (pushed.matchedCount) return { operation: 'push' };

    if (!(await Order.exists({ _id }))) {
      throw new StageEvidenceError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }
    // A concurrent writer created the row between our $set and $push — loop and $set it.
  }
  throw new StageEvidenceError(409, 'EVIDENCE_WRITE_CONFLICT', 'Could not save the photo; please retry.');
}

/** Removes one gate slot row atomically. Returns true when a row was removed. */
export async function removeTrackerMediaRow(orderId, { stage, slot }) {
  const _id = toObjectId(orderId);
  const pulled = await Order.updateOne({ _id }, { $pull: { trackerStageMedia: rowMatchFor(stage, slot) } });
  if (pulled.modifiedCount) return true;
  if (slot === 'front') {
    const legacy = await Order.updateOne(
      { _id },
      { $pull: { trackerStageMedia: { stage, slot: { $in: [null, ''] }, photoUrl: { $nin: [null, ''] } } } }
    );
    return legacy.modifiedCount > 0;
  }
  return false;
}

// ── Ledger ──────────────────────────────────────────────────────────────────────

async function sweepStaleAttempts(orderId) {
  const now = new Date();
  await StageEvidencePhoto.updateMany(
    {
      orderId,
      status: { $in: IN_FLIGHT_STATUSES },
      updatedAt: { $lt: new Date(now.getTime() - STAGE_EVIDENCE_INTENT_TTL_MS) },
    },
    { $set: { status: 'FAILED', lastError: { code: 'STALE', message: 'Upload did not finish in time.', at: now } } }
  );
}

function latestPerSlot(rows) {
  const bySlot = new Map();
  for (const row of rows) {
    if (!bySlot.has(row.slot)) bySlot.set(row.slot, row);
  }
  return bySlot;
}

/**
 * Validates a batch, supersedes older in-flight attempts for the same slots, creates one ledger
 * row per photo and returns the exact signed Cloudinary form fields for each.
 */
export async function createEvidenceIntents({ orderId, user, stage, items }) {
  if (!hasCloudinarySignedCredentials()) {
    throw new StageEvidenceError(503, 'DIRECT_UPLOAD_UNAVAILABLE', 'Direct photo upload is not configured on the server.');
  }
  if (!TRACKER_GATE_STAGES.includes(stage)) {
    throw new StageEvidenceError(400, 'INVALID_STAGE', `Invalid stage. Use one of: ${TRACKER_GATE_STAGES.join(', ')}`);
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_INTENT_ITEMS) {
    throw new StageEvidenceError(400, 'INVALID_ITEMS', `Send between 1 and ${MAX_INTENT_ITEMS} photos per request.`);
  }

  const role = normalizeToCanonical(user?.role);
  const seen = new Set();
  const normalized = items.map((item) => {
    const slot = normalizePhotoSlot(item?.slot, stage);
    if (!slot) throw new StageEvidenceError(400, 'INVALID_SLOT', `Invalid photo slot for stage ${stage}.`);
    if (seen.has(slot)) throw new StageEvidenceError(400, 'DUPLICATE_SLOT', `Photo slot ${slot} was sent twice.`);
    seen.add(slot);
    if (slot === 'preassessment_form' && role !== 'staff_quality_checker') {
      throw new StageEvidenceError(403, 'SLOT_FORBIDDEN', 'Only Quality Checker staff can add the pre-assessment checklist photo.');
    }
    const bytes = Number(item?.bytes) || null;
    if (bytes && bytes > STAGE_EVIDENCE_MAX_BYTES) {
      throw new StageEvidenceError(413, 'PHOTO_TOO_LARGE', 'Photo is too large after optimization (max 8 MB).');
    }
    return { slot, bytes, originalBytes: Number(item?.originalBytes) || null };
  });

  const orderObjectId = toObjectId(orderId);
  const slots = normalized.map((item) => item.slot);
  const now = new Date();
  await sweepStaleAttempts(orderObjectId);

  const priorRows = await StageEvidencePhoto.find({ orderId: orderObjectId, stage, slot: { $in: slots } })
    .sort({ createdAt: -1 })
    .select('slot status attempts')
    .lean();
  const prior = latestPerSlot(priorRows);

  await StageEvidencePhoto.updateMany(
    { orderId: orderObjectId, stage, slot: { $in: slots }, status: { $in: IN_FLIGHT_STATUSES } },
    { $set: { status: 'FAILED', supersededAt: now, lastError: { code: 'SUPERSEDED', message: 'Replaced by a newer upload.', at: now } } }
  );

  const uploaderId = mongoose.Types.ObjectId.isValid(String(user?.id || '')) ? user.id : null;
  const created = await StageEvidencePhoto.insertMany(normalized.map((item) => {
    const previous = prior.get(item.slot);
    return {
      orderId: orderObjectId,
      stage,
      slot: item.slot,
      status: previous?.status === 'FAILED' ? 'RETRY' : 'UPLOADING',
      attempts: (previous?.attempts || 0) + 1,
      attemptId: crypto.randomUUID(),
      bytes: item.bytes,
      originalBytes: item.originalBytes,
      uploadedBy: uploaderId,
      uploadedByName: cleanText(user?.name, 120),
      storage: 'direct',
    };
  }));

  const timestamp = Math.floor(now.getTime() / 1000);
  const uploadPreset = String(process.env.CLOUDINARY_STAGE_EVIDENCE_PRESET || '').trim();
  return created.map((doc) => {
    const params = {
      public_id: buildStageEvidencePublicId(doc),
      timestamp: String(timestamp),
      allowed_formats: ALLOWED_FORMATS.join(','),
      tags: 'stage-evidence',
      eager: STAGE_EVIDENCE_EAGER_THUMB,
      eager_async: 'true',
      ...(uploadPreset ? { upload_preset: uploadPreset } : {}),
    };
    const { cloudName, apiKey, signature } = signCloudinaryUploadParams(params);
    return {
      slot: doc.slot,
      evidenceId: String(doc._id),
      attemptId: doc.attemptId,
      status: doc.status,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      fields: { ...params, api_key: apiKey, signature },
      expiresAt: new Date(timestamp * 1000 + STAGE_EVIDENCE_INTENT_TTL_MS).toISOString(),
    };
  });
}

async function hasNewerSuccessfulAttempt(record) {
  return Boolean(await StageEvidencePhoto.exists({
    orderId: record.orderId,
    stage: record.stage,
    slot: record.slot,
    status: 'SUCCESS',
    _id: { $ne: record._id },
    createdAt: { $gt: record.createdAt },
  }));
}

async function projectCommittedRecord(record, { description } = {}) {
  if (await hasNewerSuccessfulAttempt(record)) {
    await StageEvidencePhoto.updateOne({ _id: record._id, supersededAt: null }, { $set: { supersededAt: new Date() } });
    return { superseded: true };
  }
  try {
    await applyTrackerMediaRow(record.orderId, {
      stage: record.stage,
      slot: record.slot,
      photoUrl: record.cloudinaryUrl,
      description,
      uploadedByName: record.uploadedByName,
      evidenceId: record._id,
      cloudinaryPublicId: record.cloudinaryPublicId,
    });
  } catch (error) {
    await StageEvidencePhoto.updateOne(
      { _id: record._id },
      { $set: { status: 'RETRY', lastError: { code: error.code || 'PROJECTION_FAILED', message: cleanText(error.message, 300), at: new Date() } } }
    );
    throw error;
  }
  return { superseded: false };
}

/**
 * Records a hosted photo in the ledger as SUCCESS and projects it onto the order. Used by the
 * legacy multipart proxy route after it uploads to Cloudinary server-side.
 */
export async function recordHostedEvidence({ orderId, user, stage, slot, asset, description, storage = 'proxy' }) {
  const uploaderId = mongoose.Types.ObjectId.isValid(String(user?.id || '')) ? user.id : null;
  const record = await StageEvidencePhoto.create({
    orderId: toObjectId(orderId),
    stage,
    slot,
    status: 'SUCCESS',
    attemptId: crypto.randomUUID(),
    cloudinaryPublicId: asset.publicId,
    cloudinaryUrl: asset.secureUrl,
    bytes: asset.bytes || null,
    uploadedBy: uploaderId,
    uploadedByName: cleanText(user?.name, 120),
    storage,
  });
  const { superseded } = await projectCommittedRecord(record, { description });
  return { record, superseded };
}

export async function commitEvidence({ orderId, evidenceId, body }) {
  const orderObjectId = toObjectId(orderId);
  const record = await StageEvidencePhoto.findOne({ _id: toObjectId(evidenceId), orderId: orderObjectId });
  if (!record) throw new StageEvidenceError(404, 'EVIDENCE_NOT_FOUND', 'Upload attempt not found.');
  if (String(body?.attemptId || '') !== record.attemptId) {
    throw new StageEvidenceError(409, 'ATTEMPT_MISMATCH', 'This upload attempt is no longer current.');
  }

  const publicId = String(body?.public_id || '');
  const version = String(body?.version || '');
  if (publicId !== buildStageEvidencePublicId(record)) {
    throw new StageEvidenceError(400, 'PUBLIC_ID_MISMATCH', 'Uploaded asset does not belong to this photo slot.');
  }
  if (!/^\d{1,20}$/.test(version)) {
    throw new StageEvidenceError(400, 'INVALID_VERSION', 'Invalid Cloudinary version.');
  }
  if (!verifyCloudinaryUploadResponse({ publicId, version, signature: body?.signature })) {
    throw new StageEvidenceError(400, 'CLOUDINARY_SIGNATURE_INVALID', 'Cloudinary upload signature is invalid.');
  }
  const format = String(body?.format || '').toLowerCase();
  if (format && !ALLOWED_FORMATS.includes(format)) {
    throw new StageEvidenceError(400, 'INVALID_FORMAT', 'Upload a JPG, PNG, or WebP image.');
  }
  const bytes = Number(body?.bytes) || null;
  if (bytes && bytes > STAGE_EVIDENCE_MAX_BYTES) {
    throw new StageEvidenceError(413, 'PHOTO_TOO_LARGE', 'Photo is too large (max 8 MB).');
  }
  const cloudinaryUrl = buildCloudinaryImageDeliveryUrl({ publicId, version, format });

  let committed = await StageEvidencePhoto.findOneAndUpdate(
    {
      _id: record._id,
      attemptId: record.attemptId,
      $or: [
        { status: { $in: IN_FLIGHT_STATUSES } },
        { status: 'FAILED', 'lastError.code': { $ne: 'SUPERSEDED' } },
      ],
    },
    {
      $set: {
        status: 'SUCCESS',
        cloudinaryPublicId: publicId,
        cloudinaryVersion: version,
        cloudinaryUrl,
        bytes,
        width: Number(body?.width) || null,
        height: Number(body?.height) || null,
        format,
        lastError: { code: '', message: '', at: null },
      },
    },
    { new: true }
  );

  let alreadyCommitted = false;
  if (!committed) {
    const current = await StageEvidencePhoto.findById(record._id);
    if (current?.status === 'SUCCESS' && current.cloudinaryPublicId === publicId) {
      committed = current;
      alreadyCommitted = true;
    } else if (current?.lastError?.code === 'SUPERSEDED') {
      throw new StageEvidenceError(409, 'SUPERSEDED', 'A newer photo was selected for this slot.');
    } else {
      throw new StageEvidenceError(409, 'EVIDENCE_STATE_CONFLICT', 'Upload attempt cannot be committed.');
    }
  }

  const { superseded } = await projectCommittedRecord(committed, { description: body?.description });
  return { record: committed, photoUrl: cloudinaryUrl, superseded, alreadyCommitted };
}

export async function failEvidence({ orderId, evidenceId, attemptId, code, message }) {
  const now = new Date();
  const result = await StageEvidencePhoto.updateOne(
    {
      _id: toObjectId(evidenceId),
      orderId: toObjectId(orderId),
      attemptId: String(attemptId || ''),
      status: { $in: IN_FLIGHT_STATUSES },
    },
    {
      $set: {
        status: 'FAILED',
        lastError: { code: cleanText(code, 60) || 'CLIENT_REPORTED', message: cleanText(message, 300), at: now },
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function listEvidenceStatus({ orderId, stage }) {
  const orderObjectId = toObjectId(orderId);
  await sweepStaleAttempts(orderObjectId);
  const filter = { orderId: orderObjectId, supersededAt: null };
  if (stage) filter.stage = stage;
  const rows = await StageEvidencePhoto.find(filter)
    .sort({ createdAt: -1 })
    .select('stage slot status attemptId attempts cloudinaryUrl uploadedByName lastError updatedAt')
    .limit(200)
    .lean();
  const latest = new Map();
  for (const row of rows) {
    const key = `${row.stage}:${row.slot}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()].map((row) => ({
    evidenceId: String(row._id),
    stage: row.stage,
    slot: row.slot,
    status: row.status,
    attemptId: row.attemptId,
    attempts: row.attempts,
    ...(row.cloudinaryUrl ? { photoUrl: row.cloudinaryUrl } : {}),
    uploadedBy: row.uploadedByName || '',
    ...(row.lastError?.code ? { error: { code: row.lastError.code, message: row.lastError.message } } : {}),
    updatedAt: row.updatedAt,
  }));
}
