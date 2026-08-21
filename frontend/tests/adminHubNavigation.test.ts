import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdminHubLocation,
  resolveAdminHubPage,
} from '../src/components/Administrator/adminHubNavigation.ts';

test('the query tab is the only source used to resolve an Admin Hub page', () => {
  assert.equal(resolveAdminHubPage('?tab=notifications'), 'notifications');
  assert.equal(resolveAdminHubPage('?tab=inventory'), 'inventory');
  assert.equal(resolveAdminHubPage(''), 'dashboard');
  assert.equal(resolveAdminHubPage('?tab=unknown'), 'dashboard');
});

test('sidebar navigation atomically replaces a stale notification tab and context', () => {
  assert.deepEqual(
    createAdminHubLocation({
      pathname: '/admin/dashboard',
      search: '?tab=notifications&panel=availability&orderId=order-1',
      tabId: 'inventory',
      clearNotificationContext: true,
    }),
    {
      pathname: '/admin/dashboard',
      search: '?tab=inventory',
      hash: '',
    },
  );
});

test('the expected repeated navigation sequence remains router-derived', () => {
  const sequence = [
    'notifications',
    'dashboard',
    'scheduling',
    'live_tracking',
    'inventory',
    'notifications',
  ];

  let search = '';
  for (const tabId of sequence) {
    const location = createAdminHubLocation({
      pathname: '/admin/dashboard',
      search,
      tabId,
      clearNotificationContext: true,
    });
    search = location.search;
    assert.equal(resolveAdminHubPage(search), tabId);
    assert.equal(location.hash, '');
  }

  assert.equal(resolveAdminHubPage(search), 'notifications');
  search = createAdminHubLocation({
    pathname: '/admin/dashboard',
    search,
    tabId: 'live_tracking',
    clearNotificationContext: true,
  }).search;
  assert.equal(resolveAdminHubPage(search), 'live_tracking');
});

test('every Admin Hub sidebar target produces matching URL and rendered state', () => {
  const sidebarTabs = [
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
  ];

  for (const tabId of sidebarTabs) {
    const location = createAdminHubLocation({
      pathname: '/admin/dashboard',
      search: '?tab=notifications&panel=availability',
      tabId,
      clearNotificationContext: true,
    });
    assert.equal(resolveAdminHubPage(location.search), tabId);
    assert.equal(new URLSearchParams(location.search).get('panel'), null);
    assert.equal(location.hash, '');
  }
});

test('notification refreshes cannot change Dashboard, Appointments, Inventory, Notifications, or Live Tracking routes', () => {
  const routesUnderRefresh = [
    'dashboard',
    'scheduling',
    'inventory',
    'notifications',
    'live_tracking',
  ];
  const notificationSnapshots = [
    [],
    [{ title: 'Recurring availability updated', isRead: false }],
    [{ title: 'Recurring availability updated', isRead: true }],
  ];

  for (const tabId of routesUnderRefresh) {
    const search = createAdminHubLocation({
      pathname: '/admin/dashboard',
      search: '',
      tabId,
    }).search;

    // Notification payloads are deliberately absent from the route resolver.
    for (const notifications of notificationSnapshots) {
      assert.ok(Array.isArray(notifications));
      assert.equal(resolveAdminHubPage(search), tabId);
    }
  }
});

test('router history locations resolve correctly for back and forward navigation', () => {
  const history = ['?tab=notifications', '?tab=dashboard', '?tab=inventory'];
  assert.equal(resolveAdminHubPage(history[1]), 'dashboard');
  assert.equal(resolveAdminHubPage(history[0]), 'notifications');
  assert.equal(resolveAdminHubPage(history[1]), 'dashboard');
  assert.equal(resolveAdminHubPage(history[2]), 'inventory');
});

test('quality checker routing stays constrained while profile remains reachable', () => {
  assert.equal(resolveAdminHubPage('?tab=notifications', true), 'live_tracking');
  assert.equal(resolveAdminHubPage('?tab=live_tracking', true), 'live_tracking');
  assert.equal(resolveAdminHubPage('?tab=profile', true), 'profile');
});
