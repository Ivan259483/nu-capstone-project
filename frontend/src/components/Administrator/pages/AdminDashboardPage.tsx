import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
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
  Legend,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts';
import { getRoleLabel, getSafeUserRole } from '@/lib/roles';

interface Props {
  users: any[];
  activityLogs: any[];
  bookings?: any[];
  loading: boolean;
  /** When false (dashboard tab hidden), charts are not mounted — avoids Recharts -1 size warnings. */
  chartsVisible?: boolean;
}

const GROWTH_CHART_HEIGHT = 136;
const ROLE_CHART_HEIGHT = 136;
const DONUT_CHART_HEIGHT = 188;
const HOURLY_CHART_HEIGHT = 160;
const PIPELINE_CHART_HEIGHT = 200;

/** Renders Recharts only after the container has a real layout size (avoids width/height -1). */
function AdminChartBox({
  height,
  children,
}: {
  height: number;
  children: React.ReactElement;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      const { width, height: h } = node.getBoundingClientRect();
      setReady(width > 0 && h > 0);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="ah-dashboard-chart-canvas"
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

type PipelineStage = 'pending' | 'confirmed' | 'in_progress' | 'quality_check' | 'completed' | 'cancelled';
type TodayStatKey = Extract<PipelineStage, 'pending' | 'confirmed' | 'in_progress' | 'completed'>;

const PIPELINE_STAGES: Array<{ key: PipelineStage; label: string; color: string }> = [
  { key: 'pending', label: 'Pending', color: '#94a3b8' },
  { key: 'confirmed', label: 'Confirmed', color: '#2563eb' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'quality_check', label: 'Quality Check', color: '#8b5cf6' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
  { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
];

const TODAY_STATUS_STAGES: Array<{ key: TodayStatKey; label: string; color: string }> = [
  { key: 'pending', label: 'Pending', color: '#94a3b8' },
  { key: 'confirmed', label: 'Confirmed', color: '#2563eb' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
];

const DASHBOARD_HOURS = Array.from({ length: 11 }, (_, index) => index + 8);
const ROLE_CHART_LABELS: Record<string, string> = {
  administrator: 'Admin',
  office_admin: 'Office Admin',
  sales: 'Sales',
  staff_quality_checker: 'QC Tech',
  customer: 'Customer',
};

function formatDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function getAppointmentDateKey(booking: any) {
  const raw = booking?.bookingDate || booking?.date || booking?.scheduledDate || booking?.appointmentDate || booking?.createdAt;
  if (!raw) return '';
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : formatDateKey(date);
}

function getAppointmentTimeRaw(booking: any) {
  return booking?.bookingTime || booking?.time || booking?.scheduledTime || booking?.appointmentTime;
}

function getAppointmentTimeSortValue(booking: any) {
  const raw = getAppointmentTimeRaw(booking);
  if (!raw) return Number.MAX_SAFE_INTEGER;

  const value = String(raw).trim();
  const timeMatch = value.match(/^(\d{1,2}):(\d{2})(?:\s?([AP]M))?$/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const period = timeMatch[3]?.toUpperCase();
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.getHours() * 60 + parsed.getMinutes();
  return Number.MAX_SAFE_INTEGER;
}

function formatHourLabel(hour: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${period}`;
}

function compareAppointmentsBySchedule(a: any, b: any) {
  const dateCompare = getAppointmentDateKey(a).localeCompare(getAppointmentDateKey(b));
  if (dateCompare !== 0) return dateCompare;
  return getAppointmentTimeSortValue(a) - getAppointmentTimeSortValue(b);
}

function getPipelineStage(booking: any): PipelineStage {
  const rawStage = String(
    booking?.serviceTrackingStage ||
    booking?.trackingStage ||
    booking?.stage ||
    booking?.status ||
    '',
  ).toLowerCase().replace(/-/g, '_');
  const paymentStatus = String(booking?.paymentStatus || '').toLowerCase();

  if (['cancelled', 'canceled', 'rejected', 'failed', 'expired', 'no_show'].includes(rawStage)) return 'cancelled';
  if (['completed', 'paid', 'released'].includes(rawStage) || paymentStatus === 'paid') return 'completed';
  if (rawStage.includes('quality_check') || rawStage === 'qc' || rawStage === 'ready_pickup') return 'quality_check';
  if (['in_progress', 'started', 'active', 'received'].includes(rawStage)) return 'in_progress';
  if (['confirmed', 'approved', 'assigned'].includes(rawStage)) return 'confirmed';
  return 'pending';
}

function DashboardTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload || {};
  const value = item.count ?? item.value ?? payload[0]?.value ?? 0;
  const pct = typeof item.pct === 'number' ? item.pct : null;
  const stackItems = payload.filter((entry: any) => Number(entry?.value || 0) > 0);

  if (stackItems.length > 1 || item.total !== undefined) {
    return (
      <div className="ah-dashboard-chart-tooltip">
        <div className="ah-dashboard-chart-tooltip-title">
          <span style={{ background: '#2563eb' }} />
          {item.hour || label}
        </div>
        {stackItems.length > 0 ? (
          stackItems.map((entry: any) => (
            <p key={entry.dataKey}>
              <strong className="tabular-nums">{Number(entry.value || 0).toLocaleString()}</strong>
              {` ${entry.name}`}
            </p>
          ))
        ) : (
          <p>
            <strong className="tabular-nums">0</strong> appointment(s)
          </p>
        )}
        <p>{Number(item.total || 0).toLocaleString()} total</p>
      </div>
    );
  }

  return (
    <div className="ah-dashboard-chart-tooltip">
      <div className="ah-dashboard-chart-tooltip-title">
        <span style={{ background: item.color || payload[0]?.color || '#2563eb' }} />
        {item.label || item.hour || label}
      </div>
      <p>
        <strong className="tabular-nums">{Number(value || 0).toLocaleString()}</strong>
        {` ${item.unit || (item.hour ? 'appointment(s)' : 'job(s)')}`}
      </p>
      {pct !== null && <p>{pct}% of total</p>}
    </div>
  );
}

export default function AdminDashboardPage({
  users,
  activityLogs: _activityLogs,
  bookings = [],
  loading,
  chartsVisible = true,
}: Props) {
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.status === 'active').length;
    const pending = users.filter(u => u.status === 'pending' || u.status === 'pending_verification').length;
    const roles = [...new Set(users.map(u => u.role).filter(Boolean))].length;
    return { total, active, pending, roles };
  }, [users]);

  // Derive user growth data from createdAt dates
  const growthData = useMemo(() => {
    const now = new Date();
    const weeks: { week: string; users: number; active: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const cutoff = d.toISOString();
      const total = users.filter(u => new Date(u.createdAt || '2024-01-01') <= new Date(cutoff)).length;
      const activeCount = users.filter(u => new Date(u.createdAt || '2024-01-01') <= new Date(cutoff) && u.status === 'active').length;
      weeks.push({
        week: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        users: total,
        active: activeCount,
      });
    }
    return weeks;
  }, [users]);

  /** Canonical role counts + labels — matches User Management / ROLE_LABELS (excludes bootstrap Administrator bar — Office Admin covers ops admin) */
  const roleDistributionData = useMemo(() => {
    const roleMap: Record<string, number> = {};
    users.forEach((u) => {
      const slug = getSafeUserRole(u.role);
      roleMap[slug] = (roleMap[slug] || 0) + 1;
    });
    return Object.entries(roleMap)
      .filter(([slug]) => slug !== 'administrator')
      .map(([slug, count]) => ({
        role: getRoleLabel(slug),
        roleShort: ROLE_CHART_LABELS[slug] || getRoleLabel(slug),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [users]);

  const kpiTrends = useMemo(() => {
    const pctChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const buildTrend = (delta: number, pct: number) => {
      const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
      const sign = delta > 0 ? '+' : '';
      return {
        direction,
        label: `${sign}${pct.toFixed(1)}% vs last week`,
      };
    };

    if (growthData.length < 2) {
      return { total: null, active: null, pending: null, roles: null };
    }

    const prev = growthData[growthData.length - 2];
    const curr = growthData[growthData.length - 1];
    const totalDelta = curr.users - prev.users;
    const activeDelta = curr.active - prev.active;

    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const isPending = (u: { status?: string }) =>
      u.status === 'pending' || u.status === 'pending_verification';
    const pendingThisWeek = users.filter(
      (u) => isPending(u) && now - new Date(u.createdAt || 0).getTime() < weekMs,
    ).length;
    const pendingLastWeek = users.filter((u) => {
      if (!isPending(u)) return false;
      const age = now - new Date(u.createdAt || 0).getTime();
      return age >= weekMs && age < weekMs * 2;
    }).length;
    const pendingDelta = pendingThisWeek - pendingLastWeek;

    return {
      total: buildTrend(totalDelta, pctChange(curr.users, prev.users)),
      active: buildTrend(activeDelta, pctChange(curr.active, prev.active)),
      pending: buildTrend(pendingDelta, pctChange(pendingThisWeek, pendingLastWeek)),
      roles: null,
    };
  }, [growthData, users]);

  const kpis = [
    { key: 'total' as const, label: 'Total Users', value: stats.total, change: `${stats.total} registered accounts`, icon: Users, iconBg: '#DBEAFE', iconColor: '#2563EB', border: '#2563EB', tint: '#EFF6FF' },
    { key: 'active' as const, label: 'Active Users', value: stats.active, change: `${stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : 0}% of total`, icon: UserCheck, iconBg: '#D1FAE5', iconColor: '#10B981', border: '#10B981', tint: '#ECFDF5' },
    { key: 'pending' as const, label: 'Pending Verifications', value: stats.pending, change: stats.pending > 0 ? 'Requires action' : 'No pending verifications', icon: Clock, iconBg: '#FEF3C7', iconColor: '#F59E0B', border: '#F59E0B', tint: '#FFFBEB', alert: stats.pending > 0 },
    { key: 'roles' as const, label: 'Total Roles', value: stats.roles, change: 'Across all departments', icon: ShieldCheck, iconBg: '#FFEDD5', iconColor: '#F97316', border: '#F97316', tint: '#FFF7ED' },
  ];

  const safeBookings = useMemo(() => (Array.isArray(bookings) ? bookings : []), [bookings]);
  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  const todayAppointments = useMemo(() => {
    return safeBookings
      .filter((booking) => getAppointmentDateKey(booking) === todayKey)
      .sort(compareAppointmentsBySchedule);
  }, [safeBookings, todayKey]);

  const upcomingAppointments = useMemo(() => {
    return safeBookings
      .filter((booking) => {
        const dateKey = getAppointmentDateKey(booking);
        return dateKey && dateKey > todayKey;
      })
      .sort(compareAppointmentsBySchedule);
  }, [safeBookings, todayKey]);

  const recentScheduledAppointments = useMemo(() => {
    return safeBookings
      .filter((booking) => Boolean(getAppointmentDateKey(booking)))
      .sort((a, b) => {
        const dateCompare = getAppointmentDateKey(b).localeCompare(getAppointmentDateKey(a));
        if (dateCompare !== 0) return dateCompare;
        return getAppointmentTimeSortValue(a) - getAppointmentTimeSortValue(b);
      });
  }, [safeBookings]);

  const appointmentScope = useMemo(() => {
    if (todayAppointments.length > 0) {
      return {
        label: "Today's schedule",
        centerLabel: 'Today',
        bookings: todayAppointments,
      };
    }
    if (upcomingAppointments.length > 0) {
      return {
        label: 'Upcoming schedule',
        centerLabel: 'Upcoming',
        bookings: upcomingAppointments,
      };
    }
    return {
      label: 'Recent schedule',
      centerLabel: 'Recent',
      bookings: recentScheduledAppointments,
    };
  }, [recentScheduledAppointments, todayAppointments, upcomingAppointments]);

  const appointmentChartBookings = useMemo(() => {
    return appointmentScope.bookings.filter((booking) => {
      const stage = getPipelineStage(booking);
      return stage === 'pending' || stage === 'confirmed' || stage === 'in_progress' || stage === 'quality_check' || stage === 'completed';
    });
  }, [appointmentScope.bookings]);

  const appointmentCounts = useMemo(() => {
    const counts: Record<TodayStatKey, number> = { pending: 0, confirmed: 0, in_progress: 0, completed: 0 };
    appointmentChartBookings.forEach((booking) => {
      const stage = getPipelineStage(booking);
      if (stage === 'quality_check') {
        counts.in_progress += 1;
        return;
      }
      if (stage === 'pending' || stage === 'confirmed' || stage === 'in_progress' || stage === 'completed') {
        counts[stage] += 1;
      }
    });
    return counts;
  }, [appointmentChartBookings]);

  const appointmentTotal = useMemo(
    () => TODAY_STATUS_STAGES.reduce((total, stage) => total + (appointmentCounts[stage.key] || 0), 0),
    [appointmentCounts],
  );

  const appointmentStatusChartData = useMemo(
    () =>
      TODAY_STATUS_STAGES.map((stage) => {
        const value = appointmentCounts[stage.key] || 0;
        return {
          ...stage,
          value,
          pct: appointmentTotal > 0 ? Math.round((value / appointmentTotal) * 100) : 0,
          unit: 'appointment(s)',
        };
      }),
    [appointmentCounts, appointmentTotal],
  );

  const appointmentHourlyChartData = useMemo(() => {
    const countsByHour = new Map<number, Record<TodayStatKey | 'total', number>>();
    const visibleHours = new Set(DASHBOARD_HOURS);

    appointmentChartBookings.forEach((booking) => {
      const timeValue = getAppointmentTimeSortValue(booking);
      if (!Number.isFinite(timeValue) || timeValue === Number.MAX_SAFE_INTEGER) return;
      const hour = Math.floor(timeValue / 60);
      const rawStage = getPipelineStage(booking);
      const stage: TodayStatKey = rawStage === 'quality_check' ? 'in_progress' : rawStage as TodayStatKey;
      if (!['pending', 'confirmed', 'in_progress', 'completed'].includes(stage)) return;
      visibleHours.add(hour);
      const current = countsByHour.get(hour) || {
        pending: 0,
        confirmed: 0,
        in_progress: 0,
        completed: 0,
        total: 0,
      };
      current[stage] += 1;
      current.total += 1;
      countsByHour.set(hour, current);
    });

    return Array.from(visibleHours)
      .sort((a, b) => a - b)
      .map((hour) => {
        const counts = countsByHour.get(hour) || {
          pending: 0,
          confirmed: 0,
          in_progress: 0,
          completed: 0,
          total: 0,
        };
        return {
          hour: formatHourLabel(hour),
          ...counts,
        };
      });
  }, [appointmentChartBookings]);

  const appointmentPeakHour = useMemo(() => {
    const peak = appointmentHourlyChartData.reduce(
      (best, item) => (item.total > best.total ? item : best),
      { hour: '—', total: 0 },
    );
    return peak.total > 0 ? `${peak.hour} (${peak.total})` : '—';
  }, [appointmentHourlyChartData]);

  const appointmentDominantStatus = useMemo(() => {
    const top = appointmentStatusChartData.reduce(
      (best, item) => (item.value > best.value ? item : best),
      { label: '—', value: 0 },
    );
    return top.value > 0 ? top.label : '—';
  }, [appointmentStatusChartData]);

  const appointmentCompletionPct = useMemo(
    () => (appointmentTotal > 0 ? Math.round(((appointmentCounts.completed || 0) / appointmentTotal) * 100) : 0),
    [appointmentCounts.completed, appointmentTotal],
  );

  const pipelineCounts = useMemo(() => {
    const counts = PIPELINE_STAGES.reduce((acc, stage) => {
      acc[stage.key] = 0;
      return acc;
    }, {} as Record<PipelineStage, number>);
    safeBookings.forEach((booking) => {
      counts[getPipelineStage(booking)] += 1;
    });
    return counts;
  }, [safeBookings]);

  const pipelineTotal = useMemo(
    () => PIPELINE_STAGES.reduce((total, stage) => total + pipelineCounts[stage.key], 0),
    [pipelineCounts],
  );

  const pipelineChartData = useMemo(
    () =>
      PIPELINE_STAGES.map((stage) => {
        const count = pipelineCounts[stage.key] || 0;
        const pct = pipelineTotal > 0 ? Math.round((count / pipelineTotal) * 100) : 0;
        return {
          ...stage,
          count,
          pct,
          labelText: count > 0 ? `${count} (${pct}%)` : '',
          unit: 'job(s)',
        };
      }),
    [pipelineCounts, pipelineTotal],
  );

  const pipelineActiveTotal = useMemo(
    () => pipelineCounts.pending + pipelineCounts.confirmed + pipelineCounts.in_progress + pipelineCounts.quality_check,
    [pipelineCounts],
  );

  const pipelineCompletionPct = useMemo(
    () => (pipelineTotal > 0 ? Math.round(((pipelineCounts.completed || 0) / pipelineTotal) * 100) : 0),
    [pipelineCounts.completed, pipelineTotal],
  );

  const pipelineCancellationPct = useMemo(
    () => (pipelineTotal > 0 ? Math.round(((pipelineCounts.cancelled || 0) / pipelineTotal) * 100) : 0),
    [pipelineCounts.cancelled, pipelineTotal],
  );

  const growthYMax = useMemo(() => {
    const peak = Math.max(...growthData.flatMap((d) => [d.users, d.active]), 0);
    return Math.max(4, Math.ceil(peak * 1.12));
  }, [growthData]);

  if (loading) {
    return (
      <div className="ah-page-enter admin-dashboard-page">
        <div className="ah-dashboard-kpi-grid">{[1, 2, 3, 4].map((i) => <div key={i} className="ah-skeleton" style={{ height: 72, borderRadius: 10 }} />)}</div>
        <div className="ah-dashboard-charts-grid">{[1, 2].map((i) => <div key={i} className="ah-skeleton" style={{ height: 168, borderRadius: 10 }} />)}</div>
        <div className="ah-dashboard-bottom ah-skeleton" style={{ flex: 1, minHeight: 120, borderRadius: 10 }} />
      </div>
    );
  }

  return (
    <div className="ah-page-enter admin-dashboard-page">
      <div className="ah-dashboard-kpi-grid">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          const trend = kpiTrends[kpi.key];
          const TrendIcon =
            trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;
          return (
            <div
              key={kpi.label}
              className="ah-kpi-card ah-dashboard-kpi ah-slide-up"
              style={{
                border: '1px solid rgba(226,232,240,0.75)',
                borderLeft: `4px solid ${kpi.border}`,
                animationDelay: `${idx * 0.06}s`,
                background: kpi.tint,
              }}
            >
              <div className="ah-dashboard-kpi-top">
                <div>
                  <p className="ah-section-label">{kpi.label}</p>
                  {'alert' in kpi && kpi.alert && (
                    <span className="ah-dashboard-kpi-alert">
                      <AlertTriangle size={10} aria-hidden />
                      Action Required
                    </span>
                  )}
                </div>
                <div className="ah-dashboard-kpi-icon" style={{ background: kpi.iconBg }}>
                  <Icon size={15} style={{ color: kpi.iconColor }} />
                </div>
              </div>
              <p className="ah-dashboard-kpi-value tabular-nums">{kpi.value.toLocaleString()}</p>
              {trend && (
                <div className={`ah-dashboard-kpi-trend ah-dashboard-kpi-trend--${trend.direction}`}>
                  <TrendIcon size={12} aria-hidden />
                  <span>{trend.label}</span>
                </div>
              )}
              <p className="ah-dashboard-kpi-detail">{kpi.change}</p>
            </div>
          );
        })}
      </div>

      {chartsVisible && (
      <div className="ah-dashboard-charts-grid">
        <div className="ah-card-section ah-chart-card ah-dashboard-chart ah-slide-up" style={{ animationDelay: '0.15s' }}>
          <div className="ah-dashboard-chart-head">
            <h2 className="ah-dashboard-card-title">User Growth</h2>
            <p className="ah-dashboard-card-sub">Total vs Active — last 12 weeks</p>
          </div>
          <div className="ah-dashboard-chart-body ah-dashboard-chart-body--growth">
            <AdminChartBox height={GROWTH_CHART_HEIGHT}>
              <AreaChart data={growthData} margin={{ top: 2, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="activeUsersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, growthYMax]} allowDecimals={false} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={26} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="circle" iconSize={7} />
                <Area type="monotone" dataKey="users" name="Total Users" stroke="#2563EB" strokeWidth={2} fill="rgba(37,99,235,.1)" dot={false} />
                <Area type="monotone" dataKey="active" name="Active Users" stroke="#10B981" strokeWidth={2} fill="url(#activeUsersGradient)" fillOpacity={0.1} dot={false} />
              </AreaChart>
            </AdminChartBox>
          </div>
        </div>

        <div className="ah-card-section ah-chart-card ah-dashboard-chart ah-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="ah-dashboard-chart-head">
            <h2 className="ah-dashboard-card-title">Users by Role</h2>
            <p className="ah-dashboard-card-sub">Distribution across system roles</p>
          </div>
          <div className="ah-dashboard-chart-body ah-dashboard-chart-body--roles">
            <AdminChartBox height={ROLE_CHART_HEIGHT}>
              <BarChart
                data={roleDistributionData}
                margin={{ top: 2, right: 4, left: -12, bottom: 0 }}
                barCategoryGap="18%"
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="roleShort"
                  textAnchor="middle"
                  height={28}
                  interval={0}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickCount={5}
                  allowDecimals={false}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={26}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(value: number | string) => [Number(value || 0).toLocaleString(), 'Users']}
                  labelFormatter={(_label: string, payload: any[]) => payload?.[0]?.payload?.role || _label}
                />
                <Bar dataKey="count" name="Users" fill="#2563EB" barSize={40} radius={[3, 3, 0, 0]} />
              </BarChart>
            </AdminChartBox>
          </div>
        </div>
      </div>
      )}

      {chartsVisible && (
      <div className="ah-dashboard-bottom">
        <div className="ah-card-section ah-chart-card ah-dashboard-chart ah-dashboard-appointment-mix ah-slide-up" style={{ animationDelay: '0.25s' }}>
          <div className="ah-dashboard-chart-head">
            <h2 className="ah-dashboard-card-title">Appointment Mix</h2>
            <p className="ah-dashboard-card-sub">{appointmentScope.label} - status distribution and scheduled volume by hour</p>
          </div>
          <div className="ah-dashboard-bottom-chart-body ah-dashboard-appointment-mix-body">
            <div className="ah-dashboard-card-metrics ah-dashboard-card-metrics--appointment">
              <div className="ah-dashboard-metric-chip">
                <span>Peak Hour</span>
                <strong className="tabular-nums">{appointmentPeakHour}</strong>
              </div>
              <div className="ah-dashboard-metric-chip">
                <span>Top Status</span>
                <strong>{appointmentDominantStatus}</strong>
              </div>
              <div className="ah-dashboard-metric-chip">
                <span>Completion</span>
                <strong className="tabular-nums">{appointmentCompletionPct}%</strong>
              </div>
            </div>
            <div className="ah-dashboard-donut-panel">
              {appointmentTotal > 0 ? (
                <div className="ah-dashboard-donut-wrap">
                  <AdminChartBox height={DONUT_CHART_HEIGHT}>
                    <PieChart>
                      <Pie
                        data={appointmentStatusChartData.filter((item) => item.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius="58%"
                        outerRadius="82%"
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="label"
                      >
                        {appointmentStatusChartData.filter((item) => item.value > 0).map((entry) => (
                          <Cell key={`today-status-${entry.key}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<DashboardTooltip />} />
                    </PieChart>
                  </AdminChartBox>
                  <div className="ah-dashboard-donut-center">
                    <strong className="tabular-nums">{appointmentTotal}</strong>
                    <span>{appointmentScope.centerLabel}</span>
                  </div>
                </div>
              ) : (
                <div className="ah-dashboard-empty-chart" aria-label="No scheduled appointments">
                  <div className="ah-dashboard-empty-ring" />
                  <strong>No scheduled appointments</strong>
                  <span>Appointment mix will appear here</span>
                </div>
              )}

              <div className="ah-dashboard-chart-legend">
                {appointmentStatusChartData.map((item) => (
                  <div key={item.key} className="ah-dashboard-chart-legend-row">
                    <span className="ah-dashboard-chart-legend-label">
                      <span style={{ background: item.color }} />
                      {item.label}
                    </span>
                    <strong className="tabular-nums">{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="ah-dashboard-hourly-panel">
              <div className="ah-dashboard-mini-chart-head">
                <span>Hourly Volume</span>
                <strong className="tabular-nums">{appointmentTotal} total</strong>
              </div>
              <div className="ah-dashboard-hourly-chart">
                <AdminChartBox height={HOURLY_CHART_HEIGHT}>
                  <BarChart data={appointmentHourlyChartData} margin={{ top: 10, right: 6, left: -14, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      interval={0}
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      width={26}
                    />
                    <Tooltip content={<DashboardTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="pending" name="Pending" stackId="appointments" fill="#94a3b8" maxBarSize={34} />
                    <Bar dataKey="confirmed" name="Confirmed" stackId="appointments" fill="#2563eb" maxBarSize={34} />
                    <Bar dataKey="in_progress" name="In Progress" stackId="appointments" fill="#f59e0b" maxBarSize={34} />
                    <Bar dataKey="completed" name="Completed" stackId="appointments" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </AdminChartBox>
              </div>
            </div>
          </div>
        </div>

        <div className="ah-card-section ah-chart-card ah-dashboard-chart ah-dashboard-job-pipeline ah-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="ah-dashboard-chart-head">
            <h2 className="ah-dashboard-card-title">Job Order Pipeline</h2>
            <p className="ah-dashboard-card-sub">Current pipeline overview</p>
          </div>
          <div className="ah-dashboard-bottom-chart-body ah-dashboard-pipeline-body">
            <div className="ah-dashboard-card-metrics ah-dashboard-card-metrics--pipeline">
              <div className="ah-dashboard-metric-chip">
                <span>Total Jobs</span>
                <strong className="tabular-nums">{pipelineTotal}</strong>
              </div>
              <div className="ah-dashboard-metric-chip">
                <span>Active Work</span>
                <strong className="tabular-nums">{pipelineActiveTotal}</strong>
              </div>
              <div className="ah-dashboard-metric-chip">
                <span>Completed</span>
                <strong className="tabular-nums">{pipelineCompletionPct}%</strong>
              </div>
              <div className="ah-dashboard-metric-chip">
                <span>Cancelled</span>
                <strong className="tabular-nums">{pipelineCancellationPct}%</strong>
              </div>
            </div>
            {pipelineTotal > 0 ? (
              <div className="ah-dashboard-pipeline-chart">
                <AdminChartBox height={PIPELINE_CHART_HEIGHT}>
                  <BarChart
                    data={pipelineChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 42, left: 10, bottom: 0 }}
                    barCategoryGap="22%"
                  >
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                      allowDecimals={false}
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="label"
                      type="category"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={86}
                    />
                    <Tooltip content={<DashboardTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="pct" name="Pipeline Share" radius={[0, 5, 5, 0]} maxBarSize={20}>
                      {pipelineChartData.map((entry) => (
                        <Cell key={`pipeline-${entry.key}`} fill={entry.color} />
                      ))}
                      <LabelList dataKey="labelText" position="right" className="ah-dashboard-bar-label" />
                    </Bar>
                  </BarChart>
                </AdminChartBox>
              </div>
            ) : (
              <div className="ah-dashboard-empty-chart ah-dashboard-empty-chart--pipeline" aria-label="No job orders in the pipeline">
                <div className="ah-dashboard-empty-bars">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>No active pipeline</strong>
                <span>Job order status will appear here</span>
              </div>
            )}

            <div className="ah-dashboard-pipeline-summary">
              {pipelineChartData.map((item) => (
                <div key={item.key} className="ah-dashboard-pipeline-summary-item">
                  <span style={{ background: item.color }} />
                  <strong className="tabular-nums">{item.count}</strong>
                  <em>{item.label}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
