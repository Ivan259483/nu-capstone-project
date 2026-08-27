import mongoose from 'mongoose';
import { clearResponseCache } from '../utils/responseCache.utils.js';
import {
  acknowledgeBackup,
  buildSafeExport,
  createEncryptedBackup,
  listBackups,
} from '../services/systemBackup.service.js';
import { listClassifications, updateClassifications } from '../services/systemClassification.service.js';
import { createCleanupPreview, executeCleanup } from '../services/systemCleanup.service.js';
import { createDemoResetPreview, executeDemoReset } from '../services/systemDemoReset.service.js';
import { retryExternalCleanup } from '../services/systemExternalCleanup.service.js';
import {
  createHandoverPreview,
  createLifecyclePreview,
  executeHandover,
  executeLifecycle,
  inviteHandoverCandidate,
} from '../services/systemLifecycle.service.js';
import {
  getSystemOperation,
  getSystemOverview,
  listPaymentReconciliationEvents,
  reviewPaymentReconciliationEvent,
} from '../services/systemOverview.service.js';
import {
  SystemManagementError,
  assertProtectedAdministrator,
  getPublicSystemStatus,
} from '../services/systemState.service.js';

const requestMetadata = (req) => ({
  ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 120),
  userAgent: String(req.get?.('user-agent') || '').slice(0, 500),
  requestId: String(req.get?.('x-request-id') || '').slice(0, 160),
});

const sendError = (res, error) => {
  const status = Number(error?.status || error?.statusCode) || 500;
  if (status >= 500) console.error('[system-management]', error?.stack || error);
  return res.status(status).json({
    success: false,
    code: error?.code || 'SYSTEM_MANAGEMENT_ERROR',
    message: status >= 500 && !error?.code
      ? 'System Management is temporarily unavailable.'
      : error?.message || 'System Management request failed.',
    ...(error?.details ? { details: error.details } : {}),
  });
};

const handler = (work) => async (req, res) => {
  try {
    await work(req, res);
  } catch (error) {
    sendError(res, error);
  }
};

const requireProtected = (req) => assertProtectedAdministrator(req.user);

export const getSystemStatus = handler(async (_req, res) => {
  res.json({ success: true, data: await getPublicSystemStatus() });
});

export const getOverview = handler(async (req, res) => {
  res.json({ success: true, data: await getSystemOverview(req.user) });
});

export const getClassification = handler(async (req, res) => {
  await requireProtected(req);
  const data = await listClassifications({
    collectionName: req.query.collection,
    environment: req.query.environment,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json({ success: true, data });
});

export const patchClassification = handler(async (req, res) => {
  await requireProtected(req);
  const data = await updateClassifications({
    items: req.body?.items,
    reviewed: req.body?.reviewed,
    actorId: req.user.id,
  });
  res.json({ success: true, message: 'Classification updated.', data });
});

export const createCleanupPreviewController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await createCleanupPreview({
    actor: req.user,
    body: req.body,
    requestMetadata: requestMetadata(req),
  });
  res.status(201).json({ success: true, data });
});

export const executeCleanupController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await executeCleanup({ actor: req.user, body: req.body });
  res.json({ success: true, message: 'System cleanup completed.', data });
});

export const createDemoResetPreviewController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await createDemoResetPreview({
    actor: req.user,
    requestMetadata: requestMetadata(req),
  });
  res.status(201).json({ success: true, data });
});

export const executeDemoResetController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await executeDemoReset({ actor: req.user, body: req.body });
  res.json({ success: true, message: 'Demo environment reset completed.', data });
});

export const downloadBackup = handler(async (req, res) => {
  await requireProtected(req);
  const { backup, artifact } = await createEncryptedBackup({
    actor: req.user,
    passphrase: req.body?.passphrase,
    purpose: req.body?.purpose || 'lifecycle',
    includeAssets: req.body?.includeAssets !== false,
  });
  const filename = `autospf-${backup._id}-${new Date().toISOString().slice(0, 10)}.autospf-backup`;
  res.set({
    'Content-Type': 'application/vnd.autospf.backup',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(artifact.length),
    'X-AutoSPF-Backup-Id': String(backup._id),
    'X-AutoSPF-Checksum': backup.checksum,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.send(artifact);
});

export const acknowledgeBackupController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await acknowledgeBackup({
    backupId: req.params.id,
    checksum: req.body?.checksum,
    actorId: req.user.id,
  });
  res.json({ success: true, message: 'Backup download verified.', data });
});

export const getBackups = handler(async (req, res) => {
  await requireProtected(req);
  res.json({ success: true, data: await listBackups({ limit: req.query.limit }) });
});

export const downloadSafeExport = handler(async (req, res) => {
  const { bytes, checksum, exportId } = await buildSafeExport({ actor: req.user });
  const filename = `autospf-safe-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(bytes.length),
    'X-AutoSPF-Export-Id': String(exportId),
    'X-AutoSPF-Checksum': checksum,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.send(bytes);
});

export const createHandoverPreviewController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await createHandoverPreview({
    actor: req.user,
    targetUserId: req.body?.targetUserId,
    requestMetadata: requestMetadata(req),
  });
  res.status(201).json({ success: true, data });
});

export const inviteHandoverCandidateController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await inviteHandoverCandidate({
    actor: req.user,
    body: req.body,
    requestMetadata: requestMetadata(req),
  });
  res.status(data.accountCreated ? 201 : 200).json({
    success: true,
    message: data.accountCreated
      ? 'Pending Office Admin created and setup email sent.'
      : 'A new setup email was sent to the pending Office Admin.',
    data,
  });
});

export const executeHandoverController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await executeHandover({ actor: req.user, body: req.body });
  res.json({ success: true, message: 'Protected administrator transferred.', data });
});

export const createLifecyclePreviewController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await createLifecyclePreview({
    actor: req.user,
    action: req.body?.action,
    requestMetadata: requestMetadata(req),
  });
  res.status(201).json({ success: true, data });
});

export const executeLifecycleController = handler(async (req, res) => {
  await requireProtected(req);
  const data = await executeLifecycle({ actor: req.user, body: req.body });
  res.json({ success: true, message: 'System lifecycle updated.', data });
});

export const getOperation = handler(async (req, res) => {
  await requireProtected(req);
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new SystemManagementError('System operation was not found.', 'OPERATION_NOT_FOUND', 404);
  }
  const data = await getSystemOperation(req.params.id);
  if (!data) throw new SystemManagementError('System operation was not found.', 'OPERATION_NOT_FOUND', 404);
  res.json({ success: true, data });
});

export const retryOperation = handler(async (req, res) => {
  await requireProtected(req);
  const data = await retryExternalCleanup({ operationId: req.params.id, actor: req.user });
  res.json({ success: true, message: 'External cleanup retry completed.', data });
});

export const getReconciliationEvents = handler(async (req, res) => {
  await requireProtected(req);
  const data = await listPaymentReconciliationEvents({ status: req.query.status, limit: req.query.limit });
  res.json({ success: true, data });
});

export const patchReconciliationEvent = handler(async (req, res) => {
  await requireProtected(req);
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new SystemManagementError('Reconciliation event was not found.', 'RECONCILIATION_NOT_FOUND', 404);
  }
  const data = await reviewPaymentReconciliationEvent({
    eventId: req.params.id,
    actorId: req.user.id,
    status: req.body?.status,
    notes: req.body?.notes,
  });
  if (!data) {
    throw new SystemManagementError(
      'Reconciliation event was not found or the requested status is invalid.',
      'RECONCILIATION_NOT_FOUND',
      404,
    );
  }
  res.json({ success: true, data });
});

export const clearCache = handler(async (req, res) => {
  await requireProtected(req);
  clearResponseCache();
  res.json({ success: true, message: 'Server response cache cleared.' });
});

export const legacySystemEndpointRemoved = (_req, res) => res.status(410).json({
  success: false,
  code: 'LEGACY_SYSTEM_ENDPOINT_REMOVED',
  message: 'This unsafe legacy System Management endpoint has been permanently removed.',
});

export const exportAllData = legacySystemEndpointRemoved;
export const backupDatabase = legacySystemEndpointRemoved;
export const resetSystem = legacySystemEndpointRemoved;

export default {
  getSystemStatus,
  getOverview,
  getClassification,
  patchClassification,
  createCleanupPreviewController,
  executeCleanupController,
  downloadBackup,
  acknowledgeBackupController,
  getBackups,
  downloadSafeExport,
  createHandoverPreviewController,
  executeHandoverController,
  createLifecyclePreviewController,
  executeLifecycleController,
  getOperation,
  retryOperation,
  getReconciliationEvents,
  patchReconciliationEvent,
  clearCache,
  legacySystemEndpointRemoved,
};
