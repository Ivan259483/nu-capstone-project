import React, { useMemo } from 'react';
import { ShieldCheck, CalendarCheck, Wrench, CreditCard, Users, Activity, Clock } from 'lucide-react';

interface Props { users: any[]; }

type SystemRole = {
  id: string;
  label: string;
  desc: string;
  portalDesc?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  permissions: string[];
};

const STAFF_ROLE_IDS = ['office_admin', 'sales', 'staff_quality_checker'];
const PRESENCE_ONLINE_MS = 3 * 60 * 1000;

const SYSTEM_ROLES: SystemRole[] = [
  { id: 'office_admin', label: 'Office Admin', desc: 'Ang admin ninyo — oversees and controls everything: users, bookings, operations, live tracking, and settings', icon: ShieldCheck, color: '#F97316', bg: '#FFF7ED', permissions: ['User management', 'Bookings & jobs', 'Vehicle live tracking', 'Inventory & suppliers', 'Activity & reports', 'Settings'] },
  { id: 'sales', label: 'Sales', desc: 'Booking appointments, point of sale, and assistance for customer booking', icon: CreditCard, color: '#F59E0B', bg: '#FFFBEB', permissions: ['POS', 'Sales dashboard', 'Bookings / calendar', 'Customer lookup'] },
  { id: 'staff_quality_checker', label: 'Quality Checker - Technician', desc: 'Vehicle live tracking, QC workflows, and job visibility', icon: Wrench, color: '#2563EB', bg: '#EFF6FF', permissions: ['Live customer tracking', 'QC queue', 'Job read / verify'] },
  { id: 'customer', label: 'Customer', desc: 'End-user accounts — book services and view their own status', portalDesc: 'Portal access is limited to self-service booking, payment proof, live status tracking, and personal service history.', icon: CalendarCheck, color: '#64748b', bg: '#f8fafc', permissions: ['Booking portal', 'Own service history', 'Profile'] },
];

const normalizeUserStatus = (status?: string) => {
  if (status === 'archived' || status === 'inactive') return 'suspended';
  if (status === 'pending_verification') return 'pending';
  return status || 'pending';
};

const lastSeenMs = (user: any): number | null => {
  const raw = user?.lastSeenAt;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
};

export default function AdminRoleManagement({ users }: Props) {
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach(u => { const r = u.role || 'unknown'; counts[r] = (counts[r] || 0) + 1; });
    return counts;
  }, [users]);
  const activeSessions = useMemo(() => {
    const now = Date.now();
    return users.filter((user) => normalizeUserStatus(user.status) === 'active' && lastSeenMs(user) != null && now - lastSeenMs(user)! < PRESENCE_ONLINE_MS).length;
  }, [users]);
  const pendingVerifications = useMemo(() => users.filter((user) => normalizeUserStatus(user.status) === 'pending').length, [users]);
  const summaryStats = [
    { label: 'Staff Roles', value: SYSTEM_ROLES.filter(r => STAFF_ROLE_IDS.includes(r.id)).length, color: '#10B981', tint: '#ECFDF5', helper: 'Assignable admin roles', Icon: ShieldCheck },
    { label: 'Total Users', value: users.length, color: '#2563EB', tint: '#EFF6FF', helper: 'All registered accounts', Icon: Users },
    { label: 'Active Sessions', value: activeSessions, color: '#10B981', tint: '#ECFDF5', helper: 'Seen in last 3 mins', Icon: Activity },
    { label: 'Pending Verifications', value: pendingVerifications, color: '#F59E0B', tint: '#FFFBEB', helper: 'Awaiting activation', Icon: Clock },
  ];

  return (
    <div className="ah-page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 className="ah-page-title">Role Management</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>System roles and their permissions — {SYSTEM_ROLES.length} roles defined</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {summaryStats.map(s => (
          <div key={s.label} className="ah-kpi-card" style={{ padding: 20, minHeight: 136, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p className="ah-section-label">{s.label}</p>
                <p className="tabular-nums" style={{ fontSize: 34, fontWeight: 700, color: s.color, margin: '8px 0 0', lineHeight: 1 }}>{s.value}</p>
              </div>
              <span style={{ width: 38, height: 38, borderRadius: '50%', background: s.tint, color: s.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <s.Icon size={18} aria-hidden />
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600, margin: '12px 0 0' }}>{s.helper}</p>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>{role.label}</h3>
                    <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: role.color, background: role.bg, padding: '2px 8px', borderRadius: 6 }}>{count} user{count !== 1 ? 's' : ''}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 12px', lineHeight: 1.4 }}>{role.desc}</p>
                  {role.portalDesc && <p style={{ fontSize: 12, color: '#475569', margin: '-4px 0 12px', lineHeight: 1.5 }}>{role.portalDesc}</p>}
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
