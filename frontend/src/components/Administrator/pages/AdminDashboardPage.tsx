import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Props {
  users: any[];
  activityLogs: any[];
  bookings?: any[];
  services?: any[];
  inventory?: any[];
  payments?: any[];
  loading: boolean;
  /** When false (dashboard tab hidden), charts are not mounted to avoid Recharts size warnings. */
  chartsVisible?: boolean;
  onRefreshOverview?: () => void | Promise<void>;
  onExportReport?: () => void | Promise<void>;
}

type PipelineStage = 'pending' | 'confirmed' | 'in_progress' | 'quality_check' | 'completed' | 'cancelled';
type TrendDirection = 'up' | 'down' | 'neutral';
type TrendTone = 'positive' | 'negative' | 'neutral';
type ActivityKind = 'sales' | 'qc' | 'inventory' | 'system';

type TrendInfo = {
  direction: TrendDirection;
  tone: TrendTone;
  label: string;
};

type ActivityItem = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  kind: ActivityKind;
};

type TransactionRow = {
  id: string;
  reference: string;
  customer: string;
  vehicle: string;
  service: string;
  scheduleDate: string;
  scheduleTime: string;
  amount: number;
  paymentStatus: string;
  paymentTone: string;
  jobStatus: string;
  jobTone: string;
  timestamp: string;
};

const CHART_GRID_STROKE = '#E8EDF4';
const CHART_TICK = { fontSize: 11, fill: '#64748B' };
const SERVICE_CATEGORY_DEFS = [
  { key: 'ppf', label: 'PPF', color: '#2563EB' },
  { key: 'ceramic', label: 'Ceramic Coating', color: '#F97316' },
  { key: 'tint', label: 'Window Tint', color: '#8B5CF6' },
  { key: 'interior', label: 'Interior Detailing', color: '#14B8A6' },
  { key: 'exterior', label: 'Exterior Detailing', color: '#22C55E' },
  { key: 'other', label: 'Other Services', color: '#94A3B8' },
] as const;

const PIPELINE_DEFS: Array<{ key: PipelineStage; label: string; color: string }> = [
  { key: 'pending', label: 'Pending', color: '#F59E0B' },
  { key: 'confirmed', label: 'Confirmed', color: '#2563EB' },
  { key: 'in_progress', label: 'In Service', color: '#0891B2' },
  { key: 'quality_check', label: 'Quality Check', color: '#7C3AED' },
  { key: 'completed', label: 'Completed', color: '#10B981' },
  { key: 'cancelled', label: 'Cancelled', color: '#EF4444' },
];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toValidDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function getBookingDate(booking: any) {
  return toValidDate(
    booking?.bookingDate ||
    booking?.date ||
    booking?.scheduledDate ||
    booking?.appointmentDate ||
    booking?.createdAt,
  );
}

function getBookingActivityDate(booking: any) {
  return toValidDate(booking?.createdAt || booking?.updatedAt || booking?.bookingDate || booking?.date);
}

function getBookingTimestamp(booking: any) {
  return String(
    booking?.serviceTrackingUpdatedAt ||
    booking?.updatedAt ||
    booking?.paidAt ||
    booking?.createdAt ||
    booking?.bookingDate ||
    booking?.date ||
    '',
  );
}

function getBookingAmount(booking: any) {
  return Math.max(0, Number(booking?.totalPrice ?? booking?.totalAmount ?? 0) || 0);
}

function getPendingBalance(booking: any) {
  const total = getBookingAmount(booking);
  const downpayment = Math.max(
    0,
    Number(
      booking?.downPaymentAmount ??
      booking?.downpayment ??
      booking?.billing?.downpayment ??
      booking?.warrantyAndReceipt?.amountPaid ??
      0,
    ) || 0,
  );
  return Math.max(0, total - downpayment);
}

function getServiceName(booking: any) {
  return String(
    booking?.serviceName ||
    booking?.serviceType ||
    booking?.jobOrder?.serviceCategory ||
    booking?.items?.[0]?.product?.name ||
    booking?.items?.[0]?.name ||
    'Service',
  ).trim();
}

function classifyService(value: string) {
  const name = value.toLowerCase();
  if (/\bppf\b|paint protection film|xpel|zivent|vinyl frog/.test(name)) return 'ppf';
  if (/ceramic|graphene|sonax|\bspf\b|coating/.test(name)) return 'ceramic';
  if (/tint|window film|nano ceramic window/.test(name)) return 'tint';
  if (/interior|cabin|upholstery|leather|deep clean/.test(name)) return 'interior';
  if (/exterior|wash|paint correction|polish|wax|engine detail/.test(name)) return 'exterior';
  return 'other';
}

function getPipelineStage(booking: any): PipelineStage {
  const rawStage = String(
    booking?.serviceTrackingStage ||
    booking?.trackingStage ||
    booking?.customerStatus ||
    booking?.stage ||
    booking?.status ||
    '',
  )
    .toLowerCase()
    .replace(/-/g, '_');

  if (['cancelled', 'canceled', 'rejected', 'failed', 'expired', 'no_show'].includes(rawStage)) return 'cancelled';
  if (rawStage.includes('quality_check') || rawStage === 'qc' || rawStage === 'ready_pickup' || rawStage === 'ready') {
    return 'quality_check';
  }
  if (['completed', 'paid', 'released'].includes(rawStage)) return 'completed';
  if (['in_progress', 'started', 'active', 'received', 'washing', 'detailing', 'finishing'].includes(rawStage)) {
    return 'in_progress';
  }
  if (['confirmed', 'approved', 'assigned'].includes(rawStage)) return 'confirmed';
  return 'pending';
}

function isCancelledBooking(booking: any) {
  return getPipelineStage(booking) === 'cancelled';
}

function isPaidBooking(booking: any) {
  return ['paid', 'succeeded', 'completed'].includes(String(booking?.paymentStatus || '').toLowerCase());
}

function isSuccessfulPayment(payment: any) {
  return ['succeeded', 'paid', 'completed'].includes(String(payment?.status || '').toLowerCase());
}

function formatPeso(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatCompactPeso(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  if (Math.abs(amount) < 1000) return formatPeso(amount);
  return `₱${new Intl.NumberFormat('en-PH', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)}`;
}

function formatShortDate(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortTime(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '';
  return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(date);
}

function formatSchedule(booking: any) {
  const date = getBookingDate(booking);
  const rawTime = booking?.bookingTime || booking?.time || booking?.scheduledTime || '';
  return {
    date: date ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    time: rawTime ? String(rawTime) : date ? formatShortTime(date) : '',
  };
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function buildTrend(current: number, previous: number, lowerIsBetter = false): TrendInfo {
  const change = percentageChange(current, previous);
  const direction: TrendDirection = change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'neutral';
  const favorable = lowerIsBetter ? change < 0 : change > 0;
  const tone: TrendTone = direction === 'neutral' ? 'neutral' : favorable ? 'positive' : 'negative';
  const rounded = Math.abs(change) >= 10 ? Math.round(Math.abs(change)) : Math.round(Math.abs(change) * 10) / 10;
  return {
    direction,
    tone,
    label: `${rounded}% vs prior period`,
  };
}

function pipelineLabel(stage: PipelineStage) {
  return PIPELINE_DEFS.find((item) => item.key === stage)?.label || 'Pending';
}

function paymentStatusMeta(rawStatus: unknown) {
  const status = String(rawStatus || 'unpaid').toLowerCase();
  if (['succeeded', 'paid', 'completed'].includes(status)) return { label: 'Paid', tone: 'paid' };
  if (status === 'refunded') return { label: 'Refunded', tone: 'refunded' };
  if (status === 'failed') return { label: 'Failed', tone: 'failed' };
  return { label: status === 'pending' ? 'Pending' : 'Unpaid', tone: 'pending' };
}

function jobStatusTone(stage: PipelineStage) {
  if (stage === 'completed') return 'complete';
  if (stage === 'cancelled') return 'cancelled';
  if (stage === 'quality_check') return 'qc';
  if (stage === 'in_progress') return 'active';
  if (stage === 'confirmed') return 'confirmed';
  return 'pending';
}

function activityKind(log: any): ActivityKind {
  const value = `${log?.type || ''} ${log?.module || ''} ${log?.action || ''} ${log?.title || ''}`.toLowerCase();
  if (/quality|qc|checker|inspection/.test(value)) return 'qc';
  if (/inventory|stock|product/.test(value)) return 'inventory';
  if (/sale|payment|booking|invoice|transaction|order/.test(value)) return 'sales';
  return 'system';
}

function AdminChartBox({
  height,
  className = '',
  children,
}: {
  height: number;
  className?: string;
  children: React.ReactElement;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setReady(rect.width > 0 && rect.height > 0);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`ah-analytics-chart-canvas ${className}`}
      style={{ width: '100%', height, minHeight: height, minWidth: 0 }}
    >
      {ready ? (
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

function AnalyticsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ah-analytics-tooltip">
      <strong>{label}</strong>
      {payload
        .filter((entry: any) => entry?.value !== undefined)
        .map((entry: any) => {
          const isCurrency = /revenue|collected|outstanding|amount/i.test(String(entry.dataKey || entry.name || ''));
          return (
            <div key={`${entry.dataKey}-${entry.name}`}>
              <span>
                <i style={{ background: entry.color }} />
                {entry.name}
              </span>
              <b>{isCurrency ? formatPeso(Number(entry.value || 0)) : Number(entry.value || 0).toLocaleString()}</b>
            </div>
          );
        })}
    </div>
  );
}

function EmptyWidget({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="ah-analytics-empty">
      <Sparkles size={22} aria-hidden />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="ah-analytics-card-head">
      <div className="ah-analytics-card-heading">
        <span className="ah-analytics-card-icon"><Icon size={17} aria-hidden /></span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {aside}
    </div>
  );
}

function KpiSparkline({
  id,
  data,
  color,
  visible,
}: {
  id: string;
  data: number[];
  color: string;
  visible: boolean;
}) {
  if (!visible) return <div className="ah-analytics-kpi-spark-placeholder" />;
  const points = data.map((value, index) => ({ index, value }));
  return (
    <AdminChartBox height={48} className="ah-analytics-kpi-spark">
      <AreaChart data={points} margin={{ top: 5, right: 1, left: 1, bottom: 1 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#spark-${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </AdminChartBox>
  );
}

function TrendBadge({ trend }: { trend?: TrendInfo }) {
  if (!trend) return null;
  const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Activity;
  return (
    <span className={`ah-analytics-kpi-trend ah-analytics-kpi-trend--${trend.tone}`}>
      <Icon size={12} aria-hidden />
      {trend.label}
    </span>
  );
}

function ActivityGlyph({ kind }: { kind: ActivityKind }) {
  if (kind === 'qc') return <ShieldCheck size={15} aria-hidden />;
  if (kind === 'inventory') return <PackageSearch size={15} aria-hidden />;
  if (kind === 'sales') return <CircleDollarSign size={15} aria-hidden />;
  return <Activity size={15} aria-hidden />;
}

export default function AdminDashboardPage({
  activityLogs,
  bookings = [],
  services = [],
  inventory = [],
  payments = [],
  loading,
  chartsVisible = true,
  onRefreshOverview,
  onExportReport,
}: Props) {
  const [refreshingOverview, setRefreshingOverview] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

  const handleRefreshOverview = async () => {
    if (!onRefreshOverview || refreshingOverview) return;
    setRefreshingOverview(true);
    try {
      await onRefreshOverview();
    } catch (error) {
      console.error('[AdminDashboardPage] overview refresh failed:', error);
    } finally {
      setRefreshingOverview(false);
    }
  };

  const handleExportReport = async () => {
    if (!onExportReport || exportingReport) return;
    setExportingReport(true);
    try {
      await onExportReport();
    } catch (error) {
      console.error('[AdminDashboardPage] report export failed:', error);
    } finally {
      setExportingReport(false);
    }
  };

  const safeBookings = useMemo(() => (Array.isArray(bookings) ? bookings : []), [bookings]);
  const safeServices = useMemo(() => (Array.isArray(services) ? services : []), [services]);
  const safeInventory = useMemo(() => (Array.isArray(inventory) ? inventory : []), [inventory]);
  const safePayments = useMemo(() => (Array.isArray(payments) ? payments : []), [payments]);
  const safeActivityLogs = useMemo(() => (Array.isArray(activityLogs) ? activityLogs : []), [activityLogs]);
  const now = useMemo(() => new Date(), []);
  const today = useMemo(() => startOfDay(now), [now]);
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const yesterdayKey = useMemo(() => formatDateKey(addDays(today, -1)), [today]);
  const successfulPayments = useMemo(() => safePayments.filter(isSuccessfulPayment), [safePayments]);
  const hasPaymentRecords = safePayments.length > 0;

  const activeServices = useMemo(
    () =>
      safeServices.filter((service) => {
        const status = String(service?.status || '').toLowerCase();
        return status === 'active' || service?.isPublished === true;
      }),
    [safeServices],
  );

  const pendingBookings = useMemo(
    () =>
      safeBookings.filter(
        (booking) => !isCancelledBooking(booking) && !isPaidBooking(booking) && getPendingBalance(booking) > 0,
      ),
    [safeBookings],
  );

  const lowStockItems = useMemo(
    () =>
      safeInventory
        .filter((item) => Number(item?.stock || 0) <= Number(item?.minLevel ?? 0))
        .sort((a, b) => {
          const aMin = Math.max(1, Number(a?.minLevel || 1));
          const bMin = Math.max(1, Number(b?.minLevel || 1));
          return Number(a?.stock || 0) / aMin - Number(b?.stock || 0) / bMin;
        }),
    [safeInventory],
  );

  const revenueForDateKey = (dateKey: string) => {
    if (hasPaymentRecords) {
      return successfulPayments.reduce((sum, payment) => {
        const date = toValidDate(payment?.createdAt || payment?.paidAt);
        return date && formatDateKey(date) === dateKey ? sum + (Number(payment?.amount || 0) || 0) : sum;
      }, 0);
    }
    return safeBookings.reduce((sum, booking) => {
      if (!isPaidBooking(booking)) return sum;
      const date = toValidDate(booking?.paidAt || booking?.updatedAt || booking?.createdAt);
      return date && formatDateKey(date) === dateKey ? sum + getBookingAmount(booking) : sum;
    }, 0);
  };

  const todayRevenue = useMemo(
    () => revenueForDateKey(todayKey),
    [hasPaymentRecords, safeBookings, successfulPayments, todayKey],
  );
  const yesterdayRevenue = useMemo(
    () => revenueForDateKey(yesterdayKey),
    [hasPaymentRecords, safeBookings, successfulPayments, yesterdayKey],
  );
  const pendingPaymentTotal = useMemo(
    () => pendingBookings.reduce((sum, booking) => sum + getPendingBalance(booking), 0),
    [pendingBookings],
  );

  const dailyKpiSeries = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
    return {
      bookings: days.map((day) => {
        const key = formatDateKey(day);
        return safeBookings.filter((booking) => {
          const date = getBookingActivityDate(booking);
          return date && formatDateKey(date) === key;
        }).length;
      }),
      activeServices: days.map((day) => {
        const key = formatDateKey(day);
        return new Set(
          safeBookings
            .filter((booking) => {
              const date = getBookingActivityDate(booking);
              return date && formatDateKey(date) === key && !isCancelledBooking(booking);
            })
            .map((booking) => getServiceName(booking).toLowerCase()),
        ).size;
      }),
      revenue: days.map((day) => revenueForDateKey(formatDateKey(day))),
      pending: days.map((day) => {
        const key = formatDateKey(day);
        return pendingBookings.reduce((sum, booking) => {
          const date = getBookingActivityDate(booking);
          return date && formatDateKey(date) === key ? sum + getPendingBalance(booking) : sum;
        }, 0);
      }),
      stock: lowStockItems.length > 0
        ? lowStockItems.slice(0, 7).map((item) => Number(item?.stock || 0))
        : [0, 0, 0, 0, 0, 0, 0],
    };
  }, [
    hasPaymentRecords,
    lowStockItems,
    pendingBookings,
    safeBookings,
    successfulPayments,
    today,
  ]);

  const periodComparisons = useMemo(() => {
    const currentStart = addDays(today, -6);
    const previousStart = addDays(today, -13);
    const previousEnd = addDays(today, -7);
    const countBookings = (start: Date, end: Date) =>
      safeBookings.filter((booking) => {
        const date = getBookingActivityDate(booking);
        return date && date >= start && date < addDays(end, 1);
      }).length;
    const activeDemand = (start: Date, end: Date) =>
      new Set(
        safeBookings
          .filter((booking) => {
            const date = getBookingActivityDate(booking);
            return date && date >= start && date < addDays(end, 1) && !isCancelledBooking(booking);
          })
          .map((booking) => getServiceName(booking).toLowerCase()),
      ).size;
    const newPending = (start: Date, end: Date) =>
      pendingBookings.filter((booking) => {
        const date = getBookingActivityDate(booking);
        return date && date >= start && date < addDays(end, 1);
      }).length;

    return {
      bookings: buildTrend(countBookings(currentStart, today), countBookings(previousStart, previousEnd)),
      services: buildTrend(activeDemand(currentStart, today), activeDemand(previousStart, previousEnd)),
      revenue: buildTrend(todayRevenue, yesterdayRevenue),
      pending: buildTrend(newPending(currentStart, today), newPending(previousStart, previousEnd), true),
    };
  }, [pendingBookings, safeBookings, today, todayRevenue, yesterdayRevenue]);

  const kpis = useMemo(
    () => [
      {
        key: 'bookings',
        label: 'Total Bookings',
        value: safeBookings.length.toLocaleString('en-PH'),
        detail: `${dailyKpiSeries.bookings.reduce((sum, value) => sum + value, 0)} added in the last 7 days`,
        icon: CalendarDays,
        color: '#2563EB',
        trend: periodComparisons.bookings,
        spark: dailyKpiSeries.bookings,
      },
      {
        key: 'services',
        label: 'Active Services',
        value: activeServices.length.toLocaleString('en-PH'),
        detail: `${safeServices.length} total catalog entries`,
        icon: Wrench,
        color: '#7C3AED',
        trend: periodComparisons.services,
        spark: dailyKpiSeries.activeServices,
      },
      {
        key: 'revenue',
        label: "Today's Revenue",
        value: formatCompactPeso(todayRevenue),
        detail: hasPaymentRecords ? 'Successful collections today' : 'Derived from paid bookings',
        icon: CircleDollarSign,
        color: '#10B981',
        trend: periodComparisons.revenue,
        spark: dailyKpiSeries.revenue,
      },
      {
        key: 'pending',
        label: 'Pending Payments',
        value: formatCompactPeso(pendingPaymentTotal),
        detail: `${pendingBookings.length} booking${pendingBookings.length === 1 ? '' : 's'} awaiting settlement`,
        icon: CreditCard,
        color: '#F59E0B',
        trend: periodComparisons.pending,
        spark: dailyKpiSeries.pending,
        alert: pendingBookings.length > 0,
      },
      {
        key: 'stock',
        label: 'Low Stock Alerts',
        value: lowStockItems.length.toLocaleString('en-PH'),
        detail: `${lowStockItems.filter((item) => Number(item?.stock || 0) === 0).length} out of stock`,
        icon: PackageSearch,
        color: '#EF4444',
        spark: dailyKpiSeries.stock,
        alert: lowStockItems.length > 0,
      },
    ],
    [
      activeServices.length,
      dailyKpiSeries,
      hasPaymentRecords,
      lowStockItems,
      pendingBookings.length,
      pendingPaymentTotal,
      periodComparisons,
      safeBookings.length,
      safeServices.length,
      todayRevenue,
    ],
  );

  const weeklyTrend = useMemo(() => {
    return Array.from({ length: 8 }, (_, index) => {
      const offset = 7 - index;
      const start = addDays(today, -(offset * 7 + 6));
      const end = addDays(start, 6);
      const bookingCount = safeBookings.filter((booking) => {
        const date = getBookingActivityDate(booking);
        return date && date >= start && date < addDays(end, 1);
      }).length;
      const revenue = hasPaymentRecords
        ? successfulPayments.reduce((sum, payment) => {
            const date = toValidDate(payment?.createdAt || payment?.paidAt);
            return date && date >= start && date < addDays(end, 1)
              ? sum + (Number(payment?.amount || 0) || 0)
              : sum;
          }, 0)
        : safeBookings.reduce((sum, booking) => {
            if (!isPaidBooking(booking)) return sum;
            const date = toValidDate(booking?.paidAt || booking?.updatedAt || booking?.createdAt);
            return date && date >= start && date < addDays(end, 1) ? sum + getBookingAmount(booking) : sum;
          }, 0);
      return {
        label: start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        bookings: bookingCount,
        revenue,
      };
    });
  }, [hasPaymentRecords, safeBookings, successfulPayments, today]);

  const serviceBreakdown = useMemo(() => {
    const counts = new Map<string, number>(SERVICE_CATEGORY_DEFS.map((item) => [item.key, 0]));
    safeBookings.forEach((booking) => {
      if (isCancelledBooking(booking)) return;
      const key = classifyService(getServiceName(booking));
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return SERVICE_CATEGORY_DEFS.map((item) => ({ ...item, value: counts.get(item.key) || 0 }));
  }, [safeBookings]);
  const serviceBreakdownTotal = useMemo(
    () => serviceBreakdown.reduce((sum, item) => sum + item.value, 0),
    [serviceBreakdown],
  );

  const topServices = useMemo(() => {
    const totals = new Map<string, { count: number; revenue: number }>();
    safeBookings.forEach((booking) => {
      if (isCancelledBooking(booking)) return;
      const name = getServiceName(booking);
      const current = totals.get(name) || { count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += getBookingAmount(booking);
      totals.set(name, current);
    });
    return [...totals.entries()]
      .map(([name, value]) => ({ name, ...value, category: classifyService(name) }))
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
      .slice(0, 5);
  }, [safeBookings]);
  const maxTopServiceRevenue = Math.max(...topServices.map((item) => item.revenue), 1);

  const sevenDayRevenue = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(today, index - 6);
      const key = formatDateKey(day);
      const collected = revenueForDateKey(key);
      const outstanding = pendingBookings.reduce((sum, booking) => {
        const date = getBookingActivityDate(booking) || getBookingDate(booking);
        return date && formatDateKey(date) === key ? sum + getPendingBalance(booking) : sum;
      }, 0);
      return {
        label: day.toLocaleDateString('en-PH', { weekday: 'short' }),
        collected,
        outstanding,
      };
    });
  }, [hasPaymentRecords, pendingBookings, safeBookings, successfulPayments, today]);

  const pipelineData = useMemo(() => {
    const counts = Object.fromEntries(PIPELINE_DEFS.map((item) => [item.key, 0])) as Record<PipelineStage, number>;
    safeBookings.forEach((booking) => {
      counts[getPipelineStage(booking)] += 1;
    });
    const total = PIPELINE_DEFS.reduce((sum, item) => sum + counts[item.key], 0);
    return {
      total,
      active: counts.confirmed + counts.in_progress + counts.quality_check,
      rows: PIPELINE_DEFS.map((item) => ({
        ...item,
        count: counts[item.key],
        percent: total > 0 ? Math.round((counts[item.key] / total) * 100) : 0,
      })),
    };
  }, [safeBookings]);

  const activityFeed = useMemo<ActivityItem[]>(() => {
    if (safeActivityLogs.length > 0) {
      return [...safeActivityLogs]
        .sort((a, b) => {
          const aTime = toValidDate(a?.createdAt)?.getTime() || 0;
          const bTime = toValidDate(b?.createdAt)?.getTime() || 0;
          return bTime - aTime;
        })
        .slice(0, 7)
        .map((log, index) => ({
          id: String(log?._id || log?.id || `activity-${index}`),
          title: String(log?.title || log?.action || log?.type || 'System activity'),
          description: String(log?.description || log?.userName || log?.module || 'Operational update'),
          timestamp: String(log?.createdAt || ''),
          kind: activityKind(log),
        }));
    }

    return [...safeBookings]
      .sort((a, b) => {
        const aTime = toValidDate(getBookingTimestamp(a))?.getTime() || 0;
        const bTime = toValidDate(getBookingTimestamp(b))?.getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 7)
      .map((booking, index) => {
        const stage = getPipelineStage(booking);
        const kind: ActivityKind = stage === 'quality_check' ? 'qc' : stage === 'completed' ? 'sales' : 'system';
        return {
          id: String(booking?._id || booking?.id || `booking-activity-${index}`),
          title: `${pipelineLabel(stage)}: ${getServiceName(booking)}`,
          description: `${booking?.customerName || 'Customer'} · ${booking?.vehicleInfo || booking?.vehiclePlate || 'Vehicle'}`,
          timestamp: getBookingTimestamp(booking),
          kind,
        };
      });
  }, [safeActivityLogs, safeBookings]);

  const transactionRows = useMemo<TransactionRow[]>(() => {
    const bookingById = new Map<string, any>();
    const bookingByInvoice = new Map<string, any>();
    safeBookings.forEach((booking) => {
      [booking?.id, booking?._id].filter(Boolean).forEach((id) => bookingById.set(String(id), booking));
      [booking?.invoiceId, booking?.orderNumber, booking?.bookingReference]
        .filter(Boolean)
        .forEach((reference) => bookingByInvoice.set(String(reference), booking));
    });

    const matchedBookingIds = new Set<string>();
    const rows: TransactionRow[] = safePayments.map((payment, index) => {
      const order = payment?.order;
      const orderId = typeof order === 'object' ? order?._id || order?.id : order;
      const booking =
        (orderId ? bookingById.get(String(orderId)) : undefined) ||
        (payment?.invoiceId ? bookingByInvoice.get(String(payment.invoiceId)) : undefined);
      const bookingId = booking ? String(booking?._id || booking?.id || '') : '';
      if (bookingId) matchedBookingIds.add(bookingId);
      const schedule = booking ? formatSchedule(booking) : { date: '—', time: '' };
      const paymentMeta = paymentStatusMeta(payment?.status);
      const stage = booking ? getPipelineStage(booking) : 'completed';
      const timestamp = String(payment?.createdAt || booking?.updatedAt || booking?.createdAt || '');
      const service = booking
        ? getServiceName(booking)
        : String(order?.serviceType || payment?.items?.map((item: any) => item?.name).filter(Boolean).join(', ') || 'Service');
      return {
        id: String(payment?._id || payment?.id || `payment-${index}`),
        reference: String(payment?.invoiceId || order?.orderNumber || booking?.orderNumber || `TXN-${index + 1}`),
        customer: String(booking?.customerName || payment?.customer?.name || order?.customerName || 'Customer'),
        vehicle: String(
          booking?.vehicleInfo ||
          [booking?.vehicleYear, booking?.vehicleMake, booking?.vehicleModel].filter(Boolean).join(' ') ||
          booking?.vehiclePlate ||
          'Vehicle not specified',
        ),
        service,
        scheduleDate: schedule.date,
        scheduleTime: schedule.time,
        amount: Number(payment?.amount ?? getBookingAmount(booking)) || 0,
        paymentStatus: paymentMeta.label,
        paymentTone: paymentMeta.tone,
        jobStatus: booking ? pipelineLabel(stage) : 'Recorded',
        jobTone: booking ? jobStatusTone(stage) : 'complete',
        timestamp,
      };
    });

    safeBookings.forEach((booking, index) => {
      const bookingId = String(booking?._id || booking?.id || '');
      if (bookingId && matchedBookingIds.has(bookingId)) return;
      const schedule = formatSchedule(booking);
      const paymentMeta = paymentStatusMeta(booking?.paymentStatus);
      const stage = getPipelineStage(booking);
      rows.push({
        id: bookingId || `booking-${index}`,
        reference: String(booking?.orderNumber || booking?.bookingReference || booking?.invoiceId || `BOOK-${index + 1}`),
        customer: String(booking?.customerName || booking?.customer?.name || 'Customer'),
        vehicle: String(
          booking?.vehicleInfo ||
          [booking?.vehicleYear, booking?.vehicleMake, booking?.vehicleModel].filter(Boolean).join(' ') ||
          booking?.vehiclePlate ||
          'Vehicle not specified',
        ),
        service: getServiceName(booking),
        scheduleDate: schedule.date,
        scheduleTime: schedule.time,
        amount: getBookingAmount(booking),
        paymentStatus: paymentMeta.label,
        paymentTone: paymentMeta.tone,
        jobStatus: pipelineLabel(stage),
        jobTone: jobStatusTone(stage),
        timestamp: getBookingTimestamp(booking),
      });
    });

    return rows
      .sort((a, b) => {
        const aTime = toValidDate(a.timestamp)?.getTime() || 0;
        const bTime = toValidDate(b.timestamp)?.getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 12);
  }, [safeBookings, safePayments]);

  const weeklyRevenueTotal = weeklyTrend.reduce((sum, item) => sum + item.revenue, 0);
  const weeklyBookingTotal = weeklyTrend.reduce((sum, item) => sum + item.bookings, 0);
  const collectedSevenDays = sevenDayRevenue.reduce((sum, item) => sum + item.collected, 0);

  if (loading) {
    return (
      <div className="ah-page-enter admin-dashboard-page ah-analytics-dashboard">
        <div className="ah-dashboard-header">
          <div>
            <div className="ah-skeleton" style={{ width: 230, height: 30, borderRadius: 8 }} />
            <div className="ah-skeleton" style={{ width: 420, maxWidth: '100%', height: 15, borderRadius: 8, marginTop: 8 }} />
          </div>
        </div>
        <div className="ah-analytics-kpi-grid">
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className="ah-skeleton" style={{ height: 154, borderRadius: 14 }} />)}
        </div>
        <div className="ah-analytics-primary-grid">
          <div className="ah-skeleton" style={{ height: 390, borderRadius: 14 }} />
          <div className="ah-skeleton" style={{ height: 390, borderRadius: 14 }} />
        </div>
        <div className="ah-analytics-secondary-grid">
          {[1, 2, 3].map((item) => <div key={item} className="ah-skeleton" style={{ height: 330, borderRadius: 14 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="ah-page-enter admin-dashboard-page ah-analytics-dashboard">
      <div className="ah-dashboard-header ah-slide-up">
        <div className="ah-dashboard-header-copy">
          <div className="ah-analytics-eyebrow">
            <span />
            Operational intelligence
          </div>
          <h1 className="ah-dashboard-title">Admin Overview</h1>
          <p className="ah-dashboard-subtitle">
            Revenue, bookings, service demand, job progress, and shop readiness in one workspace.
          </p>
        </div>
        <div className="ah-dashboard-actions" aria-label="Dashboard actions">
          <span className="ah-analytics-snapshot">
            <CheckCircle2 size={14} aria-hidden />
            Updated from current shop data
          </span>
          {onRefreshOverview && (
            <button
              type="button"
              className="ah-dashboard-action"
              onClick={handleRefreshOverview}
              disabled={refreshingOverview}
            >
              <RefreshCw
                size={15}
                className={refreshingOverview ? 'ah-dashboard-action-spinner' : undefined}
                aria-hidden
              />
              <span>{refreshingOverview ? 'Refreshing' : 'Refresh'}</span>
            </button>
          )}
          {onExportReport && (
            <button
              type="button"
              className="ah-dashboard-action ah-dashboard-action--primary"
              onClick={handleExportReport}
              disabled={exportingReport}
            >
              <Download size={15} aria-hidden />
              <span>{exportingReport ? 'Exporting' : 'Export Report'}</span>
            </button>
          )}
        </div>
      </div>

      <section className="ah-analytics-kpi-grid" aria-label="Key performance indicators">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <article
              key={kpi.key}
              className="ah-analytics-kpi-card ah-slide-up"
              style={{
                '--ah-analytics-accent': kpi.color,
                animationDelay: `${index * 0.045}s`,
              } as React.CSSProperties}
            >
              <div className="ah-analytics-kpi-copy">
                <div className="ah-analytics-kpi-label">
                  <span><Icon size={16} aria-hidden /></span>
                  <p>{kpi.label}</p>
                  {'alert' in kpi && kpi.alert ? <AlertTriangle size={13} className="ah-analytics-kpi-alert" aria-hidden /> : null}
                </div>
                <strong className="ah-analytics-kpi-value tabular-nums">{kpi.value}</strong>
                <TrendBadge trend={kpi.trend} />
                <p className="ah-analytics-kpi-detail">{kpi.detail}</p>
              </div>
              <KpiSparkline id={kpi.key} data={kpi.spark} color={kpi.color} visible={chartsVisible} />
            </article>
          );
        })}
      </section>

      <section className="ah-analytics-primary-grid">
        <article className="ah-analytics-card ah-analytics-card--hero ah-slide-up">
          <SectionHeader
            icon={TrendingUp}
            title="Bookings vs Revenue"
            subtitle="Rolling eight-week view of booking demand and collected revenue"
            aside={(
              <div className="ah-analytics-inline-stats">
                <span><b>{weeklyBookingTotal}</b> bookings</span>
                <span><b>{formatCompactPeso(weeklyRevenueTotal)}</b> revenue</span>
              </div>
            )}
          />
          <div className="ah-analytics-chart-legend" aria-label="Chart legend">
            <span><i className="ah-analytics-legend-bookings" />Bookings</span>
            <span><i className="ah-analytics-legend-revenue" />Revenue</span>
          </div>
          {chartsVisible ? (
            <AdminChartBox height={302}>
              <ComposedChart data={weeklyTrend} margin={{ top: 12, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F97316" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="4 5" vertical={false} />
                <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="bookings"
                  allowDecimals={false}
                  tick={CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="right"
                  tick={CHART_TICK}
                  tickFormatter={(value) => formatCompactPeso(Number(value))}
                  axisLine={false}
                  tickLine={false}
                  width={58}
                />
                <Tooltip content={<AnalyticsTooltip />} />
                <Bar
                  yAxisId="bookings"
                  dataKey="bookings"
                  name="Bookings"
                  fill="#2563EB"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={32}
                  isAnimationActive={false}
                />
                <Area
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#F97316"
                  strokeWidth={2.8}
                  fill="url(#adminRevenueGradient)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </AdminChartBox>
          ) : null}
        </article>

        <article className="ah-analytics-card ah-slide-up" style={{ animationDelay: '0.08s' }}>
          <SectionHeader
            icon={Sparkles}
            title="Service Breakdown"
            subtitle="Booking mix across AutoSPF+ service families"
          />
          {serviceBreakdownTotal > 0 ? (
            <>
              <div className="ah-analytics-donut-wrap">
                {chartsVisible ? (
                  <AdminChartBox height={226}>
                    <PieChart>
                      <Pie
                        data={serviceBreakdown.filter((item) => item.value > 0)}
                        dataKey="value"
                        nameKey="label"
                        innerRadius="61%"
                        outerRadius="82%"
                        paddingAngle={3}
                        stroke="#fff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {serviceBreakdown.filter((item) => item.value > 0).map((item) => (
                          <Cell key={item.key} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | string) => [Number(value || 0).toLocaleString(), 'Bookings']}
                        contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
                      />
                    </PieChart>
                  </AdminChartBox>
                ) : null}
                <div className="ah-analytics-donut-center">
                  <strong>{serviceBreakdownTotal}</strong>
                  <span>Bookings</span>
                </div>
              </div>
              <div className="ah-analytics-service-legend">
                {serviceBreakdown.map((item) => (
                  <div key={item.key}>
                    <span><i style={{ background: item.color }} />{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyWidget title="No service mix yet" detail="Booking categories will appear when appointments are recorded." />
          )}
        </article>
      </section>

      <section className="ah-analytics-secondary-grid">
        <article className="ah-analytics-card ah-slide-up" style={{ animationDelay: '0.12s' }}>
          <SectionHeader
            icon={Wrench}
            title="Top Services"
            subtitle="Highest-value services in the current booking set"
          />
          {topServices.length > 0 ? (
            <div className="ah-analytics-top-services">
              {topServices.map((service, index) => {
                const category = SERVICE_CATEGORY_DEFS.find((item) => item.key === service.category) || SERVICE_CATEGORY_DEFS[5];
                return (
                  <div key={service.name} className="ah-analytics-top-service">
                    <span className="ah-analytics-service-rank">{String(index + 1).padStart(2, '0')}</span>
                    <div className="ah-analytics-service-main">
                      <div>
                        <strong title={service.name}>{service.name}</strong>
                        <span>{service.count} booking{service.count === 1 ? '' : 's'}</span>
                      </div>
                      <b>{formatCompactPeso(service.revenue)}</b>
                      <div className="ah-analytics-progress">
                        <span
                          style={{
                            width: `${Math.max(5, (service.revenue / maxTopServiceRevenue) * 100)}%`,
                            background: category.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyWidget title="No ranked services" detail="Revenue leaders will appear after bookings are added." />
          )}
        </article>

        <article className="ah-analytics-card ah-slide-up" style={{ animationDelay: '0.16s' }}>
          <SectionHeader
            icon={CircleDollarSign}
            title="Revenue Statistics"
            subtitle="Collected and outstanding value over the last seven days"
            aside={<strong className="ah-analytics-card-total">{formatCompactPeso(collectedSevenDays)}</strong>}
          />
          <div className="ah-analytics-chart-legend">
            <span><i className="ah-analytics-legend-collected" />Collected</span>
            <span><i className="ah-analytics-legend-outstanding" />Outstanding</span>
          </div>
          {chartsVisible ? (
            <AdminChartBox height={246}>
              <BarChart data={sevenDayRevenue} margin={{ top: 14, right: 2, left: -8, bottom: 0 }} barGap={5}>
                <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="4 5" vertical={false} />
                <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={CHART_TICK}
                  tickFormatter={(value) => formatCompactPeso(Number(value))}
                  axisLine={false}
                  tickLine={false}
                  width={58}
                />
                <Tooltip content={<AnalyticsTooltip />} />
                <Bar
                  dataKey="collected"
                  name="Collected"
                  fill="#10B981"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="outstanding"
                  name="Outstanding"
                  fill="#FDBA74"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </AdminChartBox>
          ) : null}
        </article>

        <article className="ah-analytics-card ah-slide-up" style={{ animationDelay: '0.2s' }}>
          <SectionHeader
            icon={Car}
            title="Job Order Pipeline"
            subtitle="Current operational load across every service stage"
            aside={<strong className="ah-analytics-card-total">{pipelineData.active} active</strong>}
          />
          {pipelineData.total > 0 ? (
            <div className="ah-analytics-pipeline">
              <div className="ah-analytics-pipeline-stack" aria-label={`${pipelineData.total} total job orders`}>
                {pipelineData.rows.filter((item) => item.count > 0).map((item) => (
                  <span
                    key={item.key}
                    title={`${item.label}: ${item.count}`}
                    style={{ flexGrow: item.count, background: item.color }}
                  />
                ))}
              </div>
              <div className="ah-analytics-pipeline-list">
                {pipelineData.rows.map((item) => (
                  <div key={item.key}>
                    <span><i style={{ background: item.color }} />{item.label}</span>
                    <strong>{item.count}<small>{item.percent}%</small></strong>
                    <div className="ah-analytics-progress">
                      <span
                        style={{
                          width: `${Math.max(item.count > 0 ? 4 : 0, item.percent)}%`,
                          background: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyWidget title="No active job orders" detail="Pipeline status will appear when bookings enter operations." />
          )}
        </article>
      </section>

      <section className="ah-analytics-support-grid">
        <article className="ah-analytics-card ah-slide-up" style={{ animationDelay: '0.22s' }}>
          <SectionHeader
            icon={PackageSearch}
            title="Inventory Alerts"
            subtitle="Items at or below their configured minimum level"
            aside={lowStockItems.length > 0 ? <span className="ah-analytics-alert-count">{lowStockItems.length} alerts</span> : undefined}
          />
          {lowStockItems.length > 0 ? (
            <div className="ah-analytics-inventory-list">
              {lowStockItems.slice(0, 6).map((item, index) => {
                const stock = Number(item?.stock || 0);
                const minLevel = Math.max(1, Number(item?.minLevel || 1));
                const ratio = Math.min(100, Math.max(0, (stock / minLevel) * 100));
                const state = stock === 0 ? 'Out of stock' : stock <= minLevel * 0.5 ? 'Critical' : 'Low stock';
                const tone = stock === 0 ? 'danger' : stock <= minLevel * 0.5 ? 'critical' : 'warning';
                return (
                  <div key={String(item?._id || item?.id || index)} className="ah-analytics-inventory-item">
                    <div className={`ah-analytics-inventory-glyph ah-analytics-inventory-glyph--${tone}`}>
                      <PackageSearch size={16} aria-hidden />
                    </div>
                    <div className="ah-analytics-inventory-copy">
                      <div>
                        <strong>{item?.name || 'Inventory item'}</strong>
                        <span>{item?.category || item?.supplier || 'Shop inventory'}</span>
                      </div>
                      <div className="ah-analytics-inventory-value">
                        <b>{stock} {item?.unit || 'units'}</b>
                        <span className={`ah-analytics-stock-state ah-analytics-stock-state--${tone}`}>{state}</span>
                      </div>
                      <div className="ah-analytics-progress">
                        <span style={{ width: `${ratio}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyWidget title="Inventory is healthy" detail="No items are currently at or below their minimum level." />
          )}
        </article>

        <article className="ah-analytics-card ah-slide-up" style={{ animationDelay: '0.24s' }}>
          <SectionHeader
            icon={Activity}
            title="Recent Activity"
            subtitle="Latest sales, QC, inventory, and system events"
          />
          {activityFeed.length > 0 ? (
            <div className="ah-analytics-activity-feed">
              {activityFeed.map((item) => (
                <div key={item.id} className="ah-analytics-activity-row">
                  <span className={`ah-analytics-activity-glyph ah-analytics-activity-glyph--${item.kind}`}>
                    <ActivityGlyph kind={item.kind} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <time dateTime={item.timestamp || undefined} title={item.timestamp ? formatShortDate(item.timestamp) : undefined}>
                    {formatRelativeTime(item.timestamp)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <EmptyWidget title="No recent activity" detail="Sales and operational updates will appear here." />
          )}
        </article>
      </section>

      <section className="ah-analytics-card ah-analytics-table-card ah-slide-up" style={{ animationDelay: '0.26s' }}>
        <SectionHeader
          icon={CreditCard}
          title="Recent Transactions & Bookings"
          subtitle="Latest customer appointments, payment records, and job status"
          aside={<span className="ah-analytics-table-count">{transactionRows.length} recent records</span>}
        />
        {transactionRows.length > 0 ? (
          <div className="ah-analytics-table-scroll">
            <table className="ah-analytics-table">
              <caption>Recent AutoSPF+ customer transactions and bookings</caption>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer & Vehicle</th>
                  <th>Service</th>
                  <th>Schedule</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Job Status</th>
                  <th>Latest Update</th>
                </tr>
              </thead>
              <tbody>
                {transactionRows.map((row) => (
                  <tr key={row.id}>
                    <td><span className="ah-analytics-reference">{row.reference}</span></td>
                    <td>
                      <div className="ah-analytics-customer-cell">
                        <span>{row.customer.slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong>{row.customer}</strong>
                          <small>{row.vehicle}</small>
                        </div>
                      </div>
                    </td>
                    <td><span className="ah-analytics-service-cell" title={row.service}>{row.service}</span></td>
                    <td>
                      <div className="ah-analytics-schedule-cell">
                        <strong>{row.scheduleDate}</strong>
                        <small>{row.scheduleTime || 'Time not set'}</small>
                      </div>
                    </td>
                    <td><strong className="ah-analytics-amount tabular-nums">{formatPeso(row.amount)}</strong></td>
                    <td>
                      <span className={`ah-analytics-status ah-analytics-status--${row.paymentTone}`}>
                        {row.paymentStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`ah-analytics-status ah-analytics-status--${row.jobTone}`}>
                        {row.jobStatus}
                      </span>
                    </td>
                    <td>
                      <div className="ah-analytics-update-cell">
                        <Clock3 size={13} aria-hidden />
                        <span>{formatRelativeTime(row.timestamp)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyWidget title="No recent records" detail="Bookings and payment transactions will appear here." />
        )}
      </section>
    </div>
  );
}
