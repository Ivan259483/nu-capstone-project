import React, { useEffect, useMemo, useState } from 'react';
import { Search, Eye, EyeOff, Edit2, Archive, ChevronLeft, ChevronRight, ShieldCheck, ArrowUpDown, X, Plus, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { UserService } from '@/lib/user-service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  canManageUserRole,
  getManageableUserRoles,
  getRoleLabel,
  HUB_CREATE_ROLE_LABELS,
  ROLE_LABELS,
  getSafeUserRole,
  HUB_CREATE_USER_ROLES,
  type UserRole,
} from '@/lib/roles';

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

/** Presence: “Active now” if lastSeenAt within this window */
const PRESENCE_ONLINE_MS = 3 * 60 * 1000;

function lastSeenMs(user: any): number | null {
  const raw = user?.lastSeenAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function formatRelativeAgo(agoMs: number): string {
  const ago = Math.max(0, agoMs);
  const sec = Math.floor(ago / 1000);
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

/** When lastSeenAt is missing, approximate “how old” info from Mongo updatedAt */
function accountUpdatedMs(user: any): number | null {
  const raw = user?.updatedAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

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
  const [nowTick, setNowTick] = useState(() => Date.now());

  const assignableRoleOptions = useMemo(() => {
    const roles = getManageableUserRoles(currentUserRole);
    return roles.map((role) => ({
      value: role,
      label: getRoleLabel(role),
    }));
  }, [currentUserRole]);

  /** Edit modal: never offer assigning the bootstrap Administrator role from this screen */
  const editRoleOptions = useMemo(
    () => assignableRoleOptions.filter((o) => o.value !== 'administrator'),
    [assignableRoleOptions],
  );

  /** Create User modal: staff only (OFFICE ADMIN + SALES + QC) — no Customer, no Administrator */
  const createRoleOptions = useMemo(() => {
    const manageable = new Set(getManageableUserRoles(currentUserRole));
    return HUB_CREATE_USER_ROLES.filter((r) => manageable.has(r)).map((role) => ({
      value: role,
      label: HUB_CREATE_ROLE_LABELS[role] || getRoleLabel(role),
    }));
  }, [currentUserRole]);

  const defaultCreateRole =
    createRoleOptions.find((o) => o.value === 'office_admin')?.value
    || createRoleOptions[0]?.value
    || 'office_admin';

  const filterRoleOptions = useMemo(() => {
    // Table filter: all assignable/display roles except bootstrap Administrator (optional narrow filter)
    return (Object.keys(ROLE_LABELS) as UserRole[])
      .filter((role) => role !== 'administrator')
      .map((role) => ({
        value: role,
        label: ROLE_LABELS[role],
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const filtered = useMemo(() => {
    const data = users.filter((user) => {
      const normalizedSearch = search.toLowerCase();
      const matchSearch = !normalizedSearch
        || (user.name || '').toLowerCase().includes(normalizedSearch)
        || (user.email || '').toLowerCase().includes(normalizedSearch)
        || (user.id || user._id || '').toString().toLowerCase().includes(normalizedSearch);
      const matchRole = !roleFilter || getSafeUserRole(user.role) === roleFilter;
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

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') onRefresh();
    }, 45000);
    return () => window.clearInterval(id);
  }, [onRefresh]);

  const onlineNowCount = useMemo(
    () =>
      users.filter(
        (u) =>
          normalizeUserStatus(u.status) === 'active' &&
          lastSeenMs(u) != null &&
          nowTick - lastSeenMs(u)! < PRESENCE_ONLINE_MS,
      ).length,
    [users, nowTick],
  );

  const totalUsersCount = users.length;
  const activeAccountsCount = useMemo(
    () => users.filter((u) => normalizeUserStatus(u.status) === 'active').length,
    [users],
  );
  const pendingAccountsCount = useMemo(
    () => users.filter((u) => normalizeUserStatus(u.status) === 'pending').length,
    [users],
  );
  const archivedAccountsCount = useMemo(
    () => users.filter((u) => normalizeUserStatus(u.status) === 'suspended').length,
    [users],
  );
  const statusFilterLabel = statusFilter
    ? STATUS_FILTER_OPTIONS.find((status) => status.value === statusFilter)?.label || statusFilter
    : '';
  const roleFilterLabel = roleFilter
    ? filterRoleOptions.find((role) => role.value === roleFilter)?.label || roleFilter
    : '';
  const hasActiveFilters = Boolean(search.trim() || roleFilter || statusFilter);
  const visiblePages = useMemo(() => {
    if (totalPages <= 0) return [];
    const visibleCount = Math.min(totalPages, 5);
    const start = Math.max(1, Math.min(page - 2, totalPages - visibleCount + 1));
    return Array.from({ length: visibleCount }, (_, index) => start + index);
  }, [page, totalPages]);

  const canManageAccount = (user: any) => canManageUserRole(currentUserRole, user?.role);
  const isCurrentUser = (user: any) => String(user?.id || user?._id || '') === String(currentUserId || '');
  const canMutateAccount = (user: any) => canManageAccount(user) && !isCurrentUser(user);
  const isBootstrapAdminUser = (u: any) => getSafeUserRole(u?.role) === 'administrator';
  const actorIsBootstrapAdministrator = getSafeUserRole(currentUserRole) === 'administrator';
  /** Archive / restore stays the same for most users; only the bootstrap Administrator row is protected from OFFICE ADMIN */
  const canArchiveOrRestoreAccount = (u: any) =>
    canMutateAccount(u) && (!isBootstrapAdminUser(u) || actorIsBootstrapAdministrator);

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

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setPage(1);
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

  const renderActivity = (user: any) => {
    const st = normalizeUserStatus(user.status);
    if (st !== 'active') {
      return statusBadge(user.status);
    }
    const seen = lastSeenMs(user);
    if (seen == null) {
      const updated = accountUpdatedMs(user);
      if (updated != null) {
        const ago = nowTick - updated;
        return (
          <div className="ah-user-activity">
            <span className="ah-badge ah-badge-inactive">Offline</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Account updated {formatRelativeAgo(ago)}
            </span>
          </div>
        );
      }
      return (
        <div className="ah-user-activity">
          <span className="ah-badge ah-badge-inactive">Offline</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>No session yet</span>
        </div>
      );
    }
    const ago = nowTick - seen;
    if (ago < PRESENCE_ONLINE_MS) {
      return (
        <div className="ah-user-activity">
          <span className="ah-badge ah-badge-success">Active now</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>{formatRelativeAgo(ago)}</span>
        </div>
      );
    }
    return (
      <div className="ah-user-activity">
        <span className="ah-badge ah-badge-inactive">Offline</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          Last active {formatRelativeAgo(ago)}
        </span>
      </div>
    );
  };

  const pageStart = filtered.length === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
  const pageEnd = Math.min(page * ITEMS_PER_PAGE, filtered.length);

  return (
    <div className="ah-page-enter ah-users-page">
      <div className="ah-users-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>User Management</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 6, marginBottom: 0 }}>Manage all registered accounts, roles, and access levels</p>
        </div>
        <button className="ah-btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Create User</button>
      </div>

      <div className="ah-users-kpi-grid">
        {[
          { label: 'Total users', value: totalUsersCount, color: '#2563eb', helper: 'All accounts' },
          { label: 'Active accounts', value: activeAccountsCount, color: '#059669', helper: 'Can sign in' },
          { label: 'Online right now', value: onlineNowCount, color: '#16a34a', helper: 'Seen in last 3 mins' },
          { label: 'Pending verification', value: pendingAccountsCount, color: '#d97706', helper: 'Needs activation' },
          { label: 'Archived accounts', value: archivedAccountsCount, color: '#64748b', helper: 'Access disabled' },
        ].map(stat => (
          <div key={stat.label} className="ah-users-stat-card" style={{ ['--ah-stat-accent' as string]: stat.color }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>{stat.label}</p>
            <p className="tabular-nums" style={{ fontSize: 30, fontWeight: 800, color: stat.color, margin: '6px 0 0', letterSpacing: '-0.03em' }}>{stat.value}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>{stat.helper}</p>
          </div>
        ))}
      </div>

      <div className="ah-card-section ah-users-table-card">
        <div className="ah-user-toolbar" style={{ boxShadow: '0 4px 18px -12px rgba(15,23,42,0.07)', flexShrink: 0 }}>
          <div className="ah-user-toolbar-main">
            <div className="ah-user-search-wrap">
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input className="ah-input" placeholder="Search by name, email, or user ID..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} style={{ paddingLeft: 36 }} />
            </div>
            <select className="ah-input ah-user-filter-control" value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(1); }}>
              <option value="">All roles</option>
              {filterRoleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
            <select className="ah-input ah-user-filter-control" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="">All account status</option>
              {STATUS_FILTER_OPTIONS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
            <div className="ah-user-toolbar-meta">
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', padding: '6px 10px', borderRadius: 999, background: '#f1f5f9' }}>
                {filtered.length} {filtered.length === 1 ? 'user' : 'users'} found
              </span>
              {hasActiveFilters && (
                <button className="ah-btn-secondary" onClick={clearFilters} style={{ padding: '6px 10px', fontSize: 12 }}>
                  <X size={13} />
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {hasActiveFilters && (
            <div className="ah-user-active-filters">
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Active filters:</span>
              {search.trim() ? (
                <span style={{ fontSize: 12, color: '#334155', borderRadius: 999, padding: '4px 10px', background: '#eff6ff', boxShadow: 'inset 0 0 0 1px rgba(191,219,254,0.8)' }}>
                  Search: {search.trim()}
                </span>
              ) : null}
              {roleFilterLabel ? (
                <span style={{ fontSize: 12, color: '#334155', borderRadius: 999, padding: '4px 10px', background: '#f8fafc', boxShadow: 'inset 0 0 0 1px rgba(203,213,225,0.9)' }}>
                  Role: {roleFilterLabel}
                </span>
              ) : null}
              {statusFilterLabel ? (
                <span style={{ fontSize: 12, color: '#334155', borderRadius: 999, padding: '4px 10px', background: '#f8fafc', boxShadow: 'inset 0 0 0 1px rgba(203,213,225,0.9)' }}>
                  Status: {statusFilterLabel}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="ah-user-toolbar-tip">
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            Tip: Use <strong>View</strong> for details, <strong>Edit</strong> for role/status updates, and <strong>Archive</strong> to disable sign-in.
          </p>
        </div>

        <div className="ah-users-table-scroll">
          <table className="ah-table ah-users-table">
            <colgroup>
              <col style={{ width: '24%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead><tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>User <ArrowUpDown size={11} style={{ display: 'inline', marginLeft: 4, color: sortField === 'name' ? '#2563eb' : '#cbd5e1' }} /></th>
              <th>Email address</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('role')}>Access role <ArrowUpDown size={11} style={{ display: 'inline', marginLeft: 4, color: sortField === 'role' ? '#2563eb' : '#cbd5e1' }} /></th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>Status and activity <ArrowUpDown size={11} style={{ display: 'inline', marginLeft: 4, color: sortField === 'status' ? '#2563eb' : '#cbd5e1' }} /></th>
              <th>Created date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr></thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}><td colSpan={6}><div className="ah-skeleton" style={{ height: 20, width: '100%' }} /></td></tr>
              )) : paginated.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No users match your current filters.</td></tr>
              ) : paginated.map(user => (
                <tr key={user.id || user._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0, boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}>{(user.name || '?')[0]?.toUpperCase()}</div>
                      <div style={{ minWidth: 0 }}>
                        <p className="ah-cell-truncate" style={{ fontWeight: 600, color: '#1e293b', margin: 0, fontSize: 14 }}>{user.name || 'Unnamed user'}</p>
                        <p className="font-mono ah-cell-truncate" style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>ID: {(user.id || user._id || '').slice(-8) || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className="font-mono ah-cell-truncate" style={{ fontSize: 12, color: '#475569', display: 'block' }}>{user.email || '—'}</span></td>
                  <td>
                    <span className="ah-user-role-pill"><ShieldCheck size={11} className="shrink-0" /><span>{getRoleLabel(user.role)}</span></span>
                  </td>
                  <td>{renderActivity(user)}</td>
                  <td><span className="font-mono" style={{ fontSize: 12, color: '#94a3b8' }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="ah-user-actions">
                      <button type="button" className="ah-user-action-btn" onClick={() => setViewUser(user)} title="View details" aria-label={`View ${user.name || 'user'} details`}>
                        <Eye size={15} />
                      </button>
                      {canMutateAccount(user) ? (
                        <>
                          <button type="button" className="ah-user-action-btn" onClick={() => setEditUser(user)} title="Edit account" aria-label={`Edit ${user.name || 'user'}`}>
                            <Edit2 size={15} />
                          </button>
                          {normalizeUserStatus(user.status) === 'active' && canArchiveOrRestoreAccount(user) && (
                            <button type="button" className="ah-user-action-btn ah-user-action-btn--danger" onClick={() => handleArchive(user)} title="Archive account" aria-label={`Archive ${user.name || 'user'}`}>
                              <Archive size={15} />
                            </button>
                          )}
                          {normalizeUserStatus(user.status) === 'suspended' && canArchiveOrRestoreAccount(user) && (
                            <button type="button" className="ah-user-action-btn ah-user-action-btn--success" onClick={() => handleActivate(user)} title="Restore account" aria-label={`Restore ${user.name || 'user'}`}>
                              <RotateCcw size={15} />
                            </button>
                          )}
                        </>
                      ) : (
                        <button type="button" className="ah-user-action-btn" disabled title={isCurrentUser(user) ? 'Manage your own account from profile settings' : 'You do not have permission to modify this account'} aria-label="Edit disabled">
                          <Edit2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ah-users-table-footer">
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            Showing <strong style={{ color: '#475569' }}>{pageStart}–{pageEnd}</strong> of <strong style={{ color: '#475569' }}>{filtered.length}</strong> users · Page {totalPages === 0 ? 0 : page} of {totalPages}
          </p>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: page === 1 ? 'not-allowed' : 'pointer', color: '#64748b', opacity: page === 1 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
            {visiblePages.map((pageNo) => (
              <button key={pageNo} onClick={() => setPage(pageNo)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: page === pageNo ? '#2563eb' : 'transparent', color: page === pageNo ? '#fff' : '#64748b' }}>{pageNo}</button>
            ))}
            <button onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page >= totalPages} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: page >= totalPages ? 'not-allowed' : 'pointer', color: '#64748b', opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      {createOpen && <CreateUserModalInline defaultRole={defaultCreateRole} roleOptions={createRoleOptions} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); onRefresh(); }} />}
      {editUser && (
        <EditUserModalInline
          user={editUser}
          roleOptions={editRoleOptions}
          bootstrapAdmin={getSafeUserRole(editUser.role) === 'administrator'}
          onClose={() => setEditUser(null)}
          onUpdated={() => { setEditUser(null); onRefresh(); }}
        />
      )}
      {viewUser && <ViewUserPanel user={viewUser} canEdit={canMutateAccount(viewUser)} onClose={() => setViewUser(null)} onEdit={() => { setEditUser(viewUser); setViewUser(null); }} />}
    </div>
  );
}

type CreateUserFormValues = { name: string; email: string; password: string; confirmPassword: string; role: string };

const CREATE_USER_PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

function getCreateUserPasswordRules(password: string) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: CREATE_USER_PASSWORD_SPECIAL_RE.test(password),
  };
}

function getCreateUserPasswordPolicyError(password: string): string | null {
  const rules = getCreateUserPasswordRules(password);
  if (!password) return 'Password is required.';
  if (!rules.length) return 'Password must be at least 8 characters.';
  if (!rules.upper) return 'Password must contain at least one uppercase letter.';
  if (!rules.lower) return 'Password must contain at least one lowercase letter.';
  if (!rules.number) return 'Password must contain at least one number.';
  if (!rules.special) return 'Password must contain at least one special character.';
  return null;
}

function getCreateUserPasswordStrength(password: string) {
  if (!password.length) return null;
  const rules = getCreateUserPasswordRules(password);
  const met = [rules.length, rules.upper, rules.lower, rules.number, rules.special].filter(Boolean).length;
  if (met <= 2) return { label: 'Weak', widthClass: 'w-[24%]', barClass: 'bg-gradient-to-r from-red-500 to-orange-500', textClass: 'text-red-600' };
  if (met <= 4) return { label: 'Medium', widthClass: 'w-[62%]', barClass: 'bg-gradient-to-r from-amber-500 to-orange-500', textClass: 'text-amber-600' };
  if (password.length >= 12) return { label: 'Very strong', widthClass: 'w-full', barClass: 'bg-gradient-to-r from-emerald-500 to-green-500', textClass: 'text-emerald-700' };
  return { label: 'Strong', widthClass: 'w-[88%]', barClass: 'bg-gradient-to-r from-blue-500 to-emerald-500', textClass: 'text-emerald-700' };
}

function validateCreateUserForm(form: CreateUserFormValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!form.name.trim()) e.name = 'Full name is required.';
  if (!form.email.trim()) e.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    e.email = 'Enter a valid email address.';
  }
  if (!form.role) e.role = 'Select a role.';
  const passwordError = getCreateUserPasswordPolicyError(form.password);
  if (passwordError) e.password = passwordError;
  if (!form.confirmPassword) e.confirmPassword = 'Confirm your password.';
  else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
  return e;
}

function CreateUserModalInline({ defaultRole, roleOptions, onClose, onCreated }: { defaultRole: string; roleOptions: { value: string; label: string }[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CreateUserFormValues>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: defaultRole,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const passwordRules = useMemo(() => getCreateUserPasswordRules(form.password), [form.password]);
  const passwordStrength = useMemo(() => getCreateUserPasswordStrength(form.password), [form.password]);
  const passwordChecklist = useMemo(
    () => [
      { met: passwordRules.length, label: '8+ characters' },
      { met: passwordRules.upper, label: 'Uppercase letter (A-Z)' },
      { met: passwordRules.lower, label: 'Lowercase letter (a-z)' },
      { met: passwordRules.number, label: 'Number (0-9)' },
      { met: passwordRules.special, label: 'Special character (!@#$...)' },
    ],
    [passwordRules],
  );

  useEffect(() => {
    if (!roleOptions.some((option) => option.value === form.role)) {
      setForm((current) => ({ ...current, role: defaultRole }));
    }
  }, [defaultRole, form.role, roleOptions]);

  const patchForm = (partial: Partial<CreateUserFormValues>) => {
    setForm((current) => ({ ...current, ...partial }));
    const keys = Object.keys(partial) as (keyof CreateUserFormValues)[];
    if (keys.length) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        for (const k of keys) delete next[k];
        return next;
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = validateCreateUserForm(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-modal-title"
        className="flex max-h-[min(92vh,760px)] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-6 py-4 bg-gradient-to-b from-slate-50/95 to-white">
          <h2 id="create-user-modal-title" className="text-lg font-semibold tracking-tight text-slate-900">
            Create New User
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/90 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            aria-label="Close dialog"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-6 scroll-pb-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                className={cn(
                  'ah-input w-full',
                  fieldErrors.name && 'ring-2 ring-red-400/35 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]',
                )}
                placeholder="e.g. Juan Dela Cruz"
                value={form.name}
                onChange={(event) => patchForm({ name: event.target.value })}
                autoComplete="name"
              />
              {fieldErrors.name ? <p className="text-xs font-medium text-red-600">{fieldErrors.name}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                className={cn(
                  'ah-input w-full',
                  fieldErrors.email && 'ring-2 ring-red-400/35 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]',
                )}
                type="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(event) => patchForm({ email: event.target.value })}
                autoComplete="email"
              />
              {fieldErrors.email ? <p className="text-xs font-medium text-red-600">{fieldErrors.email}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                className={cn(
                  'ah-input w-full normal-case',
                  fieldErrors.role && 'ring-2 ring-red-400/35 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]',
                )}
                value={form.role}
                onChange={(event) => patchForm({ role: event.target.value })}
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              {fieldErrors.role ? <p className="text-xs font-medium text-red-600">{fieldErrors.role}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  className={cn(
                    'ah-input w-full pr-10',
                    fieldErrors.password && 'ring-2 ring-red-400/35 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]',
                  )}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Min 8 chars, upper, lower, number, special"
                  value={form.password}
                  onChange={(event) => patchForm({ password: event.target.value })}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  onClick={() => setShowPass((current) => !current)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {passwordStrength ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Password strength
                    </span>
                    <span className={cn('text-xs font-bold', passwordStrength.textClass)}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-300 ease-out',
                        passwordStrength.widthClass,
                        passwordStrength.barClass,
                      )}
                    />
                  </div>
                  <ul className="mt-3 grid gap-1.5" aria-label="Password requirements">
                    {passwordChecklist.map((rule) => (
                      <li
                        key={rule.label}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
                          rule.met ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500',
                        )}
                      >
                        {rule.met ? (
                          <CheckCircle2 size={14} className="shrink-0 text-emerald-500" aria-hidden />
                        ) : (
                          <XCircle size={14} className="shrink-0 text-slate-300" aria-hidden />
                        )}
                        <span>{rule.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {fieldErrors.password ? <p className="text-xs font-medium text-red-600">{fieldErrors.password}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  className={cn(
                    'ah-input w-full pr-10',
                    fieldErrors.confirmPassword && 'ring-2 ring-red-400/35 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]',
                  )}
                  type={showConf ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={form.confirmPassword}
                  onChange={(event) => patchForm({ confirmPassword: event.target.value })}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  onClick={() => setShowConf((current) => !current)}
                  aria-label={showConf ? 'Hide password' : 'Show password'}
                >
                  {showConf ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {fieldErrors.confirmPassword ? (
                <p className="text-xs font-medium text-red-600">{fieldErrors.confirmPassword}</p>
              ) : null}
            </div>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 px-6 py-4 bg-slate-50/80 shadow-[0_-6px_24px_-8px_rgba(15,23,42,0.06)]">
            <button
              type="button"
              className="rounded-xl border-0 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-all hover:bg-slate-50 hover:shadow-[0_2px_10px_rgba(15,23,42,0.1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ah-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm disabled:opacity-60"
              disabled={saving}
            >
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function EditUserModalInline({
  user,
  roleOptions,
  bootstrapAdmin,
  onClose,
  onUpdated,
}: {
  user: any;
  roleOptions: { value: string; label: string }[];
  bootstrapAdmin: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', role: user.role || '', status: normalizeUserStatus(user.status) });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = bootstrapAdmin
        ? { name: form.name, email: form.email, status: form.status }
        : form;
      const res = await UserService.updateUser(user.id || user._id, payload);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', boxShadow: '0 4px 18px -10px rgba(15,23,42,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #60a5fa, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 600 }}>{(user.name || '?')[0]?.toUpperCase()}</div>
            <div><h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Edit User</h3><p className="font-mono" style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{(user.id || user._id || '').slice(-12)}</p></div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '20px 24px 36px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              scrollPaddingBottom: 24,
            }}
          >
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Full Name</label><input className="ah-input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Email</label><input className="ah-input" type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Role</label>
                {bootstrapAdmin ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b', padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(15,23,42,0.05), inset 0 0 0 1px rgba(226,232,240,0.55)' }}>
                    {getRoleLabel('administrator')} <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: '#94a3b8' }}>System bootstrap account — role is not changed from this screen.</span>
                  </p>
                ) : (
                  <select className="ah-input" value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>{roleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
                )}
              </div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Status</label>
                <select className="ah-input" value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}>{STATUS_FILTER_OPTIONS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', background: '#fafbfc', boxShadow: '0 -6px 24px -8px rgba(15,23,42,0.06)' }}>
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
        <div style={{ padding: '24px', textAlign: 'center', boxShadow: '0 4px 18px -10px rgba(15,23,42,0.08)' }}>
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
        <div style={{ display: 'flex', gap: 12, padding: '16px 24px', boxShadow: '0 -6px 24px -8px rgba(15,23,42,0.06)', background: '#fafbfc' }}>
          <button className="ah-btn-secondary" onClick={onClose} style={{ flex: 1 }}>Close</button>
          {canEdit && <button className="ah-btn-primary" onClick={onEdit} style={{ flex: 1 }}><Edit2 size={14} /> Edit</button>}
        </div>
      </div>
    </div>
  );
}
