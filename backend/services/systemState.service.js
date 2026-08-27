import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import SystemState, {
  DECOMMISSIONING_PHASES,
  SYSTEM_MODES,
  SYSTEM_STATE_KEY,
} from '../models/systemState.model.js';
import User from '../models/user.model.js';

const DEFAULT_LEASE_MS = 60_000;
export const DESTRUCTIVE_TRANSACTION_LEASE_MS = 5 * 60_000;

export class SystemManagementError extends Error {
  constructor(message, code, status = 400, details = undefined) {
    super(message);
    this.name = 'SystemManagementError';
    this.code = code;
    this.status = status;
    this.statusCode = status;
    this.details = details;
  }
}

const stateDefaults = () => ({
  key: SYSTEM_STATE_KEY,
  mode: process.env.NODE_ENV === 'production' ? 'demo' : 'development',
  previousMode: null,
  modeStartedAt: new Date(),
  decommissioningPhase: 'none',
  registrationEnabled: true,
  bookingsEnabled: true,
  revision: 0,
  operationalDataEpoch: 0,
  globalSessionEpoch: 0,
  protectedAdministratorId: null,
  turnoverCompletedAt: null,
  inventoryBaselineVerifiedAt: null,
  inventoryBaseline: null,
  mutationLease: {},
});

const applySession = (query, session) => (session ? query.session(session) : query);

const normalizeProductIds = (productIds = []) => [...new Set(
  (Array.isArray(productIds) ? productIds : [])
    .map((productId) => String(productId || '').trim())
    .filter(Boolean),
)].sort();

export const computeActiveProductSetHash = (productIds = []) => createHash('sha256')
  .update(JSON.stringify(normalizeProductIds(productIds)))
  .digest('hex');

export const buildInventoryBaselineMetadata = (
  entries,
  { turnoverOperationId, capturedAt = new Date() } = {},
) => {
  if (!mongoose.isValidObjectId(turnoverOperationId)) {
    throw new SystemManagementError(
      'The turnover operation ID is required for the inventory baseline.',
      'INVALID_INVENTORY_BASELINE',
      500,
    );
  }
  const products = (Array.isArray(entries) ? entries : []).map((entry) => {
    const productId = String(entry?.productId || '');
    const openingQuantity = Number(entry?.quantity ?? entry?.openingQuantity);
    if (
      !mongoose.isValidObjectId(productId)
      || !Number.isSafeInteger(openingQuantity)
      || openingQuantity < 0
    ) {
      throw new SystemManagementError(
        'The turnover inventory baseline contains an invalid product or quantity.',
        'INVALID_INVENTORY_BASELINE',
        500,
      );
    }
    return { productId, openingQuantity };
  }).sort((left, right) => left.productId.localeCompare(right.productId));
  const productIds = products.map((entry) => entry.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new SystemManagementError(
      'The turnover inventory baseline contains duplicate products.',
      'INVALID_INVENTORY_BASELINE',
      500,
    );
  }
  return {
    turnoverOperationId,
    productSetHash: computeActiveProductSetHash(productIds),
    productCount: products.length,
    products,
    capturedAt,
    invalidatedAt: null,
    invalidationReason: null,
  };
};

export const inventoryBaselineMatchesActiveProducts = (baseline, activeProductIds = []) => {
  if (!baseline || typeof baseline.productSetHash !== 'string') return false;
  const activeIds = normalizeProductIds(activeProductIds);
  const baselineIds = normalizeProductIds(
    (Array.isArray(baseline.products) ? baseline.products : [])
      .map((entry) => entry?.productId),
  );
  return Number(baseline.productCount) === activeIds.length
    && baselineIds.length === activeIds.length
    && baselineIds.every((productId, index) => productId === activeIds[index])
    && baseline.productSetHash === computeActiveProductSetHash(activeIds);
};

export async function getSystemState({ session = null, lean = false } = {}) {
  let query = SystemState.findOne({ key: SYSTEM_STATE_KEY });
  query = applySession(query, session);
  let state = await query;

  if (!state) {
    try {
      const created = await SystemState.create([stateDefaults()], session ? { session } : undefined);
      state = created[0];
    } catch (error) {
      if (error?.code !== 11000) throw error;
      let retry = SystemState.findOne({ key: SYSTEM_STATE_KEY });
      retry = applySession(retry, session);
      state = await retry;
    }
  }

  return lean ? state.toObject() : state;
}

export async function getPublicSystemStatus() {
  const state = await getSystemState({ lean: true });
  return {
    mode: state.mode,
    phase: state.decommissioningPhase,
    registrationEnabled: Boolean(state.registrationEnabled),
    bookingEnabled: Boolean(state.bookingsEnabled),
    operationalDataEpoch: Number(state.operationalDataEpoch || 0),
    revision: Number(state.revision || 0),
    updatedAt: state.updatedAt,
  };
}

const normalizedUserId = (userOrId) => String(
  userOrId?._id || userOrId?.id || userOrId || '',
);

export async function isProtectedAdministrator(userOrId, state = null) {
  const current = state || await getSystemState({ lean: true });
  const userId = normalizedUserId(userOrId);
  return Boolean(userId && current.protectedAdministratorId)
    && userId === String(current.protectedAdministratorId);
}

export async function assertProtectedAdministrator(userOrId, state = null) {
  if (!await isProtectedAdministrator(userOrId, state)) {
    throw new SystemManagementError(
      'Only the protected administrator may perform this operation.',
      'PROTECTED_ADMIN_REQUIRED',
      403,
    );
  }
  return state || getSystemState();
}

export async function getSystemCapabilities(user, state = null) {
  const current = state || await getSystemState({ lean: true });
  const role = String(user?.role || '');
  const protectedAdministrator = role === 'administrator'
    && await isProtectedAdministrator(user, current);
  const overviewRole = role === 'administrator' || role === 'office_admin';

  return {
    viewOverview: overviewRole,
    exportData: overviewRole,
    manageClassification: protectedAdministrator && ['development', 'demo'].includes(current.mode),
    clearDemoData: protectedAdministrator && ['development', 'demo'].includes(current.mode),
    resetDemoEnvironment: protectedAdministrator && ['development', 'demo'].includes(current.mode),
    createBackup: protectedAdministrator && current.mode !== 'archived',
    prepareTurnover: protectedAdministrator && ['development', 'demo'].includes(current.mode),
    transferAdministrator: protectedAdministrator && current.mode !== 'archived',
    manageLifecycle: protectedAdministrator,
    availableLifecycleActions: protectedAdministrator
      ? (current.mode === 'archived' ? ['restore'] : ['enter_production', 'leave_production', 'begin_decommissioning', 'archive'])
      : [],
    // Archived systems remain read-only, but the protected administrator may
    // retry the narrowly allowed final-archive Firebase revocation jobs.
    retryCleanup: protectedAdministrator,
    protectedAdministrator,
  };
}

export async function assertSystemMutationAllowed({
  state = null,
  operationId = null,
  allowDuringLease = false,
  allowArchived = false,
} = {}) {
  const current = state || await getSystemState({ lean: true });
  if (!allowArchived && current.mode === 'archived') {
    throw new SystemManagementError(
      'The system is archived and does not accept operational changes.',
      'SYSTEM_ARCHIVED',
      423,
    );
  }

  const lease = current.mutationLease;
  const leaseActive = lease?.operationId
    && lease?.expiresAt
    && new Date(lease.expiresAt).getTime() > Date.now();
  const ownsLease = operationId && String(lease?.operationId) === String(operationId);
  if (leaseActive && !allowDuringLease && !ownsLease) {
    throw new SystemManagementError(
      'A protected system operation is currently in progress.',
      'SYSTEM_MUTATION_LOCKED',
      423,
      { retryAfter: new Date(lease.expiresAt).toISOString() },
    );
  }
  return current;
}

export async function acquireSystemMutationLease({
  operationId,
  owner,
  ttlMs = DEFAULT_LEASE_MS,
  session = null,
} = {}) {
  if (!mongoose.isValidObjectId(operationId)) {
    throw new SystemManagementError('A valid operation ID is required.', 'INVALID_OPERATION_ID', 400);
  }
  await getSystemState({ session });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(10_000, Number(ttlMs) || DEFAULT_LEASE_MS));
  const fencingToken = randomUUID();
  const filter = {
    key: SYSTEM_STATE_KEY,
    $or: [
      { 'mutationLease.operationId': null },
      { 'mutationLease.operationId': { $exists: false } },
      { 'mutationLease.expiresAt': { $lte: now } },
    ],
  };
  const update = {
    $set: {
      mutationLease: {
        operationId,
        fencingToken,
        owner: String(owner || 'system-management').slice(0, 160),
        acquiredAt: now,
        expiresAt,
      },
    },
    $inc: { revision: 1 },
  };
  let query = SystemState.findOneAndUpdate(filter, update, { new: true });
  query = applySession(query, session);
  const state = await query;
  if (!state) {
    const current = await getSystemState({ lean: true });
    throw new SystemManagementError(
      'Another protected system operation is already in progress.',
      'SYSTEM_MUTATION_LOCKED',
      423,
      { retryAfter: current.mutationLease?.expiresAt || null },
    );
  }
  return state;
}

/**
 * Atomically extend a lease only while the exact acquisition token still owns
 * it and the lease has not expired. The token fences a stale executor from
 * renewing or releasing a later acquisition for the same operation ID.
 */
export async function renewSystemMutationLease({
  operationId,
  fencingToken,
  ttlMs = DEFAULT_LEASE_MS,
  session = null,
} = {}) {
  if (!mongoose.isValidObjectId(operationId) || !fencingToken) {
    throw new SystemManagementError(
      'The protected system operation lease is no longer owned by this executor.',
      'SYSTEM_MUTATION_LEASE_LOST',
      409,
    );
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(10_000, Number(ttlMs) || DEFAULT_LEASE_MS));
  let query = SystemState.findOneAndUpdate(
    {
      key: SYSTEM_STATE_KEY,
      'mutationLease.operationId': operationId,
      'mutationLease.fencingToken': String(fencingToken),
      'mutationLease.expiresAt': { $gt: now },
    },
    { $set: { 'mutationLease.expiresAt': expiresAt } },
    { new: true },
  );
  query = applySession(query, session);
  const state = await query;
  if (!state) {
    throw new SystemManagementError(
      'The protected system operation lease expired or was replaced before commit.',
      'SYSTEM_MUTATION_LEASE_LOST',
      409,
    );
  }
  return state;
}

export async function releaseSystemMutationLease({
  operationId,
  fencingToken,
  session = null,
} = {}) {
  if (!mongoose.isValidObjectId(operationId) || !fencingToken) return false;
  let query = SystemState.updateOne(
    {
      key: SYSTEM_STATE_KEY,
      'mutationLease.operationId': operationId,
      'mutationLease.fencingToken': String(fencingToken),
    },
    {
      $set: { mutationLease: {} },
      $inc: { revision: 1 },
    },
  );
  query = applySession(query, session);
  const result = await query;
  return result.modifiedCount === 1;
}

export async function incrementOperationalDataEpoch({ session = null } = {}) {
  await getSystemState({ session });
  let query = SystemState.findOneAndUpdate(
    { key: SYSTEM_STATE_KEY },
    { $inc: { operationalDataEpoch: 1, revision: 1 } },
    { new: true },
  );
  query = applySession(query, session);
  return query;
}

export async function incrementGlobalSessionEpoch({ session = null } = {}) {
  await getSystemState({ session });
  let query = SystemState.findOneAndUpdate(
    { key: SYSTEM_STATE_KEY },
    { $inc: { globalSessionEpoch: 1, revision: 1 } },
    { new: true },
  );
  query = applySession(query, session);
  return query;
}

export async function setSystemMode(mode, {
  session = null,
  decommissioningPhase,
  registrationEnabled,
  bookingsEnabled,
  extra = {},
} = {}) {
  if (!SYSTEM_MODES.includes(mode)) {
    throw new SystemManagementError('Unsupported system mode.', 'INVALID_SYSTEM_MODE', 400);
  }
  if (decommissioningPhase && !DECOMMISSIONING_PHASES.includes(decommissioningPhase)) {
    throw new SystemManagementError('Unsupported lifecycle phase.', 'INVALID_LIFECYCLE_PHASE', 400);
  }
  const current = await getSystemState({ session, lean: true });
  const previousMode = mode === 'archived'
    ? current.mode
    : current.mode === 'archived'
      ? null
      : mode === current.mode
        ? current.previousMode
        : current.mode;
  const set = {
    mode,
    previousMode,
    ...(mode !== current.mode ? { modeStartedAt: new Date() } : {}),
    ...(decommissioningPhase ? { decommissioningPhase } : {}),
    ...(typeof registrationEnabled === 'boolean' ? { registrationEnabled } : {}),
    ...(typeof bookingsEnabled === 'boolean' ? { bookingsEnabled } : {}),
    ...extra,
  };
  let query = SystemState.findOneAndUpdate(
    { key: SYSTEM_STATE_KEY },
    { $set: set, $inc: { revision: 1 } },
    { new: true, runValidators: true },
  );
  query = applySession(query, session);
  return query;
}

export async function updateLifecycleState(set, { session = null } = {}) {
  const safeSet = { ...set };
  delete safeSet.key;
  delete safeSet.revision;
  delete safeSet.operationalDataEpoch;
  delete safeSet.globalSessionEpoch;
  delete safeSet.mutationLease;
  await getSystemState({ session });
  let query = SystemState.findOneAndUpdate(
    { key: SYSTEM_STATE_KEY },
    { $set: safeSet, $inc: { revision: 1 } },
    { new: true, runValidators: true },
  );
  query = applySession(query, session);
  return query;
}

export async function invalidateInventoryBaseline({ session = null } = {}) {
  const current = await getSystemState({ session, lean: true });
  if (!current.inventoryBaselineVerifiedAt && !current.inventoryBaseline) return current;
  const invalidatedAt = new Date();
  const set = current.inventoryBaseline
    ? {
      inventoryBaselineVerifiedAt: null,
      'inventoryBaseline.invalidatedAt': invalidatedAt,
      'inventoryBaseline.invalidationReason': 'active_product_catalog_changed',
    }
    : { inventoryBaselineVerifiedAt: null };
  let query = SystemState.findOneAndUpdate(
    { key: SYSTEM_STATE_KEY },
    { $set: set, $inc: { revision: 1 } },
    { new: true, runValidators: true },
  );
  query = applySession(query, session);
  return query;
}

export async function initializeProtectedAdministrator(
  email = 'ivantadena18@gmail.com',
  { session = null } = {},
) {
  const existingState = await getSystemState({ session });
  if (existingState.protectedAdministratorId) {
    let protectedQuery = User.findOne({
      _id: existingState.protectedAdministratorId,
      role: 'administrator',
      isActive: true,
      isVerified: true,
      status: 'active',
      isDeleted: { $ne: true },
    }).select('_id');
    protectedQuery = applySession(protectedQuery, session);
    if (!await protectedQuery) {
      throw new SystemManagementError(
        'The stored protected administrator is not a usable verified Administrator.',
        'PROTECTED_ADMIN_INVALID',
        409,
      );
    }
    return existingState;
  }
  const normalizedEmail = String(email || '').trim().toLowerCase();
  let query = User.findOne({
    email: normalizedEmail,
    role: 'administrator',
    isActive: true,
    isVerified: true,
    status: 'active',
    isDeleted: { $ne: true },
  }).select('_id email role isActive isVerified status isDeleted');
  query = applySession(query, session);
  const administrator = await query;
  if (!administrator) {
    throw new SystemManagementError(
      `Active administrator ${normalizedEmail} was not found.`,
      'PROTECTED_ADMIN_NOT_FOUND',
      409,
    );
  }
  let update = SystemState.findOneAndUpdate(
    { key: SYSTEM_STATE_KEY, protectedAdministratorId: null },
    { $set: { protectedAdministratorId: administrator._id }, $inc: { revision: 1 } },
    { new: true },
  );
  update = applySession(update, session);
  const changed = await update;
  if (changed) return changed;
  return getSystemState({ session });
}

export async function getGlobalSessionEpoch() {
  const state = await getSystemState({ lean: true });
  return Number(state.globalSessionEpoch || 0);
}

export default {
  getSystemState,
  getPublicSystemStatus,
  getSystemCapabilities,
  isProtectedAdministrator,
  assertProtectedAdministrator,
  assertSystemMutationAllowed,
  acquireSystemMutationLease,
  renewSystemMutationLease,
  releaseSystemMutationLease,
  incrementOperationalDataEpoch,
  incrementGlobalSessionEpoch,
  setSystemMode,
  updateLifecycleState,
  computeActiveProductSetHash,
  buildInventoryBaselineMetadata,
  inventoryBaselineMatchesActiveProducts,
  invalidateInventoryBaseline,
  initializeProtectedAdministrator,
  getGlobalSessionEpoch,
};
