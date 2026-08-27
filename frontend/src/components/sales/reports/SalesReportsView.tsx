import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  Banknote,
  CalendarDays,
  Download,
  FileClock,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '@/lib/api';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import SalesStatCard from '@/components/sales/ui/SalesStatCard';
import { SALES_ACCENTS } from '@/components/sales/ui/salesTheme';
import type { ReportRange, SalesAnalyticsReport, ServiceMetric } from '@/types/salesAnalytics';
import { buildSalesReportQuery } from '@/lib/salesAnalyticsContracts';

const peso = (value: number) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const compactPeso = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₱${Math.round(value / 1_000)}K`;
  return `₱${Math.round(value)}`;
};

const comparisonLabel = (change?: number) => {
  if (change === undefined) return 'No all-time comparison';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}% vs previous equal period`;
};

const rangeOptions: Array<{ value: ReportRange; label: string }> = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
];

export default function SalesReportsView() {
  const [range, setRange] = useState<ReportRange>('30d');
  const [serviceMetric, setServiceMetric] = useState<ServiceMetric>('orders');
  const [customDraft, setCustomDraft] = useState({ from: '', to: '' });
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [report, setReport] = useState<SalesAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const query = useMemo(
    () => buildSalesReportQuery(range, serviceMetric, custom),
    [custom, range, serviceMetric],
  );
  const customReady = range !== 'custom' || Boolean(custom.from && custom.to);

  const loadReport = useCallback(async (signal?: AbortSignal) => {
    if (!customReady) return;
    setLoading(true);
    try {
      const response = await api.get('/sales-analytics/report', {
        params: query,
        signal,
        meta: { suppressCancelLog: true, suppressErrorToast: true },
      } as any);
      if (response.data?.success) setReport(response.data.data as SalesAnalyticsReport);
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED') console.error('Failed to load sales report:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [customReady, query]);

  useEffect(() => {
    const controller = new AbortController();
    void loadReport(controller.signal);
    return () => controller.abort();
  }, [loadReport, refreshToken]);

  useEffect(() => {
    const socket = getSharedSocket();
    const invalidate = (payload?: any) => {
      if (!payload?.collection || ['payments', 'orders'].includes(payload.collection)) setRefreshToken((value) => value + 1);
    };
    socket.on('db_change', invalidate);
    socket.on('ledger:changed', invalidate);
    return () => {
      socket.off('db_change', invalidate);
      socket.off('ledger:changed', invalidate);
    };
  }, []);

  const downloadCsv = async () => {
    if (!customReady) return;
    setDownloading(true);
    try {
      const response = await api.get('/sales-analytics/report.csv', { params: query, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `autospf-sales-${report?.range.from || 'all'}-${report?.range.to || 'time'}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const kpis = report?.kpis;
  const comparisons = report?.comparison;
  const secondary = report?.secondary;
  const rangeLabel = report?.range.from && report.range.to
    ? `${report.range.from} to ${report.range.to}`
    : 'All available ledger history';

  return (
    <div className="page-enter space-y-6 pb-8 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Sales Reports</h1>
          <p className="mt-1 text-sm text-slate-500">Booked value and collected money are reported independently from one verified ledger.</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <CalendarDays size={13} /> {rangeLabel} · Asia/Manila
          </p>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={!customReady || downloading}
          className="btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 disabled:opacity-50"
        >
          {downloading ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
          Export reconciled CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-white p-2 shadow-sm">
        {rangeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              range === option.value ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {option.label}
          </button>
        ))}
        {range === 'custom' && (
          <div className="ml-1 flex flex-wrap items-center gap-2 border-l border-slate-200 pl-3">
            <input
              aria-label="Report from date"
              type="date"
              value={customDraft.from}
              max={customDraft.to || undefined}
              onChange={(event) => setCustomDraft((value) => ({ ...value, from: event.target.value }))}
              className="input-base rounded-xl py-2 text-xs"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              aria-label="Report to date"
              type="date"
              value={customDraft.to}
              min={customDraft.from || undefined}
              onChange={(event) => setCustomDraft((value) => ({ ...value, to: event.target.value }))}
              className="input-base rounded-xl py-2 text-xs"
            />
            <button
              type="button"
              disabled={!customDraft.from || !customDraft.to}
              onClick={() => setCustom(customDraft)}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Primary report metrics">
        {[
          {
            title: 'Net Collected', value: peso(kpis?.netCollectedRevenue || 0),
            label: comparisonLabel(comparisons?.netCollectedRevenue.percentChange), icon: <Banknote size={17} />,
            accent: SALES_ACCENTS.green,
          },
          {
            title: 'Booked Sales', value: peso(kpis?.bookedSalesValue || 0),
            label: comparisonLabel(comparisons?.bookedSalesValue.percentChange), icon: <ShoppingBag size={17} />,
            accent: SALES_ACCENTS.blue,
          },
          {
            title: 'Confirmed Orders', value: String(kpis?.confirmedOrders || 0),
            label: comparisonLabel(comparisons?.confirmedOrders.percentChange), icon: <ReceiptText size={17} />,
            accent: SALES_ACCENTS.purple,
          },
          {
            title: 'Average Order Value', value: peso(kpis?.averageOrderValue || 0),
            label: comparisonLabel(comparisons?.averageOrderValue.percentChange), icon: <WalletCards size={17} />,
            accent: SALES_ACCENTS.orange,
          },
        ].map((card) => (
          <SalesStatCard key={card.title} title={card.title} metric={loading ? '—' : card.value} label={card.label} icon={card.icon} accent={card.accent} />
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-label="Secondary report metrics">
        {[
          ['Unique Customers', kpis?.uniqueCustomers || 0, Users],
          ['Pending Verification', peso(secondary?.pendingVerification || 0), FileClock],
          ['Outstanding Balance', peso(secondary?.outstandingBalance || 0), BadgeDollarSign],
          ['Reservation Fees', peso(secondary?.reservationFeesCollected || 0), ReceiptText],
          ['Refunds', peso(secondary?.refunds || 0), RotateCcw],
          ['Cancellations', secondary?.cancellations || 0, CalendarDays],
        ].map(([label, value, Icon]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {React.createElement(Icon as typeof Users, { size: 14 })}{String(label)}
            </div>
            <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">{loading ? '—' : String(value)}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
        <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-bold text-slate-900">Net Collected Revenue Trend</h2>
            <p className="mt-1 text-xs text-slate-500">Verified payments less posted refunds, recognized on effective date.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report?.revenueTrend || []} margin={{ top: 8, right: 10, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compactPeso} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={55} />
                <Tooltip formatter={(value: number) => peso(value)} />
                <Line type="monotone" dataKey="netCollected" name="Net collected" stroke="#0f172a" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Service Mix</h2>
              <p className="mt-1 text-xs text-slate-500">Approved bookings only.</p>
            </div>
            <select
              value={serviceMetric}
              onChange={(event) => setServiceMetric(event.target.value as ServiceMetric)}
              className="input-base rounded-xl py-2 text-xs"
            >
              <option value="orders">Confirmed orders</option>
              <option value="booked_value">Booked sales value</option>
            </select>
          </div>
          <div className="mt-5 space-y-4">
            {(report?.serviceMix || []).slice(0, 6).map((service) => (
              <div key={service.name}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-slate-700">{service.name}</span>
                  <span className="shrink-0 font-bold text-slate-900">
                    {serviceMetric === 'orders' ? `${service.value} orders` : peso(service.value)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, service.percentage)}%` }} />
                </div>
              </div>
            ))}
            {!loading && !report?.serviceMix.length && <p className="py-16 text-center text-sm text-slate-400">No confirmed bookings in this range.</p>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm">
          <div className="px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">Top Services</h2>
            <p className="mt-1 text-xs text-slate-500">Demand and collections stay visibly separate.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Service</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">Booked</th><th className="px-5 py-3">Collected</th></tr>
              </thead>
              <tbody>
                {(report?.topServices || []).map((service) => (
                  <tr key={service.name} className="border-t border-slate-100">
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{service.name}</td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-600">{service.confirmedOrders}</td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums text-slate-800">{peso(service.bookedValue)}</td>
                    <td className="px-5 py-3.5 font-semibold tabular-nums text-emerald-700">{peso(service.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Verified Payment Methods</h2>
          <p className="mt-1 text-xs text-slate-500">Split tenders are expanded into their actual components.</p>
          <div className="mt-5 space-y-3">
            {(report?.paymentMethods || []).map((method) => (
              <div key={method.method} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold capitalize text-slate-800">{method.method.replace(/_/g, ' ')}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{method.verifiedTransactions} verified · {method.refunds} refund{method.refunds === 1 ? '' : 's'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-slate-900">{peso(method.amount)}</p>
                    <p className="text-[11px] font-semibold text-slate-400">{method.percentage.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            ))}
            {!loading && !report?.paymentMethods.length && <p className="py-14 text-center text-sm text-slate-400">No verified payments in this range.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
