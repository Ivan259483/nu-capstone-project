import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { QCJob } from '@/hooks/useQCData';
import { filterQCJobsBySearch, formatQCJobSearchResult } from '@/lib/qc-job-search';
import type { SystemNotification } from '@/lib/notification-service';
import AdminNotificationBell from '@/components/Administrator/notifications/AdminNotificationBell';

interface Props {
  sidebarCollapsed: boolean;
  jobs: QCJob[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelectJob: (jobId: string) => void;
  notifications: SystemNotification[];
  unreadNotificationsCount: number;
  notificationsLoading: boolean;
  notificationsError: string | null;
  onRefreshNotifications: () => Promise<unknown> | unknown;
  onSetNotificationRead: (id: string, isRead: boolean) => Promise<unknown> | unknown;
  onMarkAllNotificationsRead: () => Promise<unknown> | unknown;
  onOpenNotification: (notification: SystemNotification) => Promise<unknown> | unknown;
  onViewAllNotifications: () => void;
}

export default function QCTopbar({
  sidebarCollapsed,
  jobs,
  searchQuery,
  onSearchQueryChange,
  onSelectJob,
  notifications,
  unreadNotificationsCount,
  notificationsLoading,
  notificationsError,
  onRefreshNotifications,
  onSetNotificationRead,
  onMarkAllNotificationsRead,
  onOpenNotification,
  onViewAllNotifications,
}: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const initials = user?.name
    ? user.name.split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()
    : 'QC';
  const roleLabel = user?.role === 'staff_quality_checker'
    ? 'Quality Checker'
    : (user?.role || 'Quality Checker').replace(/_/g, ' ');

  const commandResults = useMemo(
    () => filterQCJobsBySearch(jobs, searchQuery).slice(0, 8),
    [jobs, searchQuery],
  );

  const showCommandPanel = commandOpen && (searchQuery.trim().length > 0 || commandResults.length > 0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(true);
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === 'Escape') {
        setCommandOpen(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (commandListRef.current?.contains(target) || searchInputRef.current?.contains(target)) {
        return;
      }
      setCommandOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [commandOpen]);

  const pickJob = (jobId: string) => {
    onSelectJob(jobId);
    onSearchQueryChange('');
    setCommandOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <header
      data-sidebar-collapsed={sidebarCollapsed}
      className="qc-dash-topbar z-20 flex h-[72px] flex-shrink-0 items-center justify-between gap-3 bg-white/95 px-3 backdrop-blur-xl sm:px-5 lg:px-6"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="group relative w-full max-w-[540px]">
          <Search
            size={16}
            strokeWidth={2.25}
            className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
              setCommandOpen(true);
            }}
            onFocus={() => setCommandOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && commandResults[0]) {
                e.preventDefault();
                pickJob(commandResults[0].id);
              }
            }}
            placeholder="Search jobs, vehicles, customers..."
            aria-label="Search jobs, vehicles, and customers"
            aria-expanded={showCommandPanel}
            aria-controls="qc-topbar-command-list"
            autoComplete="off"
            className="qc-command-search h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-20 text-sm font-medium text-slate-800 shadow-[0_8px_24px_-22px_rgba(15,23,42,0.45)] outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] font-black leading-none text-slate-500 sm:inline">
            {typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K'}
          </kbd>

          {showCommandPanel ? (
            <div
              id="qc-topbar-command-list"
              ref={commandListRef}
              className="qc-drop-panel absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-80 overflow-y-auto p-1.5"
              role="listbox"
            >
              {commandResults.length > 0 ? (
                commandResults.map((job) => {
                  const { title, subtitle } = formatQCJobSearchResult(job);
                  return (
                    <button
                      key={job.id}
                      type="button"
                      role="option"
                      className="flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50"
                      onClick={() => pickJob(job.id)}
                    >
                      <span className="text-sm font-bold text-slate-900">{title}</span>
                      <span className="mt-0.5 truncate text-xs font-medium text-slate-500">{subtitle}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-4 text-center text-sm font-medium text-slate-500">
                  No jobs match &ldquo;{searchQuery.trim()}&rdquo;
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <AdminNotificationBell
          notifications={notifications}
          unreadCount={unreadNotificationsCount}
          loading={notificationsLoading}
          error={notificationsError}
          onRetry={onRefreshNotifications}
          onRefresh={onRefreshNotifications}
          onSetRead={onSetNotificationRead}
          onMarkAllRead={onMarkAllNotificationsRead}
          onOpenNotification={onOpenNotification}
          onViewAll={onViewAllNotifications}
          onOpenChange={(open) => { if (open) setProfileOpen(false); }}
          contentClassName="qc-notification-flyout"
          className="qc-notification-bell"
        />

        <div className="h-6 w-px bg-gradient-to-b from-transparent via-slate-200/50 to-transparent" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
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
                <p className="mt-0.5 text-xs capitalize text-slate-500">{roleLabel}</p>
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
