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
  RefreshCw,
  Download,
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
} from 'recharts';
import { getRoleLabel, getSafeUserRole } from '@/lib/roles';

interface Props {
  users: any[];
  activityLogs: any[];
  bookings?: any[];
  loading: boolean;
  /** When false (dashboard tab hidden), charts are not mounted — avoids Recharts -1 size warnings. */
  chartsVisible?: boolean;
  onRefreshOverview?: () => void | Promise<void>;
  onExportReport?: () => void | Promise<void>;
}

const GROWTH_CHART_HEIGHT = 148;
const ROLE_CHART_HEIGHT = 148;
const DONUT_CHART_HEIGHT = 210;
const HOURLY_CHART_HEIGHT = 238;

const CHART_GRID_STROKE = '#EEF2F7';
const CHART_TICK = { fontSize: 10, fill: '#64748B' };
const CHART_TOOLTIP_STYLE = {
  fontSize: 11,
  borderRadius: 10,
  border: '1px solid #E2E8F0',
  boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
};

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
  { key: 'pending', label: 'Pending', color: '#F59E0B' },
  { key: 'confirmed', label: 'Confirmed', color: '#2563eb' },
  { key: 'in_progress', label: 'In Progress', color: '#0891B2' },
  { key: 'quality_check', label: 'Quality Check', color: '#6366F1' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
  { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
];

const TODAY_STATUS_STAGES: Array<{ key: TodayStatKey; label: string; color: string }> = [
  { key: 'pending', label: 'Pending', color: '#F59E0B' },
  { key: 'confirmed', label: 'Confirmed', color: '#2563eb' },
  { key: 'in_progress', label: 'In Progress', color: '#0891B2' },
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
    { key: 'total' as const, label: 'Total Users', value: stats.total, change: `${stats.total} registered accounts`, icon: Users, iconBg: '#EFF6FF', iconColor: '#2563EB', accent: '#2563EB' },
    { key: 'active' as const, label: 'Active Users', value: stats.active, change: `${stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : 0}% of total`, icon: UserCheck, iconBg: '#ECFDF5', iconColor: '#10B981', accent: '#10B981' },
    { key: 'pending' as const, label: 'Pending Verifications', value: stats.pending, change: stats.pending > 0 ? 'Requires action' : 'No pending verifications', icon: Clock, iconBg: '#FFFBEB', iconColor: '#F59E0B', accent: '#F59E0B', alert: stats.pending > 0 },
    { key: 'roles' as const, label: 'Total Roles', value: stats.roles, change: 'Across all departments', icon: ShieldCheck, iconBg: '#F8FAFC', iconColor: '#475569', accent: '#64748B' },
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

  const pipelineStackSegments = useMemo(
    () => pipelineChartData.filter((item) => item.count > 0),
    [pipelineChartData],
  );

  const pipelineDisplayRows = useMemo(
    () => {
      const pct = (count: number) => (pipelineTotal > 0 ? Math.round((count / pipelineTotal) * 100) : 0);
      const queued = pipelineCounts.pending + pipelineCounts.confirmed;
      const inService = pipelineCounts.in_progress + pipelineCounts.quality_check;

      return [
        {
          key: 'queued',
          label: 'Queued',
          detail: `${pipelineCounts.pending} pending / ${pipelineCounts.confirmed} confirmed`,
          count: queued,
          pct: pct(queued),
          color: '#2563eb',
        },
        {
          key: 'in_service',
          label: 'In service',
          detail: `${pipelineCounts.in_progress} active / ${pipelineCounts.quality_check} QC`,
          count: inService,
          pct: pct(inService),
          color: '#0891B2',
        },
        {
          key: 'completed',
          label: 'Completed',
          detail: 'Released jobs',
          count: pipelineCounts.completed,
          pct: pct(pipelineCounts.completed),
          color: '#10b981',
        },
        {
          key: 'cancelled',
          label: 'Cancelled',
          detail: 'Removed from workflow',
          count: pipelineCounts.cancelled,
          pct: pct(pipelineCounts.cancelled),
          color: '#ef4444',
        },
      ];
    },
    [pipelineCounts, pipelineTotal],
  );

  const growthYMax = useMemo(() => {
    const peak = Math.max(...growthData.flatMap((d) => [d.users, d.active]), 0);
    return Math.max(4, Math.ceil(peak * 1.12));
  }, [growthData]);

  if (loading) {
    return (
      <div className="ah-page-enter admin-dashboard-page">
        <div className="ah-dashboard-header">
          <div>
            <div className="ah-skeleton" style={{ width: 190, height: 28, borderRadius: 8 }} />
            <div className="ah-skeleton" style={{ width: 360, maxWidth: '100%', height: 16, borderRadius: 8, marginTop: 8 }} />
          </div>
        </div>
        <div className="ah-dashboard-kpi-grid">{[1, 2, 3, 4].map((i) => <div key={i} className="ah-skeleton" style={{ height: 112, borderRadius: 12 }} />)}</div>
        <div className="ah-dashboard-charts-grid">{[1, 2].map((i) => <div key={i} className="ah-skeleton" style={{ height: 210, borderRadius: 12 }} />)}</div>
        <div className="ah-dashboard-bottom ah-skeleton" style={{ flex: 1, minHeight: 180, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <div className="ah-page-enter admin-dashboard-page">
      <div className="ah-dashboard-header ah-slide-up">
        <div className="ah-dashboard-header-copy">
          <h1 className="ah-dashboard-title">Admin Overview</h1>
          <p className="ah-dashboard-subtitle">Monitor users, bookings, operations, and service performance.</p>
        </div>
        {(onRefreshOverview || onExportReport) && (
          <div className="ah-dashboard-actions" aria-label="Dashboard actions">
            {onRefreshOverview && (
              <button
                type="button"
                className="ah-dashboard-action"
                onClick={handleRefreshOverview}
                disabled={refreshingOverview}
              >
                <RefreshCw size={15} className={refreshingOverview ? 'ah-dashboard-action-spinner' : undefined} aria-hidden />
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
        )}
      </div>

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
                animationDelay: `${idx * 0.06}s`,
                '--ah-kpi-accent': kpi.accent,
                '--ah-kpi-icon-bg': kpi.iconBg,
                '--ah-kpi-icon-color': kpi.iconColor,
              } as React.CSSProperties}
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
                <div className="ah-dashboard-kpi-icon">
                  <Icon size={16} aria-hidden />
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
            <p className="ah-dashboard-card-sub">Total vs active users over the last 12 weeks</p>
          </div>
          <div className="ah-dashboard-chart-body ah-dashboard-chart-body--growth">
            <AdminChartBox height={GROWTH_CHART_HEIGHT}>
              <AreaChart data={growthData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalUsersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="activeUsersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="week" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis domain={[0, growthYMax]} allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6, color: '#475569' }} iconType="circle" iconSize={8} />
                <Area type="monotone" dataKey="users" name="Total Users" stroke="#2563EB" strokeWidth={2.25} fill="url(#totalUsersGradient)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="active" name="Active Users" stroke="#10B981" strokeWidth={2.25} fill="url(#activeUsersGradient)" dot={false} activeDot={{ r: 4 }} />
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
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                barCategoryGap="24%"
              >
                <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="roleShort"
                  textAnchor="middle"
                  height={28}
                  interval={0}
                  tick={CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickCount={5}
                  allowDecimals={false}
                  tick={CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number | string) => [Number(value || 0).toLocaleString(), 'Users']}
                  labelFormatter={(_label: string, payload: any[]) => payload?.[0]?.payload?.role || _label}
                />
                <Bar dataKey="count" name="Users" fill="#2563EB" barSize={38} radius={[6, 6, 0, 0]} />
              </BarChart>
            </AdminChartBox>
          </div>
        </div>
      </div>
      )}

      {chartsVisible && (
      <div className="ah-dashboard-bottom">
        <div className="ah-card-section ah-chart-card ah-dashboard-chart ah-dashboard-appointment-status ah-slide-up" style={{ animationDelay: '0.25s' }}>
          <div className="ah-dashboard-chart-head">
            <h2 className="ah-dashboard-card-title">Appointment Status</h2>
            <p className="ah-dashboard-card-sub">{appointmentScope.label} status mix</p>
          </div>
          <div className="ah-dashboard-bottom-chart-body ah-dashboard-appointment-status-body">
            <div className="ah-dashboard-donut-panel">
              <div className="ah-dashboard-donut-content">
                {appointmentTotal > 0 ? (
                  <div className="ah-dashboard-donut-wrap">
                    <AdminChartBox height={DONUT_CHART_HEIGHT}>
                      <PieChart>
                        <Pie
                          data={appointmentStatusChartData.filter((item) => item.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius="61%"
                          outerRadius="80%"
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
                      <span>Total appointments</span>
                    </div>
                  </div>
                ) : (
                  <div className="ah-dashboard-empty-chart" aria-label="No scheduled appointments">
                    <div className="ah-dashboard-empty-ring" />
                    <strong>No scheduled appointments</strong>
                    <span>Appointment mix will appear here</span>
                  </div>
                )}

                <div className="ah-dashboard-chart-legend ah-dashboard-chart-legend--compact" aria-label="Appointment status totals">
                  {(appointmentTotal > 0 ? appointmentStatusChartData.filter((item) => item.value > 0) : appointmentStatusChartData).map((item) => (
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
            </div>
          </div>
        </div>

        <div className="ah-card-section ah-chart-card ah-dashboard-chart ah-dashboard-hourly-volume ah-slide-up" style={{ animationDelay: '0.28s' }}>
          <div className="ah-dashboard-chart-head">
            <h2 className="ah-dashboard-card-title">Hourly Volume</h2>
            <p className="ah-dashboard-card-sub">{appointmentScope.label} appointment load</p>
          </div>
          <div className="ah-dashboard-bottom-chart-body ah-dashboard-hourly-body">
            <div className="ah-dashboard-insight-strip">
              <div className="ah-dashboard-insight-item">
                <span>Peak Hour</span>
                <strong className="tabular-nums">{appointmentPeakHour}</strong>
              </div>
              <div className="ah-dashboard-insight-item">
                <span>Total Volume</span>
                <strong className="tabular-nums">{appointmentTotal}</strong>
              </div>
            </div>
            <div className="ah-dashboard-hourly-chart">
              <AdminChartBox height={HOURLY_CHART_HEIGHT}>
                <BarChart data={appointmentHourlyChartData} margin={{ top: 14, right: 10, left: -4, bottom: 6 }} barCategoryGap="24%">
                  <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    interval={0}
                    height={28}
                    tick={CHART_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={CHART_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={34}
                  />
                  <Tooltip content={<DashboardTooltip />} cursor={{ fill: '#F8FAFC' }} />
                  <Bar dataKey="pending" name="Pending" stackId="appointments" fill="#F59E0B" maxBarSize={34} />
                  <Bar dataKey="confirmed" name="Confirmed" stackId="appointments" fill="#2563eb" maxBarSize={34} />
                  <Bar dataKey="in_progress" name="In Progress" stackId="appointments" fill="#0891B2" maxBarSize={34} />
                  <Bar dataKey="completed" name="Completed" stackId="appointments" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={34} />
                </BarChart>
              </AdminChartBox>
            </div>
          </div>
        </div>

        <div className="ah-card-section ah-chart-card ah-dashboard-chart ah-dashboard-job-pipeline ah-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="ah-dashboard-chart-head">
            <h2 className="ah-dashboard-card-title">Job Order Pipeline</h2>
            <p className="ah-dashboard-card-sub">Current job flow by main status</p>
          </div>
          <div className="ah-dashboard-bottom-chart-body ah-dashboard-pipeline-body">
            <div className="ah-dashboard-insight-strip">
              <div className="ah-dashboard-insight-item">
                <span>Total Jobs</span>
                <strong className="tabular-nums">{pipelineTotal}</strong>
              </div>
              <div className="ah-dashboard-insight-item">
                <span>Active Work</span>
                <strong className="tabular-nums">{pipelineActiveTotal}</strong>
              </div>
            </div>
            {pipelineTotal > 0 ? (
              <div className="ah-dashboard-pipeline-clean" aria-label="Job order pipeline status">
                <div className="ah-dashboard-pipeline-stack" aria-hidden>
                  {pipelineStackSegments.map((item) => (
                    <span
                      key={item.key}
                      title={`${item.label}: ${item.count}`}
                      style={{ flexGrow: item.count, background: item.color }}
                    />
                  ))}
                </div>
                <div className="ah-dashboard-pipeline-progress">
                  {pipelineDisplayRows.map((item) => (
                    <div key={item.key} className="ah-dashboard-pipeline-progress-row">
                      <div className="ah-dashboard-pipeline-progress-head">
                        <span>
                          <i style={{ background: item.color }} />
                          <span>
                            {item.label}
                            <em>{item.detail}</em>
                          </span>
                        </span>
                        <strong className="tabular-nums">
                          {item.count}
                          <small>{item.pct}%</small>
                        </strong>
                      </div>
                      <div
                        className="ah-dashboard-pipeline-progress-track"
                        aria-label={`${item.label}: ${item.count} jobs, ${item.pct}%`}
                      >
                        <span style={{ width: `${Math.max(item.pct, item.count > 0 ? 3 : 0)}%`, background: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
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
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
