import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/config/env';
import { authStorage } from '@/services/storage/authStorage';
import { enqueueRequest } from '../offlineQueue';
import { Toast } from '@/components/ui/PremiumToast';

type AuthInvalidHandler = ((details: { status: number | undefined; path: string; message: string }) => Promise<void> | void) | null;

let authInvalidHandler: AuthInvalidHandler = null;
let isHandlingAuthInvalid = false;

export const setAuthInvalidHandler = (handler: AuthInvalidHandler): void => {
  authInvalidHandler = handler;
};

const AUTH_EXEMPT_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/send-otp',
  '/auth/resend-otp',
  '/auth/verify-otp',
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
];

const shouldInvalidateAuthSession = (
  status: number | undefined,
  path: string,
  message: string
): boolean => {
  if (status !== 401) return false;
  if (AUTH_EXEMPT_PATHS.some((authPath) => path.includes(authPath))) return false;

  const lowered = message.toLowerCase();
  return AUTH_INVALID_MESSAGE_HINTS.some((hint) => lowered.includes(hint));
};

// ── Axios client ─────────────────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await authStorage.getToken();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  if (__DEV__) {
    console.log(`[API] ${(config.method || 'GET').toUpperCase()} ${config.baseURL}${config.url}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const config = error.config as AxiosRequestConfig & { _retryCount?: number };
    const status = error.response?.status;
    const path = config?.url || '';
    const message = (error.response?.data as any)?.message || error.message || 'Unknown API error';
    const invalidatesAuthSession = shouldInvalidateAuthSession(status, path, message);

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

    if (__DEV__) {
      const url = `${config?.baseURL || ''}${config?.url || ''}`;
      const method = config?.method?.toLowerCase();

      const isLogoutFailure =
        status === 401 &&
        method === 'post' &&
        path.includes('/auth/logout');

      const isSocialLoginMiss =
        status === 404 &&
        method === 'post' &&
        path.includes('/auth/social-login');

      if (invalidatesAuthSession || isLogoutFailure || isSocialLoginMiss) {
        // Expected auth edge cases: keep rejecting, but do not flood the console.
      } else if (!error.response) {
        console.warn(`[API] WARN NETWORK ${config?.method?.toUpperCase()} ${url} \u2014 ${message}`);
      } else {
        console.error(`[API] ERROR ${status || 'NETWORK'} ${config?.method?.toUpperCase()} ${url} \u2014 ${message}`);
      }
    }

    // \u2500\u2500 Auto-retry on network errors (max 1 retry) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    if (
      !error.response &&
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
      if (isMutation && !(config as any)._isRetry) {
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
  const request = apiClient.get(url, config).then((res) => {
    cache.set(key, { data: res.data, expiresAt: Date.now() + ttl });
    return res.data;
  }).finally(() => {
    inflight.delete(key);
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
