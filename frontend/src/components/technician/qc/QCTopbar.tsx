import React, { useState } from 'react';
import { Bell, ChevronDown, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Backend integration point: GET /api/qc/notifications
const notifications: { id: string; title: string; time: string; unread: boolean }[] = [];

interface Props { sidebarCollapsed: boolean; }

export default function QCTopbar({ sidebarCollapsed }: Props) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuth();
  const unread = notifications.filter((item) => item.unread).length;
  const initials = user?.name
    ? user.name.split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()
    : 'QC';

  return (
    <header
      data-sidebar-collapsed={sidebarCollapsed}
      className="qc-dash-topbar z-20 flex h-16 flex-shrink-0 items-center justify-between gap-4 bg-white/92 px-6 backdrop-blur-xl"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="hidden items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-blue-700 ring-1 ring-blue-100 lg:flex">
          <ShieldCheck size={16} />
          <span className="text-xs font-black uppercase tracking-[0.12em]">QC Ops</span>
        </div>

        <div className="group relative hidden w-full max-w-xl md:block">
          <Search
            size={16}
            strokeWidth={2.25}
            className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600"
          />
          <input
            type="text"
            placeholder="Search jobs, vehicles, customers"
            className="h-11 w-full rounded-xl border border-slate-200/55 bg-white pl-11 pr-20 text-sm font-semibold text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_28px_-24px_rgba(15,23,42,0.4)] outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-300/70 focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] font-black leading-none text-slate-500">
            Ctrl K
          </kbd>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Notifications"
          >
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </button>
          {notifOpen && (
            <div className="qc-drop-panel qc-notif-panel absolute right-0 top-12 z-50 flex w-80 flex-col overflow-hidden">
              <div className="qc-drop-panel__head flex shrink-0 items-center justify-between px-4 py-3">
                <span className="text-sm font-black tracking-tight text-slate-900">Notifications</span>
                <button type="button" className="text-xs font-bold text-blue-600 transition hover:text-blue-700">Mark all read</button>
              </div>
              <div className="qc-notif-panel__body max-h-72 space-y-1 overflow-y-auto px-2 py-2">
                {notifications.length > 0 ? notifications.map((item) => (
                  <div
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50/90 ${item.unread ? 'bg-blue-50/60' : ''}`}
                  >
                    <div className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${item.unread ? 'bg-blue-500' : 'bg-transparent'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-slate-700">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{item.time}</p>
                    </div>
                  </div>
                )) : (
                  <div className="px-4 py-7 text-center">
                    <div className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 text-slate-400 ring-1 ring-slate-200/40">
                      <Bell size={15} />
                    </div>
                    <p className="text-sm font-bold text-slate-600">No notifications</p>
                    <p className="mt-1 text-xs text-slate-400">You're all caught up</p>
                  </div>
                )}
              </div>
              <div className="qc-drop-panel__foot shrink-0 bg-slate-50/55 px-4 py-2.5 text-center">
                <button type="button" className="text-xs font-bold text-blue-600 transition hover:text-blue-700">View all notifications</button>
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-gradient-to-b from-transparent via-slate-200/50 to-transparent" />

        <div className="relative">
          <button
            type="button"
            onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-[11px] font-black text-white shadow-sm shadow-blue-700/20">
              {initials}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-[13px] font-black leading-none tracking-tight text-slate-900">{user?.name || 'Quality Inspector'}</p>
              <p className="mt-1 text-[11px] font-medium capitalize text-slate-400">{(user?.role || 'inspector').replace(/_/g, ' ')}</p>
            </div>
            <ChevronDown size={13} className="hidden text-slate-400 md:block" />
          </button>
          {profileOpen && (
            <div className="qc-drop-panel absolute right-0 top-12 z-50 w-52 overflow-hidden">
              <div className="qc-drop-panel__head px-4 py-3">
                <p className="text-sm font-black tracking-tight text-slate-900">{user?.name || 'Quality Inspector'}</p>
                <p className="mt-0.5 truncate text-xs text-slate-400">{user?.email || ''}</p>
              </div>
              <div className="bg-slate-50/55 p-1.5">
                <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-white">Profile Settings</button>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  onClick={() => { setProfileOpen(false); logout(); }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
