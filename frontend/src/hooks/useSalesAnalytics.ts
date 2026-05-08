import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '@/lib/api';
import { getSharedSocket } from './useRealtimeSync';
import type { Transaction, TransactionStatus, PaymentMethod } from '@/lib/salesData';
import { isEncryptedPlateToken } from '@/lib/salesData';
import {
  DASHBOARD_TIMEZONE,
  addCalendarDaysYmd,
  formatYmdInTz,
  getHourInTz,
  getPrimaryKpiDayTransactions,
} from '@/lib/dashboard-time';

export type { Transaction, TransactionStatus, PaymentMethod };

/** Map Mongo order.status → four sales-dashboard states (filters, KPIs, dot colors). */
function mapOrderStatusToCanonical(raw: string | undefined): TransactionStatus {
  const x = (raw || '').toLowerCase();
  if (['released', 'paid', 'completed'].includes(x)) return 'completed';
  if (['rejected', 'cancelled'].includes(x)) return 'voided';
  if (['pending_confirmation', 'pending'].includes(x)) return 'pending';
  return 'processing';
}

function normalizePaymentMethod(raw: string | undefined): PaymentMethod {
  const x = String(raw || 'cash').toLowerCase().replace(/\s+/g, '_');
  if (x === 'cash' || x === 'card' || x === 'gcash' || x === 'maya' || x === 'bank_transfer') {
    return x as PaymentMethod;
  }
  return 'cash';
}

/**
 * Order line items reference `Product`, but many bookings store a Service `_id` there,
 * so populate often yields null. Fall back to order-level serviceName / serviceType.
 */
function resolveLineItemName(item: any, order: any): string {
  const p = item?.product;
  if (p && typeof p === 'object') {
    const n = String((p as { name?: string; title?: string }).name || (p as { title?: string }).title || '').trim();
    if (n) return n;
  }
  if (typeof item?.name === 'string' && item.name.trim()) return item.name.trim();
  const fb = String(order.serviceName || order.serviceType || '').trim();
  if (fb) return fb;
  return 'Service';
}

function pickOrderDateTime(o: any): string {
  const ca = o.createdAt;
  if (ca instanceof Date) return ca.toISOString();
  if (typeof ca === 'string' && ca.trim()) return ca.trim();
  if (ca && typeof ca === 'object' && typeof ca.$date === 'string') return ca.$date;
  if (typeof ca === 'object' && ca !== null && typeof ca.$date === 'number') {
    return new Date(ca.$date).toISOString();
  }
  if (typeof o.date === 'string' && o.date.trim()) return o.date.trim();
  return new Date().toISOString();
}

function coerceOrderInstant(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'object' && value !== null && '$date' in (value as object)) {
    const v = (value as { $date: string | number }).$date;
    if (typeof v === 'number') return new Date(v).toISOString();
    if (typeof v === 'string') return v;
  }
  return null;
}

/** Prefer paid time for settled orders; else last server update if newer than created (POS activity). */
function pickAnalyticsInstant(o: any): string {
  const created = pickOrderDateTime(o);
  const paid = coerceOrderInstant(o.paidAt);
  const statusRaw = String(o.status || '').toLowerCase();
  const ps = String(o.paymentStatus || '').toLowerCase();
  const settled = ['paid', 'released', 'completed'].includes(statusRaw) || ps === 'paid';
  if (settled && paid) return paid;

  const updated = coerceOrderInstant(o.updatedAt);
  const cMs = new Date(created).getTime();
  const uMs = updated ? new Date(updated).getTime() : NaN;
  if (Number.isFinite(uMs) && uMs > cMs) return updated;

  return created;
}

function buildTransactionServices(o: any): Transaction['services'] {
  const items = Array.isArray(o.items) ? o.items : [];
  const fb = String(o.serviceName || o.serviceType || '').trim();

  if (items.length === 0) {
    if (!fb) return [];
    return [{ name: fb, price: Number(o.totalPrice ?? o.totalAmount) || 0, qty: 1 }];
  }

  const lines = items.map((i: any) => ({
    name: resolveLineItemName(i, o),
    price: Number(i.price) || 0,
    qty: Number(i.quantity) || 1,
  }));

  const allGeneric = lines.every((l) => l.name === 'Service');
  if (allGeneric && fb) {
    if (lines.length === 1) return [{ ...lines[0], name: fb }];
    return lines.map((l, idx) => ({ ...l, name: `${fb} (${idx + 1})` }));
  }

  return lines;
}

export function useSalesAnalytics() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchInFlight = useRef(false);

  const fetchOrders = useCallback(async () => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    try {
      const { data } = await api.get('/orders?limit=500', { meta: { suppressErrorToast: true } });
      if (data.success && Array.isArray(data.data)) {
        const mapped: Transaction[] = data.data.map((o: any) => {
          const rawStatus = typeof o.status === 'string' ? o.status : '';
          const plateRaw = String(o.vehiclePlate || 'N/A').trim() || 'N/A';
          const vehiclePlate = isEncryptedPlateToken(plateRaw) ? '—' : plateRaw.toUpperCase();

          const created = pickOrderDateTime(o);
          const analyticsDateTime = pickAnalyticsInstant(o);

          return {
            id: o.bookingReference || o.id,
            orderId: o.id || o._id,
            orderNumber: o.orderNumber,
            bookingReference: o.bookingReference,
            invoiceId: o.invoiceId,
            customerId: o.customer?._id || o.customerId || 'unknown',
            customerName: o.customerName || 'Walk-in Customer',
            customerPhone: o.customerPhone || '',
            customerEmail: o.customer?.email || '',
            vehiclePlate,
            vehicleInfo: o.vehicleInfo || '',
            services: buildTransactionServices(o),
            subtotal: o.totalAmount || 0,
            discount: 0,
            tax: 0,
            total: o.totalPrice || o.totalAmount || 0,
            paymentMethod: normalizePaymentMethod(o.paymentMethod),
            status: mapOrderStatusToCanonical(rawStatus),
            statusRaw: rawStatus || undefined,
            dateTime: created,
            analyticsDateTime,
            paidAt: coerceOrderInstant(o.paidAt) || undefined,
            staffName: o.assignedDetailer?.name || 'Unassigned',
            notes: o.notes || '',
          };
        });
        mapped.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

        setTransactions(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch sales transactions:', error);
    } finally {
      fetchInFlight.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();

    // Backup poll — avoid stacking requests if an /orders fetch is slow (socket still drives live updates)
    const interval = setInterval(() => void fetchOrders(), 30_000);

    const socket = getSharedSocket();
    const handleDbChange = (payload: any) => {
      if (payload.collection === 'orders') {
        void fetchOrders();
      }
    };
    socket.on('db_change', handleDbChange);

    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (visTimer) clearTimeout(visTimer);
        visTimer = setTimeout(() => {
          void fetchOrders();
        }, 150);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      socket.off('db_change', handleDbChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (visTimer) clearTimeout(visTimer);
    };
  }, [fetchOrders]);

  const { kpis, hourlySales, serviceMix, sevenDaySales, recentTransactions } = useMemo(() => {
    const tz = DASHBOARD_TIMEZONE;
    const primary = getPrimaryKpiDayTransactions(transactions);
    const {
      useLast24hFallback,
      kpiDayTxns,
      comparePrevTxns,
      todayYmd,
    } = primary;

    const bucketYmd = (t: Transaction) => formatYmdInTz(t.analyticsDateTime || t.dateTime, tz);

    const totalSalesToday = kpiDayTxns.reduce((sum, t) => sum + (t.status !== 'voided' ? t.total : 0), 0);
    const totalSalesYesterday = comparePrevTxns.reduce((sum, t) => sum + (t.status !== 'voided' ? t.total : 0), 0);

    const pendingPayments = kpiDayTxns.filter((t) => t.status === 'pending').reduce((sum, t) => sum + t.total, 0);
    const pendingCount = kpiDayTxns.filter((t) => t.status === 'pending').length;

    const completedPayments = kpiDayTxns.filter((t) => t.status === 'completed').reduce((sum, t) => sum + t.total, 0);
    const completedCount = kpiDayTxns.filter((t) => t.status === 'completed').length;

    const serviceRevenue: Record<string, number> = {};
    kpiDayTxns.forEach((t) => {
      if (t.status !== 'voided') {
        t.services.forEach((s) => {
          serviceRevenue[s.name] = (serviceRevenue[s.name] || 0) + s.price * s.qty;
        });
      }
    });

    const sortedServices = Object.entries(serviceRevenue).sort((a, b) => b[1] - a[1]);
    const topServiceToday = sortedServices.length > 0 ? sortedServices[0][0] : '—';
    const topServiceRevenue = sortedServices.length > 0 ? sortedServices[0][1] : 0;

    const avgTransactionValue = kpiDayTxns.length > 0 ? totalSalesToday / kpiDayTxns.length : 0;

    const kpisOut = {
      totalSalesToday,
      totalSalesYesterday,
      transactionCount: kpiDayTxns.length,
      transactionCountYesterday: comparePrevTxns.length,
      pendingPayments,
      pendingCount,
      completedPayments,
      completedCount,
      topServiceToday,
      topServiceRevenue,
      avgTransactionValue,
      usingLast24hFallback: useLast24hFallback,
    };

    const hourlyMap: Record<string, { revenue: number; transactions: number; hourNum: number }> = {};

    for (let i = 8; i <= 18; i++) {
      const hourLabel = i === 12 ? '12PM' : i > 12 ? `${i - 12}PM` : `${i}AM`;
      hourlyMap[hourLabel] = { revenue: 0, transactions: 0, hourNum: i };
    }

    kpiDayTxns.forEach((t) => {
      if (t.status !== 'voided') {
        const h = getHourInTz(t.analyticsDateTime || t.dateTime, tz);
        const hourLabel = h === 12 ? '12PM' : h === 0 ? '12AM' : h > 12 ? `${h - 12}PM` : `${h}AM`;

        if (!hourlyMap[hourLabel]) {
          hourlyMap[hourLabel] = { revenue: 0, transactions: 0, hourNum: h };
        }

        hourlyMap[hourLabel].revenue += Number(t.total) || 0;
        hourlyMap[hourLabel].transactions += 1;
      }
    });

    const hourlySalesOut = Object.values(hourlyMap)
      .sort((a, b) => a.hourNum - b.hourNum)
      .map(({ hourNum, ...data }) => {
        const hourLabel =
          hourNum === 12 ? '12PM' : hourNum === 0 ? '12AM' : hourNum > 12 ? `${hourNum - 12}PM` : `${hourNum}AM`;
        return {
          hour: hourLabel,
          revenue: data.revenue,
          transactions: data.transactions,
        };
      });

    const totalRevenueForMix = Object.values(serviceRevenue).reduce((a, b) => a + b, 0);
    const colors = ['#0F52BA', '#8B5CF6', '#10B981', '#F59E0B', '#64748B'];
    const serviceMixOut = sortedServices.slice(0, 5).map(([name, value], i) => ({
      name,
      value,
      pct: totalRevenueForMix > 0 ? Math.round((value / totalRevenueForMix) * 100) : 0,
      fill: colors[i % colors.length],
    }));

    const sevenDaySalesOut: { date: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayYmd = addCalendarDaysYmd(todayYmd, -i);
      const [yy, mm, dd] = dayYmd.split('-').map(Number);
      const dateStr = new Date(yy, mm - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const dayRevenue = transactions
        .filter((t) => t.status !== 'voided')
        .filter((t) => bucketYmd(t) === dayYmd)
        .reduce((sum, t) => sum + t.total, 0);

      sevenDaySalesOut.push({ date: dateStr, revenue: dayRevenue });
    }

    return {
      kpis: kpisOut,
      hourlySales: hourlySalesOut,
      serviceMix: serviceMixOut,
      sevenDaySales: sevenDaySalesOut,
      recentTransactions: transactions.slice(0, 6),
    };
  }, [transactions]);

  return {
    transactions,
    isLoading,
    refetch: fetchOrders,
    kpis,
    hourlySales,
    serviceMix,
    sevenDaySales,
    recentTransactions,
  };
}
