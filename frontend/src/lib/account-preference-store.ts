export interface PreferenceAdapter<T extends object> {
  load: () => Promise<T>;
  save: (patch: Partial<T>) => Promise<T>;
}

export interface PreferenceSnapshot<T extends object> {
  value: T | null;
  confirmed: T | null;
  loading: boolean;
  saving: boolean;
  error: string;
  saved: boolean;
}

/** One serialized write queue per account and preference resource. */
export function createAccountPreferenceStore<T extends object>(adapter: PreferenceAdapter<T>) {
  let state: PreferenceSnapshot<T> = { value: null, confirmed: null, loading: true, saving: false, error: '', saved: false };
  let generation = 0;
  let active = false;
  let runningGeneration: number | null = null;
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<PreferenceSnapshot<T>>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const difference = (desired: T, confirmed: T) => Object.fromEntries(
    (Object.keys(desired) as (keyof T)[]).filter((key) => desired[key] !== confirmed[key]).map((key) => [key, desired[key]]),
  ) as Partial<T>;
  const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not save your preferences. Please try again.';

  async function flush() {
    const currentGeneration = generation;
    if (!active || runningGeneration === currentGeneration || !state.value || !state.confirmed) return;
    runningGeneration = currentGeneration;
    while (active && generation === currentGeneration && state.value && state.confirmed) {
      const submitted = { ...state.value };
      const patch = difference(submitted, state.confirmed);
      if (!Object.keys(patch).length) break;
      emit({ saving: true, saved: false });
      try {
        const confirmed = await adapter.save(patch);
        if (!active || generation !== currentGeneration) return;
        emit({ confirmed, saved: true });
      } catch (error) {
        if (!active || generation !== currentGeneration) return;
        const value = { ...state.value };
        // Roll back failed intent, retaining any newer edits made during this request.
        for (const key of Object.keys(patch) as (keyof T)[]) {
          if (value[key] === submitted[key]) value[key] = state.confirmed[key];
        }
        emit({ value, error: errorMessage(error), saved: false });
      }
    }
    if (generation === currentGeneration) {
      runningGeneration = null;
      emit({ saving: false });
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      active = true;
      const currentGeneration = ++generation;
      emit({ loading: true, saving: false, error: '', saved: false, value: null, confirmed: null });
      try {
        const value = await adapter.load();
        if (active && generation === currentGeneration) emit({ value, confirmed: value, loading: false });
      } catch (error) {
        if (active && generation === currentGeneration) emit({ loading: false, error: errorMessage(error) });
      }
    },
    update(patch: Partial<T>) {
      if (!active || state.loading || !state.value) return;
      emit({ value: { ...state.value, ...patch }, error: '', saved: false });
      void flush();
    },
    dispose() { active = false; generation++; },
  };
}
