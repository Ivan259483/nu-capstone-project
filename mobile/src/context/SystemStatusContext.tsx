import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { clearOperationalApiCache, setSystemStatusHandler } from '@/services/api/client';
import {
  DEFAULT_SYSTEM_STATUS,
  type PublicSystemStatus,
  systemStatusService,
} from '@/services/api/systemStatusService';
import { clearOperationalQueue } from '@/services/offlineQueue';

const STATUS_STORAGE_KEY = '@autospf_system_status';
const EPOCH_STORAGE_KEY = '@autospf_operational_data_epoch';
const STATUS_REFRESH_MS = 60_000;
const OPERATIONAL_QUERY_KEYS = new Set([
  'booking',
  'bookings',
  'my-vehicles',
  'vehicles',
  'qc',
  'notifications',
  'activity',
  'chat',
]);

type SystemStatusContextValue = {
  status: PublicSystemStatus;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const SystemStatusContext = createContext<SystemStatusContextValue>({
  status: DEFAULT_SYSTEM_STATUS,
  loading: true,
  refreshing: false,
  error: null,
  refresh: async () => {},
});

export const useSystemStatus = () => useContext(SystemStatusContext);

export function SystemStatusProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(DEFAULT_SYSTEM_STATUS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);

  const applyStatus = useCallback(async (next: PublicSystemStatus) => {
    const storedEpochRaw = await AsyncStorage.getItem(EPOCH_STORAGE_KEY);
    const storedEpoch = storedEpochRaw == null ? null : Number(storedEpochRaw);

    if (storedEpoch != null && Number.isFinite(storedEpoch) && storedEpoch !== next.operationalDataEpoch) {
      queryClient.removeQueries({
        predicate: (query) => OPERATIONAL_QUERY_KEYS.has(String(query.queryKey[0] || '')),
      });
      clearOperationalApiCache();
      await clearOperationalQueue();
    }

    await AsyncStorage.multiSet([
      [STATUS_STORAGE_KEY, JSON.stringify(next)],
      [EPOCH_STORAGE_KEY, String(next.operationalDataEpoch)],
    ]);
    setStatus(next);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    const request = (async () => {
      setRefreshing(true);
      try {
        const next = await systemStatusService.getStatus();
        await applyStatus(next);
        setError(null);
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Unable to check system status.');
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    })();
    refreshPromise.current = request.finally(() => {
      refreshPromise.current = null;
    });
    return refreshPromise.current;
  }, [applyStatus]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(STATUS_STORAGE_KEY);
        if (cached && mounted) setStatus({ ...DEFAULT_SYSTEM_STATUS, ...JSON.parse(cached) });
      } catch {
        // Invalid cache is replaced by the authoritative request below.
      }
      if (mounted) await refresh();
    })();

    setSystemStatusHandler(async () => refresh());
    const interval = setInterval(() => void refresh(), STATUS_REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      subscription.remove();
      setSystemStatusHandler(null);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ status, loading, refreshing, error, refresh }),
    [status, loading, refreshing, error, refresh],
  );

  return <SystemStatusContext.Provider value={value}>{children}</SystemStatusContext.Provider>;
}
