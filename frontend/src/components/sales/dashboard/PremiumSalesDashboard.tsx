import React from 'react';
import {
  BadgeDollarSign,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  FileClock,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';
import DashboardKpiCard, { type DashboardKpiComparison } from '@/components/ui/DashboardKpiCard';
import type { MetricComparison } from '@/types/salesAnalytics';

type SalesView = 'dashboard' | 'concierge-inbox' | 'pos' | 'transactions' | 'customers' | 'reports' | 'settings' | 'approvals' | 'calendar';

type PremiumSalesDashboardProps = {
  onNavigate: (view: SalesView) => void;
};

const peso = (value: number) => `₱${Math.round(Number(value || 0)).toLocaleString('en-PH')}`;
const compactPeso = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₱${Math.round(value / 1_000)}K`;
  return `₱${Math.round(value)}`;
};

const comparison = (metric?: MetricComparison): DashboardKpiComparison => {
  if (!metric) return { direction: 'neutral', tone: 'neutral', label: 'No comparison available' };
  const direction = metric.percentChange > 0 ? 'up' : metric.percentChange < 0 ? 'down' : 'neutral';
  return {
    direction,
    tone: direction === 'neutral' ? 'neutral' : metric.percentChange > 0 ? 'positive' : 'negative',
    label: `${Math.abs(metric.percentChange).toFixed(1)}% vs prior equal period`,
  };
};

export default function PremiumSalesDashboard({ onNavigate }: PremiumSalesDashboardProps) {
  const { user } = useAuth();
  const {
    dashboardReport: report, hasReport, hasLedger, reportError, ledgerError,
    isReportRefreshing, isLedgerRefreshing, refetch,
  } = useSalesContext();
  const syncError = reportError || ledgerError;
  const synchronizing = isReportRefreshing || isLedgerRefreshing || !hasReport || !hasLedger;
  const firstName = (user?.name || 'Sales').split(' ')[0] || 'Sales';
  const todayLabel = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date());
  const kpis = report.kpis;
  const secondary = report.secondary;

  const cards = [
    {
      label: 'Net Collected', value: peso(kpis.netCollectedRevenue), detail: 'Verified payments less posted refunds',
      Icon: Banknote, color: '#059669', comparison: comparison(report.comparison?.netCollectedRevenue),
      sparkline: report.revenueTrend.map((row) => row.netCollected),
    },
    {
      label: 'Booked Sales', value: peso(kpis.bookedSalesValue), detail: 'Approved service value, not cash received',
      Icon: ShoppingBag, color: '#2563EB', comparison: comparison(report.comparison?.bookedSalesValue),
      sparkline: report.serviceMix.map((row) => row.bookedValue),
    },
    {
      label: 'Confirmed Orders', value: kpis.confirmedOrders.toLocaleString('en-PH'), detail: 'Distinct approved bookings',
      Icon: ReceiptText, color: '#7C3AED', comparison: comparison(report.comparison?.confirmedOrders),
      sparkline: report.serviceMix.map((row) => row.confirmedOrders),
    },
    {
      label: 'Average Order Value', value: peso(kpis.averageOrderValue), detail: 'Booked sales divided by confirmed orders',
      Icon: WalletCards, color: '#F97316', comparison: comparison(report.comparison?.averageOrderValue),
      sparkline: report.topServices.map((row) => row.bookedValue),
    },
  ];

  return (
    <div className="page-enter space-y-6 pb-8 text-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Welcome back, {firstName}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${syncError ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
              <span className={`h-2 w-2 rounded-full ${syncError ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {syncError ? 'Refresh failed' : synchronizing ? 'Synchronizing ledger' : 'Ledger synchronized'}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">{todayLabel}. One financial source now powers Reports, Customers, and Transactions.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onNavigate('reports')} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">
            <CalendarDays size={16} /> Open reports
          </button>
          <button type="button" onClick={() => onNavigate('transactions')} className="btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5">
            <ReceiptText size={16} /> View ledger
          </button>
        </div>
      </div>

      {syncError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span>
          {reportError && (hasReport ? 'Metrics refresh failed. Showing last loaded metrics. ' : 'Metrics could not load. ')}
          {ledgerError && (hasLedger ? 'Ledger refresh failed. Showing last loaded transactions.' : 'Ledger could not load.')}
        </span>
        <button type="button" onClick={() => void refetch()} disabled={isReportRefreshing || isLedgerRefreshing} className="shrink-0 font-semibold underline disabled:opacity-50">Retry</button>
      </div>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Canonical sales key performance indicators">
        {cards.map((card) => (
          <DashboardKpiCard
            key={card.label}
            title={card.label}
            value={hasReport ? card.value : '—'}
            icon={card.Icon}
            accentColor={card.color}
            comparison={hasReport ? card.comparison : undefined}
            subtitle={card.detail}
            sparklineData={card.sparkline}
          />
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ['Unique Customers', kpis.uniqueCustomers, UsersRound],
          ['Pending Verification', peso(secondary.pendingVerification), FileClock],
          ['Outstanding Balance', peso(secondary.outstandingBalance), BadgeDollarSign],
          ['Reservation Fees', peso(secondary.reservationFeesCollected), CircleDollarSign],
          ['Refunds', peso(secondary.refunds), RotateCcw],
          ['Cancellations', secondary.cancellations, CalendarDays],
        ].map(([label, value, Icon]) => (
          <button
            type="button"
            key={String(label)}
            onClick={() => onNavigate(label === 'Unique Customers' ? 'customers' : label === 'Pending Verification' ? 'approvals' : 'reports')}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{React.createElement(Icon as typeof UsersRound, { size: 14 })}{String(label)}</span>
            <span className="mt-2 block text-lg font-bold tabular-nums text-slate-900">{hasReport ? String(value) : '—'}</span>
          </button>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Net Collected Revenue</h2>
              <p className="mt-1 text-xs text-slate-500">Effective-date ledger trend for the last 30 Manila calendar days.</p>
            </div>
            <button type="button" onClick={() => onNavigate('reports')} className="text-xs font-semibold text-blue-700 hover:underline">Full report</button>
          </div>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.revenueTrend} margin={{ top: 8, right: 10, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compactPeso} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={55} />
                <Tooltip formatter={(value: number) => peso(value)} />
                <Line type="monotone" dataKey="netCollected" name="Net collected" stroke="#0f172a" strokeWidth={2.7} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-lg font-bold">Top Services</h2><p className="mt-1 text-xs text-slate-500">Booked and collected totals remain separate.</p></div>
            <Sparkles size={18} className="text-amber-500" />
          </div>
          <div className="mt-5 space-y-4">
            {report.topServices.slice(0, 5).map((service) => (
              <div key={service.name} className="rounded-2xl bg-slate-50 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{service.name}</p><p className="mt-1 text-[11px] text-slate-500">{service.confirmedOrders} confirmed order{service.confirmedOrders === 1 ? '' : 's'}</p></div>
                  <p className="shrink-0 text-sm font-bold text-slate-900">{peso(service.bookedValue)}</p>
                </div>
                <p className="mt-2 text-xs font-semibold text-emerald-700">{peso(service.collected)} collected</p>
              </div>
            ))}
            {hasReport && !report.topServices.length && <p className="py-20 text-center text-sm text-slate-400">No confirmed service demand yet.</p>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Confirmed Service Mix</h2>
          <p className="mt-1 text-xs text-slate-500">Order count is the default business-demand measure.</p>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.serviceMix.slice(0, 7)} layout="vertical" margin={{ top: 0, right: 10, left: 12, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="confirmedOrders" name="Confirmed orders" fill="#2563eb" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Payment Method Reconciliation</h2>
          <p className="mt-1 text-xs text-slate-500">Verified split tenders are expanded before totals are grouped.</p>
          <div className="mt-5 space-y-3">
            {report.paymentMethods.map((method) => (
              <div key={method.method} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                <div><p className="text-sm font-semibold capitalize text-slate-900">{method.method.replace(/_/g, ' ')}</p><p className="mt-0.5 text-[11px] text-slate-500">{method.verifiedTransactions} verified · {method.refunds} refunds</p></div>
                <div className="text-right"><p className="text-sm font-bold text-slate-900">{peso(method.amount)}</p><p className="mt-0.5 text-[11px] font-semibold text-slate-400">{method.percentage.toFixed(1)}%</p></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
