import React, { useMemo } from 'react';
import { ShieldCheck, CalendarCheck, Wrench, CreditCard } from 'lucide-react';

interface Props { users: any[]; }

const SYSTEM_ROLES = [
  { id: 'office_admin', label: 'Office Admin', desc: 'Ang admin ninyo — oversees and controls everything: users, bookings, operations, live tracking, and settings', icon: ShieldCheck, color: '#ea580c', bg: '#fff7ed', permissions: ['User management', 'Bookings & jobs', 'Vehicle live tracking', 'Inventory & suppliers', 'Activity & reports', 'Settings'] },
  { id: 'sales', label: 'Sales', desc: 'Booking appointments, point of sale, and assistance for customer booking', icon: CreditCard, color: '#d97706', bg: '#fffbeb', permissions: ['POS', 'Sales dashboard', 'Bookings / calendar', 'Customer lookup'] },
  { id: 'staff_quality_checker', label: 'Quality Checker - Technician', desc: 'Vehicle live tracking, QC workflows, and job visibility', icon: Wrench, color: '#6366f1', bg: '#eef2ff', permissions: ['Live customer tracking', 'QC queue', 'Job read / verify'] },
  { id: 'customer', label: 'Customer', desc: 'End-user accounts — book services and view their own status', icon: CalendarCheck, color: '#64748b', bg: '#f8fafc', permissions: ['Booking portal', 'Own service history', 'Profile'] },
];

export default function AdminRoleManagement({ users }: Props) {
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach(u => { const r = u.role || 'unknown'; counts[r] = (counts[r] || 0) + 1; });
    return counts;
  }, [users]);

  return (
    <div className="ah-page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', margin: 0 }}>Role Management</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>System roles and their permissions — {SYSTEM_ROLES.length} roles defined</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          { label: 'Staff roles (assignable)', value: SYSTEM_ROLES.filter(r => ['office_admin', 'sales', 'staff_quality_checker'].includes(r.id)).length, color: '#059669' },
          { label: 'Total Users', value: users.length, color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} className="ah-kpi-card" style={{ padding: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.02em', margin: 0 }}>{s.label}</p>
            <p className="tabular-nums" style={{ fontSize: 24, fontWeight: 700, color: s.color, margin: '4px 0 0' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Role Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {SYSTEM_ROLES.map((role, idx) => {
          const Icon = role.icon;
          const count = roleCounts[role.id] || 0;
          return (
            <div key={role.id} className="ah-card-section ah-slide-up" style={{ padding: 20, animationDelay: `${idx * 0.04}s`, borderLeft: `4px solid ${role.color}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: role.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} style={{ color: role.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>{role.label}</h3>
                    <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: role.color, background: role.bg, padding: '2px 8px', borderRadius: 6 }}>{count} user{count !== 1 ? 's' : ''}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 12px', lineHeight: 1.4 }}>{role.desc}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {role.permissions.map(p => (
                      <span key={p} style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
