import React, { useState } from 'react';
import { Bell, Search, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Backend integration point: GET /api/qc/notifications
const notifications: { id: string; title: string; time: string; unread: boolean }[] = [];

interface Props { sidebarCollapsed: boolean; }

export default function QCTopbar({ sidebarCollapsed }: Props) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuth();
  const unread = notifications.filter((n) => n.unread).length;
  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'QC';

  return (
    <header className="flex-shrink-0 h-[60px] flex items-center justify-between bg-white px-6 gap-4">
      {/* Search */}
      <div className="relative hidden w-72 max-w-full md:block group">
        <Search
          size={16}
          strokeWidth={2.25}
          className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500"
        />
        <input
          type="text"
          placeholder="Search jobs, vehicles, customers…"
          className="h-10 w-full rounded-full border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 pl-11 pr-14 text-sm font-medium text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-10px_rgba(15,23,42,0.08)] outline-none transition-[border-color,box-shadow,color] placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300/95 focus:border-blue-400/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(59,130,246,0.16)]"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200/80 bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-slate-500 shadow-sm">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
          >
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-12px_rgba(15,23,42,0.18),0_8px_24px_-8px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between bg-white px-4 py-3.5">
                <span className="text-sm font-semibold tracking-tight text-slate-800">Notifications</span>
                <button className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700">Mark all read</button>
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto px-2 pb-1 pt-0">
                {notifications.length > 0 ? notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-slate-50/90 ${n.unread ? 'bg-blue-50/50' : ''}`}
                  >
                    <div className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${n.unread ? 'bg-blue-500' : 'bg-transparent'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-slate-700">{n.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{n.time}</p>
                    </div>
                  </div>
                )) : (
                  <div className="px-4 py-10 text-center">
                    <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100/90 shadow-[0_4px_14px_-6px_rgba(15,23,42,0.08)]">
                      <Bell size={14} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No notifications</p>
                    <p className="mt-1 text-xs text-slate-400">You're all caught up</p>
                  </div>
                )}
              </div>
              <div className="bg-slate-50/40 px-4 py-3 text-center">
                <button className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700">View all notifications</button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-100" />

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 shadow-sm">
              {initials}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-[13px] font-semibold text-slate-800 leading-none tracking-tight">{user?.name || 'Quality Inspector'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 capitalize">{(user?.role || 'inspector').replace(/_/g, ' ')}</p>
            </div>
            <ChevronDown size={13} className="text-slate-400 hidden md:block" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 z-50 w-48 overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-12px_rgba(15,23,42,0.18),0_8px_24px_-8px_rgba(15,23,42,0.08)]">
              <div className="bg-white px-4 py-3.5">
                <p className="text-sm font-semibold tracking-tight text-slate-800">{user?.name || 'Quality Inspector'}</p>
                <p className="mt-0.5 truncate text-xs text-slate-400">{user?.email || ''}</p>
              </div>
              <div className="bg-slate-50/35 p-1.5">
                <button className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">Profile Settings</button>
                <button className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" onClick={() => { setProfileOpen(false); logout(); }}>Sign Out</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
