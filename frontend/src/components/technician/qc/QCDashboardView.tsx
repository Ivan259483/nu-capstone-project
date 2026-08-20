import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileWarning,
  Gauge,
  ListChecks,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import QCStatusBadge, { type QCStatus } from './QCStatusBadge';
import type { QCStats, QCJob, QCActivityItem } from '@/hooks/useQCData';

type QCView =
  | 'dashboard'
  | 'jobs'
  | 'job-detail'
  | 'ai-detection'
  | 'live-tracker';

const BAR_COLORS = ['#2563eb', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#64748b'];
const SLA_DUE_WINDOW_MINUTES = 240;
const DASH_SCOPE_OPTIONS = [
  { value: 'all' as const, label: 'All Jobs' },
  { value: 'mine' as const, label: 'My Jobs' },
];
const DASH_RANGE_OPTIONS: Array<{ value: 1 | 7 | 30; label: string }> = [
  { value: 1, label: 'Today' },
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
];

const surfaceClass = 'qc-dash-surface rounded-2xl bg-white';
const dividerClass = 'qc-dash-divider';

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white/95 px-3.5 py-2.5 text-xs shadow-[0_16px_40px_-20px_rgba(15,23,42,0.35),inset_0_0_0_1px_rgba(148,163,184,0.12)] backdrop-blur">
      <p className="mb-1.5 font-bold text-slate-800">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.dataKey || entry.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="min-w-0 flex-1 capitalize text-slate-500">{entry.name}</span>
            <span className="font-bold tabular-nums text-slate-800">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function EmptyState({
  icon: Icon,
  title,
  label,
  tone = 'blue',
}: {
  icon: React.ElementType;
  title: string;
  label: string;
  tone?: 'blue' | 'green' | 'amber' | 'violet' | 'orange';
}) {
  const tones = {
    blue: { gradient: 'from-blue-50 to-white', text: 'text-blue-600', bg: 'bg-blue-100', ring: 'ring-blue-50' },
    green: { gradient: 'from-emerald-50 to-white', text: 'text-emerald-600', bg: 'bg-emerald-100', ring: 'ring-emerald-50' },
    amber: { gradient: 'from-amber-50 to-white', text: 'text-amber-600', bg: 'bg-amber-100', ring: 'ring-amber-50' },
    violet: { gradient: 'from-violet-50 to-white', text: 'text-violet-600', bg: 'bg-violet-100', ring: 'ring-violet-50' },
    orange: { gradient: 'from-orange-50 to-white', text: 'text-orange-600', bg: 'bg-orange-100', ring: 'ring-orange-50' },
  }[tone];

  return (
    <div className={`flex min-h-[176px] flex-col items-center justify-center rounded-lg bg-gradient-to-br ${tones.gradient} px-5 py-10 text-center`}>
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-lg ${tones.bg} ${tones.ring} ring-4`}>
        <Icon size={19} className={tones.text} />
      </div>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">{label}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 px-5 pb-5">
      {[1, 2, 3].map((item) => (
        <div key={item} className="animate-pulse rounded-xl bg-slate-50/70 p-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.1)]">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-slate-200/70" />
              <div className="h-3 w-44 rounded bg-slate-100" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

type MetricTone = 'blue' | 'emerald' | 'rose' | 'amber' | 'violet' | 'slate';
type MetricDelta = {
  direction: 'up' | 'down' | 'flat';
  text: string;
};

type ComparisonFnOptions = {
  asPercent?: boolean;
  emptyLabel?: string;
};

function compareToPrevious(current: number, previous: number, options: ComparisonFnOptions = {}): MetricDelta | null {
  const { asPercent = true, emptyLabel = 'No change' } = options;
  if (previous === 0) {
    if (current === 0) return null;
    return { direction: 'up', text: asPercent ? 'New' : 'New' };
  }
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
  if (current === previous) return { direction: 'flat', text: emptyLabel };
  const diff = ((current - previous) / previous) * 100;
  return {
    direction: diff >= 0 ? 'up' : 'down',
    text: `${diff >= 0 ? '+' : ''}${Math.round(diff)}%`,
  };
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  badge,
  delta,
  action,
  actionLabel,
  period,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  tone: MetricTone;
  badge?: string;
  delta?: MetricDelta | null;
  action?: (() => void) | null;
  actionLabel?: string;
  period?: string;
}) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];

  const deltaTone = delta?.direction === 'up'
    ? 'text-emerald-600'
    : delta?.direction === 'down'
      ? 'text-rose-600'
      : 'text-slate-500';
  const DeltaIcon = delta?.direction === 'up'
    ? TrendingUp
    : delta?.direction === 'down'
      ? TrendingDown
      : FileWarning;

  const inner = (
    <div className="min-h-[132px] space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={17} />
        </div>
        {badge && (
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="text-3xl font-black tracking-tight text-slate-950 tabular-nums">{value}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{sub}</p>
        {period && <p className="text-xs text-slate-500">{period}</p>}
      </div>
      {delta ? (
        <p className={`inline-flex items-center gap-1 text-[11px] font-semibold ${deltaTone}`}>
          <DeltaIcon size={12} />
          {delta.text} vs previous period
        </p>
      ) : null}
      {action ? (
        <span className="mt-auto inline-flex text-[11px] font-semibold text-blue-700">
          {actionLabel || 'Open'} →
        </span>
      ) : null}
    </div>
  );

  if (!action) {
    return <div className={`${surfaceClass} overflow-hidden`}>{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={action}
      className={`${surfaceClass} overflow-hidden text-left transition hover:translate-y-[-1px] hover:shadow-[0_26px_55px_-34px_rgba(15,23,42,0.45)]`}
    >
      {inner}
    </button>
  );
}

interface Props {
  onNavigate: (v: QCView) => void;
  onSelectJob?: (id: string) => void;
  stats: QCStats;
  statsLoading: boolean;
  jobs: QCJob[];
  activity?: QCActivityItem[];
  activityLoading?: boolean;
  selectedRangeDays: 1 | 7 | 30;
  selectedScope: 'all' | 'mine';
  onRangeChange: (days: 1 | 7 | 30) => void;
  onScopeChange: (scope: 'all' | 'mine') => void;
}

const pct = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;

function normalizeConfidence(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 85;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

export default function QCDashboardView({
  onNavigate,
  onSelectJob,
  stats,
  statsLoading,
  jobs,
  activity = [],
  activityLoading = false,
  selectedRangeDays,
  selectedScope,
  onRangeChange,
  onScopeChange,
}: Props) {
  const { user } = useAuth();
  const pendingJobs = jobs.filter((job) => job.status === 'pending-review' || job.status === 'in-review');
  const pendingCount = pendingJobs.length;
  const rangeLabel = selectedRangeDays === 1 ? 'Today' : `Last ${selectedRangeDays} Days`;
  const scopeLabel = selectedScope === 'mine' ? 'My Jobs' : 'All Jobs';
  const scopeAndPeriod = `${scopeLabel} · ${rangeLabel}`;
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const v = (value: number) => (statsLoading ? '-' : String(value));
  const sortedByAge = [...pendingJobs].sort((a, b) => (b.elapsedMinutes ?? 0) - (a.elapsedMinutes ?? 0));
  const oldestPending = sortedByAge[0];
  const oldestPendingId = oldestPending?.id;

  const dueWithinOneHour = pendingJobs.filter((job) => (job.elapsedMinutes ?? 0) <= 60);
  const dueToday = pendingJobs.filter((job) => (job.elapsedMinutes ?? 0) > 60 && (job.elapsedMinutes ?? 0) <= SLA_DUE_WINDOW_MINUTES);
  const overdueJobs = pendingJobs.filter((job) => (job.elapsedMinutes ?? 0) > SLA_DUE_WINDOW_MINUTES);
  const dueInNext4Hours = dueWithinOneHour.length + dueToday.length;
  const dueInNext4HoursJobs = [...dueWithinOneHour, ...dueToday];
  const atRiskCount = dueWithinOneHour.length + dueToday.length + overdueJobs.length;

  const userId = String(user?.id || user?._id || '').trim();
  const assignedToMeJobs = userId
    ? pendingJobs.filter((job) => {
      const assignedId = String(job.technicianId || '').trim();
      return assignedId && assignedId === userId;
    })
    : [];

  const reviewedSummary = stats.rangeSummary
    ? stats.rangeSummary
    : {
        days: selectedRangeDays,
        label: rangeLabel,
        approved: 0,
        returned: 0,
        throughput: 0,
        reviewedOutcomes: 0,
        approvalRate: 0,
        previous: {
          approved: 0,
          returned: 0,
          throughput: 0,
          reviewedOutcomes: 0,
          approvalRate: 0,
        },
      };
  const previous = reviewedSummary.previous || {
    approved: 0,
    returned: 0,
    throughput: 0,
    reviewedOutcomes: 0,
    approvalRate: 0,
  };

  const approvedDelta = compareToPrevious(reviewedSummary.approved, previous.approved);
  const returnedDelta = compareToPrevious(reviewedSummary.returned, previous.returned);
  const throughputDelta = compareToPrevious(reviewedSummary.throughput, previous.throughput);
  const approvalDelta = compareToPrevious(reviewedSummary.approvalRate, previous.approvalRate);
  const throughputLabel = selectedRangeDays === 1 ? "Today's Throughput" : 'Throughput';

  const aiAlerts = jobs
    .filter((job) => job.aiFlag)
    .slice(0, 4)
    .map((job) => {
      const damage = Array.isArray((job as any).damageAnnotations)
        ? ((job as any).damageAnnotations as any[])[0]
        : undefined;
      return {
        id: `${job.id}-ai`,
        jobId: job.jobId,
        vehicle: job.vehicle,
        jobGuid: job.id,
        damage: damage?.type || damage?.label || 'Flagged for inspection',
        severity: String(damage?.severity || 'moderate').toLowerCase(),
        confidence: normalizeConfidence(damage?.confidence),
      };
    });

  const severityClass: Record<string, string> = {
    critical: 'bg-rose-50/90 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.2)]',
    high: 'bg-rose-50/90 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.2)]',
    moderate: 'bg-amber-50/90 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.22)]',
    medium: 'bg-amber-50/90 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.22)]',
    low: 'bg-slate-50/90 text-slate-600 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]',
  };

  const { trendData = [], serviceDistribution = [] } = stats;
  const topReturnReasons = (stats.topReturnReasons || [])
    .map((entry) => ({
      name: entry.reason.trim() || 'Unspecified',
      value: entry.count || 0,
    }))
    .filter((entry) => entry.name)
    .slice(0, 6);
  const sortedServices = [...serviceDistribution].sort((a, b) => b.value - a.value).slice(0, 6);
  const serviceTotal = sortedServices.reduce((sum, item) => sum + item.value, 0);
  const hasTrend = trendData.some((item) => item.approved > 0 || item.returned > 0);
  const hasService = sortedServices.length > 0;
  const hasReturnReasons = topReturnReasons.length > 0;

  const queueAgingBuckets = [
    {
      label: 'Due within 1h',
      value: dueWithinOneHour.length,
      jobs: dueWithinOneHour,
      tone: 'rose',
      color: '#f43f5e',
    },
    {
      label: 'Due today',
      value: dueToday.length,
      jobs: dueToday,
      tone: 'amber',
      color: '#f59e0b',
    },
    {
      label: 'Overdue',
      value: overdueJobs.length,
      jobs: overdueJobs,
      tone: 'violet',
      color: '#7c3aed',
    },
  ];

  const queueAgingChartData = queueAgingBuckets.map((bucket) => ({
    name: bucket.label,
    value: bucket.value,
  }));

  const handleReview = (id: string) => {
    if (onSelectJob) {
      onSelectJob(id);
      return;
    }
    onNavigate('jobs');
  };

  const openQueueBucket = (bucket: typeof queueAgingBuckets[number]) => {
    const target = bucket.jobs[0];
    if (!target) return;
    handleReview(target.id);
  };

  return (
    <div className="space-y-5">
      <section className="qc-dash-surface overflow-hidden rounded-2xl bg-white">
        <div className="flex flex-col gap-5 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.16)]">
              <Activity size={13} />
              Quality Command Center
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              What needs attention right now?
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {today} — live queue health and risk watchlist.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-black ring-1 ${
                statsLoading
                  ? 'bg-amber-50 text-amber-700 ring-amber-100'
                  : 'bg-emerald-50 text-emerald-700 ring-emerald-100'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${statsLoading ? 'bg-amber-400' : 'bg-emerald-500'} animate-pulse`} />
              {statsLoading ? 'Syncing' : 'Live'}
            </span>
            <span className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-600 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.14)]">
              <ClipboardList size={14} className="text-blue-600" />
              {pendingCount} pending
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100/80 px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold text-slate-500 sm:inline">Period</span>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {DASH_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onRangeChange(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    selectedRangeDays === option.value
                      ? 'bg-blue-600 text-white shadow-[0_8px_20px_-14px_rgba(37,99,235,0.55)]'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold text-slate-500 sm:inline">Scope</span>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {DASH_SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onScopeChange(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    selectedScope === option.value
                      ? 'bg-blue-600 text-white shadow-[0_8px_20px_-14px_rgba(37,99,235,0.55)]'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <MetricCard
          label="Awaiting Validation"
          value={v(pendingCount)}
          sub={scopeAndPeriod}
          icon={ClipboardList}
          tone="blue"
          badge={scopeLabel}
          period={scopeAndPeriod}
        />
        <MetricCard
          label="Approved"
          value={v(reviewedSummary.approved)}
          sub="Outcomes completed"
          icon={CheckCircle2}
          tone="emerald"
          badge={rangeLabel}
          period={rangeLabel}
          delta={approvedDelta}
        />
        <MetricCard
          label="Returned"
          value={v(reviewedSummary.returned)}
          sub="Rework outcomes"
          icon={RotateCcw}
          tone="rose"
          badge={rangeLabel}
          period={rangeLabel}
          delta={returnedDelta}
        />
        <MetricCard
          label={throughputLabel}
          value={v(reviewedSummary.throughput)}
          sub="Total reviewed"
          icon={Gauge}
          tone="violet"
          badge={rangeLabel}
          period={rangeLabel}
          delta={throughputDelta}
        />
        <MetricCard
          label="Approval Rate"
          value={statsLoading ? '-' : pct(reviewedSummary.approvalRate)}
          sub={`In period: ${rangeLabel}`}
          icon={Activity}
          tone="blue"
          badge={rangeLabel}
          period={rangeLabel}
          delta={approvalDelta}
        />
        <MetricCard
          label="Overall Approval Rate"
          value={statsLoading ? '-' : pct(stats.qcApprovalRatePct || 0)}
          sub="Lifetime outcome quality"
          icon={ShieldCheck}
          tone="slate"
          badge="All time"
          period="All time"
        />
        <MetricCard
          label="SLA Risk"
          value={v(atRiskCount)}
          sub={`1h ${dueWithinOneHour.length} · Today ${dueToday.length} · Overdue ${overdueJobs.length}`}
          icon={FileWarning}
          tone={atRiskCount > 0 ? 'rose' : 'slate'}
          badge="Attention"
          period="Live"
          action={atRiskCount > 0 ? () => openQueueBucket(queueAgingBuckets[0]) : null}
          actionLabel="Open queue"
        />
        <MetricCard
          label="Due in Next 4 Hours"
          value={v(dueInNext4Hours)}
          sub="Pending jobs approaching SLA"
          icon={Clock}
          tone={dueInNext4Hours > 0 ? 'amber' : 'slate'}
          badge="Live"
          period={scopeLabel}
          action={dueInNext4Hours > 0 ? () => openQueueBucket({
            label: 'Due in Next 4 Hours',
            value: dueInNext4Hours,
            jobs: dueInNext4HoursJobs,
            tone: 'amber',
            color: '#f59e0b',
          }) : null}
          actionLabel="Open jobs"
        />
        <MetricCard
          label="Overdue Jobs"
          value={v(overdueJobs.length)}
          sub="Above SLA target"
          icon={AlertTriangle}
          tone={overdueJobs.length > 0 ? 'rose' : 'slate'}
          badge={rangeLabel}
          period={scopeLabel}
          action={overdueJobs.length > 0 ? () => openQueueBucket(queueAgingBuckets[2]) : null}
          actionLabel="Open oldest"
        />
        <MetricCard
          label="Assigned to Me"
          value={v(assignedToMeJobs.length)}
          sub="Currently queued for you"
          icon={Users}
          tone={assignedToMeJobs.length > 0 ? 'blue' : 'slate'}
          badge={scopeLabel}
          period={scopeLabel}
          action={assignedToMeJobs.length > 0 ? () => openQueueBucket({
            label: 'Assigned to me',
            value: assignedToMeJobs.length,
            jobs: assignedToMeJobs,
            tone: 'blue',
            color: '#3b82f6',
          }) : null}
          actionLabel="Open first"
        />
        <MetricCard
          label="Oldest Pending Job"
          value={oldestPending ? oldestPending.elapsed : '-'}
          sub={oldestPending ? `${oldestPending.jobId} · ${oldestPending.vehicle}` : 'No pending jobs'}
          icon={Timer}
          tone="violet"
          badge="Live"
          period="Now"
          action={oldestPendingId ? () => handleReview(oldestPendingId) : null}
          actionLabel={oldestPendingId ? 'Open job' : undefined}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className={`${surfaceClass} p-6`}>
          <div className="mb-4 flex flex-col gap-2">
            <h2 className="text-base font-black tracking-tight text-slate-950">Queue Aging</h2>
            <p className="text-xs font-medium text-slate-500">Pending job aging split by SLA urgency</p>
          </div>
          {queueAgingBuckets.some((b) => b.value > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={queueAgingChartData} margin={{ top: 4, right: 10, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(226,232,240,0.55)" strokeDasharray="4 6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="value"
                    name="Jobs"
                    radius={[6, 6, 0, 0]}
                    onClick={(data: any) => {
                      const clicked = queueAgingBuckets.find((bucket) => bucket.label === data.name);
                      if (clicked) openQueueBucket(clicked);
                    }}
                  >
                    {queueAgingBuckets.map((bucket, index) => (
                      <Cell key={bucket.label} fill={bucket.color || BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {queueAgingBuckets.map((bucket) => {
                  const deltaTarget = bucket.jobs[0]?.id;
                  const buttonText = `${bucket.value} job${bucket.value === 1 ? '' : 's'}`;
                  return (
                    <button
                      key={bucket.label}
                      type="button"
                      onClick={() => deltaTarget ? handleReview(deltaTarget) : null}
                      className={`rounded-xl border border-slate-100 p-3 text-left text-xs transition ${
                        bucket.value > 0
                          ? 'bg-slate-50 hover:bg-slate-100'
                          : 'bg-slate-50/40'
                      }`}
                    >
                      <p className={`font-bold ${bucket.tone === 'rose' ? 'text-rose-700' : bucket.tone === 'amber' ? 'text-amber-700' : 'text-violet-700'}`}>
                        {bucket.label}
                      </p>
                      <p className="mt-1 font-black text-slate-900">{buttonText}</p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState icon={Clock} title="No queue aging risk" label="Jobs are not currently waiting in the queue." tone="green" />
          )}
        </div>

        <div className={`${surfaceClass} p-6`}>
          <div className="mb-4 flex flex-col gap-2">
            <h2 className="text-base font-black tracking-tight text-slate-950">Approval / Return Trend</h2>
            <p className="text-xs font-medium text-slate-500">Decision trend for {rangeLabel.toLowerCase()}</p>
          </div>
          {hasTrend ? (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={trendData} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="qcApprovedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="qcReturnedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(226,232,240,0.55)" strokeDasharray="4 6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="approved"
                  name="Approved"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="url(#qcApprovedGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="returned"
                  name="Returned"
                  stroke="#f43f5e"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="url(#qcReturnedGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#f43f5e', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={BarChart3} title="No trend data yet" label="Trend builds when approvals or returns are recorded." />
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className={`${surfaceClass} overflow-hidden`}>
          <div className={`flex items-center justify-between gap-3 px-5 py-4 ${dividerClass}`}>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black text-slate-950">Jobs by Service Type</h2>
                <p className="text-xs font-medium text-slate-500">Current quality-control mix</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="text-xs font-black text-blue-600 transition hover:text-blue-700"
            >
              View all
              <ArrowRight size={14} className="inline-block" />
            </button>
          </div>
          {hasService ? (
            <div className="space-y-5 p-5">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={sortedServices} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barSize={22}>
                  <CartesianGrid stroke="rgba(238,242,247,0.7)" strokeDasharray="4 6" vertical={false} />
                  <XAxis dataKey="name" hide />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" name="Jobs" radius={[6, 6, 0, 0]}>
                    {sortedServices.map((_, index) => (
                      <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {sortedServices.map((service, index) => {
                  const width = serviceTotal > 0 ? (service.value / serviceTotal) * 100 : 0;
                  return (
                    <div key={service.name} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-bold text-slate-700">{service.name}</span>
                        <span className="shrink-0 font-black text-slate-900 tabular-nums">{service.value}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${width}%`, backgroundColor: BAR_COLORS[index % BAR_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState icon={BarChart3} title="No jobs by service yet" label="Service mix appears once QC jobs are active." tone="blue" />
          )}
        </div>

        <div className={`${surfaceClass} overflow-hidden`}>
          <div className={`flex items-center justify-between gap-3 px-5 py-4 ${dividerClass}`}>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <FileWarning size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black text-slate-950">Top Return Reasons</h2>
                <p className="text-xs font-medium text-slate-500">Most frequent return triggers</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="text-xs font-black text-blue-600 transition hover:text-blue-700"
            >
              Investigate
              <ArrowRight size={14} className="inline-block" />
            </button>
          </div>
          {hasReturnReasons ? (
            <div className="space-y-4 p-5">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topReturnReasons} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barSize={18}>
                  <CartesianGrid stroke="rgba(238,242,247,0.7)" strokeDasharray="4 6" vertical={false} />
                  <XAxis dataKey="name" hide />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" name="Occurrences" radius={[6, 6, 0, 0]} fill={BAR_COLORS[1]}>
                    {topReturnReasons.map((_, index) => (
                      <Cell key={index} fill={BAR_COLORS[(index + 2) % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {topReturnReasons.map((item, index) => {
                  const width = topReturnReasons[0].value > 0 ? (item.value / topReturnReasons[0].value) * 100 : 0;
                  return (
                    <div key={`${item.name}-${index}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-bold text-slate-700">{item.name}</span>
                        <span className="font-black text-slate-900">{item.value}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-500/85" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState icon={FileWarning} title="No return reason data" label="Returned jobs with reasons will populate this view." tone="amber" />
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className={`${surfaceClass} overflow-hidden xl:col-span-2`}>
          <div className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${dividerClass}`}>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">Urgent Review Queue</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Sorted by elapsed review time</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-black text-white shadow-[0_8px_20px_-12px_rgba(37,99,235,0.55)] transition hover:bg-blue-700"
            >
              View all
              <ArrowRight size={14} />
            </button>
          </div>
          {statsLoading && jobs.length === 0 ? (
            <LoadingRows />
          ) : sortedByAge.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="qc-dash-table w-full min-w-[720px]">
                <thead>
                  <tr>
                    {['Job', 'Customer', 'Service', 'Elapsed', 'Status', 'Action'].map((heading) => (
                      <th key={heading} className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedByAge.slice(0, 5).map((job) => {
                    const isOverdue = (job.elapsedMinutes ?? 0) > SLA_DUE_WINDOW_MINUTES;
                    return (
                      <tr
                        key={job.id}
                        className="group cursor-pointer transition-colors"
                        onClick={() => handleReview(job.id)}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 tabular-nums">{job.jobId}</span>
                            {job.aiFlag && <AlertTriangle size={13} className="text-orange-500" />}
                          </div>
                          <p className="mt-0.5 text-xs font-medium text-slate-400">{job.vehicle || job.plate || 'Vehicle pending'}</p>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-700">{job.customer}</td>
                        <td className="max-w-[190px] px-5 py-4 text-xs font-semibold text-slate-500">
                          <span className="block truncate">{job.service || job.serviceType || '-'}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black tabular-nums ring-1 ${
                              isOverdue
                                ? 'bg-rose-50 text-rose-700 ring-rose-100'
                                : 'bg-amber-50 text-amber-700 ring-amber-100'
                            }`}
                          >
                            {job.elapsed || '-'}
                          </span>
                        </td>
                        <td className="px-5 py-4"><QCStatusBadge status={job.status as QCStatus} /></td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleReview(job.id);
                            }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white shadow-[0_8px_20px_-12px_rgba(37,99,235,0.55)] transition hover:bg-blue-700"
                          >
                            Review
                            <ArrowRight size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState icon={ShieldCheck} title="No urgent reviews" label="The priority lane is clear. New QC work will appear here automatically." tone="green" />
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className={`${surfaceClass} overflow-hidden`}>
            <div className={`flex items-center justify-between gap-3 px-5 py-4 ${dividerClass}`}>
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <ScanSearch size={16} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-slate-950">AI Detection Alerts</h2>
                  <p className="text-xs font-medium text-slate-500">{stats.aiPending} pending flags</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('ai-detection')}
                className="text-xs font-black text-blue-600 transition hover:text-blue-700"
              >
                View all
              </button>
            </div>
            {aiAlerts.length > 0 ? (
              <div className="qc-dash-list">
                {aiAlerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => onNavigate('ai-detection')}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-orange-50/40"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                      <Zap size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-black text-slate-900">{alert.jobId}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${severityClass[alert.severity] || severityClass.moderate}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">{alert.vehicle || 'Vehicle pending'}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{alert.damage}</p>
                    </div>
                    <span className="shrink-0 text-xs font-black text-slate-700 tabular-nums">{alert.confidence}%</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState icon={Zap} title="No AI detections" label="Automated scan issues will land here for quick review." tone="orange" />
              </div>
            )}
          </div>

          <div className={`${surfaceClass} overflow-hidden`}>
            <div className={`flex items-center justify-between gap-3 px-5 py-4 ${dividerClass}`}>
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Clock size={16} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-slate-950">Recent Activity</h2>
                  <p className="text-xs font-medium text-slate-500">{activity.length} latest actions</p>
                </div>
              </div>
            </div>

            {activityLoading ? (
              <LoadingRows />
            ) : activity.length > 0 ? (
              <div className="qc-dash-list max-h-72 overflow-y-auto">
                {activity.slice(0, 8).map((item) => {
                  const approved = item.type === 'approved';
                  return (
                    <div key={item.id} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${approved ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {approved ? <CheckCircle2 size={15} /> : <RotateCcw size={15} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-slate-900">
                          {approved ? 'Approved' : 'Returned'} <span className="font-semibold text-slate-500">{item.jobId}</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{item.vehicle} - {item.customer}</p>
                        {item.note && <p className="mt-0.5 truncate text-xs font-medium italic text-rose-500">"{item.note}"</p>}
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400 tabular-nums">
                        {new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState icon={ListChecks} title="No recent activity" label="Approvals and returns will create an audit trail here." tone="violet" />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
