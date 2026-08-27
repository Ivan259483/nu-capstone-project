import crypto from 'node:crypto';
import mongoose from 'mongoose';
import ExternalCleanupJob from '../models/externalCleanupJob.model.js';
import Order from '../models/order.model.js';
import Payment from '../models/payment.model.js';
import Product from '../models/product.model.js';
import SystemOperation from '../models/systemOperation.model.js';
import SystemState from '../models/systemState.model.js';
import User from '../models/user.model.js';
import { waitForInFlightMutations } from '../middleware/systemLifecycle.middleware.js';
import { clearResponseCache } from '../utils/responseCache.utils.js';
import { normalizeEmailForOtp } from '../utils/otp.utils.js';
import { issuePasswordSetupEmail } from './chatRegistration.service.js';
import {
  computeDataFingerprint,
  getVerifiedBackupForFingerprint,
} from './systemBackup.service.js';
import { getClassificationSummary } from './systemClassification.service.js';
import { verifyExecutionSecret } from './systemCleanup.service.js';
import {
  processDueExternalCleanupJobs,
  startExternalCleanupWorker,
  stopExternalCleanupWorker,
} from './systemExternalCleanup.service.js';
import {
  DESTRUCTIVE_TRANSACTION_LEASE_MS,
  SystemManagementError,
  acquireSystemMutationLease,
  assertProtectedAdministrator,
  computeActiveProductSetHash,
  getSystemState,
  incrementGlobalSessionEpoch,
  inventoryBaselineMatchesActiveProducts,
  releaseSystemMutationLease,
  renewSystemMutationLease,
  setSystemMode,
  updateLifecycleState,
} from './systemState.service.js';

const PREVIEW_TTL_MS = 15 * 60 * 1000;
const HANDOVER_INVITATION_NAME_RE = /^[a-zA-ZÀ-ÿ\s.\-']+$/;
const HANDOVER_INVITATION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIFECYCLE_ACTIONS = Object.freeze({
  enter_production: Object.freeze({ phrase: 'ENTER PRODUCTION' }),
  leave_production: Object.freeze({ phrase: 'LEAVE PRODUCTION' }),
  begin_decommissioning: Object.freeze({ phrase: 'BEGIN DECOMMISSIONING' }),
  archive: Object.freeze({ phrase: 'ARCHIVE AUTOSPF' }),
  restore: Object.freeze({ phrase: 'RESTORE AUTOSPF' }),
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value?._bsontype === 'ObjectId') return String(value);
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const planHash = (value) => sha256(JSON.stringify(stable(value)));
const actorSnapshot = (actor) => ({
  id: actor?.id || actor?._id,
  name: actor?.name || '',
  email: actor?.email || '',
  role: actor?.role || '',
});

const enqueueFirebaseSessionRevocations = async ({
  operationId,
  userIds = null,
  reason,
  session,
}) => {
  const filter = {
    firebaseUid: { $type: 'string', $ne: '' },
    ...(Array.isArray(userIds) && userIds.length
      ? { _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } }
      : {}),
  };
  const users = await User.find(filter)
    .select('_id firebaseUid')
    .session(session)
    .lean();
  const uniqueUsers = [...new Map(users.map((user) => [String(user.firebaseUid), user])).values()];
  const jobs = uniqueUsers.map((user) => ({
    operationId,
    provider: 'firebase_auth',
    action: 'revoke_sessions',
    target: {
      uid: String(user.firebaseUid),
      userId: String(user._id),
      reason: String(reason || 'system_lifecycle'),
    },
    targetHash: sha256(`firebase_auth:revoke_sessions:${String(user.firebaseUid)}`),
  }));
  if (jobs.length) {
    await ExternalCleanupJob.insertMany(jobs, { session, ordered: false });
  }
  return jobs.length;
};

const normalizeInvitationName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const validateHandoverInvitation = ({ name, email } = {}) => {
  const normalizedName = normalizeInvitationName(name);
  const normalizedEmail = normalizeEmailForOtp(email);
  if (
    normalizedName.length < 2
    || normalizedName.length > 80
    || !HANDOVER_INVITATION_NAME_RE.test(normalizedName)
  ) {
    throw new SystemManagementError(
      'Enter a valid client administrator name between 2 and 80 characters.',
      'HANDOVER_INVITATION_NAME_INVALID',
      400,
    );
  }
  if (
    !normalizedEmail
    || normalizedEmail.length > 254
    || !HANDOVER_INVITATION_EMAIL_RE.test(normalizedEmail)
  ) {
    throw new SystemManagementError(
      'Enter a valid client administrator email address.',
      'HANDOVER_INVITATION_EMAIL_INVALID',
      400,
    );
  }
  return { name: normalizedName, email: normalizedEmail };
};

const isReusablePendingOfficeAdmin = (user) => Boolean(
  user
  && user.role === 'office_admin'
  && user.isVerified !== true
  && user.isActive === true
  && user.isDeleted !== true
  && user.status === 'pending'
  && !user.password
  && !user.lastPasswordOtpSignInAt
  && !user.archivedAt
);

const assertReusablePendingOfficeAdmin = (user) => {
  if (!user) return;
  if (isReusablePendingOfficeAdmin(user)) return;
  throw new SystemManagementError(
    user.role === 'office_admin' && user.isVerified === true
      ? 'This Office Admin already has an account. Select it after a successful password-plus-OTP sign-in.'
      : 'This email is already linked to an account and cannot be used for a client administrator invitation.',
    'HANDOVER_INVITATION_ACCOUNT_CONFLICT',
    409,
  );
};

const recordHandoverInvitation = async ({
  actor,
  target,
  created,
  emailSent,
  tokenRecord,
  requestMetadata = {},
  error,
}) => {
  const completedAt = new Date();
  const targetSnapshot = {
    id: String(target._id),
    name: target.name,
    email: target.email,
    role: target.role,
    status: target.status,
  };
  const receipt = {
    action: 'invite_client_administrator',
    target: targetSnapshot,
    accountCreated: created,
    setupEmailSent: emailSent,
    setupExpiresAt: tokenRecord?.expiresAt || null,
    completedAt,
  };
  return SystemOperation.create({
    kind: 'handover',
    action: 'invite_client_administrator',
    status: emailSent ? 'completed' : 'failed',
    actor: actorSnapshot(actor),
    counts: {
      pendingOfficeAdministratorsCreated: created ? 1 : 0,
      setupEmailsSent: emailSent ? 1 : 0,
    },
    warnings: emailSent ? [] : ['The pending account was preserved, but the setup email was not delivered.'],
    plan: { targetUserId: String(target._id) },
    planHash: planHash({
      action: 'invite_client_administrator',
      target: targetSnapshot,
      accountCreated: created,
      completedAt,
    }),
    completedAt,
    receipt,
    requestMetadata,
    ...(error ? { error: { code: error.code || 'HANDOVER_INVITATION_EMAIL_FAILED', message: error.message } } : {}),
  });
};
const operationResponse = (operation) => ({
  previewId: String(operation._id),
  action: operation.action,
  planHash: operation.planHash,
  expiresAt: operation.previewExpiresAt,
  blockers: operation.blockers,
  warnings: operation.warnings,
  counts: operation.counts,
  preserved: operation.preserved,
  status: operation.status,
  receipt: operation.receipt || undefined,
  ...(operation.plan?.public || {}),
});

const transactionUnavailable = (error) => (
  error?.code === 20
  || error?.codeName === 'IllegalOperation'
  || /transaction numbers are only allowed on a replica set member or mongos/i.test(String(error?.message || ''))
);

const invalidateRuntimeState = async (code) => {
  clearResponseCache();
  try {
    const { disconnectAllAuthenticatedSockets } = await import('../utils/socket.utils.js');
    disconnectAllAuthenticatedSockets(code);
  } catch (error) {
    console.warn('[system-lifecycle] Immediate socket revocation failed:', error?.message || error);
  }
};

const createPreview = async ({ kind, action, actor, plan, requestMetadata = {} }) => {
  const operation = await SystemOperation.create({
    kind,
    action,
    status: 'preview',
    actor: actorSnapshot(actor),
    counts: plan.counts || {},
    preserved: plan.preserved || {},
    blockers: plan.blockers || [],
    warnings: plan.warnings || [],
    plan: plan.plan,
    planHash: plan.planHash,
    dataFingerprint: plan.dataFingerprint,
    stateRevision: plan.stateRevision,
    requiresBackup: Boolean(plan.requiresBackup),
    previewExpiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    requestMetadata,
  });
  return operationResponse(operation);
};

const validatePreviewEnvelope = async ({ actor, body, expectedKind }) => {
  const previewId = String(body.previewId || '');
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  if (!mongoose.isValidObjectId(previewId)) {
    throw new SystemManagementError('Preview was not found.', 'PREVIEW_NOT_FOUND', 404);
  }
  if (!idempotencyKey || idempotencyKey.length > 180) {
    throw new SystemManagementError('A valid idempotency key is required.', 'IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  const operation = await SystemOperation.findById(previewId);
  if (!operation || operation.kind !== expectedKind) {
    throw new SystemManagementError('Preview was not found.', 'PREVIEW_NOT_FOUND', 404);
  }
  if (String(operation.actor.id) !== String(actor?.id || actor?._id)) {
    throw new SystemManagementError('This preview belongs to another administrator.', 'PREVIEW_ACTOR_MISMATCH', 403);
  }
  if (operation.idempotencyKey === idempotencyKey && operation.receipt) {
    return { operation, idempotencyKey, replay: true };
  }
  if (operation.status !== 'preview') {
    throw new SystemManagementError('This preview has already been consumed.', 'PREVIEW_ALREADY_CONSUMED', 409);
  }
  if (operation.previewExpiresAt <= new Date()) {
    operation.status = 'expired';
    await operation.save();
    throw new SystemManagementError('Preview has expired.', 'PREVIEW_EXPIRED', 409);
  }
  if (body.planHash !== operation.planHash) {
    throw new SystemManagementError('Plan hash does not match.', 'PREVIEW_STALE', 409);
  }
  if (operation.blockers.length) {
    throw new SystemManagementError('Preview has unresolved blockers.', 'PREVIEW_BLOCKED', 409, {
      blockers: operation.blockers,
    });
  }
  return { operation, idempotencyKey, replay: false };
};

/**
 * Creates, or safely reuses, a passwordless pending Office Admin account and
 * sends a one-time setup link. This is intentionally separate from public
 * registration and is available only to the stored protected administrator.
 */
export async function inviteHandoverCandidate({ actor, body = {}, requestMetadata = {} }) {
  const state = await getSystemState({ lean: true });
  await assertProtectedAdministrator(actor, state);
  if (state.mode === 'archived') {
    throw new SystemManagementError(
      'Client administrator invitations are unavailable while the system is archived.',
      'SYSTEM_ARCHIVED',
      423,
    );
  }

  const invitation = validateHandoverInvitation(body);
  let target = await User.findOne({ email: invitation.email })
    .select('+lastPasswordOtpSignInAt');
  let created = false;
  assertReusablePendingOfficeAdmin(target);

  if (!target) {
    try {
      target = await User.create({
        name: invitation.name,
        email: invitation.email,
        role: 'office_admin',
        isVerified: false,
        isActive: true,
        isDeleted: false,
        status: 'pending',
        isFirstLogin: true,
        authVersion: 0,
      });
      created = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      target = await User.findOne({ email: invitation.email })
        .select('+lastPasswordOtpSignInAt');
      assertReusablePendingOfficeAdmin(target);
      if (!target) throw error;
    }
  }

  let tokenRecord;
  try {
    tokenRecord = await issuePasswordSetupEmail(target);
  } catch (error) {
    await recordHandoverInvitation({
      actor,
      target,
      created,
      emailSent: false,
      requestMetadata,
      error,
    });
    throw new SystemManagementError(
      'The pending Office Admin account was saved, but the setup email could not be delivered. Retry the invitation.',
      'HANDOVER_INVITATION_EMAIL_FAILED',
      502,
      { targetUserId: String(target._id), accountCreated: created },
    );
  }

  const operation = await recordHandoverInvitation({
    actor,
    target,
    created,
    emailSent: true,
    tokenRecord,
    requestMetadata,
  });
  return {
    operationId: String(operation._id),
    accountCreated: created,
    setupEmailSent: true,
    expiresAt: tokenRecord.expiresAt,
    target: {
      id: String(target._id),
      name: target.name,
      email: target.email,
      role: target.role,
      status: target.status,
      isVerified: target.isVerified,
      passwordOtpSignInComplete: false,
    },
  };
}

async function buildHandoverPlan(targetUserId, { session = null } = {}) {
  const state = await getSystemState({ session, lean: true });
  const blockers = [];
  let target = null;
  if (!mongoose.isValidObjectId(targetUserId)) {
    blockers.push({ code: 'INVALID_HANDOVER_TARGET', message: 'Select a valid Office Admin.' });
  } else {
    let query = User.findById(targetUserId)
      .select('_id name email role isVerified isActive isDeleted status password authVersion updatedAt +lastPasswordOtpSignInAt')
      .lean();
    if (session) query = query.session(session);
    target = await query;
    if (
      !target
      || target.role !== 'office_admin'
      || target.isVerified !== true
      || target.isActive !== true
      || target.isDeleted === true
      || target.status !== 'active'
      || typeof target.password !== 'string'
      || target.password.length < 10
      || !target.lastPasswordOtpSignInAt
    ) {
      blockers.push({
        code: 'HANDOVER_TARGET_NOT_READY',
        message: 'The target must be an active, verified Office Admin with password setup and a completed password-plus-OTP sign-in.',
      });
    }
    if (target && String(target._id) === String(state.protectedAdministratorId || '')) {
      blockers.push({ code: 'HANDOVER_TARGET_ALREADY_PROTECTED', message: 'Select a different administrator.' });
    }
  }
  const dataFingerprint = await computeDataFingerprint({ session });
  const targetSnapshot = target ? {
    id: String(target._id),
    name: target.name,
    email: target.email,
    role: target.role,
    authVersion: target.authVersion,
    updatedAt: target.updatedAt,
    lastPasswordOtpSignInAt: target.lastPasswordOtpSignInAt,
  } : { id: String(targetUserId || '') };
  const hashInput = {
    action: 'transfer_administrator',
    target: targetSnapshot,
    protectedAdministratorId: state.protectedAdministratorId
      ? String(state.protectedAdministratorId)
      : null,
    mode: state.mode,
    dataFingerprint,
  };
  return {
    counts: { administratorsTransferred: 1, administratorsArchived: 1 },
    preserved: {},
    blockers,
    warnings: [],
    plan: {
      targetUserId: String(targetUserId || ''),
      targetSnapshot,
      public: { target: targetSnapshot },
    },
    planHash: planHash(hashInput),
    dataFingerprint,
    stateRevision: state.revision,
  };
}

export async function createHandoverPreview({ actor, targetUserId, requestMetadata = {} }) {
  const state = await getSystemState({ lean: true });
  await assertProtectedAdministrator(actor, state);
  if (state.mode === 'archived') {
    throw new SystemManagementError(
      'Administrator transfer is unavailable while the system is archived.',
      'SYSTEM_ARCHIVED',
      423,
    );
  }
  return createPreview({
    kind: 'handover',
    action: 'transfer_administrator',
    actor,
    plan: await buildHandoverPlan(targetUserId),
    requestMetadata,
  });
}

export async function executeHandover({ actor, body = {}, firebaseAuth = null }) {
  const envelope = await validatePreviewEnvelope({ actor, body, expectedKind: 'handover' });
  let { operation } = envelope;
  if (envelope.replay) return operationResponse(operation);
  if (body.phrase !== 'TRANSFER AUTOSPF ADMIN') {
    throw new SystemManagementError('Confirmation phrase does not match.', 'CONFIRMATION_PHRASE_MISMATCH', 400);
  }
  await assertProtectedAdministrator(actor);
  await verifyExecutionSecret(actor.id || actor._id, body.password);
  const leaseState = await acquireSystemMutationLease({
    operationId: operation._id,
    owner: `system:handover:${actor.id || actor._id}`,
    ttlMs: 120_000,
  });
  const lease = {
    operationId: operation._id,
    fencingToken: leaseState.mutationLease?.fencingToken,
  };
  let postCommitFirebaseRevocation = null;
  try {
    await waitForInFlightMutations({ timeoutMs: 15_000 });
    await renewSystemMutationLease({
      ...lease,
      ttlMs: DESTRUCTIVE_TRANSACTION_LEASE_MS,
    });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const fresh = await buildHandoverPlan(operation.plan.targetUserId, { session });
        if (fresh.planHash !== operation.planHash || fresh.blockers.length) {
          throw new SystemManagementError(
            'Handover state changed after preview. No changes were committed.',
            'PREVIEW_STALE',
            409,
            { blockers: fresh.blockers },
          );
        }
        const claimed = await SystemOperation.updateOne(
          { _id: operation._id, status: 'preview', idempotencyKey: null },
          { $set: { status: 'running', idempotencyKey: envelope.idempotencyKey, consumedAt: new Date() } },
          { session },
        );
        if (claimed.modifiedCount !== 1) {
          throw new SystemManagementError('This preview has already been consumed.', 'PREVIEW_ALREADY_CONSUMED', 409);
        }
        const targetId = operation.plan.targetUserId;
        const actorId = actor.id || actor._id;
        const promoted = await User.updateOne(
          {
            _id: targetId,
            role: 'office_admin',
            isVerified: true,
            isActive: true,
            isDeleted: { $ne: true },
            status: 'active',
          },
          { $set: { role: 'administrator' }, $inc: { authVersion: 1 } },
          { session },
        );
        if (promoted.modifiedCount !== 1) {
          throw new SystemManagementError('Handover target changed after preview.', 'PREVIEW_STALE', 409);
        }
        const archived = await User.updateOne(
          { _id: actorId, role: 'administrator', isActive: true, isDeleted: { $ne: true } },
          {
            $set: { isActive: false, status: 'suspended', archivedAt: new Date() },
            $inc: { authVersion: 1 },
          },
          { session },
        );
        if (archived.modifiedCount !== 1) {
          throw new SystemManagementError('Outgoing administrator changed after preview.', 'PREVIEW_STALE', 409);
        }
        const stateUpdate = await SystemState.updateOne(
          { protectedAdministratorId: actorId },
          {
            $set: { protectedAdministratorId: targetId },
            $inc: { globalSessionEpoch: 1, revision: 1 },
          },
          { session },
        );
        if (stateUpdate.modifiedCount !== 1) {
          throw new SystemManagementError('Protected administrator changed after preview.', 'PREVIEW_STALE', 409);
        }
        const externalJobs = await enqueueFirebaseSessionRevocations({
          operationId: operation._id,
          userIds: [actorId, targetId],
          reason: 'administrator_handover',
          session,
        });
        const receipt = {
          operationId: String(operation._id),
          action: operation.action,
          outgoingAdministratorId: String(actorId),
          targetAdministratorId: String(targetId),
          externalJobs,
          completedAt: new Date(),
        };
        await SystemOperation.updateOne(
          { _id: operation._id, status: 'running', idempotencyKey: envelope.idempotencyKey },
          {
            $set: {
              status: externalJobs ? 'completed_with_warnings' : 'completed',
              completedAt: receipt.completedAt,
              receipt,
              warnings: externalJobs
                ? [`${externalJobs} external cleanup job(s) are pending for Firebase session revocation.`]
                : [],
            },
          },
          { session },
        );
        await renewSystemMutationLease({
          ...lease,
          ttlMs: DESTRUCTIVE_TRANSACTION_LEASE_MS,
          session,
        });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      operation = await SystemOperation.findById(operation._id);
      if (Number(operation.receipt?.externalJobs || 0) > 0) {
        postCommitFirebaseRevocation = {
          operationId: operation._id,
          allowArchivedSessionRevocations: false,
          firebaseAuth,
          logPrefix: '[system-handover]',
        };
      }
      await invalidateRuntimeState('ADMINISTRATOR_TRANSFERRED');
      return operationResponse(operation);
    } catch (error) {
      if (transactionUnavailable(error)) {
        throw new SystemManagementError(
          'Administrator transfer requires MongoDB replica-set transactions.',
          'TRANSACTIONS_REQUIRED',
          503,
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  } finally {
    try {
      await releaseSystemMutationLease(lease);
    } finally {
      if (postCommitFirebaseRevocation) {
        const task = postCommitFirebaseRevocation;
        setImmediate(() => {
          void processDueExternalCleanupJobs({
            operationId: task.operationId,
            allowArchivedSessionRevocations: task.allowArchivedSessionRevocations,
            firebaseAuth: task.firebaseAuth,
          }).catch((error) => {
            console.warn(`${task.logPrefix} Firebase session revocation pass failed:`, error?.message || error);
          });
        });
      }
    }
  }
}

async function buildLifecyclePlan(action, { session = null } = {}) {
  const descriptor = LIFECYCLE_ACTIONS[action];
  if (!descriptor) {
    throw new SystemManagementError('Unsupported lifecycle action.', 'INVALID_LIFECYCLE_ACTION', 400, {
      allowed: Object.keys(LIFECYCLE_ACTIONS),
    });
  }
  const state = await getSystemState({ session, lean: true });
  const blockers = [];
  const classification = await getClassificationSummary({ session });
  let activeWorkQuery = Order.countDocuments({
    status: { $nin: ['completed', 'paid', 'released', 'cancelled', 'rejected'] },
    archived: { $ne: true },
  });
  let pendingPaymentsQuery = Payment.countDocuments({ status: 'pending' });
  let cleanupJobsQuery = ExternalCleanupJob.countDocuments({ status: { $in: ['pending', 'running', 'failed'] } });
  let activeProductsQuery = Product.find({ isActive: { $ne: false } })
    .select('_id')
    .sort({ _id: 1 })
    .lean();
  if (session) {
    activeWorkQuery = activeWorkQuery.session(session);
    pendingPaymentsQuery = pendingPaymentsQuery.session(session);
    cleanupJobsQuery = cleanupJobsQuery.session(session);
    activeProductsQuery = activeProductsQuery.session(session);
  }
  const [activeWork, pendingPayments, unresolvedCleanupJobs, activeProducts] = await Promise.all([
    activeWorkQuery,
    pendingPaymentsQuery,
    cleanupJobsQuery,
    activeProductsQuery,
  ]);
  const activeProductIds = activeProducts.map((product) => String(product._id));
  const activeProductSetHash = computeActiveProductSetHash(activeProductIds);
  const inventoryBaselineMatches = inventoryBaselineMatchesActiveProducts(
    state.inventoryBaseline,
    activeProductIds,
  );

  if (action === 'enter_production') {
    if (!['development', 'demo'].includes(state.mode)) {
      blockers.push({ code: 'INVALID_MODE_TRANSITION', message: 'Production can be entered only from Development or Demo.' });
    }
    if (classification.unclassified > 0) {
      blockers.push({ code: 'UNCLASSIFIED_DATA_REMAINS', count: classification.unclassified, message: 'Unclassified operational data remains.' });
    }
    if (classification.demo > 0) {
      blockers.push({ code: 'DEMO_DATA_REMAINS', count: classification.demo, message: 'Demo operational data remains.' });
    }
    if (!state.turnoverCompletedAt) {
      blockers.push({ code: 'TURNOVER_INCOMPLETE', message: 'Complete turnover and verify opening inventory first.' });
    } else if (!state.inventoryBaselineVerifiedAt || !inventoryBaselineMatches) {
      blockers.push({
        code: 'INVENTORY_BASELINE_STALE',
        count: activeProductIds.length,
        message: 'The active product catalog changed after turnover. Review and apply a new opening inventory baseline.',
      });
    }
    let handoverQuery = SystemOperation.exists({
      kind: 'handover',
      status: 'completed',
      'receipt.targetAdministratorId': String(state.protectedAdministratorId || ''),
    });
    if (session) handoverQuery = handoverQuery.session(session);
    if (!await handoverQuery) {
      blockers.push({ code: 'CLIENT_ADMIN_HANDOVER_REQUIRED', message: 'Transfer protection to the client administrator first.' });
    }
    if (unresolvedCleanupJobs > 0) {
      blockers.push({ code: 'EXTERNAL_CLEANUP_INCOMPLETE', count: unresolvedCleanupJobs, message: 'Resolve external cleanup jobs first.' });
    }
  } else if (action === 'leave_production') {
    if (state.mode !== 'production') blockers.push({ code: 'INVALID_MODE_TRANSITION', message: 'The system is not in Production.' });
  } else if (action === 'begin_decommissioning') {
    if (state.mode === 'archived' || state.decommissioningPhase !== 'none') {
      blockers.push({ code: 'INVALID_MODE_TRANSITION', message: 'Decommissioning cannot begin from the current state.' });
    }
  } else if (action === 'archive') {
    if (state.mode === 'archived' || !['draining', 'ready_to_archive'].includes(state.decommissioningPhase)) {
      blockers.push({ code: 'DECOMMISSIONING_REQUIRED', message: 'Begin decommissioning before final archive.' });
    }
    if (activeWork > 0) blockers.push({ code: 'ACTIVE_WORK_REMAINS', count: activeWork, message: 'Active work must be resolved before archive.' });
    if (pendingPayments > 0) blockers.push({ code: 'PENDING_PAYMENTS_REMAIN', count: pendingPayments, message: 'Pending payments must be resolved before archive.' });
    if (unresolvedCleanupJobs > 0) blockers.push({ code: 'EXTERNAL_CLEANUP_INCOMPLETE', count: unresolvedCleanupJobs, message: 'External cleanup jobs must be resolved before archive.' });
  } else if (action === 'restore') {
    if (state.mode !== 'archived') blockers.push({ code: 'INVALID_MODE_TRANSITION', message: 'Only an archived system can be restored.' });
  }

  const requiresBackup = ['leave_production', 'archive'].includes(action);
  const dataFingerprint = await computeDataFingerprint({ session });
  const hashInput = {
    action,
    mode: state.mode,
    previousMode: state.previousMode,
    phase: state.decommissioningPhase,
    classification,
    activeWork,
    pendingPayments,
    unresolvedCleanupJobs,
    protectedAdministratorId: state.protectedAdministratorId
      ? String(state.protectedAdministratorId)
      : null,
    turnoverCompletedAt: state.turnoverCompletedAt,
    inventoryBaselineVerifiedAt: state.inventoryBaselineVerifiedAt,
    inventoryBaseline: state.inventoryBaseline || null,
    activeProductIds,
    activeProductSetHash,
    dataFingerprint,
  };
  return {
    counts: {
      activeWork,
      pendingPayments,
      unresolvedCleanupJobs,
      activeProducts: activeProductIds.length,
    },
    preserved: {
      classification,
      inventoryBaseline: state.inventoryBaseline
        ? {
          capturedAt: state.inventoryBaseline.capturedAt,
          productCount: state.inventoryBaseline.productCount,
          productSetHash: state.inventoryBaseline.productSetHash,
          invalidatedAt: state.inventoryBaseline.invalidatedAt || null,
          invalidationReason: state.inventoryBaseline.invalidationReason || null,
        }
        : null,
    },
    blockers,
    warnings: [],
    plan: { action, public: { action, expectedPhrase: descriptor.phrase } },
    planHash: planHash(hashInput),
    dataFingerprint,
    stateRevision: state.revision,
    requiresBackup,
  };
}

export async function createLifecyclePreview({ actor, action, requestMetadata = {} }) {
  const state = await getSystemState({ lean: true });
  await assertProtectedAdministrator(actor, state);
  if (state.mode === 'archived' && action !== 'restore') {
    throw new SystemManagementError(
      'Only restore is available while the system is archived.',
      'SYSTEM_ARCHIVED',
      423,
    );
  }
  return createPreview({
    kind: 'lifecycle',
    action,
    actor,
    plan: await buildLifecyclePlan(action),
    requestMetadata,
  });
}

const applyLifecycleAction = async (action, state, session) => {
  if (action === 'enter_production') {
    return setSystemMode('production', {
      session,
      decommissioningPhase: 'none',
      registrationEnabled: true,
      bookingsEnabled: true,
      extra: { productionEnteredAt: new Date(), archivedAt: null },
    });
  }
  if (action === 'leave_production') {
    await incrementGlobalSessionEpoch({ session });
    return setSystemMode('demo', {
      session,
      decommissioningPhase: 'none',
      registrationEnabled: true,
      bookingsEnabled: true,
      extra: { productionEnteredAt: null, archivedAt: null },
    });
  }
  if (action === 'begin_decommissioning') {
    return updateLifecycleState({
      decommissioningPhase: 'draining',
      registrationEnabled: false,
      bookingsEnabled: false,
    }, { session });
  }
  if (action === 'archive') {
    await incrementGlobalSessionEpoch({ session });
    return setSystemMode('archived', {
      session,
      decommissioningPhase: 'ready_to_archive',
      registrationEnabled: false,
      bookingsEnabled: false,
      extra: { archivedAt: new Date() },
    });
  }
  if (action === 'restore') {
    const targetMode = ['development', 'demo', 'production'].includes(state.previousMode)
      ? state.previousMode
      : 'demo';
    await incrementGlobalSessionEpoch({ session });
    return setSystemMode(targetMode, {
      session,
      decommissioningPhase: 'none',
      registrationEnabled: true,
      bookingsEnabled: true,
      extra: { archivedAt: null },
    });
  }
  throw new SystemManagementError('Unsupported lifecycle action.', 'INVALID_LIFECYCLE_ACTION', 400);
};

export async function executeLifecycle({ actor, body = {}, firebaseAuth = null }) {
  const envelope = await validatePreviewEnvelope({ actor, body, expectedKind: 'lifecycle' });
  let { operation } = envelope;
  if (envelope.replay) return operationResponse(operation);
  const descriptor = LIFECYCLE_ACTIONS[operation.action];
  if (!descriptor || body.phrase !== descriptor.phrase) {
    throw new SystemManagementError('Confirmation phrase does not match.', 'CONFIRMATION_PHRASE_MISMATCH', 400);
  }
  await assertProtectedAdministrator(actor);
  await verifyExecutionSecret(actor.id || actor._id, body.password);
  const leaseState = await acquireSystemMutationLease({
    operationId: operation._id,
    owner: `system:lifecycle:${operation.action}:${actor.id || actor._id}`,
    ttlMs: 120_000,
  });
  const lease = {
    operationId: operation._id,
    fencingToken: leaseState.mutationLease?.fencingToken,
  };
  let postCommitFirebaseRevocation = null;
  try {
    await waitForInFlightMutations({ timeoutMs: 15_000 });
    await renewSystemMutationLease({
      ...lease,
      ttlMs: DESTRUCTIVE_TRANSACTION_LEASE_MS,
    });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const fresh = await buildLifecyclePlan(operation.action, { session });
        if (fresh.planHash !== operation.planHash || fresh.blockers.length) {
          throw new SystemManagementError(
            'Lifecycle state changed after preview. No changes were committed.',
            'PREVIEW_STALE',
            409,
            { blockers: fresh.blockers },
          );
        }
        if (operation.requiresBackup) {
          const backup = await getVerifiedBackupForFingerprint(
            body.backupId,
            operation.dataFingerprint,
            { session, requiredPurpose: 'lifecycle' },
          );
          if (!backup) {
            throw new SystemManagementError(
              'A verified backup for this exact preview is required.',
              'VERIFIED_BACKUP_REQUIRED',
              409,
            );
          }
          operation.backupId = backup._id;
        }
        const claimed = await SystemOperation.updateOne(
          { _id: operation._id, status: 'preview', idempotencyKey: null },
          { $set: { status: 'running', idempotencyKey: envelope.idempotencyKey, consumedAt: new Date() } },
          { session },
        );
        if (claimed.modifiedCount !== 1) {
          throw new SystemManagementError('This preview has already been consumed.', 'PREVIEW_ALREADY_CONSUMED', 409);
        }
        const before = await getSystemState({ session, lean: true });
        const after = await applyLifecycleAction(operation.action, before, session);
        const externalJobs = operation.action === 'archive'
          ? await enqueueFirebaseSessionRevocations({
            operationId: operation._id,
            reason: 'final_archive',
            session,
          })
          : 0;
        const receipt = {
          operationId: String(operation._id),
          action: operation.action,
          previousMode: before.mode,
          mode: after.mode,
          previousPhase: before.decommissioningPhase,
          phase: after.decommissioningPhase,
          backupId: operation.backupId ? String(operation.backupId) : null,
          externalJobs,
          completedAt: new Date(),
        };
        await SystemOperation.updateOne(
          { _id: operation._id, status: 'running', idempotencyKey: envelope.idempotencyKey },
          {
            $set: {
              status: externalJobs ? 'completed_with_warnings' : 'completed',
              completedAt: receipt.completedAt,
              receipt,
              backupId: operation.backupId || null,
              warnings: externalJobs
                ? [`${externalJobs} external cleanup job(s) are pending for Firebase session revocation.`]
                : [],
            },
          },
          { session },
        );
        await renewSystemMutationLease({
          ...lease,
          ttlMs: DESTRUCTIVE_TRANSACTION_LEASE_MS,
          session,
        });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      operation = await SystemOperation.findById(operation._id);
      if (operation.action === 'archive' && Number(operation.receipt?.externalJobs || 0) > 0) {
        postCommitFirebaseRevocation = {
          operationId: operation._id,
          allowArchivedSessionRevocations: true,
          firebaseAuth,
          logPrefix: '[system-archive]',
        };
      }
      await invalidateRuntimeState(`SYSTEM_${String(operation.action).toUpperCase()}`);
      if (operation.action === 'archive') stopExternalCleanupWorker();
      if (operation.action === 'restore') startExternalCleanupWorker();
      return operationResponse(operation);
    } catch (error) {
      if (transactionUnavailable(error)) {
        throw new SystemManagementError(
          'Lifecycle changes require MongoDB replica-set transactions.',
          'TRANSACTIONS_REQUIRED',
          503,
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  } finally {
    try {
      await releaseSystemMutationLease(lease);
    } finally {
      if (postCommitFirebaseRevocation) {
        const task = postCommitFirebaseRevocation;
        // The archived worker is stopped after finalization, so admit this
        // source-bound exception only after the destructive lease is gone.
        setImmediate(() => {
          void processDueExternalCleanupJobs({
            operationId: task.operationId,
            allowArchivedSessionRevocations: task.allowArchivedSessionRevocations,
            firebaseAuth: task.firebaseAuth,
          }).catch((error) => {
            console.warn(`${task.logPrefix} Firebase session revocation pass failed:`, error?.message || error);
          });
        });
      }
    }
  }
}

export { buildHandoverPlan, buildLifecyclePlan, enqueueFirebaseSessionRevocations };

export default {
  LIFECYCLE_ACTIONS,
  createHandoverPreview,
  executeHandover,
  createLifecyclePreview,
  executeLifecycle,
};
