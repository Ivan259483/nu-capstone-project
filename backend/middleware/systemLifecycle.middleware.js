import {
  getSystemState,
  isProtectedAdministrator,
} from '../services/systemState.service.js';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import SystemMutationAdmission from '../models/systemMutationAdmission.model.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MUTATING_READ_METHODS = new Set(['GET', 'HEAD']);
const MUTATING_READ_PATHS = Object.freeze([
  /^\/api\/orders\/[^/]+\/billing$/,
  /^\/api\/ai\/generate-3d\/[^/]+$/,
  /^\/api\/customers\/me$/,
  /^\/api\/settings(?:\/public)?$/,
  /^\/api\/orders\/available-slots$/,
  /^\/api\/slots(?:\/(?:schedule|range|settings))?$/,
  /^\/api\/admin\/availability\/(?:emergency|recurring|hours)$/,
]);
const ARCHIVED_AUTH_MUTATION_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/verify-login-otp',
  '/api/auth/resend-login-otp',
  '/api/auth/logout',
]);
const RETIRED_SYSTEM_PATHS = new Set([
  '/api/system/reset',
  '/api/system/export',
  '/api/system/backup',
]);

let inFlightMutationCount = 0;
const PROCESS_INSTANCE_ID = `${process.pid}:${randomUUID()}`;
const ADMISSION_TTL_MS = 2 * 60 * 1000;
const ADMISSION_HEARTBEAT_MS = 30 * 1000;

const createPolicyError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const requestPath = (req) => String(req.originalUrl || req.url || '')
  .split('?')[0]
  .replace(/\/+$/, '') || '/';

// These endpoints are exposed as reads but may create/update records, initialize
// configuration singletons, or upload managed assets. Classify only the known
// paths so ordinary GETs stay readable while the destructive-operation barrier
// is active. Notification reads are intentionally absent: their optional
// backfill runs through runTrackedSystemMutation independently of the response.
const isMutatingReadRequest = (req, path) => (
  MUTATING_READ_METHODS.has(req.method)
  && MUTATING_READ_PATHS.some((pattern) => pattern.test(path))
);

const isActiveLease = (state, now = Date.now()) => {
  const operationId = state?.mutationLease?.operationId;
  const expiresAt = state?.mutationLease?.expiresAt
    ? new Date(state.mutationLease.expiresAt).getTime()
    : 0;
  return Boolean(operationId && Number.isFinite(expiresAt) && expiresAt > now);
};

// Execution requests acquire and own the persisted lease themselves. They must
// not count themselves while waiting for older mutations to drain.
const isLeaseOwningSystemRequest = (path) => (
  path.startsWith('/api/system/')
  && /\/executions$/.test(path)
);

const isRegistrationRequest = (req, path) => (
  req.method === 'POST'
  && (
    path === '/api/auth/register'
    || path === '/api/auth/send-otp'
    || path === '/api/auth/resend-otp'
    || path === '/api/auth/verify-otp'
    || path === '/api/auth/chat-registration/start'
    || path === '/api/auth/chat-registration/resend'
  )
);

const isBookingCreationRequest = (req, path) => (
  req.method === 'POST'
  && (path === '/api/orders' || path === '/api/bookings')
);

const releaseMutation = () => {
  inFlightMutationCount = Math.max(0, inFlightMutationCount - 1);
};

const trackMutationResponse = (res, releaseTicket) => {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseTicket();
  };
  res.once('finish', release);
  res.once('close', release);
  return release;
};

const sendPolicyError = (res, error) => res.status(error.statusCode || 503).json({
  success: false,
  code: error.code || 'SYSTEM_POLICY_BLOCKED',
  message: error.message,
});

// A handful of pure HTTP-hardening tests intentionally mount the Express app
// without starting or connecting the server. Avoid Mongoose's 10-second
// buffering delay in that explicit harness only; a normally started process
// still fails closed when lifecycle state cannot be read.
const getRequestSystemState = async () => {
  if (
    process.env.SKIP_SERVER_START === 'true'
    && mongoose.connection.readyState === 0
  ) {
    return {
      mode: 'development',
      registrationEnabled: true,
      bookingsEnabled: true,
      operationalDataEpoch: 0,
      globalSessionEpoch: 0,
      mutationLease: null,
    };
  }
  return getSystemState();
};

export const getInFlightMutationCount = () => inFlightMutationCount;

const disconnectedTestHarness = () => (
  process.env.SKIP_SERVER_START === 'true'
  && mongoose.connection.readyState === 0
);

const createDistributedAdmission = async ({ kind = 'internal', requestId = null } = {}) => {
  if (disconnectedTestHarness()) return null;
  const token = randomUUID();
  const admission = await SystemMutationAdmission.create({
    token,
    owner: PROCESS_INSTANCE_ID,
    kind,
    requestId: requestId ? String(requestId).slice(0, 180) : null,
    expiresAt: new Date(Date.now() + ADMISSION_TTL_MS),
  });
  return { id: admission._id, token };
};

const countDistributedAdmissions = async () => {
  if (disconnectedTestHarness()) return 0;
  return SystemMutationAdmission.countDocuments({ expiresAt: { $gt: new Date() } });
};

/**
 * Called by destructive lifecycle execution after it acquires the persisted
 * mutation lease. New writes are rejected by the middleware while this waits
 * for requests that were already admitted to complete.
 *
 * Each admitted writer owns a renewable Mongo ticket. The persisted exclusive
 * lease blocks new admissions, while this drain observes active tickets from
 * every application instance before destructive planning may continue.
 */
export const waitForInFlightMutations = async ({ timeoutMs = 15_000 } = {}) => {
  const deadline = Date.now() + Math.max(1, Number(timeoutMs) || 15_000);
  while (true) {
    const distributedCount = await countDistributedAdmissions();
    if (inFlightMutationCount === 0 && distributedCount === 0) return;
    if (Date.now() >= deadline) {
      throw createPolicyError(
        'Timed out waiting for active system mutations to finish.',
        'MUTATION_DRAIN_TIMEOUT',
        503,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
  }
};

export const assertRegistrationEnabled = async (state) => {
  const currentState = state || await getSystemState();
  if (currentState.mode === 'archived' || currentState.registrationEnabled === false) {
    throw createPolicyError(
      'New account registration is currently disabled.',
      'REGISTRATION_DISABLED',
      403,
    );
  }
  return currentState;
};

export const assertBookingsEnabled = async (state) => {
  const currentState = state || await getSystemState();
  if (currentState.mode === 'archived' || currentState.bookingsEnabled === false) {
    throw createPolicyError(
      'New bookings are currently disabled.',
      'BOOKINGS_DISABLED',
      403,
    );
  }
  return currentState;
};

export const assertAuthenticationAllowed = async (userOrId, state) => {
  const currentState = state || await getSystemState();
  const protectedAdministrator = await isProtectedAdministrator(userOrId, currentState);
  if (
    currentState.mode === 'archived'
    && !protectedAdministrator
  ) {
    throw createPolicyError(
      'This system is archived. Only the protected administrator may sign in.',
      'SYSTEM_ARCHIVED',
      423,
    );
  }
  return currentState;
};

/** Route-level gate used after optional auth has resolved the caller. */
export const enforceAnonymousChatOnboarding = async (req, res, next) => {
  if (req.user?.id) return next();
  try {
    await assertRegistrationEnabled(req.systemState);
    return next();
  } catch (error) {
    return sendPolicyError(res, error);
  }
};

export const getSystemMutationBlock = async ({ state, allowArchived = false } = {}) => {
  const currentState = state || await getSystemState();
  if (isActiveLease(currentState)) {
    return {
      allowed: false,
      state: currentState,
      code: 'SYSTEM_MUTATION_IN_PROGRESS',
      message: 'A system management operation is in progress. Try again shortly.',
      statusCode: 503,
    };
  }
  if (!allowArchived && currentState.mode === 'archived') {
    return {
      allowed: false,
      state: currentState,
      code: 'SYSTEM_ARCHIVED',
      message: 'This system is archived and is read-only.',
      statusCode: 423,
    };
  }
  return { allowed: true, state: currentState };
};

export const beginTrackedSystemMutation = async ({
  allowArchived = false,
  throwOnBlocked = false,
  state = null,
  kind = 'internal',
  requestId = null,
} = {}) => {
  const initial = await getSystemMutationBlock({ state, allowArchived });
  if (!initial.allowed) {
    if (throwOnBlocked) {
      throw createPolicyError(initial.message, initial.code, initial.statusCode);
    }
    return { allowed: false, code: initial.code, release() {} };
  }

  const admission = await createDistributedAdmission({ kind, requestId });
  inFlightMutationCount += 1;
  let released = false;
  let heartbeat = null;
  const release = () => {
    if (released) return;
    released = true;
    if (heartbeat) clearInterval(heartbeat);
    releaseMutation();
    if (admission?.id) {
      void SystemMutationAdmission.deleteOne({
        _id: admission.id,
        token: admission.token,
      }).catch((error) => {
        console.warn('[SYSTEM_LIFECYCLE_GATE] Failed to release mutation admission:', error?.message || error);
      });
    }
  };

  if (admission?.id) {
    heartbeat = setInterval(() => {
      void SystemMutationAdmission.updateOne(
        { _id: admission.id, token: admission.token },
        { $set: { expiresAt: new Date(Date.now() + ADMISSION_TTL_MS) } },
      ).catch((error) => {
        console.warn('[SYSTEM_LIFECYCLE_GATE] Failed to renew mutation admission:', error?.message || error);
      });
    }, ADMISSION_HEARTBEAT_MS);
    heartbeat.unref?.();
  }

  // Close the admission race: a lifecycle operation can acquire its persisted
  // lease between the first state read and the durable ticket write. Re-read
  // after admission and back out before any caller mutates.
  try {
    const current = disconnectedTestHarness()
      ? initial
      : await getSystemMutationBlock({ allowArchived });
    if (!current.allowed) {
      release();
      if (throwOnBlocked) {
        throw createPolicyError(current.message, current.code, current.statusCode);
      }
      return { allowed: false, code: current.code, release() {} };
    }
    return { allowed: true, state: current.state, release };
  } catch (error) {
    release();
    throw error;
  }
};

/** Track non-HTTP scheduler/socket work in the same drain counter. */
export const runTrackedSystemMutation = async (
  work,
  { allowArchived = false, throwOnBlocked = false } = {},
) => {
  const ticket = await beginTrackedSystemMutation({ allowArchived, throwOnBlocked });
  if (!ticket.allowed) return { skipped: true, code: ticket.code };
  try {
    return await work(ticket.state);
  } finally {
    ticket.release();
  }
};

/**
 * Global API lifecycle gate. Health and Stripe's raw webhook route are mounted
 * before this middleware; the verified webhook performs its own archive logic.
 */
export const enforceSystemLifecycle = async (req, res, next) => {
  try {
    if (req.method === 'OPTIONS') return next();

    const path = requestPath(req);
    // Retired endpoints own a permanent 410 contract and never reach business
    // logic, so lifecycle state/lease availability must not change that result.
    if (RETIRED_SYSTEM_PATHS.has(path)) return next();

    const state = await getRequestSystemState();
    req.systemState = state;
    res.setHeader('X-Operational-Data-Epoch', String(state.operationalDataEpoch || 0));

    const safe = SAFE_METHODS.has(req.method) && !isMutatingReadRequest(req, path);

    if (isRegistrationRequest(req, path) && state.registrationEnabled === false) {
      return sendPolicyError(res, createPolicyError(
        'New account registration is currently disabled.',
        'REGISTRATION_DISABLED',
        403,
      ));
    }
    if (isBookingCreationRequest(req, path) && state.bookingsEnabled === false) {
      return sendPolicyError(res, createPolicyError(
        'New bookings are currently disabled.',
        'BOOKINGS_DISABLED',
        403,
      ));
    }

    if (
      state.mode === 'archived'
      && !safe
      && !path.startsWith('/api/system/')
      && !ARCHIVED_AUTH_MUTATION_PATHS.has(path)
    ) {
      return sendPolicyError(res, createPolicyError(
        'This system is archived and is read-only.',
        'SYSTEM_ARCHIVED',
        423,
      ));
    }

    if (!safe && !isLeaseOwningSystemRequest(path)) {
      const ticket = await beginTrackedSystemMutation({
        state,
        allowArchived: path.startsWith('/api/system/'),
        kind: 'http',
        requestId: req.id,
      });
      if (!ticket.allowed) {
        res.setHeader('Retry-After', '3');
        return sendPolicyError(res, createPolicyError(
          ticket.code === 'SYSTEM_ARCHIVED'
            ? 'This system is archived and is read-only.'
            : 'A system management operation is in progress. Try again shortly.',
          ticket.code,
          ticket.code === 'SYSTEM_ARCHIVED' ? 423 : 503,
        ));
      }
      trackMutationResponse(res, ticket.release);
      req.systemState = ticket.state;
    }

    return next();
  } catch (error) {
    console.error('[SYSTEM_LIFECYCLE_GATE] Failed to load system state:', error.message);
    return sendPolicyError(res, createPolicyError(
      'System lifecycle state is temporarily unavailable.',
      'SYSTEM_STATE_UNAVAILABLE',
      503,
    ));
  }
};

export default enforceSystemLifecycle;
