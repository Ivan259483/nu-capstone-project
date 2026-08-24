import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  Settings,
  LogOut,
  User,
  Volume2,
  VolumeX,
  Wallet,
  Smartphone,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { resolveProfileImage } from '@/lib/profile-image';
import { isSettingsManagerRole } from '@/lib/roles';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';
import {
  isBalancePickupNotification,
  isGcashProofApprovalNotification,
  isSalesBellNotification,
} from '@/lib/booking-approval-notification';
import {
  isNotificationSoundEnabled,
  playBookingApprovalAlert,
  setNotificationSoundEnabled,
} from '@/lib/notification-sound';

type SalesNotif = SystemNotification & {
  _id?: string;
  metadata?: { orderId?: string; bookingReference?: string; kind?: string };
};

function notifId(n: SalesNotif): string {
  return String(n.id || n._id || '');
}

function notificationOrderId(n: SalesNotif): string | undefined {
  const raw = n.metadata?.orderId as string | { _id?: string; id?: string } | undefined;
  if (!raw) return undefined;
  if (typeof raw === 'string') return raw.trim() || undefined;
  if (typeof raw === 'object') {
    const id = String(raw._id || raw.id || '').trim();
    return id || undefined;
  }
  return undefined;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

function formatAccountLabel(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return fallback;

  const isUniformCase = normalized === normalized.toLowerCase() || normalized === normalized.toUpperCase();
  if (!isUniformCase) return normalized;

  return normalized
    .split(' ')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : part)
    .join(' ');
}

function parseSalesNotifDisplay(n: SalesNotif) {
  const msg = String(n.message || '');
  const isBalance = isBalancePickupNotification(n);
  const kind = n.metadata?.kind;

  let customer = '';
  let amount = '';
  let ref = String(n.metadata?.bookingReference || '');

  const balanceMatch = msg.match(/^(.+?)\s*—\s*collect\s*(₱[\d,]+)/i);
  if (balanceMatch) {
    customer = balanceMatch[1].trim();
    amount = balanceMatch[2];
  }

  const resMatch = msg.match(/^(.+?)\s+sent a reservation/i);
  if (!customer && resMatch) customer = resMatch[1].trim();

  const refMatch = msg.match(/Ref\s+(ASPF-[\w-]+)/i);
  if (refMatch) ref = refMatch[1];

  const serviceMatch = msg.match(/for\s+(.+?)\.\s*Ref/i);
  const service = serviceMatch?.[1]?.trim() || '';

  const cta = isBalance ? 'Open POS' : 'Review approval';
  const label = isBalance ? 'Balance / pickup' : kind === 'reservation_fee' ? 'GCash proof' : 'New booking';

  return { customer, amount, ref, service, isBalance, cta, label };
}

function notifVisuals(isBalance: boolean, unread: boolean) {
  if (isBalance) {
    return {
      Icon: Wallet,
      iconWrap: unread
        ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_4px_14px_-2px_rgba(245,158,11,0.55)]'
        : 'bg-amber-100 text-amber-700',
      card: unread
        ? 'bg-white shadow-[0_4px_20px_-6px_rgba(245,158,11,0.35),0_2px_8px_-2px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_28px_-6px_rgba(245,158,11,0.4)]'
        : 'bg-white/70 shadow-sm hover:shadow-md hover:bg-white',
      pill: 'bg-amber-100/90 text-amber-800',
      accent: 'from-amber-400/20 via-transparent to-transparent',
    };
  }
  return {
    Icon: Smartphone,
    iconWrap: unread
      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_4px_14px_-2px_rgba(59,130,246,0.45)]'
      : 'bg-blue-100 text-blue-700',
    card: unread
      ? 'bg-white shadow-[0_4px_20px_-6px_rgba(59,130,246,0.28),0_2px_8px_-2px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_28px_-6px_rgba(59,130,246,0.32)]'
      : 'bg-white/70 shadow-sm hover:shadow-md hover:bg-white',
    pill: 'bg-blue-100/90 text-blue-800',
    accent: 'from-blue-400/15 via-transparent to-transparent',
  };
}

export type SalesTopbarProps = {
  /** Opens Booking Approvals; with orderId, opens GCash proof modal for that reservation */
  onNavigateToApprovals?: (orderId?: string) => void;
  /** Opens POS and optionally preloads an order for balance checkout */
  onNavigateToPos?: (orderId?: string) => void;
  onNavigateToProfile?: () => void;
  onNavigateToSettings?: () => void;
};

export default function SalesTopbar({
  onNavigateToApprovals,
  onNavigateToPos,
  onNavigateToProfile,
  onNavigateToSettings,
}: SalesTopbarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<SalesNotif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isNotificationSoundEnabled());
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await NotificationService.getNotifications();
      if (res?.success && Array.isArray(res.data)) {
        const bookingOnly = (res.data as SalesNotif[]).filter(isSalesBellNotification);
        setNotifications(bookingOnly);
        if (typeof res.unreadCount === 'number') {
          setUnreadCount(
            bookingOnly.filter((n) => !n.isRead).length
          );
        } else {
          setUnreadCount(bookingOnly.filter((n) => !n.isRead).length);
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

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (notifOpen && !notificationMenuRef.current?.contains(target)) setNotifOpen(false);
      if (profileOpen && !profileMenuRef.current?.contains(target)) setProfileOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setNotifOpen(false);
      setProfileOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen, profileOpen]);

  useEffect(() => {
    const socket = getSharedSocket();
    const handleLiveBookingNotif = (payload: SalesNotif & { _id?: string }) => {
      const id = String(payload?.id || payload?._id || '');
      if (!id || !isSalesBellNotification(payload)) return;

      setNotifications((prev) => {
        if (prev.some((n) => notifId(n) === id)) return prev;
        const entry: SalesNotif = {
          ...payload,
          id,
          isRead: false,
          createdAt: payload.createdAt || new Date().toISOString(),
        };
        return [entry, ...prev];
      });
      setUnreadCount((c) => c + 1);
      void playBookingApprovalAlert();
      const isBalance = isBalancePickupNotification(payload);
      toast.info(
        isBalance ? 'Balance due — open POS' : (payload.title || 'New booking approval'),
        {
          description: isBalance
            ? 'Collect remaining payment in the Balance / pickup queue.'
            : payload.message,
          duration: 6000,
        }
      );
    };

    socket.on('notification:booking-manager', handleLiveBookingNotif);
    return () => {
      socket.off('notification:booking-manager', handleLiveBookingNotif);
    };
  }, []);

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotificationSoundEnabled(next);
    if (next) void playBookingApprovalAlert();
    toast.success(next ? 'Notification sounds on' : 'Notification sounds muted');
  };

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
    if (!isSalesBellNotification(n)) return;

    if (isBalancePickupNotification(n)) {
      onNavigateToPos?.(notificationOrderId(n));
    } else if (isGcashProofApprovalNotification(n)) {
      const orderId = notificationOrderId(n);
      if (orderId) onNavigateToApprovals?.(orderId);
      else onNavigateToApprovals?.();
    } else {
      onNavigateToApprovals?.();
    }
    setNotifOpen(false);
    setProfileOpen(false);
  };

  const displayName = formatAccountLabel(user?.name || user?.displayName, 'Sales Staff');
  const roleLabel = formatAccountLabel((user?.role || 'sales').replace(/_/g, ' '), 'Sales');
  const profileImage = resolveProfileImage(user);
  const initials = displayName
    ? displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'SA';
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <header
      className="h-16 bg-white flex items-center px-3 sm:px-6 gap-2 sm:gap-4 shrink-0 z-20"
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
        <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:inline-flex">
          ⌘K
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="mr-3 hidden text-xs font-medium tabular-nums text-slate-500 lg:block">{today}</span>

        <div ref={notificationMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((open) => !open);
              setProfileOpen(false);
            }}
            className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600/50 ${notifOpen ? 'bg-slate-100 text-slate-950' : 'bg-transparent'}`}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
            aria-controls={notifOpen ? 'sales-notification-panel' : undefined}
          >
            <Bell size={19} strokeWidth={1.9} aria-hidden />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none tabular-nums text-white ring-2 ring-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              id="sales-notification-panel"
              role="dialog"
              aria-label="Sales notifications"
              className="fixed inset-x-3 top-[4.5rem] z-50 flex max-h-[min(440px,72vh)] w-auto flex-col overflow-hidden rounded-[1.25rem] bg-gradient-to-b from-slate-100/95 via-slate-50/98 to-white shadow-[0_24px_60px_-16px_rgba(15,23,42,0.22),0_12px_32px_-12px_rgba(15,23,42,0.1)] ring-1 ring-white/80 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[22rem]"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-blue-500/[0.07] via-transparent to-transparent" />
              <div className="relative flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-4">
                <div>
                  <p className="text-sm font-bold tracking-tight text-slate-900">Notifications</p>
                  {unreadCount > 0 && (
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {unreadCount} need{unreadCount === 1 ? 's' : ''} action
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={handleToggleSound}
                    className="rounded-xl p-2 text-slate-500 transition-all hover:bg-white hover:text-slate-800 hover:shadow-sm"
                    aria-label={soundOn ? 'Mute notification sounds' : 'Enable notification sounds'}
                    title={soundOn ? 'Sounds on' : 'Sounds off'}
                  >
                    {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  </button>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      disabled={markingAll || unreadCount === 0}
                      onClick={() => void handleMarkAllRead()}
                      className="rounded-xl bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm transition-all hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {markingAll ? '…' : 'Clear'}
                    </button>
                  )}
                </div>
              </div>
              <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-0 scrollbar-thin">
                {notifLoading && notifications.length === 0 ? (
                  <div className="rounded-2xl bg-white/80 px-4 py-12 text-center text-sm text-slate-500 shadow-sm">
                    Loading…
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="rounded-2xl bg-white px-5 py-12 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/80 shadow-inner">
                      <Bell size={22} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">All caught up</p>
                    <p className="mx-auto mt-2 max-w-[14rem] text-xs leading-relaxed text-slate-500">
                      Reservations and balance pickups will show up here in real time.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {notifications.map((n) => {
                      const id = notifId(n);
                      const unread = !n.isRead;
                      const display = parseSalesNotifDisplay(n);
                      const visuals = notifVisuals(display.isBalance, unread);
                      const Icon = visuals.Icon;
                      const initials = (display.customer || '?')
                        .split(' ')
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();

                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => void handleNotificationClick(n)}
                            className={`group relative w-full overflow-hidden rounded-2xl p-3.5 text-left transition-all duration-300 ease-out ${visuals.card}`}
                          >
                            <div
                              className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${visuals.accent} opacity-100`}
                              aria-hidden
                            />
                            <div className="relative flex gap-3">
                              <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${visuals.iconWrap}`}
                              >
                                <Icon size={20} strokeWidth={2.2} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${visuals.pill}`}
                                  >
                                    {display.label}
                                  </span>
                                  {unread && (
                                    <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white">
                                      New
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 text-[15px] font-bold leading-tight tracking-tight text-slate-900">
                                  {display.customer || n.title}
                                </p>
                                {display.service && (
                                  <p className="mt-0.5 text-xs font-medium text-slate-600">{display.service}</p>
                                )}
                                {display.amount && (
                                  <p className="mt-2 text-lg font-black tabular-nums tracking-tight text-slate-900">
                                    {display.amount}
                                    <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                      balance due
                                    </span>
                                  </p>
                                )}
                                {display.ref && (
                                  <p className="mt-2 inline-flex rounded-md bg-slate-100/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                                    {display.ref}
                                  </p>
                                )}
                                <div className="mt-3 flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-medium text-slate-400">
                                    {relativeTime(n.createdAt)}
                                  </span>
                                  <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 opacity-0 transition-opacity group-hover:opacity-100">
                                    {display.cta}
                                    <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                                  </span>
                                </div>
                              </div>
                              {!display.amount && (
                                <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 sm:flex">
                                  {initials}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={profileMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((open) => !open);
              setNotifOpen(false);
            }}
            className={`flex min-h-10 items-center gap-2 rounded-xl px-1.5 py-1 text-left transition-colors duration-150 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600/50 ${profileOpen ? 'bg-slate-100' : 'bg-transparent'}`}
            aria-label={`${profileOpen ? 'Close' : 'Open'} user menu for ${displayName}`}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-controls={profileOpen ? 'sales-profile-menu' : undefined}
          >
            {profileImage ? (
              <img
                src={profileImage}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold tracking-wide text-blue-700 ring-1 ring-inset ring-blue-100" aria-hidden>
                {initials}
              </div>
            )}
            <div className="hidden min-w-0 max-w-36 text-left md:block">
              <p className="truncate text-[13px] font-semibold leading-[1.15] text-slate-950">{displayName}</p>
              <p className="mt-0.5 truncate text-[11px] font-medium leading-[1.15] text-slate-500">{roleLabel}</p>
            </div>
            <ChevronDown
              size={15}
              className={`ml-0.5 hidden shrink-0 text-slate-400 transition-transform duration-200 md:block ${profileOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>

          {profileOpen && (
            <div
              id="sales-profile-menu"
              role="menu"
              aria-label="User account"
              className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl bg-white p-1.5 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/80 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-2.5 pb-3 pt-2">
                <p className="truncate text-sm font-semibold text-slate-950">{displayName}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email || roleLabel}</p>
              </div>
              <div className="border-t border-slate-100 pt-1.5">
                {onNavigateToProfile && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      onNavigateToProfile();
                    }}
                    className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600/40"
                  >
                    <User size={16} aria-hidden />
                    <span>My Profile</span>
                  </button>
                )}
                {onNavigateToSettings && isSettingsManagerRole(user?.role) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      onNavigateToSettings();
                    }}
                    className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600/40"
                  >
                    <Settings size={16} aria-hidden />
                    <span>Settings</span>
                  </button>
                )}
                {(onNavigateToProfile || (onNavigateToSettings && isSettingsManagerRole(user?.role))) && (
                  <hr className="my-1.5 border-slate-100" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    void logout();
                  }}
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600/40"
                >
                  <LogOut size={16} aria-hidden />
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
