// @module HRStaffList — Self-contained Staff CRUD
import React, { useState, useMemo, useCallback } from 'react';
import { Search, Plus, Edit3, Trash2, Users, X, Activity, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { UserService } from '@/lib/user-service';
import { getSafeUserRole, canManageUserRole, CUSTOMER_ROLE } from '@/lib/roles';

// ── Role badge config ──────────────────────────────────────────────
const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  administrator: { bg: '#ede9fe', text: '#6d28d9' },
  office_admin: { bg: '#ede9fe', text: '#6d28d9' },
  hr: { bg: '#eff6ff', text: '#1d4ed8' },
  operation_manager: { bg: '#e0e7ff', text: '#4338ca' },
  technician: { bg: '#ecfeff', text: '#0e7490' },
  sales: { bg: '#ecfdf5', text: '#065f46' },
  service_staff: { bg: '#f0fdf4', text: '#15803d' },
  staff_inventory: { bg: '#fefce8', text: '#a16207' },
  staff_quality_checker: { bg: '#fef3c7', text: '#92400e' },
  customer: { bg: '#f1f5f9', text: '#475569' },
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

type StatusKey = 'active' | 'suspended' | 'pending';
const STATUS_BADGE: Record<StatusKey, { bg: string; text: string; dot: string; label: string }> = {
  active: { bg: '#ecfdf5', text: '#065f46', dot: '#10b981', label: 'Active' },
  suspended: { bg: '#fef2f2', text: '#991b1b', dot: '#ef4444', label: 'Suspended' },
  pending: { bg: '#fffbeb', text: '#92400e', dot: '#f59e0b', label: 'Pending' },
};

function StatusBadge({ rawStatus, isActive }: { rawStatus?: string; isActive?: boolean }) {
  const key: StatusKey = rawStatus === 'active' || rawStatus === 'Active' ? 'active'
    : rawStatus === 'suspended' ? 'suspended'
      : (isActive ? 'active' : 'pending');
  const cfg = STATUS_BADGE[key];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: cfg.bg, color: cfg.text }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}

// ── Styles ──────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#111827', outline: 'none',
};

const ROLE_OPTIONS = [
  { value: 'office_admin', label: 'Office Admin' },
  { value: 'operation_manager', label: 'Operation Manager' },
  { value: 'hr', label: 'HR' },
  { value: 'sales', label: 'Sales' },
  { value: 'service_staff', label: 'Service Staff' },
  { value: 'staff_quality_checker', label: 'Quality Checker' },
  { value: 'staff_inventory', label: 'Inventory Staff' },
  { value: 'technician', label: 'Technician' },
];

// ── Component ──────────────────────────────────────────────────────
export default function HRStaffList({
  localUsers, setLocalUsers, searchTerm, setSearchTerm,
  roleFilter, setRoleFilter, statusFilter, setStatusFilter,
  handleEditUser: _parentEditUser, handleArchiveUser, handleActivateUser,
  user,
}: any) {

  // ── Local modal state ────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('service_staff');
  const [formStatus, setFormStatus] = useState('active');
  const [saving, setSaving] = useState(false);

  // ── Open Add Modal ───────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setIsEditing(false);
    setEditId(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('service_staff');
    setFormStatus('active');
    setShowModal(true);
  }, []);

  // ── Open Edit Modal ──────────────────────────────────────────────
  const openEditModal = useCallback((u: any) => {
    setIsEditing(true);
    setEditId(u.id || u._id);
    setFormName(u.name || '');
    setFormEmail(u.email || '');
    setFormPassword('');
    setFormRole(u.role || 'service_staff');
    setFormStatus(u.status || (u.isActive ? 'active' : 'pending'));
    setShowModal(true);
  }, []);

  // ── Refresh users ────────────────────────────────────────────────
  const refreshUsers = useCallback(async () => {
    try {
      const result = await UserService.getAllUsers();
      if (result?.success && Array.isArray(result.data)) {
        setLocalUsers(result.data);
      }
    } catch (e) {
      console.error('[HRStaffList] Failed to refresh users:', e);
    }
  }, [setLocalUsers]);

  // ── Save (create or update) ──────────────────────────────────────
  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Name is required'); return; }
    if (!formEmail.trim()) { toast.error('Email is required'); return; }
    if (!isEditing && !formPassword.trim()) { toast.error('Password is required for new staff'); return; }
    if (!isEditing && formPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setSaving(true);
    try {
      if (isEditing && editId) {
        const payload = { name: formName, role: formRole, status: formStatus, isActive: formStatus === 'active' };
        console.log('[HRStaffList] Updating user:', editId, payload);
        await UserService.updateUser(editId, payload);
        toast.success('Staff member updated!');
      } else {
        const payload = {
          name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
          status: formStatus,
          isActive: formStatus === 'active',
        };
        console.log('[HRStaffList] Creating staff:', payload);
        const result = await UserService.createUser(payload);
        console.log('[HRStaffList] Create result:', result);
        toast.success('New staff member created!');
      }
      setShowModal(false);
      await refreshUsers();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to save user';
      console.error('[HRStaffList] Save error:', e?.response?.data || e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handler ───────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return;
    try {
      await UserService.archiveUser(id);
      toast.success(`${name} has been suspended`);
      await refreshUsers();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to delete user');
    }
  };

  // ── Activate handler ─────────────────────────────────────────────
  const handleActivate = async (id: string) => {
    try {
      await UserService.activateUser(id);
      toast.success('User activated!');
      await refreshUsers();
    } catch {
      toast.error('Failed to activate user');
    }
  };

  // ── Filtered list ────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    return localUsers
      .filter((u: any) => {
        const matchSearch = !searchTerm ||
          u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const role = getSafeUserRole(u.role, CUSTOMER_ROLE);
        const matchRole = roleFilter === 'all' || role === roleFilter;
        const rawStatus = u.status ?? (u.isActive ? 'active' : 'pending');
        const matchStatus = statusFilter === 'all' ||
          (statusFilter === 'active' && (rawStatus === 'active' || rawStatus === 'Active')) ||
          (statusFilter === 'suspended' && rawStatus === 'suspended') ||
          (statusFilter === 'pending' && rawStatus === 'pending');
        return matchSearch && matchRole && matchStatus;
      })
      .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [localUsers, searchTerm, roleFilter, statusFilter]);

  const activeCount = localUsers.filter((u: any) => u.status === 'active' || (u.isActive && u.status !== 'suspended')).length;
  const hasFilters = searchTerm || roleFilter !== 'all' || statusFilter !== 'all';

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', margin: 0 }}>User Management</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
            {filteredUsers.length} staff member{filteredUsers.length !== 1 ? 's' : ''} · {activeCount} active
          </p>
        </div>
        <button
          onClick={openAddModal}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: '#2563EB', color: '#fff', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1d4ed8')}
          onMouseLeave={e => (e.currentTarget.style.background = '#2563EB')}
        >
          <Plus style={{ width: 16, height: 16 }} /> Add New Staff
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0/0.04)', padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94a3b8' }} />
            <input
              type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or role..."
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 130 }}>
            <option value="all">All Roles</option>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            <option value="administrator">Admin</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 130 }}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
          {hasFilters && (
            <button
              onClick={() => { setSearchTerm(''); setRoleFilter('all'); setStatusFilter('all'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#64748b', fontSize: 14, cursor: 'pointer' }}
            >
              <X style={{ width: 14, height: 14 }} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0/0.04)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Name', 'Email', 'Role', 'Status', 'Date Created', 'Actions'].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i === 5 ? 'right' : 'left',
                    padding: '10px 20px', fontSize: 11, fontWeight: 600,
                    color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? filteredUsers.map((u: any, idx: number) => {
                const role = getSafeUserRole(u.role, CUSTOMER_ROLE);
                const initials = (u.name || 'U').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
                const rawStatus = u.status ?? (u.isActive ? 'active' : 'pending');
                const isSuspended = rawStatus === 'suspended';
                const isManageable = canManageUserRole(user?.role, role);
                const dateCreated = u.createdAt
                  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(u.createdAt))
                  : '—';

                return (
                  <tr
                    key={u.id || u._id || idx}
                    style={{ borderBottom: idx < filteredUsers.length - 1 ? '1px solid #e2e8f0' : 'none', background: idx % 2 === 1 ? '#fafafa' : '#fff', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 1 ? '#fafafa' : '#fff')}
                  >
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {u.avatar
                          ? <img src={u.avatar} alt={u.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                          : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB' }}>{initials}</span>
                          </div>
                        }
                        <p style={{ fontWeight: 500, color: '#0f172a', margin: 0 }}>{u.name}</p>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', color: '#64748b' }}>{u.email}</td>
                    <td style={{ padding: '12px 20px' }}><RoleBadge role={role} /></td>
                    <td style={{ padding: '12px 20px' }}><StatusBadge rawStatus={rawStatus} isActive={u.isActive} /></td>
                    <td style={{ padding: '12px 20px', color: '#94a3b8', fontSize: 12 }}>{dateCreated}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      {isManageable && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          {isSuspended && (
                            <button
                              onClick={() => handleActivate(u.id || u._id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#ecfdf5', color: '#065f46', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                            >
                              <Activity style={{ width: 13, height: 13 }} /> Activate
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(u)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                          >
                            <Edit3 style={{ width: 13, height: 13 }} /> Edit
                          </button>
                          {!isSuspended && (
                            <button
                              onClick={() => handleDelete(u.id || u._id, u.name)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#fef2f2', color: '#991b1b', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                            >
                              <Trash2 style={{ width: 13, height: 13 }} /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users style={{ width: 28, height: 28, color: '#94a3b8' }} />
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>No staff members found</p>
                      <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                        {hasFilters ? 'Try adjusting your search or filters.' : 'Add your first staff member to get started.'}
                      </p>
                      {!hasFilters && (
                        <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 16px', background: '#2563EB', color: '#fff', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                          <Plus style={{ width: 15, height: 15 }} /> Add Staff
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

      {/* ═══════════════════════════════════════════════════════════════
          INLINE MODAL — Add / Edit Staff
          ═══════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            animation: 'fadeIn 0.15s ease',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '28px 28px 20px',
              animation: 'slideUp 0.2s ease',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                  {isEditing ? 'Edit Staff Member' : 'Add New Staff'}
                </h2>
                {!isEditing && <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Create a new staff account with role assignment.</p>}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X style={{ width: 18, height: 18, color: '#94a3b8' }} />
              </button>
            </div>

            {/* Form */}
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Full Name *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Maria Santos" style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Email Address *</label>
                <input
                  type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                  placeholder="e.g. maria@company.com" disabled={isEditing}
                  style={{ ...inputStyle, opacity: isEditing ? 0.5 : 1, cursor: isEditing ? 'not-allowed' : 'text' }}
                />
              </div>
              {!isEditing && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Password *</label>
                  <input
                    type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)}
                    placeholder="Minimum 6 characters" style={inputStyle}
                  />
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Staff will be asked to change this on first login.</p>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Assign Role *</label>
                <select value={formRole} onChange={e => setFormRole(e.target.value)} style={inputStyle}>
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Status</label>
                <select value={formStatus} onChange={e => setFormStatus(e.target.value)} style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 18, borderTop: '1px solid #e2e8f0', marginTop: 18 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 14, fontWeight: 500, background: '#fff', color: '#374151' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 500, background: saving ? '#93c5fd' : '#2563EB', color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.15s',
                }}
              >
                {saving && <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />}
                {isEditing ? 'Save Changes' : 'Create Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
