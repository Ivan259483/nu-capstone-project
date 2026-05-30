import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  HelpCircle,
  Maximize2,
  MoreHorizontal,
  ReceiptText,
  Settings,
  Sparkles,
  Tags,
  TrendingUp,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';
import type { Transaction } from '@/lib/salesData';
import { DASHBOARD_TIMEZONE, formatYmdInTz } from '@/lib/dashboard-time';

type SalesView = 'dashboard' | 'pos' | 'transactions' | 'customers' | 'reports' | 'settings' | 'approvals' | 'calendar';

type PremiumSalesDashboardProps = {
  onNavigate: (view: SalesView) => void;
};

type PeriodSummary = {
  revenue: number;
  orders: number;
  avgTicket: number;
  pendingPayments: number;
  pendingCount: number;
  completedPayments: number;
  completedCount: number;
  uniqueCustomers: number;
};

type Trend = {
  change: number;
  good: boolean;
};

const SERVICE_COLORS = ['#f97316', '#8b5cf6', '#4f46e5', '#14b8a6', '#64748b'];

function formatPesoWhole(amount: number): string {
  return `₱${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString('en-PH')}`;
}

function formatCompactCount(value: number): string {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString('en-PH');
}

function pctChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function trend(current: number, previous: number, lowerIsBetter = false): Trend {
  const change = pctChange(current, previous);
  return {
    change,
    good: lowerIsBetter ? change <= 0 : change >= 0,
  };
}

function trendText(change: number): string {
  const absolute = Math.abs(change);
  const rounded = absolute >= 10 ? Math.round(absolute) : Math.round(absolute * 10) / 10;
  return `${rounded}%`;
}

function ymdParts(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function monthLabel(year: number, month: number, options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: DASHBOARD_TIMEZONE, ...options }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

function txnInstant(txn: Transaction): string {
  return txn.analyticsDateTime || txn.dateTime;
}

function isInMonthToDay(txn: Transaction, year: number, month: number, endDay: number): boolean {
  const parts = ymdParts(formatYmdInTz(txnInstant(txn), DASHBOARD_TIMEZONE));
  return parts.year === year && parts.month === month && parts.day <= endDay;
}

function summarize(txns: Transaction[]): PeriodSummary {
  const active = txns.filter((txn) => txn.status !== 'voided');
  const revenue = active.reduce((sum, txn) => sum + (Number(txn.total) || 0), 0);
  const pending = active.filter((txn) => txn.status === 'pending');
  const completed = active.filter((txn) => txn.status === 'completed');

  return {
    revenue,
    orders: active.length,
    avgTicket: active.length > 0 ? revenue / active.length : 0,
    pendingPayments: pending.reduce((sum, txn) => sum + (Number(txn.total) || 0), 0),
    pendingCount: pending.length,
    completedPayments: completed.reduce((sum, txn) => sum + (Number(txn.total) || 0), 0),
    completedCount: completed.length,
    uniqueCustomers: new Set(active.map((txn) => txn.customerId || txn.customerName)).size,
  };
}

function buildDailyMaps(txns: Transaction[], year: number, month: number) {
  const dayCount = daysInMonth(year, month);
  const revenue = Array.from({ length: dayCount + 1 }, () => 0);
  const orders = Array.from({ length: dayCount + 1 }, () => 0);
  const customers: Array<Set<string>> = Array.from({ length: dayCount + 1 }, () => new Set<string>());

  txns.forEach((txn) => {
    if (txn.status === 'voided') return;
    const parts = ymdParts(formatYmdInTz(txnInstant(txn), DASHBOARD_TIMEZONE));
    if (parts.year !== year || parts.month !== month) return;
    revenue[parts.day] += Number(txn.total) || 0;
    orders[parts.day] += 1;
    customers[parts.day].add(txn.customerId || txn.customerName || txn.id);
  });

  return { revenue, orders, customers };
}

function buildServiceLeaders(currentTxns: Transaction[], previousTxns: Transaction[]) {
  const current = new Map<string, { revenue: number; qty: number }>();
  const previous = new Map<string, { revenue: number; qty: number }>();

  const add = (map: Map<string, { revenue: number; qty: number }>, txn: Transaction) => {
    if (txn.status === 'voided') return;
    txn.services.forEach((service) => {
      const name = service.name || 'Service';
      const next = map.get(name) || { revenue: 0, qty: 0 };
      next.revenue += (Number(service.price) || 0) * (Number(service.qty) || 1);
      next.qty += Number(service.qty) || 1;
      map.set(name, next);
    });
  };

  currentTxns.forEach((txn) => add(current, txn));
  previousTxns.forEach((txn) => add(previous, txn));

  return [...current.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 4)
    .map(([name, value], index) => ({
      name,
      revenue: value.revenue,
      qty: value.qty,
      previousRevenue: previous.get(name)?.revenue || 0,
      color: SERVICE_COLORS[index % SERVICE_COLORS.length],
    }));
}

function axisPeso(value: number): string {
  if (value >= 1000000) return `₱${Math.round(value / 1000000)}M`;
  if (value >= 1000) return `₱${Math.round(value / 1000)}K`;
  return `₱${Math.round(value)}`;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white/95 px-3 py-2 text-xs shadow-[0_18px_40px_-16px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 backdrop-blur">
      <p className="mb-1 font-semibold text-slate-900">{label}</p>
      <div className="space-y-1">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-bold tabular-nums text-slate-900">
              {String(item.dataKey).toLowerCase().includes('order') || String(item.dataKey).toLowerCase().includes('client')
                ? formatCompactCount(Number(item.value) || 0)
                : formatPesoWhole(Number(item.value) || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionActions({ onOpen, onMore }: { onOpen: () => void; onMore: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Open full report"
      >
        <Maximize2 size={15} />
      </button>
      <button
        type="button"
        onClick={onMore}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="More dashboard options"
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function TrendBadge({ item }: { item: Trend }) {
  const Icon = item.change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-bold ${item.good ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon size={15} />
      {trendText(item.change)}
    </span>
  );
}

function ChartBox({
  height,
  children,
}: {
  height: number;
  children: (size: { width: number; height: number }) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const updateWidth = () => {
      const nextWidth = Math.floor(node.getBoundingClientRect().width);
      setWidth(nextWidth > 0 ? nextWidth : 0);
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-w-0" style={{ height }}>
      {width > 0 ? children({ width, height }) : <div className="h-full rounded-lg bg-slate-50" />}
    </div>
  );
}

export default function PremiumSalesDashboard({ onNavigate }: PremiumSalesDashboardProps) {
  const { user } = useAuth();
  const { transactions, isLoading } = useSalesContext();

  const today = useMemo(() => ymdParts(formatYmdInTz(new Date(), DASHBOARD_TIMEZONE)), []);
  const previous = useMemo(() => previousMonth(today.year, today.month), [today.month, today.year]);
  const firstName = (user?.name || 'Sales').split(' ')[0] || 'Sales';
  const todayLabel = new Intl.DateTimeFormat('en-PH', {
    timeZone: DASHBOARD_TIMEZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const data = useMemo(() => {
    const previousEndDay = Math.min(today.day, daysInMonth(previous.year, previous.month));
    const currentMonthTxns = transactions.filter((txn) => isInMonthToDay(txn, today.year, today.month, today.day));
    const previousMonthTxns = transactions.filter((txn) => isInMonthToDay(txn, previous.year, previous.month, previousEndDay));

    const currentSummary = summarize(currentMonthTxns);
    const previousSummary = summarize(previousMonthTxns);
    const currentDaily = buildDailyMaps(transactions, today.year, today.month);
    const previousDaily = buildDailyMaps(transactions, previous.year, previous.month);
    const currentMonthShort = monthLabel(today.year, today.month, { month: 'short' });
    const previousMonthShort = monthLabel(previous.year, previous.month, { month: 'short' });

    const chartDays = Array.from({ length: today.day }, (_, index) => {
      const day = index + 1;
      const previousDay = Math.min(day, previousEndDay);
      const currentRevenue = currentDaily.revenue[day] || 0;
      const previousRevenue = previousDaily.revenue[previousDay] || 0;
      const currentOrders = currentDaily.orders[day] || 0;
      const previousOrders = previousDaily.orders[previousDay] || 0;

      return {
        day,
        label: day === 1 ? `${currentMonthShort} ${String(day).padStart(2, '0')}` : String(day).padStart(2, '0'),
        currentRevenue,
        previousRevenue,
        currentOrders,
        previousOrders,
        avgTicket: currentOrders > 0 ? currentRevenue / currentOrders : 0,
        previousAvgTicket: previousOrders > 0 ? previousRevenue / previousOrders : 0,
        clients: currentDaily.customers[day]?.size || 0,
        previousClients: previousDaily.customers[previousDay]?.size || 0,
      };
    });

    return {
      currentMonthTxns,
      previousMonthTxns,
      currentSummary,
      previousSummary,
      chartDays,
      serviceLeaders: buildServiceLeaders(currentMonthTxns, previousMonthTxns),
      currentMonthLabel: monthLabel(today.year, today.month),
      previousMonthLabel: monthLabel(previous.year, previous.month),
      currentMonthShort,
      previousMonthShort,
    };
  }, [previous.month, previous.year, today.day, today.month, today.year, transactions]);

  const revenueTrend = trend(data.currentSummary.revenue, data.previousSummary.revenue);
  const orderTrend = trend(data.currentSummary.orders, data.previousSummary.orders);
  const avgTicketTrend = trend(data.currentSummary.avgTicket, data.previousSummary.avgTicket);
  const pendingTrend = trend(data.currentSummary.pendingPayments, data.previousSummary.pendingPayments, true);
  const captureRate = data.currentSummary.revenue > 0
    ? Math.round((data.currentSummary.completedPayments / data.currentSummary.revenue) * 100)
    : 0;
  const previousCaptureRate = data.previousSummary.revenue > 0
    ? Math.round((data.previousSummary.completedPayments / data.previousSummary.revenue) * 100)
    : 0;
  const captureTrend = trend(captureRate, previousCaptureRate);
  const maxServiceRevenue = Math.max(...data.serviceLeaders.map((service) => Math.max(service.revenue, service.previousRevenue)), 1);

  const kpiCards = [
    {
      label: 'Sales Performance',
      value: formatPesoWhole(data.currentSummary.revenue),
      detail: 'Month-to-date premium revenue',
      Icon: BarChart3,
      trend: revenueTrend,
    },
    {
      label: 'Total Sales',
      value: formatCompactCount(data.currentSummary.orders),
      detail: 'Confirmed tickets across the pipeline',
      Icon: ReceiptText,
      trend: orderTrend,
    },
    {
      label: 'Average Revenue',
      value: formatPesoWhole(data.currentSummary.avgTicket),
      detail: 'Value captured per client order',
      Icon: WalletCards,
      trend: avgTicketTrend,
    },
    {
      label: 'Collection Exposure',
      value: formatPesoWhole(data.currentSummary.pendingPayments),
      detail: `${data.currentSummary.pendingCount} balances awaiting closure`,
      Icon: CircleDollarSign,
      trend: pendingTrend,
    },
  ];

  return (
    <div className="page-enter space-y-6 text-slate-950">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[1.7rem] font-black leading-tight tracking-normal text-slate-950 sm:text-3xl">
              Welcome back, {firstName}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {isLoading ? 'Syncing revenue suite' : 'Revenue suite live'}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {todayLabel}. A refined view of premium sales, service demand, and collection readiness.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#130f25] px-3 text-sm font-bold text-white shadow-[0_10px_24px_-14px_rgba(19,15,37,0.9)] transition hover:bg-[#21183d]"
          >
            <CalendarDays size={16} />
            This Month
          </button>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#130f25] px-3 text-sm font-bold text-white shadow-[0_10px_24px_-14px_rgba(19,15,37,0.9)] transition hover:bg-[#21183d]"
          >
            <BadgeCheck size={16} />
            Compare: Last Month
          </button>
          <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:inline-block" />
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold text-slate-800 transition hover:bg-white hover:shadow-sm"
          >
            <Settings size={16} />
            Refine Widgets
          </button>
        </div>
      </div>

      <section className="grid overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_48px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(({ label, value, detail, Icon, trend: item }, index) => (
          <div
            key={label}
            className={`min-w-0 px-5 py-5 ${index > 0 ? 'border-t border-slate-100 sm:border-t-0 xl:border-l' : ''} ${index === 2 ? 'sm:border-l' : ''}`}
          >
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Icon size={17} className="text-slate-500" />
              <span>{label}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="truncate text-2xl font-black tracking-normal text-slate-950">{value}</p>
              <TrendBadge item={item} />
              <span className="text-sm font-medium text-slate-500">vs prior month</span>
            </div>
            <p className="mt-2 truncate text-xs font-medium text-slate-400">{detail}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(360px,1fr)]">
        <section className="min-w-0 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_48px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CircleDollarSign size={20} className="text-slate-900" />
                <h2 className="text-lg font-black text-slate-950">Total Revenue</h2>
                <HelpCircle size={15} className="text-slate-400" />
              </div>
              <div className="mt-8 flex flex-wrap items-baseline gap-3">
                <p className="text-4xl font-black tracking-normal text-slate-950">{formatPesoWhole(data.currentSummary.revenue)}</p>
                <TrendBadge item={revenueTrend} />
                <span className="text-base font-medium text-slate-500">vs prior month</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-4 text-sm font-medium text-slate-500 sm:flex">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
                  {data.currentMonthShort}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  {data.previousMonthShort}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="whitespace-nowrap text-sm font-black text-slate-900 underline decoration-slate-900 decoration-2 underline-offset-4 transition hover:text-blue-700 hover:decoration-blue-700"
              >
                View More
              </button>
              <SectionActions onOpen={() => onNavigate('reports')} onMore={() => onNavigate('settings')} />
            </div>
          </div>

          <ChartBox height={290}>
            {({ width, height }) => (
                <LineChart width={width} height={height} data={data.chartDays} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={axisPeso}
                    width={54}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="previousRevenue"
                    name={data.previousMonthLabel}
                    stroke="#c5cad3"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentRevenue"
                    name={data.currentMonthLabel}
                    stroke="#202331"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
            )}
          </ChartBox>
        </section>

        <section className="min-w-0 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_48px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80">
          <div className="mb-7 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Tags size={20} className="text-slate-900" />
                <h2 className="text-lg font-black text-slate-950">Signature Services</h2>
                <HelpCircle size={15} className="text-slate-400" />
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">Highest-value packages shaping this month.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="whitespace-nowrap text-sm font-black text-slate-900 underline decoration-slate-900 decoration-2 underline-offset-4 transition hover:text-blue-700 hover:decoration-blue-700"
              >
                View More
              </button>
              <SectionActions onOpen={() => onNavigate('reports')} onMore={() => onNavigate('settings')} />
            </div>
          </div>

          {data.serviceLeaders.length === 0 ? (
            <div className="flex h-[260px] flex-col items-center justify-center rounded-lg bg-slate-50 text-center ring-1 ring-slate-100">
              <Sparkles size={28} className="mb-3 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">No signature service revenue yet</p>
              <p className="mt-1 max-w-xs text-xs font-medium text-slate-400">
                Confirmed sales will surface your strongest packages here.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {data.serviceLeaders.map((service) => {
                const width = Math.max((service.revenue / maxServiceRevenue) * 100, 8);
                const previousWidth = Math.max((service.previousRevenue / maxServiceRevenue) * 100, service.previousRevenue > 0 ? 6 : 0);
                return (
                  <div key={service.name}>
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{service.name}</p>
                        <p className="mt-0.5 text-xs font-medium text-slate-500">{formatCompactCount(service.qty)} sold</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-slate-500">{formatPesoWhole(service.revenue)}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: service.color }} />
                      </div>
                      <div className="h-2 rounded-full bg-transparent">
                        <div
                          className="h-full rounded-full opacity-70"
                          style={{
                            width: `${previousWidth}%`,
                            backgroundColor: '#9ca3af',
                            backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.75) 0 2px, transparent 2px 4px)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
                <span>{data.currentMonthShort} performance</span>
                <span>Striped bar: {data.previousMonthShort}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="min-w-0 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_48px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <WalletCards size={20} className="text-slate-900" />
                <h2 className="text-lg font-black text-slate-950">Average Order Value</h2>
                <HelpCircle size={15} className="text-slate-400" />
              </div>
              <div className="mt-8 flex flex-wrap items-baseline gap-2">
                <p className="text-3xl font-black tracking-normal text-slate-950">{formatPesoWhole(data.currentSummary.avgTicket)}</p>
                <TrendBadge item={avgTicketTrend} />
                <span className="text-sm font-medium text-slate-500">vs prior month</span>
              </div>
            </div>
            <SectionActions onOpen={() => onNavigate('reports')} onMore={() => onNavigate('settings')} />
          </div>
          <ChartBox height={210}>
            {({ width, height }) => (
                <BarChart width={width} height={height} data={data.chartDays} margin={{ top: 12, right: 2, left: 2, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={axisPeso} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={data.currentSummary.avgTicket} stroke="#111827" strokeDasharray="2 5" strokeWidth={1.5} />
                  <Bar dataKey="avgTicket" name="Average ticket" radius={[5, 5, 0, 0]}>
                    {data.chartDays.map((entry) => (
                      <Cell
                        key={`ticket-${entry.day}`}
                        fill={entry.avgTicket >= data.currentSummary.avgTicket && data.currentSummary.avgTicket > 0 ? '#fb923c' : '#fed7aa'}
                      />
                    ))}
                  </Bar>
                </BarChart>
            )}
          </ChartBox>
        </section>

        <section className="min-w-0 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_48px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={20} className="text-slate-900" />
                <h2 className="text-lg font-black text-slate-950">Sales Momentum</h2>
                <HelpCircle size={15} className="text-slate-400" />
              </div>
              <div className="mt-8 flex flex-wrap items-baseline gap-2">
                <p className="text-3xl font-black tracking-normal text-slate-950">{formatCompactCount(data.currentSummary.orders)}</p>
                <TrendBadge item={orderTrend} />
                <span className="text-sm font-medium text-slate-500">vs prior month</span>
              </div>
            </div>
            <SectionActions onOpen={() => onNavigate('transactions')} onMore={() => onNavigate('settings')} />
          </div>
          <div className="mb-5 flex items-center gap-5 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-600" />
              {data.currentMonthShort}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-200" />
              {data.previousMonthShort}
            </span>
          </div>
          <ChartBox height={185}>
            {({ width, height }) => (
                <LineChart width={width} height={height} data={data.chartDays} margin={{ top: 4, right: 4, left: 2, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="previousOrders" name={`${data.previousMonthShort} orders`} stroke="#fdba74" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="currentOrders" name={`${data.currentMonthShort} orders`} stroke="#f97316" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
            )}
          </ChartBox>
        </section>

        <section className="min-w-0 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_48px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity size={20} className="text-slate-900" />
                <h2 className="text-lg font-black text-slate-950">Client Reach</h2>
                <HelpCircle size={15} className="text-slate-400" />
              </div>
              <div className="mt-8 flex flex-wrap items-baseline gap-2">
                <p className="text-3xl font-black tracking-normal text-slate-950">{formatCompactCount(data.currentSummary.uniqueCustomers)}</p>
                <TrendBadge item={trend(data.currentSummary.uniqueCustomers, data.previousSummary.uniqueCustomers)} />
                <span className="text-sm font-medium text-slate-500">vs prior month</span>
              </div>
            </div>
            <SectionActions onOpen={() => onNavigate('customers')} onMore={() => onNavigate('settings')} />
          </div>
          <div className="mb-5 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Distinct clients served</span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
              This month
            </span>
          </div>
          <ChartBox height={185}>
            {({ width, height }) => (
                <BarChart width={width} height={height} data={data.chartDays} margin={{ top: 4, right: 2, left: 2, bottom: 0 }} barGap={2}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="previousClients" name={`${data.previousMonthShort} clients`} fill="#d1d5db" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="clients" name={`${data.currentMonthShort} clients`} fill="#4b5563" radius={[5, 5, 0, 0]} />
                </BarChart>
            )}
          </ChartBox>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg bg-slate-950 px-5 py-4 text-white shadow-[0_20px_50px_-30px_rgba(15,23,42,0.9)]">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <BadgeCheck size={17} className="text-emerald-300" />
            Collection Readiness
          </div>
          <div className="mt-4 flex items-end justify-between gap-4">
            <p className="text-3xl font-black">{captureRate}%</p>
            <TrendBadge item={captureTrend} />
          </div>
          <p className="mt-1 text-xs font-medium text-slate-400">Revenue cleared and ready for closeout in {data.currentMonthShort}.</p>
        </div>
        <div className="rounded-lg bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-28px_rgba(15,23,42,0.4)] ring-1 ring-slate-200/80">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <UsersRound size={17} className="text-violet-600" />
            Closed Tickets
          </div>
          <p className="mt-4 text-3xl font-black text-slate-950">{formatCompactCount(data.currentSummary.completedCount)}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Completed sales with receipts ready for client handoff.</p>
        </div>
        <div className="rounded-lg bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-28px_rgba(15,23,42,0.4)] ring-1 ring-slate-200/80">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Sparkles size={17} className="text-orange-500" />
            Hero Package
          </div>
          <p className="mt-4 truncate text-xl font-black text-slate-950">{data.serviceLeaders[0]?.name || 'No hero package yet'}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {data.serviceLeaders[0] ? `${formatPesoWhole(data.serviceLeaders[0].revenue)} in month-to-date premium revenue.` : 'Your top-performing package will appear after sales are recorded.'}
          </p>
        </div>
      </div>
    </div>
  );
}
