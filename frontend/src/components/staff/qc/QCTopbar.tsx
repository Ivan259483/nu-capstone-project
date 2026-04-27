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
      <div className="relative w-72 hidden md:block">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search jobs, vehicles, customers..."
          className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50/80 rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all shadow-sm shadow-slate-200/40"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 font-mono leading-none">
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
            <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl shadow-slate-200/60 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-800 tracking-tight">Notifications</span>
                <button className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">Mark all read</button>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {notifications.length > 0 ? notifications.map((n) => (
                  <div key={n.id} className={`px-4 py-3.5 flex gap-3 items-start hover:bg-slate-50 cursor-pointer transition-colors ${n.unread ? 'bg-blue-50/40' : ''}`}>
                    <div className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${n.unread ? 'bg-blue-500' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 leading-snug">{n.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{n.time}</p>
                    </div>
                  </div>
                )) : (
                  <div className="px-4 py-10 text-center">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                      <Bell size={14} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No notifications</p>
                    <p className="text-xs text-slate-400 mt-1">You're all caught up</p>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 text-center">
                <button className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">View all notifications</button>
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
            <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl shadow-xl shadow-slate-200/60 z-50 overflow-hidden">
              <div className="px-4 py-3.5 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800 tracking-tight">{user?.name || 'Quality Inspector'}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{user?.email || ''}</p>
              </div>
              <div className="p-1.5">
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
