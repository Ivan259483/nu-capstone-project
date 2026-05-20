import React, { useMemo } from 'react';
import { Users, UserCheck, Clock, ShieldCheck, TrendingUp, ArrowRight, LogIn, Edit, Key, UserPlus as UserPlusIcon, AlertTriangle, Calendar, Package } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getRoleLabel, getSafeUserRole } from '@/lib/roles';

interface Props {
  users: any[];
  activityLogs: any[];
  loading: boolean;
  onNavigate: (page: string) => void;
}

export default function AdminDashboardPage({ users, activityLogs, loading, onNavigate }: Props) {
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

  // Derive recent registrations
  const recentUsers = useMemo(() => {
    return [...users]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8);
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
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [users]);

  const kpis = [
    { label: 'Total Users', value: stats.total, change: `${stats.total} registered accounts`, icon: Users, iconBg: '#DBEAFE', iconColor: '#2563EB', border: '#2563EB', tint: '#EFF6FF' },
    { label: 'Active Users', value: stats.active, change: `${stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : 0}% of total`, icon: UserCheck, iconBg: '#D1FAE5', iconColor: '#10B981', border: '#10B981', tint: '#ECFDF5' },
    { label: 'Pending Verifications', value: stats.pending, change: 'Requires action', icon: Clock, iconBg: '#FEF3C7', iconColor: '#F59E0B', border: '#F59E0B', tint: '#FFFBEB', alert: stats.pending > 0 },
    { label: 'Total Roles', value: stats.roles, change: 'Across all departments', icon: ShieldCheck, iconBg: '#FFEDD5', iconColor: '#F97316', border: '#F97316', tint: '#FFF7ED' },
  ];

  if (loading) {
    return (
      <div className="ah-page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div><div className="ah-skeleton" style={{ width: 200, height: 28, marginBottom: 8 }} /><div className="ah-skeleton" style={{ width: 300, height: 16 }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>{[1,2,3,4].map(i => <div key={i} className="ah-skeleton" style={{ height: 120, borderRadius: 12 }} />)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>{[1,2].map(i => <div key={i} className="ah-skeleton" style={{ height: 280, borderRadius: 12 }} />)}</div>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const normalized = status === 'suspended' ? 'archived' : status;
    const map: Record<string, string> = { active: 'ah-badge-active', pending: 'ah-badge-pending', pending_verification: 'ah-badge-pending', inactive: 'ah-badge-inactive', archived: 'ah-badge-archived' };
    return <span className={`ah-badge ${map[normalized] || 'ah-badge-inactive'}`}>{normalized?.replace(/_/g, ' ') || 'unknown'}</span>;
  };

  return (
    <div className="ah-page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 className="ah-page-title">Dashboard Overview</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Welcome back — here's what's happening with your users today.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="ah-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}
            onClick={() => onNavigate('scheduling')}
          >
            <Calendar size={16} aria-hidden />
            Appointments
          </button>
          <button
            type="button"
            className="ah-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}
            onClick={() => onNavigate('inventory')}
          >
            <Package size={16} aria-hidden />
            Inventory
          </button>
          <button
            type="button"
            className="ah-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}
            onClick={() => onNavigate('users')}
          >
            <Users size={16} aria-hidden />
            User management
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="ah-kpi-card ah-slide-up" style={{ border: '1px solid rgba(226,232,240,0.75)', borderLeft: `4px solid ${kpi.border}`, animationDelay: `${idx * 0.06}s`, background: kpi.tint }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <p className="ah-section-label">{kpi.label}</p>
                  {kpi.alert && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 10, fontWeight: 700, color: '#B45309', background: '#FEF3C7', padding: '2px 6px', borderRadius: 4 }}><AlertTriangle size={11} aria-hidden /> Action Required</span>}
                </div>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: kpi.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} style={{ color: kpi.iconColor }} />
                </div>
              </div>
              <p className="tabular-nums" style={{ fontSize: 30, fontWeight: 700, color: '#0f172a', margin: 0 }}>{kpi.value.toLocaleString()}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <TrendingUp size={13} style={{ color: '#10b981' }} />
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{kpi.change}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
        {/* User Growth */}
        <div className="ah-card-section ah-chart-card ah-slide-up" style={{ padding: 20, animationDelay: '0.15s', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 14px 36px -22px rgba(15,23,42,0.24)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div><h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>User Growth</h2><p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Total vs Active — last 12 weeks</p></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={growthData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconType="circle" iconSize={8} />
                <Area type="monotone" dataKey="users" name="Total Users" stroke="#2563EB" strokeWidth={2} fill="rgba(37,99,235,.1)" dot={false} />
                <Area type="monotone" dataKey="active" name="Active Users" stroke="#10B981" strokeWidth={2} fill="rgba(16,185,129,.1)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Role Distribution */}
        <div className="ah-card-section ah-chart-card ah-slide-up" style={{ padding: 20, animationDelay: '0.2s', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 14px 36px -22px rgba(15,23,42,0.24)' }}>
          <div><h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Users by Role</h2><p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Distribution across system roles</p></div>
          <div style={{ marginTop: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={roleDistributionData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="role" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={52} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="count" name="Users" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Registrations */}
      <div className="ah-card-section ah-table-card ah-slide-up" style={{ animationDelay: '0.25s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div><h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Recent Registrations</h2><p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Latest account submissions</p></div>
          <button className="ah-btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => onNavigate('users')}>View All <ArrowRight size={13} /></button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ah-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Registered</th></tr></thead>
            <tbody>
              {recentUsers.map(u => (
                <tr key={u.id || u._id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d4ed8', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{(u.name || '?')[0]?.toUpperCase()}</div>
                    <span style={{ fontWeight: 500, color: '#1e293b' }}>{u.name || 'Unknown'}</span>
                  </div></td>
                  <td><span className="font-mono" style={{ fontSize: 12, color: '#64748b' }}>{u.email}</span></td>
                  <td style={{ color: '#334155' }}>{getRoleLabel(u.role)}</td>
                  <td>{statusBadge(u.status)}</td>
                  <td><span className="font-mono" style={{ fontSize: 12, color: '#94a3b8' }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></td>
                </tr>
              ))}
              {recentUsers.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No users found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
