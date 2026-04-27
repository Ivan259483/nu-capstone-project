import React, { useMemo } from 'react';
import { ShieldCheck, Users, Eye, Package, CalendarCheck, Wrench, CreditCard, BarChart3 } from 'lucide-react';

interface Props { users: any[]; }

const SYSTEM_ROLES = [
  { id: 'administrator', label: 'Administrator', desc: 'Full system access — manages all modules, users, and settings', icon: ShieldCheck, color: '#dc2626', bg: '#fef2f2', permissions: ['Full Access', 'System Settings', 'All Modules', 'User Management', 'Audit Logs'] },
  { id: 'office_admin', label: 'Office Admin', desc: 'Administrative operations — manages users, office settings, and daily administration', icon: ShieldCheck, color: '#ea580c', bg: '#fff7ed', permissions: ['User Management', 'Office Settings', 'Admin Dashboard'] },
  { id: 'hr', label: 'Human Resource', desc: 'Staff management — accounts, roles, and activity monitoring', icon: Users, color: '#7c3aed', bg: '#f5f3ff', permissions: ['Staff Management', 'Role Assignment', 'Activity Monitor'] },
  { id: 'operation_manager', label: 'Operation Manager', desc: 'Oversees daily operations — services, scheduling, and quality', icon: BarChart3, color: '#059669', bg: '#ecfdf5', permissions: ['Operations Dashboard', 'Service Management', 'Quality Control', 'Scheduling'] },
  { id: 'inventory', label: 'Inventory Management', desc: 'Controls stock visibility, supplier coordination, and purchasing workflows', icon: Package, color: '#0f766e', bg: '#ecfeff', permissions: ['Stock Monitoring', 'Supplier Visibility', 'Inventory Reports'] },
  { id: 'sales', label: 'Sales', desc: 'Handles POS transactions, customer interactions, and sales analytics', icon: CreditCard, color: '#d97706', bg: '#fffbeb', permissions: ['POS Access', 'Sales Dashboard', 'Customer Lookup'] },
  { id: 'staff_quality_checker', label: 'Technician - Quality Checker', desc: 'Reviews completed work — inspections, approvals, and quality checks', icon: Wrench, color: '#6366f1', bg: '#eef2ff', permissions: ['Inspection Queue', 'Quality Reports', 'Approve/Reject', 'Technical Reports'] },
  { id: 'staff_inventory', label: 'Inventory Staff', desc: 'Manages stock, supplies, and product catalogues', icon: Package, color: '#14b8a6', bg: '#f0fdfa', permissions: ['Inventory CRUD', 'Stock Alerts', 'Supplier Management'] },
  { id: 'customer', label: 'Customer', desc: 'End-user accounts — can book services and view history', icon: CalendarCheck, color: '#64748b', bg: '#f8fafc', permissions: ['Booking Portal', 'Service History', 'Profile Management'] },
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
          { label: 'Total Roles', value: SYSTEM_ROLES.length, color: '#2563eb' },
          { label: 'Staff Roles', value: SYSTEM_ROLES.filter(r => !['customer', 'administrator', 'office_admin'].includes(r.id)).length, color: '#059669' },
          { label: 'Total Users', value: users.length, color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} className="ah-kpi-card" style={{ padding: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{s.label}</p>
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
