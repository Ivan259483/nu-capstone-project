/**
 * Bounded-concurrency helpers.
 *
 * The Roboflow multi-view inspection path analyzes several guided vehicle
 * images in one request. Firing every upstream inference call at once spikes
 * the provider rate limit, multiplies peak memory (each decoded image plus its
 * crops), and makes timeouts unpredictable. These helpers keep a fixed number
 * of workers in flight while preserving input order in the result array.
 *
 * No third-party dependency: the backend has no promise-pool library and this
 * feature does not justify adding one.
 */

/**
 * Run `worker` over `items` with at most `limit` calls in flight at any moment.
 * Results are returned in the same order as `items`, regardless of completion
 * order. A rejected worker rejects the whole call, so callers that need partial
 * results must catch inside their own worker.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit maximum simultaneous workers (values below 1 are treated as 1)
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export const mapWithConcurrency = async (items, limit, worker) => {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) return [];

  const maxInFlight = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : source.length;
  const results = new Array(source.length);
  let nextIndex = 0;

  const runNext = async () => {
    while (nextIndex < source.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(source[index], index);
    }
  };

  const workers = [];
  for (let slot = 0; slot < Math.min(maxInFlight, source.length); slot += 1) {
    workers.push(runNext());
  }
  await Promise.all(workers);

  return results;
};

export default { mapWithConcurrency };
