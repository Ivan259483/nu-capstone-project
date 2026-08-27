/**
 * Monotonic account authentication version used to revoke existing staff JWTs.
 * Legacy accounts and tokens predate the claim and therefore belong to version 0.
 */
export const normalizeAuthVersion = (value) => {
  const version = Number(value);
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
};

export const authVersionMatches = (tokenVersion, accountVersion) =>
  normalizeAuthVersion(tokenVersion) === normalizeAuthVersion(accountVersion);

/** Global lifecycle session epoch. Legacy tokens belong to epoch zero. */
export const normalizeGlobalSessionEpoch = normalizeAuthVersion;

export const globalSessionEpochMatches = (tokenEpoch, systemEpoch) =>
  normalizeGlobalSessionEpoch(tokenEpoch) === normalizeGlobalSessionEpoch(systemEpoch);
