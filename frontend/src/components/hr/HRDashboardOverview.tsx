// @module HRDashboardOverview — HR Dashboard summary with live counts
import React, { useMemo } from 'react';
import {
  Users, UserCheck, UserX, ShieldCheck, TrendingUp,
  Plus, UserCog, Clock, ArrowRight,
} from 'lucide-react';
import { USER_ROLE_OPTIONS } from '@/lib/roles';

// ── Inline badge helpers ───────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  administrator: { bg: '#ede9fe', text: '#6d28d9' },
  office_admin:  { bg: '#ede9fe', text: '#6d28d9' },
  hr:            { bg: '#eff6ff', text: '#1d4ed8' },
  operation_manager: { bg: '#e0e7ff', text: '#4338ca' },
  technician:    { bg: '#ecfeff', text: '#0e7490' },
  sales:         { bg: '#ecfdf5', text: '#065f46' },
  service_staff: { bg: '#f0fdf4', text: '#15803d' },
  staff_inventory: { bg: '#fefce8', text: '#a16207' },
  staff_quality_checker: { bg: '#fef3c7', text: '#92400e' },
  customer:      { bg: '#f1f5f9', text: '#475569' },
  system:        { bg: '#f1f5f9', text: '#475569' },
};

function roleBadge(role: string) {
  const cfg = ROLE_BADGE[role] ?? ROLE_BADGE.customer;
  const label = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
      background: cfg.bg, color: cfg.text,
    }}>
      {label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HRDashboardOverview({ localUsers, activityLogs, onNavigate }: any) {
  const activeAccounts = localUsers.filter((u: any) =>
    u.status === 'active' || (u.isActive && u.status !== 'suspended'),
  ).length;
  const inactiveAccounts = localUsers.filter((u: any) => u.status === 'suspended').length;

  const uniqueRoles = new Set(localUsers.map((u: any) => u.role).filter(Boolean));
  const rolesCount = uniqueRoles.size;
  const totalSystemRoles = USER_ROLE_OPTIONS.filter((r: any) => r.value !== 'customer').length;

  const cards = [
    {
      label: 'Total Staff', value: localUsers.length,
      icon: Users, color: '#2563EB', bg: '#eff6ff', border: '#bfdbfe',
      trend: `${localUsers.filter((u: any) => { const d = new Date(u.createdAt); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length} added this month`, trendUp: true,
    },
    {
      label: 'Active Accounts', value: activeAccounts,
      icon: UserCheck, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0',
      trend: `${Math.round((activeAccounts / Math.max(1, localUsers.length)) * 100)}% of total`, trendUp: true,
    },
    {
      label: 'Inactive Accounts', value: inactiveAccounts,
      icon: UserX, color: '#d97706', bg: '#fffbeb', border: '#fde68a',
      trend: `${Math.round((inactiveAccounts / Math.max(1, localUsers.length)) * 100)}% of total`, trendUp: false,
    },
    {
      label: 'Roles Defined', value: totalSystemRoles,
      icon: ShieldCheck, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe',
      trend: `${rolesCount} role${rolesCount !== 1 ? 's' : ''} currently assigned`, trendUp: true,
    },
  ];

  const recentActivity = useMemo(() =>
    (activityLogs || []).slice(0, 6).map((log: any) => {
      const u = localUsers.find((x: any) => x.name === log.userName) || {};
      return {
        id: log.id,
        name: log.userName || 'System',
        role: u.role || log.userRole || 'system',
        time: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          .format(new Date(log.createdAt || log.timestamp || Date.now())),
        action: log.action || log.title || log.message || '—',
      };
    }), [activityLogs, localUsers],
  );

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', margin: 0 }}>HR Dashboard</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{today} · Overview of workforce and activity</p>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 500, color: '#059669',
          background: '#ecfdf5', border: '1px solid #a7f3d0',
          padding: '6px 12px', borderRadius: 999,
        }}>
          <span style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          Live Data
        </span>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={{
              background: '#fff', borderRadius: 12,
              border: `1px solid ${card.border}`,
              boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
              padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
              transition: 'box-shadow 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>{card.label}</span>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon style={{ width: 18, height: 18, color: card.color }} />
                </div>
              </div>
              <div>
                <p style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: 0 }}>{card.value}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <TrendingUp style={{ width: 13, height: 13, color: card.trendUp ? '#10b981' : '#f59e0b' }} />
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{card.trend}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions — Only HR-relevant: User Management, Role Assignment, Staff Activity */}
      <div style={{
        background: 'linear-gradient(to right, #2563EB, #1d4ed8)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: 0 }}>Quick Actions</h2>
          <p style={{ fontSize: 14, color: '#bfdbfe', marginTop: 2 }}>Manage your workforce from here</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('staff')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: '#fff', color: '#1d4ed8', borderRadius: 8, border: 'none',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
            boxShadow: '0 1px 2px 0 rgb(0 0 0/0.05)',
          }}>
            <Plus style={{ width: 16, height: 16 }} /> Add Staff
          </button>
          <button onClick={() => onNavigate('roles')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: '#3b82f6', color: '#fff', borderRadius: 8, border: '1px solid #60a5fa',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>
            <UserCog style={{ width: 16, height: 16 }} /> Manage Roles
          </button>
          <button onClick={() => onNavigate('activity')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: '#3b82f6', color: '#fff', borderRadius: 8, border: '1px solid #60a5fa',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>
            <Clock style={{ width: 16, height: 16 }} /> View Activity
          </button>
        </div>
      </div>

      {/* Recent Staff Activity */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgb(0 0 0/0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>Recent Staff Activity</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Latest actions across the system</p>
          </div>
          <button onClick={() => onNavigate('activity')} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500,
            color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer',
          }}>
            View all <ArrowRight style={{ width: 13, height: 13 }} />
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Name', 'Role', 'Last Login', 'Action Done'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentActivity.length > 0 ? recentActivity.map((item: any, idx: number) => {
                const initials = item.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2);
                return (
                  <tr key={item.id || idx} style={{ borderBottom: idx < recentActivity.length - 1 ? '1px solid #e2e8f0' : 'none', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB' }}>{initials}</span>
                        </div>
                        <span style={{ fontWeight: 500, color: '#0f172a' }}>{item.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px' }}>{roleBadge(item.role)}</td>
                    <td style={{ padding: '12px 20px', color: '#94a3b8', fontSize: 12 }}>{item.time}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 6, background: '#f1f5f9', color: '#374151', fontSize: 13 }}>
                        {item.action}
                      </span>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={4} style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Clock style={{ width: 24, height: 24, color: '#94a3b8' }} />
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#374151', margin: 0 }}>No recent activity</p>
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Staff activity will appear here once logged</p>
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
