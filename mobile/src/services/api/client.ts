import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/config/env';
import { authStorage } from '@/services/storage/authStorage';
import { enqueueRequest } from '../offlineQueue';
import { Toast } from '@/components/ui/PremiumToast';

type AuthInvalidHandler = ((details: { status: number | undefined; path: string; message: string }) => Promise<void> | void) | null;
type SystemStatusHandler = ((details: {
  status: number | undefined;
  path: string;
  message: string;
  code?: string;
}) => Promise<void> | void) | null;

let authInvalidHandler: AuthInvalidHandler = null;
let isHandlingAuthInvalid = false;
let systemStatusHandler: SystemStatusHandler = null;
let isHandlingSystemStatus = false;

/** Dedupe dev console noise when the same ngrok-miswired 404 repeats (e.g. multiple mounts). */
const ngrok404DevWarned = new Set<string>();

export const setAuthInvalidHandler = (handler: AuthInvalidHandler): void => {
  authInvalidHandler = handler;
};

export const setSystemStatusHandler = (handler: SystemStatusHandler): void => {
  systemStatusHandler = handler;
};

const AUTH_EXEMPT_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/send-otp',
  '/auth/resend-otp',
  '/auth/verify-otp',
  '/auth/verify-login-otp',
  '/auth/resend-login-otp',
  '/auth/verify-reset-otp',
  '/auth/social-login',
  '/auth/recover-firebase',
  '/auth/logout',
];

const AUTH_INVALID_MESSAGE_HINTS = [
  'user account no longer exists',
  'user no longer exists',
  'user not found',
  'invalid token',
  'token expired',
  'jwt expired',
  'jwt malformed',
  'invalid signature',
  'email verification is required to complete sign-in',
];

const AUTH_INVALID_CODES = new Set([
  'MOBILE_CUSTOMER_ONLY',
  'MOBILE_SESSION_REQUIRED',
  'ACCOUNT_INACTIVE',
  'USER_DELETED',
  'SESSION_EPOCH_REVOKED',
  'GLOBAL_SESSION_REVOKED',
  'SESSION_REVOKED',
]);

const SYSTEM_STATUS_CODES = new Set([
  'SYSTEM_ARCHIVED',
  'SYSTEM_DECOMMISSIONING',
  'SYSTEM_WRITE_LOCKED',
  'SYSTEM_MUTATION_LOCKED',
  'SYSTEM_MUTATION_IN_PROGRESS',
  'REGISTRATION_DISABLED',
  'BOOKING_DISABLED',
  'BOOKINGS_DISABLED',
]);

const shouldInvalidateAuthSession = (
  status: number | undefined,
  path: string,
  message: string,
  code?: string,
): boolean => {
  if (AUTH_EXEMPT_PATHS.some((authPath) => path.includes(authPath))) return false;
  if (code && AUTH_INVALID_CODES.has(code)) return true;
  if (status !== 401) return false;

  const lowered = message.toLowerCase();
  return AUTH_INVALID_MESSAGE_HINTS.some((hint) => lowered.includes(hint));
};

// ── Axios client ─────────────────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    // The backend binds JWTs issued through this client to the Customer Mobile
    // App and applies a live, Customer-only role check to protected requests.
    'X-Client-Type': 'mobile',
    // ngrok free tier HTML interstitial breaks non-browser clients; skip it for API calls
    'ngrok-skip-browser-warning': 'true',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await authStorage.getToken();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  if (__DEV__ && !Boolean((config as any)?.meta?.suppressExpectedErrorLog)) {
    console.log(`[API] ${(config.method || 'GET').toUpperCase()} ${config.baseURL}${config.url}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string; code?: string }>) => {
    const config = error.config as AxiosRequestConfig & { _retryCount?: number };
    const status = error.response?.status;
    const path = config?.url || '';
    const message = (error.response?.data as any)?.message || error.message || 'Unknown API error';
    const code = (error.response?.data as any)?.code;
    // Authentication bodies can contain passwords, OTPs, or opaque challenges.
    // They must never be retried into a second challenge or persisted in the
    // plaintext offline mutation queue.
    const isSensitiveAuthRequest = path.includes('/auth/');
    const invalidatesAuthSession = shouldInvalidateAuthSession(status, path, message, code);
    const systemStatusChanged = Boolean(code && SYSTEM_STATUS_CODES.has(code));
    const suppressExpectedErrorLog =
      Boolean((config as any)?.meta?.suppressExpectedErrorLog) && status === 404;

    if (invalidatesAuthSession && !isHandlingAuthInvalid) {
      isHandlingAuthInvalid = true;
      try {
        if (authInvalidHandler) {
          await authInvalidHandler({ status, path, message });
        } else {
          await authStorage.clearAll();
        }
        Toast.show('Your session is no longer valid. Please sign in again.', 'warning');
      } catch (sessionErr) {
        if (__DEV__) {
          console.warn('[API] Failed to clear invalid auth session:', sessionErr);
        }
      } finally {
        isHandlingAuthInvalid = false;
      }
    }

    if (systemStatusChanged && !isHandlingSystemStatus) {
      isHandlingSystemStatus = true;
      try {
        await systemStatusHandler?.({ status, path, message, code });
      } catch (systemErr) {
        if (__DEV__) {
          console.warn('[API] Failed to refresh system status:', systemErr);
        }
      } finally {
        isHandlingSystemStatus = false;
      }
    }

    if (__DEV__) {
      const url = `${config?.baseURL || ''}${config?.url || ''}`;
      const method = config?.method?.toLowerCase();
      const expectedOtpValidationFailure =
        method === 'post' &&
        (
          path.includes('/auth/verify-otp')
          || path.includes('/auth/verify-login-otp')
          || path.includes('/auth/verify-reset-otp')
        ) &&
        (status === 400 || status === 401 || status === 429);

      const expectedAlreadyVerifiedResendOtp =
        method === 'post' &&
        path.includes('/auth/resend-otp') &&
        status === 400 &&
        message.toLowerCase().includes('already verified');

      const isLogoutFailure =
        status === 401 &&
        method === 'post' &&
        path.includes('/auth/logout');

      const isSocialLoginMiss =
        status === 404 &&
        method === 'post' &&
        path.includes('/auth/social-login');

      // Invalid credentials, validation failures, lockouts, and rate limits are
      // expected outcomes of the login form. The screen renders these errors;
      // logging them with console.error also makes Expo show a misleading red
      // development error banner on top of the already-handled form state.
      const isExpectedLoginRejection =
        method === 'post' &&
        /\/auth\/login(?:[/?]|$)/.test(path) &&
        [400, 401, 403, 409, 423, 429].includes(status ?? 0);

      /** Express serves /api/bookings, POST /api/ai/scan, etc. 404 on these usually means the tunnel hits the wrong process (Vite/Metro) or port. */
      const isNgrokLikelyWrongTunnel404 =
        status === 404 &&
        /ngrok/i.test(String(config?.baseURL || '')) &&
        ((method === 'get' && /\/bookings\b/i.test(path)) ||
          (method === 'post' && /\/ai\/scan\b/i.test(path)) ||
          (method === 'get' && /\/ai\/scan\//i.test(path)) ||
          (method === 'post' && /\/ai\/generate-3d-from-scan\b/i.test(path)));

      if (
        invalidatesAuthSession ||
        isLogoutFailure ||
        isSocialLoginMiss ||
        isExpectedLoginRejection ||
        suppressExpectedErrorLog ||
        expectedOtpValidationFailure ||
        expectedAlreadyVerifiedResendOtp
      ) {
        // Expected edge cases: keep rejecting, but do not flood the console.
      } else if (!error.response) {
        console.warn(`[API] WARN NETWORK ${config?.method?.toUpperCase()} ${url} \u2014 ${message}`);
      } else if (isNgrokLikelyWrongTunnel404) {
        const dedupeKey = `${method}:${path.split('?')[0]}`;
        const firstTime = !ngrok404DevWarned.has(dedupeKey);
        if (firstTime) ngrok404DevWarned.add(dedupeKey);
        if (firstTime) {
          const raw = error.response?.data;
          const bodyStr =
            typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
          const ngrokOffline = /ERR_NGROK_3200|endpoint .* is offline/i.test(bodyStr);
          const hint = ngrokOffline
            ? 'ngrok hostname is offline — start a tunnel (`ngrok http <Express PORT>`) and set EXPO_PUBLIC_API_URL to the new https URL.'
            : 'tunnel likely not pointing at Express (e.g. `ngrok http 3000` where 3000 is your API port). Set EXPO_PUBLIC_API_URL to that HTTPS origin so routes like /api/bookings and /api/ai/scan exist.';
          console.warn(`[API] WARN 404 ${url} — ${hint}`);
        }
      } else {
        console.error(`[API] ERROR ${status || 'NETWORK'} ${config?.method?.toUpperCase()} ${url} \u2014 ${message}`);
      }
    }

    // \u2500\u2500 Auto-retry on network errors (max 1 retry) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    if (
      !error.response &&
      !isSensitiveAuthRequest &&
      config &&
      (config._retryCount || 0) < 1
    ) {
      config._retryCount = (config._retryCount || 0) + 1;
      // Exponential backoff: 500ms
      await new Promise((r) => setTimeout(r, 500));
      return apiClient(config);
    }

    if (!error.response && error.message === 'Network Error') {
      // ── Offline Queue Integration ────────────────────────────────
      const isMutation = ['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '');
      // Make sure we aren't enqueuing a replay of a queue operation itself
      if (
        isMutation
        && !isSensitiveAuthRequest
        && !(config as any)._isRetry
        && !(config as any)._skipOfflineQueue
      ) {
        await enqueueRequest(config);
        Toast.show('You are offline. Request saved and will sync later.', 'warning');
        // Return a mocked success for optimistic UI offline
        return Promise.resolve({ data: { success: true, offline: true } });
      }
      Toast.show('Network unavailable. Check connection.', 'error');
    }
    return Promise.reject(error);
  }
);

// ── Lightweight in-memory GET cache ──────────────────────────────────
interface CacheEntry {
  data: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();
let cacheGeneration = 0;

/** TTL presets (milliseconds) */
export const TTL = {
  /** Fast-moving data (bookings) — 10s */
  SHORT: 10_000,
  /** Semi-static data (services) — 60s */
  MEDIUM: 60_000,
} as const;

const buildKey = (url: string, config?: AxiosRequestConfig): string => {
  const params = config?.params
    ? '?' + new URLSearchParams(config.params as Record<string, string>).toString()
    : '';
  return `${url}${params}`;
};

/**
 * Cached & deduplicated GET request for the mobile client.
 * Returns `response.data` directly (no need to unwrap).
 */
export async function cachedGet<T = any>(
  url: string,
  config?: AxiosRequestConfig,
  ttl: number = TTL.SHORT
): Promise<T> {
  const key = buildKey(url, config);

  // 1. Return cached data if fresh
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data as T;
  }

  // 2. Deduplicate
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  // 3. Fire request
  const requestGeneration = cacheGeneration;
  const request = apiClient.get(url, config).then((res) => {
    // A response started for a signed-out customer must never repopulate the
    // shared cache after the next customer has begun a session.
    if (requestGeneration === cacheGeneration) {
      cache.set(key, { data: res.data, expiresAt: Date.now() + ttl });
    }
    return res.data;
  }).finally(() => {
    if (inflight.get(key) === request) inflight.delete(key);
  });

  inflight.set(key, request);
  return request as Promise<T>;
}

/** Bust cache entries matching a prefix (e.g. '/bookings') */
export function invalidateCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Drop every account-bound GET result and detach requests from the old session. */
export function clearApiCache(): void {
  cacheGeneration += 1;
  cache.clear();
  inflight.clear();
}

const OPERATIONAL_CACHE_PREFIXES = [
  '/activity',
  '/ai',
  '/bookings',
  '/chat',
  '/customers',
  '/invoices',
  '/notifications',
  '/orders',
  '/payments',
  '/qc',
  '/vehicles',
];

const isOperationalCacheKey = (key: string): boolean => (
  OPERATIONAL_CACHE_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}/`) || key.startsWith(`${prefix}?`))
);

/**
 * Drop only operational GET data after the server advances its operational
 * epoch. Catalog, service, supplier, settings, and authentication state are
 * intentionally preserved.
 */
export function clearOperationalApiCache(): void {
  cacheGeneration += 1;
  for (const key of cache.keys()) {
    if (isOperationalCacheKey(key)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (isOperationalCacheKey(key)) inflight.delete(key);
  }
}

// ── Error helpers (unchanged) ────────────────────────────────────────
export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

export const getApiStatusCode = (error: unknown): number | null => {
  if (axios.isAxiosError(error)) {
    return error.response?.status ?? null;
  }
  return null;
};
