/**
 * Lightweight query cache with request deduplication.
 *
 * - Prevents duplicate in-flight requests to the same endpoint.
 * - Caches GET responses with a configurable TTL.
 * - Exposes `invalidate()` for real-time sync hooks to bust stale entries.
 */
import api from './api';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

// ── Cache store ──────────────────────────────────────────────────────
interface CacheEntry {
    data: any;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<AxiosResponse>>();

/** Default TTL values in milliseconds */
export const TTL = {
    /** Fast-moving data (orders, bookings) — 5 seconds */
    SHORT: 5_000,
    /** Semi-static data (services, products) — 30 seconds */
    MEDIUM: 30_000,
    /** Rarely changing data (settings, categories) — 60 seconds */
    LONG: 60_000,
} as const;

// ── Cache key builder ────────────────────────────────────────────────
const buildKey = (url: string, config?: AxiosRequestConfig): string => {
    const params = config?.params
        ? '?' + new URLSearchParams(config.params as Record<string, string>).toString()
        : '';
    return `${url}${params}`;
};

// ── Core: Cached & deduplicated GET ─────────────────────────────────
/**
 * Perform a GET request with deduplication and caching.
 *
 * @param url    - API path (e.g. '/bookings')
 * @param config - Optional axios request config (params, headers, etc.)
 * @param ttl    - Cache TTL in ms. Pass 0 to skip caching.
 */
export async function cachedGet<T = any>(
    url: string,
    config?: AxiosRequestConfig & { meta?: Record<string, any> },
    ttl: number = TTL.SHORT
): Promise<T> {
    const key = buildKey(url, config);

    // 1. Return cached data if fresh
    if (ttl > 0) {
        const entry = cache.get(key);
        if (entry && Date.now() < entry.expiresAt) {
            return entry.data as T;
        }
    }

    // 2. Deduplicate: if an identical request is already in-flight, await it
    const existing = inflight.get(key);
    if (existing) {
        const response = await existing;
        return response.data as T;
    }

    // 3. Fire the actual request
    const request = api.get(url, config);
    inflight.set(key, request);

    try {
        const response = await request;

        // 4. Store in cache
        if (ttl > 0) {
            cache.set(key, {
                data: response.data,
                expiresAt: Date.now() + ttl,
            });
        }

        return response.data as T;
    } finally {
        inflight.delete(key);
    }
}

// ── Invalidation helpers ──────────────────────────────────────────────

/**
 * Invalidate cache entries whose key starts with the given prefix.
 * Call this when a mutation occurs or a real-time change is detected.
 *
 * @example invalidate('/bookings');  // clears all /bookings?... caches
 */
export function invalidate(prefix: string): void {
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
}

/**
 * Invalidate everything (e.g. on logout or full data refresh).
 */
export function invalidateAll(): void {
    cache.clear();
}

/**
 * Number of currently cached entries (useful for devtools/debugging).
 */
export function cacheSize(): number {
    return cache.size;
}
