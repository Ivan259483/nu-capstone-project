export interface OperationalEpochResult {
  changed: boolean;
  previous: number | null;
  current: number;
}

export const OPERATIONAL_DATA_EPOCH_EVENT = 'autospf:operational-data-epoch-changed';
const OPERATIONAL_EPOCH_KEY = 'autospf_operational_data_epoch';
const OPERATIONAL_STORAGE_KEYS = [
  'autospf_bookings',
  'autospf_vehicles',
  'autospf_jobs',
  'autospf_inventory_usage',
  'autospf_customer_notes',
  'autospf_activity_logs',
  'pending_bookings',
  'archived_sales_backup',
  'autospf_sales_cache',
  'cached_growth',
  'autospf_active_conversation_id',
  'chat_session_id',
];
const OPERATIONAL_STORAGE_PREFIXES = [
  'inspection_',
  'autospf:scan:',
  'autogloss:latest-damage-report',
];

function clearMatching(storage: Storage): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && OPERATIONAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      storage.removeItem(key);
    }
  }
}

/**
 * Compare and persist the server-owned operational epoch. A changed epoch only
 * removes operational/offline records; auth, preferences, theme, settings,
 * service catalog, products, and supplier configuration are intentionally kept.
 */
export function syncOperationalDataEpoch(epoch: number | string): OperationalEpochResult {
  const current = Number(epoch);
  if (!Number.isFinite(current) || current < 0 || typeof window === 'undefined') {
    return { changed: false, previous: null, current: Number.isFinite(current) ? current : 0 };
  }

  const rawPrevious = window.localStorage.getItem(OPERATIONAL_EPOCH_KEY);
  const previous = rawPrevious === null ? null : Number(rawPrevious);
  const changed = previous !== null && Number.isFinite(previous) && previous !== current;

  if (changed) {
    OPERATIONAL_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    clearMatching(window.localStorage);
    clearMatching(window.sessionStorage);
    window.dispatchEvent(new CustomEvent(OPERATIONAL_DATA_EPOCH_EVENT, {
      detail: { previous, current },
    }));
  }

  window.localStorage.setItem(OPERATIONAL_EPOCH_KEY, String(current));
  return { changed, previous: Number.isFinite(previous) ? previous : null, current };
}
