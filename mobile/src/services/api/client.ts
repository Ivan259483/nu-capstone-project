import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/config/env';
import { authStorage } from '@/services/storage/authStorage';

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
  return config;
});

import { Toast } from '@/components/ui/PremiumToast';

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const config = error.config as AxiosRequestConfig & { _retryCount?: number };

    // ── Auto-retry on network errors (max 1 retry) ──────────────
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

    if (error.response?.status === 401) {
      Toast.show('Session expired. Please log in again.', 'error');
      await authStorage.clearToken();
    } else if (!error.message || error.message === 'Network Error') {
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
