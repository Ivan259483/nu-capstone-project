import React from 'react';
import {
  ClipboardList, CheckCircle2, RotateCcw, ScanSearch, Timer, AlertTriangle,
  ArrowRight, Clock, ShieldCheck, Sparkles, BarChart3, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import QCStatusBadge, { type QCStatus } from './QCStatusBadge';
import type { QCStats, QCJob, QCActivityItem } from '@/hooks/useQCData';

type QCView = 'dashboard' | 'jobs' | 'job-detail' | 'before-after' | 'ai-detection' | 'customer-notes' | 'reports';

const BAR_COLORS = ['#6366f1', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4'];

// ── Minimal tooltip ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xl shadow-slate-100 px-3.5 py-2.5 text-xs">
      <p className="font-semibold text-slate-600 mb-1.5">{label}</p>
      {payload.map((e: any) => (
        <div key={e.name} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.color }} />
          <span className="text-slate-400 capitalize">{e.name}:</span>
          <span className="font-semibold text-slate-700">{e.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Clean empty state ─────────────────────────────────────────────────────────
function EmptyChart({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)' }}>
      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3 ring-4 ring-blue-50">
        <Icon size={18} className="text-blue-400" />
      </div>
      <p className="text-sm font-semibold text-slate-600">No data yet</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
    </div>
  );
}

function EmptyRows({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center mx-5 mb-5 rounded-2xl" style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)' }}>
      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-3 ring-4 ring-green-50">
        <Icon size={18} className="text-green-500" />
      </div>
      <p className="text-sm font-semibold text-slate-600">No data yet</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  gradient: string;
  iconBg: string;
  iconColor: string;
  hero?: boolean;
}

function StatCard({ label, value, sub, icon: Icon, gradient, iconBg, iconColor, hero }: StatCardProps) {
  if (hero) {
    return (
      <div className={`sm:col-span-2 rounded-2xl bg-white p-6 flex flex-col justify-between min-h-[136px] relative overflow-hidden shadow-sm shadow-slate-200/50`}>
        <div className="absolute inset-0 rounded-2xl" style={{ background: gradient, opacity: 0.45 }} />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-xs font-medium tracking-widest text-slate-500 uppercase">{label}</p>
            <p className="text-4xl font-semibold mt-2.5 tabular-nums text-slate-800">{value}</p>
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg} shadow-sm`}>
            <Icon size={20} className={iconColor} />
          </div>
        </div>
        <p className="relative text-xs text-slate-400 mt-2">{sub}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-white p-5 flex flex-col justify-between relative overflow-hidden shadow-sm shadow-slate-200/50 hover:shadow-md transition-shadow">
      <div className="absolute inset-0 rounded-2xl" style={{ background: gradient, opacity: 0.35 }} />
      <div className="relative flex items-center justify-between">
        <p className="text-[11px] font-medium tracking-widest text-slate-400 uppercase">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon size={14} className={iconColor} />
        </div>
      </div>
      <div className="relative mt-3">
        <p className="text-4xl font-semibold tabular-nums text-slate-800">{value}</p>
        <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
interface Props {
  onNavigate: (v: QCView) => void;
  onSelectJob?: (id: string) => void;
  stats: QCStats;
  statsLoading: boolean;
  jobs: QCJob[];
  activity?: QCActivityItem[];
  activityLoading?: boolean;
}

export default function QCDashboardView({ onNavigate, onSelectJob, stats, statsLoading, jobs, activity = [], activityLoading = false }: Props) {
  const v = (n: number) => (statsLoading ? '—' : String(n));

  const urgentJobs = [...jobs]
    .filter((j) => j.status === 'pending-review' || j.status === 'in-review')
    .sort((a, b) => b.elapsedMinutes - a.elapsedMinutes)
    .slice(0, 5);

  const aiAlerts = jobs
    .filter((j) => j.aiFlag && Array.isArray((j as any).damageAnnotations) && (j as any).damageAnnotations.length > 0)
    .slice(0, 4)
    .flatMap((j) =>
      ((j as any).damageAnnotations as any[]).slice(0, 1).map((d: any) => ({
        id: `${j.id}-ai`,
        jobId: j.jobId,
        vehicle: j.vehicle,
        damage: d.type || 'Damage detected',
        severity: d.severity || 'moderate',
        confidence: d.confidence || 85,
      }))
    );

  const sevMap: Record<string, string> = {
    critical: 'bg-rose-50 text-rose-600 border border-rose-100',
    moderate: 'bg-amber-50 text-amber-600 border border-amber-100',
    low: 'bg-slate-50 text-slate-500 border border-slate-100',
  };

  const { trendData = [], serviceDistribution = [] } = stats;
  const hasTrend = trendData.some((d) => d.approved > 0 || d.returned > 0);
  const hasService = serviceDistribution.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Quality Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${statsLoading ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-emerald-200 bg-emerald-50 text-emerald-600'}`}>
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${statsLoading ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          {statsLoading ? 'Loading' : 'Live'}
        </span>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          hero
          label="Awaiting Validation"
          value={v(stats.awaiting)}
          sub={stats.awaiting > 0 ? `${stats.awaiting} jobs need your sign-off` : 'Queue is clear'}
          icon={ClipboardList}
          gradient="linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)"
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
        />
        <StatCard label="Approved Today" value={v(stats.approvedToday)} sub="Jobs completed" icon={CheckCircle2} gradient="linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" iconBg="bg-emerald-100" iconColor="text-emerald-600" />
        <StatCard label="Returned for Correction" value={v(stats.returned)} sub="Needs rework" icon={RotateCcw} gradient="linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)" iconBg="bg-rose-100" iconColor="text-rose-600" />
        <StatCard label="AI Detections Pending" value={v(stats.aiPending)} sub="Flagged items" icon={ScanSearch} gradient="linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)" iconBg="bg-orange-100" iconColor="text-orange-600" />
        <StatCard label="Avg Review Time" value={statsLoading ? '—' : stats.avgReviewTime} sub="Per job" icon={Timer} gradient="linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)" iconBg="bg-violet-100" iconColor="text-violet-600" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Approval Trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm shadow-slate-200/50">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 tracking-tight">Approval vs. Return Trend</h3>
              <p className="text-xs text-slate-400 mt-0.5">Last 14 days</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Approved</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400" />Returned</span>
            </div>
          </div>
          {hasTrend ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.10} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} strokeOpacity={0.7} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="approved" stroke="#10b981" strokeWidth={2} fill="url(#gA)" dot={false} activeDot={{ r: 3, fill: '#10b981' }} />
                <Area type="monotone" dataKey="returned" stroke="#f43f5e" strokeWidth={2} fill="url(#gR)" dot={false} activeDot={{ r: 3, fill: '#f43f5e' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart icon={BarChart3} label="Will populate as you review jobs" />
          )}
        </div>

        {/* Service Distribution */}
        <div className="bg-white rounded-2xl p-6 shadow-sm shadow-slate-200/50">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-800 tracking-tight">Jobs by Service Type</h3>
            <p className="text-xs text-slate-400 mt-0.5">Current queue</p>
          </div>
          {hasService ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={serviceDistribution} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barSize={18}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} strokeOpacity={0.7} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {serviceDistribution.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart icon={Sparkles} label="Will populate as jobs enter the queue" />
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Urgent Queue */}
        <div className="xl:col-span-2 bg-white rounded-2xl overflow-hidden shadow-sm shadow-slate-200/50">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 tracking-tight">Urgent Review Queue</h3>
              <p className="text-xs text-slate-400 mt-0.5">Sorted by wait time</p>
            </div>
            <button onClick={() => onNavigate('jobs')} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
              View all <ArrowRight size={12} />
            </button>
          </div>
          {urgentJobs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="bg-slate-50/50">
                    {['Job ID', 'Customer', 'Service', 'Elapsed', 'Status', ''].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[11px] font-medium text-slate-400 tracking-widest uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {urgentJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-800 tabular-nums">{job.jobId}</span>
                          {job.aiFlag && <AlertTriangle size={11} className="text-orange-400" />}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{job.customer}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-400 max-w-[120px] truncate">{job.service}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium tabular-nums ${job.elapsedMinutes >= 240 ? 'text-rose-500' : 'text-slate-500'}`}>{job.elapsed}</span>
                      </td>
                      <td className="px-4 py-3.5"><QCStatusBadge status={job.status as QCStatus} /></td>
                    <td className="px-4 py-3.5">
                        <button onClick={() => onSelectJob ? onSelectJob(job.id) : onNavigate('jobs')} className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-600 font-medium">
                          Review <ArrowRight size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyRows icon={ShieldCheck} label="Urgent jobs will appear here" />
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-5">
          {/* AI Alerts */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm shadow-slate-200/50">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <ScanSearch size={14} className="text-orange-400" />
                <h3 className="text-sm font-semibold text-slate-800 tracking-tight">AI Detection Alerts</h3>
                {stats.aiPending > 0 && (
                  <span className="text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded-full">{stats.aiPending}</span>
                )}
              </div>
              <button onClick={() => onNavigate('ai-detection')} className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                View all
              </button>
            </div>
            {aiAlerts.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {aiAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-slate-800">{alert.jobId}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sevMap[alert.severity] || sevMap.moderate}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{alert.vehicle}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{alert.damage}</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 tabular-nums flex-shrink-0">{alert.confidence}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center mx-4 my-4 rounded-2xl" style={{ background: 'linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%)' }}>
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center mb-2.5 ring-4 ring-orange-50">
                  <Zap size={16} className="text-orange-500" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No AI detections</p>
                <p className="text-xs text-slate-400 mt-1">AI scans flag issues automatically</p>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm shadow-slate-200/50">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
              <Clock size={14} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800 tracking-tight">Recent Activity</h3>
              {activity.length > 0 && (
                <span className="ml-auto text-[10px] font-semibold text-slate-400 tabular-nums">{activity.length} actions</span>
              )}
            </div>
            {activityLoading ? (
              <div className="space-y-0 divide-y divide-slate-50">
                {[1,2,3].map(i => (
                  <div key={i} className="px-5 py-3.5 animate-pulse flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-slate-100 rounded w-3/4" />
                      <div className="h-2.5 bg-slate-50 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity.length > 0 ? (
              <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {activity.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      item.type === 'approved' ? 'bg-emerald-100' : 'bg-rose-100'
                    }`}>
                      {item.type === 'approved'
                        ? <CheckCircle2 size={12} className="text-emerald-600" />
                        : <RotateCcw size={12} className="text-rose-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {item.type === 'approved' ? 'Approved' : 'Returned'} · <span className="font-normal text-slate-500">{item.jobId}</span>
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.vehicle} · {item.customer}</p>
                      {item.note && <p className="text-[11px] text-rose-400 truncate mt-0.5 italic">"{item.note}"</p>}
                    </div>
                    <span className="text-[10px] text-slate-300 flex-shrink-0 tabular-nums">
                      {new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center mx-4 my-4 rounded-2xl" style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)' }}>
                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center mb-2.5 ring-4 ring-violet-50">
                  <Clock size={16} className="text-violet-500" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No recent activity</p>
                <p className="text-xs text-slate-400 mt-1">Your review actions will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
