import { useRef, useState, useSyncExternalStore } from 'react';
import { createRefreshResource } from '@/lib/refreshResource';

export function useRefreshResource<T>(initialData: T, fetchData: () => Promise<T>) {
  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
  const [resource] = useState(() => createRefreshResource(initialData, () => fetchRef.current()));
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  return { ...snapshot, refresh: resource.refresh };
}
