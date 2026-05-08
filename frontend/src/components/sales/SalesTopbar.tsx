import React, { useCallback, useEffect, useState } from 'react';
import { Search, Bell, ChevronDown, Settings, LogOut, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';

type SalesNotif = SystemNotification & {
  _id?: string;
  metadata?: { orderId?: string; bookingReference?: string; kind?: string };
};

function notifId(n: SalesNotif): string {
  return String(n.id || n._id || '');
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

export type SalesTopbarProps = {
  /** Opens Booking Approvals when user taps a booking notification */
  onNavigateToApprovals?: () => void;
};

export default function SalesTopbar({ onNavigateToApprovals }: SalesTopbarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<SalesNotif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const { user, logout } = useAuth();

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await NotificationService.getNotifications();
      if (res?.success && Array.isArray(res.data)) {
        setNotifications(res.data as SalesNotif[]);
        if (typeof res.unreadCount === 'number') {
          setUnreadCount(res.unreadCount);
        } else {
          setUnreadCount((res.data as SalesNotif[]).filter((n) => !n.isRead).length);
        }
      }
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const t = window.setInterval(() => {
      void fetchNotifications();
    }, 50_000);
    return () => window.clearInterval(t);
  }, [fetchNotifications]);

  useEffect(() => {
    if (notifOpen) void fetchNotifications();
  }, [notifOpen, fetchNotifications]);

  const handleMarkAllRead = async () => {
    if (notifications.length === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await NotificationService.markAllAsRead();
      await fetchNotifications();
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (n: SalesNotif) => {
    const id = notifId(n);
    if (!id) return;
    if (!n.isRead) {
      await NotificationService.markAsRead(id);
      await fetchNotifications();
    }
    const isBooking =
      n.type === 'booking' ||
      Boolean(n.metadata?.orderId) ||
      n.metadata?.kind === 'reservation_fee';
    if (isBooking && onNavigateToApprovals) {
      onNavigateToApprovals();
      setNotifOpen(false);
      setProfileOpen(false);
    }
  };

  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'SA';
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <header
      className="h-16 bg-white flex items-center px-6 gap-4 shrink-0 z-20"
      style={{
        borderBottom: '1px solid rgba(226,232,240,0.5)',
        boxShadow: '0 2px 12px -4px rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex-1 max-w-md relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search customers, transactions, plates…"
          className="w-full pl-9 pr-14 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-150"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
          ⌘K
        </span>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <span className="text-xs text-slate-500 font-medium hidden lg:block">{today}</span>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen(!notifOpen);
              setProfileOpen(false);
            }}
            className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors duration-150"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Bell size={18} className="text-slate-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-12 w-80 max-h-[min(420px,70vh)] flex flex-col bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
                <span className="text-sm font-semibold text-slate-900">Notifications</span>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    disabled={markingAll || unreadCount === 0}
                    onClick={() => void handleMarkAllRead()}
                    className="text-xs text-blue-700 font-medium hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                  >
                    {markingAll ? 'Updating…' : 'Mark all read'}
                  </button>
                )}
              </div>
              <div className="overflow-y-auto flex-1 min-h-0">
                {notifLoading && notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">Loading…</div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Bell size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-medium text-slate-600">No notifications yet</p>
                    <p className="text-xs text-slate-400 mt-1">New reservation submissions will appear here.</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const id = notifId(n);
                    const unread = !n.isRead;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void handleNotificationClick(n)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors duration-100 border-b border-slate-50 last:border-b-0 ${unread ? 'bg-blue-50/50' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {unread ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" aria-hidden />
                          ) : (
                            <span className="w-1.5 h-1.5 mt-1.5 shrink-0" aria-hidden />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 leading-snug">{n.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-3">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{relativeTime(n.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen(!profileOpen);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors duration-150"
          >
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="text-left hidden md:block">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{user?.name || 'Sales Staff'}</p>
              <p className="text-[10px] text-slate-500 leading-tight capitalize">{(user?.role || 'sales').replace(/_/g, ' ')}</p>
            </div>
            <ChevronDown size={14} className="text-slate-400 hidden md:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-12 w-52 bg-white rounded-xl border border-slate-200 shadow-xl z-50">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900">{user?.name || 'Sales Staff'}</p>
                <p className="text-xs text-slate-500">{user?.email || ''}</p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-150 cursor-pointer"
                >
                  <User size={15} />
                  <span>My Profile</span>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-150 cursor-pointer"
                >
                  <Settings size={15} />
                  <span>Settings</span>
                </button>
                <hr className="my-1 border-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-150 cursor-pointer"
                >
                  <LogOut size={15} className="text-red-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
