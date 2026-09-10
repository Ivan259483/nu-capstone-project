/**
 * staleAdministratorBinding.service.js
 *
 * Narrowly scoped, compare-and-set recovery for a stale protectedAdministratorId.
 *
 * PURPOSE
 * -------
 * After an accidental out-of-band deleteMany removed the Administrator document,
 * the systemState.protectedAdministratorId may point to an ObjectId that no
 * longer exists in the users collection.  The bootstrap flow and
 * migrate-protected-administrator script both block on a non-null
 * protectedAdministratorId, preventing new Administrator provisioning.
 *
 * This service is the ONLY authorised path to clear that stale reference.
 * It uses compare-and-set semantics to ensure:
 *
 *   1. The target database is `autospf`.
 *   2. The caller supplies the exact expected stale ObjectId string.
 *   3. The stored protectedAdministratorId matches that exact value.
 *   4. The referenced User document does not exist (it is genuinely stale).
 *   5. Zero Administrator-role users exist in the system.
 *   6. The SystemState document has not changed since the pre-flight snapshot
 *      (revision CAS prevents a concurrent writer from being overwritten).
 *
 * The service is NOT a generic administrator takeover mechanism.  It only
 * writes { protectedAdministratorId: null }; it cannot install a new owner.
 * Recovery of the actual Administrator account is left to the existing
 * bootstrap provisioning flow.
 *
 * IDEMPOTENCY
 * -----------
 * If protectedAdministratorId is already null the service returns
 * { reconciled: false, alreadyClear: true } without touching the database.
 *
 * AUDIT
 * -----
 * Every call — successful or refused — returns a structured result record
 * suitable for logging.  Nothing sensitive is included.
 */

import mongoose from 'mongoose';
import SystemState from '../models/systemState.model.js';
import User from '../models/user.model.js';
import { SYSTEM_STATE_KEY } from '../models/systemState.model.js';

// ─── Error helper ────────────────────────────────────────────────────────────

const recoveryError = (message, code, statusCode = 400) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

// ─── Internal guard helpers ──────────────────────────────────────────────────

const assertTargetDatabase = (connection) => {
  const name = connection?.db?.databaseName
    || connection?.name
    || '';
  if (name !== 'autospf') {
    throw recoveryError(
      `Stale binding recovery must target the autospf database, but the connected database is "${name || '(unknown)'}".`,
      'WRONG_DATABASE',
      400,
    );
  }
};

const assertValidObjectId = (value, field) => {
  if (!mongoose.isValidObjectId(String(value || ''))) {
    throw recoveryError(
      `${field} must be a valid MongoDB ObjectId string.`,
      'INVALID_OBJECT_ID',
      400,
    );
  }
};

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * inspectStaleAdministratorBinding
 *
 * Read-only preflight check.  Returns the current binding state without
 * making any writes.  Call this before reconcileStaleAdministratorBinding
 * to review the live state.
 *
 * @param {object} opts
 * @param {string} opts.expectedStaleId - The exact ObjectId string that the
 *   caller believes is currently stored as protectedAdministratorId.
 * @returns {Promise<object>} Structured state snapshot.
 */
export async function inspectStaleAdministratorBinding({ expectedStaleId } = {}) {
  assertValidObjectId(expectedStaleId, 'expectedStaleId');

  assertTargetDatabase(mongoose.connection);

  const state = await SystemState.findOne({ key: SYSTEM_STATE_KEY })
    .select('_id key protectedAdministratorId revision updatedAt')
    .lean();

  if (!state) {
    return {
      canReconcile: false,
      reason: 'SystemState document does not exist.',
      reasonCode: 'SYSTEM_STATE_NOT_FOUND',
      systemStateExists: false,
      storedProtectedAdministratorId: null,
      expectedStaleId,
      storedMatchesExpected: false,
      staleUserExists: false,
      administratorCount: null,
      alreadyClear: false,
    };
  }

  const stored = state.protectedAdministratorId
    ? String(state.protectedAdministratorId)
    : null;

  if (stored === null) {
    return {
      canReconcile: false,
      alreadyClear: true,
      reason: 'protectedAdministratorId is already null; no reconciliation needed.',
      reasonCode: 'ALREADY_CLEAR',
      systemStateExists: true,
      systemStateId: String(state._id),
      storedProtectedAdministratorId: null,
      expectedStaleId,
      storedMatchesExpected: false,
      staleUserExists: false,
      administratorCount: await User.countDocuments({ role: 'administrator' }),
      revision: state.revision,
    };
  }

  const storedMatchesExpected = stored === String(expectedStaleId);
  const staleUserExists = storedMatchesExpected
    ? Boolean(await User.exists({ _id: new mongoose.Types.ObjectId(stored) }))
    : false;
  const administratorCount = await User.countDocuments({ role: 'administrator' });

  // Determine whether reconciliation would be allowed.
  let canReconcile = false;
  let reason = null;
  let reasonCode = null;

  if (!storedMatchesExpected) {
    reason = `The stored protectedAdministratorId ("${stored}") does not match the expected stale ID ("${expectedStaleId}"). Reconciliation is not authorised for this value.`;
    reasonCode = 'STALE_ID_MISMATCH';
  } else if (staleUserExists) {
    reason = 'The referenced User document still exists. The binding is NOT stale; reconciliation is refused to protect the active Administrator.';
    reasonCode = 'STALE_USER_STILL_EXISTS';
  } else if (administratorCount > 0) {
    reason = `${administratorCount} Administrator account(s) still exist. Stale binding recovery is only permitted when the administrator count is zero.`;
    reasonCode = 'ADMINISTRATOR_EXISTS';
  } else {
    canReconcile = true;
  }

  return {
    canReconcile,
    reason,
    reasonCode,
    alreadyClear: false,
    systemStateExists: true,
    systemStateId: String(state._id),
    storedProtectedAdministratorId: stored,
    expectedStaleId,
    storedMatchesExpected,
    staleUserExists,
    administratorCount,
    revision: state.revision,
    updatedAt: state.updatedAt,
  };
}

/**
 * reconcileStaleAdministratorBinding
 *
 * Clears the stale protectedAdministratorId from SystemState using a
 * compare-and-set filter.  The filter includes:
 *
 *   - key: SYSTEM_STATE_KEY           (singleton guard)
 *   - protectedAdministratorId: exact stale ObjectId  (CAS on stored value)
 *   - revision: snapshot revision     (CAS on concurrent document changes)
 *
 * If any guard fails — wrong database, wrong stored ID, stale user still
 * exists, admins still exist, or the document changed between snapshot and
 * write — the operation fails closed without writing.
 *
 * @param {object} opts
 * @param {string} opts.expectedStaleId - The exact ObjectId string currently
 *   stored as protectedAdministratorId.  Must be "69e95742b5d5b813fd407f01"
 *   in this production incident; any other value is a misuse.
 * @returns {Promise<object>} Structured result record.
 */
export async function reconcileStaleAdministratorBinding({ expectedStaleId } = {}) {
  // ── 0. Input validation ──────────────────────────────────────────────────
  assertValidObjectId(expectedStaleId, 'expectedStaleId');

  // ── 1. Target-database guard ─────────────────────────────────────────────
  assertTargetDatabase(mongoose.connection);

  // ── 2. Full pre-flight inspection ────────────────────────────────────────
  const snapshot = await inspectStaleAdministratorBinding({ expectedStaleId });

  if (snapshot.alreadyClear) {
    return {
      reconciled: false,
      alreadyClear: true,
      status: 'ALREADY_CLEAR',
      message: 'protectedAdministratorId was already null; no write was performed.',
      previousStaleId: null,
      newProtectedAdministratorId: null,
      systemStateId: snapshot.systemStateId || null,
      revision: snapshot.revision ?? null,
      administratorCount: snapshot.administratorCount,
    };
  }

  if (!snapshot.canReconcile) {
    throw recoveryError(
      snapshot.reason || 'Stale binding reconciliation refused.',
      snapshot.reasonCode || 'RECONCILE_REFUSED',
      409,
    );
  }

  // ── 3. Re-verify live guards immediately before the write ────────────────
  //    (snapshot may be slightly stale if the caller paused between inspect
  //     and reconcile — the CAS filter is the final authority, but we add
  //     explicit re-checks to surface clear diagnostics)

  const liveAdminCount = await User.countDocuments({ role: 'administrator' });
  if (liveAdminCount > 0) {
    throw recoveryError(
      `${liveAdminCount} Administrator account(s) appeared between inspection and write. Reconciliation aborted.`,
      'ADMINISTRATOR_APPEARED',
      409,
    );
  }

  const staleUserStillExists = await User.exists({
    _id: new mongoose.Types.ObjectId(String(expectedStaleId)),
  });
  if (staleUserStillExists) {
    throw recoveryError(
      'The referenced User document appeared between inspection and write. The binding is no longer stale; reconciliation aborted.',
      'STALE_USER_APPEARED',
      409,
    );
  }

  // ── 4. Compare-and-set write ─────────────────────────────────────────────
  //    Filter includes the exact stale ObjectId and the inspected revision.
  //    If anything changes concurrently, findOneAndUpdate returns null and
  //    we fail closed.

  const staleObjectId = new mongoose.Types.ObjectId(String(expectedStaleId));

  const updated = await SystemState.findOneAndUpdate(
    {
      key: SYSTEM_STATE_KEY,
      protectedAdministratorId: staleObjectId,    // CAS: exact stale value
      revision: snapshot.revision,                // CAS: document version
    },
    {
      $set: { protectedAdministratorId: null },
      $inc: { revision: 1 },
    },
    { new: true, runValidators: true },
  );

  if (!updated) {
    throw recoveryError(
      'The SystemState document changed between the pre-flight check and the write (CAS failed). Rerun inspect to review the current state before retrying.',
      'CAS_FAILED',
      409,
    );
  }

  return {
    reconciled: true,
    alreadyClear: false,
    status: 'RECONCILED',
    message: 'Stale protectedAdministratorId cleared. The bootstrap provisioning flow may now create and bind a new Administrator.',
    previousStaleId: String(expectedStaleId),
    newProtectedAdministratorId: null,
    systemStateId: String(updated._id),
    revision: updated.revision,
    administratorCount: liveAdminCount,
  };
}

export default {
  inspectStaleAdministratorBinding,
  reconcileStaleAdministratorBinding,
};
