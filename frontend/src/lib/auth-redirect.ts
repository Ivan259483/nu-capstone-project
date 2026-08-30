import {
  CUSTOMER_ROLE,
  getDashboardPathForRole,
  normalizeToCanonical,
} from './roles.ts';

export const LOGIN_PATH = '/login';
export const CUSTOMER_DASHBOARD_PATH = '/customer/dashboard';
export const CUSTOMER_BOOKING_PATH = '/customer/book';
export const LEGACY_BOOKING_PATH = '/booking';
export const LOGIN_REDIRECT_STORAGE_KEY = 'redirect_after_login';

const INTERNAL_ORIGIN = 'https://autospf.local';
const APPROVED_CUSTOMER_REDIRECT_PATHS = new Set([
  CUSTOMER_DASHBOARD_PATH,
  CUSTOMER_BOOKING_PATH,
]);

type RedirectStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Accept only approved customer destinations; external and staff routes fail closed. */
export function getSafeLoginRedirect(value: string | null | undefined): string {
  if (!value) return '';
  let candidate = value.trim();
  if (!candidate) return '';

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    return '';
  }

  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '';
  }

  try {
    const parsed = new URL(candidate, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN || !APPROVED_CUSTOMER_REDIRECT_PATHS.has(parsed.pathname)) {
      return '';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
}

export function isBookingIntentRedirect(value: string | null | undefined): boolean {
  return getSafeLoginRedirect(value).split(/[?#]/, 1)[0] === CUSTOMER_BOOKING_PATH;
}

export function getBookingLoginPath(): string {
  return `${LOGIN_PATH}?redirect=${CUSTOMER_BOOKING_PATH}`;
}

/** Shared destination for every public Book Now / Reserve CTA. */
export function getBookingEntryPath(role: string | null | undefined): string {
  const safeRole = normalizeToCanonical(role);
  if (!safeRole) return getBookingLoginPath();
  return safeRole === CUSTOMER_ROLE
    ? CUSTOMER_BOOKING_PATH
    : getDashboardPathForRole(safeRole);
}

export function getAccountEntryPath(role: string | null | undefined): string {
  const safeRole = normalizeToCanonical(role);
  return safeRole ? getDashboardPathForRole(safeRole) : LOGIN_PATH;
}

export function appendPostLoginRedirect(path: string, redirect: string | null | undefined): string {
  const safeRedirect = getSafeLoginRedirect(redirect);
  if (!safeRedirect) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}redirect=${encodeURIComponent(safeRedirect)}`;
}

export function persistPostLoginRedirect(
  requestedRedirect: string | null | undefined,
  storage: RedirectStorage,
): string {
  const safeRedirect = getSafeLoginRedirect(requestedRedirect);
  if (safeRedirect) storage.setItem(LOGIN_REDIRECT_STORAGE_KEY, safeRedirect);
  else storage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
  return safeRedirect;
}

export function resolvePostAuthDestination(
  requestedRedirect: string | null | undefined,
  role: string | null | undefined,
): string {
  const safeRole = normalizeToCanonical(role);
  const safeRedirect = getSafeLoginRedirect(requestedRedirect);
  if (!safeRole) return CUSTOMER_DASHBOARD_PATH;
  if (safeRole === CUSTOMER_ROLE && safeRedirect) return safeRedirect;
  return getDashboardPathForRole(safeRole);
}

export function consumePostLoginRedirect(
  explicitRedirect: string | null | undefined,
  storage: RedirectStorage,
  role: string | null | undefined,
): string {
  const requestedRedirect = getSafeLoginRedirect(explicitRedirect)
    || getSafeLoginRedirect(storage.getItem(LOGIN_REDIRECT_STORAGE_KEY));
  storage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
  return resolvePostAuthDestination(requestedRedirect, role);
}
