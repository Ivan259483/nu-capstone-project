import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarPlus,
  Check,
  ClipboardList,
  Clock3,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  Settings,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';
import { OrderService } from '@/lib/order-service';
import { UserService } from '@/lib/user-service';
import type { Booking, User } from '@/types';

const BRAND_ORANGE = '#E8650A';
const LUXURY_EASE = [0.22, 1, 0.36, 1] as const;
const LIVE_STATUS_CUSTOMER_STATES = new Set(['washing', 'detailing', 'finishing', 'ready', 'in-progress']);
const LIVE_STATUS_BOOKING_STATES = new Set(['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'in-progress', 'completed', 'paid']);

/** Keep in sync with CustomerDashboard.tsx — when false, scan / AI Inspection entry is disabled (Soon). */
const AI_INSPECTION_HISTORY_ENABLED = false;

type TrackerStepId = 'awaiting_vehicle' | 'confirmed' | 'received' | 'in_progress' | 'completed' | 'paid';

type TrackerStep = {
  id: TrackerStepId;
  title: string;
};

type ResolvedTrackerStep = TrackerStep & {
  state: 'completed' | 'active' | 'pending';
  timestamp?: string;
  helperText?: string;
};

const TRACKER_STEPS: TrackerStep[] = [
  { id: 'awaiting_vehicle', title: 'Waiting for Your Vehicle to Arrive' },
  { id: 'confirmed', title: 'Vehicle Check-In' },
  { id: 'received', title: 'Vehicle Received' },
  { id: 'in_progress', title: 'Service In Progress' },
  { id: 'completed', title: 'Quality Check' },
  { id: 'paid', title: 'Ready for Pickup' },
];

const STATUS_PRIORITY: Record<string, number> = {
  paid: 6,
  completed: 5,
  in_progress: 4,
  'in-progress': 4,
  received: 3,
  confirmed: 2,
  assigned: 2,
  approved: 1,
};

const navButtonClass = (active = false) =>
  `w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
  }`;

const pageStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const revealUp = {
  hidden: { opacity: 0, y: 28, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: LUXURY_EASE,
    },
  },
};

function isBookingMine(booking: Booking, user: User) {
  const bookingCustomerId =
    booking.customerId
    || (typeof booking.customer === 'object' ? booking.customer?._id || booking.customer?.id : booking.customer)
    || '';

  return (
    bookingCustomerId === user.id
    || bookingCustomerId === user._id
    || booking.customerName === user.name
  );
}

function isLiveTrackableBooking(booking: Booking) {
  const status = String(booking.status || '').toLowerCase();
  const customerStatus = String(booking.customerStatus || '').toLowerCase();

  return LIVE_STATUS_BOOKING_STATES.has(status) || LIVE_STATUS_CUSTOMER_STATES.has(customerStatus);
}

function sortByLivePriority(a: Booking, b: Booking) {
  const statusA = String(a.status || '').toLowerCase();
  const statusB = String(b.status || '').toLowerCase();
  const priorityA = STATUS_PRIORITY[statusA] ?? 0;
  const priorityB = STATUS_PRIORITY[statusB] ?? 0;

  if (priorityA !== priorityB) return priorityB - priorityA;

  return (
    new Date(b.updatedAt || b.createdAt || 0).getTime()
    - new Date(a.updatedAt || a.createdAt || 0).getTime()
  );
}

function selectActiveBooking(bookings: Booking[], user: User) {
  return bookings
    .filter((booking) => isBookingMine(booking, user) && isLiveTrackableBooking(booking))
    .sort(sortByLivePriority)[0] || null;
}

function titleCase(value?: string | null) {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getInitials(name?: string | null) {
  if (!name) return 'SP';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'SP';
}

function parseDateCandidate(value?: string | null, baseDate?: string | null) {
  if (!value) return null;

  const directDate = new Date(value);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  if (baseDate) {
    const combinedDate = new Date(`${baseDate} ${value}`);
    if (!Number.isNaN(combinedDate.getTime())) return combinedDate;
  }

  return null;
}

function formatTimeValue(value?: string | null, baseDate?: string | null) {
  if (!value) return '—';
  const parsed = parseDateCandidate(value, baseDate);
  if (!parsed) return value;
  return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatStepTimestamp(value?: string | null, baseDate?: string | null) {
  if (!value) return 'Timestamp pending';
  const parsed = parseDateCandidate(value, baseDate);
  if (!parsed) return value;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEtaLabel(value?: string | null, baseDate?: string | null) {
  if (!value) return 'ETA pending';

  const parsed = parseDateCandidate(value, baseDate);
  if (!parsed) return `ETA ${value}`;

  const difference = parsed.getTime() - Date.now();
  if (difference <= 0) return 'Finishing soon';

  const totalMinutes = Math.max(1, Math.round(difference / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `~${hours}h ${minutes}m remaining`;
  return `~${minutes}m remaining`;
}

function getServiceNames(booking: Booking | null) {
  if (!booking) return [];

  const services = new Set<string>();

  if (booking.serviceName) services.add(booking.serviceName);
  if (booking.serviceType && booking.serviceType !== booking.serviceName) {
    services.add(titleCase(booking.serviceType));
  }

  const rawItems = Array.isArray(booking.items)
    ? booking.items
    : typeof booking.items === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(booking.items as unknown as string);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
      : [];

  rawItems.forEach((item: any) => {
    const product = item?.product;
    const productName =
      typeof product === 'string'
        ? product
        : product?.name || item?.name || item?.productName;

    if (productName) services.add(String(productName));
  });

  if (Array.isArray(booking.addons)) {
    booking.addons.forEach((addon) => services.add(titleCase(addon)));
  }

  return Array.from(services).filter(Boolean);
}

function getLatestStaffNote(booking: Booking | null) {
  if (!booking) return '';

  const sortedNotes = [...(booking.staffNotes || [])].sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );

  return sortedNotes[0]?.content || booking.notes || '';
}

function getCurrentStepIndex(booking: Booking | null) {
  if (!booking) return 0;

  const trackingStage = (booking as any)?.serviceTrackingStage;
  if (trackingStage && typeof trackingStage === 'string') {
    const stageMap: Record<string, number> = {
      confirmed: 1,
      received: 2,
      in_progress: 3,
      quality_check: 4,
      ready_pickup: 5,
      completed: 5,
    };
    if (stageMap[trackingStage] !== undefined) return stageMap[trackingStage];
  }

  const status = String(booking.status || '').toLowerCase();
  const customerStatus = String(booking.customerStatus || '').toLowerCase();

  if (status === 'paid' || customerStatus === 'ready') return 5;
  if (status === 'completed' || customerStatus === 'finishing') return 4;
  if (status === 'in_progress' || status === 'in-progress' || customerStatus === 'washing' || customerStatus === 'detailing' || customerStatus === 'in-progress') return 3;
  if (status === 'received') return 2;
  if (status === 'confirmed' || status === 'assigned') return 1;
  // approved — waiting for vehicle
  return 0;
}

function getStepTimestamps(booking: Booking | null) {
  if (!booking) {
    return {
      awaiting_vehicle: '',
      confirmed: '',
      received: '',
      in_progress: '',
      completed: '',
      paid: '',
    };
  }

  const bookingBaseDate = booking.bookingDate || booking.date;
  const ingressTime = booking.jobOrder?.ingressDateTime || booking.updatedAt || booking.createdAt;
  const workStartedAt = booking.customerStatusUpdatedAt || booking.updatedAt || ingressTime;
  const qcAt = booking.qcCompletedAt || booking.updatedAt || workStartedAt;
  const readyAt = booking.paidAt || booking.updatedAt || qcAt;

  return {
    awaiting_vehicle: (booking as any).approvedAt || booking.createdAt || bookingBaseDate,
    confirmed: (booking as any).approvedAt || booking.createdAt || bookingBaseDate,
    received: ingressTime,
    in_progress: workStartedAt,
    completed: qcAt,
    paid: readyAt,
  };
}

function getResolvedSteps(booking: Booking | null, estimatedCompletion?: string | null) {
  const currentIndex = getCurrentStepIndex(booking);
  const timestamps = getStepTimestamps(booking);
  const bookingBaseDate = booking?.bookingDate || booking?.date;

  return TRACKER_STEPS.map((step, index) => {
    if (index < currentIndex) {
      return {
        ...step,
        state: 'completed' as const,
        timestamp: formatStepTimestamp(timestamps[step.id as keyof typeof timestamps], bookingBaseDate),
      };
    }

    if (index === currentIndex) {
      let helperText: string;
      if (step.id === 'awaiting_vehicle') {
        helperText = `Please arrive by ${booking?.bookingTime || 'your scheduled time'} on ${booking?.bookingDate || 'your appointment date'}`;
      } else if (step.id === 'in_progress' || step.id === 'completed' || step.id === 'paid') {
        helperText = formatEtaLabel(estimatedCompletion, bookingBaseDate);
      } else {
        helperText = 'Live updates are enabled';
      }

      return {
        ...step,
        state: 'active' as const,
        timestamp: formatStepTimestamp(timestamps[step.id as keyof typeof timestamps], bookingBaseDate),
        helperText,
      };
    }

    return {
      ...step,
      state: 'pending' as const,
    };
  });
}

function getVehicleLabel(booking: Booking | null) {
  if (!booking) return 'Vehicle on file';
  return [booking.vehicleYear, booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ') || booking.vehicleInfo || 'Vehicle on file';
}

function getVehicleColorAccent(color?: string | null) {
  const normalizedColor = String(color || '').trim().toLowerCase();

  const accentMap: Record<string, string> = {
    white: '#e2e8f0',
    black: '#0f172a',
    silver: '#94a3b8',
    gray: '#64748b',
    grey: '#64748b',
    blue: '#2563eb',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#f59e0b',
    orange: '#ea580c',
    brown: '#8b5e3c',
    beige: '#d6d3d1',
  };

  return accentMap[normalizedColor] || '#cbd5e1';
}

function getBayAssignment(booking: Booking | null) {
  if (!booking) return 'Bay pending';
  return (booking as any).bayNumber || (booking as any).bayAssignment || 'Bay pending';
}

export default function CustomerLiveTrackerPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [detailer, setDetailer] = useState<User | null>(null);
  const activeBookingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      setNotificationsLoading(true);
      const response = await NotificationService.getNotifications();
      if (response.success) {
        setNotifications(Array.isArray(response.data) ? response.data : []);
      }
      setNotificationsLoading(false);
    };

    fetchNotifications();
  }, []);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const applyBooking = (nextBooking: Booking | null) => {
      if (!isMounted) return;
      activeBookingIdRef.current = nextBooking?.id || null;
      setActiveBooking(nextBooking);
      setIsLoading(false);
    };

    const fetchActiveBooking = async () => {
      try {
        const response = await OrderService.getAllOrders({ suppressErrorToast: true });
        const nextBooking = response.success && Array.isArray(response.data)
          ? selectActiveBooking(response.data, user)
          : null;
        applyBooking(nextBooking);
      } catch (error) {
        console.warn('[CustomerLiveTracker] Failed to fetch live booking:', error);
        applyBooking(null);
      }
    };

    fetchActiveBooking();
    // Reduced to 10s for demo reliability (was 30s)
    const refreshInterval = window.setInterval(fetchActiveBooking, 10_000);

    let socketBumpTimer: ReturnType<typeof setTimeout> | null = null;
    const bumpFromSocket = () => {
      if (socketBumpTimer) clearTimeout(socketBumpTimer);
      socketBumpTimer = setTimeout(() => {
        socketBumpTimer = null;
        fetchActiveBooking();
      }, 350);
    };

    // Shared socket: same events as dashboard — silent HTTP refetch (no reload)
    const socket = getSharedSocket();
    const handleDbChange = (payload: any) => {
      if (payload.collection === 'orders') {
        console.log('[LiveTracker] db_change orders → refetch');
        bumpFromSocket();
      }
    };
    socket.on('db_change', handleDbChange);
    socket.on('booking:status', bumpFromSocket);
    socket.on('orderUpdated', bumpFromSocket);

    // Visibility / focus refresh
    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (visTimer) clearTimeout(visTimer);
        visTimer = setTimeout(fetchActiveBooking, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    const unsubscribe = OrderService.subscribeToCustomerBookings(user.id, (bookings) => {
      const nextBooking = selectActiveBooking(bookings, user);

      if (nextBooking) {
        applyBooking(nextBooking);
        return;
      }

      if (activeBookingIdRef.current && bookings.some((booking) => booking.id === activeBookingIdRef.current)) {
        applyBooking(null);
      }
    });

    return () => {
      isMounted = false;
      window.clearInterval(refreshInterval);
      if (socketBumpTimer) clearTimeout(socketBumpTimer);
      socket.off('db_change', handleDbChange);
      socket.off('booking:status', bumpFromSocket);
      socket.off('orderUpdated', bumpFromSocket);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (visTimer) clearTimeout(visTimer);
      unsubscribe?.();
    };
  }, [user]);

  useEffect(() => {
    const resolveDetailer = async () => {
      if (!activeBooking?.assignedDetailer) {
        setDetailer(null);
        return;
      }

      if (typeof activeBooking.assignedDetailer === 'object') {
        setDetailer(activeBooking.assignedDetailer as User);
        return;
      }

      try {
        const response = await UserService.getUserById(activeBooking.assignedDetailer);
        if (response.success && response.data) {
          setDetailer(response.data as User);
          return;
        }
      } catch (error) {
        console.warn('[CustomerLiveTracker] Failed to load detailer details:', error);
      }

      setDetailer(null);
    };

    resolveDetailer();
  }, [activeBooking?.assignedDetailer]);

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 21) return 'Good evening';
    return 'Good night';
  }, []);

  const estimatedCompletion = activeBooking?.estimatedCompletion || activeBooking?.jobOrder?.targetReleaseDate || '';
  const startTime = activeBooking?.jobOrder?.ingressDateTime
    || (activeBooking?.bookingDate && activeBooking?.bookingTime ? `${activeBooking.bookingDate} ${activeBooking.bookingTime}` : '')
    || activeBooking?.createdAt
    || '';
  const serviceNames = useMemo(() => getServiceNames(activeBooking), [activeBooking]);
  const latestStaffNote = useMemo(() => getLatestStaffNote(activeBooking), [activeBooking]);
  const resolvedSteps = useMemo(
    () => getResolvedSteps(activeBooking, estimatedCompletion),
    [activeBooking, estimatedCompletion]
  );
  const vehicleColorAccent = getVehicleColorAccent(activeBooking?.vehicleColor);
  const lastUpdatedLabel = activeBooking
    ? formatStepTimestamp(activeBooking.updatedAt || activeBooking.createdAt, activeBooking.bookingDate || activeBooking.date)
    : 'Awaiting next booking';
  const displayServices = serviceNames.length > 0
    ? serviceNames
    : [activeBooking?.serviceName || activeBooking?.serviceType || 'Service'];
  const detailerName = detailer?.name || detailer?.displayName || 'Assigned Specialist';
  const detailerRole = titleCase(detailer?.role || 'detailer') || 'Detailer';
  const vehicleLabel = getVehicleLabel(activeBooking);
  const bayAssignment = getBayAssignment(activeBooking);
  const currentStageTitle = resolvedSteps.find((step) => step.state === 'active')?.title || TRACKER_STEPS[0].title;
  const trackerProgress = activeBooking ? ((getCurrentStepIndex(activeBooking) + 1) / TRACKER_STEPS.length) * 100 : 0;
  const isAwaitingVehicle = activeBooking && ['approved', 'confirmed', 'assigned'].includes(String(activeBooking.status || '').toLowerCase());
  const liveStatusMeta = isLoading
    ? {
      label: 'Syncing',
      description: 'Checking your latest service data',
      dotColor: '#4f46e5',
      background: '#eef2ff',
      border: '#c7d2fe',
      text: '#4338ca',
    }
    : isAwaitingVehicle
      ? {
        label: 'Booking Approved',
        description: `Please bring your vehicle on ${activeBooking?.bookingDate || 'your appointment date'} at ${activeBooking?.bookingTime || 'your scheduled time'}`,
        dotColor: '#16a34a',
        background: '#f0fdf4',
        border: '#86efac',
        text: '#15803d',
      }
    : activeBooking
      ? {
        label: 'In Progress',
        description: estimatedCompletion
          ? `Estimated completion at ${formatTimeValue(estimatedCompletion, activeBooking.bookingDate || activeBooking.date)}`
          : 'Live progress is being monitored now',
        dotColor: BRAND_ORANGE,
        background: '#fff7ed',
        border: '#fdba74',
        text: BRAND_ORANGE,
      }
      : {
        label: 'Standby',
        description: 'No active vehicle inside the bay',
        dotColor: '#64748b',
        background: '#f8fafc',
        border: '#cbd5e1',
        text: '#475569',
      };
  const trackerHighlights = [
    {
      icon: Navigation,
      label: 'Live bay visibility',
      value: activeBooking ? bayAssignment : 'Ready when you are',
    },
    {
      icon: ClipboardList,
      label: 'Quality checkpoints',
      value: activeBooking ? '5-stage customer tracker' : 'Check-in to pickup view',
    },
    {
      icon: Clock3,
      label: 'Service timing',
      value: activeBooking ? `Updated ${lastUpdatedLabel}` : 'Updates begin once checked in',
    },
  ];

  const markNotificationAsRead = async (id: string) => {
    await NotificationService.markAsRead(id);
    setNotifications((current) => current.map((notification) => (
      notification.id === id ? { ...notification, isRead: true } : notification
    )));
  };

  const markAllNotificationsAsRead = async () => {
    await NotificationService.markAllAsRead();
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
  };

  return (
    <>
      <div className="h-screen flex overflow-hidden text-sm bg-white" style={{ '--border': '214 32% 91%', color: '#0f172a' } as React.CSSProperties}>
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/20 z-20 md:hidden transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          className={`w-64 bg-white border-r border-slate-200 flex flex-col z-30 fixed inset-y-0 left-0 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full hidden md:flex'
            }`}
        >
          <div className="h-16 flex items-center px-6 border-b border-slate-100 shrink-0">
            <span className="font-semibold text-base tracking-tight text-slate-900">AutoSPF+</span>
          </div>

          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
            <button onClick={() => navigate('/customer/dashboard')} className={navButtonClass()}>
              <iconify-icon icon="solar:widget-linear" width="20"></iconify-icon>
              Dashboard
            </button>
            <button
              type="button"
              disabled={!AI_INSPECTION_HISTORY_ENABLED}
              onClick={() => navigate('/customer/dashboard?section=scan')}
              title={AI_INSPECTION_HISTORY_ENABLED ? undefined : 'Coming soon'}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${AI_INSPECTION_HISTORY_ENABLED
                ? navButtonClass()
                : 'text-slate-400 cursor-not-allowed opacity-80 hover:bg-transparent hover:text-slate-400'
                } disabled:pointer-events-none`}
            >
              <iconify-icon icon="solar:scanner-linear" width="20" className="shrink-0"></iconify-icon>
              <span className="flex-1 min-w-0 text-left leading-snug">AI Inspection History</span>
              <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${AI_INSPECTION_HISTORY_ENABLED ? 'uppercase tracking-wider bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                {AI_INSPECTION_HISTORY_ENABLED ? 'AI Lab' : 'Soon'}
              </span>
            </button>
            <button onClick={() => navigate('/customer/dashboard')} className={navButtonClass()}>
              <iconify-icon icon="solar:calendar-linear" width="20"></iconify-icon>
              My Bookings
            </button>
            <button onClick={() => navigate('/customer/live-tracker')} className={navButtonClass(true)}>
              <iconify-icon icon="solar:routing-2-linear" width="20"></iconify-icon>
              Live Tracker
            </button>

            <button onClick={() => navigate('/customer/dashboard')} className={navButtonClass()}>
              <iconify-icon icon="solar:document-text-linear" width="20"></iconify-icon>
              Documents
            </button>
            <button onClick={() => navigate('/customer/dashboard')} className={navButtonClass()}>
              <iconify-icon icon="solar:star-linear" width="20"></iconify-icon>
              Rewards
            </button>
          </nav>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 z-10">
            <div className="flex items-center gap-4">
              <button
                className="md:hidden text-slate-500 hover:text-slate-900"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu size={24} />
              </button>
              <h1 className="text-xl font-medium tracking-tight text-slate-900 hidden sm:block">
                {greeting}, {(user?.name || 'Customer').split(' ')[0]}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/customer/book')}
                className="hidden sm:flex items-center justify-center px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-md font-medium transition-colors shadow-sm"
              >
                Book Service
              </button>
              {AI_INSPECTION_HISTORY_ENABLED ? (
                <button
                  type="button"
                  onClick={() => navigate('/customer/dashboard?section=scan')}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors shadow-sm"
                >
                  <iconify-icon icon="solar:scanner-linear" width="18"></iconify-icon>
                  AI Inspection History
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md font-medium bg-slate-200 text-slate-500 cursor-not-allowed shadow-sm"
                >
                  <iconify-icon icon="solar:scanner-linear" width="18" className="opacity-70"></iconify-icon>
                  <span className="hidden sm:inline text-sm">AI Inspection History</span>
                  <span className="sm:hidden text-sm">Inspection</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-300 text-slate-600">Soon</span>
                </button>
              )}

              <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((current) => !current)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35"
                  aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                >
                  <span
                    className={`flex size-[22px] items-center justify-center ${unreadCount > 0 ? 'origin-top [transform:translateZ(0)] animate-[ring_2s_ease-in-out_infinite]' : ''}`}
                  >
                    <Bell size={22} strokeWidth={2} className="shrink-0 text-current" aria-hidden />
                  </span>
                  {unreadCount > 0 && (
                    <span
                      className={`absolute -right-0.5 -top-0.5 z-10 flex items-center justify-center rounded-full border-2 border-white bg-red-500 font-extrabold tabular-nums leading-none text-white antialiased shadow-md ${
                        unreadCount > 9 ? 'h-[18px] min-w-[22px] px-1 text-[9px]' : 'size-[18px] text-[10px]'
                      }`}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                    <div className="absolute right-0 top-11 w-80 bg-white rounded-xl z-50 shadow-2xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,.04)' }}>
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <h3 className="font-bold text-[15px] text-slate-900 tracking-tight">Notifications</h3>
                        {notifications.some((notification) => !notification.isRead) && (
                          <button onClick={markAllNotificationsAsRead} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                            Mark all as read
                          </button>
                        )}
                      </div>
                      <div
                        className="max-h-[400px] overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                      >
                        {notificationsLoading ? (
                          <div className="p-8 text-center flex flex-col items-center justify-center">
                            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mb-2"></div>
                            <p className="text-[13px] text-slate-500">Loading notifications...</p>
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="p-8 text-center flex flex-col items-center justify-center">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                              <Bell size={22} className="text-slate-300" />
                            </div>
                            <p className="text-[14px] font-medium text-slate-900">You're all caught up</p>
                            <p className="text-[12px] text-slate-500 mt-1">No new notifications right now.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-50">
                            {notifications.map((notification) => (
                              <button
                                key={notification.id || notification._id}
                                onClick={() => markNotificationAsRead(notification.id || notification._id || '')}
                                className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex gap-3 ${!notification.isRead ? 'bg-slate-50/50' : ''}`}
                              >
                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!notification.isRead ? 'bg-indigo-500' : 'bg-transparent'}`}></div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-[13px] text-slate-900 truncate ${!notification.isRead ? 'font-semibold' : 'font-medium'}`}>
                                    {notification.title}
                                  </p>
                                  <p className="text-[12px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">{notification.message}</p>
                                  <p className="text-[10px] text-slate-400 mt-1">{new Date(notification.createdAt).toLocaleDateString()}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen((current) => !current)}
                  className="relative w-9 h-9 rounded-full bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#1d4ed8] font-bold text-sm ml-2 hover:ring-2 hover:ring-[#bfdbfe] transition-all overflow-visible"
                >
                  <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      (user?.name || 'C').charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full bg-[#e2e5ea] border-2 border-white flex items-center justify-center shadow-sm">
                    <svg width="6" height="5" viewBox="0 0 6 5" fill="none">
                      <path d="M1 1.5L3 3.5L5 1.5" stroke="#1e293b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {profileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)} />
                    <div className="absolute right-0 top-11 w-[320px] bg-white rounded-xl z-50 overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04)' }}>
                      <div className="p-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[#eff6ff] flex items-center justify-center text-[#1d4ed8] font-bold text-[17px] shrink-0 overflow-hidden">
                            {user?.avatar ? (
                              <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              (user?.name || 'C').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <p className="font-bold text-[15px] text-slate-900 truncate">{user?.name || 'Customer'}</p>
                            <p className="text-[13px] text-slate-600 truncate">{user?.email || 'customer@email.com'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-2">
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            navigate('/customer/dashboard?section=settings');
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md hover:bg-slate-50 transition-colors text-slate-700"
                        >
                          <Settings size={16} />
                          Account Settings
                        </button>
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            logout();
                            navigate('/login');
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md hover:bg-slate-50 transition-colors text-red-600"
                        >
                          <LogOut size={16} />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="relative flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <motion.div
                className="absolute left-[12%] top-0 h-80 w-80 rounded-full bg-indigo-100/70 blur-3xl"
                animate={{ x: [0, 18, -10, 0], y: [0, 20, 8, 0], scale: [1, 1.12, 0.96, 1] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute right-[6%] top-16 h-[22rem] w-[22rem] rounded-full bg-orange-100/60 blur-3xl"
                animate={{ x: [0, -18, 8, 0], y: [0, 16, -12, 0], scale: [1, 0.96, 1.08, 1] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
              />
            </div>

            <motion.div
              className="relative max-w-6xl mx-auto space-y-6 pb-10"
              variants={pageStagger}
              initial="hidden"
              animate="visible"
            >
              <motion.section
                variants={revealUp}
                className="group relative overflow-hidden rounded-[30px] border border-slate-200/90 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.08)]"
              >
                <motion.div
                  className="absolute inset-0"
                  animate={{ opacity: [0.92, 1, 0.92] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    backgroundImage: 'radial-gradient(circle at top right, rgba(79,70,229,0.12), transparent 28%), radial-gradient(circle at left, rgba(232,101,10,0.10), transparent 24%)',
                  }}
                />
                <div
                  className="absolute inset-0 opacity-[0.07]"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(148,163,184,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.35) 1px, transparent 1px)',
                    backgroundSize: '34px 34px',
                    maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.8), transparent)',
                  }}
                ></div>
                <motion.div
                  className="absolute top-0 h-px w-40 bg-gradient-to-r from-transparent via-white to-transparent opacity-70"
                  animate={{ x: ['-20%', '150%'] }}
                  transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>

                <div className="relative p-6 sm:p-7">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <motion.div variants={revealUp}>
                      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.20em] text-slate-500 shadow-sm">
                        AutoSPF+ Concierge Feed
                      </span>
                      <h2 className="text-[36px] sm:text-[46px] font-semibold tracking-[-0.05em] text-slate-900 mt-4">Live Tracker</h2>
                      <p className="text-sm sm:text-base text-slate-500 mt-2">Track your vehicle service in real time</p>
                    </motion.div>

                    <motion.div variants={revealUp} className="flex flex-col items-start gap-2 xl:items-end">
                      <motion.div
                        className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
                        style={{
                          borderColor: liveStatusMeta.border,
                          backgroundColor: liveStatusMeta.background,
                          color: liveStatusMeta.text,
                          boxShadow: '0 12px 30px rgba(15,23,42,0.05)',
                        }}
                        whileHover={{ y: -1, scale: 1.01 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                      >
                        <span className="relative flex h-2.5 w-2.5">
                          <span
                            className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-70"
                            style={{ backgroundColor: liveStatusMeta.dotColor }}
                          ></span>
                          <span
                            className="relative inline-flex h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: liveStatusMeta.dotColor, boxShadow: `0 0 18px ${liveStatusMeta.dotColor}55` }}
                          ></span>
                        </span>
                        {liveStatusMeta.label}
                      </motion.div>
                      <p className="text-xs text-slate-500">{liveStatusMeta.description}</p>
                    </motion.div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {trackerHighlights.map((highlight, index) => (
                      <motion.div
                        key={highlight.label}
                        variants={revealUp}
                        transition={{ delay: index * 0.05 }}
                        whileHover={{ y: -4, scale: 1.01 }}
                        className="rounded-[24px] border border-white/80 bg-white/80 p-4 backdrop-blur-sm shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700 shadow-sm">
                            <highlight.icon size={17} />
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{highlight.label}</p>
                            <p className="text-sm font-medium text-slate-800 mt-1">{highlight.value}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.section>

              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div
                    key="tracker-loading"
                    initial={{ opacity: 0, y: 24, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.985 }}
                    transition={{ duration: 0.6, ease: LUXURY_EASE }}
                    className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] p-10 flex flex-col items-center justify-center min-h-[360px]"
                  >
                    <motion.div
                      className="absolute inset-0"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        backgroundImage: 'radial-gradient(circle at top, rgba(79,70,229,0.08), transparent 30%), radial-gradient(circle at bottom, rgba(232,101,10,0.08), transparent 28%)',
                      }}
                    />
                    <motion.div
                      className="absolute h-40 w-40 rounded-full border border-orange-100"
                      animate={{ scale: [1, 1.18, 1], opacity: [0.3, 0.08, 0.3] }}
                      transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <div className="relative w-12 h-12 border-2 border-slate-200 rounded-full animate-spin mb-5" style={{ borderTopColor: BRAND_ORANGE }}></div>
                    <p className="relative text-sm font-semibold text-slate-900">Loading live service data...</p>
                    <p className="relative text-xs text-slate-500 mt-1">Checking your active booking and latest service updates.</p>
                  </motion.div>
                ) : !activeBooking ? (
                  <motion.section
                    key="tracker-empty"
                    initial={{ opacity: 0, y: 24, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.985 }}
                    transition={{ duration: 0.75, ease: LUXURY_EASE }}
                    className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.08)]"
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_58%,#fff7ed_100%)]"></div>
                    <motion.div
                      className="absolute right-0 top-0 h-full w-[42%]"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ background: 'radial-gradient(circle at center, rgba(79,70,229,0.10), transparent 70%)' }}
                    />
                    <motion.div
                      className="absolute -left-10 bottom-8 h-48 w-48 rounded-full border border-orange-100"
                      animate={{ y: [0, -12, 0], scale: [1, 1.08, 1] }}
                      transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <div className="relative grid lg:grid-cols-[1.08fr_0.92fr]">
                      <div className="p-8 sm:p-10 lg:border-r lg:border-slate-100">
                        <span className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND_ORANGE }}>
                          Service visibility suite
                        </span>
                        <h3 className="text-[32px] sm:text-[40px] leading-none font-semibold tracking-[-0.05em] text-slate-900 mt-5">
                          No active service at the moment.
                        </h3>
                        <p className="text-sm sm:text-base text-slate-500 mt-4 max-w-xl leading-7">
                          Once your vehicle is checked in, the portal will surface bay progress, timing, and readiness updates in a luxury live command view.
                        </p>

                        <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                          {[
                            {
                              icon: Navigation,
                              title: 'Bay-level tracking',
                              copy: 'See where your vehicle is assigned the moment service begins.',
                            },
                            {
                              icon: ClipboardList,
                              title: 'Visible service milestones',
                              copy: 'Follow check-in, service progress, quality control, and pickup readiness.',
                            },
                            {
                              icon: Clock3,
                              title: 'Concierge timing updates',
                              copy: 'Estimated completion and live service timing appear automatically.',
                            },
                          ].map((item, index) => (
                            <motion.div
                              key={item.title}
                              initial={{ opacity: 0, x: -16 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.12 + index * 0.08, duration: 0.55, ease: LUXURY_EASE }}
                              whileHover={{ x: 4, y: -2 }}
                              className="rounded-[22px] border border-white/80 bg-white/75 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                            >
                              <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 mb-3">
                                <item.icon size={17} />
                              </div>
                              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                              <p className="text-xs leading-6 text-slate-500 mt-1">{item.copy}</p>
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      <div className="p-8 sm:p-10 flex items-center">
                        <motion.div
                          initial={{ opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.18, duration: 0.7, ease: LUXURY_EASE }}
                          className="relative w-full rounded-[28px] border border-slate-200 bg-white/90 p-8 shadow-[0_22px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm"
                        >
                          <motion.div
                            className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent"
                            animate={{ opacity: [0.35, 1, 0.35] }}
                            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <div className="relative w-20 h-20 rounded-[28px] mx-auto flex items-center justify-center border border-orange-100 bg-orange-50 shadow-[0_12px_30px_rgba(232,101,10,0.12)]" style={{ color: BRAND_ORANGE }}>
                            <motion.div
                              animate={{ rotate: [0, 8, -6, 0], y: [0, -2, 0] }}
                              transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
                            >
                              <Navigation size={34} />
                            </motion.div>
                          </div>
                          <p className="text-center text-xl font-semibold tracking-tight text-slate-900 mt-6">Ready for your next booking</p>
                          <p className="text-center text-sm text-slate-500 mt-2 leading-7">
                            Book a service to unlock the full live tracker experience inside the customer portal.
                          </p>
                          <motion.button
                            whileHover={{ y: -2, scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => navigate('/customer/book')}
                            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white transition-colors shadow-lg shadow-indigo-600/20 bg-indigo-600 hover:bg-indigo-700"
                          >
                            <CalendarPlus size={16} />
                            Book a Service
                          </motion.button>
                        </motion.div>
                      </div>
                    </div>
                  </motion.section>
                ) : (
                  <motion.div
                    key="tracker-active"
                    variants={pageStagger}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, y: -16 }}
                    className="space-y-6"
                  >
                    <motion.section
                      variants={revealUp}
                      className="group relative overflow-hidden rounded-[30px] border border-slate-200/90 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.10)]"
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(135deg,#ffffff_0%,#ffffff_44%,#f8fafc_76%,#fff7ed_100%)]"></div>
                      <motion.div
                        className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-indigo-100/80 blur-3xl"
                        animate={{ x: [0, -14, 0], y: [0, 18, 0], scale: [1, 1.08, 1] }}
                        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <motion.div
                        className="absolute -left-14 bottom-0 h-56 w-56 rounded-full bg-orange-100/70 blur-3xl"
                        animate={{ x: [0, 14, 0], y: [0, -10, 0], scale: [1, 0.96, 1] }}
                        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <div
                        className="absolute inset-0 opacity-[0.07]"
                        style={{
                          backgroundImage: 'linear-gradient(rgba(148,163,184,0.38) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.38) 1px, transparent 1px)',
                          backgroundSize: '38px 38px',
                          maskImage: 'radial-gradient(circle at center, rgba(0,0,0,0.9), transparent 85%)',
                        }}
                      ></div>
                      <motion.div
                        className="absolute inset-x-0 top-0 h-[3px]"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ background: `linear-gradient(90deg, ${BRAND_ORANGE} 0%, #fb923c 42%, #cbd5e1 100%)` }}
                      />
                      <motion.div
                        className="absolute top-0 left-[-20%] h-full w-28 bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-60 blur-xl"
                        animate={{ x: ['0%', '470%'] }}
                        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
                      />

                      <div className="relative p-6 sm:p-8">
                        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
                          <motion.div variants={revealUp} className="space-y-6">
                            <div className="flex flex-wrap items-center gap-3">
                              <motion.div
                                whileHover={{ y: -2, scale: 1.01 }}
                                className="relative inline-flex items-center overflow-hidden rounded-[18px] border border-slate-300 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.07)]"
                              >
                                <motion.div
                                  className="absolute inset-y-0 left-0 w-12 opacity-60"
                                  animate={{ x: ['-100%', '300%'] }}
                                  transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)' }}
                                />
                                <span className="px-2.5 py-2.5 text-[10px] font-bold tracking-[0.18em] text-white" style={{ backgroundColor: '#1d4ed8' }}>
                                  PH
                                </span>
                                <div className="px-4 py-2.5">
                                  <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">Vehicle Plate</p>
                                  <span className="text-sm font-black tracking-[0.32em] text-slate-900">
                                    {(activeBooking.vehiclePlate || 'TBA').toUpperCase()}
                                  </span>
                                </div>
                              </motion.div>

                              <span className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND_ORANGE }}>
                                <Sparkles size={13} />
                                Live service session
                              </span>
                            </div>

                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Vehicle in service</p>
                              <h3 className="text-[38px] sm:text-[48px] leading-none font-semibold tracking-[-0.06em] text-slate-900 mt-3">
                                {vehicleLabel}
                              </h3>
                              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                                    style={{ backgroundColor: vehicleColorAccent }}
                                  ></span>
                                  {activeBooking.vehicleColor || 'Color not specified'}
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm" style={{ color: BRAND_ORANGE, borderColor: '#fdba74', backgroundColor: '#fff7ed' }}>
                                  <Wrench size={13} />
                                  {activeBooking.serviceName || activeBooking.serviceType || 'Active Service'}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {displayServices.map((serviceName) => (
                                <motion.span
                                  key={serviceName}
                                  whileHover={{ y: -1 }}
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BRAND_ORANGE }}></span>
                                  {serviceName}
                                </motion.span>
                              ))}
                            </div>
                          </motion.div>

                          <motion.div variants={revealUp} className="space-y-4">
                            <div className="rounded-[28px] border border-slate-200 bg-white/92 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Estimated Completion</p>
                                  <motion.p
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.6, delay: 0.18, ease: LUXURY_EASE }}
                                    className="text-[42px] sm:text-[52px] font-semibold tracking-[-0.06em] text-slate-900 mt-2"
                                  >
                                    {formatTimeValue(estimatedCompletion, activeBooking.bookingDate || activeBooking.date)}
                                  </motion.p>
                                </div>
                                <motion.div
                                  animate={{ y: [0, -4, 0], rotate: [0, 4, 0] }}
                                  transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
                                  className="w-12 h-12 rounded-2xl border border-orange-100 bg-orange-50 flex items-center justify-center"
                                  style={{ color: BRAND_ORANGE }}
                                >
                                  <Clock3 size={18} />
                                </motion.div>
                              </div>

                              <div className="mt-5 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Start Time</p>
                                  <p className="text-sm font-semibold text-slate-900 mt-2">
                                    {formatTimeValue(startTime, activeBooking.bookingDate || activeBooking.date)}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-3.5">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#c2410c' }}>Current Stage</p>
                                  <p className="text-sm font-semibold mt-2" style={{ color: BRAND_ORANGE }}>
                                    {currentStageTitle}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)]">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Service Progress</p>
                                  <p className="text-sm text-slate-500 mt-1">Premium 5-stage customer timeline</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[28px] font-semibold tracking-[-0.05em] text-slate-900">
                                    {Math.round(trackerProgress)}%
                                  </p>
                                </div>
                              </div>
                              <div className="mt-5 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${trackerProgress}%` }}
                                  transition={{ duration: 1.2, ease: LUXURY_EASE }}
                                  style={{ background: `linear-gradient(90deg, ${BRAND_ORANGE}, #fb923c, #facc15)` }}
                                />
                              </div>
                              <div className="mt-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                <span>Booking confirmed</span>
                                <span>Pickup ready</span>
                              </div>
                            </div>
                          </motion.div>
                        </div>

                        <div className="mt-8 grid gap-4 md:grid-cols-3">
                          {[
                            {
                              title: 'Assigned Detailer',
                              subtitle: detailerRole,
                              value: detailerName,
                              accent: 'slate',
                              icon: null,
                            },
                            {
                              title: 'Bay Assignment',
                              subtitle: 'Vehicle currently tracked in this service bay',
                              value: bayAssignment,
                              accent: 'orange',
                              icon: MapPin,
                            },
                            {
                              title: 'Last Update',
                              subtitle: 'Realtime refresh keeps this view current',
                              value: lastUpdatedLabel,
                              accent: 'slate-soft',
                              icon: Clock3,
                            },
                          ].map((meta, index) => (
                            <motion.div
                              key={meta.title}
                              variants={revealUp}
                              transition={{ delay: index * 0.06 }}
                              whileHover={{ y: -4, scale: 1.01 }}
                              className={`rounded-[24px] border p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] ${meta.accent === 'orange'
                                  ? 'border-orange-100 bg-orange-50/70'
                                  : meta.accent === 'slate-soft'
                                    ? 'border-slate-200 bg-slate-50/80'
                                    : 'border-slate-200 bg-white/90'
                                }`}
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{meta.title}</p>
                              <div className="mt-3 flex items-center gap-3">
                                {meta.icon ? (
                                  <div
                                    className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${meta.accent === 'orange'
                                        ? 'border-orange-200 bg-white/80'
                                        : 'border-slate-200 bg-white'
                                      }`}
                                    style={meta.accent === 'orange' ? { color: BRAND_ORANGE } : undefined}
                                  >
                                    <meta.icon size={18} />
                                  </div>
                                ) : (
                                  <div
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold border"
                                    style={{ backgroundColor: '#fff7ed', color: BRAND_ORANGE, borderColor: '#fed7aa' }}
                                  >
                                    {getInitials(detailerName)}
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{meta.value}</p>
                                  <p className="text-xs text-slate-500 mt-1">{meta.subtitle}</p>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </motion.section>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
                      <motion.section
                        variants={revealUp}
                        className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.08)] p-6 sm:p-7"
                      >
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent"></div>
                        <div className="relative flex items-start justify-between gap-4 mb-7">
                          <div>
                            <div className="flex items-center gap-2">
                              <ClipboardList size={18} className="text-slate-700" />
                              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Progress Stepper</h3>
                            </div>
                            <p className="text-sm text-slate-500 mt-2">Customer-facing milestones from booking confirmation to pickup readiness.</p>
                          </div>
                          <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            5-stage view
                          </span>
                        </div>

                        <div className="space-y-0">
                          {resolvedSteps.map((step, index) => {
                            const isCompleted = step.state === 'completed';
                            const isActive = step.state === 'active';

                            return (
                              <motion.div
                                key={step.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.16 + index * 0.08, duration: 0.55, ease: LUXURY_EASE }}
                                className="relative flex gap-4 pb-6 last:pb-0"
                              >
                                {index < resolvedSteps.length - 1 && (
                                  <>
                                    <span
                                      className="absolute left-[21px] top-11 w-[2px] h-[calc(100%-1rem)]"
                                      style={{ background: '#e2e8f0' }}
                                    ></span>
                                    {isCompleted && (
                                      <motion.span
                                        className="absolute left-[21px] top-11 w-[2px] origin-top"
                                        initial={{ height: 0 }}
                                        animate={{ height: 'calc(100% - 1rem)' }}
                                        transition={{ duration: 0.65, delay: 0.22 + index * 0.08, ease: LUXURY_EASE }}
                                        style={{ background: `linear-gradient(180deg, ${BRAND_ORANGE}, #fdba74)` }}
                                      ></motion.span>
                                    )}
                                  </>
                                )}

                                <div className="relative z-10 pt-1">
                                  {isCompleted ? (
                                    <motion.div
                                      initial={{ scale: 0.8 }}
                                      animate={{ scale: 1 }}
                                      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                                      className="w-11 h-11 rounded-full flex items-center justify-center text-white shadow-[0_12px_30px_rgba(232,101,10,0.2)]"
                                      style={{ backgroundColor: BRAND_ORANGE }}
                                    >
                                      <Check size={16} />
                                    </motion.div>
                                  ) : isActive ? (
                                    <div className="relative w-11 h-11 flex items-center justify-center">
                                      <span className="absolute inset-0 rounded-full animate-ping border" style={{ borderColor: BRAND_ORANGE, opacity: 0.35 }}></span>
                                      <span className="absolute inset-[4px] rounded-full border bg-white" style={{ borderColor: '#fdba74' }}></span>
                                      <motion.span
                                        className="relative w-3.5 h-3.5 rounded-full"
                                        animate={{ scale: [1, 1.18, 1] }}
                                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                        style={{ backgroundColor: BRAND_ORANGE }}
                                      ></motion.span>
                                    </div>
                                  ) : (
                                    <div className="w-11 h-11 rounded-full border-2 border-slate-300 bg-white flex items-center justify-center text-xs font-semibold text-slate-400">
                                      {index + 1}
                                    </div>
                                  )}
                                </div>

                                <motion.div
                                  whileHover={{ y: -2 }}
                                  className={`min-w-0 flex-1 rounded-[24px] border p-4 transition-all ${isActive
                                      ? 'border-orange-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] shadow-[0_16px_40px_rgba(232,101,10,0.08)]'
                                      : isCompleted
                                        ? 'border-slate-200 bg-slate-50/90'
                                        : 'border-slate-100 bg-white'
                                    }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className={`text-sm font-semibold ${isCompleted ? 'text-slate-900' : isActive ? '' : 'text-slate-400'}`} style={isActive ? { color: BRAND_ORANGE } : undefined}>
                                        {step.title}
                                      </p>
                                      {step.state === 'pending' && (
                                        <p className="text-xs text-slate-400 mt-2">Pending</p>
                                      )}
                                    </div>

                                    {isCompleted && (
                                      <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                        Completed
                                      </span>
                                    )}

                                    {isActive && (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                                        style={{ backgroundColor: '#fff7ed', color: BRAND_ORANGE }}
                                      >
                                        Live
                                      </span>
                                    )}
                                  </div>

                                  {(isCompleted || isActive) && (
                                    <p className="text-xs text-slate-500 mt-2">{step.timestamp}</p>
                                  )}

                                  {isActive && (
                                    <p className="text-xs font-medium mt-3" style={{ color: BRAND_ORANGE }}>
                                      {step.helperText}
                                    </p>
                                  )}
                                </motion.div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.section>

                      <motion.section
                        variants={revealUp}
                        className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.08)] p-6 sm:p-7"
                      >
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent"></div>
                        <div className="relative flex items-start justify-between gap-4 mb-7">
                          <div>
                            <div className="flex items-center gap-2">
                              <Wrench size={18} className="text-slate-700" />
                              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Service Details</h3>
                            </div>
                            <p className="text-sm text-slate-500 mt-2">Booked services, bay placement, and customer-facing service notes.</p>
                          </div>
                          <span className="rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
                            Active booking
                          </span>
                        </div>

                        <div className="space-y-5">
                          <motion.div
                            variants={revealUp}
                            className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                          >
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 mb-3">Booked Services</p>
                            <div className="space-y-3">
                              {displayServices.map((serviceName, index) => (
                                <motion.div
                                  key={serviceName}
                                  initial={{ opacity: 0, x: 14 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: 0.12 + index * 0.06, duration: 0.45, ease: LUXURY_EASE }}
                                  whileHover={{ x: 4 }}
                                  className="flex items-start gap-3 rounded-2xl bg-white border border-slate-200 px-4 py-3 shadow-sm"
                                >
                                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: BRAND_ORANGE }}></span>
                                  <p className="text-sm text-slate-700">{serviceName}</p>
                                </motion.div>
                              ))}
                            </div>
                          </motion.div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <motion.div variants={revealUp} className="rounded-[24px] border border-orange-100 bg-orange-50/80 p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#c2410c' }}>Bay Assignment</p>
                              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1.5 text-xs font-semibold" style={{ color: BRAND_ORANGE }}>
                                <MapPin size={13} />
                                {bayAssignment}
                              </div>
                            </motion.div>

                            <motion.div variants={revealUp} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Vehicle Identity</p>
                              <div className="mt-3">
                                <p className="text-sm font-semibold text-slate-900">{(activeBooking.vehiclePlate || 'TBA').toUpperCase()}</p>
                                <p className="text-xs text-slate-500 mt-1">{activeBooking.vehicleColor || 'Color pending'} • {vehicleLabel}</p>
                              </div>
                            </motion.div>
                          </div>

                          <motion.div
                            variants={revealUp}
                            className={`rounded-[24px] border p-4 ${latestStaffNote ? 'border-orange-100 bg-orange-50/70' : 'border-slate-200 bg-slate-50/80'}`}
                          >
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 mb-3">Staff Notes</p>
                            {latestStaffNote ? (
                              <p className="text-sm leading-7 text-slate-700">{latestStaffNote}</p>
                            ) : (
                              <p className="text-sm leading-7 text-slate-500">
                                No staff note has been added yet. Any customer-safe remarks or readiness notes will appear here automatically.
                              </p>
                            )}
                          </motion.div>

                          <motion.div
                            variants={revealUp}
                            className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                                <Clock3 size={16} />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Live service timing</p>
                                <p className="text-xs text-slate-500 mt-1 leading-6">
                                  ETA {formatTimeValue(estimatedCompletion, activeBooking.bookingDate || activeBooking.date)} • Started {formatTimeValue(startTime, activeBooking.bookingDate || activeBooking.date)}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      </motion.section>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </main>
        </div>
      </div>

      <style>{`
        @keyframes ring {
          0% { transform: rotate(0); }
          5% { transform: rotate(15deg); }
          10% { transform: rotate(-10deg); }
          15% { transform: rotate(15deg); }
          20% { transform: rotate(-10deg); }
          25% { transform: rotate(0); }
          100% { transform: rotate(0); }
        }
      `}</style>
    </>
  );
}
