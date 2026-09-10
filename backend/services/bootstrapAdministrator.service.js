import crypto from 'crypto';
import OTP from '../models/oTP.model.js';
import StaffVerificationIssuance from '../models/staffVerificationIssuance.model.js';
import StaffVerificationToken from '../models/staffVerificationToken.model.js';
import SystemBootstrapOperation from '../models/systemBootstrapOperation.model.js';
import User from '../models/user.model.js';
import {
  issueStaffVerificationLink,
  STAFF_VERIFICATION_RESEND_COOLDOWN_MS,
  STAFF_VERIFICATION_TOKEN_PURPOSE,
} from './staffVerification.service.js';
import { normalizeEmailForOtp } from '../utils/otp.utils.js';

export const ADMINISTRATOR_PROVISION_OPERATION_KEY = 'administrator:provision:v1';
export const ADMINISTRATOR_EMAIL_MIGRATION_OPERATION_KEY = 'administrator:email-migration:v1';
export const BOOTSTRAP_OPERATION_LEASE_MS = 5 * 60 * 1000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESERVED_PRODUCTION_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'localhost',
]);

const serviceError = (message, code, statusCode = 400) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const normalizeRequiredEmail = (value, fieldName, { requireDeliverable = true } = {}) => {
  const email = normalizeEmailForOtp(value);
  if (!email || !EMAIL_REGEX.test(email)) {
    throw serviceError(`${fieldName} must be a valid email address.`, 'INVALID_BOOTSTRAP_EMAIL');
  }

  if (requireDeliverable && process.env.NODE_ENV === 'production') {
    const domain = email.split('@')[1];
    if (
      RESERVED_PRODUCTION_DOMAINS.has(domain)
      || domain.endsWith('.test')
      || domain.endsWith('.invalid')
      || domain.endsWith('.localhost')
    ) {
      throw serviceError(
        'BOOTSTRAP_ADMIN_EMAIL must be a controlled, deliverable production address.',
        'NON_DELIVERABLE_BOOTSTRAP_EMAIL',
      );
    }
  }

  return email;
};

const normalizeRequiredName = (value) => {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) {
    throw serviceError(
      'BOOTSTRAP_ADMIN_NAME must be between 2 and 80 characters.',
      'INVALID_BOOTSTRAP_NAME',
    );
  }
  return name;
};

const assertStrongInitialPassword = (password, email) => {
  const value = String(password || '');
  const localPart = email.split('@')[0].toLowerCase();
  const valid = value.length >= 12
    && value.length <= 128
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value)
    && !/\s/.test(value)
    && (localPart.length < 4 || !value.toLowerCase().includes(localPart));

  if (!valid) {
    throw serviceError(
      'BOOTSTRAP_ADMIN_INITIAL_PASSWORD must be 12-128 characters and include upper, lower, number, and symbol characters without spaces or the email name.',
      'WEAK_BOOTSTRAP_PASSWORD',
    );
  }
  return value;
};

const getConfirmationKey = () => {
  const key = String(
    process.env.BOOTSTRAP_CONFIRMATION_SECRET
    || process.env.JWT_SECRET
    || process.env.ENCRYPTION_KEY
    || '',
  );
  if (key.length < 16) {
    throw serviceError(
      'A server-only BOOTSTRAP_CONFIRMATION_SECRET or JWT_SECRET is required.',
      'BOOTSTRAP_CONFIRMATION_SECRET_REQUIRED',
      500,
    );
  }
  return key;
};

const buildProvisionInput = ({ targetEmail, name, initialPassword }) => {
  const normalizedName = normalizeRequiredName(name);
  const password = assertStrongInitialPassword(initialPassword, targetEmail);
  const passwordDigest = crypto
    .createHmac('sha256', getConfirmationKey())
    .update('administrator-provision-password:v1\0', 'utf8')
    .update(targetEmail, 'utf8')
    .update('\0', 'utf8')
    .update(password, 'utf8')
    .digest('hex');

  return {
    name: normalizedName,
    passwordDigest: `hmac-sha256:${passwordDigest}`,
  };
};

const safeAdministratorRecord = (user) => user ? {
  id: String(user._id),
  name: user.name,
  email: normalizeEmailForOtp(user.email),
  role: user.role,
  status: user.status,
  isVerified: Boolean(user.isVerified),
  isActive: Boolean(user.isActive),
  isDeleted: Boolean(user.isDeleted),
  loginAttempts: Number(user.loginAttempts || 0),
  lockUntil: user.lockUntil || null,
  authVersion: Number(user.authVersion || 0),
  version: Number(user.__v || 0),
  hasFirebaseIdentity: Boolean(user.firebaseUid),
  createdAt: user.createdAt || null,
  updatedAt: user.updatedAt || null,
} : null;

const serializeOperation = (operation) => {
  if (!operation) return null;
  const leaseExpiresAt = operation.leaseExpiresAt || null;
  const leaseRetryAfterSeconds = operation.status === 'in_progress' && leaseExpiresAt
    ? Math.max(0, Math.ceil((leaseExpiresAt.getTime() - Date.now()) / 1000))
    : 0;
  return {
    key: operation.key,
    operation: operation.operation,
    status: operation.status,
    phase: operation.phase || 'claimed',
    targetUserId: operation.targetUserId ? String(operation.targetUserId) : null,
    sourceEmail: operation.sourceEmail || null,
    targetEmail: operation.targetEmail,
    leaseExpiresAt,
    leaseRetryAfterSeconds,
    completedAt: operation.completedAt || null,
    lastErrorCode: operation.lastErrorCode || null,
    updatedAt: operation.updatedAt || null,
  };
};

const inspectVerificationState = async (userId) => {
  if (!userId) {
    return {
      hasActiveToken: false,
      activeTokenId: null,
      activeTokenEmail: null,
      tokenUpdatedAt: null,
      lastSentAt: null,
      expiresAt: null,
      cooldownUntil: null,
      retryAfterSeconds: 0,
      issuanceInProgress: false,
      issuanceLeaseExpiresAt: null,
      issuanceRetryAfterSeconds: 0,
      issuanceGeneration: 0,
      issuanceCurrentTokenId: null,
      issuanceLastCompletedAt: null,
      currentTokenDeliveredAt: null,
      deliveryConfirmed: false,
    };
  }

  const now = new Date();
  const [token, issuance] = await Promise.all([
    StaffVerificationToken.findOne({
      userId,
      purpose: STAFF_VERIFICATION_TOKEN_PURPOSE,
      usedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id email lastSentAt expiresAt updatedAt'),
    StaffVerificationIssuance.findOne({
      userId,
      purpose: STAFF_VERIFICATION_TOKEN_PURPOSE,
    }).select('leaseExpiresAt generation currentTokenId currentTokenDeliveredAt lastCompletedAt updatedAt'),
  ]);

  const cooldownUntil = token?.lastSentAt
    ? new Date(token.lastSentAt.getTime() + STAFF_VERIFICATION_RESEND_COOLDOWN_MS)
    : null;
  const retryAfterSeconds = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil.getTime() - Date.now()) / 1000))
    : 0;
  const issuanceInProgress = Boolean(
    issuance?.leaseExpiresAt && issuance.leaseExpiresAt > new Date(),
  );
  const issuanceRetryAfterSeconds = issuanceInProgress
    ? Math.max(1, Math.ceil((issuance.leaseExpiresAt.getTime() - Date.now()) / 1000))
    : 0;
  const issuanceCurrentTokenId = issuance?.currentTokenId
    ? String(issuance.currentTokenId)
    : null;
  const currentTokenDeliveredAt = issuance?.currentTokenDeliveredAt || null;
  const deliveryConfirmed = Boolean(
    token
    && !issuanceInProgress
    && issuanceCurrentTokenId === String(token._id)
    && currentTokenDeliveredAt
    && currentTokenDeliveredAt >= token.lastSentAt,
  );

  return {
    hasActiveToken: Boolean(token),
    activeTokenId: token ? String(token._id) : null,
    activeTokenEmail: token ? normalizeEmailForOtp(token.email) : null,
    tokenUpdatedAt: token?.updatedAt || null,
    lastSentAt: token?.lastSentAt || null,
    expiresAt: token?.expiresAt || null,
    cooldownUntil,
    retryAfterSeconds,
    issuanceInProgress,
    issuanceLeaseExpiresAt: issuance?.leaseExpiresAt || null,
    issuanceRetryAfterSeconds,
    issuanceGeneration: Number(issuance?.generation || 0),
    issuanceCurrentTokenId,
    issuanceLastCompletedAt: issuance?.lastCompletedAt || null,
    currentTokenDeliveredAt,
    deliveryConfirmed,
  };
};

const fingerprintPlan = (plan) => crypto
  .createHmac('sha256', getConfirmationKey())
  .update(JSON.stringify({
    version: 2,
    mode: plan.mode,
    action: plan.action,
    targetEmail: plan.targetEmail,
    sourceEmail: plan.sourceEmail || null,
    administrators: plan.administrators.map((entry) => ({
      id: entry.id,
      email: entry.email,
      status: entry.status,
      isVerified: entry.isVerified,
      isActive: entry.isActive,
      isDeleted: entry.isDeleted,
      authVersion: entry.authVersion,
      version: entry.version,
      updatedAt: entry.updatedAt,
    })),
    targetOwner: plan.targetOwner ? {
      id: plan.targetOwner.id,
      email: plan.targetOwner.email,
      status: plan.targetOwner.status,
      authVersion: plan.targetOwner.authVersion,
      version: plan.targetOwner.version,
      updatedAt: plan.targetOwner.updatedAt,
    } : null,
    operation: plan.operation ? {
      status: plan.operation.status,
      phase: plan.operation.phase,
      targetUserId: plan.operation.targetUserId,
      leaseExpiresAt: plan.operation.leaseExpiresAt,
      updatedAt: plan.operation.updatedAt,
    } : null,
    verification: {
      activeTokenId: plan.verificationState?.activeTokenId || null,
      activeTokenEmail: plan.verificationState?.activeTokenEmail || null,
      tokenUpdatedAt: plan.verificationState?.tokenUpdatedAt || null,
      lastSentAt: plan.verificationState?.lastSentAt || null,
      expiresAt: plan.verificationState?.expiresAt || null,
      cooldownUntil: plan.verificationState?.cooldownUntil || null,
      issuanceLeaseExpiresAt: plan.verificationState?.issuanceLeaseExpiresAt || null,
      issuanceGeneration: plan.verificationState?.issuanceGeneration || 0,
      issuanceCurrentTokenId: plan.verificationState?.issuanceCurrentTokenId || null,
      issuanceLastCompletedAt: plan.verificationState?.issuanceLastCompletedAt || null,
      currentTokenDeliveredAt: plan.verificationState?.currentTokenDeliveredAt || null,
    },
    provisionInput: plan.provisionInput || null,
  }))
  .digest('hex')
  .slice(0, 32);

const buildPlan = (values) => {
  const plan = { ...values };
  plan.confirmationToken = plan.canApply ? fingerprintPlan(plan) : null;
  return plan;
};

const operationLeaseIsActive = (operation) => Boolean(
  operation?.status === 'in_progress'
  && operation.leaseExpiresAt
  && operation.leaseExpiresAt > new Date(),
);

const pendingAdministratorIsSafe = (entry, email) => Boolean(
  entry
  && entry.email === email
  && entry.role === 'administrator'
  && !entry.isDeleted
  && entry.isActive
  && entry.status === 'pending'
  && !entry.isVerified,
);

const hasMigrationRollbackSnapshot = (operation) => {
  const snapshot = operation?.rollbackSnapshot;
  return Boolean(
    snapshot
    && (
      snapshot.email
      || snapshot.inspectedUpdatedAt
      || snapshot.inspectedVersion !== null && snapshot.inspectedVersion !== undefined
      || snapshot.inspectedAuthVersion !== null && snapshot.inspectedAuthVersion !== undefined
    )
  );
};

const migrationReconciliationInvariantHolds = (operation, candidate) => {
  if (!hasMigrationRollbackSnapshot(operation)) return true;
  const operationUserId = operation.targetUserId ? String(operation.targetUserId) : '';
  const expectedAuthVersion = Number(operation.rollbackSnapshot.inspectedAuthVersion || 0) + 1;
  return Boolean(
    candidate
    && operationUserId === String(candidate.id || candidate._id)
    && Number(candidate.authVersion || 0) >= expectedAuthVersion
  );
};

export async function inspectBootstrapAdministrator({
  mode = 'auto',
  targetEmail,
  sourceEmail,
  name,
  initialPassword,
} = {}) {
  const normalizedTarget = normalizeRequiredEmail(targetEmail, 'BOOTSTRAP_ADMIN_EMAIL');
  const normalizedSource = sourceEmail
    ? normalizeRequiredEmail(
      sourceEmail,
      'BOOTSTRAP_ADMIN_MIGRATE_FROM_EMAIL',
      { requireDeliverable: false },
    )
    : null;

  if (!['auto', 'provision', 'migrate', 'resend'].includes(mode)) {
    throw serviceError('Unsupported bootstrap Administrator operation.', 'INVALID_BOOTSTRAP_MODE');
  }
  if (mode === 'migrate' && !normalizedSource) {
    throw serviceError(
      'BOOTSTRAP_ADMIN_MIGRATE_FROM_EMAIL is required for migration.',
      'BOOTSTRAP_SOURCE_EMAIL_REQUIRED',
    );
  }
  if (normalizedSource && normalizedSource === normalizedTarget) {
    throw serviceError(
      'The source and target Administrator emails must be different.',
      'BOOTSTRAP_EMAIL_UNCHANGED',
    );
  }

  const administratorDocs = await User.find({ role: 'administrator' })
    .select('name email role status isVerified isActive isDeleted loginAttempts lockUntil authVersion firebaseUid createdAt updatedAt __v')
    .sort({ createdAt: 1, _id: 1 });
  const administrators = administratorDocs.map(safeAdministratorRecord);
  const targetOwnerDoc = await User.findOne({ email: normalizedTarget })
    .select('name email role status isVerified isActive isDeleted loginAttempts lockUntil authVersion firebaseUid createdAt updatedAt __v');
  const targetOwner = safeAdministratorRecord(targetOwnerDoc);

  const requestedMode = mode === 'auto'
    ? administratorDocs.length === 0 ? 'provision' : normalizedSource ? 'migrate' : 'provision'
    : mode;
  const operationKey = requestedMode === 'provision'
    ? ADMINISTRATOR_PROVISION_OPERATION_KEY
    : requestedMode === 'migrate'
      ? ADMINISTRATOR_EMAIL_MIGRATION_OPERATION_KEY
      : null;
  const operationDoc = operationKey
    ? await SystemBootstrapOperation.findOne({ key: operationKey })
    : null;
  const operation = serializeOperation(operationDoc);
  const verificationCandidate = administratorDocs.find(
    (entry) => normalizeEmailForOtp(entry.email) === normalizedTarget,
  ) || administratorDocs.find(
    (entry) => normalizeEmailForOtp(entry.email) === normalizedSource,
  ) || null;
  const verificationState = await inspectVerificationState(verificationCandidate?._id);

  const common = {
    mode: requestedMode,
    targetEmail: normalizedTarget,
    // Only carry sourceEmail into the plan (and therefore the confirmation
    // fingerprint) when it is actually relevant to the resolved mode. An
    // 'auto' inspection with a leftover BOOTSTRAP_ADMIN_MIGRATE_FROM_EMAIL
    // that resolves to 'provision' must fingerprint identically to a direct
    // { mode: 'provision' } call (which never receives sourceEmail), or the
    // confirmation token printed by inspect can never match provisioning.
    sourceEmail: requestedMode === 'migrate' ? normalizedSource : null,
    administrators,
    targetOwner,
    operation,
    verificationState,
    preserves: [
      'MongoDB user _id',
      'administrator role',
      'password hash',
      'profile and related account data',
      'loginAttempts and lockUntil',
      'RBAC protections',
    ],
  };

  if (requestedMode === 'resend') {
    const candidate = administrators.find((entry) => entry.email === normalizedTarget);
    if (!candidate || administrators.length !== 1) {
      return buildPlan({
        ...common,
        action: 'blocked',
        reason: 'A single Administrator matching BOOTSTRAP_ADMIN_EMAIL is required.',
        canApply: false,
      });
    }
    if (candidate.isDeleted || !candidate.isActive || candidate.status === 'suspended') {
      return buildPlan({
        ...common,
        action: 'blocked',
        reason: 'The Administrator is disabled or deleted and will not be automatically restored.',
        canApply: false,
      });
    }
    if (candidate.isVerified) {
      return buildPlan({
        ...common,
        action: 'already_verified',
        reason: 'The Administrator is already verified.',
        canApply: false,
      });
    }
    if (verificationState.issuanceInProgress) {
      return buildPlan({
        ...common,
        action: 'issuance_in_progress',
        reason: 'A verification delivery is already in progress for this account.',
        retryAfterSeconds: verificationState.issuanceRetryAfterSeconds,
        canApply: false,
      });
    }
    if (verificationState.retryAfterSeconds > 0) {
      return buildPlan({
        ...common,
        action: 'resend_cooldown',
        reason: 'The verification resend cooldown is still active.',
        retryAfterSeconds: verificationState.retryAfterSeconds,
        canApply: false,
      });
    }
    return buildPlan({ ...common, action: 'resend_verification', canApply: true });
  }

  if (operationDoc?.status === 'completed' || operationDoc?.status === 'skipped_existing') {
    return buildPlan({
      ...common,
      action: operationDoc.status === 'completed' ? 'already_completed' : 'skipped_existing',
      reason: 'This one-time operation has already reached a terminal state.',
      canApply: false,
    });
  }
  if (operationLeaseIsActive(operationDoc)) {
    return buildPlan({
      ...common,
      action: 'operation_in_progress',
      reason: 'This one-time operation has an active lease.',
      retryAfterSeconds: operation.leaseRetryAfterSeconds,
      canApply: false,
    });
  }

  const recoveringOperation = Boolean(
    operationDoc
    && (operationDoc.status === 'failed' || operationDoc.status === 'in_progress'),
  );

  if (requestedMode === 'provision') {
    const operationUser = operationDoc?.targetUserId
      ? administrators.find((entry) => entry.id === String(operationDoc.targetUserId))
      : null;
    const targetAdministrator = administrators.find((entry) => entry.email === normalizedTarget);
    const retryUser = operationUser || targetAdministrator;

    if (recoveringOperation && retryUser) {
      if (
        pendingAdministratorIsSafe(retryUser, normalizedTarget)
        || (
          retryUser.email === normalizedTarget
          && retryUser.isVerified
          && retryUser.isActive
          && !retryUser.isDeleted
          && retryUser.status === 'active'
        )
      ) {
        return buildPlan({
          ...common,
          action: operationDoc.status === 'in_progress'
            ? 'reconcile_provision'
            : 'retry_provision_delivery',
          canApply: true,
        });
      }
      return buildPlan({
        ...common,
        action: 'blocked',
        reason: 'The operation-bound Administrator is no longer in a safe recovery state.',
        canApply: false,
      });
    }

    if (administrators.length > 0) {
      return buildPlan({
        ...common,
        action: 'skipped_existing',
        reason: 'An Administrator already exists; bootstrap provisioning will not run.',
        canApply: false,
      });
    }
    if (targetOwnerDoc) {
      return buildPlan({
        ...common,
        action: 'blocked',
        reason: 'BOOTSTRAP_ADMIN_EMAIL already belongs to another account and will not be promoted.',
        canApply: false,
      });
    }

    const provisionInput = buildProvisionInput({
      targetEmail: normalizedTarget,
      name,
      initialPassword,
    });
    return buildPlan({
      ...common,
      action: recoveringOperation ? 'reconcile_provision_claim' : 'provision_pending_administrator',
      provisionInput,
      canApply: true,
    });
  }

  const targetCandidate = administrators.find((entry) => entry.email === normalizedTarget);
  if (recoveringOperation && targetCandidate) {
    if (
      targetCandidate.isDeleted
      || !targetCandidate.isActive
      || targetCandidate.status === 'suspended'
    ) {
      return buildPlan({
        ...common,
        action: 'blocked',
        reason: 'The migrated Administrator is disabled, deleted, or suspended and will not be overwritten.',
        canApply: false,
      });
    }
    if (operationDoc.targetUserId && String(operationDoc.targetUserId) !== targetCandidate.id) {
      return buildPlan({
        ...common,
        action: 'blocked',
        reasonCode: 'BOOTSTRAP_MIGRATION_RECONCILIATION_REQUIRED',
        reason: 'The migration target no longer matches the operation-bound Administrator.',
        canApply: false,
      });
    }
    if (!migrationReconciliationInvariantHolds(operationDoc, targetCandidate)) {
      return buildPlan({
        ...common,
        action: 'blocked',
        reasonCode: 'BOOTSTRAP_MIGRATION_RECONCILIATION_REQUIRED',
        reason: 'The target account does not prove the operation-bound identity update and requires manual reconciliation.',
        canApply: false,
      });
    }
    return buildPlan({ ...common, action: 'reconcile_email_migration', canApply: true });
  }

  if (administrators.length !== 1) {
    return buildPlan({
      ...common,
      action: 'blocked',
      reason: 'Migration requires exactly one existing canonical Administrator record.',
      canApply: false,
    });
  }

  const candidate = administrators[0];
  if (candidate.email !== normalizedSource) {
    return buildPlan({
      ...common,
      action: 'blocked',
      reason: 'The configured source email does not match the existing Administrator.',
      canApply: false,
    });
  }
  if (candidate.isDeleted || !candidate.isActive || candidate.status === 'suspended') {
    return buildPlan({
      ...common,
      action: 'blocked',
      reason: 'The existing Administrator is disabled or deleted and will not be automatically restored.',
      canApply: false,
    });
  }
  if (targetOwnerDoc && targetOwner.id !== candidate.id) {
    return buildPlan({
      ...common,
      action: 'blocked',
      reason: 'The target email already belongs to another account.',
      canApply: false,
    });
  }

  return buildPlan({
    ...common,
    action: recoveringOperation ? 'retry_email_migration' : 'migrate_administrator_email',
    canApply: true,
  });
}

const assertConfirmation = (plan, confirmationToken) => {
  const provided = String(confirmationToken || '');
  const expected = String(plan.confirmationToken || '');
  const matches = provided.length === expected.length
    && provided.length > 0
    && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!plan.canApply || !matches) {
    throw serviceError(
      'Bootstrap confirmation does not match the current database inspection. Run inspect again.',
      'BOOTSTRAP_CONFIRMATION_REQUIRED',
      409,
    );
  }
};

const operationLeaseDeadline = () => new Date(Date.now() + BOOTSTRAP_OPERATION_LEASE_MS);

async function acquireOperation({ key, operation, sourceEmail = null, targetEmail }) {
  await SystemBootstrapOperation.init();
  const attemptId = crypto.randomUUID();
  const existing = await SystemBootstrapOperation.findOne({ key });
  if (existing) {
    if (
      normalizeEmailForOtp(existing.targetEmail) !== targetEmail
      || normalizeEmailForOtp(existing.sourceEmail) !== normalizeEmailForOtp(sourceEmail)
    ) {
      throw serviceError(
        'The one-time operation is bound to different configured emails.',
        'BOOTSTRAP_OPERATION_MISMATCH',
        409,
      );
    }
    if (existing.status === 'completed' || existing.status === 'skipped_existing') {
      return { acquired: false, operation: existing };
    }

    const now = new Date();
    const resumable = existing.status === 'failed'
      || (
        existing.status === 'in_progress'
        && (!existing.leaseExpiresAt || existing.leaseExpiresAt <= now)
      );
    if (!resumable) return { acquired: false, operation: existing };

    const filter = {
      _id: existing._id,
      attemptId: existing.attemptId,
      status: existing.status,
    };
    if (existing.status === 'in_progress') {
      filter.$or = [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { $exists: false } },
        { leaseExpiresAt: { $lte: now } },
      ];
    }
    const resumed = await SystemBootstrapOperation.findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'in_progress',
          attemptId,
          leaseExpiresAt: operationLeaseDeadline(),
          completedAt: null,
          lastErrorCode: null,
        },
      },
      { new: true },
    );
    return { acquired: Boolean(resumed), operation: resumed || existing, recovered: true };
  }

  try {
    const created = await SystemBootstrapOperation.create({
      key,
      operation,
      status: 'in_progress',
      phase: 'claimed',
      attemptId,
      leaseExpiresAt: operationLeaseDeadline(),
      sourceEmail,
      targetEmail,
    });
    return { acquired: true, operation: created, recovered: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return {
      acquired: false,
      operation: await SystemBootstrapOperation.findOne({ key }),
      recovered: false,
    };
  }
}

const updateOperationPhase = async (operation, phase, fields = {}) => {
  const updated = await SystemBootstrapOperation.findOneAndUpdate(
    {
      _id: operation._id,
      attemptId: operation.attemptId,
      status: 'in_progress',
      phase: operation.phase || 'claimed',
    },
    {
      $set: {
        ...fields,
        phase,
        leaseExpiresAt: operationLeaseDeadline(),
      },
    },
    { new: true },
  );
  if (!updated) {
    throw serviceError(
      'Bootstrap operation lease or phase changed before the update completed.',
      'BOOTSTRAP_OPERATION_LEASE_LOST',
      409,
    );
  }
  return updated;
};

const transitionTerminalOperation = async (
  operation,
  { status, targetUserId = null, lastErrorCode = null },
) => {
  const update = {
    $set: {
      status,
      targetUserId: targetUserId || operation.targetUserId || null,
      leaseExpiresAt: null,
      lastErrorCode,
    },
  };
  if (status === 'completed' || status === 'skipped_existing') {
    update.$set.completedAt = new Date();
  } else {
    update.$set.completedAt = null;
  }

  const result = await SystemBootstrapOperation.updateOne(
    {
      _id: operation._id,
      attemptId: operation.attemptId,
      status: 'in_progress',
      phase: operation.phase || 'claimed',
    },
    update,
  );
  if (result.matchedCount !== 1) {
    throw serviceError(
      'Bootstrap terminal transition lost its active operation lease.',
      'BOOTSTRAP_OPERATION_TERMINAL_CAS_FAILED',
      409,
    );
  }
};

const completeOperation = (operation, targetUserId, status = 'completed') =>
  transitionTerminalOperation(operation, { status, targetUserId });

const failOperation = (operation, error, targetUserId = null) =>
  transitionTerminalOperation(operation, {
    status: 'failed',
    targetUserId,
    lastErrorCode: error?.code || 'BOOTSTRAP_OPERATION_FAILED',
  });

const failClaimAndRethrow = async (operation, error, targetUserId = null) => {
  try {
    await failOperation(operation, error, targetUserId);
  } catch (terminalError) {
    terminalError.cause = error;
    throw terminalError;
  }
  throw error;
};

const existingVerificationResult = (state) => ({
  method: 'link',
  existingDelivery: true,
  expiresIn: state.expiresAt
    ? Math.max(0, Math.ceil((new Date(state.expiresAt).getTime() - Date.now()) / 1000))
    : 0,
  resendAfter: state.retryAfterSeconds,
});

export async function provisionBootstrapAdministrator({
  targetEmail,
  name,
  initialPassword,
  confirmationToken,
} = {}) {
  const plan = await inspectBootstrapAdministrator({
    mode: 'provision',
    targetEmail,
    name,
    initialPassword,
  });
  if (!plan.canApply) {
    return {
      applied: false,
      status: plan.action,
      reason: plan.reason,
      administrator: plan.administrators[0] || null,
    };
  }
  assertConfirmation(plan, confirmationToken);

  const email = plan.targetEmail;
  const needsCredentials = Boolean(plan.provisionInput);
  const password = needsCredentials ? assertStrongInitialPassword(initialPassword, email) : null;
  const claim = await acquireOperation({
    key: ADMINISTRATOR_PROVISION_OPERATION_KEY,
    operation: 'administrator_provision',
    targetEmail: email,
  });
  if (!claim.acquired) {
    return {
      applied: false,
      status: claim.operation?.status || 'in_progress',
      reason: 'The one-time Administrator provisioning operation was already claimed.',
    };
  }

  let operation = claim.operation;
  let user = null;
  try {
    if (operation.targetUserId) {
      user = await User.findById(operation.targetUserId);
    }
    if (!user && operation.phase !== 'claimed') {
      user = await User.findOne({ role: 'administrator', email });
    }

    if (user) {
      if (
        user.role !== 'administrator'
        || normalizeEmailForOtp(user.email) !== email
        || user.isDeleted
        || !user.isActive
        || user.status === 'suspended'
      ) {
        throw serviceError(
          'The operation-bound Administrator is no longer in a safe recovery state.',
          'BOOTSTRAP_RETRY_STATE_MISMATCH',
          409,
        );
      }
      if (user.isVerified && user.status === 'active') {
        await completeOperation(operation, user._id);
        return {
          applied: true,
          status: 'reconciled_completed',
          administrator: safeAdministratorRecord(user),
        };
      }
      if (!pendingAdministratorIsSafe(safeAdministratorRecord(user), email)) {
        throw serviceError(
          'The pending Administrator from the prior attempt is no longer safe to resume.',
          'BOOTSTRAP_RETRY_STATE_MISMATCH',
          409,
        );
      }
    } else {
      const existingAdministrator = await User.findOne({ role: 'administrator' });
      if (existingAdministrator) {
        await completeOperation(operation, existingAdministrator._id, 'skipped_existing');
        return {
          applied: false,
          status: 'skipped_existing',
          reason: 'An Administrator already exists; no account fields were changed.',
          administrator: safeAdministratorRecord(existingAdministrator),
        };
      }
      if (await User.exists({ email })) {
        throw serviceError(
          'BOOTSTRAP_ADMIN_EMAIL already belongs to another account and will not be promoted.',
          'BOOTSTRAP_EMAIL_CONFLICT',
          409,
        );
      }
      if (!needsCredentials) {
        throw serviceError(
          'Recovery reached account creation without confirmed name/password inputs. Inspect again.',
          'BOOTSTRAP_PROVISION_INPUTS_REQUIRED',
          409,
        );
      }

      user = await User.create({
        name: plan.provisionInput.name,
        email,
        password,
        role: 'administrator',
        isVerified: false,
        isActive: true,
        isDeleted: false,
        status: 'pending',
        isFirstLogin: false,
        loginAttempts: 0,
      });
    }

    if (operation.phase !== 'account_ready') {
      operation = await updateOperationPhase(operation, 'account_ready', {
        targetUserId: user._id,
      });
    }

    const activeVerification = await inspectVerificationState(user._id);
    let delivery;
    if (
      activeVerification.hasActiveToken
      && activeVerification.deliveryConfirmed
      && activeVerification.activeTokenEmail === email
    ) {
      delivery = existingVerificationResult(activeVerification);
    } else {
      delivery = await issueStaffVerificationLink(user);
    }

    operation = await updateOperationPhase(operation, 'verification_delivered');
    await completeOperation(operation, user._id);
    return {
      applied: true,
      status: plan.action.startsWith('reconcile')
        ? 'reconciled_completed'
        : plan.action === 'retry_provision_delivery'
          ? 'delivery_retried'
          : 'provisioned',
      administrator: safeAdministratorRecord(user),
      verification: delivery,
    };
  } catch (error) {
    return failClaimAndRethrow(operation, error, user?._id);
  }
}

const authVersionCas = (value) => Number(value || 0) === 0
  ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] }
  : { authVersion: Number(value) };

const rollbackMigration = async ({ operation, migrated, snapshot, cause }) => {
  if (!snapshot?.email || !snapshot?.status || typeof snapshot.isVerified !== 'boolean') {
    const error = serviceError(
      'Administrator migration delivery failed without a safe rollback snapshot.',
      'BOOTSTRAP_MIGRATION_RECONCILIATION_REQUIRED',
      500,
    );
    error.cause = cause;
    throw error;
  }

  const rollback = await User.updateOne(
    {
      _id: migrated._id,
      email: operation.targetEmail,
      role: 'administrator',
      isVerified: false,
      isActive: true,
      isDeleted: { $ne: true },
      status: 'pending',
      updatedAt: migrated.updatedAt,
      __v: Number(migrated.__v || 0),
      authVersion: Number(migrated.authVersion || 0),
    },
    {
      $set: {
        email: snapshot.email,
        isVerified: snapshot.isVerified,
        status: snapshot.status,
      },
      $inc: { __v: 1 },
    },
    { runValidators: true },
  );
  if (rollback.matchedCount !== 1) {
    const error = serviceError(
      'Administrator email migration failed and concurrent account changes prevented rollback.',
      'BOOTSTRAP_MIGRATION_ROLLBACK_FAILED',
      500,
    );
    error.cause = cause;
    throw error;
  }

  return updateOperationPhase(operation, 'rolled_back');
};

export async function migrateBootstrapAdministratorEmail({
  sourceEmail,
  targetEmail,
  confirmationToken,
} = {}) {
  const plan = await inspectBootstrapAdministrator({ mode: 'migrate', sourceEmail, targetEmail });
  if (!plan.canApply) {
    return {
      applied: false,
      status: plan.action,
      reason: plan.reason,
      administrator: plan.administrators[0] || null,
    };
  }
  assertConfirmation(plan, confirmationToken);

  const claim = await acquireOperation({
    key: ADMINISTRATOR_EMAIL_MIGRATION_OPERATION_KEY,
    operation: 'administrator_email_migration',
    sourceEmail: plan.sourceEmail,
    targetEmail: plan.targetEmail,
  });
  if (!claim.acquired) {
    return {
      applied: false,
      status: claim.operation?.status || 'in_progress',
      reason: 'The one-time Administrator email migration was already claimed.',
    };
  }

  let operation = claim.operation;
  let original = null;
  let migrated = null;
  let deliverySucceeded = false;
  try {
    const inspectedTargetCandidate = plan.administrators.find(
      (entry) => entry.email === plan.targetEmail,
    );
    if (
      plan.action === 'reconcile_email_migration'
      && !migrationReconciliationInvariantHolds(operation, inspectedTargetCandidate)
    ) {
      throw serviceError(
        'The target account does not prove the operation-bound identity update and requires manual reconciliation.',
        'BOOTSTRAP_MIGRATION_RECONCILIATION_REQUIRED',
        409,
      );
    }
    const operationUserId = operation.targetUserId
      || plan.administrators[0]?.id
      || null;
    if (operationUserId) {
      const candidate = await User.findById(operationUserId);
      if (candidate && normalizeEmailForOtp(candidate.email) === plan.targetEmail) {
        if (
          candidate.role !== 'administrator'
          || candidate.isDeleted
          || !candidate.isActive
          || candidate.status === 'suspended'
        ) {
          throw serviceError(
            'The migrated Administrator changed to a protected state; reconciliation will not overwrite it.',
            'BOOTSTRAP_MIGRATION_STATE_CHANGED',
            409,
          );
        }
        if (!migrationReconciliationInvariantHolds(operation, candidate)) {
          throw serviceError(
            'The target account auth version no longer proves the inspected identity update.',
            'BOOTSTRAP_MIGRATION_RECONCILIATION_REQUIRED',
            409,
          );
        }
        migrated = candidate;
      }
    }

    if (!migrated) {
      const inspected = plan.administrators.find((entry) => entry.email === plan.sourceEmail);
      if (!inspected) {
        throw serviceError(
          'The inspected Administrator record no longer matches the migration source.',
          'BOOTSTRAP_MIGRATION_STATE_CHANGED',
          409,
        );
      }
      if (await User.exists({ email: plan.targetEmail, _id: { $ne: inspected.id } })) {
        throw serviceError('The target email now belongs to another account.', 'BOOTSTRAP_EMAIL_CONFLICT', 409);
      }

      const snapshot = {
        email: inspected.email,
        isVerified: inspected.isVerified,
        status: inspected.status,
        inspectedUpdatedAt: inspected.updatedAt,
        inspectedVersion: inspected.version,
        inspectedAuthVersion: inspected.authVersion,
      };
      operation = await updateOperationPhase(operation, 'migration_prepared', {
        targetUserId: inspected.id,
        rollbackSnapshot: snapshot,
      });

      const cas = {
        _id: inspected.id,
        email: plan.sourceEmail,
        role: 'administrator',
        isDeleted: inspected.isDeleted,
        isActive: inspected.isActive,
        isVerified: inspected.isVerified,
        status: inspected.status,
        updatedAt: inspected.updatedAt,
        __v: inspected.version,
        ...authVersionCas(inspected.authVersion),
      };
      migrated = await User.findOneAndUpdate(
        cas,
        {
          $set: {
            email: plan.targetEmail,
            isVerified: false,
            status: 'pending',
          },
          $inc: {
            __v: 1,
            authVersion: 1,
          },
        },
        { new: true, runValidators: true },
      );
      if (!migrated) {
        throw serviceError(
          'The Administrator status or version changed before migration could be applied.',
          'BOOTSTRAP_MIGRATION_STATE_CHANGED',
          409,
        );
      }
      original = { _id: migrated._id };
      operation = await updateOperationPhase(operation, 'identity_updated');
    } else if (operation.phase !== 'identity_updated' && operation.phase !== 'verification_delivered') {
      operation = await updateOperationPhase(operation, 'identity_updated');
    }

    if (migrated.isVerified && migrated.status === 'active') {
      await completeOperation(operation, migrated._id);
      return {
        applied: true,
        status: 'reconciled_completed',
        administrator: safeAdministratorRecord(migrated),
      };
    }
    if (!pendingAdministratorIsSafe(safeAdministratorRecord(migrated), plan.targetEmail)) {
      throw serviceError(
        'The migrated Administrator is no longer pending verification.',
        'BOOTSTRAP_MIGRATION_STATE_CHANGED',
        409,
      );
    }

    const activeVerification = await inspectVerificationState(migrated._id);
    let delivery;
    if (
      activeVerification.hasActiveToken
      && activeVerification.deliveryConfirmed
      && activeVerification.activeTokenEmail === plan.targetEmail
    ) {
      delivery = existingVerificationResult(activeVerification);
    } else {
      try {
        delivery = await issueStaffVerificationLink(migrated);
        deliverySucceeded = true;
      } catch (deliveryError) {
        operation = await rollbackMigration({
          operation,
          migrated,
          snapshot: operation.rollbackSnapshot,
          cause: deliveryError,
        });
        migrated = null;
        throw deliveryError;
      }
    }

    operation = await updateOperationPhase(operation, 'verification_delivered');
    await completeOperation(operation, migrated._id);
    return {
      applied: true,
      status: plan.action === 'reconcile_email_migration'
        ? 'reconciled_completed'
        : 'migrated_pending_verification',
      administrator: safeAdministratorRecord(migrated),
      verification: delivery,
    };
  } catch (error) {
    // Once delivery succeeded, an operation-state failure must be reconciled;
    // rolling account identity back would invalidate a link already emailed.
    if (deliverySucceeded && migrated) {
      return failClaimAndRethrow(operation, error, migrated._id);
    }
    return failClaimAndRethrow(operation, error, original?._id || migrated?._id);
  }
}

export async function resendBootstrapAdministratorVerification({
  targetEmail,
  confirmationToken,
} = {}) {
  const plan = await inspectBootstrapAdministrator({ mode: 'resend', targetEmail });
  if (!plan.canApply) {
    if (confirmationToken) {
      // A supplied confirmation is an apply attempt, not an inspection. Once
      // token/cooldown state changes, the old confirmation must be rejected.
      assertConfirmation(plan, confirmationToken);
    }
    return {
      applied: false,
      status: plan.action,
      reason: plan.reason,
      retryAfterSeconds: plan.retryAfterSeconds || 0,
      verificationState: plan.verificationState,
      administrator: plan.administrators[0] || null,
    };
  }
  assertConfirmation(plan, confirmationToken);

  const inspected = plan.administrators.find((entry) => entry.email === plan.targetEmail);
  const user = inspected ? await User.findOne({
    _id: inspected.id,
    email: plan.targetEmail,
    role: 'administrator',
    isVerified: false,
    isActive: true,
    isDeleted: inspected.isDeleted,
    status: inspected.status,
    updatedAt: inspected.updatedAt,
    __v: inspected.version,
    ...authVersionCas(inspected.authVersion),
  }) : null;
  if (!user) {
    throw serviceError(
      'The pending Administrator changed after inspection. Run inspect again.',
      'BOOTSTRAP_RESEND_STATE_CHANGED',
      409,
    );
  }

  const delivery = await issueStaffVerificationLink(user, { enforceCooldown: true });
  return {
    applied: true,
    status: 'verification_resent',
    administrator: safeAdministratorRecord(user),
    verification: delivery,
  };
}
