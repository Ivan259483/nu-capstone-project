// @module HRStaffActivity
import React, { useState, useMemo } from 'react';
import { Search, Download, X, Filter, Activity } from 'lucide-react';
import { getSafeUserRole, CUSTOMER_ROLE } from '@/lib/roles';

// ── Badge helpers ────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  administrator: { bg: '#ede9fe', text: '#6d28d9' },
  office_admin:  { bg: '#ede9fe', text: '#6d28d9' },
  hr:            { bg: '#eff6ff', text: '#1d4ed8' },
  operation_manager: { bg: '#e0e7ff', text: '#4338ca' },
  technician:    { bg: '#ecfeff', text: '#0e7490' },
  sales:         { bg: '#ecfdf5', text: '#065f46' },
  service_staff: { bg: '#f0fdf4', text: '#15803d' },
  inventory:     { bg: '#fefce8', text: '#a16207' },
  customer:      { bg: '#f1f5f9', text: '#475569' },
  system:        { bg: '#f1f5f9', text: '#475569' },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_BADGE[role] ?? ROLE_BADGE.customer;
  const label = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: cfg.bg, color: cfg.text }}>
      {label}
    </span>
  );
}

const MODULE_COLORS: Record<string, { bg: string; text: string }> = {
  'Auth':      { bg: '#dbeafe', text: '#1d4ed8' },
  'User':      { bg: '#cffafe', text: '#0e7490' },
  'Booking':   { bg: '#ede9fe', text: '#6d28d9' },
  'POS':       { bg: '#ffedd5', text: '#c2410c' },
  'Inventory': { bg: '#e0e7ff', text: '#4338ca' },
  'Service':   { bg: '#fce7f3', text: '#9d174d' },
  'Customer':  { bg: '#f3e8ff', text: '#7e22ce' },
  'System':    { bg: '#f1f5f9', text: '#475569' },
  'Settings':  { bg: '#f1f5f9', text: '#475569' },
  'Report':    { bg: '#ecfdf5', text: '#065f46' },
};

// ── Shared input style ────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#111827', outline: 'none',
};

// ── Component ─────────────────────────────────────────────────────

// Staff-only roles — exclude admin-level and customer roles
const STAFF_ROLES = ['hr', 'operation_manager', 'sales', 'service_staff', 'technician', 'staff_quality_checker', 'staff_inventory'];

export default function HRStaffActivity({ activityLogs, localUsers }: any) {
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const records = useMemo(() => {
    return (activityLogs || [])
      .map((log: any) => {
        const u = localUsers.find((x: any) => x.name === log.userName || x.email === log.userName) || {};
        const role = getSafeUserRole(u.role || log.userRole || 'system', CUSTOMER_ROLE);
        const ts = new Date(log.createdAt || log.timestamp || Date.now());
        return {
          id: log.id,
          staffName: log.userName || 'System',
          role,
          action: log.action || log.title || log.message || '—',
          module: log.module || 'System',
          dateRaw: ts.toISOString().split('T')[0],
          dateTime: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ts),
        };
      })
      // Only show staff-level activity — exclude administrator, office_admin, customer, system
      .filter((r: any) => STAFF_ROLES.includes(r.role));
  }, [activityLogs, localUsers]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.staffName.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        r.module.toLowerCase().includes(q),
      );
    }
    if (filterRole) list = list.filter(r => r.role === filterRole);
    if (filterDateFrom) list = list.filter(r => r.dateRaw >= filterDateFrom);
    if (filterDateTo) list = list.filter(r => r.dateRaw <= filterDateTo);
    return list;
  }, [records, search, filterRole, filterDateFrom, filterDateTo]);

  const hasFilters = search || filterRole || filterDateFrom || filterDateTo;

  const clearFilters = () => { setSearch(''); setFilterRole(''); setFilterDateFrom(''); setFilterDateTo(''); };

  const exportCSV = () => {
    const headers = ['Staff Name', 'Role', 'Action', 'Module Accessed', 'Date & Time'];
    const rows = filtered.map(r => [r.staffName, r.role, r.action, r.module, r.dateTime]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `staff-activity-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', margin: 0 }}>Staff Activity Monitor</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''} · Tracking staff-only actions (excludes admin & customers)
          </p>
        </div>
        <button
          onClick={exportCSV}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
        >
          <Download style={{ width: 16, height: 16 }} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0/0.04)', padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94a3b8' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, action, or module..."
              style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 130 }}>
            <option value="">All Staff Roles</option>
            <option value="hr">HR</option>
            <option value="operation_manager">Operation Manager</option>
            <option value="sales">Sales</option>
            <option value="service_staff">Service Staff</option>
            <option value="technician">Technician</option>
            <option value="staff_quality_checker">Quality Checker</option>
            <option value="staff_inventory">Inventory Staff</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              style={{ ...inputStyle, width: 'auto' }} />
            <span style={{ color: '#94a3b8', fontSize: 14 }}>to</span>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              style={{ ...inputStyle, width: 'auto' }} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>
              <X style={{ width: 14, height: 14 }} /> Clear
            </button>
          )}
        </div>
        {hasFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
            <Filter style={{ width: 13, height: 13, color: '#94a3b8' }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Showing {filtered.length} of {records.length} records</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0/0.04)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Staff Name', 'Role', 'Action', 'Module Accessed', 'Date & Time'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map((r, idx) => {
                const initials = r.staffName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
                const modColors = MODULE_COLORS[r.module] ?? { bg: '#f1f5f9', text: '#475569' };
                return (
                  <tr key={r.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #e2e8f0' : 'none', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 1 ? '#fafafa' : '#fff')}
                  >
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#2563EB' }}>{initials}</span>
                        </div>
                        <span style={{ fontWeight: 500, color: '#0f172a' }}>{r.staffName}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px' }}><RoleBadge role={r.role} /></td>
                    <td style={{ padding: '12px 20px', color: '#374151' }}>{r.action}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: modColors.bg, color: modColors.text }}>
                        {r.module}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', color: '#94a3b8', fontSize: 12 }}>{r.dateTime}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity style={{ width: 28, height: 28, color: '#94a3b8' }} />
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>No activity records found</p>
                      <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                        {hasFilters ? 'Try adjusting your filters or date range.' : 'Staff activity will be logged here once actions are performed.'}
                      </p>
                      {hasFilters && (
                        <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 16px', border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                          <X style={{ width: 14, height: 14 }} /> Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
