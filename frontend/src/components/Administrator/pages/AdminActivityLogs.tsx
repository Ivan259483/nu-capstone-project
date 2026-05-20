import React, { useState, useMemo } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, LogIn, Edit, Key, UserPlus, AlertTriangle, Shield, Package, CalendarCheck, Wrench, Trash2, Activity, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

interface Props { activityLogs: any[]; loading: boolean; }

const ITEMS_PER_PAGE = 15;

const TYPE_ICONS: Record<string, any> = {
  login: LogIn, user_update: Edit, role_change: Shield, password_change: Key,
  registration: UserPlus, deletion: Trash2, system: AlertTriangle,
  inventory: Package, booking: CalendarCheck, service: Wrench,
};

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  login: { bg: '#eff6ff', color: '#1d4ed8' },
  user_update: { bg: '#ecfdf5', color: '#059669' },
  role_change: { bg: '#eff6ff', color: '#2563EB' },
  password_change: { bg: '#fef3c7', color: '#d97706' },
  registration: { bg: '#dbeafe', color: '#2563eb' },
  deletion: { bg: '#fef2f2', color: '#dc2626' },
  system: { bg: '#fef2f2', color: '#dc2626' },
  inventory: { bg: '#ecfdf5', color: '#10B981' },
  booking: { bg: '#fffbeb', color: '#ca8a04' },
  service: { bg: '#fff7ed', color: '#F97316' },
};

export default function AdminActivityLogs({ activityLogs, loading }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const types = useMemo(() => [...new Set(activityLogs.map(l => l.type).filter(Boolean))], [activityLogs]);

  const filtered = useMemo(() => {
    return activityLogs.filter(l => {
      const s = search.toLowerCase();
      const matchSearch = !s || (l.title || '').toLowerCase().includes(s) || (l.userName || '').toLowerCase().includes(s) || (l.description || '').toLowerCase().includes(s);
      const matchType = !typeFilter || l.type === typeFilter;
      const matchStatus = !statusFilter || l.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [activityLogs, search, typeFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const statCards = [
    { label: 'Total', value: activityLogs.length, color: '#2563EB', tint: '#EFF6FF', helper: 'Latest audit events', Icon: Activity },
    { label: 'Success', value: activityLogs.filter(l => l.status === 'success').length, color: '#10B981', tint: '#ECFDF5', helper: 'Completed actions', Icon: CheckCircle2 },
    { label: 'Warnings', value: activityLogs.filter(l => l.status === 'warning').length, color: '#F97316', tint: '#FFF7ED', helper: 'Needs review', Icon: AlertCircle },
    { label: 'Errors', value: activityLogs.filter(l => l.status === 'error').length, color: '#EF4444', tint: '#FEF2F2', helper: 'Failed events', Icon: XCircle },
  ];

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { success: 'ah-badge-success', info: 'ah-badge-verified', warning: 'ah-badge-warning', error: 'ah-badge-failed' };
    return <span className={`ah-badge ${map[s] || 'ah-badge-inactive'}`}>{s || 'info'}</span>;
  };

  return (
    <div className="ah-page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 className="ah-page-title">Activity Logs</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>System-wide activity and audit trail — {activityLogs.length} total entries</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        {statCards.map(s => (
          <div key={s.label} className="ah-kpi-card" style={{ padding: 22, minHeight: 148, borderLeft: `4px solid ${s.color}`, background: '#fff' }}>
            <p className="ah-section-label">{s.label}</p>
            <p className="tabular-nums" style={{ fontSize: 34, fontWeight: 700, color: s.color, margin: '8px 0 0', lineHeight: 1 }}>{s.value}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, color: s.color }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: s.tint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <s.Icon size={14} aria-hidden />
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{s.helper}</span>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '-10px 0 0' }}>Showing latest 200 entries · Last updated just now</p>

      <div className="ah-card-section ah-table-card">
        {/* Filters */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input className="ah-input" placeholder="Search logs..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 36 }} />
          </div>
          <select className="ah-input" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 140 }}>
            <option value="">All Types</option>
            {types.map(t => <option key={t} value={t}>{(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</option>)}
          </select>
          <select className="ah-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 130 }}>
            <option value="">All Status</option>
            {['success', 'info', 'warning', 'error'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>

        {/* Log List */}
        <div style={{ overflowX: 'auto' }}>
          <table className="ah-table">
            <thead><tr><th style={{ width: 40 }}>Type</th><th>Activity</th><th>User</th><th>Status</th><th>Module</th><th>Timestamp</th></tr></thead>
            <tbody>
              {loading ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={6}><div className="ah-skeleton" style={{ height: 18, width: '100%' }} /></td></tr>
              )) : paginated.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No activity logs found</td></tr>
              ) : paginated.map((log, i) => {
                const Icon = TYPE_ICONS[log.type] || AlertTriangle;
                const colors = TYPE_COLORS[log.type] || { bg: '#f1f5f9', color: '#64748b' };
                return (
                  <tr key={log._id || i}>
                    <td><div style={{ width: 28, height: 28, borderRadius: 6, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={14} style={{ color: colors.color }} /></div></td>
                    <td>
                      <p style={{ fontWeight: 500, color: '#1e293b', margin: 0, fontSize: 13 }}>{log.title || 'Activity'}</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.description || ''}</p>
                    </td>
                    <td style={{ fontSize: 13, color: '#475569' }}>{log.userName || '—'}</td>
                    <td>{statusBadge(log.status)}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{(log.module || '—').replace(/_/g, ' ')}</td>
                    <td><span className="font-mono" style={{ fontSize: 11, color: '#94a3b8' }}>{log.createdAt ? new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Showing {filtered.length === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}</p>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: page === 1 ? 'not-allowed' : 'pointer', color: '#64748b', opacity: page === 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: page === i + 1 ? '#2563eb' : 'transparent', color: page === i + 1 ? '#fff' : '#64748b' }}>{i + 1}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: page >= totalPages ? 'not-allowed' : 'pointer', color: '#64748b', opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
