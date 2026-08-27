import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import { getSharedSocket } from './useRealtimeSync';
import type { PaymentMethod, Transaction, TransactionStatus } from '@/lib/salesData';
import { isEncryptedPlateToken, normalizePaymentMethod } from '@/lib/salesData';
import type { SalesAnalyticsReport } from '@/types/salesAnalytics';

export type { PaymentMethod, Transaction, TransactionStatus };

const asRecord = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const money = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const canonicalStatus = (row: any): TransactionStatus => {
  const status = String(row.paymentStatus || row.status || '').toLowerCase();
  if (status === 'pending') return 'pending';
  if (row.transactionType === 'refund' && ['refunded', 'succeeded'].includes(status)) return 'completed';
  if (status === 'succeeded') return 'completed';
  if (['rejected', 'failed', 'voided'].includes(status)) return 'voided';
  return 'processing';
};

export const mapLedgerTransaction = (row: any): Transaction => {
  const order = asRecord(row.order);
  const customer = asRecord(row.customer);
  const vehicle = asRecord(row.vehicle);
  const plateRaw = String(row.vehiclePlate || order.vehiclePlate || vehicle.plateNumber || '').trim();
  const submittedAt = String(row.submittedAt || row.createdAt || new Date().toISOString());
  const effectiveAt = row.effectiveAt ? String(row.effectiveAt) : undefined;
  const signedAmount = money(row.signedAmount);
  const amountSubmitted = Math.abs(money(row.amountSubmitted ?? row.amount));
  const amountVerified = Math.abs(money(row.amountVerified ?? row.amountPaid));
  const services = Array.isArray(row.services) && row.services.length
    ? row.services.map((service: any) => ({
        name: String(service?.name || 'Service'),
        price: money(service?.price),
        qty: Math.max(1, money(service?.qty) || 1),
      }))
    : [{ name: String(order.serviceType || 'Service'), price: money(row.serviceTotal), qty: 1 }];

  return {
    id: String(row.transactionId || row.invoiceId || row.paymentId || row._id || ''),
    paymentId: String(row.paymentId || row._id || ''),
    orderId: String(row.orderId || order._id || ''),
    orderNumber: row.orderNumber || order.orderNumber,
    bookingReference: row.bookingReference || order.bookingReference,
    bookingId: row.bookingId || order.bookingReference || order.orderNumber || row.orderId,
    invoiceId: row.invoiceId,
    customerId: String(row.customerId || customer._id || 'historical'),
    customerName: String(row.customerName || customer.name || order.customerName || 'Historical customer'),
    customerPhone: String(row.customerPhone || customer.phone || order.customerPhone || ''),
    customerEmail: String(row.customerEmail || customer.email || ''),
    vehiclePlate: plateRaw && !isEncryptedPlateToken(plateRaw) ? plateRaw.toUpperCase() : '—',
    vehicleInfo: String(row.vehicleInfo || [order.vehicleYear || vehicle.year, order.vehicleMake || vehicle.make, order.vehicleModel || vehicle.model].filter(Boolean).join(' ')),
    services,
    subtotal: money(row.subtotal),
    discount: money(row.discountAmount),
    tax: money(row.taxVatAmount),
    additionalFees: money(row.additionalFees),
    serviceTotal: money(row.serviceTotal ?? row.grandTotal),
    amountCollected: signedAmount,
    balanceRemaining: money(row.outstandingBalance ?? row.balanceRemaining),
    total: signedAmount || amountSubmitted,
    transactionType: row.transactionType || 'full_service_payment',
    bookingStatus: row.bookingStatus || order.status,
    amountSubmitted,
    amountVerified,
    signedAmount,
    paymentStatus: row.paymentStatus || row.status,
    submittedAt,
    effectiveAt,
    refundableBalance: Math.max(0, money(row.refundableBalance)),
    relatedPaymentId: row.relatedPaymentId || undefined,
    paymentMethod: normalizePaymentMethod(row.method),
    status: canonicalStatus(row),
    statusRaw: row.paymentStatus || row.status,
    dateTime: effectiveAt || submittedAt,
    analyticsDateTime: effectiveAt || submittedAt,
    paidAt: effectiveAt,
    staffName: row.reviewedBy?.name || row.staffAssigned?.name || 'Unassigned',
    notes: row.refundReason || row.reviewReason || '',
  };
};

const emptyReport: SalesAnalyticsReport = {
  range: { key: '30d', from: null, to: null, start: null, end: null, timeZone: 'Asia/Manila', comparison: null },
  serviceMetric: 'orders',
  kpis: { netCollectedRevenue: 0, bookedSalesValue: 0, confirmedOrders: 0, averageOrderValue: 0, uniqueCustomers: 0 },
  comparison: null,
  secondary: {
    pendingVerification: 0, pendingVerificationCount: 0, reservationFeesCollected: 0,
    refunds: 0, refundCount: 0, cancellations: 0, outstandingBalance: 0,
  },
  revenueTrend: [],
  serviceMix: [],
  paymentMethods: [],
  topServices: [],
};

export function useSalesAnalytics() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dashboardReport, setDashboardReport] = useState<SalesAnalyticsReport>(emptyReport);
  const [isLoading, setIsLoading] = useState(true);
  const fetchInFlight = useRef(false);

  const refetch = useCallback(async () => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    try {
      const [ledgerResponse, reportResponse] = await Promise.all([
        api.get('/payments', {
          params: { page: 1, limit: 100, sortBy: 'effectiveAt', sortOrder: 'desc' },
          meta: { suppressErrorToast: true },
        } as any),
        api.get('/sales-analytics/report', {
          params: { range: '30d', serviceMetric: 'orders' },
          meta: { suppressErrorToast: true },
        } as any),
      ]);
      const remainingPages = Math.max(0, Number(ledgerResponse.data?.pagination?.pages || 1) - 1);
      const additionalResponses = remainingPages > 0
        ? await Promise.all(Array.from({ length: remainingPages }, (_, index) => api.get('/payments', {
            params: { page: index + 2, limit: 100, sortBy: 'effectiveAt', sortOrder: 'desc' },
            meta: { suppressErrorToast: true },
          } as any)))
        : [];
      const ledgerRows = [ledgerResponse, ...additionalResponses]
        .flatMap((response) => Array.isArray(response.data?.data) ? response.data.data : []);
      setTransactions(ledgerRows.map(mapLedgerTransaction));
      if (reportResponse.data?.success && reportResponse.data?.data) {
        setDashboardReport(reportResponse.data.data as SalesAnalyticsReport);
      }
    } catch (error) {
      console.error('Failed to load canonical sales analytics:', error);
    } finally {
      fetchInFlight.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const interval = window.setInterval(() => void refetch(), 60_000);
    const socket = getSharedSocket();
    const invalidate = (payload?: any) => {
      if (!payload?.collection || ['orders', 'payments'].includes(payload.collection)) void refetch();
    };
    socket.on('db_change', invalidate);
    socket.on('ledger:changed', invalidate);
    socket.on('pos:transaction_completed', invalidate);
    socket.on('booking:approval_updated', invalidate);
    const onFocus = () => document.visibilityState === 'visible' && void refetch();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(interval);
      socket.off('db_change', invalidate);
      socket.off('ledger:changed', invalidate);
      socket.off('pos:transaction_completed', invalidate);
      socket.off('booking:approval_updated', invalidate);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refetch]);

  const legacy = useMemo(() => {
    const colors = ['#2563EB', '#7C3AED', '#10B981', '#F59E0B', '#64748B'];
    const serviceMix = dashboardReport.serviceMix.slice(0, 5).map((row, index) => ({
      name: row.name,
      value: row.value,
      pct: Math.round(row.percentage),
      fill: colors[index % colors.length],
    }));
    const sevenDaySales = dashboardReport.revenueTrend.slice(-7).map((row) => ({
      date: row.date,
      revenue: row.netCollected,
    }));
    return {
      kpis: {
        totalSalesToday: dashboardReport.kpis.netCollectedRevenue,
        totalSalesYesterday: dashboardReport.comparison?.netCollectedRevenue.previousValue || 0,
        transactionCount: dashboardReport.kpis.confirmedOrders,
        transactionCountYesterday: dashboardReport.comparison?.confirmedOrders.previousValue || 0,
        pendingPayments: dashboardReport.secondary.pendingVerification,
        pendingCount: dashboardReport.secondary.pendingVerificationCount,
        completedPayments: dashboardReport.kpis.netCollectedRevenue,
        completedCount: transactions.filter((row) => row.status === 'completed').length,
        topServiceToday: dashboardReport.topServices[0]?.name || '—',
        topServiceRevenue: dashboardReport.topServices[0]?.collected || 0,
        avgTransactionValue: dashboardReport.kpis.averageOrderValue,
        usingLast24hFallback: false,
      },
      hourlySales: dashboardReport.revenueTrend.map((row) => ({ hour: row.date, revenue: row.netCollected, transactions: row.payments })),
      serviceMix,
      sevenDaySales,
      recentTransactions: transactions.slice(0, 6),
    };
  }, [dashboardReport, transactions]);

  return {
    transactions,
    dashboardReport,
    isLoading,
    refetch,
    ...legacy,
  };
}
