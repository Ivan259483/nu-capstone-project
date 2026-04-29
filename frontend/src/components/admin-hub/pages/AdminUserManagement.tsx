import React, { useEffect, useMemo, useState } from 'react';
import { Search, Eye, EyeOff, Edit2, Archive, ChevronLeft, ChevronRight, ShieldCheck, ArrowUpDown, X, Plus, RotateCcw } from 'lucide-react';
import { UserService } from '@/lib/user-service';
import { toast } from 'sonner';
import { canManageUserRole, getManageableUserRoles, getRoleLabel, ROLE_LABELS } from '@/lib/roles';

interface Props {
  users: any[];
  setUsers: (fn: (prev: any[]) => any[]) => void;
  loading: boolean;
  onRefresh: () => void;
  currentUserRole?: string;
  currentUserId?: string;
}

const ITEMS_PER_PAGE = 10;
const STATUS_FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Archived' },
] as const;

const normalizeUserStatus = (status?: string) => {
  if (status === 'archived' || status === 'inactive') return 'suspended';
  if (status === 'pending_verification') return 'pending';
  return status || 'pending';
};

const getStatusBadgeLabel = (status?: string) => {
  const normalized = normalizeUserStatus(status);
  return normalized === 'suspended' ? 'archived' : normalized.replace(/_/g, ' ');
};

export default function AdminUserManagement({ users, setUsers, loading, onRefresh, currentUserRole, currentUserId }: Props) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [viewUser, setViewUser] = useState<any>(null);

  const assignableRoleOptions = useMemo(() => {
    const roles = getManageableUserRoles(currentUserRole);
    return roles.map(role => ({
      value: role,
      label: getRoleLabel(role),
    }));
  }, [currentUserRole]);

  const filterRoleOptions = useMemo(() => {
    // Always show all defined system roles so the filter is consistent
    // regardless of whether any user currently has that role.
    return (Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>)
      .filter(role => role !== 'customer') // customers aren't managed as staff
      .map(role => ({
        value: role,
        label: ROLE_LABELS[role],
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const defaultRole = assignableRoleOptions.find(option => option.value === 'customer')?.value || assignableRoleOptions[0]?.value || 'customer';

  const filtered = useMemo(() => {
    const data = users.filter(user => {
      const normalizedSearch = search.toLowerCase();
      const matchSearch = !normalizedSearch
        || (user.name || '').toLowerCase().includes(normalizedSearch)
        || (user.email || '').toLowerCase().includes(normalizedSearch);
      const matchRole = !roleFilter || user.role === roleFilter;
      const matchStatus = !statusFilter || normalizeUserStatus(user.status) === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });

    data.sort((a, b) => {
      const av = (a[sortField] || '').toString().toLowerCase();
      const bv = (b[sortField] || '').toString().toLowerCase();
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return data;
  }, [users, search, roleFilter, statusFilter, sortField, sortAsc]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (page > Math.max(totalPages, 1)) {
      setPage(Math.max(totalPages, 1));
    }
  }, [page, totalPages]);

  const canManageAccount = (user: any) => canManageUserRole(currentUserRole, user?.role);
  const isCurrentUser = (user: any) => String(user?.id || user?._id || '') === String(currentUserId || '');
  const canMutateAccount = (user: any) => canManageAccount(user) && !isCurrentUser(user);

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(current => !current);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleArchive = async (user: any) => {
    if (!confirm(`Archive ${user.name}? They will lose access immediately.`)) return;
    try {
      const res = await UserService.archiveUser(user.id || user._id);
      if (res.success) {
        toast.success(`${user.name} archived`);
        onRefresh();
      } else {
        toast.error(res.message || 'Failed');
      }
    } catch {
      toast.error('Failed to archive user');
    }
  };

  const handleActivate = async (user: any) => {
    try {
      const res = await UserService.activateUser(user.id || user._id);
      if (res.success) {
        toast.success(`${user.name} activated`);
        onRefresh();
      } else {
        toast.error(res.message || 'Failed');
      }
    } catch {
      toast.error('Failed to activate user');
    }
  };

  const statusBadge = (status: string) => {
    const normalized = normalizeUserStatus(status);
    const map: Record<string, string> = {
      active: 'ah-badge-active',
      pending: 'ah-badge-pending',
      pending_verification: 'ah-badge-pending',
      suspended: 'ah-badge-archived',
    };

    return <span className={`ah-badge ${map[normalized] || 'ah-badge-inactive'}`}>{getStatusBadgeLabel(normalized)}</span>;
  };

  return (
    <div className="ah-page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', margin: 0 }}>User Management</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Manage all registered accounts, roles, and access levels</p>
        </div>
        <button className="ah-btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Create User</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Total', value: users.length, color: '#2563eb' },
          { label: 'Active', value: users.filter(user => user.status === 'active').length, color: '#059669' },
          { label: 'Pending', value: users.filter(user => user.status === 'pending' || user.status === 'pending_verification').length, color: '#d97706' },
          { label: 'Archived', value: users.filter(user => normalizeUserStatus(user.status) === 'suspended').length, color: '#64748b' },
        ].map(stat => (
          <div key={stat.label} className="ah-kpi-card" style={{ padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{stat.label}</p>
            <p className="tabular-nums" style={{ fontSize: 28, fontWeight: 700, color: stat.color, margin: '4px 0 0' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="ah-card-section">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input className="ah-input" placeholder="Search by name or email..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} style={{ paddingLeft: 36 }} />
          </div>
          <select className="ah-input" value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 140 }}>
            <option value="">All Roles</option>
            {filterRoleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
          <select className="ah-input" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }} style={{ width: 'auto', minWidth: 130 }}>
            <option value="">All Status</option>
            {STATUS_FILTER_OPTIONS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="ah-table">
            <thead><tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Name <ArrowUpDown size={11} style={{ display: 'inline', marginLeft: 4, color: sortField === 'name' ? '#2563eb' : '#cbd5e1' }} /></th>
              <th>Email</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('role')}>Role</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}><td colSpan={6}><div className="ah-skeleton" style={{ height: 20, width: '100%' }} /></td></tr>
              )) : paginated.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No users match your filters</td></tr>
              ) : paginated.map(user => (
                <tr key={user.id || user._id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{(user.name || '?')[0]?.toUpperCase()}</div>
                    <div><p style={{ fontWeight: 500, color: '#1e293b', margin: 0, fontSize: 14 }}>{user.name}</p><p className="font-mono" style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{(user.id || user._id || '').slice(-8)}</p></div>
                  </div></td>
                  <td><span className="font-mono" style={{ fontSize: 12, color: '#475569' }}>{user.email}</span></td>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, fontSize: 12, fontWeight: 500, border: '1px solid #bfdbfe' }}><ShieldCheck size={11} />{getRoleLabel(user.role)}</span></td>
                  <td>{statusBadge(user.status)}</td>
                  <td><span className="font-mono" style={{ fontSize: 12, color: '#94a3b8' }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setViewUser(user)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', transition: 'all 0.15s' }} title="View"><Eye size={14} /></button>
                      {canMutateAccount(user) ? (
                        <>
                          <button onClick={() => setEditUser(user)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', transition: 'all 0.15s' }} title="Edit"><Edit2 size={14} /></button>
                          {normalizeUserStatus(user.status) === 'active' && <button onClick={() => handleArchive(user)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }} title="Archive"><Archive size={14} /></button>}
                          {normalizeUserStatus(user.status) === 'suspended' && <button onClick={() => handleActivate(user)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }} title="Restore"><RotateCcw size={14} /></button>}
                        </>
                      ) : (
                        <button
                          disabled
                          style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'not-allowed', color: '#cbd5e1' }}
                          title={isCurrentUser(user) ? 'Manage your own account from profile settings' : 'You do not have permission to modify this account'}
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Showing {filtered.length === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}</p>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: page === 1 ? 'not-allowed' : 'pointer', color: '#64748b', opacity: page === 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => (
              <button key={index} onClick={() => setPage(index + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: page === index + 1 ? '#2563eb' : 'transparent', color: page === index + 1 ? '#fff' : '#64748b' }}>{index + 1}</button>
            ))}
            <button onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page >= totalPages} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: page >= totalPages ? 'not-allowed' : 'pointer', color: '#64748b', opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      {createOpen && <CreateUserModalInline defaultRole={defaultRole} roleOptions={assignableRoleOptions} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); onRefresh(); }} />}
      {editUser && <EditUserModalInline user={editUser} roleOptions={assignableRoleOptions} onClose={() => setEditUser(null)} onUpdated={() => { setEditUser(null); onRefresh(); }} />}
      {viewUser && <ViewUserPanel user={viewUser} canEdit={canMutateAccount(viewUser)} onClose={() => setViewUser(null)} onEdit={() => { setEditUser(viewUser); setViewUser(null); }} />}
    </div>
  );
}

function CreateUserModalInline({ defaultRole, roleOptions, onClose, onCreated }: { defaultRole: string; roleOptions: { value: string; label: string }[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: defaultRole });
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);

  useEffect(() => {
    if (!roleOptions.some(option => option.value === form.role)) {
      setForm(current => ({ ...current, role: defaultRole }));
    }
  }, [defaultRole, form.role, roleOptions]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error('Name, email, and password are required');
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const { confirmPassword, ...payload } = form;
      const res = await UserService.createUser(payload);
      if (res.success) {
        toast.success(`${form.name} created successfully`);
        onCreated();
      } else {
        toast.error(res.message || 'Failed to create user');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed');
    }
    setSaving(false);
  };

  return (
    <div className="ah-modal-overlay" onClick={onClose}>
      <div className="ah-modal-card" onClick={event => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <div><h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Create New User</h3><p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Fill in all required fields</p></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Full Name <span style={{ color: '#ef4444' }}>*</span></label><input className="ah-input" placeholder="e.g. Juan Dela Cruz" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Email <span style={{ color: '#ef4444' }}>*</span></label><input className="ah-input" type="email" placeholder="user@example.com" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Role <span style={{ color: '#ef4444' }}>*</span></label>
              <select className="ah-input" value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>
                {roleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Password <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <input className="ah-input" type={showPass ? 'text' : 'password'} placeholder="Min 8 characters" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} style={{ paddingRight: 36 }} />
                <button type="button" onClick={() => setShowPass(current => !current)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <input className="ah-input" type={showConf ? 'text' : 'password'} placeholder="Confirm your password" value={form.confirmPassword} onChange={event => setForm(current => ({ ...current, confirmPassword: event.target.value }))} style={{ paddingRight: 36 }} />
                <button type="button" onClick={() => setShowConf(current => !current)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <button type="button" className="ah-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="ah-btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModalInline({ user, roleOptions, onClose, onUpdated }: { user: any; roleOptions: { value: string; label: string }[]; onClose: () => void; onUpdated: () => void }) {
  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', role: user.role || '', status: normalizeUserStatus(user.status) });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await UserService.updateUser(user.id || user._id, form);
      if (res.success) {
        toast.success(`${form.name} updated`);
        onUpdated();
      } else {
        toast.error(res.message || 'Failed');
      }
    } catch {
      toast.error('Failed to update user');
    }
    setSaving(false);
  };

  return (
    <div className="ah-modal-overlay" onClick={onClose}>
      <div className="ah-modal-card" onClick={event => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 600 }}>{(user.name || '?')[0]?.toUpperCase()}</div>
            <div><h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Edit User</h3><p className="font-mono" style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{(user.id || user._id || '').slice(-12)}</p></div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Full Name</label><input className="ah-input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Email</label><input className="ah-input" type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Role</label>
                <select className="ah-input" value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>{roleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
              </div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Status</label>
                <select className="ah-input" value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}>{STATUS_FILTER_OPTIONS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <button type="button" className="ah-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="ah-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ViewUserPanel({ user, canEdit, onClose, onEdit }: { user: any; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  const normalizedStatus = normalizeUserStatus(user.status);
  const statusMap: Record<string, string> = {
    active: 'ah-badge-active',
    pending: 'ah-badge-pending',
    pending_verification: 'ah-badge-pending',
    suspended: 'ah-badge-archived',
  };

  return (
    <div className="ah-modal-overlay" onClick={onClose}>
      <div className="ah-modal-card" style={{ maxWidth: 440 }} onClick={event => event.stopPropagation()}>
        <div style={{ padding: '24px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 600, margin: '0 auto 12px' }}>{(user.name || '?')[0]?.toUpperCase()}</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>{user.name}</h3>
          <p className="font-mono" style={{ fontSize: 13, color: '#64748b', margin: '4px 0 8px' }}>{user.email}</p>
          <span className={`ah-badge ${statusMap[normalizedStatus] || 'ah-badge-inactive'}`}>{getStatusBadgeLabel(normalizedStatus)}</span>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[['Role', getRoleLabel(user.role)], ['Created', user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—']].map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 13, color: '#64748b' }}>{label}</span><span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{value}</span></div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '16px 24px', borderTop: '1px solid #f1f5f9' }}>
          <button className="ah-btn-secondary" onClick={onClose} style={{ flex: 1 }}>Close</button>
          {canEdit && <button className="ah-btn-primary" onClick={onEdit} style={{ flex: 1 }}><Edit2 size={14} /> Edit</button>}
        </div>
      </div>
    </div>
  );
}
