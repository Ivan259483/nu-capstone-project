import AIScan from '../models/aiScan.model.js';
import { buildEstimateFromDamages } from '../services/estimator.service.js';
import {
  CROSS_VIEW_DEDUPLICATION_POLICY,
  detectDamageAcrossViews,
  detectDamageWithRoboflow,
  isRoboflowDamageConfigured,
  RoboflowDamageError,
} from '../services/roboflowDamage.service.js';
import {
  GUIDED_VIEW_IDS,
  MAX_GUIDED_VIEWS,
  getGuidedViewLabel,
  isGuidedViewId,
} from '../constants/guidedViews.js';
import {
  getCloudinaryMissingConfigMessage,
  getCloudinarySafeErrorDetails,
  getCloudinaryUploadMode,
  isCloudinaryConfigured,
  uploadVehicleScanImages,
} from '../utils/cloudinaryStorage.utils.js';
import { invalidateResponseCache } from '../utils/responseCache.utils.js';
import { runInBackground, timeOperation } from '../utils/performance.utils.js';
import { registerCloudinaryManagedAsset } from '../services/managedAsset.service.js';

const parseArrayField = (value) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const safeErrorResponse = (error) => {
  if (error instanceof RoboflowDamageError) {
    return {
      status: error.status,
      body: { success: false, code: error.code, message: error.message },
    };
  }
  return {
    status: 500,
    body: { success: false, code: 'DAMAGE_DETECTION_FAILED', message: 'Vehicle damage detection failed.' },
  };
};

/** Initial archive record for a scan, before the background upload runs. */
const buildInitialImageArchive = (fileCount) => {
  const cloudinaryConfigured = isCloudinaryConfigured();
  return {
    provider: 'cloudinary',
    status: cloudinaryConfigured ? 'pending' : 'not_configured',
    uploadMode: getCloudinaryUploadMode(),
    requestedCount: fileCount,
    uploadedCount: 0,
    httpStatus: null,
    errorCode: cloudinaryConfigured ? '' : 'CLOUDINARY_NOT_CONFIGURED',
    errorMessage: cloudinaryConfigured ? '' : getCloudinaryMissingConfigMessage(),
    failedField: cloudinaryConfigured ? '' : 'configuration',
    attemptedAt: cloudinaryConfigured ? null : new Date(),
  };
};

const logMissingArchiveConfig = (requestId, imageArchive, requestedCount) => {
  console.warn(`[Image Archive][${requestId}]`, JSON.stringify({
    provider: 'cloudinary',
    status: imageArchive.status,
    uploadMode: imageArchive.uploadMode,
    httpStatus: null,
    errorCode: imageArchive.errorCode,
    message: imageArchive.errorMessage,
    failedField: imageArchive.failedField,
    uploadedCount: 0,
    requestedCount,
  }));
};

/**
 * Archive original scan images to Cloudinary after the response is sent, so
 * upload latency or failure can never delay or fail the detection result.
 * Shared by the single-image and multi-view handlers.
 */
const archiveScanImagesInBackground = ({ req, requestId, scanId, files, imageArchive }) => {
  runInBackground({ req, kind: 'external', name: 'aiScan.cloudinary.archive' }, async () => {
    let archivedUrls = [];
    let archivedAssets = [];
    let archiveState;
    try {
      archivedAssets = await uploadVehicleScanImages(files, {
        folder: String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'vehicle-scans').trim(),
        returnMetadata: true,
      });
      archivedUrls = archivedAssets.map((asset) => asset.secureUrl);
      archiveState = {
        ...imageArchive,
        status: 'succeeded',
        uploadedCount: archivedUrls.length,
        errorCode: '',
        errorMessage: '',
        failedField: '',
        attemptedAt: new Date(),
      };
    } catch (error) {
      const details = getCloudinarySafeErrorDetails(error);
      archivedUrls = Array.isArray(error?.cloudinaryUploadContext?.uploadedUrls)
        ? error.cloudinaryUploadContext.uploadedUrls
        : [];
      archivedAssets = Array.isArray(error?.cloudinaryUploadContext?.uploadedAssets)
        ? error.cloudinaryUploadContext.uploadedAssets
        : [];
      archiveState = {
        ...imageArchive,
        status: details.uploadedCount > 0 ? 'partial' : 'failed',
        uploadMode: details.uploadMode,
        uploadedCount: details.uploadedCount,
        httpStatus: details.httpStatus,
        errorCode: details.errorCode,
        errorMessage: details.message,
        failedField: details.failedField,
        attemptedAt: new Date(),
      };
      console.warn(`[Image Archive][${requestId}]`, JSON.stringify({
        provider: details.provider,
        status: archiveState.status,
        uploadMode: details.uploadMode,
        httpStatus: details.httpStatus,
        errorCode: details.errorCode,
        message: details.message,
        failedField: details.failedField,
        uploadedCount: details.uploadedCount,
        requestedCount: files.length,
      }));
    }

    await Promise.all(archivedAssets.map((asset, index) => registerCloudinaryManagedAsset({
      ...asset,
      ownerCollection: 'AIScan',
      ownerId: scanId,
      fieldPath: `imageUrls.${index}`,
      byteSize: asset.bytes,
    })));

    await timeOperation(
      { req, kind: 'db', name: 'aiScan.archive.update' },
      () => AIScan.updateOne(
        { _id: scanId },
        { $set: { imageUrls: archivedUrls, imageArchive: archiveState } }
      )
    );
    invalidateResponseCache('ai:scans:');
  });
};

/** POST /api/ai/scan — secure mobile-to-backend-to-Roboflow DETECT handler. */
export const detectVehicleDamage = async (req, res) => {
  const requestId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  try {
    if (!Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'IMAGE_REQUIRED',
        message: 'Upload at least one vehicle image in the images field.',
        request_id: requestId,
      });
    }

    const angles = parseArrayField(req.body?.angles);
    const damageAreas = parseArrayField(req.body?.damageAreas);
    const vehicleId = String(req.body?.vehicleId || '').trim().slice(0, 120);

    const analysis = await timeOperation(
      { req, res, kind: 'external', name: 'aiScan.roboflow.detect' },
      () => detectDamageWithRoboflow(req.files, {
        requestId,
        angles,
        damageAreas,
        req,
        res,
      })
    );
    const estimate = buildEstimateFromDamages(analysis.damages);

    const cloudinaryConfigured = isCloudinaryConfigured();
    const imageUrls = [];
    const imageArchive = buildInitialImageArchive(req.files.length);
    if (!cloudinaryConfigured) logMissingArchiveConfig(requestId, imageArchive, req.files.length);

    let scan = null;
    try {
      scan = await timeOperation(
        { req, res, kind: 'db', name: 'aiScan.scan.create' },
        () => AIScan.create({
          customer: req.user?.id || undefined,
          vehicleId,
          imageUrls,
          imageArchive,
          angles,
          imageCount: req.files.length,
          source: analysis.source,
          model: analysis.model,
          vehicleDetected: analysis.vehicleDetected,
          overallCondition: analysis.overallCondition,
          recommendedPackage: analysis.recommendedPackage,
          urgency: analysis.urgency,
          summary: analysis.summary,
          damages: analysis.damages,
          damageReport: analysis.damageReport,
          estimate,
          modelStatus: 'idle',
        })
      );
      invalidateResponseCache('ai:scans:');
    } catch (error) {
      // Detection remains useful offline/in a demo environment even if MongoDB
      // or archival storage is temporarily unavailable.
      console.warn(`[Damage Detection][${requestId}] Scan persistence failed:`, error?.message || error);
    }

    const elapsedMs = Date.now() - startedAt;
    res.json({
      success: true,
      request_id: requestId,
      data: {
        scanId: scan?._id ? String(scan._id) : null,
        source: analysis.source,
        model: analysis.model,
        providerConfigured: isRoboflowDamageConfigured(),
        vehicleDetected: analysis.vehicleDetected,
        noDamageDetected: analysis.noDamageDetected,
        overallCondition: analysis.overallCondition,
        recommendedPackage: analysis.recommendedPackage,
        urgency: analysis.urgency,
        summary: analysis.summary,
        damages: analysis.damages,
        damageReport: analysis.damageReport,
        estimate,
        imageUrls,
        imageArchive,
        angles,
        vehicleId,
        integration: {
          recommendation: analysis.damageReport.downstream.recommendation,
          costEstimation: analysis.damageReport.downstream.costEstimation,
          visualization3d: analysis.damageReport.downstream.visualization3d,
          ar: analysis.damageReport.downstream.ar,
        },
        imageProcessing: analysis.imageProcessing,
        createdAt: scan?.createdAt || new Date().toISOString(),
        elapsedMs,
      },
    });

    // The detection result and scan id are now available to the client. Archive
    // original images independently so Cloudinary latency/failure cannot delay it.
    if (cloudinaryConfigured && scan?._id) {
      archiveScanImagesInBackground({
        req,
        requestId,
        scanId: scan._id,
        files: req.files,
        imageArchive,
      });
    }

    return undefined;
  } catch (error) {
    const response = safeErrorResponse(error);
    console.error(
      `[Damage Detection][${requestId}] ${error?.code || error?.name || 'Error'}:`,
      error?.message || error
    );
    return res.status(response.status).json({ ...response.body, request_id: requestId });
  }
};

const MULTI_VIEW_ESTIMATE_ASSUMPTION =
  'Multi-view inspection: the same physical damage may be detected in more than one view, so these line items are provisional until a technician confirms them in person.';

/**
 * Validate the guided view identifiers that pair with the uploaded images.
 * Returns `{ error }` with a stable code, or `{ viewIds }`.
 */
const resolveGuidedViewIds = (rawValue, fileCount) => {
  const viewIds = parseArrayField(rawValue).map((value) => value.trim());

  if (viewIds.length === 0) {
    return {
      error: {
        code: 'VIEW_IDS_REQUIRED',
        message: `Provide a viewIds array naming each uploaded guided view (${GUIDED_VIEW_IDS.join(', ')}).`,
      },
    };
  }
  if (viewIds.length !== fileCount) {
    return {
      error: {
        code: 'VIEW_COUNT_MISMATCH',
        message: `Received ${fileCount} image${fileCount === 1 ? '' : 's'} and ${viewIds.length} view id${viewIds.length === 1 ? '' : 's'}. Each image needs exactly one view id.`,
      },
    };
  }
  if (viewIds.length > MAX_GUIDED_VIEWS) {
    return {
      error: {
        code: 'VIEW_LIMIT_EXCEEDED',
        message: `Upload no more than ${MAX_GUIDED_VIEWS} guided vehicle views.`,
      },
    };
  }

  const unknown = viewIds.find((viewId) => !isGuidedViewId(viewId));
  if (unknown !== undefined) {
    return {
      error: {
        code: 'UNKNOWN_VIEW_ID',
        message: `"${unknown}" is not a supported guided view. Supported views: ${GUIDED_VIEW_IDS.join(', ')}.`,
      },
    };
  }

  const seen = new Set();
  const duplicate = viewIds.find((viewId) => {
    if (seen.has(viewId)) return true;
    seen.add(viewId);
    return false;
  });
  if (duplicate !== undefined) {
    return {
      error: {
        code: 'DUPLICATE_VIEW_ID',
        message: `The guided view "${getGuidedViewLabel(duplicate)}" was supplied more than once. Send each view at most once.`,
      },
    };
  }

  return { viewIds };
};

/**
 * POST /api/ai/scan/batch — multi-view guided vehicle inspection.
 *
 * Each guided image stays an independent inference input through the same
 * production pipeline as POST /api/ai/scan. Images are never stitched. The
 * response is a superset of the single-scan payload so every existing
 * downstream screen keeps working unchanged.
 */
export const detectVehicleDamageBatch = async (req, res) => {
  const requestId = `inspection_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inspectionId = requestId;
  const startedAt = Date.now();

  try {
    if (!Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'IMAGE_REQUIRED',
        message: 'Upload at least one guided vehicle image in the images field.',
        request_id: requestId,
      });
    }

    const { viewIds, error: viewIdError } = resolveGuidedViewIds(req.body?.viewIds, req.files.length);
    if (viewIdError) {
      return res.status(400).json({
        success: false,
        code: viewIdError.code,
        message: viewIdError.message,
        request_id: requestId,
      });
    }

    const damageAreas = parseArrayField(req.body?.damageAreas);
    const vehicleId = String(req.body?.vehicleId || '').trim().slice(0, 120);

    const views = req.files.map((file, index) => ({
      file,
      viewId: viewIds[index],
      label: getGuidedViewLabel(viewIds[index]),
      index,
      damageAreaHint: damageAreas[index] || '',
    }));

    const analysis = await timeOperation(
      { req, res, kind: 'external', name: 'aiScan.roboflow.inspection' },
      () => detectDamageAcrossViews(views, { requestId, req, res })
    );

    // Pricing logic is unchanged: one line item per detected region, totalled
    // from the customer's own selection on the estimate screen. The provisional
    // assumption makes cross-view repetition explicit instead of silently
    // inflating a total.
    const estimate = buildEstimateFromDamages(analysis.damages);
    estimate.assumptions = [...(estimate.assumptions || []), MULTI_VIEW_ESTIMATE_ASSUMPTION];

    const cloudinaryConfigured = isCloudinaryConfigured();
    const imageUrls = [];
    const imageArchive = buildInitialImageArchive(req.files.length);
    if (!cloudinaryConfigured) logMissingArchiveConfig(requestId, imageArchive, req.files.length);

    let scan = null;
    try {
      scan = await timeOperation(
        { req, res, kind: 'db', name: 'aiScan.inspection.create' },
        () => AIScan.create({
          customer: req.user?.id || undefined,
          vehicleId,
          imageUrls,
          imageArchive,
          angles: viewIds,
          imageCount: req.files.length,
          inspectionId,
          inspectionMode: 'multi_view',
          // Lightweight aggregation only — damage documents are not duplicated
          // per view and no image blob is stored twice.
          views: analysis.views.map((view) => ({
            viewId: view.viewId,
            label: view.label,
            index: view.index,
            success: view.success,
            errorCode: view.errorCode,
            message: view.message,
            noDamageDetected: view.noDamageDetected,
            detectedRegions: view.damages.length,
            damageIds: view.damages.map((damage) => damage.id),
          })),
          source: analysis.source,
          model: analysis.model,
          vehicleDetected: analysis.vehicleDetected,
          overallCondition: analysis.overallCondition,
          recommendedPackage: analysis.recommendedPackage,
          urgency: analysis.urgency,
          summary: analysis.summary,
          damages: analysis.damages,
          damageReport: analysis.damageReport,
          estimate,
          modelStatus: 'idle',
        })
      );
      invalidateResponseCache('ai:scans:');
    } catch (error) {
      console.warn(`[Vehicle Inspection][${requestId}] Scan persistence failed:`, error?.message || error);
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[Vehicle Inspection][${requestId}] ${analysis.inspectionSummary.successfulViews}/${analysis.inspectionSummary.requestedViews} views analyzed, `
      + `${analysis.inspectionSummary.totalDetectedRegions} detected regions in ${elapsedMs}ms`
    );

    res.json({
      success: true,
      request_id: requestId,
      data: {
        scanId: scan?._id ? String(scan._id) : null,
        inspectionId,
        inspectionMode: 'multi_view',
        source: analysis.source,
        model: analysis.model,
        providerConfigured: isRoboflowDamageConfigured(),
        vehicleDetected: analysis.vehicleDetected,
        noDamageDetected: analysis.noDamageDetected,
        overallCondition: analysis.overallCondition,
        recommendedPackage: analysis.recommendedPackage,
        urgency: analysis.urgency,
        summary: analysis.summary,
        damages: analysis.damages,
        damageReport: analysis.damageReport,
        estimate,
        imageUrls,
        imageArchive,
        angles: viewIds,
        vehicleId,
        integration: {
          recommendation: analysis.damageReport.downstream.recommendation,
          costEstimation: analysis.damageReport.downstream.costEstimation,
          visualization3d: analysis.damageReport.downstream.visualization3d,
          ar: analysis.damageReport.downstream.ar,
        },
        imageProcessing: analysis.imageProcessing,
        // `inspectionSummary` rather than `summary`: `data.summary` is the
        // existing human-readable string every client already renders.
        inspectionSummary: analysis.inspectionSummary,
        views: analysis.views,
        crossViewDeduplication: analysis.crossViewDeduplication || CROSS_VIEW_DEDUPLICATION_POLICY,
        createdAt: scan?.createdAt || new Date().toISOString(),
        elapsedMs,
      },
    });

    if (cloudinaryConfigured && scan?._id) {
      archiveScanImagesInBackground({
        req,
        requestId,
        scanId: scan._id,
        files: req.files,
        imageArchive,
      });
    }

    return undefined;
  } catch (error) {
    const response = safeErrorResponse(error);
    console.error(
      `[Vehicle Inspection][${requestId}] ${error?.code || error?.name || 'Error'}:`,
      error?.message || error
    );
    return res.status(response.status).json({ ...response.body, request_id: requestId });
  }
};

export default { detectVehicleDamage, detectVehicleDamageBatch };
