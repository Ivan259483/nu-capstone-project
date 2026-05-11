// @module HRRoleAssignment — Assign roles to staff members
import React, { useState, useCallback } from 'react';
import { Plus, Users, Edit3, UserPlus, ShieldCheck, X, Loader2 } from 'lucide-react';
import { USER_ROLE_OPTIONS } from '@/lib/roles';
import { UserService } from '@/lib/user-service';
import { toast } from 'sonner';

const ROLE_COLOR_MAP: Record<string, { iconBg: string; iconText: string; border: string }> = {
  administrator:         { iconBg: '#ede9fe', iconText: '#6d28d9', border: '#ddd6fe' },
  office_admin:          { iconBg: '#ede9fe', iconText: '#6d28d9', border: '#ddd6fe' },
  hr:                    { iconBg: '#dbeafe', iconText: '#1d4ed8', border: '#bfdbfe' },
  technician:            { iconBg: '#cffafe', iconText: '#0e7490', border: '#a5f3fc' },
  sales:                 { iconBg: '#d1fae5', iconText: '#065f46', border: '#a7f3d0' },
  service_staff:         { iconBg: '#f1f5f9', iconText: '#475569', border: '#cbd5e1' },
  staff_inventory:       { iconBg: '#fef3c7', iconText: '#92400e', border: '#fde68a' },
  staff_quality_checker: { iconBg: '#fef3c7', iconText: '#92400e', border: '#fde68a' },
  customer:              { iconBg: '#f1f5f9', iconText: '#475569', border: '#cbd5e1' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#111827', outline: 'none',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  office_admin: 'Users, bookings, operations, and office administration',
  hr: 'Staff account management, role assignments, activity monitoring',
  sales: 'POS transactions, receipts, sales tracking',
  service_staff: 'Job assignments and staff dashboard',
  staff_quality_checker: 'Quality check inspections',
  staff_inventory: 'Inventory stock monitoring',
  technician: 'Service execution and AI damage detection',
};

export default function HRRoleAssignment({ localUsers, setLocalUsers }: any) {
  const staffRoles = [...USER_ROLE_OPTIONS];

  // Permission counts per role (reflects actual system access)
  const PERM_COUNTS: Record<string, number> = {
    office_admin: 13, hr: 2, sales: 2,
    service_staff: 0, staff_quality_checker: 1, staff_inventory: 1, technician: 1,
  };

  const rolesWithData = staffRoles.map(role => ({
    ...role,
    memberCount: localUsers.filter((u: any) => u.role === role.value).length,
    permCount: PERM_COUNTS[role.value] ?? 0,
    description: ROLE_DESCRIPTIONS[role.value] || `System role: ${role.label}`,
  }));

  const totalAssigned = rolesWithData.reduce((s, r) => s + r.memberCount, 0);

  // ── Assign Role Modal ────────────────────────────────────────────
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [assignName, setAssignName] = useState('');
  const [assignEmail, setAssignEmail] = useState('');
  const [assignPassword, setAssignPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const openAssign = (roleValue: string) => {
    setSelectedRole(roleValue);
    setAssignName('');
    setAssignEmail('');
    setAssignPassword('');
    setShowAssignModal(true);
  };

  const refreshUsers = useCallback(async () => {
    try {
      const result = await UserService.getAllUsers();
      if (result?.success && Array.isArray(result.data)) setLocalUsers(result.data);
    } catch { /* silent */ }
  }, [setLocalUsers]);

  const handleAssignSave = async () => {
    if (!assignName.trim()) { toast.error('Name is required'); return; }
    if (!assignEmail.trim()) { toast.error('Email is required'); return; }
    if (!assignPassword.trim()) { toast.error('Password is required'); return; }
    if (assignPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setSaving(true);
    try {
      const payload = {
        name: assignName,
        email: assignEmail,
        password: assignPassword,
        role: selectedRole,
        status: 'active',
        isActive: true,
      };
      await UserService.createUser(payload);
      const roleLabel = staffRoles.find(r => r.value === selectedRole)?.label || selectedRole;
      toast.success(`New ${roleLabel} account created!`);
      setShowAssignModal(false);
      await refreshUsers();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to create user';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '32px clamp(20px, 3vw, 40px)', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', margin: 0 }}>Role Assignment</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
            {rolesWithData.length} roles · {totalAssigned} total assignments
          </p>
        </div>
        <button
          onClick={() => openAssign('service_staff')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
        >
          <UserPlus style={{ width: 16, height: 16 }} /> Assign Role
        </button>
      </div>

      {/* Role Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {rolesWithData.map(role => {
          const colors = ROLE_COLOR_MAP[role.value] ?? { iconBg: '#f1f5f9', iconText: '#475569', border: '#cbd5e1' };
          return (
            <div key={role.value} style={{
              background: '#fff', borderRadius: 12,
              border: `1px solid ${colors.border}`,
              boxShadow: '0 1px 3px 0 rgb(0 0 0/0.05)',
              padding: 20, transition: 'box-shadow 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: colors.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck style={{ width: 20, height: 20, color: colors.iconText }} />
                </div>
                <button
                  onClick={() => openAssign(role.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                >
                  <UserPlus style={{ width: 12, height: 12 }} /> Assign
                </button>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>{role.label}</h3>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
                {role.description}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
                  <Users style={{ width: 14, height: 14 }} />
                  <span>{role.memberCount} user{role.memberCount !== 1 ? 's' : ''} assigned</span>
                </div>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{role.permCount}/9 permissions</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ Assign Role Modal ═══ */}
      {showAssignModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
          }}
          onClick={() => setShowAssignModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '28px 28px 20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                  Assign Role — {staffRoles.find(r => r.value === selectedRole)?.label || selectedRole}
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Create a new staff account with this role.</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X style={{ width: 18, height: 18, color: '#94a3b8' }} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Full Name *</label>
                <input value={assignName} onChange={e => setAssignName(e.target.value)} placeholder="e.g. Maria Santos" style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Email Address *</label>
                <input type="email" value={assignEmail} onChange={e => setAssignEmail(e.target.value)} placeholder="e.g. maria@company.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Password *</label>
                <input type="password" value={assignPassword} onChange={e => setAssignPassword(e.target.value)} placeholder="Minimum 6 characters" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Role</label>
                <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} style={inputStyle}>
                  {staffRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 18, borderTop: '1px solid #e2e8f0', marginTop: 18 }}>
              <button onClick={() => setShowAssignModal(false)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 14, fontWeight: 500, background: '#fff', color: '#374151' }}>Cancel</button>
              <button onClick={handleAssignSave} disabled={saving} style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 500, background: saving ? '#93c5fd' : '#2563EB', color: '#fff',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {saving && <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />}
                Create & Assign
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
