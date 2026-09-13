import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createAccountPreferenceStore, type PreferenceAdapter } from '@/lib/account-preference-store';

export function useAccountPreferences<T extends object>(accountId: string, adapter: PreferenceAdapter<T>) {
  // Account identity must replace the queue even though the API adapter is shared.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => createAccountPreferenceStore(adapter), [accountId, adapter]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    if (accountId) void store.load();
    return () => store.dispose();
  }, [accountId, store]);
  return { ...state, update: store.update, retry: store.load };
}
