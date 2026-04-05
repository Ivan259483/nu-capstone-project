import User from '../models/user.model.js';
import { LEGACY_USER_ROLE_MAP } from '../constants/roles.js';

export const migrateLegacyUserRoles = async () => {
  let totalModified = 0;

  for (const [legacyRole, canonicalRole] of Object.entries(LEGACY_USER_ROLE_MAP)) {
    const result = await User.updateMany(
      { role: legacyRole },
      { $set: { role: canonicalRole } }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `[RBAC_MIGRATION] Migrated ${result.modifiedCount} users from ${legacyRole} to ${canonicalRole}`
      );
    }

    totalModified += result.modifiedCount || 0;
  }

  if (totalModified === 0) {
    console.log('[RBAC_MIGRATION] No legacy user roles found to migrate');
  }

  return totalModified;
};
