import type { SalesAnalyticsReport } from '../types/salesAnalytics';

type Get = (path: string, options: any) => Promise<{ data: any }>;

const ledgerRows = (body: any): any[] => {
  if (body?.success !== true || !Array.isArray(body.data)) {
    throw new Error('The ledger returned an invalid response.');
  }
  return body.data;
};

export async function fetchSalesLedger(get: Get): Promise<any[]> {
  const page = (number: number) => get('/payments', {
    params: { page: number, limit: 100, sortBy: 'effectiveAt', sortOrder: 'desc' },
    meta: { suppressErrorToast: true },
  });
  const first = await page(1);
  const rows = ledgerRows(first.data);
  const pages = Number(first.data.pagination?.pages ?? 1);
  if (!Number.isSafeInteger(pages) || pages < 1) throw new Error('The ledger returned invalid pagination.');
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => page(index + 2)));
  // Publish only after every page succeeds; a partial ledger is not a snapshot.
  return rows.concat(...rest.map((response) => ledgerRows(response.data)));
}

export async function fetchSalesDashboard(get: Get): Promise<SalesAnalyticsReport> {
  const response = await get('/sales-analytics/report', {
    params: { range: '30d', serviceMetric: 'orders' },
    meta: { suppressErrorToast: true },
  });
  const data = response.data?.data;
  const numericFields = (record: any, keys: string[]) => keys.every((key) => typeof record?.[key] === 'number' && Number.isFinite(record[key]));
  if (response.data?.success !== true || !data?.range
    || !numericFields(data.kpis, ['netCollectedRevenue', 'bookedSalesValue', 'confirmedOrders', 'averageOrderValue', 'uniqueCustomers'])
    || !numericFields(data.secondary, ['pendingVerification', 'pendingVerificationCount', 'reservationFeesCollected', 'refunds', 'refundCount', 'cancellations', 'outstandingBalance'])
    || !['revenueTrend', 'serviceMix', 'paymentMethods', 'topServices'].every((key) => Array.isArray(data[key]))) {
    throw new Error('The sales report returned an invalid response.');
  }
  return data as SalesAnalyticsReport;
}

export function parsePickupQueueResponse(response: any): any[] {
  if (response?.success !== true || !Array.isArray(response.data)) {
    throw new Error('The pickup queue returned an invalid response.');
  }
  return response.data.filter((order: any) => order.paymentStatus !== 'paid');
}
