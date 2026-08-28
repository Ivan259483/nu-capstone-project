import User from '../models/user.model.js';
import { normalizeToCanonical } from '../constants/roles.js';
import {
  getSystemState,
  isProtectedAdministrator,
} from './systemState.service.js';

const protectedMutationError = () => {
  const error = new Error(
    'The protected administrator cannot be deleted, archived, deactivated, or reassigned outside the administrator handover workflow.',
  );
  error.code = 'PROTECTED_ADMINISTRATOR';
  error.statusCode = 409;
  return error;
};

const protectedUserManagementError = () => {
  const error = new Error(
    'The protected administrator is managed exclusively through System Management ownership workflows.',
  );
  error.code = 'PROTECTED_ADMINISTRATOR_SYSTEM_MANAGED';
  error.statusCode = 403;
  return error;
};

const protectedAdministratorNotInitializedError = () => {
  const error = new Error(
    'User Management is unavailable until the protected administrator has been initialized.',
  );
  error.code = 'PROTECTED_ADMINISTRATOR_NOT_INITIALIZED';
  error.statusCode = 503;
  return error;
};

const lastAdministratorError = () => {
  const error = new Error('At least one active, verified Administrator account must remain available.');
  error.code = 'LAST_ADMINISTRATOR';
  error.statusCode = 409;
  return error;
};

const getResultingAccountState = (targetUser, changes = {}) => ({
  role: Object.prototype.hasOwnProperty.call(changes, 'role')
    ? normalizeToCanonical(changes.role)
    : normalizeToCanonical(targetUser?.role),
  isActive: Object.prototype.hasOwnProperty.call(changes, 'isActive')
    ? changes.isActive
    : targetUser?.isActive,
  isDeleted: Object.prototype.hasOwnProperty.call(changes, 'isDeleted')
    ? changes.isDeleted
    : targetUser?.isDeleted,
  isVerified: Object.prototype.hasOwnProperty.call(changes, 'isVerified')
    ? changes.isVerified
    : targetUser?.isVerified,
  status: Object.prototype.hasOwnProperty.call(changes, 'status')
    ? changes.status
    : targetUser?.status,
});

const isUsableAdministrator = (account) => (
  account.role === 'administrator'
  && account.isActive !== false
  && account.isDeleted !== true
  && account.isVerified === true
  && account.status === 'active'
);

/**
 * Returns the server-owned ID that ordinary directory queries must exclude.
 * Fails closed instead of exposing Administrator accounts when lifecycle
 * initialization has not completed.
 */
export const getProtectedAdministratorDirectoryExclusion = async ({ session } = {}) => {
  const state = await getSystemState({ session, lean: true });
  if (!state.protectedAdministratorId) {
    throw protectedAdministratorNotInitializedError();
  }
  return state.protectedAdministratorId;
};

/**
 * Prevents direct URL/API access from turning the ordinary user directory into
 * an alternate ownership-management surface. Protected self-service profile
 * updates remain separate and System Management handover bypasses this guard.
 */
export const assertOrdinaryUserManagementTarget = async ({ targetUser, session } = {}) => {
  if (!targetUser?._id) return;
  const state = await getSystemState({ session, lean: true });
  // Legacy/pre-migration mutation paths retain their existing role and
  // last-administrator guards. Once the binding exists, this check becomes
  // authoritative and ID-based.
  if (!state.protectedAdministratorId) return;
  if (await isProtectedAdministrator(targetUser, state)) {
    throw protectedUserManagementError();
  }
};

/**
 * Fail-closed guard shared by every ordinary account mutation path. The only
 * supported way to replace the protected administrator is the transactional
 * System Management handover service, which deliberately does not call this
 * ordinary mutation guard.
 */
export const assertAdministratorMutationAllowed = async ({
  targetUser,
  changes = {},
  session,
} = {}) => {
  if (!targetUser?._id) return;

  const resulting = getResultingAccountState(targetUser, changes);
  const targetCurrentlyAdministrator = normalizeToCanonical(targetUser.role) === 'administrator';
  const targetWouldRemainUsable = isUsableAdministrator(resulting);
  const destructiveToProtectedAccount = (
    changes.hardDelete === true
    || (Object.prototype.hasOwnProperty.call(changes, 'isDeleted') && changes.isDeleted === true)
    || (Object.prototype.hasOwnProperty.call(changes, 'isActive') && changes.isActive === false)
    || (Object.prototype.hasOwnProperty.call(changes, 'isVerified') && changes.isVerified === false)
    || (Object.prototype.hasOwnProperty.call(changes, 'status') && changes.status !== 'active')
    || (
      Object.prototype.hasOwnProperty.call(changes, 'role')
      && resulting.role !== normalizeToCanonical(targetUser.role)
    )
  );

  if (!destructiveToProtectedAccount && (!targetCurrentlyAdministrator || targetWouldRemainUsable)) {
    return;
  }

  const state = await getSystemState({ session });
  if (await isProtectedAdministrator(targetUser, state)) {
    throw protectedMutationError();
  }

  if (!targetCurrentlyAdministrator || targetWouldRemainUsable) return;

  // Once the protected binding exists, every ordinary Administrator mutation
  // can prove that a separate, usable Administrator survives. If the binding
  // has not been initialized (or no longer resolves to a usable account), fail
  // closed. This also removes the classic concurrent "two admins each see the
  // other" race that a count-only last-admin check permits.
  if (!state.protectedAdministratorId) throw lastAdministratorError();

  const protectedQuery = User.exists({
    _id: state.protectedAdministratorId,
    role: 'administrator',
    isActive: { $ne: false },
    isDeleted: { $ne: true },
    isVerified: true,
    status: 'active',
  });
  if (session) protectedQuery.session(session);
  if (!await protectedQuery) throw lastAdministratorError();

  return;
};

export default assertAdministratorMutationAllowed;
