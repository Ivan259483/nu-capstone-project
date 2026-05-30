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
  TrendingUp,
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
import QCStatusBadge, { type QCStatus } from './QCStatusBadge';
import type { QCStats, QCJob, QCActivityItem } from '@/hooks/useQCData';

type QCView =
  | 'dashboard'
  | 'jobs'
  | 'job-detail'
  | 'ai-detection'
  | 'live-tracker';

const BAR_COLORS = ['#2563eb', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#64748b'];
const SLA_RISK_MINUTES = 240;

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

interface MetricCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  tone: 'blue' | 'emerald' | 'rose' | 'amber' | 'violet' | 'slate';
  badge?: string;
}

function MetricCard({ label, value, sub, icon: Icon, tone, badge }: MetricCardProps) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];

  return (
    <div className={`${surfaceClass} p-5`}>
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
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-slate-950 tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{sub}</p>
    </div>
  );
}

function HeroKpi({
  awaiting,
  pending,
  slaRisk,
  loading,
}: {
  awaiting: number;
  pending: number;
  slaRisk: number;
  loading: boolean;
}) {
  const value = loading ? '-' : String(awaiting);
  const status =
    loading ? 'Syncing queue' : slaRisk > 0 ? `${slaRisk} SLA risk` : awaiting > 0 ? `${awaiting} awaiting` : 'Clear queue';
  const statusClass =
    slaRisk > 0
      ? 'bg-rose-50 text-rose-700 ring-rose-100'
      : awaiting > 0
        ? 'bg-amber-50 text-amber-700 ring-amber-100'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-100';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-800 to-slate-950 p-6 text-white shadow-[0_20px_56px_-26px_rgba(30,58,138,0.7)] ring-1 ring-blue-500/20">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_42%)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-100 ring-1 ring-white/15">
              <ClipboardList size={13} />
              Awaiting Validation
            </div>
            <p className="mt-5 text-6xl font-black leading-none tracking-tight tabular-nums">{value}</p>
            <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-blue-100">
              {awaiting > 0 ? 'Jobs waiting for final QC sign-off before customer release.' : 'No blocked sign-offs in the current QC queue.'}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
            <ShieldCheck size={22} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-white/10 px-4 py-3 ring-1 ring-white/15">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-200">Pending Lane</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{loading ? '-' : pending}</p>
          </div>
          <div className="rounded-lg bg-white/10 px-4 py-3 ring-1 ring-white/15">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-200">Queue Health</p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${statusClass}`}>
              {status}
            </span>
          </div>
        </div>
      </div>
    </div>
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
}: Props) {
  const pendingJobs = jobs.filter((job) => job.status === 'pending-review' || job.status === 'in-review');
  const slaRiskJobs = pendingJobs.filter((job) => (job.elapsedMinutes ?? 0) >= SLA_RISK_MINUTES);
  const v = (value: number) => (statsLoading ? '-' : String(value));
  const reviewedTotal =
    typeof stats.totalQCReviewed === 'number' && stats.totalQCReviewed > 0
      ? stats.totalQCReviewed
      : stats.approvedToday + stats.returned;
  const approvalRate =
    typeof stats.qcApprovalRatePct === 'number'
      ? stats.qcApprovalRatePct
      : reviewedTotal > 0
        ? (stats.approvedToday / reviewedTotal) * 100
        : 0;
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const urgentJobs = [...pendingJobs]
    .sort((a, b) => (b.elapsedMinutes ?? 0) - (a.elapsedMinutes ?? 0))
    .slice(0, 5);

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
  const hasTrend = trendData.some((item) => item.approved > 0 || item.returned > 0);
  const sortedServices = [...serviceDistribution].sort((a, b) => b.value - a.value).slice(0, 6);
  const serviceTotal = sortedServices.reduce((sum, item) => sum + item.value, 0);
  const hasService = sortedServices.length > 0;

  const handleReview = (id: string) => {
    if (onSelectJob) {
      onSelectJob(id);
      return;
    }
    onNavigate('jobs');
  };

  return (
    <div className="space-y-6">
      <section className="qc-dash-surface overflow-hidden rounded-2xl bg-white">
        <div className="flex flex-col gap-5 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.16)]">
              <Activity size={13} />
              Quality Command Center
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Quality Command Center</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">{today} - Final inspection operations</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <span className="inline-flex h-9 items-center gap-2 rounded-xl bg-white/90 px-3 text-xs font-bold text-slate-600 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.14)]">
              <Gauge size={14} className="text-blue-600" />
              {slaRiskJobs.length > 0 ? `${slaRiskJobs.length} SLA risk` : 'SLA stable'}
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <HeroKpi
            awaiting={stats.awaiting}
            pending={pendingJobs.length}
            slaRisk={slaRiskJobs.length}
            loading={statsLoading}
          />
        </div>
        <MetricCard
          label="Approved Today"
          value={v(stats.approvedToday)}
          sub="Jobs completed by QC"
          icon={CheckCircle2}
          tone="emerald"
          badge="Today"
        />
        <MetricCard
          label="Returned"
          value={v(stats.returned)}
          sub="Jobs needing correction"
          icon={RotateCcw}
          tone="rose"
          badge="Rework"
        />
        <MetricCard
          label="AI Pending"
          value={v(stats.aiPending)}
          sub="Automated flags to inspect"
          icon={ScanSearch}
          tone="amber"
          badge="AI"
        />
        <MetricCard
          label="Avg Review Time"
          value={statsLoading ? '-' : stats.avgReviewTime || '-'}
          sub="Per job in review"
          icon={Timer}
          tone="violet"
        />
        <MetricCard
          label="Approval Rate"
          value={statsLoading ? '-' : pct(approvalRate)}
          sub={reviewedTotal > 0 ? `${reviewedTotal} QC outcomes` : 'No outcomes yet'}
          icon={TrendingUp}
          tone="blue"
        />
        <MetricCard
          label="SLA Risk"
          value={statsLoading ? '-' : String(slaRiskJobs.length)}
          sub={`${SLA_RISK_MINUTES / 60}h+ pending reviews`}
          icon={FileWarning}
          tone={slaRiskJobs.length > 0 ? 'rose' : 'slate'}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className={`${surfaceClass} p-6 xl:col-span-2`}>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">Approval / Return Trend</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Last 14 days of QC decisions</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Approved</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Returned</span>
            </div>
          </div>

          {hasTrend ? (
            <ResponsiveContainer width="100%" height={260}>
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
            <EmptyState icon={BarChart3} title="No QC trend yet" label="Approved and returned jobs will build this chart automatically." />
          )}
        </div>

        <div className={`${surfaceClass} p-6`}>
          <div className="mb-5">
            <h2 className="text-base font-black tracking-tight text-slate-950">Jobs by Service Type</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Current QC queue mix</p>
          </div>
          {hasService ? (
            <div className="space-y-5">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={sortedServices} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barSize={24}>
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
            <EmptyState icon={Sparkles} title="No service queue yet" label="Service mix appears once jobs enter quality control." tone="violet" />
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className={`${surfaceClass} overflow-hidden xl:col-span-2`}>
          <div className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${dividerClass}`}>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">Urgent Review Queue</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Sorted by elapsed QC wait time</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-black text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
            >
              View all
              <ArrowRight size={14} />
            </button>
          </div>

          {statsLoading && jobs.length === 0 ? (
            <LoadingRows />
          ) : urgentJobs.length > 0 ? (
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
                  {urgentJobs.map((job) => {
                    const isOverdue = (job.elapsedMinutes ?? 0) >= SLA_RISK_MINUTES;
                    return (
                      <tr key={job.id} className="group transition-colors">
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
                            onClick={() => handleReview(job.id)}
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
                      <span className="shrink-0 text-[10px] font-bold text-slate-300 tabular-nums">
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
