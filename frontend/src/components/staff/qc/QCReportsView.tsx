import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, Award, Clock, Inbox, Zap, Users } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import type { QCStats } from '@/hooks/useQCData';

// Backend integration point: data comes from useQCData stats prop
const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4', '#6366f1'];


const kpis = [
  { label: 'Total Jobs Reviewed', value: '0', trend: '—', up: true, icon: BarChart3, accent: 'blue' },
  { label: 'Overall Approval Rate', value: '—', trend: '—', up: true, icon: Award, accent: 'emerald' },
  { label: 'Avg Review Time', value: '—', trend: '—', up: true, icon: Clock, accent: 'violet' },
  { label: 'Return Rate', value: '—', trend: '—', up: false, icon: TrendingDown, accent: 'rose' },
];

const accentMap: Record<string, { bg: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  violet: { bg: 'bg-violet-50', icon: 'text-violet-600' },
  rose: { bg: 'bg-rose-50', icon: 'text-rose-600' },
};

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-800 mb-2">{label}</p>
      {payload.map((e: any) => (
        <div key={e.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
          <span className="text-slate-500 capitalize">{e.name}:</span>
          <span className="font-semibold text-slate-800">{e.value}</span>
        </div>
      ))}
    </div>
  );
};

function EmptyStateCard({ icon: Icon, title, subtitle, accent = 'blue' }: { icon: React.ElementType; title: string; subtitle: string; accent?: string }) {
  const accents: Record<string, { ring: string; bg: string; icon: string; dot: string }> = {
    blue: { ring: 'ring-blue-100', bg: 'bg-gradient-to-br from-blue-50 to-indigo-50', icon: 'text-blue-400', dot: 'bg-blue-200' },
    emerald: { ring: 'ring-emerald-100', bg: 'bg-gradient-to-br from-emerald-50 to-teal-50', icon: 'text-emerald-400', dot: 'bg-emerald-200' },
    amber: { ring: 'ring-amber-100', bg: 'bg-gradient-to-br from-amber-50 to-orange-50', icon: 'text-amber-400', dot: 'bg-amber-200' },
  };
  const a = accents[accent] || accents.blue;
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #64748b 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      <div className={`relative w-14 h-14 rounded-2xl ${a.bg} ring-4 ${a.ring} flex items-center justify-center mb-4 shadow-sm`}>
        <Icon size={22} className={a.icon} />
        <span className={`absolute -top-1 -right-1 w-3 h-3 ${a.dot} rounded-full animate-pulse`} />
      </div>
      <p className="text-[14px] font-semibold text-slate-600 tracking-tight">{title}</p>
      <p className="text-[12px] text-slate-400 mt-1.5 max-w-[260px] leading-relaxed">{subtitle}</p>
    </div>
  );
}

export default function QCReportsView({ stats, statsLoading, technicianData = [], techLoading = false }: { stats: QCStats; statsLoading: boolean; technicianData?: { name: string; approved: number; returned: number; rate: number }[]; techLoading?: boolean }) {
  // Use server-side lifetime QC metrics (approvedToday is only “completed today”, not approval %).
  const totalReviewed = stats.totalQCReviewed ?? 0;
  const approvalRate = stats.qcApprovalRatePct ?? 0;
  const returnRate = stats.qcReturnRatePct ?? 0;

  const dynamicKpis = [
    { label: 'Total Jobs Reviewed', value: statsLoading ? '—' : String(totalReviewed), trend: '—', up: true, icon: BarChart3, accent: 'blue' },
    { label: 'Overall Approval Rate', value: statsLoading ? '—' : `${approvalRate}%`, trend: '—', up: true, icon: Award, accent: 'emerald' },
    { label: 'Avg Review Time', value: statsLoading ? '—' : stats.avgReviewTime, trend: '—', up: true, icon: Clock, accent: 'violet' },
    { label: 'Return Rate', value: statsLoading ? '—' : `${returnRate}%`, trend: '—', up: false, icon: TrendingDown, accent: 'rose' },
  ];

  const trendData = stats.trendData || [];
  const pieData = stats.serviceDistribution || [];
  const hasTrend = trendData.some((d) => (d.approved ?? 0) > 0 || (d.returned ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Analytics &amp; Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Quality performance overview — last 14 days</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dynamicKpis.map((k) => {
          const Icon = k.icon;
          const ac = accentMap[k.accent] || accentMap.blue;
          return (
            <div key={k.label} className="bg-white rounded-xl p-5 shadow-sm shadow-slate-200/50 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.label}</p>
                <div className={`w-8 h-8 rounded-lg ${ac.bg} flex items-center justify-center`}><Icon size={15} className={ac.icon} /></div>
              </div>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{k.value}</p>
              <div className="flex items-center gap-1 mt-1.5">
                {k.up ? <TrendingUp size={12} className="text-slate-400" /> : <TrendingDown size={12} className="text-slate-400" />}
                <span className="text-xs font-medium text-slate-400">{k.trend}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly trend + pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm shadow-slate-200/50">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Monthly Approval Trend</h3>
              <p className="text-xs text-slate-400 mt-0.5">Last 14 days — QC approvals vs. returns by day</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Approved</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" />Returned</span>
            </div>
          </div>
          {hasTrend ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.12} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="approved" stroke="#3b82f6" strokeWidth={2} fill="url(#rg1)" dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
                <Area type="monotone" dataKey="returned" stroke="#f43f5e" strokeWidth={2} fill="url(#rg2)" dot={false} activeDot={{ r: 4, fill: '#f43f5e' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyStateCard icon={BarChart3} title="No monthly trend data" subtitle="Trend data will chart automatically as you review jobs over time" accent="blue" />
          )}
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm shadow-slate-200/50">
          <h3 className="text-base font-semibold text-slate-800 mb-1">Jobs by Service</h3>
          <p className="text-xs text-slate-400 mb-4">Distribution this period</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyStateCard icon={Zap} title="No service data" subtitle="Service breakdown will populate as jobs are processed" accent="emerald" />
          )}
        </div>
      </div>

      {/* Technician Performance */}
      <div className="bg-white rounded-xl p-6 shadow-sm shadow-slate-200/50">
        <h3 className="text-base font-semibold text-slate-800 mb-1">Technician Performance</h3>
        <p className="text-xs text-slate-400 mb-5">Approval rates — current period</p>
        {techLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-4">
                <div className="w-7 h-7 rounded-full bg-slate-100" />
                <div className="flex-1 h-3 bg-slate-100 rounded" />
                <div className="w-12 h-3 bg-slate-100 rounded" />
                <div className="w-24 h-3 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : technicianData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Technician', 'Approved', 'Returned', 'Approval Rate', 'Performance'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-medium text-slate-500 tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {technicianData.sort((a, b) => b.rate - a.rate).map((t, i) => (
                  <tr key={t.name} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {i === 0 && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Top</span>}
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-[10px] text-white font-semibold">
                          {(t.name || 'UN').split(' ').map((p) => p[0]).join('')}
                        </div>
                        <span className="text-sm font-medium text-slate-800">{t.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-sm font-semibold text-emerald-600 tabular-nums">{t.approved}</td>
                    <td className="py-3.5 px-4 text-sm font-semibold text-rose-500 tabular-nums">{t.returned}</td>
                    <td className="py-3.5 px-4 text-sm font-bold text-slate-800 tabular-nums">{t.rate}%</td>
                    <td className="py-3.5 px-4 w-48">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${t.rate}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums w-10 text-right">{t.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyStateCard icon={Users} title="No technician data" subtitle="Technician performance metrics will populate as reviews are completed" accent="amber" />
        )}
      </div>
    </div>
  );
}
