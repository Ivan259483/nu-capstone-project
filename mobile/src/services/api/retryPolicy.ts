export const NETWORK_RETRY_LIMIT = 5;
export const NETWORK_RETRY_BASE_DELAY_MS = 2_000;
export const NETWORK_RETRY_MAX_DELAY_MS = 30_000;

/** One-based retry number: 1 => 2s, 2 => 4s, 3 => 8s, capped at 30s. */
export function getNetworkRetryDelayMs(retryNumber: number): number {
  const exponent = Math.max(0, Math.floor(retryNumber) - 1);
  return Math.min(
    NETWORK_RETRY_MAX_DELAY_MS,
    NETWORK_RETRY_BASE_DELAY_MS * (2 ** exponent),
  );
}

/** Share one active promise per key and remove it only after it settles. */
export function shareInFlightRequest<T>(
  requests: Map<string, Promise<T>>,
  key: string,
  createRequest: () => Promise<T>,
): Promise<T> {
  const existing = requests.get(key);
  if (existing) return existing;

  const request = Promise.resolve()
    .then(createRequest)
    .finally(() => {
      if (requests.get(key) === request) requests.delete(key);
    });
  requests.set(key, request);
  return request;
}
