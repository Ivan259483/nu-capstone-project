/**
 * Per-taskId poll generation counter.
 *
 * Two things can leave an old Meshy status-poll loop running after it should
 * have stopped: a screen remount (the previous mount's loop was never
 * cancelled) or a forced regenerate that starts a fresh task while the old
 * loop is still mid-request. Either way, the OLDER loop must not go on
 * writing progress into shared state once a NEWER poll for the same task
 * (or the same screen) has taken over.
 *
 * Every `beginPollGeneration(taskId)` call bumps that taskId's counter and
 * returns the new value. A loop holds on to the value it got when it
 * started; `isCurrentPollGeneration(taskId, generation)` tells it whether it
 * is still the latest — once a newer call bumps the counter, the older
 * loop's checks return false and it should stop applying updates.
 *
 * Kept as a standalone, side-effect-free (besides the Map) module so it can
 * be unit tested without pulling in the full API client / React Native
 * runtime that aiService.ts otherwise depends on.
 */

const generations = new Map<string, number>();

export const beginPollGeneration = (taskId: string): number => {
  const next = (generations.get(taskId) || 0) + 1;
  generations.set(taskId, next);
  return next;
};

export const isCurrentPollGeneration = (taskId: string, generation: number): boolean =>
  generations.get(taskId) === generation;

/** Test-only: clears tracked generations so specs don't leak state between cases. */
export const resetPollGenerations = (): void => {
  generations.clear();
};
