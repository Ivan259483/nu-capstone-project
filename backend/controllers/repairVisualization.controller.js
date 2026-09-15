import axios from 'axios';
import mongoose from 'mongoose';
import AIScan from '../models/aiScan.model.js';
import { isServiceOperationRole } from '../constants/roles.js';
import {
  getMeshyImageToImageStatus,
  repairVisualizationDependencyStatus,
  startMeshyImageToImage,
} from '../services/meshyImageRepair.service.js';
import { registerCloudinaryManagedAsset } from '../services/managedAsset.service.js';
import { uploadBufferToCloudinary } from '../utils/cloudinaryStorage.utils.js';
import { resolveRepairVisualizationSource } from '../utils/repairVisualization.utils.js';

const REPAIR_OUTPUT_FOLDER = `${String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'vehicle-scans').trim()}/repair-visualizations`;
const MAX_REPAIR_OUTPUT_BYTES = 15 * 1024 * 1024;
const ACTIVE_REPAIR_STATUSES = new Set(['queued', 'processing']);

const authorizeScan = (scan, req, res) => {
  if (scan.customer && !req.user?.id) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return false;
  }
  if (
    scan.customer
    && String(scan.customer) !== String(req.user?.id)
    && !isServiceOperationRole(req.user?.role)
  ) {
    res.status(403).json({ success: false, message: 'Forbidden.' });
    return false;
  }
  return true;
};

const finiteNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const logRepairLifecycle = ({ scanId, sourceView, taskId, status, progress, consumedCredits }) => {
  console.info('[Repair Visualization]', JSON.stringify({
    scanId: String(scanId || ''),
    sourceView: String(sourceView || ''),
    taskId: String(taskId || ''),
    status: String(status || ''),
    progress: Math.max(0, Math.min(100, Number(progress) || 0)),
    consumedCredits: finiteNumberOrNull(consumedCredits),
  }));
};

const serializeRepairVisualization = (repair = {}) => ({
  status: String(repair.status || 'idle'),
  taskId: String(repair.taskId || ''),
  beforeImageUrl: String(repair.beforeImageUrl || ''),
  afterImageUrl: String(repair.afterImageUrl || ''),
  sourceView: String(repair.sourceView || ''),
  sourceImageIndex: Number(repair.sourceImageIndex || 0),
  sourceDamageId: String(repair.sourceDamageId || ''),
  aiModel: String(repair.aiModel || ''),
  configuredCreditsPerImage: finiteNumberOrNull(repair.configuredCreditsPerImage),
  consumedCredits: finiteNumberOrNull(repair.consumedCredits),
  progress: Math.max(0, Math.min(100, Number(repair.progress) || 0)),
  precedingTasks: finiteNumberOrNull(repair.precedingTasks),
  createdAt: repair.createdAt || null,
  completedAt: repair.completedAt || null,
  error: String(repair.error || ''),
});

const responseFor = (res, repair, statusCode = 200, message = '') => res.status(statusCode).json({
  success: true,
  ...(message ? { message } : {}),
  data: serializeRepairVisualization(repair),
});

const findOwnedScan = async (scanId, req, res) => {
  if (!mongoose.isValidObjectId(scanId)) {
    res.status(400).json({ success: false, message: 'A valid scanId is required.' });
    return null;
  }
  const scan = await AIScan.findById(scanId);
  if (!scan) {
    res.status(404).json({ success: false, message: 'Scan not found.' });
    return null;
  }
  return authorizeScan(scan, req, res) ? scan : null;
};

/** POST /api/ai/repair-visualization */
export const startRepairVisualization = async (req, res) => {
  const scanId = String(req.body?.scanId || '').trim();
  if (process.env.NODE_ENV !== 'test') {
    console.info(`[RepairVisualization] request received method=POST scanId=${scanId || '(missing)'}`);
  }
  try {
    const scan = await findOwnedScan(scanId, req, res);
    if (!scan) return;

    const existing = scan.repairVisualization;
    if (existing?.status === 'ready' || ACTIVE_REPAIR_STATUSES.has(existing?.status)) {
      return responseFor(res, existing, existing.status === 'ready' ? 200 : 202);
    }
    if (existing?.status === 'failed' && req.body?.retry !== true) {
      return responseFor(res, existing, 200, 'Explicit retry confirmation is required after a failed task.');
    }

    const dependency = repairVisualizationDependencyStatus();
    if (!dependency.available) {
      return res.status(503).json({
        success: false,
        status: 'unavailable',
        reason: dependency.reason,
        message: dependency.message,
      });
    }

    let source;
    try {
      source = resolveRepairVisualizationSource(scan, req.body);
    } catch (error) {
      const archivePending = scan.imageArchive?.status === 'pending';
      return res.status(archivePending ? 409 : 400).json({
        success: false,
        message: archivePending
          ? 'The selected inspection image is still being saved. Please try again in a moment.'
          : error.message,
        code: archivePending ? 'REPAIR_SOURCE_PENDING' : error.code,
      });
    }

    const eligibleStatuses = req.body?.retry === true ? ['idle', 'failed'] : ['idle'];
    const claim = await AIScan.findOneAndUpdate(
      {
        _id: scan._id,
        $or: [
          { repairVisualization: { $exists: false } },
          { 'repairVisualization.status': { $in: eligibleStatuses } },
        ],
      },
      {
        $set: {
          repairVisualization: {
            taskId: '',
            status: 'queued',
            ...source,
            afterImageUrl: '',
            aiModel: dependency.aiModel,
            configuredCreditsPerImage: dependency.configuredCreditsPerImage,
            consumedCredits: null,
            progress: 0,
            precedingTasks: null,
            createdAt: new Date(),
            completedAt: null,
            error: '',
          },
        },
      },
      { new: true, runValidators: true }
    );

    // A concurrent tap/request won the atomic claim. Return that one task and
    // never issue another Meshy POST.
    if (!claim) {
      const current = await AIScan.findById(scan._id).select('repairVisualization').lean();
      return responseFor(res, current?.repairVisualization || {}, 202);
    }

    try {
      const started = await startMeshyImageToImage({ referenceImageUrl: source.beforeImageUrl });
      const updated = await AIScan.findOneAndUpdate(
        {
          _id: scan._id,
          'repairVisualization.status': 'queued',
          'repairVisualization.taskId': '',
        },
        {
          $set: {
            'repairVisualization.taskId': started.taskId,
            'repairVisualization.aiModel': started.aiModel,
            'repairVisualization.configuredCreditsPerImage': started.configuredCreditsPerImage,
          },
        },
        { new: true, runValidators: true }
      );
      logRepairLifecycle({
        scanId: scan._id,
        sourceView: source.sourceView,
        taskId: started.taskId,
        status: started.status,
        progress: 0,
        consumedCredits: null,
      });
      return responseFor(res, updated?.repairVisualization || claim.repairVisualization, 202);
    } catch (error) {
      const hasDefinitiveHttpResponse = Boolean(error?.response);
      if (hasDefinitiveHttpResponse) {
        const rawMeshyStatus = String(error?.response?.data?.status || '').toUpperCase();
        const actualMeshyFailure = ['FAILED', 'CANCELED', 'CANCELLED'].includes(rawMeshyStatus);
        const errorMessage = String(
          error?.userMessage || error?.message || 'Repair visualization is temporarily unavailable.'
        ).slice(0, 500);
        const updated = await AIScan.findOneAndUpdate(
          { _id: scan._id, 'repairVisualization.taskId': '' },
          {
            $set: {
              // Only Meshy's explicit FAILED/CANCELED lifecycle may expose
              // Retry Visualization. Request validation/billing responses did
              // not create a task and remain unavailable instead.
              'repairVisualization.status': actualMeshyFailure ? 'failed' : 'idle',
              'repairVisualization.error': errorMessage,
            },
          },
          { new: true, runValidators: true }
        );
        if (actualMeshyFailure) {
          return responseFor(res, updated?.repairVisualization || claim.repairVisualization, 502);
        }
        return res.status(502).json({
          success: false,
          status: 'unavailable',
          message: errorMessage,
          code: error?.code || 'MESHY_IMAGE_REPAIR_UPSTREAM_UNAVAILABLE',
        });
      }

      // A timeout/no-response may have reached Meshy and spent credits. Keep
      // the atomic claim non-terminal so retries/remounts cannot double-spend.
      const pendingMessage = String(
        error?.userMessage || 'Repair visualization is temporarily unavailable.'
      ).slice(0, 500);
      await AIScan.updateOne(
        { _id: scan._id, 'repairVisualization.taskId': '' },
        { $set: { 'repairVisualization.error': pendingMessage } }
      );
      return responseFor(res, {
        ...claim.repairVisualization.toObject(),
        error: pendingMessage,
      }, 202, `${pendingMessage} No new task will be created automatically.`);
    }
  } catch (error) {
    console.error('[Repair Visualization][start] Error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Failed to start repair visualization.' });
  }
};

const downloadGeneratedImage = async (imageUrl) => {
  const parsed = new URL(String(imageUrl || ''));
  const trustedHost = parsed.hostname === 'assets.meshy.ai' || parsed.hostname.endsWith('.meshy.ai');
  if (parsed.protocol !== 'https:' || !trustedHost || parsed.username || parsed.password) {
    const error = new Error('Meshy returned an unsupported image asset URL.');
    error.code = 'MESHY_REPAIR_ASSET_URL_INVALID';
    throw error;
  }
  const response = await axios.get(parsed.toString(), {
    responseType: 'arraybuffer',
    timeout: 45_000,
    maxContentLength: MAX_REPAIR_OUTPUT_BYTES,
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length === 0 || buffer.length > MAX_REPAIR_OUTPUT_BYTES) {
    throw new Error('Meshy repair image has an invalid size.');
  }
  return {
    buffer,
    contentType: String(response.headers?.['content-type'] || 'image/png').split(';')[0],
  };
};

/** GET /api/ai/repair-visualization/:scanId */
export const getRepairVisualization = async (req, res) => {
  const scanId = String(req.params?.scanId || '').trim();
  if (process.env.NODE_ENV !== 'test') {
    console.info(`[RepairVisualization] request received method=GET scanId=${scanId || '(missing)'}`);
  }
  try {
    const scan = await findOwnedScan(scanId, req, res);
    if (!scan) return;

    const current = scan.repairVisualization;
    if (!current) return responseFor(res, { status: 'idle' });
    if (current.status === 'ready' || current.status === 'failed' || !current.taskId) {
      return responseFor(res, current, current.status === 'queued' ? 202 : 200);
    }

    let meshy;
    try {
      meshy = await getMeshyImageToImageStatus(current.taskId);
    } catch {
      // Poll transport errors are non-terminal. Preserve the same task and let
      // the mobile client continue waiting rather than enabling a new POST.
      return responseFor(res, current, 200, 'Repair visualization status is temporarily unavailable.');
    }

    logRepairLifecycle({
      scanId: scan._id,
      sourceView: current.sourceView,
      taskId: current.taskId,
      status: meshy.status,
      progress: meshy.progress,
      consumedCredits: meshy.consumedCredits,
    });

    if (meshy.status === 'failed') {
      const failed = await AIScan.findOneAndUpdate(
        { _id: scan._id, 'repairVisualization.taskId': current.taskId },
        {
          $set: {
            'repairVisualization.status': 'failed',
            'repairVisualization.progress': meshy.progress,
            'repairVisualization.consumedCredits': meshy.consumedCredits,
            'repairVisualization.error': meshy.error || 'Meshy could not generate the repair preview.',
          },
        },
        { new: true, runValidators: true }
      );
      return responseFor(res, failed?.repairVisualization || current);
    }

    if (meshy.status === 'ready' && meshy.afterImageUrl) {
      try {
        const generated = await downloadGeneratedImage(meshy.afterImageUrl);
        const extension = generated.contentType.includes('jpeg') ? 'jpg' : 'png';
        const asset = await uploadBufferToCloudinary(generated.buffer, {
          folder: REPAIR_OUTPUT_FOLDER,
          publicId: `repair_visualization_${scan._id}_${current.taskId}`,
          filename: `repair_visualization_${scan._id}.${extension}`,
          contentType: generated.contentType,
          uploadType: 'repair-visualization',
          returnMetadata: true,
        });
        const ready = await AIScan.findOneAndUpdate(
          { _id: scan._id, 'repairVisualization.taskId': current.taskId },
          {
            $set: {
              'repairVisualization.status': 'ready',
              'repairVisualization.afterImageUrl': asset.secureUrl,
              'repairVisualization.aiModel': meshy.aiModel,
              'repairVisualization.configuredCreditsPerImage': meshy.configuredCreditsPerImage,
              'repairVisualization.consumedCredits': meshy.consumedCredits,
              'repairVisualization.progress': 100,
              'repairVisualization.precedingTasks': meshy.precedingTasks,
              'repairVisualization.completedAt': meshy.finishedAt
                ? new Date(meshy.finishedAt)
                : new Date(),
              'repairVisualization.error': '',
            },
          },
          { new: true, runValidators: true }
        );
        try {
          await registerCloudinaryManagedAsset({
            ...asset,
            ownerCollection: 'AIScan',
            ownerId: scan._id,
            fieldPath: 'repairVisualization.afterImageUrl',
            byteSize: asset.bytes,
          });
        } catch (assetError) {
          console.warn('[Repair Visualization] Managed-asset binding failed:', assetError?.message);
        }
        return responseFor(res, ready?.repairVisualization || current);
      } catch {
        // Meshy succeeded, but stable persistence is not finished. This is not
        // an AI task failure and must not enable a credit-spending retry.
        const processing = await AIScan.findOneAndUpdate(
          { _id: scan._id, 'repairVisualization.taskId': current.taskId },
          {
            $set: {
              'repairVisualization.status': 'processing',
              'repairVisualization.progress': 99,
              'repairVisualization.error': 'Finalizing stable repair image storage.',
            },
          },
          { new: true, runValidators: true }
        );
        return responseFor(res, processing?.repairVisualization || current, 200);
      }
    }

    // SUCCEEDED without an image is also kept non-terminal: only Meshy
    // FAILED/CANCELED is allowed to expose Retry Visualization.
    const nextStatus = meshy.status === 'queued' ? 'queued' : 'processing';
    const updated = await AIScan.findOneAndUpdate(
      { _id: scan._id, 'repairVisualization.taskId': current.taskId },
      {
        $set: {
          'repairVisualization.status': nextStatus,
          'repairVisualization.progress': meshy.progress,
          'repairVisualization.precedingTasks': meshy.precedingTasks,
          'repairVisualization.consumedCredits': meshy.consumedCredits,
          'repairVisualization.error': '',
        },
      },
      { new: true, runValidators: true }
    );
    return responseFor(res, updated?.repairVisualization || current, 200);
  } catch (error) {
    console.error('[Repair Visualization][status] Error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Failed to read repair visualization status.' });
  }
};
