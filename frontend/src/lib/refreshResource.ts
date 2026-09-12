export type RefreshSnapshot<T> = {
  data: T;
  hasLoaded: boolean;
  isRefreshing: boolean;
  error: string | null;
};

/** One request at a time; failed refreshes retain the last successful snapshot. */
export function createRefreshResource<T>(initialData: T, fetchData: () => Promise<T>) {
  let snapshot: RefreshSnapshot<T> = {
    data: initialData, hasLoaded: false, isRefreshing: false, error: null,
  };
  let inFlight: Promise<T | undefined> | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<RefreshSnapshot<T>>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh: (): Promise<T | undefined> => {
      if (inFlight) return inFlight;
      inFlight = Promise.resolve().then(fetchData).then((data) => {
        publish({ data, hasLoaded: true, error: null });
        return data;
      }).catch((error: unknown) => {
        publish({ error: error instanceof Error ? error.message : 'Refresh failed.' });
        return undefined;
      }).finally(() => {
        inFlight = null;
        publish({ isRefreshing: false });
      });
      publish({ isRefreshing: true, error: null });
      return inFlight;
    },
  };
}
