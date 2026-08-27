/**
 * Lightweight query cache with request deduplication.
 *
 * - Prevents duplicate in-flight requests to the same endpoint.
 * - Caches GET responses with a configurable TTL.
 * - Exposes `invalidate()` for real-time sync hooks to bust stale entries.
 */
import api, { getStoredAuthToken } from './api';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { OPERATIONAL_DATA_EPOCH_EVENT } from './operational-data-epoch';

// ── Cache store ──────────────────────────────────────────────────────
interface CacheEntry {
    data: any;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<AxiosResponse>>();

/**
 * Request-cache namespaces backed by operational records. An operational epoch
 * change must not evict preserved configuration such as settings, services,
 * products, or suppliers.
 */
export const OPERATIONAL_QUERY_PREFIXES = [
    '/bookings',
    '/activity',
    '/notifications',
    '/users',
    '/chat',
    '/payments',
    '/transactions',
    '/approvals',
    '/tracking',
    '/qc',
    '/documents',
    '/rewards',
    '/reports',
    '/ai',
    '/supplier-orders',
    '/inventory-ledgers',
] as const;

const requestPart = (key: string): string => {
    const separator = key.indexOf('::');
    return separator >= 0 ? key.slice(separator + 2) : key;
};

const isOperationalRequest = (key: string): boolean => {
    const requestKey = requestPart(key);
    return OPERATIONAL_QUERY_PREFIXES.some((prefix) => requestKey.startsWith(prefix));
};

let operationalCacheGeneration = 0;

if (typeof window !== 'undefined') {
    window.addEventListener(OPERATIONAL_DATA_EPOCH_EVENT, () => {
        operationalCacheGeneration += 1;
        for (const key of cache.keys()) {
            if (isOperationalRequest(key)) cache.delete(key);
        }
        // Do not let a request started before the epoch change deduplicate a
        // post-cleanup refresh. The promise still settles normally for its
        // original caller, but the generation guard below prevents recaching.
        for (const key of inflight.keys()) {
            if (isOperationalRequest(key)) inflight.delete(key);
        }
    });
}

/** Default TTL values in milliseconds */
export const TTL = {
    /** Fast-moving data (orders, bookings) — 30s deduplication window.
     *  Real-time updates are handled by WebSocket db_change events;
     *  the cache just prevents duplicate HTTP calls on page mount. */
    SHORT: 30_000,
    /** Highly dynamic badges/notification feeds — enough to collapse mount bursts. */
    LIVE: 10_000,
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
    // Scope every entry to the current JWT. This prevents cached admin/customer
    // payloads crossing an account switch in the same browser session.
    return `${getStoredAuthToken()}::${url}${params}`;
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
    const requestGeneration = operationalCacheGeneration;

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
        if (
            ttl > 0
            && (!isOperationalRequest(key) || requestGeneration === operationalCacheGeneration)
        ) {
            cache.set(key, {
                data: response.data,
                expiresAt: Date.now() + ttl,
            });
        }

        return response.data as T;
    } finally {
        // An epoch change may have detached this request and allowed a fresh
        // request for the same key to start. Never remove that newer promise.
        if (inflight.get(key) === request) inflight.delete(key);
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
        const requestKey = requestPart(key);
        if (requestKey.startsWith(prefix)) {
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
