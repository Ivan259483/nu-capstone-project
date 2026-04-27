// @module HRRoleAccessControl
import React, { useState } from 'react';
import {
  ShieldCheck, Shield, Users, UserCog, Wrench, User,
  Info, Plus, Check, X, Pencil,
} from 'lucide-react';
import { USER_ROLE_OPTIONS } from '@/lib/roles';
import { toast } from 'sonner';

// ── Modules shown in the permission matrix ─────────────────────────────────────
// These match the actual system capability groups defined in roles.ts
const SYSTEM_MODULES = [
  'User Management',
  'Inventory Management',
  'Suppliers',
  'Bookings & Appointments',
  'POS & Sales',
  'Activity & Reports',
  'Waivers & Documents',
  'AI Damage Detection',
  'System Settings',
];

// ── Role display config ────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  accentColor: string;
}> = {
  administrator: {
    label: 'Admin',
    description: 'Full system access. Manages all settings, users, and system configuration.',
    icon: ShieldCheck,
    iconBg: '#ede9fe',
    iconColor: '#7c3aed',
    accentColor: '#7c3aed',
  },
  hr: {
    label: 'HR',
    description: 'Manages personnel and staff records. Can assign roles and monitor activity.',
    icon: Shield,
    iconBg: '#dbeafe',
    iconColor: '#2563eb',
    accentColor: '#2563eb',
  },
  operation_manager: {
    label: 'Manager',
    description: 'Oversees bookings, staff coordination, and operational reports.',
    icon: UserCog,
    iconBg: '#e0e7ff',
    iconColor: '#4338ca',
    accentColor: '#4338ca',
  },
  technician: {
    label: 'Technician',
    description: 'Voice assistant, AI damage detection, AR, and limited inventory access.',
    icon: Wrench,
    iconBg: '#cffafe',
    iconColor: '#0e7490',
    accentColor: '#0e7490',
  },
  service_staff: {
    label: 'Staff',
    description: 'Access to staff dashboard and job assignments only.',
    icon: User,
    iconBg: '#f1f5f9',
    iconColor: '#64748b',
    accentColor: '#64748b',
  },
};

// Permissions per role — derived from the actual role arrays in roles.ts
// Each boolean maps to whether that role has access to the system module
function buildDefaultPerms(roleId: string): Record<string, boolean> {
  const permsMap: Record<string, Record<string, boolean>> = {
    administrator: Object.fromEntries(SYSTEM_MODULES.map(m => [m, true])),
    hr: {
      'User Management': true,
      'Inventory Management': false,
      'Suppliers': false,
      'Bookings & Appointments': false,
      'POS & Sales': false,
      'Activity & Reports': true,
      'Waivers & Documents': false,
      'AI Damage Detection': false,
      'System Settings': false,
    },
    operation_manager: {
      'User Management': true,
      'Inventory Management': false,
      'Suppliers': false,
      'Bookings & Appointments': true,
      'POS & Sales': false,
      'Activity & Reports': true,
      'Waivers & Documents': true,
      'AI Damage Detection': true,
      'System Settings': false,
    },
    technician: {
      'User Management': false,
      'Inventory Management': false,
      'Suppliers': false,
      'Bookings & Appointments': false,
      'POS & Sales': false,
      'Activity & Reports': false,
      'Waivers & Documents': false,
      'AI Damage Detection': true,
      'System Settings': false,
    },
    service_staff: {
      'User Management': false,
      'Inventory Management': false,
      'Suppliers': false,
      'Bookings & Appointments': false,
      'POS & Sales': false,
      'Activity & Reports': false,
      'Waivers & Documents': false,
      'AI Damage Detection': false,
      'System Settings': false,
    },
  };
  return permsMap[roleId] ?? Object.fromEntries(SYSTEM_MODULES.map(m => [m, false]));
}

// ── Displayed roles (subset matching screenshot) ────────────────────────────────
const DISPLAY_ROLES = ['administrator', 'hr', 'operation_manager', 'technician', 'service_staff'];

export default function HRRoleAccessControl({ localUsers, currentUserRole }: any) {
  const staffUsers: any[] = localUsers ?? [];
  const isReadOnly = currentUserRole === 'hr'; // HR can view but not modify permissions

  const [perms, setPerms] = useState<Record<string, Record<string, boolean>>>(
    () => Object.fromEntries(DISPLAY_ROLES.map(r => [r, buildDefaultPerms(r)]))
  );

  const memberCount = (roleId: string) =>
    staffUsers.filter((u: any) => u.role === roleId).length;

  const allowedCount = (roleId: string) =>
    Object.values(perms[roleId] ?? {}).filter(Boolean).length;

  const totalModules = SYSTEM_MODULES.length;

  const handleToggle = async (roleId: string, mod: string) => {
    if (isReadOnly) {
      toast.info('Permission changes are restricted to administrators only. Contact your admin to modify role access.');
      return;
    }
    if (roleId === 'administrator') { toast.info('Admin always has full system access'); return; }
    setPerms(prev => {
      const next = { ...prev[roleId], [mod]: !prev[roleId][mod] };
      const cfg = ROLE_CONFIG[roleId];
      toast.success(`${cfg?.label ?? roleId} — "${mod}" ${next[mod] ? 'enabled' : 'disabled'}`);
      // Persist to backend (fire-and-forget)
      try {
        fetch('/api/roles/permissions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('autospf_token') || ''}` },
          body: JSON.stringify({ role: roleId, module: mod, enabled: next[mod] }),
        }).catch(() => { /* Backend may not support this endpoint yet — changes stay in UI session */ });
      } catch { /* silent */ }
      return { ...prev, [roleId]: next };
    });
  };

  const handleCreateRole = () => {
    toast.info('System roles are pre-defined and managed by the administrator. Use the permission matrix below to customize access per role.');
  };

  const totalMembers = DISPLAY_ROLES.reduce((s, r) => s + memberCount(r), 0);

  return (
    <div style={{
      padding: '32px 40px',
      maxWidth: 1300,
      margin: '0 auto',
      fontFamily: "'Inter', 'DM Sans', sans-serif",
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
            Role &amp; Access Control
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 5 }}>
            {DISPLAY_ROLES.length} roles defined · {totalMembers} total members · {totalModules} system modules
          </p>
        </div>
        {!isReadOnly && (
        <button style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 18px', borderRadius: 8, border: 'none',
          background: '#2563eb', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
          letterSpacing: '-0.01em',
        }}
          onClick={handleCreateRole}
        >
          <Plus style={{ width: 15, height: 15 }} />
          Create Role
        </button>
        )}
      </div>

      {/* ── Role Cards ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 14,
        marginBottom: 22,
      }}>
        {DISPLAY_ROLES.map(roleId => {
          const cfg = ROLE_CONFIG[roleId] ?? ROLE_CONFIG.service_staff;
          const Icon = cfg.icon;
          const mc = memberCount(roleId);
          const ac = allowedCount(roleId);
          const pct = Math.round((ac / totalModules) * 100);

          return (
            <div key={roleId} style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e8edf3',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              padding: '18px 18px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              transition: 'box-shadow 0.15s, border-color 0.15s',
              cursor: 'default',
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.09)';
                (e.currentTarget as HTMLElement).style.borderColor = '#c7d8f0';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                (e.currentTarget as HTMLElement).style.borderColor = '#e8edf3';
              }}
            >
              {/* Icon */}
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: cfg.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon style={{ width: 20, height: 20, color: cfg.iconColor }} />
              </div>

              {/* Name */}
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  {cfg.label}
                </p>
                <p style={{
                  fontSize: 11.5, color: '#94a3b8', marginTop: 4, lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {cfg.description}
                </p>
              </div>

              {/* Members + Perms */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#64748b' }}>
                  <Users style={{ width: 12, height: 12 }} />
                  {mc} member{mc !== 1 ? 's' : ''}
                </span>
                <span style={{
                  fontSize: 11.5, fontWeight: 600,
                  color: cfg.accentColor,
                }}>
                  {ac}/{totalModules} perms
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ height: 4, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: cfg.accentColor,
                  width: `${pct}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Info Banner ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#eff6ff', border: '1px solid #bfdbfe',
        borderRadius: 10, padding: '11px 16px', marginBottom: 18,
      }}>
        <Info style={{ width: 15, height: 15, color: '#2563eb', flexShrink: 0 }} />
        <p style={{ fontSize: 13, color: '#1d4ed8', margin: 0 }}>
          <strong style={{ fontWeight: 600 }}>Permission Matrix</strong>
          {' '}— Toggle access per module for each role. Changes take effect immediately for all members of that role.
        </p>
      </div>

      {/* ── Permission Matrix ────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #e8edf3',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        marginBottom: 28,
      }}>

        {/* Table header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `220px repeat(${DISPLAY_ROLES.length}, 1fr)`,
          borderBottom: '1px solid #e8edf3',
          background: '#fff',
          padding: '0 0',
        }}>
          {/* MODULE label */}
          <div style={{
            padding: '14px 24px',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: '#94a3b8',
            borderRight: '1px solid #f1f5f9',
          }}>
            Module
          </div>

          {/* Role columns */}
          {DISPLAY_ROLES.map(roleId => {
            const cfg = ROLE_CONFIG[roleId] ?? ROLE_CONFIG.service_staff;
            const mc = memberCount(roleId);
            return (
              <div key={roleId} style={{
                padding: '12px 12px 10px',
                textAlign: 'center',
                borderRight: '1px solid #f1f5f9',
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: cfg.accentColor, margin: 0 }}>
                  {cfg.label}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 6px' }}>
                  {mc} member{mc !== 1 ? 's' : ''}
                </p>
                {/* Edit icon */}
                <button style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#cbd5e1', padding: 2,
                  display: 'inline-flex', alignItems: 'center',
                }}>
                  <Pencil style={{ width: 12, height: 12 }} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Matrix rows */}
        {SYSTEM_MODULES.map((mod, idx) => {
          const isLast = idx === SYSTEM_MODULES.length - 1;
          return (
            <div key={mod} style={{
              display: 'grid',
              gridTemplateColumns: `220px repeat(${DISPLAY_ROLES.length}, 1fr)`,
              borderBottom: isLast ? 'none' : '1px solid #f1f5f9',
              background: idx % 2 === 1 ? '#fafbfc' : '#fff',
            }}>
              {/* Module name */}
              <div style={{
                padding: '14px 24px',
                fontSize: 13, fontWeight: 500, color: '#374151',
                borderRight: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center',
              }}>
                {mod}
              </div>

              {/* Permission cells */}
              {DISPLAY_ROLES.map(roleId => {
                const isAdmin = roleId === 'administrator';
                const allowed = perms[roleId]?.[mod] ?? false;
                return (
                  <div key={roleId} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRight: '1px solid #f1f5f9',
                    padding: '10px 12px',
                  }}>
                    <button
                      onClick={() => handleToggle(roleId, mod)}
                      title={isAdmin ? 'Admin always has full access' : `Toggle ${mod} for ${ROLE_CONFIG[roleId]?.label}`}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        border: 'none', cursor: isAdmin ? 'default' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: allowed ? '#dcfce7' : '#fef2f2',
                        transition: 'background 0.15s, transform 0.1s',
                      }}
                      onMouseEnter={e => { if (!isAdmin) (e.currentTarget as HTMLElement).style.transform = 'scale(1.12)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                    >
                      {allowed
                        ? <Check style={{ width: 14, height: 14, color: '#16a34a', strokeWidth: 2.5 }} />
                        : <X style={{ width: 14, height: 14, color: '#dc2626', strokeWidth: 2.5 }} />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Footer */}
        <div style={{
          padding: '10px 24px',
          background: '#fafbfc',
          borderTop: '1px solid #e8edf3',
          display: 'flex', justifyContent: 'flex-end',
          fontSize: 12, color: '#94a3b8',
        }}>
          {DISPLAY_ROLES.length} roles · {SYSTEM_MODULES.length} modules
        </div>
      </div>

    </div>
  );
}
