import assert from 'node:assert/strict';
import test from 'node:test';
import { createRefreshResource } from '../src/lib/refreshResource.ts';
import { fetchSalesDashboard, fetchSalesLedger, parsePickupQueueResponse } from '../src/lib/salesSync.ts';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const emptyReport = {
  range: { key: '30d' },
  kpis: { netCollectedRevenue: 0, bookedSalesValue: 0, confirmedOrders: 0, averageOrderValue: 0, uniqueCustomers: 0 },
  secondary: { pendingVerification: 0, pendingVerificationCount: 0, reservationFeesCollected: 0, refunds: 0, refundCount: 0, cancellations: 0, outstandingBalance: 0 },
  revenueTrend: [], serviceMix: [], paymentMethods: [], topServices: [],
};

test('a successful report becomes visible while the ledger is pending and survives a ledger timeout', async () => {
  const ledgerRequest = deferred<any>();
  const get = async (path: string) => path === '/payments' ? ledgerRequest.promise : { data: { success: true, data: { ...emptyReport, kpis: { ...emptyReport.kpis, netCollectedRevenue: 33498 } } } };
  const ledger = createRefreshResource<any[]>([], () => fetchSalesLedger(get));
  const report = createRefreshResource<any>(null, () => fetchSalesDashboard(get));
  const pendingLedger = ledger.refresh();
  await report.refresh();
  assert.equal(report.getSnapshot().hasLoaded, true);
  assert.equal(report.getSnapshot().isRefreshing, false);
  assert.equal(report.getSnapshot().data.kpis.netCollectedRevenue, 33498);
  assert.equal(ledger.getSnapshot().isRefreshing, true);
  ledgerRequest.reject(new Error('timeout of 45000ms exceeded'));
  await pendingLedger;
  assert.match(ledger.getSnapshot().error || '', /timeout/);
  assert.equal(ledger.getSnapshot().hasLoaded, false);
  assert.equal(ledger.getSnapshot().isRefreshing, false);
  assert.equal(report.getSnapshot().error, null);
  assert.equal(report.getSnapshot().data.kpis.netCollectedRevenue, 33498);
});

test('overlapping queue refreshes coalesce, retain Kevin during refresh/error, and recover', async () => {
  const kevin = { orderId: 'kevin-order', customerName: 'kevin', remainingBalance: 7499, paymentStatus: 'partially_paid' };
  let calls = 0;
  let next = Promise.resolve({ success: true, data: [kevin] });
  const resource = createRefreshResource<any[]>([], async () => { calls += 1; return parsePickupQueueResponse(await next); });
  await resource.refresh();
  const pending = deferred<any>();
  next = pending.promise;
  const first = resource.refresh();
  const overlaps = Array.from({ length: 12 }, () => resource.refresh());
  assert.ok(overlaps.every((request) => request === first));
  assert.equal(resource.getSnapshot().data[0].remainingBalance, 7499);
  assert.equal(resource.getSnapshot().isRefreshing, true);
  pending.reject(new Error('Network Error'));
  await first;
  assert.equal(calls, 2);
  assert.equal(resource.getSnapshot().isRefreshing, false);
  assert.equal(resource.getSnapshot().error, 'Network Error');
  assert.deepEqual(resource.getSnapshot().data, [kevin]);
  next = Promise.resolve({ success: true, data: [kevin] });
  await resource.refresh();
  assert.equal(resource.getSnapshot().error, null);
  assert.deepEqual(resource.getSnapshot().data, [kevin]);
  next = Promise.resolve({ success: true, data: [] });
  await resource.refresh();
  assert.equal(resource.getSnapshot().hasLoaded, true);
  assert.deepEqual(resource.getSnapshot().data, [], 'a successful empty queue really clears old entries');
});

test('failure of any ledger page keeps the complete previous ledger and allows retry', async () => {
  let fail = false;
  const get = async (_path: string, options: any) => {
    if (options.params.page === 2 && fail) throw new Error('HTTP 503');
    return { data: { success: true, data: [{ paymentId: `p${options.params.page}`, signedAmount: options.params.page === 1 ? 500 : -200 }], pagination: { pages: 2 } } };
  };
  const ledger = createRefreshResource<any[]>([], () => fetchSalesLedger(get));
  await ledger.refresh();
  const previous = ledger.getSnapshot().data;
  assert.equal(previous.reduce((sum, row) => sum + row.signedAmount, 0), 300);
  fail = true;
  await ledger.refresh();
  assert.equal(ledger.getSnapshot().data, previous);
  assert.equal(ledger.getSnapshot().hasLoaded, true);
  assert.equal(ledger.getSnapshot().error, 'HTTP 503');
  fail = false;
  await ledger.refresh();
  assert.equal(ledger.getSnapshot().error, null);
});

test('200 with no/invalid payload is an error; genuine empty reports and ledgers are successful', async () => {
  for (const body of [undefined, null, '', {}, { success: false, data: [] }, { success: true, data: null }]) {
    const get = async () => ({ data: body });
    await assert.rejects(fetchSalesLedger(get), /invalid response/);
    await assert.rejects(fetchSalesDashboard(get), /invalid response/);
    assert.throws(() => parsePickupQueueResponse(body), /invalid response/);
  }
  await assert.rejects(fetchSalesDashboard(async () => ({ data: { success: true, data: { ...emptyReport, kpis: {} } } })), /invalid response/);
  assert.deepEqual(await fetchSalesLedger(async () => ({ data: { success: true, data: [], pagination: { pages: 1 } } })), []);
  assert.deepEqual(await fetchSalesDashboard(async () => ({ data: { success: true, data: emptyReport } })), emptyReport);
});

test('a report refresh failure retains prior metrics and does not affect the ledger', async () => {
  let fail = false;
  const report = createRefreshResource<any>(null, async () => {
    if (fail) throw new Error('HTTP 500');
    return fetchSalesDashboard(async () => ({ data: { success: true, data: emptyReport } }));
  });
  const ledger = createRefreshResource<any[]>([], async () => [{ paymentId: 'p1', signedAmount: 500 }]);
  await Promise.all([report.refresh(), ledger.refresh()]);
  const previous = report.getSnapshot().data;
  fail = true;
  await Promise.all([report.refresh(), ledger.refresh()]);
  assert.equal(report.getSnapshot().data, previous);
  assert.equal(report.getSnapshot().error, 'HTTP 500');
  assert.equal(ledger.getSnapshot().error, null);
  assert.equal(ledger.getSnapshot().data[0].signedAmount, 500);
});
