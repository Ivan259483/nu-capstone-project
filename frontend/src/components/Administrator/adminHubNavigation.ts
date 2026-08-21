export const ADMIN_HUB_ROUTABLE_TAB_IDS = new Set([
  'dashboard',
  'notifications',
  'scheduling',
  'live_tracking',
  'pricing',
  'inventory',
  'users',
  'roles',
  'logs',
  'profile',
]);

const NOTIFICATION_CONTEXT_PARAMS = [
  'orderId',
  'paymentId',
  'productId',
  'bookingReference',
  'panel',
];

/** Resolve the rendered Admin Hub page exclusively from the router location. */
export function resolveAdminHubPage(search: string, isQualityChecker = false): string {
  const requestedTab = new URLSearchParams(search).get('tab');

  if (isQualityChecker) {
    return requestedTab === 'profile' ? 'profile' : 'live_tracking';
  }

  return requestedTab && ADMIN_HUB_ROUTABLE_TAB_IDS.has(requestedTab)
    ? requestedTab
    : 'dashboard';
}

type CreateAdminHubLocationOptions = {
  pathname: string;
  search: string;
  tabId: string;
  clearNotificationContext?: boolean;
};

/**
 * Build one canonical router location for an Admin Hub page transition.
 * Admin Hub tabs live in `?tab=`; legacy dashboard hashes must never compete
 * with that query parameter.
 */
export function createAdminHubLocation({
  pathname,
  search,
  tabId,
  clearNotificationContext = false,
}: CreateAdminHubLocationOptions): { pathname: string; search: string; hash: string } {
  const nextParams = new URLSearchParams(search);

  if (clearNotificationContext) {
    NOTIFICATION_CONTEXT_PARAMS.forEach((key) => nextParams.delete(key));
  }

  if (ADMIN_HUB_ROUTABLE_TAB_IDS.has(tabId)) {
    nextParams.set('tab', tabId);
  } else {
    nextParams.delete('tab');
  }

  const nextQuery = nextParams.toString();
  return {
    pathname,
    search: nextQuery ? `?${nextQuery}` : '',
    hash: '',
  };
}
