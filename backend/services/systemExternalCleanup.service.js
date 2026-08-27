import crypto from 'node:crypto';
import axios from 'axios';
import mongoose from 'mongoose';
import firebaseAdmin from '../config/firebaseAdmin.js';
import ExternalCleanupJob from '../models/externalCleanupJob.model.js';
import ManagedAsset from '../models/managedAsset.model.js';
import SystemOperation from '../models/systemOperation.model.js';
import { SystemManagementError, getSystemState } from './systemState.service.js';
import { beginTrackedSystemMutation } from '../middleware/systemLifecycle.middleware.js';

let workerTimer = null;
let workerPass = null;

const actorSnapshot = (actor) => ({
  id: actor?.id || actor?._id,
  name: actor?.name || '',
  email: actor?.email || '',
  role: actor?.role || '',
});
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const cloudinaryAccountFromUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') return null;
    return decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '');
  } catch {
    return null;
  }
};

const deleteCloudinaryAsset = async (job) => {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new SystemManagementError(
      'Cloudinary deletion credentials are not configured.',
      'CLOUDINARY_DELETE_UNAVAILABLE',
      503,
    );
  }
  const asset = await ManagedAsset.findOne({
    _id: job.target?.assetId,
    provider: 'cloudinary',
    publicId: job.target?.publicId,
    status: { $in: ['pending_delete', 'deleted'] },
  });
  if (!asset) {
    throw new SystemManagementError(
      'The cleanup target is not a verified managed asset.',
      'UNVERIFIED_ASSET_TARGET',
      409,
    );
  }
  if (asset.status === 'deleted') return;
  const boundAccount = String(asset.accountIdentifier || '').trim();
  const urlAccount = cloudinaryAccountFromUrl(asset.secureUrl);
  if (!boundAccount || boundAccount !== cloudName || urlAccount !== cloudName) {
    throw new SystemManagementError(
      'The managed asset is not bound to the configured Cloudinary account.',
      'UNVERIFIED_ASSET_ACCOUNT',
      409,
    );
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `invalidate=true&public_id=${asset.publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex');
  const resourceType = ['image', 'video', 'raw'].includes(asset.resourceType)
    ? asset.resourceType
    : 'image';
  const response = await axios.post(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/destroy`,
    new URLSearchParams({
      public_id: asset.publicId,
      timestamp: String(timestamp),
      invalidate: 'true',
      api_key: apiKey,
      signature,
    }),
    {
      timeout: 30_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );
  if (!['ok', 'not found'].includes(response.data?.result)) {
    throw new Error(`Cloudinary returned ${String(response.data?.result || 'unknown result')}`);
  }
  asset.status = 'deleted';
  asset.deletedAt = new Date();
  await asset.save();
};

const resolveFirebaseAuth = (firebaseAuth) => firebaseAuth || firebaseAdmin?.auth?.() || null;

const deleteFirebaseIdentity = async (job, { firebaseAuth = null } = {}) => {
  const auth = resolveFirebaseAuth(firebaseAuth);
  if (!auth) {
    throw new SystemManagementError(
      'Firebase Admin credentials are not configured.',
      'FIREBASE_ADMIN_UNAVAILABLE',
      503,
    );
  }
  const uid = String(job.target?.uid || '');
  if (!uid) throw new SystemManagementError('Firebase UID is missing.', 'INVALID_CLEANUP_TARGET', 400);
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
};

const revokeFirebaseSessions = async (job, { firebaseAuth = null } = {}) => {
  const auth = resolveFirebaseAuth(firebaseAuth);
  if (!auth) {
    throw new SystemManagementError(
      'Firebase Admin credentials are not configured.',
      'FIREBASE_ADMIN_UNAVAILABLE',
      503,
    );
  }
  const uid = String(job.target?.uid || '');
  if (!uid) throw new SystemManagementError('Firebase UID is missing.', 'INVALID_CLEANUP_TARGET', 400);
  try {
    await auth.revokeRefreshTokens(uid);
  } catch (error) {
    // A missing identity has no surviving Firebase session to revoke.
    if (error?.code !== 'auth/user-not-found') throw error;
  }
};

const deleteFirestoreDocument = async (job) => {
  if (!firebaseAdmin) {
    throw new SystemManagementError(
      'Firebase Admin credentials are not configured.',
      'FIREBASE_ADMIN_UNAVAILABLE',
      503,
    );
  }
  const collection = String(job.target?.collection || '');
  const documentId = String(job.target?.documentId || '');
  if (!['users', 'bookings'].includes(collection) || !documentId) {
    throw new SystemManagementError('Firestore cleanup target is invalid.', 'INVALID_CLEANUP_TARGET', 400);
  }
  await firebaseAdmin.firestore().collection(collection).doc(documentId).delete();
};

const runJob = async (job, options = {}) => {
  if (job.provider === 'cloudinary' && job.action === 'delete_asset') {
    return deleteCloudinaryAsset(job);
  }
  if (job.provider === 'firebase_auth' && job.action === 'delete_identity') {
    return deleteFirebaseIdentity(job, options);
  }
  if (job.provider === 'firebase_auth' && job.action === 'revoke_sessions') {
    return revokeFirebaseSessions(job, options);
  }
  if (job.provider === 'firestore' && job.action === 'delete_document') {
    return deleteFirestoreDocument(job);
  }
  throw new SystemManagementError('Unsupported external cleanup job.', 'INVALID_CLEANUP_JOB', 400);
};

const isArchiveSessionRevocationJob = async (job) => {
  if (job?.provider !== 'firebase_auth' || job?.action !== 'revoke_sessions') return false;
  return Boolean(await SystemOperation.exists({
    _id: job.operationId,
    kind: 'lifecycle',
    action: 'archive',
    status: { $in: ['completed', 'completed_with_warnings'] },
  }));
};

const claimJob = async (jobId) => ExternalCleanupJob.findOneAndUpdate(
  { _id: jobId, status: { $in: ['pending', 'failed'] } },
  {
    $set: { status: 'running', lockedAt: new Date(), lastError: null },
    $inc: { attempts: 1 },
  },
  { new: true },
);

export async function reconcileExternalCleanupOperation(operationId) {
  const rows = await ExternalCleanupJob.aggregate([
    { $match: { operationId: new mongoose.Types.ObjectId(operationId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const completed = Number(byStatus.completed || 0);
  const failed = Number(byStatus.failed || 0);
  const remaining = total - completed;
  const operation = await SystemOperation.findById(operationId).select('kind status warnings');
  if (!operation) return { total, completed, failed, remaining };
  const warnings = (operation.warnings || [])
    .filter((warning) => !/(?:external cleanup|firebase session revocation) job/i.test(String(warning)));
  if (remaining) warnings.push(`${remaining} external cleanup job(s) require attention.`);
  const canReconcileTerminalStatus = ['cleanup', 'demo_reset', 'turnover', 'handover', 'lifecycle'].includes(operation.kind)
    && ['completed', 'completed_with_warnings'].includes(operation.status);
  await SystemOperation.updateOne(
    { _id: operationId },
    {
      $set: {
        ...(canReconcileTerminalStatus
          ? { status: remaining ? 'completed_with_warnings' : 'completed' }
          : {}),
        warnings,
        externalCleanup: {
          total,
          completed,
          failed,
          remaining,
          reconciledAt: new Date(),
        },
      },
    },
  );
  return { total, completed, failed, remaining };
}

export async function processExternalCleanupJob(jobId, {
  allowArchivedSessionRevocation = false,
  firebaseAuth = null,
} = {}) {
  if (!mongoose.isValidObjectId(jobId)) {
    throw new SystemManagementError('Cleanup job was not found.', 'CLEANUP_JOB_NOT_FOUND', 404);
  }
  const pendingJob = await ExternalCleanupJob.findById(jobId).lean();
  if (!pendingJob) {
    throw new SystemManagementError('Cleanup job was not found.', 'CLEANUP_JOB_NOT_FOUND', 404);
  }
  const state = await getSystemState({ lean: true });
  if (
    state.mode === 'archived'
    && !(allowArchivedSessionRevocation && await isArchiveSessionRevocationJob(pendingJob))
  ) {
    throw new SystemManagementError(
      'Only final-archive Firebase session revocations may run while archived.',
      'SYSTEM_ARCHIVED',
      423,
    );
  }
  const job = await claimJob(jobId);
  if (!job) return ExternalCleanupJob.findById(jobId).lean();
  try {
    await runJob(job, { firebaseAuth });
    job.status = 'completed';
    job.completedAt = new Date();
    job.lockedAt = null;
    job.lastError = null;
    await job.save();
  } catch (error) {
    job.status = 'failed';
    job.lockedAt = null;
    job.lastError = String(error?.message || 'External cleanup failed.').slice(0, 1000);
    job.nextAttemptAt = new Date(Date.now() + Math.min(24 * 60 * 60 * 1000, 2 ** job.attempts * 60_000));
    await job.save();
  }
  await reconcileExternalCleanupOperation(job.operationId);
  return job.toObject();
}

export async function processDueExternalCleanupJobs({
  limit = 20,
  operationId = null,
  allowArchivedSessionRevocations = false,
  firebaseAuth = null,
} = {}) {
  const ticket = await beginTrackedSystemMutation({
    allowArchived: allowArchivedSessionRevocations === true,
  });
  if (!ticket.allowed) return { skipped: true, code: ticket.code, processed: 0 };
  if (workerPass) {
    ticket.release();
    return workerPass;
  }
  workerPass = (async () => {
    const archivedSessionOnly = ticket.state?.mode === 'archived';
    if (archivedSessionOnly) {
      const source = mongoose.isValidObjectId(operationId)
        ? await SystemOperation.exists({
          _id: operationId,
          kind: 'lifecycle',
          action: 'archive',
          status: { $in: ['completed', 'completed_with_warnings'] },
        })
        : null;
      if (!source) return { skipped: true, code: 'SYSTEM_ARCHIVED', processed: 0 };
    }
    const staleLockBefore = new Date(Date.now() - 5 * 60 * 1000);
    await ExternalCleanupJob.updateMany(
      {
        status: 'running',
        lockedAt: { $lte: staleLockBefore },
        ...(archivedSessionOnly
          ? {
            operationId: new mongoose.Types.ObjectId(operationId),
            provider: 'firebase_auth',
            action: 'revoke_sessions',
          }
          : {}),
      },
      {
        $set: {
          status: 'failed',
          lockedAt: null,
          nextAttemptAt: new Date(),
          lastError: 'Worker lease expired before completion; retrying safely.',
        },
      },
    );
    const filter = {
      status: { $in: ['pending', 'failed'] },
      nextAttemptAt: { $lte: new Date() },
      ...(operationId && mongoose.isValidObjectId(operationId)
        ? { operationId: new mongoose.Types.ObjectId(operationId) }
        : {}),
      ...(archivedSessionOnly
        ? { provider: 'firebase_auth', action: 'revoke_sessions' }
        : {}),
    };
    const due = await ExternalCleanupJob.find(filter)
      .select('_id')
      .sort({ nextAttemptAt: 1, createdAt: 1 })
      .limit(Math.min(100, Math.max(1, Number(limit) || 20)))
      .lean();
    const results = [];
    for (const job of due) results.push(await processExternalCleanupJob(job._id, {
      allowArchivedSessionRevocation: archivedSessionOnly,
      firebaseAuth,
    }));
    return { skipped: false, processed: results.length, results };
  })();
  try {
    return await workerPass;
  } finally {
    workerPass = null;
    ticket.release();
  }
}

export function startExternalCleanupWorker({ intervalMs = 30_000 } = {}) {
  if (workerTimer) return workerTimer;
  const run = () => {
    void processDueExternalCleanupJobs().catch((error) => {
      console.warn('[system-external-cleanup] Worker pass failed:', error?.message || error);
    });
  };
  workerTimer = setInterval(run, Math.max(5_000, Number(intervalMs) || 30_000));
  workerTimer.unref?.();
  run();
  return workerTimer;
}

export function stopExternalCleanupWorker() {
  if (!workerTimer) return false;
  clearInterval(workerTimer);
  workerTimer = null;
  return true;
}

export async function retryExternalCleanup({ operationId, actor }) {
  const state = await getSystemState({ lean: true });
  if (!mongoose.isValidObjectId(operationId)) {
    throw new SystemManagementError('System operation was not found.', 'OPERATION_NOT_FOUND', 404);
  }
  const source = await SystemOperation.findById(operationId).select('_id kind action status');
  if (!source) {
    throw new SystemManagementError('System operation was not found.', 'OPERATION_NOT_FOUND', 404);
  }
  const jobs = await ExternalCleanupJob.find({ operationId }).sort({ createdAt: 1 });
  if (!jobs.length) {
    throw new SystemManagementError('This operation has no external cleanup jobs.', 'NO_CLEANUP_JOBS', 409);
  }
  const archiveSessionRevocationsOnly = source.kind === 'lifecycle'
    && source.action === 'archive'
    && jobs.every((job) => job.provider === 'firebase_auth' && job.action === 'revoke_sessions');
  if (state.mode === 'archived' && !archiveSessionRevocationsOnly) {
    throw new SystemManagementError(
      'Only final-archive Firebase session revocations may be retried while archived.',
      'SYSTEM_ARCHIVED',
      423,
    );
  }
  await ExternalCleanupJob.updateMany(
    { operationId, status: 'failed' },
    { $set: { status: 'pending', nextAttemptAt: new Date(), lastError: null } },
  );
  const refreshed = await ExternalCleanupJob.find({ operationId, status: { $in: ['pending', 'failed'] } })
    .sort({ createdAt: 1 });
  const results = [];
  for (const job of refreshed) results.push(await processExternalCleanupJob(job._id, {
    allowArchivedSessionRevocation: state.mode === 'archived',
  }));
  const remaining = await ExternalCleanupJob.countDocuments({
    operationId,
    status: { $in: ['pending', 'running', 'failed'] },
  });
  const completed = await ExternalCleanupJob.countDocuments({ operationId, status: 'completed' });
  await reconcileExternalCleanupOperation(operationId);
  const retryOperation = await SystemOperation.create({
    kind: 'external_cleanup_retry',
    action: 'retry_external_cleanup',
    status: remaining ? 'completed_with_warnings' : 'completed',
    actor: actorSnapshot(actor),
    counts: { total: jobs.length, completed, remaining },
    warnings: remaining ? [`${remaining} external cleanup job(s) still require attention.`] : [],
    planHash: sha256(`${operationId}:${Date.now()}:${jobs.length}`),
    completedAt: new Date(),
    receipt: {
      sourceOperationId: String(operationId),
      completed,
      remaining,
      jobs: results.map((job) => ({
        id: String(job._id),
        provider: job.provider,
        action: job.action,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError || null,
      })),
    },
  });
  return {
    retryOperationId: String(retryOperation._id),
    sourceOperationId: String(operationId),
    completed,
    remaining,
    jobs: retryOperation.receipt.jobs,
  };
}

export default {
  processExternalCleanupJob,
  processDueExternalCleanupJobs,
  reconcileExternalCleanupOperation,
  retryExternalCleanup,
  startExternalCleanupWorker,
  stopExternalCleanupWorker,
};
