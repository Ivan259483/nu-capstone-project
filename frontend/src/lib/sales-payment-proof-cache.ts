/**
 * Session-scoped in-memory cache of decoded payment-proof object URLs, keyed by
 * order id. Lets the Sales verification modal reopen a proof it already decoded
 * this session instantly, without re-running the base64 → Blob decode + 8s
 * timeout race in `ProofViewer`.
 *
 * `sourceKey` guards against showing a stale image if the same order's proof is
 * resubmitted mid-session (reject → customer re-uploads → sales reopens modal):
 * a cache hit only counts when the raw proof value matches what's cached.
 *
 * Kept separate from `sales-payment-proof.ts` (a small pure/stateless module) —
 * this file owns mutable cache state and object-URL lifetime instead.
 */

type CacheEntry = { objectUrl: string; sourceKey: string };

const MAX_ENTRIES = 20;
const cache = new Map<string, CacheEntry>();

export function getCachedProofObjectUrl(orderId: string, sourceValue: string): string | null {
  const entry = cache.get(orderId);
  if (entry && entry.sourceKey === sourceValue) {
    // Refresh recency (Map preserves insertion order — delete+set moves it to the end).
    cache.delete(orderId);
    cache.set(orderId, entry);
    return entry.objectUrl;
  }
  return null;
}

export function setCachedProofObjectUrl(orderId: string, sourceValue: string, objectUrl: string): void {
  const existing = cache.get(orderId);
  if (existing && existing.objectUrl !== objectUrl) URL.revokeObjectURL(existing.objectUrl);
  cache.set(orderId, { objectUrl, sourceKey: sourceValue });
  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      const oldest = cache.get(oldestKey);
      if (oldest) URL.revokeObjectURL(oldest.objectUrl);
      cache.delete(oldestKey);
    }
  }
}
