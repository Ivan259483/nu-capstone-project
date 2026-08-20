const responseCache = new Map();

const pruneExpiredEntries = (now) => {
  for (const [key, entry] of responseCache) {
    if (!entry.inFlight && entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }
};

export async function getOrSetResponseCache(key, ttlMs, loader) {
  const now = Date.now();
  const cached = responseCache.get(key);

  if (cached?.value !== undefined && cached.expiresAt > now) {
    return { value: cached.value, status: 'HIT' };
  }
  if (cached?.inFlight) {
    return { value: await cached.inFlight, status: 'COALESCED' };
  }

  if (responseCache.size >= 250) {
    pruneExpiredEntries(now);
    if (responseCache.size >= 250) {
      const oldestReusableKey = [...responseCache.entries()]
        .find(([, entry]) => !entry.inFlight)?.[0];
      if (oldestReusableKey) responseCache.delete(oldestReusableKey);
    }
  }

  const inFlight = Promise.resolve().then(loader);
  const pendingEntry = { inFlight, expiresAt: 0 };
  responseCache.set(key, pendingEntry);

  try {
    const value = await inFlight;
    if (responseCache.get(key) === pendingEntry) {
      responseCache.set(key, {
        value,
        expiresAt: Date.now() + Math.max(0, ttlMs),
      });
    }
    return { value, status: 'MISS' };
  } catch (error) {
    if (responseCache.get(key)?.inFlight === inFlight) {
      responseCache.delete(key);
    }
    throw error;
  }
}

export function invalidateResponseCache(prefix) {
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

export function clearResponseCache() {
  responseCache.clear();
}
