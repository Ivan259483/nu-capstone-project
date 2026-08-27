import AIScan from '../models/aiScan.model.js';
import { buildEstimateFromDamages } from '../services/estimator.service.js';
import {
  detectDamageWithRoboflow,
  isRoboflowDamageConfigured,
  RoboflowDamageError,
} from '../services/roboflowDamage.service.js';
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
    let imageUrls = [];
    let imageArchive = {
      provider: 'cloudinary',
      status: cloudinaryConfigured ? 'pending' : 'not_configured',
      uploadMode: getCloudinaryUploadMode(),
      requestedCount: req.files.length,
      uploadedCount: 0,
      httpStatus: null,
      errorCode: cloudinaryConfigured ? '' : 'CLOUDINARY_NOT_CONFIGURED',
      errorMessage: cloudinaryConfigured ? '' : getCloudinaryMissingConfigMessage(),
      failedField: cloudinaryConfigured ? '' : 'configuration',
      attemptedAt: cloudinaryConfigured ? null : new Date(),
    };

    if (!cloudinaryConfigured) {
      console.warn(`[Image Archive][${requestId}]`, JSON.stringify({
        provider: 'cloudinary',
        status: imageArchive.status,
        uploadMode: imageArchive.uploadMode,
        httpStatus: null,
        errorCode: imageArchive.errorCode,
        message: imageArchive.errorMessage,
        failedField: imageArchive.failedField,
        uploadedCount: 0,
        requestedCount: req.files.length,
      }));
    }

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
      const scanId = scan._id;
      const files = req.files;
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

export default { detectVehicleDamage };
