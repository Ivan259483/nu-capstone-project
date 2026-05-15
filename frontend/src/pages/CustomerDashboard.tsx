import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { NotificationService, SystemNotification } from '../lib/notification-service';
import { toast } from 'sonner';
import { invalidate } from '../lib/queryCache';
import { ensureBackendAuthToken, getStoredAuthToken } from '../lib/api';
import { useLiveJobs, type BookingStatusEvent } from '../hooks/useLiveJobs';
import { isValidPhilippineMobileInput, isValidPhilippineBookingContact, formatContactNoInputFromProfile, normalizePhilippineMobileForBooking } from '../lib/phone';
import { normalizePlateNumber } from '../lib/plate';
import { usePublishedBookingPackages } from '../lib/customer-booking-catalog';
import {
  BOOKING_TERMS_DOCUMENT_TITLE,
  BOOKING_TERMS_INTRO,
  BOOKING_TERMS_LAST_UPDATED,
  BOOKING_TERMS_SECTIONS,
  BOOKING_TERMS_SUMMARY,
  BOOKING_TERMS_VERSION,
} from '../lib/booking-terms';
import {
  DASHBOARD_TRACKER_STEP_MEDIA_STAGE,
  bumpCustomerTrackerIndexForInProgressGateComplete,
  bumpCustomerTrackerIndexForReceivedGateComplete,
  CUSTOMER_TRACKER_GATE_MIN_PHOTOS,
  customerGateMinSlotCount,
  getCustomerStageSlotPhotos,
  resolveTrackerStageDescription,
} from '../lib/customer-tracker-stage-media';
import { getTrackerPipelineProgressPct } from '../lib/tracker-pipeline-progress';
import { toCloudinaryHighResDeliveryUrl, toCloudinaryEvidenceThumbUrl } from '../lib/cloudinary-delivery-url';
import { CustomerDashboardServicesShowcase } from '../components/customer/CustomerDashboardServicesShowcase';
import { compressImageForBookingProof } from '../lib/compress-image-for-upload';
import VehicleGarageForm from '@/components/shared/VehicleGarageForm';
import {
  ADD_VEHICLE_TYPE_LABELS,
  BOOKING_YEAR_OPTIONS,
  CAR_BRANDS,
  getVehiclePriceKey,
  validateVehicleGarageForm,
} from '@/components/shared/vehicle-garage-constants';

type DashboardSection = 'dashboard' | 'scan' | 'settings' | 'bookings' | 'documents' | 'rewards' | 'tracker' | 'payments';

type ScanUpload = {
  id: string;
  name: string;
  size: number;
  preview: string;
};

/** When false, AI Inspection History shows a Soon badge, is not clickable, and ?section=scan is redirected away. */
const AI_INSPECTION_HISTORY_ENABLED = false;
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebar_collapsed';

function getStoredSidebarCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

// ---- STATIC DATA FOR BOOKING ----
/** Preset names matching Add Vehicle color swatches (custom colors use free-text). */
const EDIT_VEHICLE_COLOR_PRESETS = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Yellow', 'Orange', 'Brown'] as const;

const VEHICLE_OPTIONS = [
  { type: "hatchback", label: "Hatchback", icon: "lucide:car-front" },
  { type: "sedan", label: "Sedan", icon: "lucide:car" },
  { type: "midsized", label: "Midsized", icon: "lucide:car" },
  { type: "suv", label: "SUV", icon: "lucide:truck" },
  { type: "pickup", label: "Pick Up", icon: "lucide:truck" },
  { type: "largesuv", label: "Large SUV / Van", icon: "lucide:truck" },
  { type: "highend", label: "Highend Sedan", icon: "lucide:crown" },
];

const SCAN_FLOW_STEPS = [
  {
    title: 'AI Inspection History',
    desc: 'Upload a clean exterior photo set or a quick walkaround capture.',
    icon: 'solar:camera-add-linear',
    tag: 'Input',
  },
  {
    title: 'AI detects defects',
    desc: 'Scratches, dents, swirl marks, chips, and paint inconsistencies are isolated panel by panel.',
    icon: 'solar:scanner-linear',
    tag: 'Vision',
  },
  {
    title: 'System identifies problem areas',
    desc: 'Severity is grouped into priority zones with repair recommendations for each section.',
    icon: 'solar:danger-triangle-linear',
    tag: 'Severity',
  },
  {
    title: '3D vehicle model generation',
    desc: 'A digital body map is assembled to anchor every detected issue in a clear layout.',
    icon: 'solar:car-linear',
    tag: '3D',
  },
  {
    title: 'AR repair simulation',
    desc: 'Before and after visualization helps you inspect the expected repair outcome in context.',
    icon: 'solar:routing-2-linear',
    tag: 'AR',
  },
  {
    title: 'System calculates price',
    desc: 'Labor, materials, and suggested services are bundled into a guided cost estimate.',
    icon: 'solar:document-text-linear',
    tag: 'Estimate',
  },
  {
    title: 'Customer confirms',
    desc: 'Approve the recommendation and proceed to booking with the generated estimate.',
    icon: 'solar:check-circle-linear',
    tag: 'Confirm',
  },
] as const;

const SCAN_HIGHLIGHTS = [
  { value: '14', label: 'repair zones mapped' },
  { value: '<45s', label: 'AI review target' },
  { value: '3D + AR', label: 'visual output layers' },
] as const;

const SCAN_DAMAGE_ZONES = [
  { title: 'Front bumper', note: 'Impact scuffs and lower lip abrasion', tone: '#ef4444', bg: '#fef2f2' },
  { title: 'Driver fender', note: 'Light crease with paint disruption', tone: '#f59e0b', bg: '#fffbeb' },
  { title: 'Hood edge', note: 'Stone chip cluster and swirl build-up', tone: '#0ea5e9', bg: '#eff6ff' },
] as const;

const SCAN_PRICING: Record<string, { low: number; recommended: number; high: number }> = {
  hatchback: { low: 18500, recommended: 21400, high: 26800 },
  sedan: { low: 20500, recommended: 23600, high: 29800 },
  midsized: { low: 21900, recommended: 24700, high: 31200 },
  suv: { low: 23800, recommended: 27200, high: 34600 },
  pickup: { low: 24400, recommended: 28100, high: 35800 },
  largesuv: { low: 26900, recommended: 30500, high: 39200 },
  highend: { low: 31200, recommended: 34800, high: 46500 },
};

const formatPeso = (amount: number) => `₱${amount.toLocaleString()}`;

const toTitleCase = (str: string) =>
  str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());

const formatTitleCaseDisplay = (value: unknown, fallback = '—') => {
  const formatted = toTitleCase(String(value ?? '').trim());
  return formatted || fallback;
};

const formatPlateDisplay = (value: unknown, fallback = '—') => {
  const formatted = String(value ?? '').trim().toUpperCase();
  return formatted || fallback;
};

/** Bookings that may appear on the customer live tracker (dashboard + tracker tab). */
const CUSTOMER_TRACKER_STATUS_SET = new Set([
  'approved',
  'confirmed',
  'assigned',
  'received',
  'in_progress',
  'in-progress',
  'ready_for_payment',
  'completed',
  'paid',
]);

/** Prefer fine-grained QC stage when ranking which booking to show. */
const CUSTOMER_TRACKER_STAGE_RANK: Record<string, number> = {
  confirmed: 0,
  received: 1,
  in_progress: 2,
  quality_check: 3,
  ready_pickup: 4,
  completed: 5,
  released: 6,
};

const CUSTOMER_TRACKER_STATUS_FALLBACK_RANK: Record<string, number> = {
  approved: 0,
  confirmed: 0,
  assigned: 0,
  received: 1,
  in_progress: 2,
  'in-progress': 2,
  ready_for_payment: 4,
  completed: 5,
  paid: 5,
  released: 6,
  done: 6,
};

function normTrackerStr(s: unknown) {
  return String(s ?? '').trim().toLowerCase().replace(/-/g, '_');
}

/** True when this booking should surface the technician/QC live tracker (excludes fully paid / receipt issued). */
function bookingShowsCustomerLiveTracker(b: unknown): boolean {
  const row = b as Record<string, unknown> | null | undefined;
  if (!row) return false;
  if (String(row.paymentStatus ?? '').toLowerCase() === 'paid') return false;
  return CUSTOMER_TRACKER_STATUS_SET.has(normTrackerStr(row.status));
}

/**
 * Pick the booking furthest along the live pipeline. `myBookings` is sorted newest-first;
 * a plain `find()` often returned a newer `approved` row instead of the older in-shop job
 * that QC advanced to `quality_check` / `ready_pickup`.
 */
function pickCustomerLiveTrackerBooking(bookings: unknown[] | null | undefined): any | undefined {
  if (!bookings?.length) return undefined;
  const candidates = (bookings as any[]).filter(bookingShowsCustomerLiveTracker);
  if (!candidates.length) return undefined;
  const rankOf = (b: any) => {
    const ts = normTrackerStr(b?.serviceTrackingStage);
    if (ts && CUSTOMER_TRACKER_STAGE_RANK[ts] !== undefined) {
      return CUSTOMER_TRACKER_STAGE_RANK[ts] + 0.001;
    }
    return CUSTOMER_TRACKER_STATUS_FALLBACK_RANK[normTrackerStr(b?.status)] ?? 0;
  };
  const sorted = [...candidates].sort((a, b) => {
    const d = rankOf(b) - rankOf(a);
    if (d !== 0) return d;
    const tb = new Date(b?.serviceTrackingUpdatedAt || b?.updatedAt || b?.createdAt || 0).getTime();
    const ta = new Date(a?.serviceTrackingUpdatedAt || a?.updatedAt || a?.createdAt || 0).getTime();
    return tb - ta;
  });
  const best = sorted[0];

  return best;
}

function parseClockTimeToMinutes(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '--') return null;
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '');

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'pm') hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

function formatMinutesAsLocaleTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const date = new Date(2026, 0, 1, Math.floor(normalized / 60), normalized % 60);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatTrackerClockLabel(value: unknown, fallback = '--'): string {
  const minutes = parseClockTimeToMinutes(value);
  if (minutes == null) {
    const raw = String(value ?? '').trim();
    return raw && raw !== '--' ? raw : fallback;
  }
  return formatMinutesAsLocaleTime(minutes);
}

function formatTrackerUpdatedLabel(value: unknown): string {
  if (!value) return 'Live sync active';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return 'Live sync active';
  return `Updated ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

const formatVehicleMakeModelDisplay = (make: unknown, model: unknown) =>
  [
    formatTitleCaseDisplay(make, ''),
    formatTitleCaseDisplay(model, ''),
  ].filter(Boolean).join(' ') || '—';

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/** Long hex / opaque IDs should not appear as “plates” or titles in customer UI. */
function looksLikeOpaqueTechnicalId(value: unknown): boolean {
  const s = String(value ?? '').trim();
  if (s.length < 16) return false;
  if (/^[a-f0-9]{16,}$/i.test(s)) return true;
  if (/^[a-f0-9-]{20,}$/i.test(s)) return true;
  // e.g. Firebase-style "hex32:hex32" wrongly stored as plate
  if (/^[a-f0-9]{16,}:[a-f0-9]{16,}$/i.test(s)) return true;
  return false;
}

function displayVehicleLabel(plate: unknown, fallback = 'Your vehicle'): string {
  if (plate == null || String(plate).trim() === '') return fallback;
  const s = String(plate).trim();
  if (looksLikeOpaqueTechnicalId(s)) return fallback;
  if (s.length > 14) return `${s.slice(0, 12)}…`;
  return s;
}

function displayServiceTitle(raw: unknown, fallback = 'Service'): string {
  const s = String(raw ?? '').trim();
  if (!s || looksLikeOpaqueTechnicalId(s)) return fallback;
  return s;
}

function formatBookingDayLabel(dateRaw: unknown): string {
  if (!dateRaw) return 'Date to be confirmed';
  const d = new Date(dateRaw as string);
  if (Number.isNaN(d.getTime())) return 'Date to be confirmed';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function humanizeBookingStatus(statusRaw: unknown): string {
  const raw = String(statusRaw || 'pending').toLowerCase().replace(/-/g, '_');
  const map: Record<string, string> = {
    pending: 'Pending',
    pending_confirmation: 'Awaiting confirmation',
    approved: 'Approved',
    confirmed: 'Confirmed',
    assigned: 'Detailer assigned',
    received: 'Vehicle received',
    in_progress: 'Service in progress',
    completed: 'Quality check',
    paid: 'Payment received',
    ready_pickup: 'Ready for pickup',
    released: 'Vehicle returned',
    rejected: 'Not approved',
    cancelled: 'Cancelled',
  };
  if (map[raw]) return map[raw];
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatActivityWhen(booking: any): string {
  const d = new Date(booking.updatedAt || booking.createdAt || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Plate string from garage API record or UI object (supports plate / plateNumber / licensePlate). */
function resolveGarageVehiclePlate(v: any): string {
  if (!v || typeof v !== 'object') return '';
  const raw = v.plate ?? v.plateNumber ?? v.licensePlate;
  return String(raw ?? '').trim();
}

/** Normalize API vehicle → garage / booking UI shape (single source of truth). */
function mapCustomerVehicleApiRecord(v: any) {
  return {
    _id: v._id || v.id,
    id: v._id || v.id,
    plate: resolveGarageVehiclePlate(v) || '',
    year: v.year || '',
    make: v.make || '',
    model: v.model || '',
    name: [v.year, v.make, v.model].filter(Boolean).join(' ') || v.name || '',
    color: v.color || '',
    type: v.vehicleType || v.type || '',
    transmission: v.transmission || '',
    fuelType: v.fuelType || '',
  };
}

export default function CustomerDashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredSidebarCollapsed);
  const [sidebarLabelsHidden, setSidebarLabelsHidden] = useState(getStoredSidebarCollapsed);
  const [sidebarTransitionsReady, setSidebarTransitionsReady] = useState(false);
  const sidebarTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<DashboardSection>(() => {
    const search = new URLSearchParams(location.search);
    const s = search.get('section');
    return s === 'settings'
      ? 'settings'
      : s === 'bookings'
        ? 'bookings'
        : s === 'scan' && AI_INSPECTION_HISTORY_ENABLED
          ? 'scan'
          : s === 'documents'
            ? 'documents'
            : s === 'payments'
              ? 'payments'
              : s === 'rewards'
                ? 'rewards'
                : s === 'tracker'
                  ? 'tracker'
                  : 'dashboard';
  });
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const bookingPackages = usePublishedBookingPackages();
  const bookRouteAutoOpenRef = useRef(false);
  const bookRouteModalOpenedRef = useRef(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileSubMenu, setProfileSubMenu] = useState<null | 'display' | 'help'>(null);
  const [darkMode, setDarkMode] = useState<'off' | 'on' | 'auto'>('off');
  const [compactMode, setCompactMode] = useState(false);

  // Notifications
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  // Bookings & Documents
  const [hasActiveBooking, setHasActiveBooking] = useState(false);
  const [pendingConfirmationBooking, setPendingConfirmationBooking] = useState<any>(null);
  const [approvedBooking, setApprovedBooking] = useState<any>(null);
  const [rejectedBooking, setRejectedBooking] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  /** Bumps when we mutate garage or need to ignore stale in-flight GET list responses (fixes race with initial fetch). */
  const vehiclesFetchGenRef = useRef(0);
  const [scanVehicleId, setScanVehicleId] = useState('');
  const [scanUploads, setScanUploads] = useState<ScanUpload[]>([]);
  const [scanDragActive, setScanDragActive] = useState(false);
  const scanFileInputRef = useRef<HTMLInputElement | null>(null);
  const [scanAnalyzing, setScanAnalyzing] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanActiveStep, setScanActiveStep] = useState(-1);
  const [scanComplete, setScanComplete] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanMode, setScanMode] = useState<'auto' | 'highend'>('auto');
  const scanProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // My Bookings
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [myBookingsLoading, setMyBookingsLoading] = useState(false);
  const [bookingsFilter, setBookingsFilter] = useState<'all' | 'upcoming' | 'active' | 'completed' | 'cancelled'>('all');
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  // Payment History lightbox
  const [paymentLightboxUrl, setPaymentLightboxUrl] = useState<string | null>(null);
  const [orderReceiptPdfUrl, setOrderReceiptPdfUrl] = useState<string | null>(null);
  const orderReceiptPdfUrlRef = useRef<string | null>(null);
  /** Tracker evidence photos — in-page gallery (arrow keys + prev/next). */
  const [trackerEvidenceLightbox, setTrackerEvidenceLightbox] = useState<{
    stepTitle: string;
    items: { url: string; label: string }[];
    index: number;
  } | null>(null);

  /** Prevents overlapping GET /bookings calls (poll + socket debounce) from stacking and timing out together. */
  const bookingsLoadLockRef = useRef(false);
  /** Socket-driven silent refetch — avoids full page reload; see bookings `load()` effect. */
  const loadBookingsRef = useRef<((opts?: { silent?: boolean }) => Promise<void>) | null>(null);
  const silentBookingsRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSilentBookingsRefetch = useCallback(() => {
    if (silentBookingsRefetchTimerRef.current) clearTimeout(silentBookingsRefetchTimerRef.current);
    silentBookingsRefetchTimerRef.current = setTimeout(() => {
      silentBookingsRefetchTimerRef.current = null;
      loadBookingsRef.current?.({ silent: true });
    }, 400);
  }, []);

  const closeCustomerOrderReceiptPdf = useCallback(() => {
    setOrderReceiptPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      orderReceiptPdfUrlRef.current = null;
      return null;
    });
  }, []);

  const openCustomerOrderReceiptPdf = useCallback(async (orderId: string) => {
    const t = toast.loading('Opening receipt…');
    try {
      await ensureBackendAuthToken();
      const { BillingService } = await import('../lib/billing-service');
      const blob = await BillingService.getOrderReceiptPdfBlob(orderId);
      toast.dismiss(t);
      setOrderReceiptPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        const next = URL.createObjectURL(blob);
        orderReceiptPdfUrlRef.current = next;
        return next;
      });
    } catch (e: unknown) {
      toast.dismiss(t);
      const msg = e instanceof Error ? e.message : 'Could not open receipt';
      toast.error(msg);
    }
  }, []);

  useEffect(() => {
    orderReceiptPdfUrlRef.current = orderReceiptPdfUrl;
  }, [orderReceiptPdfUrl]);

  useEffect(() => () => {
    const u = orderReceiptPdfUrlRef.current;
    if (u) URL.revokeObjectURL(u);
  }, []);

  useEffect(() => {
    if (!trackerEvidenceLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTrackerEvidenceLightbox(null);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setTrackerEvidenceLightbox((prev) => {
          if (!prev || prev.index <= 0) return prev;
          return { ...prev, index: prev.index - 1 };
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setTrackerEvidenceLightbox((prev) => {
          if (!prev || prev.index >= prev.items.length - 1) return prev;
          return { ...prev, index: prev.index + 1 };
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trackerEvidenceLightbox !== null]);

  // ── Real-time tracker updates via useLiveJobs socket ─────────────────────────
  // When QC advances a stage, the backend emits booking:status to user:${id} room.
  // When QC/POS emits status (e.g. ready_for_payment) or payment fields, merge so the tracker stays in sync between polls.
  const handleBookingStatus = useCallback((event: BookingStatusEvent) => {
    const { bookingId, serviceTrackingStage, serviceStaffAssignments, trackerStageMedia, status, paymentStatus, invoiceId } = event;
    if (!bookingId) return;
    setMyBookings((prev: any[]) =>
      prev.map((b: any) => {
        const id = String(b.id ?? b._id ?? '');
        const bid = String(bookingId ?? '');
        if (id !== bid) return b;
        return {
          ...b,
          ...(serviceTrackingStage !== undefined ? { serviceTrackingStage } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(paymentStatus !== undefined ? { paymentStatus } : {}),
          ...(invoiceId !== undefined ? { invoiceId } : {}),
          ...(serviceStaffAssignments?.length ? { serviceStaffAssignments } : {}),
          ...(trackerStageMedia !== undefined ? { trackerStageMedia } : {}),
        };
      })
    );
    invalidate('/bookings');
    scheduleSilentBookingsRefetch();
  }, [scheduleSilentBookingsRefetch]);

  // useLiveJobs manages the singleton socket, room joining, and the booking:status listener.
  // orderUpdated → same debounced silent bookings refetch (no reload).
  // onNotification fires when a notification:customer socket event arrives — prepend to bell list.
  const handleIncomingNotification = useCallback((notif: any) => {
    if (!notif || !notif.id) return;
    setNotifications((prev: any[]) => {
      // Avoid duplicates if the server emits more than once
      if (prev.some((n: any) => n.id === notif.id || n._id === notif.id)) return prev;
      return [{ ...notif, isRead: false }, ...prev];
    });
  }, []);
  useLiveJobs(user, handleBookingStatus, handleIncomingNotification, scheduleSilentBookingsRefetch);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => setSidebarTransitionsReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? 'true' : 'false');
    } catch {
      // localStorage can be unavailable in private or restricted contexts.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    return () => {
      if (sidebarTransitionTimerRef.current) clearTimeout(sidebarTransitionTimerRef.current);
    };
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    if (sidebarTransitionTimerRef.current) clearTimeout(sidebarTransitionTimerRef.current);

    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      sidebarTransitionTimerRef.current = setTimeout(() => {
        setSidebarLabelsHidden(false);
        sidebarTransitionTimerRef.current = null;
      }, 250);
      return;
    }

    setSidebarLabelsHidden(true);
    sidebarTransitionTimerRef.current = setTimeout(() => {
      setSidebarCollapsed(true);
      sidebarTransitionTimerRef.current = null;
    }, 150);
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (vehicles.length === 0) {
      setScanVehicleId('');
      return;
    }

    setScanVehicleId((current) => {
      if (current && vehicles.some((vehicle) => (vehicle._id || vehicle.id) === current)) {
        return current;
      }
      return vehicles[0]?._id || vehicles[0]?.id || '';
    });
  }, [vehicles]);

  useEffect(() => () => {
    scanUploads.forEach((upload) => URL.revokeObjectURL(upload.preview));
  }, [scanUploads]);

  useEffect(() => () => {
    if (scanProgressIntervalRef.current) {
      clearInterval(scanProgressIntervalRef.current);
      scanProgressIntervalRef.current = null;
    }
    scanTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    scanTimeoutsRef.current = [];
  }, []);

  // ── Customer Stats (fetched from backend) ──
  const [customerStats, setCustomerStats] = useState({
    currentStatus: '' as string,
    nextAppointment: '' as string,
    lastService: '' as string,
    loyaltyPoints: 0,
  });

  useEffect(() => {
    if (!user) return;

    const myOrders = [...myBookings].sort(
      (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    const norm = (s: unknown) => String(s || '').toLowerCase();

    const activeStatuses = ['in-progress', 'assigned', 'checked-in', 'processing', 'confirmed', 'approved', 'in_progress', 'received', 'completed', 'ready_for_payment'];
    const activeOrder = myOrders.find((o: any) => {
      if (String(o?.paymentStatus || '').toLowerCase() === 'paid') return false;
      return activeStatuses.includes(norm(o.status));
    });
    let currentStatus = '';
    if (activeOrder) {
      const statusMap: Record<string, string> = {
        'in-progress': 'In Shop — In Progress', 'in_progress': 'In Shop — In Progress',
        'assigned': 'Assigned — Waiting', 'checked-in': 'Checked In',
        'processing': 'Processing', 'confirmed': 'Confirmed — Scheduled',
        'approved': 'Approved — Scheduled', 'received': 'Vehicle Received',
        'ready_for_payment': 'Balance due at shop',
        'completed': 'Ready for Pickup ✓',
      };
      currentStatus = statusMap[norm(activeOrder.status)] || activeOrder.status;
      if (activeOrder.serviceName && activeOrder.serviceName !== 'Service') {
        currentStatus = `In Shop — ${activeOrder.serviceName}`;
      }
    }

    const upcomingStatuses = ['pending_confirmation', 'pending', 'confirmed', 'approved', 'assigned'];
    const upcoming = myOrders
      .filter((o: any) => upcomingStatuses.includes(norm(o.status)) && (o.date || o.bookingDate))
      .sort((a: any, b: any) => new Date(a.date || a.bookingDate).getTime() - new Date(b.date || b.bookingDate).getTime());
    let nextAppointment = '';
    if (upcoming.length > 0) {
      const d = new Date(upcoming[0].date || upcoming[0].bookingDate);
      const timeStr = upcoming[0].time || upcoming[0].bookingTime || '';
      nextAppointment = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${timeStr ? `, ${timeStr}` : ''}`;
    }

    const doneStatuses = ['completed', 'released', 'done', 'delivered'];
    const completed = myOrders
      .filter((o: any) => doneStatuses.includes(norm(o.status)))
      .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    let lastService = '';
    if (completed.length > 0) {
      const ls = completed[0];
      const dateStr = new Date(ls.updatedAt || ls.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      lastService = `${ls.serviceName || 'Service'} (${dateStr})`;
    }

    const loyaltyPoints = completed.length * 50;

    const trackerOrder = pickCustomerLiveTrackerBooking(myBookings);
    setHasActiveBooking(!!trackerOrder);

    const approvedOrder = myOrders.find((o: any) => ['approved', 'confirmed', 'assigned'].includes(norm(o.status)));
    setApprovedBooking(approvedOrder || null);

    // Pending GCash: show only when nothing is on the live tracker path yet (same gate as approved/rejected cards).
    const pendingOrder = myOrders.find((o: any) => norm(o.status) === 'pending_confirmation');
    setPendingConfirmationBooking(pendingOrder || null);

    const mostRecent = myOrders[0];
    const rejected = norm(mostRecent?.status) === 'rejected' ? mostRecent : null;
    setRejectedBooking(rejected);

    setCustomerStats({ currentStatus, nextAppointment, lastService, loyaltyPoints });
  }, [myBookings, user]);

  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ plate: '', year: '', brand: '', model: '', color: '', type: '', transmission: '', fuelType: '' });
  const [newVehicleShowColorInput, setNewVehicleShowColorInput] = useState(false);
  const [vehicleErrors, setVehicleErrors] = useState<Record<string, string>>({});
  const [vehicleApiError, setVehicleApiError] = useState('');
  // Booking Modal
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);
  const [bookingVehicleType, setBookingVehicleType] = useState<string>('hatchback');
  const [bookingSelectedVehicleIdx, setBookingSelectedVehicleIdx] = useState<number>(-1);
  const [bookingAgreed, setBookingAgreed] = useState(false);
  const [bookingTermsReachedEnd, setBookingTermsReachedEnd] = useState(false);
  const [bookingDownpaymentProof, setBookingDownpaymentProof] = useState<string | null>(null);
  // True when booking was opened from a garage vehicle card (pre-filled, read-only vehicle fields)
  const [bookingFromVehicle, setBookingFromVehicle] = useState(false);
  const bookingBodyRef = useRef<HTMLDivElement | null>(null);
  const packageListRef = useRef<HTMLDivElement | null>(null);
  const packageCardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const packagePeekFrameRef = useRef<number | null>(null);
  const [packagePeek, setPackagePeek] = useState({
    visible: false,
    remaining: 0,
    left: 0,
    top: 0,
    width: 0,
  });

  // Vehicle History Modal
  const [vehicleHistoryOpen, setVehicleHistoryOpen] = useState(false);
  const [vehicleHistoryVehicle, setVehicleHistoryVehicle] = useState<any>(null);
  const [vehicleHistoryOrders, setVehicleHistoryOrders] = useState<any[]>([]);
  const [vehicleHistoryLoading, setVehicleHistoryLoading] = useState(false);
  // Edit Vehicle Modal
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);
  const [editVehicleIndex, setEditVehicleIndex] = useState<number>(-1);
  const [editVehicleForm, setEditVehicleForm] = useState({
    plate: '', brand: '', model: '', year: '', color: '', type: '', transmission: '', fuelType: '',
  });
  const [editVehicleShowColorInput, setEditVehicleShowColorInput] = useState(false);
  const [editVehicleErrors, setEditVehicleErrors] = useState<Record<string, string>>({});
  const [editVehicleApiError, setEditVehicleApiError] = useState('');
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number>(-1);

  const fetchVehiclesAndApply = useCallback(async (expectedGen: number): Promise<boolean> => {
    try {
      const { VehicleService } = await import('../lib/vehicle-service');
      const res = await VehicleService.getVehicles();
      if (expectedGen !== vehiclesFetchGenRef.current) return false;
      if (res.success && Array.isArray(res.data)) {
        const mapped = res.data.map(mapCustomerVehicleApiRecord);
        setVehicles(mapped);
        if (mapped.length === 0) setShowOnboarding(true);
        return true;
      }
    } catch (err) {
      console.warn('[Garage] Failed to fetch vehicles:', err);
    }
    return false;
  }, []);

  const refetchVehiclesAfterMutation = useCallback(async (): Promise<boolean> => {
    vehiclesFetchGenRef.current += 1;
    const gen = vehiclesFetchGenRef.current;
    invalidate('/customers/vehicles');
    return fetchVehiclesAndApply(gen);
  }, [fetchVehiclesAndApply]);

  const vehicleOwnerId = user?._id ?? user?.id ?? '';

  useEffect(() => {
    if (!vehicleOwnerId) return;
    vehiclesFetchGenRef.current += 1;
    const gen = vehiclesFetchGenRef.current;
    void fetchVehiclesAndApply(gen);
  }, [vehicleOwnerId, fetchVehiclesAndApply]);

  const openEditVehicle = (v: any, idx: number) => {
    setEditVehicleIndex(idx);
    const rawColor = (v.color || '').trim();
    const presetMatch = EDIT_VEHICLE_COLOR_PRESETS.find(c => c.toLowerCase() === rawColor.toLowerCase());
    setEditVehicleShowColorInput(Boolean(rawColor && !presetMatch));
    setEditVehicleForm({
      plate: v.plate || '',
      brand: (v.make || '').trim(),
      model: (v.model || '').trim(),
      year: v.year != null && v.year !== '' ? String(v.year) : '',
      color: presetMatch || rawColor,
      type: (v.type || '').trim(),
      transmission: (v.transmission || '').trim(),
      fuelType: (v.fuelType || '').trim(),
    });
    setEditVehicleErrors({});
    setEditVehicleApiError('');
    setEditVehicleOpen(true);
  };
  const saveEditVehicle = async () => {
    const errors = validateVehicleGarageForm(editVehicleForm);
    if (Object.keys(errors).length > 0) {
      setEditVehicleErrors(errors);
      return;
    }
    const plateRaw = editVehicleForm.plate.trim();
    const plateNorm = normalizePlateNumber(plateRaw);
    const brand = editVehicleForm.brand.trim();
    const model = editVehicleForm.model.trim();
    const type = editVehicleForm.type.trim();
    const targetVehicle = vehicles[editVehicleIndex];
    const vehicleId = targetVehicle?._id || targetVehicle?.id;
    setEditVehicleApiError('');
    try {
      const { VehicleService } = await import('../lib/vehicle-service');
      const res = await VehicleService.updateVehicle(vehicleId, {
        plateNumber: plateNorm,
        year: editVehicleForm.year || '',
        make: brand,
        model,
        color: editVehicleForm.color.trim() || 'Unknown',
        vehicleType: type,
        transmission: editVehicleForm.transmission || '',
        fuelType: editVehicleForm.fuelType || '',
      });
      if (!res.success) {
        setEditVehicleApiError(res.message || 'Failed to update vehicle.');
        return;
      }
    } catch (err: any) {
      setEditVehicleApiError(err?.response?.data?.message || 'Failed to update. Please check your details.');
      return;
    }
    await refetchVehiclesAfterMutation();
    setEditVehicleOpen(false);
    setEditVehicleApiError('');
  };

  const deleteVehicle = async (idx: number) => {
    const target = vehicles[idx];
    const vehicleId = target?._id || target?.id;
    try {
      const { VehicleService } = await import('../lib/vehicle-service');
      const res = await VehicleService.deleteVehicle(vehicleId);
      if (!res.success) {
        alert(res.message || 'Failed to delete vehicle.');
        return;
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete vehicle.');
      return;
    }
    await refetchVehiclesAfterMutation();
    setDeleteConfirmIdx(-1);
  };
  const [bookingForm, setBookingForm] = useState({
    service: '', serviceName: '', servicePrice: 0,
    vehicleMake: '', vehicleModel: '', vehicleYear: '', vehicleColor: '', vehiclePlate: '',
    vehicleCategory: '', vehicleTransmission: '', vehicleFuelType: '',
    contactNo: '',
    date: '', time: '', notes: '',
  });

  const setPackagePeekHidden = useCallback(() => {
    setPackagePeek((prev) => (
      prev.visible || prev.remaining
        ? { ...prev, visible: false, remaining: 0 }
        : prev
    ));
  }, []);

  const updatePackagePeek = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (packagePeekFrameRef.current !== null) return;

    packagePeekFrameRef.current = window.requestAnimationFrame(() => {
      packagePeekFrameRef.current = null;

      const body = bookingBodyRef.current;
      const list = packageListRef.current;
      const cards = packageCardRefs.current.slice(0, bookingPackages.length);

      if (!bookingOpen || bookingDone || bookingStep !== 1 || !body || !list || cards.length <= 1) {
        setPackagePeekHidden();
        return;
      }

      const bodyRect = body.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const bodyBottom = Math.min(bodyRect.bottom, window.innerHeight);
      const listIsInView = listRect.top < bodyBottom - 48 && listRect.bottom > bodyRect.top + 24;
      const listHasMoreBelow = listRect.bottom > bodyBottom + 8;

      if (!listIsInView || !listHasMoreBelow) {
        setPackagePeekHidden();
        return;
      }

      const visibleBoundary = bodyBottom - 64;
      let lastVisiblePackageIndex = -1;

      cards.forEach((card, index) => {
        if (!card) return;
        const rect = card.getBoundingClientRect();
        if (rect.top < visibleBoundary && rect.bottom > bodyRect.top) {
          lastVisiblePackageIndex = index;
        }
      });

      const remaining = Math.max(0, bookingPackages.length - lastVisiblePackageIndex - 1);
      if (remaining <= 0) {
        setPackagePeekHidden();
        return;
      }

      const next = {
        visible: true,
        remaining,
        left: bodyRect.left,
        top: bodyBottom - 76,
        width: bodyRect.width,
      };

      setPackagePeek((prev) => (
        prev.visible === next.visible &&
        prev.remaining === next.remaining &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5
          ? prev
          : next
      ));
    });
  }, [bookingDone, bookingOpen, bookingPackages.length, bookingStep, setPackagePeekHidden]);

  useLayoutEffect(() => {
    if (!bookingOpen || bookingDone || bookingStep !== 1) {
      setPackagePeekHidden();
      return;
    }

    const body = bookingBodyRef.current;
    if (!body) return;

    updatePackagePeek();
    body.addEventListener('scroll', updatePackagePeek, { passive: true });
    window.addEventListener('resize', updatePackagePeek);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updatePackagePeek)
      : null;
    resizeObserver?.observe(body);
    if (packageListRef.current) resizeObserver?.observe(packageListRef.current);

    return () => {
      body.removeEventListener('scroll', updatePackagePeek);
      window.removeEventListener('resize', updatePackagePeek);
      resizeObserver?.disconnect();
      if (packagePeekFrameRef.current !== null) {
        window.cancelAnimationFrame(packagePeekFrameRef.current);
        packagePeekFrameRef.current = null;
      }
    };
  }, [bookingDone, bookingForm.service, bookingOpen, bookingStep, updatePackagePeek, setPackagePeekHidden]);

  const BOOKING_TIMES = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

  const [bookingCalMonth, setBookingCalMonth] = useState(() => {
    const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  // Raw booked strings kept for monthAvailability logic
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});
  // Structured per-slot statuses for the selected date
  type SlotStatus = 'AVAILABLE' | 'FULL' | 'CLOSED';
  type TimeSlot = { time: string; label?: string; status: SlotStatus };
  type DayAvailabilityStatus = 'available' | 'full' | 'closed';
  type AvailableSlotsPayload = {
    success?: boolean;
    bookedSlots?: string[];
    slots?: {
      time?: string;
      label?: string;
      status?: string;
      available?: number;
      booked?: number;
      capacity?: number;
    }[];
    unavailable?: boolean;
    errorCode?: string | null;
    message?: string | null;
    error?: string | null;
    remaining?: number | null;
  };
  type DayAvailabilityInfo = {
    status: DayAvailabilityStatus;
    unavailable: boolean;
    reason: string;
    errorCode: string | null;
    remaining: number | null;
  };
  const [slotStatuses, setSlotStatuses] = useState<TimeSlot[]>([]);
  const [slotError, setSlotError] = useState<string>('');
  const [monthAvailability, setMonthAvailability] = useState<Record<string, DayAvailabilityInfo>>({});
  const [monthAvailLoading, setMonthAvailLoading] = useState(false);

  const parseAvailableSlotsPayload = (payload: AvailableSlotsPayload): {
    unavailable: boolean;
    errorCode: string | null;
    message: string;
    remaining: number | null;
    bookedSlots: string[];
    slots: NonNullable<AvailableSlotsPayload['slots']>;
  } => {
    const bookedSlots = Array.isArray(payload?.bookedSlots) ? payload.bookedSlots : [];
    const slots = Array.isArray(payload?.slots) ? payload.slots : [];
    const unavailable = !!payload?.unavailable;
    const errorCode = typeof payload?.errorCode === 'string' ? payload.errorCode : null;
    const message = (payload?.message || payload?.error || '').toString().trim();
    const remaining = typeof payload?.remaining === 'number' ? payload.remaining : null;
    return { unavailable, errorCode, message, remaining, bookedSlots, slots };
  };

  const normalizeBookingTimeKey = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const twentyFour = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFour) {
      return `${String(Number(twentyFour[1])).padStart(2, '0')}:${twentyFour[2]}`;
    }
    const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!twelveHour) return raw.toLowerCase();
    let hour = Number(twelveHour[1]);
    const minute = twelveHour[2];
    const period = twelveHour[3].toUpperCase();
    if (period === 'AM' && hour === 12) hour = 0;
    if (period === 'PM' && hour !== 12) hour += 12;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  };

  const openBookingModal = async (preSelectedVehicle?: any, options?: { presetPackageId?: string }) => {
    setBookingOpen(true); setBookingStep(1); setBookingDone(false);
    setBookingAgreed(false); setBookingTermsReachedEnd(false); setBookingDownpaymentProof(null);
    setSlotStatuses([]); setBookedSlots([]); setSlotError(''); setMonthAvailability({});
    const targetVehicle = preSelectedVehicle || vehicles[0];
    const detectedKey = targetVehicle ? getVehiclePriceKey(targetVehicle.type) : 'hatchback';
    setBookingVehicleType(detectedKey);
    // Use ID-based lookup — reference equality (indexOf) can fail if array was recreated
    const targetId = targetVehicle?._id || targetVehicle?.id;
    const targetIdx = targetId
      ? vehicles.findIndex(v => (v._id || v.id) === targetId)
      : targetVehicle ? 0 : -1;
    setBookingSelectedVehicleIdx(targetIdx);
    // Track whether booking was opened FROM a vehicle card (pre-fills & locks vehicle fields)
    setBookingFromVehicle(!!preSelectedVehicle);
    const presetPkg = options?.presetPackageId
      ? bookingPackages.find((p) => p.id === options.presetPackageId)
      : undefined;
    const presetPrice =
      presetPkg && detectedKey in presetPkg.prices
        ? presetPkg.prices[detectedKey as keyof typeof presetPkg.prices] ?? 0
        : 0;
    const presetAvailable = !presetPkg || presetPrice > 0;
    setBookingForm({
      service: presetAvailable ? presetPkg?.id || '' : '',
      serviceName: presetAvailable ? presetPkg?.name || '' : '',
      servicePrice: presetPrice,
      // Populate individual vehicle fields from the garage record
      vehicleMake: targetVehicle ? (targetVehicle.make || '') : '',
      vehicleModel: targetVehicle ? (targetVehicle.model || '') : '',
      vehicleYear: targetVehicle ? (targetVehicle.year || '') : '',
      vehicleColor: targetVehicle ? (targetVehicle.color || '') : '',
      vehiclePlate: targetVehicle ? resolveGarageVehiclePlate(targetVehicle) : '',
      vehicleCategory: targetVehicle ? (targetVehicle.type || '') : '',
      vehicleTransmission: targetVehicle ? (targetVehicle.transmission || '') : '',
      vehicleFuelType: targetVehicle ? (targetVehicle.fuelType || '') : '',
      contactNo: formatContactNoInputFromProfile(profile.phone || (user as any)?.phone || ''),
      date: '', time: '', notes: '',
    });
  };

  const bookingPrevStepRef = useRef(bookingStep);
  const bookingTcScrollRef = useRef<HTMLDivElement | null>(null);

  /** Step 5 T&C: reset agreement when (re)entering; if content fits without scrolling, treat as “read”. */
  useLayoutEffect(() => {
    const prev = bookingPrevStepRef.current;
    bookingPrevStepRef.current = bookingStep;
    if (bookingStep !== 5) return;

    const el = bookingTcScrollRef.current;
    if (prev !== 5) {
      setBookingTermsReachedEnd(false);
      setBookingAgreed(false);
    }

    const measureBottom = () => {
      if (!el) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight <= 28) setBookingTermsReachedEnd(true);
    };

    const id = requestAnimationFrame(measureBottom);
    let ro: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measureBottom);
      ro.observe(el);
    }
    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
    };
  }, [bookingStep]);

  const fetchSlotsForDate = async (dateIso: string, currentSelectedTime?: string) => {
    if (!dateIso) return;
    setSlotsLoading(true);
    setSlotError('');
    try {
      const slotHeaders: HeadersInit = { Accept: 'application/json' };
      const slotToken = getStoredAuthToken();
      if (slotToken) slotHeaders.Authorization = `Bearer ${slotToken}`;
      const res = await fetch(`/api/orders/available-slots?date=${dateIso}`, {
        headers: slotHeaders,
      });
      const data = await res.json();
      const {
        unavailable,
        errorCode,
        message: availabilityMessage,
        remaining,
        bookedSlots: apiBooked,
        slots: apiSlots,
      } = parseAvailableSlotsPayload(data);
      setBookedSlots(apiBooked);

      if (unavailable && availabilityMessage) {
        setSlotError(availabilityMessage);
      }

      // Derive AVAILABLE / FULL / CLOSED for every slot
      const now = new Date();
      const isToday = dateIso === now.toISOString().split('T')[0];
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();

      const parseHour = (t: string) => {
        const [time, period] = t.split(' ');
        let [h] = time.split(':').map(Number);
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h;
      };

      const deriveStatusFromApiSlot = (slot: NonNullable<AvailableSlotsPayload['slots']>[number]): SlotStatus => {
        if (unavailable && errorCode !== 'DATE_FULL') return 'CLOSED';
        if (String(slot.status || '').toUpperCase() === 'FULL' || Number(slot.available ?? 0) <= 0) {
          return 'FULL';
        }
        if (isToday) {
          const slotHour = parseHour(String(slot.label || slot.time || ''));
          const isPastSlot = slotHour < currentHour || (slotHour === currentHour && currentMin >= 0);
          if (isPastSlot) return 'CLOSED';
        }
        return 'AVAILABLE';
      };

      const derived: TimeSlot[] = apiSlots.length > 0
        ? apiSlots
          .reduce<TimeSlot[]>((rows, slot) => {
            const displayTime = String(slot.label || slot.time || '').trim();
            if (!displayTime) return rows;
            rows.push({
              time: displayTime,
              label: displayTime,
              status: deriveStatusFromApiSlot(slot),
            });
            return rows;
          }, [])
        : BOOKING_TIMES.map((t) => {
          if (unavailable) {
            const status: SlotStatus = errorCode === 'DATE_FULL' ? 'FULL' : 'CLOSED';
            return { time: t, status };
          }
          if (typeof remaining === 'number' && remaining <= 0) {
            return { time: t, status: 'FULL' as SlotStatus };
          }
          if (apiBooked.some((booked) => normalizeBookingTimeKey(booked) === normalizeBookingTimeKey(t))) {
            return { time: t, status: 'FULL' as SlotStatus };
          }
          if (isToday) {
            const slotHour = parseHour(t);
            const isPastSlot = slotHour < currentHour || (slotHour === currentHour && currentMin >= 0);
            if (isPastSlot) return { time: t, status: 'CLOSED' as SlotStatus };
          }
          return { time: t, status: 'AVAILABLE' as SlotStatus };
        });
      setSlotStatuses(derived);

      // Check if the currently selected time became unavailable
      if (currentSelectedTime) {
        const nowStatus = derived.find(
          s => normalizeBookingTimeKey(s.time) === normalizeBookingTimeKey(currentSelectedTime)
        )?.status;
        if (nowStatus && nowStatus !== 'AVAILABLE') {
          const msg = `"${currentSelectedTime}" is no longer available. Please select another time.`;
          setSlotError(msg);
          setBookingForm(f => ({ ...f, time: '' }));
          toast.warning('Time slot unavailable', { description: msg, duration: 4000 });
        }
      }
    } catch {
      setBookedSlots([]);
      setSlotStatuses(BOOKING_TIMES.map(t => ({ time: t, status: 'AVAILABLE' as SlotStatus })));
      toast.warning('Could not load time slots', {
        description: 'Slots may not reflect live availability. Please try again.',
        duration: 4000,
      });
    } finally {
      setSlotsLoading(false);
    }
  };

  const fetchMonthAvailability = async (year: number, month: number) => {
    setMonthAvailLoading(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const token = getStoredAuthToken();
    const result: Record<string, DayAvailabilityInfo> = {};

    // Build list of dates to fetch. Backend owns recurring closures/weekend rules.
    const datesToFetch: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isPast = date < today;
      if (isPast) {
        result[iso] = {
          status: 'closed',
          unavailable: true,
          errorCode: 'PAST_DATE',
          reason: 'Past date is no longer available for booking.',
          remaining: 0,
        };
      } else {
        datesToFetch.push(iso);
      }
    }

    // Parallel fetch for all workday dates
    try {
      await Promise.all(datesToFetch.map(async (iso) => {
        try {
          const monthHeaders: HeadersInit = { Accept: 'application/json' };
          if (token) monthHeaders.Authorization = `Bearer ${token}`;
          const res = await fetch(`/api/orders/available-slots?date=${iso}`, {
            headers: monthHeaders,
          });
          const data = await res.json();
          const {
            unavailable,
            errorCode,
            message: availabilityMessage,
            remaining,
            bookedSlots: booked,
            slots: apiSlots,
          } = parseAvailableSlotsPayload(data);

          let status: DayAvailabilityStatus = 'available';
          if (unavailable) {
            status = errorCode === 'DATE_FULL' ? 'full' : 'closed';
          } else if (
            (apiSlots.length > 0 && apiSlots.every((slot) => String(slot.status || '').toUpperCase() === 'FULL' || Number(slot.available ?? 0) <= 0)) ||
            (apiSlots.length === 0 && ((typeof remaining === 'number' && remaining <= 0) || booked.length >= BOOKING_TIMES.length))
          ) {
            status = 'full';
          }

          const fallbackReason =
            status === 'full'
              ? 'All booking slots for this date are fully booked.'
              : status === 'closed'
                ? 'This date is not available for booking.'
                : '';

          result[iso] = {
            status,
            unavailable: unavailable || status !== 'available',
            errorCode: errorCode || (status === 'full' ? 'DATE_FULL' : status === 'closed' ? 'DATE_UNAVAILABLE' : null),
            reason: availabilityMessage || fallbackReason,
            remaining,
          };
        } catch {
          result[iso] = {
            status: 'available',
            unavailable: false,
            errorCode: null,
            reason: '',
            remaining: null,
          };
        }
      }));
    } finally {
      setMonthAvailability(result);
      setMonthAvailLoading(false);
    }
  };

  const openVehicleHistory = async (v: any) => {
    setVehicleHistoryVehicle(v);
    setVehicleHistoryOpen(true);
    setVehicleHistoryLoading(true);
    setVehicleHistoryOrders([]);
    try {
      const { OrderService } = await import('../lib/order-service');
      const res = await OrderService.getAllOrders({ suppressErrorToast: true });
      if (res.success && Array.isArray(res.data)) {
        const myOrders = res.data.filter((o: any) => {
          const custId = o.customerId || o.customer?._id || o.customer;
          const isMine = custId === user?.id || custId === user?._id || o.customerName === user?.name;
          const matchesPlate =
            v.plate &&
            normalizePlateNumber(String(o.vehiclePlate || '')) === normalizePlateNumber(String(v.plate));
          return isMine && (matchesPlate || !v.plate);
        });
        setVehicleHistoryOrders(myOrders.sort((a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        ));
      }
    } catch (err) {
      console.warn('[VehicleHistory] Failed to fetch:', err);
    }
    setVehicleHistoryLoading(false);
  };
  const submitBooking = async () => {
    if (!user) return;
    setBookingSubmitting(true);
    const loadingId = toast.loading('Submitting your booking…');
    try {
      const { OrderService } = await import('../lib/order-service');
      const garageForSubmit =
        bookingSelectedVehicleIdx >= 0 && bookingSelectedVehicleIdx < vehicles.length
          ? vehicles[bookingSelectedVehicleIdx]
          : undefined;
      const plateForSubmit = normalizePlateNumber(
        (bookingForm.vehiclePlate || '').trim() || resolveGarageVehiclePlate(garageForSubmit) || ''
      );
      const payload = {
        customer: user.id,
        customerName: user.name || '',
        customerPhone: (() => {
          const raw = (bookingForm.contactNo || '').trim().replace(/\s/g, '');
          if (!raw) return '';
          if (isValidPhilippineBookingContact(bookingForm.contactNo || '')) {
            return normalizePhilippineMobileForBooking(bookingForm.contactNo || '');
          }
          return raw;
        })(),
        vehicleYear: bookingForm.vehicleYear, vehicleMake: bookingForm.vehicleMake,
        vehicleModel: bookingForm.vehicleModel, vehicleColor: bookingForm.vehicleColor,
        vehiclePlate: plateForSubmit,
        price: bookingForm.servicePrice, bookingDate: bookingForm.date,
        bookingTime: bookingForm.time, notes: bookingForm.notes,
        // Catalog package IDs (spf80, …) are NOT Mongo product IDs — backend needs serviceType
        // to use the custom-package path (items without Product refs). See order.controller createOrder.
        serviceType: bookingForm.serviceName || '',
        serviceName: bookingForm.serviceName || '',
        items: JSON.stringify([{ product: bookingForm.service, quantity: 1, price: bookingForm.servicePrice }]),
        // GCash proof — single field keeps JSON body small (backend copies to paymentProofUrl if needed)
        downpaymentProof: bookingDownpaymentProof || undefined,
      };
      const res = await OrderService.createOrder(payload);

      if (res?.success) {
        toast.dismiss(loadingId);
        toast.success('Booking submitted! 📩', {
          description: res.data?.bookingReference
            ? `Ref: ${res.data.bookingReference} — Your GCash payment is being reviewed. We'll confirm within 1–3 minutes.`
            : 'Booking submitted! Our team will verify your payment shortly.',
          duration: 7000,
        });
        setBookingDone(true);
        invalidate('/bookings');
        const created = res.data as any;
        if (created) {
          setMyBookings((prev) => {
            const id = created.id || created._id;
            const idStr = id != null ? String(id) : '';
            const next = prev.filter((b: any) => String(b.id || b._id || '') !== idStr);
            return [created, ...next];
          });
          if (created.status === 'pending_confirmation') {
            setPendingConfirmationBooking(created);
          }
        }

      } else if (res?.status === 409 || res?.errorCode || res?.error) {
        const serverMsg = res?.message || res?.error || 'This booking date is no longer available.';
        toast.dismiss(loadingId);
        toast.error('Booking unavailable', { description: serverMsg, duration: 5000 });
        setSlotError(serverMsg);
        setBookingForm(f => ({ ...f, time: '' }));
        if (bookingForm.date) fetchSlotsForDate(bookingForm.date);
        setBookingStep(3);
      } else {
        toast.dismiss(loadingId);
        toast.error('Booking failed', {
          description: res?.message || 'Something went wrong. Please try again.',
          duration: 5000,
        });
      }
    } catch (e: any) {
      toast.dismiss(loadingId);
      const serverData = e?.response?.data || {};
      const msg = serverData?.message || serverData?.error || e?.message || '';
      const errorCode = serverData?.errorCode;
      if (e?.response?.status === 409 || errorCode || serverData?.unavailable) {
        toast.error('Booking unavailable', {
          description: msg || 'Please select a different date or time.',
          duration: 5000,
        });
        setSlotError(msg || 'This booking date is no longer available. Please select another schedule.');
        setBookingForm(f => ({ ...f, time: '' }));
        if (bookingForm.date) fetchSlotsForDate(bookingForm.date);
        setBookingStep(3);
      } else {
        toast.error('Booking failed', {
          description: msg || 'An unexpected error occurred. Please try again.',
          duration: 5000,
        });
        console.error('[submitBooking]', e);
      }
    } finally {
      setBookingSubmitting(false);
    }
  };


  const handleAddVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateVehicleGarageForm(newVehicle);
    if (Object.keys(errors).length > 0) {
      setVehicleErrors(errors);
      return;
    }

    const plate = newVehicle.plate.trim();
    const plateNorm = normalizePlateNumber(plate);
    const brand = newVehicle.brand.trim();
    const model = newVehicle.model.trim();
    setVehicleApiError('');
    const displayName = [newVehicle.year, brand, model].filter(Boolean).join(' ');
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticVehicle = {
      _id: optimisticId,
      id: optimisticId,
      _optimistic: true,
      plate: plateNorm,
      year: newVehicle.year || '',
      make: brand,
      model,
      name: displayName,
      color: newVehicle.color.trim() || 'Unknown',
      type: newVehicle.type || '',
      transmission: newVehicle.transmission || '',
      fuelType: newVehicle.fuelType || '',
    };

    vehiclesFetchGenRef.current += 1;
    setVehicles(prev => [...prev, optimisticVehicle]);

    try {
      const jwt = await ensureBackendAuthToken();
      if (!jwt) {
        setVehicles((prev) => prev.filter((v) => v.id !== optimisticId));
        setVehicleApiError(
          'Could not verify your login with the server. Please sign out and sign in again, then add your vehicle.',
        );
        return;
      }
      const { VehicleService } = await import('../lib/vehicle-service');
      const res = await VehicleService.addVehicle({
        plateNumber: plateNorm,
        year: newVehicle.year || '',
        make: brand,
        model,
        color: newVehicle.color.trim() || 'Unknown',
        vehicleType: newVehicle.type || '',
        transmission: newVehicle.transmission || '',
        fuelType: newVehicle.fuelType || '',
      });
      if (res.success && res.data) {
        const refreshed = await refetchVehiclesAfterMutation();
        if (!refreshed) {
          setVehicles(prev => {
            const rest = prev.filter(v => v.id !== optimisticId);
            const merged = mapCustomerVehicleApiRecord(res.data);
            const mid = merged._id || merged.id;
            if (!mid || rest.some(x => String(x._id || x.id) === String(mid))) return rest;
            return [...rest, merged];
          });
        }
        setAddVehicleOpen(false);
        setNewVehicle({ plate: '', year: '', brand: '', model: '', color: '', type: '', transmission: '', fuelType: '' });
        setNewVehicleShowColorInput(false);
        setVehicleErrors({});
        setVehicleApiError('');
      } else {
        setVehicles(prev => prev.filter(v => v.id !== optimisticId));
        setVehicleApiError(res.message || 'Failed to add vehicle. Please try again.');
      }
    } catch (err: any) {
      setVehicles(prev => prev.filter(v => v.id !== optimisticId));
      setVehicleApiError(err?.response?.data?.message || 'Failed to add vehicle. Please check your details.');
    }
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      setNotificationsLoading(true);
      const res = await NotificationService.getNotifications();
      if (res.success) {
        // Validation: Ensure it's an array, or fallback to empty array
        setNotifications(Array.isArray(res.data) ? res.data : []);
      }
      setNotificationsLoading(false);
    };
    fetchNotifications();
  }, []);

  // Feedback
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackHover, setFeedbackHover] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackVehicle, setFeedbackVehicle] = useState('Tesla Model 3');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState(false);
  const [rewardRedeemMessage, setRewardRedeemMessage] = useState('');

  // Settings — Profile
  const [profile, setProfile] = useState({
    fullName: user?.name || '',
    email: user?.email || '',
    phone: formatContactNoInputFromProfile((user as any)?.phone || ''),
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile(p => ({
        ...p,
        fullName: user.name || '',
        email: user.email || '',
        phone: formatContactNoInputFromProfile((user as any).phone) || formatContactNoInputFromProfile(p.phone) || p.phone,
      }));
    }
  }, [user]);

  // Booking Step 2: keep Contact No. in sync when auth/profile gains a phone after modal opened (or field still empty).
  useEffect(() => {
    if (!bookingOpen || !user) return;
    const pref = formatContactNoInputFromProfile(profile.phone || (user as any)?.phone || '');
    if (!pref.trim()) return;
    setBookingForm(f => {
      if ((f.contactNo || '').trim()) return f;
      return { ...f, contactNo: pref };
    });
  }, [bookingOpen, user, profile.phone]);

  // Settings — Password
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [showPass, setShowPass] = useState({ current: false, newPass: false, confirm: false });

  // Settings — Notifications
  const [notifs, setNotifs] = useState({ bookingUpdates: true, serviceStatus: true, promotions: false, reminders: true });

  function validateProfile() {
    const errs: Record<string, string> = {};
    if (!(profile.fullName || '').trim() || (profile.fullName || '').trim().length < 2) errs.fullName = 'Full name must be at least 2 characters.';
    if (!(profile.phone || '').trim() || !isValidPhilippineMobileInput(profile.phone || '')) errs.phone = 'Enter 09XXXXXXXXX or +639XXXXXXXXX.';
    setProfileErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validateProfile()) return;

    if (!user) {
      logout();
      navigate('/login');
      return;
    }

    try {
      const result = await updateUser({
        ...user,
        name: profile.fullName,
        email: profile.email,
        phone: profile.phone,
      });

      if (result.success && !result.offline) {
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 3000);
      } else if (result.offline) {
        setProfileErrors({ form: 'Changes saved locally but failed to sync with server. Please try again.' });
      } else {
        setProfileErrors({ form: result.message || 'Failed to update profile' });
      }
    } catch (err) {
      setProfileErrors({ form: 'An error occurred while saving.' });
    }
  }

  function validatePasswords() {
    const errs: Record<string, string> = {};
    if (!passwords.current) errs.current = 'Current password is required.';
    if (!passwords.newPass || passwords.newPass.length < 8) errs.newPass = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(passwords.newPass)) errs.newPass = 'Must contain at least one uppercase letter.';
    else if (!/[a-z]/.test(passwords.newPass)) errs.newPass = 'Must contain at least one lowercase letter.';
    else if (!/[0-9]/.test(passwords.newPass)) errs.newPass = 'Must contain at least one number.';
    else if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(passwords.newPass)) {
      errs.newPass = 'Must contain at least one special character (e.g. ! @ # *).';
    }
    if (passwords.newPass && passwords.current && passwords.newPass === passwords.current) {
      errs.newPass = 'New password must be different from your current password.';
    }
    if (passwords.newPass !== passwords.confirm) errs.confirm = 'Passwords do not match.';
    setPasswordErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    setPasswordSaved(false);
    if (!validatePasswords()) return;
    if (!user) {
      logout();
      navigate('/login');
      return;
    }
    setPasswordSubmitting(true);
    try {
      const { UserService } = await import('../lib/user-service');
      const result = await UserService.changePassword(passwords.current, passwords.newPass, { suppressErrorToast: true });
      if (result?.success) {
        setPasswords({ current: '', newPass: '', confirm: '' });
        setPasswordErrors({});
        setPasswordSaved(true);
        toast.success('Password updated', { description: 'You can use your new password next time you sign in.' });
        setTimeout(() => setPasswordSaved(false), 4000);
      } else {
        const msg = (result as any)?.message || 'Could not update password.';
        setPasswordErrors({ form: msg });
        toast.error('Password update failed', { description: msg });
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not update password. Please try again.';
      const lower = String(msg).toLowerCase();
      if (lower.includes('incorrect') && lower.includes('password')) {
        setPasswordErrors({ current: msg });
      } else if (lower.includes('password must contain') || lower.includes('different from')) {
        setPasswordErrors({ newPass: msg });
      } else {
        setPasswordErrors({ form: msg });
      }
      toast.error('Password update failed', { description: msg });
    } finally {
      setPasswordSubmitting(false);
    }
  }

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const s = search.get('section');
    if (s === 'scan' && !AI_INSPECTION_HISTORY_ENABLED) {
      setActiveSection('dashboard');
      navigate('/customer/dashboard', { replace: true });
      return;
    }
    setActiveSection(
      s === 'settings'
        ? 'settings'
        : s === 'bookings'
          ? 'bookings'
          : s === 'scan'
            ? 'scan'
            : s === 'documents'
              ? 'documents'
              : s === 'payments'
                ? 'payments'
                : s === 'rewards'
                  ? 'rewards'
                  : s === 'tracker'
                    ? 'tracker'
                    : 'dashboard'
    );
  }, [location.search, navigate]);

  // Fetch My Bookings whenever section opens — with socket-driven instant updates
  useEffect(() => {
    if (!['dashboard', 'bookings', 'documents', 'rewards', 'tracker', 'payments'].includes(activeSection) || !user) return;

    const load = async (opts?: { silent?: boolean }) => {
      if (bookingsLoadLockRef.current) return;
      bookingsLoadLockRef.current = true;
      const silent = !!opts?.silent;
      // ── Bust cache before every fetch so polling always gets fresh data ──
      // The cache TTL (5s) matches the poll interval, meaning the cache would
      // always be fresh and the poll would return stale data. Invalidating first
      // guarantees we hit the network on every poll tick.
      invalidate('/bookings');

      if (!silent) setMyBookingsLoading(true);
      try {
        const { OrderService } = await import('../lib/order-service');
        const res = await OrderService.getAllOrders({ suppressErrorToast: true });
        if (res.success && Array.isArray(res.data)) {
          const mine = res.data
            .filter((o: any) => {
              // Normalize both sides to strings — ObjectId from DB serializes as string
              const myId = String(user.id || user._id || '');
              const cid = String(o.customerId || o.customer?._id || o.customer || '');
              return cid === myId || o.customerName === user.name;
            })
            .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          setMyBookings(mine);

          const nextDocuments = mine.slice(0, 8).map((booking: any, index: number) => {
            const serviceName = displayServiceTitle(booking.serviceName || booking.serviceType);
            const status = (booking.status || '').toLowerCase();
            const docType = status === 'completed' || status === 'released' ? 'report' : 'waiver';
            const plate = displayVehicleLabel(booking.vehiclePlate);
            return {
              id: booking._id || booking.id || `${serviceName}-${index}`,
              type: docType,
              icon: docType === 'report' ? 'solar:file-text-bold' : 'solar:document-add-bold',
              title: docType === 'report' ? `${serviceName} · completion report` : `${serviceName} · service intake`,
              desc: `${plate} · ${formatBookingDayLabel(booking.date)}`,
              date: booking.date ? formatBookingDayLabel(booking.date) : 'Date to be confirmed',
              status: docType === 'waiver' ? 'Pending signature' : 'Signed',
            };
          });
          setDocuments(nextDocuments);

          const nextActivities = mine.slice(0, 8).map((booking: any) => ({
            id: booking._id || booking.id,
            title: displayServiceTitle(booking.serviceName || booking.serviceType),
            statusLabel: humanizeBookingStatus(booking.status),
            plate: displayVehicleLabel(booking.vehiclePlate),
            time: formatActivityWhen(booking),
          }));
          setActivities(nextActivities);
        }
      } catch (e) {
        console.warn('[MyBookings]', e);
      } finally {
        bookingsLoadLockRef.current = false;
        if (!silent) setMyBookingsLoading(false);
      }
    };

    // Expose load so socket handlers can trigger a silent refetch (no loading spinner).
    loadBookingsRef.current = load;

    load();
    // Poll every 5s — always silent so the list never flashes a full-page loading state.
    // Real-time updates: booking:status patches + scheduleSilentBookingsRefetch; this is the HTTP fallback.
    const interval = setInterval(() => load({ silent: true }), 5000);

    return () => {
      clearInterval(interval);
      if (silentBookingsRefetchTimerRef.current) {
        clearTimeout(silentBookingsRefetchTimerRef.current);
        silentBookingsRefetchTimerRef.current = null;
      }
    };
  }, [activeSection, user]);

  useEffect(() => {
    if (location.pathname === '/customer/book' && !bookRouteAutoOpenRef.current) {
      bookRouteAutoOpenRef.current = true;
      openBookingModal();
    }

    if (location.pathname !== '/customer/book') {
      bookRouteAutoOpenRef.current = false;
      bookRouteModalOpenedRef.current = false;
    }
  }, [location.pathname, vehicles]);

  useEffect(() => {
    if (location.pathname === '/customer/book' && bookingOpen) {
      bookRouteModalOpenedRef.current = true;
    }
  }, [bookingOpen, location.pathname]);

  // Keep bookingVehicleType in sync with the selected vehicle's actual type
  // This handles: page reload, logout/login, vehicles loading after modal opens
  useEffect(() => {
    if (vehicles.length === 0) return;
    const selectedV = vehicles[bookingSelectedVehicleIdx];
    if (selectedV?.type) {
      const correctKey = getVehiclePriceKey(selectedV.type);
      setBookingVehicleType(correctKey);
    } else if (bookingOpen && bookingSelectedVehicleIdx === -1 && vehicles[0]?.type) {
      // Modal is open but no vehicle selected yet — default to first vehicle
      const correctKey = getVehiclePriceKey(vehicles[0].type);
      setBookingVehicleType(correctKey);
      setBookingSelectedVehicleIdx(0);
      setBookingForm(f => ({
        ...f,
        vehicleMake: f.vehicleMake || vehicles[0].make || '',
        vehicleModel: f.vehicleModel || vehicles[0].model || '',
        vehicleYear: f.vehicleYear || vehicles[0].year || '',
        vehicleColor: f.vehicleColor || vehicles[0].color || '',
        vehiclePlate: f.vehiclePlate || resolveGarageVehiclePlate(vehicles[0]) || '',
        vehicleCategory: f.vehicleCategory || vehicles[0].type || '',
        vehicleTransmission: f.vehicleTransmission || vehicles[0].transmission || '',
        vehicleFuelType: f.vehicleFuelType || vehicles[0].fuelType || '',
      }));
    }
  }, [vehicles, bookingSelectedVehicleIdx, bookingOpen]);

  // If the form lost plate but the selected garage row has one, copy it so Step 2 / Sales see the real plate.
  useEffect(() => {
    if (!bookingOpen || bookingSelectedVehicleIdx < 0 || bookingSelectedVehicleIdx >= vehicles.length) return;
    const fromGarage = resolveGarageVehiclePlate(vehicles[bookingSelectedVehicleIdx]);
    if (!fromGarage) return;
    setBookingForm(f => {
      if ((f.vehiclePlate || '').trim()) return f;
      return { ...f, vehiclePlate: String(fromGarage).toUpperCase() };
    });
  }, [bookingOpen, bookingSelectedVehicleIdx, vehicles]);

  useEffect(() => {
    if (location.pathname === '/customer/book' && bookRouteModalOpenedRef.current && !bookingOpen) {
      navigate('/customer/dashboard', { replace: true });
    }
  }, [bookingOpen, location.pathname, navigate]);

  const nav = (section: DashboardSection) => {
    if (section === 'scan' && !AI_INSPECTION_HISTORY_ENABLED) return;
    setActiveSection(section);
    setIsSidebarOpen(false);
    const urlMap: Record<DashboardSection, string> = {
      dashboard: '/customer/dashboard',
      scan: '/customer/dashboard?section=scan',
      settings: '/customer/dashboard?section=settings',
      bookings: '/customer/dashboard?section=bookings',
      documents: '/customer/dashboard?section=documents',
      payments: '/customer/dashboard?section=payments',
      rewards: '/customer/dashboard?section=rewards',
      tracker: '/customer/dashboard?section=tracker',
    };
    navigate(urlMap[section]);
  };

  useEffect(() => {
    if (activeSection !== 'tracker' || !user || myBookingsLoading) return;
    if (myBookings.length === 0) return;
    if (!pickCustomerLiveTrackerBooking(myBookings)) {
      setActiveSection('dashboard');
      setIsSidebarOpen(false);
      navigate('/customer/dashboard', { replace: true });
    }
  }, [activeSection, myBookings, myBookingsLoading, user, navigate]);

  const openScanStudio = (vehicle?: any) => {
    if (!AI_INSPECTION_HISTORY_ENABLED) return;
    const targetId = vehicle?._id || vehicle?.id;
    if (targetId) setScanVehicleId(targetId);
    nav('scan');
  };

  const handleScanUploadFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setScanError('');
    if (scanUploads.length > 0) {
      scanUploads.forEach((upload) => URL.revokeObjectURL(upload.preview));
    }

    const nextUploads = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, 6)
      .map((file, index) => ({
        id: `${file.name}-${file.size}-${index}-${Date.now()}`,
        name: file.name,
        size: file.size,
        preview: URL.createObjectURL(file),
      }));

    if (nextUploads.length === 0) return;
    setScanUploads(nextUploads);
    setScanDragActive(false);
    setScanAnalyzing(false);
    setScanProgress(0);
    setScanActiveStep(-1);
    setScanComplete(false);
  };

  const handleScanUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleScanUploadFiles(event.target.files);
  };

  const handleScanDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setScanDragActive(false);
    handleScanUploadFiles(event.dataTransfer.files);
  };

  const openScanFilePicker = () => {
    if (!scanFileInputRef.current) return;
    scanFileInputRef.current.value = '';
    scanFileInputRef.current.click();
  };

  const clearScanUploads = () => {
    if (scanProgressIntervalRef.current) {
      clearInterval(scanProgressIntervalRef.current);
      scanProgressIntervalRef.current = null;
    }
    scanTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    scanTimeoutsRef.current = [];
    scanUploads.forEach((upload) => URL.revokeObjectURL(upload.preview));
    setScanUploads([]);
    setScanAnalyzing(false);
    setScanProgress(0);
    setScanActiveStep(-1);
    setScanComplete(false);
    setScanError('');
    if (scanFileInputRef.current) scanFileInputRef.current.value = '';
  };

  const startScanAnalysis = () => {
    if (scanAnalyzing) return;
    if (!selectedScanVehicle) {
      setScanError('Select or add a vehicle profile before running analysis.');
      return;
    }
    if (scanUploads.length === 0) {
      setScanError('Upload at least 1 vehicle image to start AI analysis.');
      return;
    }

    if (scanProgressIntervalRef.current) {
      clearInterval(scanProgressIntervalRef.current);
      scanProgressIntervalRef.current = null;
    }
    scanTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    scanTimeoutsRef.current = [];

    setScanError('');
    setScanAnalyzing(true);
    setScanProgress(0);
    setScanActiveStep(0);
    setScanComplete(false);
    const vehiclePriceKey = getVehiclePriceKey(selectedScanVehicle?.type || '');
    const isHighendScanRun = scanMode === 'highend' || vehiclePriceKey === 'highend';
    const stepDelays = isHighendScanRun
      ? [1000, 1400, 1200, 1500, 1300, 1000, 700]
      : [1200, 1800, 1400, 2000, 1600, 1200, 800];
    const totalTime = stepDelays.reduce((a, b) => a + b, 0);
    let elapsed = 0;
    // Progress bar animation
    scanProgressIntervalRef.current = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          if (scanProgressIntervalRef.current) {
            clearInterval(scanProgressIntervalRef.current);
            scanProgressIntervalRef.current = null;
          }
          return 100;
        }
        return Math.min(prev + 1, 100);
      });
    }, totalTime / 100);
    // Step progression
    stepDelays.forEach((delay, i) => {
      elapsed += delay;
      const timeoutId = setTimeout(() => {
        setScanActiveStep(i + 1);
        if (i === stepDelays.length - 1) {
          if (scanProgressIntervalRef.current) {
            clearInterval(scanProgressIntervalRef.current);
            scanProgressIntervalRef.current = null;
          }
          setScanProgress(100);
          setScanAnalyzing(false);
          setScanComplete(true);
        }
      }, elapsed);
      scanTimeoutsRef.current.push(timeoutId);
    });
  };

  function handleFeedbackSubmit() {
    if (feedbackRating === 0 || !feedbackText.trim()) return;
    setFeedbackSubmitted(true);
    // In production, POST to API: { rating, text, vehicle, userId }
    setTimeout(() => {
      setFeedbackOpen(false);
      setFeedbackSubmitted(false);
      setFeedbackRating(0);
      setFeedbackHover(0);
      setFeedbackText('');
      setFeedbackToast(true);
      setTimeout(() => setFeedbackToast(false), 4000);
    }, 1500);
  }

  const downloadDocument = (doc: any) => {
    const dateLabel = doc.date || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    const payload = [
      `AutoSPF+ Document`,
      `Title: ${doc.title || 'Service Document'}`,
      `Description: ${doc.desc || 'Generated from your dashboard'}`,
      `Date: ${dateLabel}`,
      `Status: ${doc.status || 'Ready'}`,
    ].join('\n');
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(doc.title || 'autospf-document').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const redeemReward = async (reward: { points: number; code: string; title: string }) => {
    if (customerStats.loyaltyPoints < reward.points) {
      setRewardRedeemMessage(`Need ${reward.points - customerStats.loyaltyPoints} more points to redeem ${reward.title}.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(reward.code);
      setRewardRedeemMessage(`${reward.title} redeemed! Code ${reward.code} copied.`);
    } catch {
      setRewardRedeemMessage(`${reward.title} redeemed! Use code: ${reward.code}`);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    await NotificationService.markAsRead(id);
    setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllNotificationsAsRead = async () => {
    await NotificationService.markAllAsRead();
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const selectedScanVehicle = vehicles.find((vehicle) => (vehicle._id || vehicle.id) === scanVehicleId) || vehicles[0] || null;
  const selectedScanVehicleType = getVehiclePriceKey(selectedScanVehicle?.type || 'sedan');
  const scanPricing = SCAN_PRICING[selectedScanVehicleType] || SCAN_PRICING.sedan;
  const scanIsHighend = selectedScanVehicleType === 'highend';
  const highendScanEnabled = scanMode === 'highend' || scanIsHighend;
  const scanEstimateItems = [
    { label: 'AI defect mapping & panel tagging', amount: 0, included: true },
    { label: 'Localized panel refinishing', amount: Math.round(scanPricing.recommended * 0.48) },
    { label: 'Paint correction blend', amount: Math.round(scanPricing.recommended * 0.26) },
    { label: 'Final calibration & finishing', amount: scanPricing.recommended - Math.round(scanPricing.recommended * 0.48) - Math.round(scanPricing.recommended * 0.26) },
  ];
  const scanEstimateTotal = scanEstimateItems.reduce((total, item) => total + item.amount, 0);
  const scanUploadTotalSize = scanUploads.reduce((total, upload) => total + upload.size, 0);
  const rewardTier =
    customerStats.loyaltyPoints >= 1000 ? 'Platinum' : customerStats.loyaltyPoints >= 500 ? 'Gold' : customerStats.loyaltyPoints >= 200 ? 'Silver' : 'Starter';
  const rewardTierLevels = [
    { name: 'Starter', min: 0 },
    { name: 'Silver', min: 200 },
    { name: 'Gold', min: 500 },
    { name: 'Platinum', min: 1000 },
  ] as const;
  const currentRewardTierIndex = Math.max(0, rewardTierLevels.findIndex((tier) => tier.name === rewardTier));
  const currentRewardTier = rewardTierLevels[currentRewardTierIndex] || rewardTierLevels[0];
  const nextRewardTier = rewardTierLevels[currentRewardTierIndex + 1] || null;
  const pointsToNextRewardTier = nextRewardTier ? Math.max(0, nextRewardTier.min - customerStats.loyaltyPoints) : 0;
  const rewardTierProgressPct = nextRewardTier
    ? Math.min(100, Math.max(0, Math.round(((customerStats.loyaltyPoints - currentRewardTier.min) / (nextRewardTier.min - currentRewardTier.min)) * 100)))
    : 100;
  const formattedLoyaltyPoints = new Intl.NumberFormat(undefined).format(customerStats.loyaltyPoints);
  const rewardCatalog = [
    { id: 'rw-1', title: 'Free Premium Wash', points: 150, code: 'WASH150', desc: 'Use on any maintenance wash booking.' },
    { id: 'rw-2', title: '10% Coating Discount', points: 300, code: 'COAT10', desc: 'Applies to selected coating services.' },
    { id: 'rw-3', title: 'Priority Booking Slot', points: 500, code: 'FASTLANE', desc: 'Get priority queue schedule access.' },
  ];

  return (
    <>
      <div className="h-screen flex overflow-hidden text-sm bg-white" style={{ '--border': '214 32% 91%', color: '#0f172a' } as React.CSSProperties}>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/20 z-20 md:hidden transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`customer-sidebar ${sidebarCollapsed ? 'is-collapsed' : 'is-expanded'} ${sidebarLabelsHidden ? 'is-labels-hidden' : ''} ${sidebarTransitionsReady ? 'is-transition-ready' : 'is-initial'} fixed inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            }`}
        >
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="customer-sidebar-toggle hidden md:flex"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <iconify-icon
              icon="solar:alt-arrow-left-linear"
              width="18"
              className="customer-sidebar-toggle-chevron"
            ></iconify-icon>
          </button>

          <div className="customer-sidebar-brand h-16 flex items-center gap-3 border-b border-slate-100 shrink-0">
            <span className="customer-sidebar-brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <iconify-icon icon="solar:shield-check-bold" width="18"></iconify-icon>
            </span>
            <span className="customer-sidebar-label font-semibold text-base text-slate-900">AutoSPF+</span>
          </div>

          <nav className="customer-sidebar-nav flex-1 space-y-1 overflow-y-auto">
            <button
              onClick={() => nav('dashboard')}
              className={`customer-sidebar-item w-full flex items-center gap-3 rounded-md font-medium outline-none transition-colors ${activeSection === 'dashboard' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              aria-label="Dashboard"
              title={sidebarCollapsed ? 'Dashboard' : undefined}
            >
              <iconify-icon icon="solar:widget-linear" width="20" className="shrink-0"></iconify-icon>
              <span className="customer-sidebar-label flex-1 min-w-0 text-left">Dashboard</span>
            </button>
            <button
              type="button"
              disabled={!AI_INSPECTION_HISTORY_ENABLED}
              onClick={() => nav('scan')}
              title={sidebarCollapsed ? 'AI Inspection History' : AI_INSPECTION_HISTORY_ENABLED ? undefined : 'Coming soon'}
              aria-label="AI Inspection History"
              className={`customer-sidebar-item w-full flex items-center gap-3 rounded-md font-medium outline-none transition-colors ${AI_INSPECTION_HISTORY_ENABLED
                ? activeSection === 'scan'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                : 'text-slate-400 cursor-not-allowed opacity-80 hover:bg-transparent'
                } disabled:pointer-events-none`}
            >
              <iconify-icon icon="solar:scanner-linear" width="20" className="shrink-0"></iconify-icon>
              <span className="customer-sidebar-label flex-1 min-w-0 text-left leading-snug">AI Inspection History</span>
              <span className={`customer-sidebar-extra shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${AI_INSPECTION_HISTORY_ENABLED ? 'uppercase tracking-wider bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                {AI_INSPECTION_HISTORY_ENABLED ? 'AI Lab' : 'Soon'}
              </span>
            </button>
            <button
              onClick={() => nav('bookings')}
              className={`customer-sidebar-item w-full flex items-center gap-3 rounded-md font-medium outline-none transition-colors ${activeSection === 'bookings' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              aria-label="My Bookings"
              title={sidebarCollapsed ? 'My Bookings' : undefined}
            >
              <iconify-icon icon="solar:calendar-linear" width="20" className="shrink-0"></iconify-icon>
              <span className="customer-sidebar-label flex-1 min-w-0 text-left">My Bookings</span>
              {myBookings.filter(b => ['pending_confirmation', 'pending', 'confirmed', 'approved'].includes(b.status)).length > 0 && (
                <span className="customer-sidebar-extra ml-auto text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                  {myBookings.filter(b => ['pending_confirmation', 'pending', 'confirmed', 'approved'].includes(b.status)).length}
                </span>
              )}
            </button>
            {pickCustomerLiveTrackerBooking(myBookings) && (
            <button
              onClick={() => nav('tracker')}
              className={`customer-sidebar-item w-full flex items-center gap-3 rounded-md font-medium outline-none transition-colors ${activeSection === 'tracker' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              aria-label="Live Tracker"
              title={sidebarCollapsed ? 'Live Tracker' : undefined}
            >
              <iconify-icon icon="solar:routing-2-linear" width="20" className="shrink-0"></iconify-icon>
              <span className="customer-sidebar-label flex-1 min-w-0 text-left">Live Tracker</span>
            </button>
            )}

            <button
              onClick={() => nav('documents')}
              className={`customer-sidebar-item w-full flex items-center gap-3 rounded-md font-medium outline-none transition-colors ${activeSection === 'documents' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              aria-label="Documents"
              title={sidebarCollapsed ? 'Documents' : undefined}
            >
              <iconify-icon icon="solar:document-text-linear" width="20" className="shrink-0"></iconify-icon>
              <span className="customer-sidebar-label flex-1 min-w-0 text-left">Documents</span>
            </button>

            <button
              onClick={() => nav('payments')}
              className={`customer-sidebar-item w-full flex items-center gap-3 rounded-md font-medium outline-none transition-colors ${activeSection === 'payments' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              aria-label="Payment History"
              title={sidebarCollapsed ? 'Payment History' : undefined}
            >
              <iconify-icon icon="solar:card-2-linear" width="20" className="shrink-0"></iconify-icon>
              <span className="customer-sidebar-label flex-1 min-w-0 text-left">Payment History</span>
            </button>

            <button
              onClick={() => nav('rewards')}
              className={`customer-sidebar-item w-full flex items-center gap-3 rounded-md font-medium outline-none transition-colors ${activeSection === 'rewards' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              aria-label="Rewards"
              title={sidebarCollapsed ? 'Rewards' : undefined}
            >
              <iconify-icon icon="solar:star-linear" width="20" className="shrink-0"></iconify-icon>
              <span className="customer-sidebar-label flex-1 min-w-0 text-left">Rewards</span>
            </button>
          </nav>

        </aside>

        {/* Main Content */}
        <div className={`customer-main-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : 'is-sidebar-expanded'} ${sidebarTransitionsReady ? 'is-transition-ready' : 'is-initial'} flex flex-1 flex-col min-w-0`}>

          {/* Header */}
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 z-10">
            <div className="flex items-center gap-4">
              <button
                className="md:hidden text-slate-500 hover:text-slate-900"
                onClick={() => setIsSidebarOpen(true)}
              >
                <iconify-icon icon="solar:hamburger-menu-linear" width="24"></iconify-icon>
              </button>
              <h1 className="text-xl font-medium tracking-tight text-slate-900 hidden sm:block" style={{ color: '#0f172a' }}>
                {(() => {
                  const h = new Date().getHours();
                  const greeting = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : h >= 17 && h < 21 ? 'Good evening' : 'Good night';
                  const firstName = (user?.name || 'Customer').split(' ')[0];
                  return `${greeting}, ${firstName}`;
                })()}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {activeSection !== 'bookings' && (
                <button
                  onClick={openBookingModal}
                  className="hidden sm:flex items-center justify-center px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-md font-medium transition-colors shadow-sm"
                >
                  Book Service
                </button>
              )}


              <div className="w-px h-6 bg-slate-200 hidden sm:block mx-1"></div>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35"
                  aria-label={unreadNotificationCount > 0 ? `Notifications, ${unreadNotificationCount} unread` : 'Notifications'}
                >
                  <span
                    className={`flex size-[22px] items-center justify-center ${unreadNotificationCount > 0 ? 'origin-top [transform:translateZ(0)] animate-[ring_2s_ease-in-out_infinite]' : ''}`}
                  >
                    <iconify-icon icon="solar:bell-bold" width="22" height="22" className="shrink-0 text-current"></iconify-icon>
                  </span>
                  {unreadNotificationCount > 0 && (
                    <span
                      className={`absolute -right-0.5 -top-0.5 z-10 flex items-center justify-center rounded-full border-2 border-white bg-red-500 font-extrabold tabular-nums leading-none text-white antialiased shadow-md ${
                        unreadNotificationCount > 9
                          ? 'h-[18px] min-w-[22px] px-1 text-[9px]'
                          : 'size-[18px] text-[10px]'
                      }`}
                    >
                      {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                    <div className="absolute right-0 top-11 w-80 bg-white rounded-xl z-50 shadow-2xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,.04)' }}>
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <h3 className="font-bold text-[15px] text-slate-900 tracking-tight">Notifications</h3>
                        {notifications.some(n => !n.isRead) && (
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
                            <iconify-icon icon="line-md:loading-twotone-loop" width="24" className="text-slate-300 mb-2"></iconify-icon>
                            <p className="text-[13px] text-slate-500">Loading notifications...</p>
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="p-8 text-center flex flex-col items-center justify-center">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                              <iconify-icon icon="solar:bell-bing-linear" width="24" className="text-slate-300"></iconify-icon>
                            </div>
                            <p className="text-[14px] font-medium text-slate-900">You're all caught up</p>
                            <p className="text-[12px] text-slate-500 mt-1">No new notifications right now.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-50">
                            {notifications.map(n => (
                              <button key={n.id || n._id} onClick={() => markNotificationAsRead(n.id || n._id || '')} className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex gap-3 ${!n.isRead ? 'bg-slate-50/50' : ''}`}>
                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.isRead ? 'bg-indigo-500' : 'bg-transparent'}`}></div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-[13px] text-slate-900 truncate ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
                                  <p className="text-[12px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">{n.message}</p>
                                  <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleDateString()}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
                        <button onClick={() => { setNotificationsOpen(false); nav('settings'); }} className="text-[12px] font-medium text-slate-600 hover:text-slate-900 transition-colors py-1 px-2 rounded hover:bg-slate-200/50">
                          Notification preferences
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="relative">
                <button onClick={() => setProfileMenuOpen(!profileMenuOpen)} className="relative w-9 h-9 rounded-full bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#1d4ed8] font-bold text-sm ml-2 hover:ring-2 hover:ring-[#bfdbfe] transition-all overflow-visible">
                  <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      (user?.name || 'C').charAt(0).toUpperCase()
                    )}
                  </div>
                  {/* Chevron badge — slim & clean */}
                  <span className="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full bg-[#e2e5ea] border-2 border-white flex items-center justify-center shadow-sm">
                    <svg width="6" height="5" viewBox="0 0 6 5" fill="none">
                      <path d="M1 1.5L3 3.5L5 1.5" stroke="#1e293b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {profileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); }} />
                    <div className="absolute right-0 top-11 w-[360px] bg-white rounded-xl z-50 max-h-[calc(100vh-80px)] overflow-y-auto" style={{ boxShadow: '0 4px 24px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04)' }}>

                      {/* Main Menu */}
                      {!profileSubMenu && (
                        <div className="py-1.5">
                          <div className="px-2 pt-1 pb-1.5">
                            <button onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); nav('settings'); }} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-100 shadow-sm transition-all group">
                              <div className="w-12 h-12 rounded-full bg-[#eff6ff] flex items-center justify-center text-[#1d4ed8] font-bold text-[17px] shrink-0 overflow-hidden">
                                {user?.avatar ? (
                                  <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  (user?.name || 'C').charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="text-left flex-1">
                                <p className="font-bold text-[15px] text-slate-900 leading-tight">{user?.name || 'Customer'}</p>
                                <p className="text-[13px] text-slate-600 leading-tight mt-0.5">{user?.email || 'customer@email.com'}</p>
                              </div>
                              <div className="bg-[#eff6ff] group-hover:bg-[#dbeafe] text-[#1d4ed8] px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-0.5">
                                Edit <span className="text-[16px] leading-none mb-[1px]">›</span>
                              </div>
                            </button>
                          </div>
                          <div className="h-px bg-slate-100 mx-2 my-0.5"></div>
                          <div className="px-1.5 py-0.5">


                            <button onClick={() => setProfileSubMenu('help')} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:question-circle-linear" width="18" style={{ color: '#475569' }}></iconify-icon></div>
                              <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Help & support</span>
                              <iconify-icon icon="solar:alt-arrow-right-linear" width="16" style={{ color: '#94a3b8' }}></iconify-icon>
                            </button>
                            <button onClick={() => setProfileSubMenu('display')} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:moon-linear" width="18" style={{ color: '#475569' }}></iconify-icon></div>
                              <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Display & accessibility</span>
                              <iconify-icon icon="solar:alt-arrow-right-linear" width="16" style={{ color: '#94a3b8' }}></iconify-icon>
                            </button>
                            <button onClick={() => { setProfileMenuOpen(false); setFeedbackOpen(true); }} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:chat-square-like-linear" width="18" style={{ color: '#475569' }}></iconify-icon></div>
                              <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Give feedback</span>
                            </button>
                          </div>
                          <div className="h-px bg-slate-100 mx-2 my-0.5"></div>
                          <div className="px-1.5 py-0.5">
                            <button onClick={async () => { setProfileMenuOpen(false); await logout(); navigate('/login'); }} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:logout-2-linear" width="18" style={{ color: '#475569' }}></iconify-icon></div>
                              <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Log out</span>
                            </button>
                          </div>
                          <div className="px-3 pt-2 pb-1.5">
                            <p className="text-[11px] text-slate-400 leading-tight">Privacy · Terms · Cookies · AutoSPF+ © 2026</p>
                          </div>
                        </div>
                      )}

                      {/* Display & Accessibility Sub-panel */}
                      {profileSubMenu === 'display' && (
                        <div className="py-3">
                          <div className="flex items-center gap-3 px-4 pb-1">
                            <button onClick={() => setProfileSubMenu(null)} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0" style={{ border: '1px solid #e2e8f0' }}>
                              <iconify-icon icon="solar:arrow-left-linear" width="20" style={{ color: '#0f172a' }}></iconify-icon>
                            </button>
                            <h3 className="font-bold text-[20px] text-slate-900 tracking-tight">Display & accessibility</h3>
                          </div>

                          <div className="px-4 space-y-4 pb-3">
                            {/* Dark Mode */}
                            <div className="flex gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0 mt-0.5"><iconify-icon icon="solar:moon-bold" width="18" style={{ color: '#fff' }}></iconify-icon></div>
                              <div className="flex-1">
                                <p className="font-bold text-[14px] text-slate-900">Dark mode</p>
                                <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">Adjust the appearance of AutoSPF+ to reduce glare and give your eyes a break.</p>
                                <div className="mt-3 space-y-0.5">
                                  {(['off', 'on', 'auto'] as const).map((val) => {
                                    const labels = { off: 'Off', on: 'On', auto: 'Automatic' };
                                    const descs: Record<string, string> = { auto: "We'll automatically adjust the display based on your device's system settings." };
                                    return (
                                      <label key={val} className="flex items-center justify-between py-2 px-1 -mx-1 rounded-md cursor-pointer hover:bg-slate-50 transition-colors">
                                        <div>
                                          <span className="text-[13px] font-medium text-slate-800 block">{labels[val]}</span>
                                          {descs[val] && <span className="text-[11px] text-slate-400 block mt-0.5 leading-snug pr-4">{descs[val]}</span>}
                                        </div>
                                        <div className={`w-[18px] h-[18px] rounded-full border-[2.5px] flex items-center justify-center shrink-0 transition-all ${darkMode === val ? 'border-slate-900 bg-white' : 'border-slate-300'}`}>
                                          {darkMode === val && <div className="w-[8px] h-[8px] rounded-full bg-slate-900"></div>}
                                        </div>
                                        <input type="radio" name="darkMode" className="sr-only" checked={darkMode === val} onChange={() => setDarkMode(val)} />
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            <div className="h-px bg-slate-100 -mx-1"></div>

                            {/* Compact Mode */}
                            <div className="flex gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0 mt-0.5"><iconify-icon icon="solar:minimize-square-bold" width="18" style={{ color: '#fff' }}></iconify-icon></div>
                              <div className="flex-1">
                                <p className="font-bold text-[14px] text-slate-900">Compact mode</p>
                                <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">Make your font size smaller so more content can fit on the screen.</p>
                                <div className="mt-3 space-y-0.5">
                                  {[false, true].map((val) => (
                                    <label key={String(val)} className="flex items-center justify-between py-2 px-1 -mx-1 rounded-md cursor-pointer hover:bg-slate-50 transition-colors">
                                      <span className="text-[13px] font-medium text-slate-800">{val ? 'On' : 'Off'}</span>
                                      <div className={`w-[18px] h-[18px] rounded-full border-[2.5px] flex items-center justify-center shrink-0 transition-all ${compactMode === val ? 'border-slate-900 bg-white' : 'border-slate-300'}`}>
                                        {compactMode === val && <div className="w-[8px] h-[8px] rounded-full bg-slate-900"></div>}
                                      </div>
                                      <input type="radio" name="compactMode" className="sr-only" checked={compactMode === val} onChange={() => setCompactMode(val)} />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="h-px bg-slate-100 -mx-1"></div>

                            {/* Keyboard */}
                            <button className="w-full flex items-center gap-3 py-1.5 hover:bg-slate-50 -mx-1 px-1 rounded-md transition-colors">
                              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:keyboard-bold" width="18" style={{ color: '#fff' }}></iconify-icon></div>
                              <span className="flex-1 text-left text-[14px] font-bold text-slate-900">Keyboard</span>
                              <iconify-icon icon="solar:alt-arrow-right-linear" width="18" style={{ color: '#94a3b8' }}></iconify-icon>
                            </button>

                            <div className="h-px bg-slate-100 -mx-1"></div>

                            {/* Accessibility */}
                            <button className="w-full flex items-center gap-3 py-1.5 hover:bg-slate-50 -mx-1 px-1 rounded-md transition-colors">
                              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:accessibility-bold" width="18" style={{ color: '#fff' }}></iconify-icon></div>
                              <span className="flex-1 text-left text-[14px] font-bold text-slate-900">Accessibility settings</span>
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Help & Support Sub-panel */}
                      {profileSubMenu === 'help' && (
                        <div className="py-3">
                          <div className="flex items-center gap-3 px-4 pb-1">
                            <button onClick={() => setProfileSubMenu(null)} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0" style={{ border: '1px solid #e2e8f0' }}>
                              <iconify-icon icon="solar:arrow-left-linear" width="20" style={{ color: '#0f172a' }}></iconify-icon>
                            </button>
                            <h3 className="font-bold text-[20px] text-slate-900 tracking-tight">Help & support</h3>
                          </div>

                          <div className="px-4 space-y-1 pb-2 pt-2">
                            <a href="https://autospf.com/help" target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:book-2-bold" width="18" style={{ color: '#fff' }}></iconify-icon></div>
                              <div className="flex-1">
                                <span className="text-[14px] font-bold text-slate-900 block">Help Center</span>
                                <span className="text-[11px] text-slate-500">Browse FAQs, guides, and tutorials</span>
                              </div>
                              <iconify-icon icon="solar:square-arrow-right-up-linear" width="16" style={{ color: '#94a3b8' }}></iconify-icon>
                            </a>

                            <div className="h-px bg-slate-100 -mx-1"></div>

                            <button onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); }} className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:chat-round-dots-bold" width="18" style={{ color: '#fff' }}></iconify-icon></div>
                              <div className="flex-1 text-left">
                                <span className="text-[14px] font-bold text-slate-900 block">Contact Us</span>
                                <span className="text-[11px] text-slate-500">Chat with our support team</span>
                              </div>
                            </button>

                            <div className="h-px bg-slate-100 -mx-1"></div>

                            <button onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); setFeedbackOpen(true); }} className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:bug-bold" width="18" style={{ color: '#fff' }}></iconify-icon></div>
                              <div className="flex-1 text-left">
                                <span className="text-[14px] font-bold text-slate-900 block">Report a Problem</span>
                                <span className="text-[11px] text-slate-500">Let us know if something isn't working</span>
                              </div>
                            </button>

                            <div className="h-px bg-slate-100 -mx-1"></div>

                            <a href="https://autospf.com/community" target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><iconify-icon icon="solar:users-group-two-rounded-bold" width="18" style={{ color: '#fff' }}></iconify-icon></div>
                              <div className="flex-1">
                                <span className="text-[14px] font-bold text-slate-900 block">Community Forum</span>
                                <span className="text-[11px] text-slate-500">Connect with other car enthusiasts</span>
                              </div>
                              <iconify-icon icon="solar:square-arrow-right-up-linear" width="16" style={{ color: '#94a3b8' }}></iconify-icon>
                            </a>
                          </div>
                        </div>
                      )}

                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Scrollable Area */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50">

            {activeSection === 'bookings' ? (
              /* ═══════════════════════════════════════════
                 MY BOOKINGS — Ultra-Premium UI
              ═══════════════════════════════════════════ */
              (() => {
                const upcomingStatuses = ['pending_confirmation', 'pending', 'confirmed', 'approved', 'assigned'];
                const activeStatuses = ['in-progress', 'in_progress', 'processing', 'checked-in', 'received'];
                const doneStatuses = ['completed', 'released', 'done', 'delivered', 'paid'];
                const cancelledStatuses = ['cancelled', 'rejected'];
                const filteredBookings = bookingsFilter === 'all' ? myBookings
                  : bookingsFilter === 'upcoming' ? myBookings.filter(b => upcomingStatuses.includes(b.status))
                    : bookingsFilter === 'active' ? myBookings.filter(b => activeStatuses.includes(b.status))
                      : bookingsFilter === 'completed' ? myBookings.filter(b => doneStatuses.includes(b.status))
                        : myBookings.filter(b => cancelledStatuses.includes(b.status));

                const statusCfg: Record<string, { label: string; color: string; bg: string; strip: string; dot?: boolean }> = {
                  pending: { label: 'Pending', color: '#92400e', bg: '#fffbeb', strip: '#f59e0b' },
                  confirmed: { label: 'Confirmed', color: '#3730a3', bg: '#eef2ff', strip: '#6366f1' },
                  assigned: { label: 'Assigned', color: '#3730a3', bg: '#eef2ff', strip: '#6366f1' },
                  'in-progress': { label: 'In Progress', color: '#1d4ed8', bg: '#eff6ff', strip: '#3b82f6', dot: true },
                  processing: { label: 'Processing', color: '#1d4ed8', bg: '#eff6ff', strip: '#3b82f6', dot: true },
                  'checked-in': { label: 'Checked In', color: '#0369a1', bg: '#f0f9ff', strip: '#0ea5e9' },
                  completed: { label: 'Completed', color: '#065f46', bg: '#f0fdf4', strip: '#10b981' },
                  released: { label: 'Released', color: '#065f46', bg: '#f0fdf4', strip: '#10b981' },
                  done: { label: 'Done', color: '#065f46', bg: '#f0fdf4', strip: '#10b981' },
                  cancelled: { label: 'Cancelled', color: '#991b1b', bg: '#fef2f2', strip: '#ef4444' },
                  rejected: { label: 'Rejected', color: '#991b1b', bg: '#fef2f2', strip: '#ef4444' },
                };

                const filterCounts = {
                  all: myBookings.length,
                  upcoming: myBookings.filter(b => upcomingStatuses.includes(b.status)).length,
                  active: myBookings.filter(b => activeStatuses.includes(b.status)).length,
                  completed: myBookings.filter(b => doneStatuses.includes(b.status)).length,
                  cancelled: myBookings.filter(b => cancelledStatuses.includes(b.status)).length,
                };

                return (
                  <div className="space-y-6 pb-10">

                    {/* ── Header ── */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-[24px] font-bold text-slate-900 tracking-tight">My Bookings</h2>
                          {myBookings.length > 0 && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-indigo-600" style={{ background: '#eef2ff' }}>{myBookings.length}</span>
                          )}
                        </div>
                        <p className="text-[13px] text-slate-400 font-medium">Track and manage all your service appointments</p>
                      </div>
                      <button
                        onClick={() => openBookingModal()}
                        className="flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5"
                        style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px rgba(99,102,241,0.4)' }}
                      >
                        <iconify-icon icon="solar:add-circle-bold" width="16"></iconify-icon>
                        New Booking
                      </button>
                    </div>

                    {/* ── Stats Summary ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total', count: filterCounts.all, icon: 'solar:notebook-bookmark-bold', color: '#fff', iconBg: 'linear-gradient(135deg,#6366f1,#818cf8)', cardBg: 'linear-gradient(135deg,#6366f1,#4f46e5)', text: '#fff', sub: '#c7d2fe' },
                        { label: 'Upcoming', count: filterCounts.upcoming, icon: 'solar:clock-circle-bold', color: '#fff', iconBg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', cardBg: 'linear-gradient(135deg,#f59e0b,#d97706)', text: '#fff', sub: '#fde68a' },
                        { label: 'Active', count: filterCounts.active, icon: 'solar:play-circle-bold', color: '#fff', iconBg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', cardBg: 'linear-gradient(135deg,#3b82f6,#2563eb)', text: '#fff', sub: '#bfdbfe' },
                        { label: 'Completed', count: filterCounts.completed, icon: 'solar:check-circle-bold', color: '#fff', iconBg: 'linear-gradient(135deg,#10b981,#34d399)', cardBg: 'linear-gradient(135deg,#10b981,#059669)', text: '#fff', sub: '#a7f3d0' },
                      ].map(s => (
                        <div key={s.label} className="rounded-2xl p-4 flex items-center gap-3 relative overflow-hidden" style={{ background: s.cardBg, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                          <div className="absolute -right-3 -top-3 w-20 h-20 rounded-full opacity-20" style={{ background: 'rgba(255,255,255,0.3)' }} />
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
                            <iconify-icon icon={s.icon} width="20" style={{ color: '#fff' }}></iconify-icon>
                          </div>
                          <div>
                            <p className="text-[26px] font-black leading-none" style={{ color: s.text }}>{s.count}</p>
                            <p className="text-[11px] font-semibold mt-0.5" style={{ color: s.sub }}>{s.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── Filter Tabs ── */}
                    <div className="flex items-center gap-1.5 bg-white border border-slate-100 p-1.5 rounded-2xl w-fit overflow-x-auto" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      {(['all', 'upcoming', 'active', 'completed', 'cancelled'] as const).map(f => {
                        const meta: Record<string, { icon: string; activeGrad: string; activeTxt: string }> = {
                          all:       { icon: 'solar:layers-bold',        activeGrad: 'linear-gradient(135deg,#4f46e5,#6366f1)', activeTxt: '#fff' },
                          upcoming:  { icon: 'solar:clock-circle-bold',  activeGrad: 'linear-gradient(135deg,#d97706,#f59e0b)', activeTxt: '#fff' },
                          active:    { icon: 'solar:play-circle-bold',   activeGrad: 'linear-gradient(135deg,#2563eb,#3b82f6)', activeTxt: '#fff' },
                          completed: { icon: 'solar:check-circle-bold',  activeGrad: 'linear-gradient(135deg,#059669,#10b981)', activeTxt: '#fff' },
                          cancelled: { icon: 'solar:close-circle-bold',  activeGrad: 'linear-gradient(135deg,#dc2626,#ef4444)', activeTxt: '#fff' },
                        };
                        const m = meta[f];
                        const isActive = bookingsFilter === f;
                        return (
                          <button
                            key={f}
                            onClick={() => setBookingsFilter(f)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap capitalize"
                            style={isActive
                              ? { background: m.activeGrad, color: m.activeTxt, boxShadow: '0 3px 10px rgba(0,0,0,0.18)' }
                              : { color: '#64748b' }
                            }
                          >
                            <iconify-icon icon={m.icon} width="13"></iconify-icon>
                            {f}
                            {filterCounts[f] > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={isActive ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
                                {filterCounts[f]}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* ── Content ── */}
                    {myBookingsLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map(k => (
                          <div key={k} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden animate-pulse">
                            <div className="flex">
                              <div className="w-1 bg-slate-200 shrink-0" />
                              <div className="flex-1 p-5 space-y-3">
                                <div className="flex justify-between gap-8">
                                  <div className="space-y-2 flex-1">
                                    <div className="h-3 w-20 bg-slate-100 rounded-full" />
                                    <div className="h-4 w-44 bg-slate-200 rounded-full" />
                                    <div className="h-3 w-32 bg-slate-100 rounded-full" />
                                  </div>
                                  <div className="space-y-2">
                                    <div className="h-4 w-24 bg-slate-200 rounded-full" />
                                    <div className="h-3 w-28 bg-slate-100 rounded-full" />
                                  </div>
                                </div>
                                <div className="h-px bg-slate-100" />
                                <div className="flex justify-between">
                                  <div className="h-3 w-28 bg-slate-100 rounded-full" />
                                  <div className="h-8 w-32 bg-slate-100 rounded-lg" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : filteredBookings.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-14 text-center flex flex-col items-center">
                        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                          <iconify-icon icon="solar:calendar-minimalistic-linear" width="32" style={{ color: '#6366f1' }}></iconify-icon>
                        </div>
                        <h3 className="font-semibold text-slate-900 text-[16px] mb-1">
                          {bookingsFilter === 'all' ? 'No bookings yet' : `No ${bookingsFilter} bookings`}
                        </h3>
                        <p className="text-sm text-slate-500 max-w-[240px] mx-auto mb-6 leading-relaxed">
                          {bookingsFilter === 'all'
                            ? "Book a service to get started — we'll track everything here."
                            : `You have no ${bookingsFilter} bookings at the moment.`
                          }
                        </p>
                        {bookingsFilter === 'all' && (
                          <button
                            onClick={() => openBookingModal()}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
                          >
                            <iconify-icon icon="solar:add-circle-linear" width="16"></iconify-icon>
                            Book Your First Service
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredBookings.map((booking: any, idx: number) => {
                          const st = (booking.status || 'pending').toLowerCase();
                          const cfg = statusCfg[st] || statusCfg['pending'];
                          const bookingId = booking._id || booking.id || String(idx);
                          const isCancelling = cancelConfirmId === bookingId;
                          const canCancel = ['pending', 'confirmed'].includes(st);
                          const dateStr = (() => {
                            const raw = booking.bookingDate || booking.date;
                            if (!raw) return 'Date TBD';
                            try { return new Date(raw).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
                            catch { return raw; }
                          })();
                          const timeStr = booking.bookingTime || booking.time || '';
                          const serviceIcons: Record<string, string> = {
                            'exterior': 'solar:washing-machine-bold', 'interior': 'solar:sofa-2-bold',
                            'paint': 'solar:pallete-2-bold', 'ceramic': 'solar:shield-check-bold',
                            'engine': 'solar:settings-bold', 'full': 'solar:star-shine-bold',
                          };
                          const svcName = (booking.serviceName || booking.serviceType || '').toLowerCase();
                          const svcIcon = Object.entries(serviceIcons).find(([k]) => svcName.includes(k))?.[1] || 'solar:car-wash-bold';
                          const vehicleLabel = [booking.vehicleBrand || booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ') || booking.vehicleModel || booking.vehicleMake || '';
                          const plateLabel = displayVehicleLabel(booking.vehiclePlate, '');

                          return (
                            <div
                              key={bookingId}
                              className="rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1 group"
                              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)' }}
                            >
                              {/* Cancel banner */}
                              {isCancelling && (
                                <div className="px-5 py-3 flex items-center justify-between gap-4" style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                                  <div className="flex items-center gap-2">
                                    <iconify-icon icon="solar:danger-triangle-bold" width="15" style={{ color: '#ef4444' }}></iconify-icon>
                                    <p className="text-sm font-semibold text-red-700">Cancel this booking?</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => setCancelConfirmId(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Keep it</button>
                                    <button onClick={async () => { try { const { OrderService } = await import('../lib/order-service'); await (OrderService as any).updateOrder?.(bookingId, { status: 'cancelled' }); setMyBookings(prev => prev.map(b => (b._id || b.id) === bookingId ? { ...b, status: 'cancelled' } : b)); } catch {} setCancelConfirmId(null); }} className="px-3 py-1.5 text-xs font-bold text-white rounded-lg" style={{ background: '#ef4444' }}>Yes, cancel</button>
                                  </div>
                                </div>
                              )}

                              {/* ── CARD HEADER (dark themed) ── */}
                              <div className="relative px-5 pt-5 pb-6 overflow-hidden" style={{ background: `linear-gradient(135deg, #0f172a 0%, #1e293b 60%, ${cfg.strip}33 100%)` }}>
                                {/* Background blur orb */}
                                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none" style={{ background: cfg.strip }} />
                                <div className="relative flex items-start justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    {/* Icon */}
                                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${cfg.strip}30`, border: `1px solid ${cfg.strip}50` }}>
                                      <iconify-icon icon={svcIcon} width="21" style={{ color: cfg.strip }}></iconify-icon>
                                    </div>
                                    <div>
                                      {/* Status pill */}
                                      <div className="flex items-center gap-1.5 mb-1">
                                        {cfg.dot && (
                                          <span className="relative flex h-1.5 w-1.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: cfg.strip }} />
                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: cfg.strip }} />
                                          </span>
                                        )}
                                        <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: cfg.strip }}>{cfg.label}</span>
                                      </div>
                                      <h3 className="font-bold text-white text-[16px] leading-tight">
                                        {booking.serviceName || booking.serviceType || 'Auto Service'}
                                      </h3>
                                    </div>
                                  </div>
                                  {/* Price */}
                                  {booking.price && (
                                    <div className="text-right shrink-0">
                                      <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: cfg.strip }}>Amount</p>
                                      <p className="text-[22px] font-black text-white leading-none tracking-tight">₱{Number(booking.price).toLocaleString()}</p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* ── TICKET NOTCH DIVIDER ── */}
                              <div className="relative flex items-center" style={{ background: '#f8fafc' }}>
                                <div className="absolute -left-3 w-6 h-6 rounded-full bg-white" style={{ boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.06)' }} />
                                <div className="flex-1 mx-3 border-t-2 border-dashed" style={{ borderColor: '#e2e8f0' }} />
                                <div className="absolute -right-3 w-6 h-6 rounded-full bg-white" style={{ boxShadow: 'inset 2px 0 4px rgba(0,0,0,0.06)' }} />
                              </div>

                              {/* ── CARD BODY ── */}
                              <div className="px-5 pt-4 pb-5 bg-white">
                                {/* Vehicle + Date row */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Vehicle</p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {vehicleLabel
                                        ? <span className="text-[13px] font-semibold text-slate-800">{vehicleLabel}</span>
                                        : <span className="text-[13px] text-slate-400">—</span>
                                      }
                                      {plateLabel && (
                                        <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md" style={{ background: '#f1f5f9', color: '#475569' }}>{plateLabel}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Schedule</p>
                                    <p className="text-[13px] font-semibold text-slate-800">{dateStr}</p>
                                    {timeStr && <p className="text-[12px] text-slate-500 font-medium">{timeStr}</p>}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-between">
                                  {canCancel ? (
                                    <button onClick={() => setCancelConfirmId(bookingId)}
                                      className="text-xs font-semibold text-slate-400 hover:text-red-500 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all">
                                      Cancel booking
                                    </button>
                                  ) : <div />}
                                  {bookingShowsCustomerLiveTracker(booking) ? (
                                  <button
                                    onClick={() => nav('tracker')}
                                    className="flex items-center gap-2 text-sm font-bold text-white px-5 py-2.5 rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
                                    style={{ background: `linear-gradient(135deg, ${cfg.strip}, ${cfg.strip}cc)`, boxShadow: `0 4px 16px ${cfg.strip}50` }}>
                                    <iconify-icon icon="solar:map-arrow-right-bold" width="15"></iconify-icon>
                                    Track Service
                                  </button>
                                  ) : String(booking?.paymentStatus || '').toLowerCase() === 'paid' ? (
                                    <span className="text-[11px] font-semibold text-slate-400 px-2 py-1 text-right">Paid — see Payment History</span>
                                  ) : (
                                    <div />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : activeSection === 'scan' ? (
              <div className="space-y-8 pb-10">
                <section
                  className={`relative overflow-hidden rounded-[32px] border bg-white shadow-[0_24px_80px_rgba(15,23,42,0.06)] ${highendScanEnabled ? 'border-[#a855f7]/40' : 'border-slate-200'}`}
                  style={{
                    background: highendScanEnabled
                      ? 'linear-gradient(145deg, #0c0a1e 0%, #1e1b4b 15%, #2e1f5e 30%, #3b2566 45%, #1a1636 70%, #0f0d1a 100%)'
                      : 'linear-gradient(135deg, #fffdf8 0%, #ffffff 45%, #eef6ff 100%)'
                  }}
                >
                  <div className="pointer-events-none absolute -left-16 top-10 h-44 w-44 rounded-full bg-amber-200/20 blur-3xl" style={{ animation: 'heroFloatA 8s ease-in-out infinite' }} />
                  <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-sky-200/25 blur-3xl" style={{ animation: 'heroFloatB 10s ease-in-out infinite' }} />
                  <div className="pointer-events-none absolute bottom-0 right-20 h-48 w-48 rounded-full bg-slate-200/40 blur-3xl" style={{ animation: 'heroFloatA 9s ease-in-out infinite reverse' }} />
                  <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.45) 45%, transparent 65%)', transform: 'translateX(-120%)', animation: 'heroSweep 7s ease-in-out infinite' }} />
                  {highendScanEnabled && (
                    <>
                      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gradient-to-br from-violet-500/20 via-purple-500/15 to-amber-500/10 blur-3xl" style={{ animation: 'heroFloatA 14s ease-in-out infinite' }} />
                      <div className="pointer-events-none right-10 top-0 h-64 w-64 rounded-full bg-gradient-to-bl from-amber-400/10 via-rose-400/5 to-transparent blur-3xl" style={{ animation: 'heroFloatB 11s ease-in-out infinite reverse' }} />
                      <div className="pointer-events-none absolute -right-20 bottom-20 h-56 w-56 rounded-full bg-gradient-to-tl from-violet-600/15 to-transparent blur-3xl" style={{ animation: 'heroFloatA 9s ease-in-out infinite' }} />
                      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 60%)' }} />
                      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(251,191,36,0.02) 50%, transparent 100%)' }} />
                      <div className="pointer-events-none absolute inset-0 border rounded-[32px]" style={{ borderColor: 'rgba(251,191,36,0.08)' }} />
                    </>
                  )}

                  <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr,0.85fr] lg:p-10">
                    <div className="max-w-3xl">
                      <div className={`inline-flex items-center gap-3 rounded-full border px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.32em] shadow-sm backdrop-blur ${highendScanEnabled ? 'border-violet-500/40 bg-violet-950/60 text-violet-200' : 'border-slate-200 bg-white/80 text-slate-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${highendScanEnabled ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-pulse' : 'bg-emerald-500'}`} />
                        {highendScanEnabled ? 'Concierge AI Suite • Global Standards • Bespoke Analysis' : 'AI Based Damage Detection • Cost Estimation • AR Visualization'}
                      </div>
                      {highendScanEnabled && (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-gradient-to-r from-amber-950/70 to-amber-900/50 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]" style={{ animation: 'glowPulse 2.5s ease-in-out infinite' }}>
                            <iconify-icon icon="solar:crown-bold" width="13" className="text-amber-400" />
                            <span className="text-amber-200">Maison Class</span>
                            <span className="ml-1 text-amber-500/60">|</span>
                            <span className="text-amber-400/80">International</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.16em] text-emerald-400">
                            <iconify-icon icon="solar:shield-check-linear" width="11" />
                            <span>White-Glove Service</span>
                          </div>
                        </div>
                      )}

                      <h2 className={`mt-6 max-w-2xl font-semibold leading-[0.92] tracking-[-0.05em] ${highendScanEnabled ? 'text-white sm:text-[48px] text-[32px]' : 'text-slate-950 sm:text-[44px]'}`}>
                        {highendScanEnabled
                          ? 'Bespoke vehicle intelligence. Concierge-grade precision.'
                          : 'Scan your vehicle, map the damage, and preview the repair outcome in one premium flow.'}
                      </h2>

                      <p className={`mt-5 max-w-2xl text-[16px] leading-[1.7] ${highendScanEnabled ? 'text-violet-300/80' : 'text-slate-600'}`}>
                        {highendScanEnabled
                          ? (
                            <>
                              Our proprietary AI suite delivers museum-grade assessment for discerning clients. Each scan is personally overseen by our master technicians with discrete, confidential service befitting the world's finest vehicles.
                            </>
                          )
                          : 'Upload your vehicle photos, let AI isolate the affected panels, generate a 3D repair view, and review an estimated service cost before you confirm.'}
                      </p>

                      {highendScanEnabled && (
                        <div className="mt-6 flex flex-wrap gap-4">
                          {[
                            { icon: 'solar:user-star-bold', label: 'Dedicated Specialist', desc: 'Personal concierge assigned' },
                            { icon: 'solar:clock-square-bold', label: '24/7 Availability', desc: 'Around the clock booking' },
                            { icon: 'solar:certificate-bold', label: 'Lifetime Guarantee', desc: 'Service warranty included' },
                          ].map((item) => (
                            <div key={item.label} className="flex items-center gap-2.5 rounded-2xl border border-violet-500/25 bg-violet-950/30 px-3.5 py-2.5">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30">
                                <iconify-icon icon={item.icon} width="16" className="text-amber-400" />
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/90">{item.label}</p>
                                <p className="text-[9px] text-violet-400/60">{item.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-sm ${highendScanEnabled ? 'border-violet-500/30 bg-violet-950/40' : 'border-slate-200 bg-white'}`}>
                          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${highendScanEnabled ? 'bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white shadow-lg' : 'bg-slate-900 text-white'}`}>
                            <iconify-icon icon="solar:car-linear" width="20"></iconify-icon>
                          </div>
                          <div>
                            <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${highendScanEnabled ? 'text-violet-300' : 'text-slate-400'}`}>Selected Vehicle</p>
                            <p className={`text-[15px] font-semibold ${highendScanEnabled ? 'text-white' : 'text-slate-900'}`}>
                              {selectedScanVehicle ? selectedScanVehicle.name : 'No vehicle selected'}
                            </p>
                            <p className={`text-[11px] ${highendScanEnabled ? 'text-violet-400/60' : 'text-slate-500'}`}>
                              {selectedScanVehicle ? [selectedScanVehicle.plate, selectedScanVehicle.type].filter(Boolean).join(' • ') : 'Add a vehicle to begin'}
                            </p>
                          </div>
                        </div>

                        {SCAN_HIGHLIGHTS.map((highlight) => (
                          <div key={highlight.label} className={`rounded-2xl border px-4 py-3 shadow-sm backdrop-blur ${highendScanEnabled ? 'border-violet-500/30 bg-violet-950/40' : 'border-slate-200 bg-white/85'}`}>
                            <p className={`text-xl font-semibold tracking-[-0.03em] ${highendScanEnabled ? 'text-amber-400' : 'text-slate-950'}`}>{highlight.value}</p>
                            <p className={`text-[10px] uppercase tracking-[0.2em] ${highendScanEnabled ? 'text-violet-300/70' : 'text-slate-400'}`}>{highlight.label}</p>
                          </div>
                        ))}
                        <button
                          type="button"
                          disabled={scanAnalyzing || scanIsHighend}
                          onClick={() => setScanMode((prev) => (prev === 'highend' ? 'auto' : 'highend'))}
                          className={`rounded-2xl border px-4 py-3 text-left transition-all group ${highendScanEnabled
                            ? 'border-amber-500/40 bg-gradient-to-br from-amber-950/60 via-violet-950/40 to-violet-900/30 text-amber-200 hover:border-amber-400 hover:shadow-[0_0_25px_rgba(251,191,36,0.25)]'
                            : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-700'} ${scanAnalyzing || scanIsHighend ? 'cursor-not-allowed opacity-70' : 'hover:-translate-y-0.5'}`}
                          title={scanIsHighend ? 'Auto enabled for high-end vehicle' : 'Toggle premium scan profile'}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${highendScanEnabled ? 'bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/30' : 'bg-slate-100'}`}>
                              <iconify-icon icon="solar:crown-bold" width="15" className={highendScanEnabled ? 'text-amber-400' : 'text-slate-400'}></iconify-icon>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Scan Profile</p>
                              <p className="text-sm font-semibold">{highendScanEnabled ? 'Maison Class' : 'Standard'}</p>
                            </div>
                          </div>
                        </button>
                      </div>

                      <div className="mt-8 flex flex-wrap gap-3">
                        <button
                          onClick={openScanFilePicker}
                          className={`inline-flex items-center gap-2.5 rounded-2xl px-6 py-3.5 text-sm font-semibold shadow-[0_16px_32px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(15,23,42,0.22)] ${highendScanEnabled
                            ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 hover:from-amber-300 hover:via-amber-400 hover:to-amber-500'
                            : 'bg-slate-950 text-white hover:bg-slate-800'}`}
                        >
                          <iconify-icon icon="solar:camera-add-linear" width="18"></iconify-icon>
                          {highendScanEnabled ? 'Schedule Private Scan' : 'Upload Scan Set'}
                        </button>
                        <button
                          onClick={() => openBookingModal(selectedScanVehicle || undefined)}
                          className={`inline-flex items-center gap-2.5 rounded-2xl border px-5 py-3.5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-1 ${highendScanEnabled
                            ? 'border-amber-500/40 bg-gradient-to-br from-violet-950/50 via-violet-900/40 to-violet-800/30 text-amber-200 hover:border-amber-400 hover:bg-violet-900/50'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'}`}
                        >
                          <iconify-icon icon="solar:calendar-add-linear" width="18"></iconify-icon>
                          Private Appointment
                        </button>
                        {highendScanEnabled && (
                          <button
                            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-2.5 text-xs font-semibold text-emerald-400/90"
                          >
                            <iconify-icon icon="solar:phone-rounded-bold" width="14" />
                            <span>Concierge Line</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className={`rounded-[28px] border p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur sm:col-span-2 ${highendScanEnabled ? 'border-violet-500/30 bg-violet-950/30' : 'border-slate-200 bg-white/90'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${highendScanEnabled ? 'text-violet-300' : 'text-slate-400'}`}>AI Detection Engine</p>
                            <p className={`mt-2 text-[36px] font-semibold tracking-[-0.06em] ${highendScanEnabled ? 'text-amber-400' : 'text-slate-950'}`}>99.7%</p>
                            <p className={`mt-1 text-sm leading-6 ${highendScanEnabled ? 'text-violet-300/70' : 'text-slate-500'}`}>{highendScanEnabled ? 'Museum-grade precision for luxury and exotic vehicles. Sub-micron scratch detection with OEM-matched paint calibration.' : 'High-confidence visual segmentation for dents, scratches, paint fade, and chip clusters.'}</p>
                          </div>
                          <div className={`flex h-14 w-14 items-center justify-center rounded-[22px] shadow-lg ${highendScanEnabled ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' : 'bg-slate-950 text-white'}`}>
                            <iconify-icon icon="solar:scanner-linear" width="24"></iconify-icon>
                          </div>
                        </div>
                        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full" style={{
                            width: '97%',
                            background: highendScanEnabled
                              ? 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 50%, #fcd34d 100%)'
                              : 'linear-gradient(90deg, #0f172a 0%, #0ea5e9 100%)',
                            backgroundSize: '200% 100%',
                            animation: 'gradientMove 2.8s linear infinite'
                          }} />
                        </div>
                        <div className={`mt-2 flex items-center justify-between text-[11px] ${highendScanEnabled ? 'text-amber-300/70' : 'text-slate-500'}`}>
                          <span>{highendScanEnabled ? 'Precision calibration status' : 'Panel recognition'}</span>
                          <span className="font-medium">97% scan completeness</span>
                        </div>
                      </div>

                      <div className={`rounded-[28px] border p-5 shadow-sm ${highendScanEnabled ? 'border-violet-500/30 bg-violet-950/30' : 'border-slate-200 bg-white/85'}`}>
                        <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${highendScanEnabled ? 'text-violet-300' : 'text-slate-400'}`}>3D Body Graph</p>
                        <div className={`relative mt-4 flex h-32 items-center justify-center overflow-hidden rounded-[24px] border ${highendScanEnabled ? 'border-violet-500/30 bg-slate-900' : 'border-slate-100 bg-slate-50'}`}>
                          <div className={`absolute h-24 w-24 rounded-full border ${highendScanEnabled ? 'border-violet-500/40' : 'border-sky-200'}`} />
                          <div className={`absolute h-16 w-16 rounded-full border ${highendScanEnabled ? 'border-violet-400/60' : 'border-slate-300'}`} />
                          <div className={`flex h-12 w-12 items-center justify-center rounded-full shadow-md ${highendScanEnabled ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white' : 'bg-white text-slate-900'}`}>
                            <iconify-icon icon="solar:car-linear" width="22" style={{ color: highendScanEnabled ? '#fff' : '#0f172a' }}></iconify-icon>
                          </div>
                        </div>
                        <p className={`mt-4 text-sm font-semibold ${highendScanEnabled ? 'text-white' : 'text-slate-900'}`}>{highendScanEnabled ? 'Precision 3D body mapping' : '3D vehicle model generation'}</p>
                        <p className={`mt-1 text-xs leading-5 ${highendScanEnabled ? 'text-violet-300/70' : 'text-slate-500'}`}>{highendScanEnabled ? 'Sub-millimeter accuracy with OEM geometry matching for luxury vehicles.' : 'Body geometry clusters detected issues into an easy-to-review digital repair map.'}</p>
                      </div>

                      <div className={`rounded-[28px] border p-5 shadow-sm ${highendScanEnabled ? 'border-violet-500/30 bg-violet-950/20' : 'border-slate-200 bg-white/85'}`}>
                        <div className="flex items-center justify-between">
                          <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${highendScanEnabled ? 'text-violet-300' : 'text-slate-400'}`}>3D Body Matrix</p>
                          {highendScanEnabled && (
                            <div className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/30 px-2 py-0.5">
                              <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
                              <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-amber-400">Live</span>
                            </div>
                          )}
                        </div>
                        <div className={`relative mt-4 flex h-32 items-center justify-center overflow-hidden rounded-[24px] border ${highendScanEnabled ? 'border-violet-500/30 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                          {highendScanEnabled ? (
                            <>
                              <div className="absolute h-28 w-28 rounded-full border border-violet-500/30 animate-[spin_12s_linear_infinite]" />
                              <div className="absolute h-20 w-20 rounded-full border border-amber-500/20 animate-[spin_8s_linear_infinite_reverse]" />
                              <div className="absolute h-14 w-14 rounded-full border border-violet-400/40" />
                            </>
                          ) : (
                            <>
                              <div className="absolute h-24 w-24 rounded-full border border-sky-200" />
                              <div className="absolute h-16 w-16 rounded-full border border-slate-300" />
                            </>
                          )}
                          <div className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg ${highendScanEnabled ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' : 'bg-white text-slate-900'}`}>
                            <iconify-icon icon="solar:car-linear" width="22"></iconify-icon>
                          </div>
                        </div>
                        <p className={`mt-4 text-sm font-semibold ${highendScanEnabled ? 'text-white' : 'text-slate-900'}`}>{highendScanEnabled ? 'Precision 3D Digital Twin' : '3D vehicle model generation'}</p>
                        <p className={`mt-1 text-xs leading-5 ${highendScanEnabled ? 'text-violet-300/70' : 'text-slate-500'}`}>{highendScanEnabled ? 'Sub-millimeter geometry with OEM database matching.' : 'Body geometry clusters detected issues into an easy-to-review digital repair map.'}</p>
                      </div>

                      <div className={`rounded-[28px] border p-5 shadow-sm ${highendScanEnabled ? 'border-violet-500/30 bg-violet-950/20' : 'border-slate-200 bg-white/85'}`}>
                        <div className="flex items-center justify-between">
                          <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${highendScanEnabled ? 'text-violet-300' : 'text-slate-400'}`}>AR Visualization</p>
                          {highendScanEnabled && (
                            <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-400">Real-time</span>
                          )}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2.5">
                          <div className={`rounded-2xl border p-3 ${highendScanEnabled ? 'border-rose-500/30 bg-rose-950/20' : 'border-rose-100 bg-rose-50'}`}>
                            <div className="flex items-center justify-between">
                              <p className={`text-[9px] font-bold uppercase tracking-[0.18em] ${highendScanEnabled ? 'text-rose-400' : 'text-rose-500'}`}>Before</p>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded ${highendScanEnabled ? 'bg-rose-950/50 text-rose-500' : 'bg-rose-100 text-rose-600'}`}>Original</span>
                            </div>
                            <div className={`mt-3 flex h-16 items-center justify-center rounded-2xl ${highendScanEnabled ? 'bg-slate-900/60 border border-rose-500/20' : 'bg-white'}`}>
                              <iconify-icon icon="solar:car-linear" width="26" style={{ color: '#ef4444' }}></iconify-icon>
                            </div>
                          </div>
                          <div className={`rounded-2xl border p-3 ${highendScanEnabled ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-emerald-100 bg-emerald-50'}`}>
                            <div className="flex items-center justify-between">
                              <p className={`text-[9px] font-bold uppercase tracking-[0.18em] ${highendScanEnabled ? 'text-emerald-400' : 'text-emerald-500'}`}>After</p>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded ${highendScanEnabled ? 'bg-emerald-950/50 text-emerald-500' : 'bg-emerald-100 text-emerald-600'}`}>Restored</span>
                            </div>
                            <div className={`mt-3 flex h-16 items-center justify-center rounded-2xl ${highendScanEnabled ? 'bg-slate-900/60 border border-emerald-500/20' : 'bg-white'}`}>
                              <iconify-icon icon="solar:car-linear" width="26" style={{ color: '#10b981' }}></iconify-icon>
                            </div>
                          </div>
                        </div>
                        <p className={`mt-4 text-sm font-semibold ${highendScanEnabled ? 'text-white' : 'text-slate-900'}`}>{highendScanEnabled ? 'Augmented Reality Simulation' : 'Before and after visualization'}</p>
                        <p className={`mt-1 text-xs leading-5 ${highendScanEnabled ? 'text-violet-300/70' : 'text-slate-500'}`}>{highendScanEnabled ? 'Factory-finish quality preview with color-matched rendering.' : 'AR shows the projected finish quality before you approve the work.'}</p>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
                  <section className={`rounded-[30px] border p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] ${highendScanEnabled ? 'border-violet-500/30 bg-slate-950/70' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: highendScanEnabled ? 'rgba(139,92,246,0.2)' : '#f1f5f9' }}>
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-[0.24em] ${highendScanEnabled ? 'text-violet-300' : 'text-slate-400'}`}>{highendScanEnabled ? 'Private Image Transfer' : 'AI Inspection (upload)'}</p>
                        <h3 className={`mt-2 text-[28px] font-semibold tracking-[-0.04em] ${highendScanEnabled ? 'text-white' : 'text-slate-950'}`}>{highendScanEnabled ? 'Secure Image Upload' : 'Upload your scan set'}</h3>
                        <p className={`mt-1 text-sm leading-6 ${highendScanEnabled ? 'text-violet-300/70' : 'text-slate-500'}`}>{highendScanEnabled ? 'Encrypted transfer. Your privacy is paramount.' : 'Use clear front, rear, side, and angled shots. Upload up to 6 images for the best AI analysis.'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {vehicles.length > 0 ? (
                          vehicles.slice(0, 4).map((vehicle) => {
                            const vehicleId = vehicle._id || vehicle.id;
                            const isActive = vehicleId === (selectedScanVehicle?._id || selectedScanVehicle?.id);
                            return (
                              <button
                                key={vehicleId}
                                onClick={() => setScanVehicleId(vehicleId)}
                                className={`rounded-2xl border px-4 py-2 text-left transition-all ${isActive
                                  ? highendScanEnabled
                                    ? 'border-amber-500/50 bg-amber-950/40 text-amber-200'
                                    : 'border-slate-900 bg-slate-900 text-white shadow-lg'
                                  : highendScanEnabled
                                    ? 'border-violet-500/30 bg-violet-950/30 text-violet-300'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
                              >
                                <p className="text-xs font-semibold">{vehicle.plate || 'Vehicle'}</p>
                                <p className={`text-[11px] ${isActive ? (highendScanEnabled ? 'text-amber-300/80' : 'text-slate-300') : (highendScanEnabled ? 'text-violet-400/60' : 'text-slate-400')}`}>{vehicle.name || vehicle.type || 'Vehicle profile'}</p>
                              </button>
                            );
                          })
                        ) : (
                          <button
                            onClick={() => setAddVehicleOpen(true)}
                            className={`rounded-2xl border border-dashed px-4 py-2 text-sm font-semibold transition-colors ${highendScanEnabled
                              ? 'border-violet-500/40 bg-violet-950/20 text-violet-300 hover:border-violet-400 hover:bg-violet-900/30'
                              : 'border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-400 hover:text-slate-900'}`}
                          >
                            Add vehicle profile
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      className={`mt-6 block overflow-hidden rounded-[30px] border-2 border-dashed p-5 transition-all sm:p-6 ${scanUploads.length === 0 ? 'cursor-pointer' : ''} ${scanDragActive ? 'border-slate-900 bg-slate-100 shadow-lg' : 'border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] hover:border-slate-300 hover:bg-slate-50'}`}
                      onDragOver={(event) => { event.preventDefault(); setScanDragActive(true); }}
                      onDragEnter={() => setScanDragActive(true)}
                      onDragLeave={() => setScanDragActive(false)}
                      onDrop={handleScanDrop}
                    >
                      <input
                        ref={scanFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={handleScanUploadChange}
                      />

                      {scanUploads.length === 0 ? (
                        <button
                          type="button"
                          onClick={openScanFilePicker}
                          className={`flex min-h-[320px] w-full flex-col items-center justify-center rounded-[26px] border px-6 text-center shadow-inner transition-transform hover:-translate-y-1 ${highendScanEnabled
                            ? 'border-violet-500/30 bg-gradient-to-b from-slate-900/80 to-slate-950/60'
                            : 'border-slate-100 bg-white'}`}
                        >
                          <div className={`flex h-16 w-16 items-center justify-center rounded-[24px] shadow-lg ${highendScanEnabled
                            ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white'
                            : 'bg-slate-900 text-white'}`}>
                            <iconify-icon icon="solar:camera-add-linear" width="28"></iconify-icon>
                          </div>
                          <h4 className={`mt-5 text-xl font-semibold tracking-[-0.03em] ${highendScanEnabled ? 'text-white' : 'text-slate-950'}`}>{highendScanEnabled ? 'Securely transfer your images' : 'Drop your vehicle photos here'}</h4>
                          <p className={`mt-2 max-w-md text-sm leading-6 ${highendScanEnabled ? 'text-violet-300/70' : 'text-slate-500'}`}>
                            {highendScanEnabled
                              ? 'Private, encrypted transfer. Your images are processed with strict confidentiality.'
                              : 'AI detects defects, identifies problem areas, and prepares your 3D and AR preview from the uploaded scan set.'}
                          </p>
                          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                            {highendScanEnabled ? (
                              <>
                                <span className="rounded-full border border-violet-500/30 bg-violet-950/30 px-3 py-1 text-[11px] font-semibold text-violet-300">Front</span>
                                <span className="rounded-full border border-violet-500/30 bg-violet-950/30 px-3 py-1 text-[11px] font-semibold text-violet-300">Rear</span>
                                <span className="rounded-full border border-violet-500/30 bg-violet-950/30 px-3 py-1 text-[11px] font-semibold text-violet-300">Sides</span>
                                <span className="rounded-full border border-violet-500/30 bg-violet-950/30 px-3 py-1 text-[11px] font-semibold text-violet-300">Detail</span>
                              </>
                            ) : (
                              <>
                                {['Front angle', 'Rear angle', 'Left side', 'Right side', 'Close-up damage'].map((item) => (
                                  <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                                    {item}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                          <span className={`mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] ${highendScanEnabled
                            ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950'
                            : 'bg-slate-950 text-white'}`}>
                            <iconify-icon icon="solar:scanner-linear" width="16"></iconify-icon>
                            {highendScanEnabled ? 'Begin Private Scan' : 'Start scan'}
                          </span>
                        </button>
                      ) : (
                        <div className="space-y-5">
                          <div className="grid gap-3 sm:grid-cols-3">
                            {scanUploads.map((upload, index) => (
                              <div
                                key={upload.id}
                                className={`${index === 0 ? 'sm:col-span-2 sm:row-span-2 min-h-[280px]' : 'min-h-[132px]'} group relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100`}
                                style={{ animation: `floatCard ${3.2 + (index * 0.45)}s ease-in-out infinite` }}
                              >
                                <img src={upload.preview} alt={upload.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />

                                {/* Scanning overlay animation */}
                                {scanAnalyzing && (
                                  <div className="absolute inset-0 z-10">
                                    <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" />
                                    <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                                      style={{ animation: 'scanLine 2s ease-in-out infinite', top: '0%' }} />
                                    <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-300 to-transparent opacity-80"
                                      style={{ animation: 'scanLine 2.7s ease-in-out infinite', top: '0%' }} />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 backdrop-blur shadow-lg">
                                        <iconify-icon icon="line-md:loading-twotone-loop" width="16" style={{ color: '#0f172a' }}></iconify-icon>
                                        <span className="text-xs font-bold text-slate-900">Analyzing...</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {scanComplete && (
                                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                                    <div className="flex items-center gap-2 rounded-full bg-emerald-500/90 px-4 py-2 backdrop-blur shadow-lg" style={{ animation: 'fadeInScale 0.4s ease-out' }}>
                                      <iconify-icon icon="solar:check-circle-bold" width="16" style={{ color: '#fff' }}></iconify-icon>
                                      <span className="text-xs font-bold text-white">Analyzed</span>
                                    </div>
                                  </div>
                                )}

                                <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                                  <span className="rounded-full bg-white/85 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-700 backdrop-blur">
                                    {index === 0 ? 'Primary angle' : `Panel ${index + 1}`}
                                  </span>
                                  <span className="rounded-full bg-slate-950/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur">
                                    {formatFileSize(upload.size)}
                                  </span>
                                </div>
                                <div className="absolute bottom-4 left-4 right-4">
                                  <p className="truncate text-sm font-semibold text-white">{upload.name}</p>
                                  <p className="text-xs text-white/75">{scanComplete ? '✓ Defects mapped' : scanAnalyzing ? 'Scanning...' : 'Queued for AI analysis'}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-3">
                            {/* Progress bar */}
                            {(scanAnalyzing || scanComplete) && (
                              <div className="overflow-hidden rounded-full bg-slate-200 h-2">
                                <div className="h-full rounded-full transition-all duration-300 ease-out"
                                  style={{
                                    width: `${scanProgress}%`,
                                    background: scanComplete ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #0f172a, #0ea5e9)',
                                  }} />
                              </div>
                            )}

                            <div className="flex flex-col gap-4 rounded-[26px] border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 font-semibold text-slate-900 shadow-sm">
                                  <iconify-icon icon="solar:folder-with-files-linear" width="16"></iconify-icon>
                                  {scanUploads.length} image{scanUploads.length > 1 ? 's' : ''} uploaded
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600">
                                  Total size {formatFileSize(scanUploadTotalSize)}
                                </span>
                                {scanAnalyzing && (
                                  <span className="inline-flex items-center gap-2 rounded-full bg-cyan-50 border border-cyan-200 px-3 py-2 font-bold text-cyan-700 text-xs">
                                    <iconify-icon icon="line-md:loading-twotone-loop" width="14"></iconify-icon>
                                    Analyzing {scanProgress}%
                                  </span>
                                )}
                                {scanComplete && (
                                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-2 font-bold text-emerald-700 text-xs">
                                    <iconify-icon icon="solar:check-circle-bold" width="14"></iconify-icon>
                                    Analysis complete
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {!scanAnalyzing && !scanComplete && (
                                  <button
                                    onClick={startScanAnalysis}
                                    className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                                    style={{ background: highendScanEnabled ? 'linear-gradient(135deg, #7c3aed, #1d4ed8)' : 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}
                                  >
                                    <iconify-icon icon="solar:scanner-linear" width="16"></iconify-icon>
                                    {highendScanEnabled ? 'Run High-End AI Analysis' : 'Run AI Analysis'}
                                  </button>
                                )}
                                {scanComplete && (
                                  <button
                                    onClick={startScanAnalysis}
                                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900"
                                  >
                                    Re-analyze
                                  </button>
                                )}
                                <button
                                  onClick={openScanFilePicker}
                                  disabled={scanAnalyzing}
                                  className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${scanAnalyzing ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-950 text-white hover:-translate-y-0.5 hover:bg-slate-800'}`}
                                >
                                  Replace Uploads
                                </button>
                                <button
                                  onClick={clearScanUploads}
                                  disabled={scanAnalyzing}
                                  className={`rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold transition-colors ${scanAnalyzing ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            {scanError && (
                              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
                                {scanError}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">System Automatically</p>
                        <h3 className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-slate-950">AI analysis pipeline</h3>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500">Status</p>
                        <p className="text-sm font-semibold text-emerald-700">
                          {scanAnalyzing
                            ? 'Analyzing in progress'
                            : scanComplete
                              ? 'Analysis complete'
                              : scanUploads.length > 0
                                ? 'Ready to analyze'
                                : 'Waiting for upload'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 space-y-3">
                      {SCAN_FLOW_STEPS.map((step, index) => {
                        const isComplete = scanActiveStep > index;
                        const isActive = scanActiveStep === index;

                        return (
                          <div
                            key={step.title}
                            className={`rounded-[24px] border p-4 transition-all duration-500 ${isComplete ? 'border-emerald-200 bg-emerald-50/80' : isActive ? 'border-slate-900 bg-slate-950 text-white shadow-xl' : 'border-slate-200 bg-slate-50/70 text-slate-700'}`}
                            style={{ animation: isActive ? 'activePulse 1.2s ease-in-out infinite' : 'none' }}
                          >
                            <div className="flex items-start gap-4">
                              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all duration-500 ${isComplete ? 'bg-emerald-600 text-white' : isActive ? 'bg-white text-slate-950' : 'bg-white text-slate-500'}`}>
                                {isComplete ? (
                                  <iconify-icon icon="solar:check-circle-bold" width="20"></iconify-icon>
                                ) : isActive && scanAnalyzing ? (
                                  <iconify-icon icon="line-md:loading-twotone-loop" width="20"></iconify-icon>
                                ) : (
                                  <iconify-icon icon={step.icon} width="20"></iconify-icon>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                  <p className={`text-sm font-semibold ${isActive ? 'text-white' : isComplete ? 'text-emerald-900' : 'text-slate-900'}`}>{step.title}</p>
                                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${isActive ? 'bg-white/15 text-white' : isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400'}`}>
                                    {isComplete ? 'Done' : isActive ? (scanAnalyzing ? 'Running' : step.tag) : step.tag}
                                  </span>
                                </div>
                                <p className={`mt-1 text-xs leading-5 ${isActive ? 'text-white/75' : isComplete ? 'text-emerald-800/80' : 'text-slate-500'}`}>{step.desc}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {scanError && (
                      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                        {scanError}
                      </div>
                    )}
                  </section>
                </div>

                <div className="grid gap-6 xl:grid-cols-[0.9fr,0.9fr,0.85fr]">
                  <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">AI Based Damage Detection</p>
                    <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">Detected problem areas</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">The system automatically identifies affected panels and suggests the recommended repair areas.</p>

                    <div className="relative mt-6 h-48 overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)]">
                      <div className="absolute left-1/2 top-1/2 h-28 w-56 -translate-x-1/2 -translate-y-1/2 rounded-[42px] border border-slate-300 bg-white shadow-inner" />
                      <div className="absolute left-1/2 top-1/2 h-20 w-40 -translate-x-1/2 -translate-y-1/2 rounded-[34px] border border-slate-200" />
                      <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg">
                        <iconify-icon icon="solar:car-linear" width="22"></iconify-icon>
                      </div>
                      {[
                        { top: '32%', left: '24%', color: '#ef4444' },
                        { top: '46%', left: '70%', color: '#f59e0b' },
                        { top: '58%', left: '44%', color: '#0ea5e9' },
                      ].map((point, index) => (
                        <div key={index} className="absolute" style={{ top: point.top, left: point.left }}>
                          <span className="absolute -inset-2 rounded-full opacity-20" style={{ background: point.color }} />
                          <span className="relative block h-3.5 w-3.5 rounded-full border-2 border-white shadow-lg" style={{ background: point.color }} />
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 space-y-3">
                      {SCAN_DAMAGE_ZONES.map((zone) => (
                        <div key={zone.title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                          <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: zone.tone }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-900">{zone.title}</p>
                              <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ background: zone.bg, color: zone.tone }}>
                                Recommended
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{zone.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">AR Shows Repair Simulation</p>
                    <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">Before and after visualization</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Review the projected finish quality after repainting, blending, and final correction.</p>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[26px] border border-rose-100 bg-rose-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-500">Before</p>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-500">Damage visible</span>
                        </div>
                        <div className="mt-4 flex h-32 items-center justify-center rounded-[22px] border border-white/80 bg-white shadow-sm">
                          <iconify-icon icon="solar:car-linear" width="48" style={{ color: '#ef4444' }}></iconify-icon>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {['Scratch', 'Dent', 'Paint chip'].map((tag) => (
                            <span key={tag} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-rose-500 shadow-sm">{tag}</span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[26px] border border-emerald-100 bg-emerald-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-500">After</p>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-500">Repair simulation</span>
                        </div>
                        <div className="mt-4 flex h-32 items-center justify-center rounded-[22px] border border-white/80 bg-white shadow-sm">
                          <iconify-icon icon="solar:car-linear" width="48" style={{ color: '#10b981' }}></iconify-icon>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {['Surface restored', 'Color blend', 'Gloss finish'].map((tag) => (
                            <span key={tag} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-emerald-600 shadow-sm">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[26px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">3D vehicle model generation</p>
                          <p className="mt-1 text-xs text-slate-500">Anchors every repair recommendation to a precise panel location.</p>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                          <iconify-icon icon="solar:scanner-linear" width="20"></iconify-icon>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">System Calculates Price</p>
                    <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">Estimate and confirm</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">A guided estimate is prepared from the detected damage severity and recommended service mix.</p>

                    <div className="mt-5 rounded-[28px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Estimated range</p>
                          <p className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-slate-950">
                            {formatPeso(scanPricing.low)} - {formatPeso(scanPricing.high)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">Recommended</p>
                          <p className="text-sm font-semibold text-amber-700">{formatPeso(scanEstimateTotal)}</p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {scanEstimateItems.map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                              <p className="text-xs text-slate-500">Aligned to the uploaded damage map and panel severity</p>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{item.included ? 'Included' : formatPeso(item.amount)}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-xl">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Customer Confirms</p>
                      <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Ready to move forward?</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Confirm the AI recommendation to continue to booking with the selected vehicle and estimated cost context.
                      </p>

                      <div className="mt-5 flex flex-col gap-3">
                        <button
                          onClick={() => openBookingModal(selectedScanVehicle || undefined)}
                          disabled={!scanComplete}
                          className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${!scanComplete ? 'cursor-not-allowed bg-white/10 text-slate-500' : 'bg-white text-slate-950 shadow-lg hover:-translate-y-0.5'}`}
                        >
                          {scanComplete ? '✓ Confirm and Book Service' : scanAnalyzing ? 'Analysis in progress...' : 'Complete AI analysis to proceed'}
                        </button>
                        <button
                          onClick={() => setAddVehicleOpen(true)}
                          className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/85 transition-colors hover:border-white/30 hover:text-white"
                        >
                          Update vehicle profile
                        </button>
                      </div>

                      <p className="mt-4 text-xs text-slate-400">
                        {scanUploads.length > 0
                          ? `Estimate prepared for ${selectedScanVehicle?.name || 'your selected vehicle'}.`
                          : 'Upload at least one vehicle image to unlock the AI estimate flow.'}
                      </p>
                    </div>
                  </section>
                </div>
              </div>
            ) : activeSection === 'documents' ? (
              <div className="space-y-6 pb-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[22px] font-semibold text-slate-900 tracking-tight">Documents</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Download service records, intake forms, and generated reports.</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1">
                    {documents.length} file{documents.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                  {documents.length === 0 ? (
                    <div className="p-10 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
                        <iconify-icon icon="solar:document-text-linear" width="24" className="text-slate-300"></iconify-icon>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">No documents available yet</p>
                      <p className="text-xs text-slate-500 mt-1">Book a service or run a scan to generate your first document.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${doc.type === 'report' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            <iconify-icon icon={doc.icon || 'solar:file-text-bold'} width="20"></iconify-icon>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">{doc.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{doc.desc}</p>
                            <p className="text-xs text-slate-400 mt-1">{doc.date}</p>
                          </div>
                          <button
                            onClick={() => downloadDocument(doc)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-colors"
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : activeSection === 'payments' ? (
              <div className="space-y-6 pb-10">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-[22px] font-semibold text-slate-900 tracking-tight">Payment History</h2>
                    <p className="text-sm text-slate-500 mt-0.5">All reservation fees and full payments per booking.</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1">
                    {myBookings.filter((b: any) => !['pending', 'cancelled', 'failed'].includes(normTrackerStr(b?.status))).length} booking{myBookings.filter((b: any) => !['pending', 'cancelled', 'failed'].includes(normTrackerStr(b?.status))).length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Bookings</p>
                    <p className="text-2xl font-bold text-slate-900">{myBookings.filter((b: any) => !['pending', 'cancelled', 'failed'].includes(normTrackerStr(b?.status))).length}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Reservation Fees</p>
                    <p className="text-2xl font-bold text-indigo-600">
                      ₱{(myBookings.filter((b: any) => ['approved', 'confirmed', 'received', 'in_progress', 'completed', 'released', 'paid'].includes(normTrackerStr(b?.status))).length * 500).toLocaleString()}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Full Payments</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      ₱{myBookings
                          .filter((b: any) => {
                            const s = normTrackerStr(b?.status);
                            return String(b.paymentStatus || '').toLowerCase() === 'paid' || ['completed', 'released', 'paid'].includes(s);
                          })
                          .reduce((sum: number, b: any) => sum + Number(b.totalPrice || b.totalAmount || 0), 0)
                          .toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Payment List */}
                    {myBookings.filter((b: any) => !['pending', 'cancelled', 'failed'].includes(normTrackerStr(b?.status))).length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
                      <iconify-icon icon="solar:card-2-linear" width="24" className="text-slate-300"></iconify-icon>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">No payment records yet</p>
                    <p className="text-xs text-slate-500 mt-1">Book a service to see your payment history here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...myBookings]
                      .filter((b: any) => !['pending', 'cancelled', 'failed'].includes(normTrackerStr(b?.status)))
                      .sort((a: any, b: any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime())
                      .map((b: any) => {
                        const orderId = b.id || b._id;
                        const st = normTrackerStr(b?.status);
                        const total = Number(b.totalPrice || b.totalAmount || 0);
                        const remaining = Math.max(total - 500, 0);
                        const vehicle = [b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(' ') || b.vehicleInfo || '—';
                        const dateStr = b.date || b.bookingDate || b.createdAt;
                        const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                        const proofUrl: string | null = (b as any).paymentProofUrl || (b as any).downpaymentProof || null;

                        const reservationStatesPaid = [
                          'approved',
                          'confirmed',
                          'assigned',
                          'received',
                          'in_progress',
                          'ready_for_payment',
                          'completed',
                          'released',
                          'paid',
                        ];
                        const reservationPaid = reservationStatesPaid.includes(st) || Boolean(proofUrl);
                        const resvBadge = reservationPaid ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Paid</span>
                        ) : st === 'rejected' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">Rejected</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">Pending</span>
                        );

                        // Treat as paid if: paymentStatus is 'paid' OR order is completed/released/paid
                        // (handles existing orders created before the paymentStatus=paid backend fix)
                        const isFullyPaid = String(b.paymentStatus || '').toLowerCase() === 'paid' || ['completed', 'released', 'paid'].includes(st);
                        const fullBadge = isFullyPaid
                          ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">✓ Paid</span>
                          : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200">Pending</span>;

                        return (
                          <div key={orderId} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden hover:border-slate-300 transition-colors">
                            {/* Booking Header */}
                            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <iconify-icon icon="solar:card-bold" width="16" className="text-indigo-500 shrink-0"></iconify-icon>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">{b.orderNumber || b.bookingReference || String(orderId).slice(-8)}</p>
                                  <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">{b.serviceName || b.serviceType || 'Service'}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-3">
                                <p className="text-[10px] text-slate-400">{formattedDate}</p>
                                <p className="text-xs font-bold text-slate-700 mt-0.5">{vehicle}</p>
                              </div>
                            </div>

                            {/* Payment Rows */}
                            <div className="divide-y divide-slate-100">
                              {/* Row 1: Reservation Fee */}
                              <div className="flex items-center justify-between px-5 py-3.5 gap-3 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                    <iconify-icon icon="solar:lock-keyhole-minimalistic-linear" width="15" className="text-indigo-500"></iconify-icon>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-700">Reservation Fee</p>
                                    <p className="text-[10px] text-slate-400">Paid online via GCash</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 ml-auto">
                                  {proofUrl && (
                                    <button
                                      onClick={() => setPaymentLightboxUrl(proofUrl)}
                                      className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition-colors"
                                    >
                                      <iconify-icon icon="solar:gallery-linear" width="12"></iconify-icon>
                                      View proof
                                    </button>
                                  )}
                                  {resvBadge}
                                  <span className="text-sm font-bold text-slate-900 w-16 text-right">₱500</span>
                                </div>
                              </div>

                              {/* Row 2: Full Payment */}
                              <div className="flex items-center justify-between px-5 py-3.5 gap-3 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                                    <iconify-icon icon="solar:wallet-money-linear" width="15" className="text-emerald-600"></iconify-icon>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-700">Full Payment</p>
                                    <p className="text-[10px] text-slate-400">Paid onsite upon service completion</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                                  <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                                    {fullBadge}
                                    {isFullyPaid && (
                                      <button
                                        type="button"
                                        onClick={() => void openCustomerOrderReceiptPdf(String(orderId))}
                                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 transition-colors"
                                      >
                                        <iconify-icon icon="solar:bill-list-linear" width="12"></iconify-icon>
                                        View receipt
                                      </button>
                                    )}
                                  </div>
                                  <span className="text-sm font-bold text-slate-900 min-w-[4.5rem] text-right tabular-nums">
                                    {remaining > 0 ? `₱${remaining.toLocaleString()}` : '—'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Total Row */}
                            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total</p>
                              <p className="text-base font-bold text-slate-900">{total > 0 ? `₱${total.toLocaleString()}` : '—'}</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {orderReceiptPdfUrl && (
                  <div
                    className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm p-4"
                    onClick={closeCustomerOrderReceiptPdf}
                  >
                    <div
                      className="relative w-full max-w-3xl flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <p className="text-sm font-bold text-slate-800">Payment receipt</p>
                        <button
                          type="button"
                          onClick={closeCustomerOrderReceiptPdf}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                        >
                          Close
                        </button>
                      </div>
                      <iframe title="Receipt PDF" src={orderReceiptPdfUrl} className="w-full flex-1 min-h-[70vh] border-0 bg-slate-100" />
                    </div>
                  </div>
                )}

                {/* Lightbox */}
                {paymentLightboxUrl && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={() => setPaymentLightboxUrl(null)}
                  >
                    <div className="relative max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setPaymentLightboxUrl(null)}
                        className="absolute -top-10 right-0 text-white/80 hover:text-white text-sm font-semibold flex items-center gap-1"
                      >
                        <iconify-icon icon="solar:close-circle-linear" width="20"></iconify-icon>
                        Close
                      </button>
                      <img
                        src={paymentLightboxUrl}
                        alt="Payment proof"
                        className="w-full rounded-2xl shadow-2xl border-2 border-white/10"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x300?text=Image+not+found'; }}
                      />
                      <p className="text-center text-white/60 text-xs mt-3">GCash Payment Proof</p>
                    </div>
                  </div>
                )}
              </div>
            ) : activeSection === 'rewards' ? (
              <div className="space-y-6 pb-10">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Loyalty</p>
                  <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-slate-950">Rewards Center</h2>
                  <p className="mt-1 text-sm text-slate-500">Earn points from completed services and redeem premium perks.</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
                      <iconify-icon icon="solar:star-bold" width="16"></iconify-icon>
                      {formattedLoyaltyPoints} points
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                      Tier: {rewardTier}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {rewardCatalog.map((reward) => {
                    const canRedeem = customerStats.loyaltyPoints >= reward.points;
                    return (
                      <div key={reward.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{reward.points} pts</p>
                        <h3 className="mt-2 text-base font-semibold text-slate-900">{reward.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{reward.desc}</p>
                        <button
                          onClick={() => redeemReward(reward)}
                          className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${canRedeem ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                        >
                          {canRedeem ? `Redeem (${reward.code})` : 'Not enough points'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {rewardRedeemMessage && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
                    {rewardRedeemMessage}
                  </div>
                )}
              </div>
            ) : activeSection === 'tracker' ? (
              /* ═══ Live Tracker ═══ */
              (() => {
                const activeBooking = pickCustomerLiveTrackerBooking(myBookings);
                const TRACKER_STEPS = [
                  { id: 'confirmed', label: 'Appointment Confirmed', icon: 'solar:calendar-bold' },
                  { id: 'received', label: 'Vehicle Arrive', icon: 'solar:garage-bold' },
                  { id: 'in_progress', label: 'Service In Progress', icon: 'solar:wrench-bold' },
                  { id: 'completed', label: 'Quality Check', icon: 'solar:shield-check-bold' },
                  { id: 'paid', label: 'Ready for Pickup', icon: 'solar:car-bold' },
                ];
                // Match premium dashboard tracker: QC `serviceTrackingStage` drives substeps; status is fallback.
                const trackingStage = (activeBooking as any)?.serviceTrackingStage;
                const tsKey = normTrackerStr(trackingStage);
                const stageMap: Record<string, number> = {
                  confirmed: 0,
                  received: 1,
                  in_progress: 2,
                  quality_check: 3,
                  ready_pickup: 4,
                  completed: 4,
                  released: 4,
                };
                const status = activeBooking ? String(activeBooking.status || '').toLowerCase() : '';
                const statusFallback: Record<string, number> = {
                  approved: 0,
                  confirmed: 0,
                  assigned: 0,
                  received: 1,
                  in_progress: 2,
                  'in-progress': 2,
                  ready_for_payment: 4,
                  completed: 4,
                  paid: 4,
                  released: 4,
                  done: 4,
                };
                const rawStep = activeBooking
                  ? (trackingStage
                    ? (stageMap[tsKey] ?? 0)
                    : (statusFallback[status] ?? 0))
                  : -1;
                const qcGatePhotoCount = activeBooking
                  ? getCustomerStageSlotPhotos(activeBooking as any, 'quality_check').length
                  : 0;
                let currentStep = rawStep;
                if (activeBooking && tsKey === 'quality_check' && qcGatePhotoCount >= customerGateMinSlotCount('quality_check')) {
                  currentStep = Math.max(currentStep, TRACKER_STEPS.length - 1);
                }
                const readyPickupCountSimple = activeBooking
                  ? getCustomerStageSlotPhotos(activeBooking as any, 'ready_pickup').length
                  : 0;
                if (activeBooking && readyPickupCountSimple >= CUSTOMER_TRACKER_GATE_MIN_PHOTOS) {
                  currentStep = Math.max(currentStep, TRACKER_STEPS.length - 1);
                }
                currentStep = bumpCustomerTrackerIndexForReceivedGateComplete(activeBooking, currentStep, 'dashboard5');
                currentStep = bumpCustomerTrackerIndexForInProgressGateComplete(activeBooking, currentStep, 'dashboard5');

                return (
                  <div className="max-w-3xl mx-auto pb-12 space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 mb-1">Live Tracker</h2>
                      <p className="text-sm text-slate-500">Track your vehicle service in real time.</p>
                    </div>

                    {!activeBooking ? (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <iconify-icon icon="solar:routing-2-linear" width="28" style={{ color: '#94a3b8' }}></iconify-icon>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">No Active Service</h3>
                        <p className="text-sm text-slate-500 mb-4">You don't have a vehicle currently being serviced. Book a service to start tracking.</p>
                        <button onClick={() => nav('bookings')} className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors">
                          View My Bookings
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Status Banner */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Service In Progress</p>
                                <p className="text-xs text-slate-500">Live updates enabled</p>
                              </div>
                            </div>
                            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">LIVE</span>
                          </div>

                          {/* Vehicle Info */}
                          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-50">
                            <div>
                              <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Vehicle</p>
                              <p className="text-sm font-semibold text-slate-900">{[activeBooking.vehicleYear, activeBooking.vehicleMake, activeBooking.vehicleModel].filter(Boolean).join(' ') || activeBooking.vehicleInfo || '—'}</p>
                              <p className="text-xs text-slate-500">{activeBooking.vehicleColor || ''} {activeBooking.vehiclePlate ? `• ${activeBooking.vehiclePlate}` : ''}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Service</p>
                              <p className="text-sm font-semibold text-slate-900">{activeBooking.serviceName || '—'}</p>
                            </div>
                          </div>

                          {/* Progress Steps */}
                          <div className="px-6 py-5">
                            <div className="space-y-0">
                              {TRACKER_STEPS.map((step, idx) => {
                                const isDone = idx < currentStep;
                                const isActive = idx === currentStep;
                                const isPending = idx > currentStep;
                                return (
                                  <div key={step.id} className="flex items-start gap-4">
                                    {/* Vertical line + dot */}
                                    <div className="flex flex-col items-center">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-slate-900 text-white ring-4 ring-slate-200' : 'bg-slate-100 text-slate-400'}`}>
                                        {isDone ? (
                                          <iconify-icon icon="solar:check-read-bold" width="16"></iconify-icon>
                                        ) : (
                                          <iconify-icon icon={step.icon} width="16"></iconify-icon>
                                        )}
                                      </div>
                                      {idx < TRACKER_STEPS.length - 1 && (
                                        <div className={`w-0.5 h-8 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`}></div>
                                      )}
                                    </div>
                                    {/* Text */}
                                    <div className="pt-1 pb-4 min-w-0 flex-1">
                                      <p className={`text-sm font-semibold ${isDone ? 'text-emerald-700' : isActive ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</p>
                                      {(() => {
                                        const apiStage = DASHBOARD_TRACKER_STEP_MEDIA_STAGE[step.id];
                                        const desc = resolveTrackerStageDescription(activeBooking as any, apiStage);
                                        const shots = apiStage ? getCustomerStageSlotPhotos(activeBooking as any, apiStage) : [];
                                        const thumbDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                                        const qcEvidenceGrid =
                                          apiStage === 'quality_check' ? 'mt-2 grid max-w-xs grid-cols-1 gap-2' : 'mt-2 grid grid-cols-2 gap-2 max-w-xs';
                                        return (
                                          <>
                                            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{desc}</p>
                                            {shots.length > 0 && (isDone || isActive) ? (
                                              <div className={qcEvidenceGrid}>
                                                {shots.map((s, shotIdx) => (
                                                  <div key={s.label} className="min-w-0">
                                                    <p className="text-[10px] font-semibold text-slate-500 truncate mb-0.5">{s.label}</p>
                                                    <button
                                                      type="button"
                                                      className="block w-full cursor-zoom-in rounded-lg border border-slate-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-orange-200"
                                                      aria-label={`${step.label} — ${s.label} — enlarge`}
                                                      onClick={() =>
                                                        setTrackerEvidenceLightbox({
                                                          stepTitle: step.label,
                                                          items: shots.map((x) => ({ url: x.url, label: x.label })),
                                                          index: shotIdx,
                                                        })
                                                      }
                                                    >
                                                      <img src={toCloudinaryEvidenceThumbUrl(s.url, thumbDpr)} alt="" className="w-full h-24 object-cover" />
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : isActive && apiStage === 'quality_check' && shots.length === 0 ? (
                                              <p className="text-xs text-amber-700 mt-2 font-medium leading-snug">
                                                Upload pending — awaiting QC form photo from the shop.
                                              </p>
                                            ) : null}
                                          </>
                                        );
                                      })()}
                                      {isActive && <p className="text-xs text-amber-600 mt-0.5 font-medium">● Current stage</p>}
                                      {isDone && <p className="text-xs text-slate-400 mt-0.5">Completed</p>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Detailer Info */}
                        {activeBooking.assignedDetailer && typeof activeBooking.assignedDetailer === 'object' && (
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-3">Assigned Specialist</p>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                {((activeBooking.assignedDetailer as any).name || 'S').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{(activeBooking.assignedDetailer as any).name || 'Specialist'}</p>
                                <p className="text-xs text-slate-500 capitalize">{(activeBooking.assignedDetailer as any).role || 'Detailer'}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {activeBooking.notes && (
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">Staff Notes</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{activeBooking.notes}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()
            ) : activeSection === 'settings' ? (
              <div className="max-w-2xl mx-auto space-y-8 pb-12">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-1">Account Settings</h2>
                  <p className="text-sm text-slate-500">Manage your profile, security, and notification preferences.</p>
                </div>

                {/* Profile */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2"><iconify-icon icon="solar:user-circle-linear" width="18"></iconify-icon> Profile Information</h3>
                  </div>
                  <form onSubmit={handleProfileSave} className="p-6 space-y-5" noValidate>
                    {profileSaved && <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-4 py-2 text-sm"><iconify-icon icon="solar:check-circle-linear" width="18"></iconify-icon> Profile saved successfully!</div>}
                    {profileErrors.form && <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-100 rounded-md px-4 py-2 text-sm"><iconify-icon icon="solar:danger-circle-linear" width="18"></iconify-icon> {profileErrors.form}</div>}

                    {/* Avatar Upload */}
                    <div className="flex items-center gap-5 pb-4 border-b border-slate-100">
                      <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-upload-input')?.click()}>
                        <div className="w-20 h-20 rounded-full bg-[#eff6ff] flex items-center justify-center text-[#1d4ed8] font-bold text-3xl shadow-sm overflow-hidden border border-slate-200">
                          {(profile as any).avatarPreview ? (
                            <img src={(profile as any).avatarPreview} alt="Profile" className="w-full h-full object-cover" />
                          ) : user?.avatar ? (
                            <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            (user?.name || 'C').charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                          <iconify-icon icon="solar:camera-add-linear" width="24" style={{ color: 'white' }}></iconify-icon>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-slate-900">Profile Photo</h4>
                        <p className="text-xs text-slate-500 mt-0.5 mb-2">Recommended: Square JPG or PNG, max 2MB.</p>
                        <input id="avatar-upload-input" type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              setProfileErrors({ form: 'Image must be under 2MB.' });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onloadend = () => setProfile(p => ({ ...p, avatarPreview: reader.result as string }));
                            reader.readAsDataURL(file);
                          }
                        }} />
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => document.getElementById('avatar-upload-input')?.click()} className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md transition-colors shadow-sm">
                            Upload Photo
                          </button>
                          {((profile as any).avatarPreview || user?.avatar) && (
                            <button type="button" onClick={() => setProfile(p => ({ ...p, avatarPreview: '' }))} className="px-3 py-1.5 text-slate-500 hover:text-red-600 text-xs font-medium transition-colors">
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Name</label>
                      <input value={profile.fullName} onChange={e => { setProfile(p => ({ ...p, fullName: e.target.value })); setProfileErrors(er => ({ ...er, fullName: '' })); }}
                        className={`w-full px-3 py-2 rounded-md border text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${profileErrors.fullName ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                        placeholder="Your full name" />
                      {profileErrors.fullName && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><iconify-icon icon="solar:danger-circle-linear" width="14"></iconify-icon>{profileErrors.fullName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Email Address <span className="text-[10px] text-slate-400 font-normal ml-1">— cannot be changed</span></label>
                      <div className="relative">
                        <input type="email" value={profile.email} readOnly disabled
                          className="w-full px-3 py-2 pr-9 rounded-md border border-slate-200 text-sm bg-slate-50 text-slate-500 outline-none cursor-not-allowed"
                          placeholder="you@email.com" />
                        <iconify-icon icon="solar:lock-keyhole-bold" width="14" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1' }}></iconify-icon>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Phone Number</label>
                      <input type="tel" value={profile.phone} onChange={e => { setProfile(p => ({ ...p, phone: e.target.value })); setProfileErrors(er => ({ ...er, phone: '' })); }}
                        className={`w-full px-3 py-2 rounded-md border text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${profileErrors.phone ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                        placeholder="+63 912 000 0000" />
                      {profileErrors.phone && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><iconify-icon icon="solar:danger-circle-linear" width="14"></iconify-icon>{profileErrors.phone}</p>}
                    </div>
                    <div className="flex justify-end pt-1">
                      <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm">Save Changes</button>
                    </div>
                  </form>
                </div>

                {/* Password */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2"><iconify-icon icon="solar:lock-password-linear" width="18"></iconify-icon> Change Password</h3>
                  </div>
                  <form onSubmit={handlePasswordSave} className="p-6 space-y-5" noValidate>
                    {passwordSaved && <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-4 py-2 text-sm"><iconify-icon icon="solar:check-circle-linear" width="18"></iconify-icon> Password changed successfully!</div>}
                    {passwordErrors.form && !passwordSaved && (
                      <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-100 rounded-md px-4 py-2 text-sm">
                        <iconify-icon icon="solar:danger-circle-linear" width="18"></iconify-icon>
                        {passwordErrors.form}
                      </div>
                    )}
                    {(['current', 'newPass', 'confirm'] as const).map((key) => {
                      const labels = { current: 'Current Password', newPass: 'New Password', confirm: 'Confirm New Password' };
                      const hints = { current: '', newPass: 'Min 8 characters, upper & lowercase, one number, one special (!@#*…)', confirm: '' };
                      return (
                        <div key={key}>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">{labels[key]}</label>
                          <div className="relative">
                            <input type={showPass[key] ? 'text' : 'password'} value={passwords[key]}
                              onChange={e => { setPasswords(p => ({ ...p, [key]: e.target.value })); setPasswordErrors(er => ({ ...er, [key]: '' })); }}
                              className={`w-full px-3 py-2 pr-10 rounded-md border text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${passwordErrors[key] ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                              placeholder="••••••••" />
                            <button type="button" onClick={() => setShowPass(p => ({ ...p, [key]: !p[key] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              <iconify-icon icon={showPass[key] ? 'solar:eye-closed-linear' : 'solar:eye-linear'} width="16"></iconify-icon>
                            </button>
                          </div>
                          {hints[key] && !passwordErrors[key] && <p className="mt-1 text-xs text-slate-400">{hints[key]}</p>}
                          {passwordErrors[key] && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><iconify-icon icon="solar:danger-circle-linear" width="14"></iconify-icon>{passwordErrors[key]}</p>}
                        </div>
                      );
                    })}
                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={passwordSubmitting}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:pointer-events-none text-white text-sm font-medium rounded-md transition-colors shadow-sm"
                      >
                        {passwordSubmitting ? 'Updating…' : 'Update Password'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Notifications */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2"><iconify-icon icon="solar:bell-linear" width="18"></iconify-icon> Notification Preferences</h3>
                  </div>
                  <div className="p-6 divide-y divide-slate-100">
                    {([
                      { key: 'bookingUpdates', label: 'Booking Updates', desc: 'Confirmations and changes to your appointments.' },
                      { key: 'serviceStatus', label: 'Live Service Status', desc: 'Real-time updates while your vehicle is in service.' },
                      { key: 'promotions', label: 'Promotions & Offers', desc: 'Exclusive deals and seasonal discounts.' },
                      { key: 'reminders', label: 'Service Reminders', desc: 'Upcoming appointment and maintenance reminders.' },
                    ] as const).map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                        </div>
                        <button type="button" onClick={() => setNotifs(n => ({ ...n, [key]: !n[key] }))}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${notifs[key] ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                          <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ${notifs[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">

                {/* Service Overview Strip */}
                <div className="customer-overview-grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="customer-overview-card rounded-2xl border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-slate-500">Current Status</span>
                        {customerStats.currentStatus ? (
                          <div className="mt-2 flex min-w-0 items-center gap-2 text-blue-700">
                            <span className="relative flex h-2.5 w-2.5 shrink-0">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60"></span>
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600"></span>
                            </span>
                            <span className="truncate text-base font-bold">{customerStats.currentStatus}</span>
                          </div>
                        ) : (
                          <span className="mt-2 block truncate text-base font-bold text-slate-900">No active service</span>
                        )}
                      </div>
                      <div className="customer-overview-icon bg-blue-50 text-blue-600">
                        <iconify-icon icon="solar:shield-check-linear" width="19"></iconify-icon>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">Live queue and service progress</p>
                  </div>

                  <div className="customer-overview-card rounded-2xl border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-slate-500">Next Appointment</span>
                        <span className={`mt-2 block truncate text-base font-bold ${customerStats.nextAppointment ? 'text-slate-900' : 'text-slate-400'}`}>
                          {customerStats.nextAppointment || 'None scheduled'}
                        </span>
                      </div>
                      <div className="customer-overview-icon bg-indigo-50 text-indigo-600">
                        <iconify-icon icon="solar:calendar-mark-linear" width="19"></iconify-icon>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">Confirmed bookings appear here</p>
                  </div>

                  <div className="customer-overview-card rounded-2xl border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-slate-500">Last Service</span>
                        <span className={`mt-2 block truncate text-base font-bold ${customerStats.lastService ? 'text-slate-900' : 'text-slate-400'}`}>
                          {customerStats.lastService || 'No past services'}
                        </span>
                      </div>
                      <div className="customer-overview-icon bg-slate-100 text-slate-600">
                        <iconify-icon icon="solar:history-2-linear" width="19"></iconify-icon>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">Most recent completed visit</p>
                  </div>

                  <div className="customer-overview-card rounded-2xl border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-slate-500">Loyalty Points</span>
                        <span className="mt-2 block truncate text-base font-bold text-slate-900">
                          {formattedLoyaltyPoints} pts
                        </span>
                      </div>
                      <div className="customer-overview-icon bg-amber-50 text-amber-600">
                        <iconify-icon icon="solar:star-linear" width="19"></iconify-icon>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500" style={{ width: `${rewardTierProgressPct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {nextRewardTier ? `${new Intl.NumberFormat(undefined).format(pointsToNextRewardTier)} pts to ${nextRewardTier.name}` : 'Top rewards tier active'}
                    </p>
                  </div>
                </div>

                {/* ── PENDING CONFIRMATION card ── */}
                {pendingConfirmationBooking && !hasActiveBooking && (() => {
                  const ref = pendingConfirmationBooking.bookingReference || pendingConfirmationBooking.orderNumber || '—';
                  const dateStr = pendingConfirmationBooking.bookingDate
                    ? new Date(pendingConfirmationBooking.bookingDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                    : '—';
                  return (
                    <section style={{ marginBottom: 32 }}>
                      <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes pcPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(1.12)}}
                        @keyframes pcSlide{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
                        @keyframes pcSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
                        @keyframes pcShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
                      `}} />
                      <div style={{ background: 'linear-gradient(145deg,#0c1220 0%,#121a2e 50%,#0a1018 100%)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 32px 64px -16px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.07)', animation: 'pcSlide .5s ease-out', position: 'relative' }}>
                        {/* Aurora glows */}
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: -80, right: -60, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,.1) 0%,transparent 65%)' }} />
                          <div style={{ position: 'absolute', bottom: -100, left: -40, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,158,11,.07) 0%,transparent 65%)' }} />
                        </div>

                        <div style={{ padding: '28px 28px 24px', position: 'relative', zIndex: 2 }}>
                          {/* Top row */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                {/* Spinning amber loader */}
                                <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2.5px solid rgba(245,158,11,.25)', borderTop: '2.5px solid #f59e0b', animation: 'pcSpin 1s linear infinite', flexShrink: 0 }} />
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.14em' }}>Awaiting Confirmation</span>
                              </div>
                              <h2 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 4px', letterSpacing: '-.03em', lineHeight: 1.1 }}>Payment Under Review</h2>
                              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', margin: 0, fontWeight: 500 }}>Our team is verifying your GCash payment. Please wait 1–3 minutes.</p>
                            </div>
                            <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 12, padding: '10px 16px', textAlign: 'center', flexShrink: 0 }}>
                              <p style={{ fontSize: 9, color: 'rgba(245,158,11,.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', margin: '0 0 2px' }}>Reference</p>
                              <p style={{ fontSize: 13, color: '#fbbf24', fontWeight: 800, margin: 0, letterSpacing: '.02em' }}>{ref}</p>
                            </div>
                          </div>

                          {/* Info row */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                            {[
                              { icon: 'solar:calendar-bold', label: 'Date', value: dateStr },
                              { icon: 'solar:clock-circle-bold', label: 'Time', value: pendingConfirmationBooking.bookingTime || '—' },
                              { icon: 'solar:shield-star-bold', label: 'Service', value: pendingConfirmationBooking.serviceType || pendingConfirmationBooking.serviceName || '—' },
                            ].map((item) => (
                              <div key={item.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <iconify-icon icon={item.icon} width="12" style={{ color: '#f59e0b' }}></iconify-icon>
                                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>{item.label}</span>
                                </div>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb', margin: 0, letterSpacing: '-.01em' }}>{item.value}</p>
                              </div>
                            ))}
                          </div>

                          {/* Progress dots */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {['Payment Received', 'Verifying Proof', 'Booking Approved'].map((label, i) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: i === 0 ? 'linear-gradient(135deg,#16a34a,#22c55e)' : i === 1 ? 'rgba(245,158,11,.15)' : 'rgba(255,255,255,.05)', border: i === 1 ? '2px solid rgba(245,158,11,.4)' : i === 0 ? '2px solid rgba(22,163,74,.3)' : '2px solid rgba(255,255,255,.08)' }}>
                                      {i === 0
                                        ? <iconify-icon icon="solar:check-circle-bold" width="12" style={{ color: '#fff' }}></iconify-icon>
                                        : i === 1
                                          ? <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', animation: 'pcPulse 1.5s ease-in-out infinite' }} />
                                          : <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,.15)' }} />}
                                    </div>
                                    <span style={{ fontSize: 9, color: i === 0 ? '#4ade80' : i === 1 ? '#fbbf24' : 'rgba(255,255,255,.2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{label}</span>
                                  </div>
                                  {i < 2 && <div style={{ width: 32, height: 1, background: i === 0 ? 'rgba(34,197,94,.3)' : 'rgba(255,255,255,.07)', marginBottom: 14 }} />}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <iconify-icon icon="solar:bell-bold" width="12" style={{ color: 'rgba(255,255,255,.3)' }}></iconify-icon>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontWeight: 500 }}>You will be notified once your booking is confirmed. Check your phone for updates.</span>
                        </div>
                      </div>
                    </section>
                  );
                })()}

                {/* ── REJECTED booking card ── */}
                {rejectedBooking && !hasActiveBooking && !pendingConfirmationBooking && (
                  <section style={{ marginBottom: 32 }}>
                    <div style={{ background: 'linear-gradient(145deg,#1a0a0a 0%,#1e0f0f 100%)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 40px rgba(239,68,68,.1), 0 0 0 1px rgba(239,68,68,.15)', position: 'relative', padding: '24px 24px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <iconify-icon icon="solar:close-circle-bold" width="22" style={{ color: '#ef4444' }}></iconify-icon>
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 4px', letterSpacing: '-.02em' }}>Booking Not Confirmed</h3>
                          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', margin: '0 0 12px', fontWeight: 500 }}>
                            {rejectedBooking.rejectionReason || 'Your payment proof could not be verified.'}
                          </p>
                          <button onClick={() => { setBookingOpen(true); setBookingStep(1); setBookingAgreed(false); setBookingTermsReachedEnd(false); setBookingDownpaymentProof(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.3)', borderRadius: 10, padding: '8px 16px', color: '#a5b4fc', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            <iconify-icon icon="solar:restart-bold" width="13"></iconify-icon>
                            Book Again
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* ── APPROVED / CONFIRMED — Bring your vehicle card ── */}
                {approvedBooking && !hasActiveBooking && (() => {
                  const ref = approvedBooking.bookingReference || approvedBooking.orderNumber || '—';
                  const dateStr = approvedBooking.bookingDate
                    ? new Date(approvedBooking.bookingDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                    : '—';
                  return (
                    <section style={{ marginBottom: 32 }}>
                      <div style={{ background: 'linear-gradient(145deg,#052e16 0%,#064e3b 50%,#022c22 100%)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 32px 64px -16px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.08)', position: 'relative', padding: '28px 28px 20px' }}>
                        {/* Glows */}
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: -80, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,197,94,.15) 0%,transparent 65%)' }} />
                        </div>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, position: 'relative', zIndex: 2 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,.2)' }} />
                              <span style={{ fontSize: 9, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.14em' }}>Booking Confirmed</span>
                            </div>
                            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 4px', letterSpacing: '-.03em', lineHeight: 1.1 }}>Please Bring Your Vehicle</h2>
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: 0, fontWeight: 500 }}>Your GCash payment has been verified. We're ready for you!</p>
                          </div>
                          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 12, padding: '10px 16px', textAlign: 'center', flexShrink: 0 }}>
                            <p style={{ fontSize: 9, color: 'rgba(34,197,94,.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', margin: '0 0 2px' }}>Reference</p>
                            <p style={{ fontSize: 13, color: '#4ade80', fontWeight: 800, margin: 0, letterSpacing: '.02em' }}>{ref}</p>
                          </div>
                        </div>
                        {/* Date/Time/Service row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20, position: 'relative', zIndex: 2 }}>
                          {[
                            { icon: 'solar:calendar-bold', label: 'Appointment', value: dateStr },
                            { icon: 'solar:clock-circle-bold', label: 'Time', value: approvedBooking.bookingTime || '—' },
                            { icon: 'solar:shield-star-bold', label: 'Service', value: approvedBooking.serviceType || approvedBooking.serviceName || '—' },
                          ].map((item) => (
                            <div key={item.label} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <iconify-icon icon={item.icon} width="12" style={{ color: '#22c55e' }}></iconify-icon>
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>{item.label}</span>
                              </div>
                              <p style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb', margin: 0, letterSpacing: '-.01em' }}>{item.value}</p>
                            </div>
                          ))}
                        </div>
                        {/* CTA */}
                        <div style={{ position: 'relative', zIndex: 2 }}>
                          <button
                            onClick={() => { setActiveSection('tracker'); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#16a34a,#22c55e)', border: 'none', borderRadius: 12, padding: '11px 20px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(34,197,94,.3)' }}
                          >
                            <iconify-icon icon="solar:routing-2-bold" width="16"></iconify-icon>
                            Open Live Tracker
                          </button>
                        </div>
                      </div>
                    </section>
                  );
                })()}

                {/* ── Live Service Tracker ── */}
                {hasActiveBooking && (() => {
                  const activeBooking = pickCustomerLiveTrackerBooking(myBookings);
                  const status = activeBooking ? String(activeBooking.status || '').toLowerCase() : '';
                  const trackingStage = (activeBooking as any)?.serviceTrackingStage;
                  const tsKey = normTrackerStr(trackingStage);
                  const paymentPaid = String(activeBooking?.paymentStatus || '').toLowerCase() === 'paid';
                  const postPayComplete =
                    paymentPaid &&
                    (status === 'completed' || status === 'released' || tsKey === 'released');
                  const stageMap: Record<string, number> = {
                    'confirmed': 0,
                    'received': 1,
                    'in_progress': 2,
                    'quality_check': 3,
                    'ready_pickup': 4,
                    'completed':     4,
                    'released':      4,
                  };
                  const statusFallback: Record<string, number> = {
                    'approved': 0, 'confirmed': 0, 'assigned': 0,
                    'received': 1,
                    'in_progress': 2, 'in-progress': 2,
                    'ready_for_payment': 4,
                    'completed': 4,
                    'paid': 4, 'released': 4, 'done': 4
                  };
                  const currentStepIdx = trackingStage
                    ? (stageMap[tsKey] ?? 0)
                    : (statusFallback[status] ?? 0);

                  const isFullyComplete = status === 'completed' || status === 'paid' || status === 'released'
                    || tsKey === 'ready_pickup' || tsKey === 'completed';
                  const STEPS = [
                    { id: 'confirmed', label: 'Appointment Confirmed', short: 'Confirmed', sub: 'Booking secured', detail: 'Appointment locked and ready for shop intake.', icon: 'solar:calendar-bold', time: formatTrackerClockLabel(activeBooking?.bookingTime), mediaId: 'confirmed' },
                    { id: 'received', label: 'Vehicle Arrived', short: 'Arrived', sub: 'Shop intake complete', detail: 'Vehicle is checked in and prepared for the service bay.', icon: 'solar:garage-bold', time: '25%', mediaId: 'received' },
                    { id: 'in_progress', label: 'Service In Progress', short: 'In Service', sub: 'Technician working now', detail: 'Certified technicians are working on your vehicle now.', icon: 'solar:wrench-bold', time: '50%', mediaId: 'in_progress' },
                    { id: 'completed', label: 'Quality Check', short: 'QC Review', sub: 'Final inspection', detail: 'QC verifies finish quality before pickup readiness.', icon: 'solar:shield-check-bold', time: '75%', mediaId: 'completed' },
                    { id: 'paid', label: 'Ready for Pickup', short: 'Pickup', sub: 'Handover ready', detail: 'Final handover is ready for customer pickup.', icon: 'solar:car-bold', time: '100%', mediaId: 'paid' },
                  ] as const;

                  const qcGatePhotoCountDash = activeBooking
                    ? getCustomerStageSlotPhotos(activeBooking as any, 'quality_check').length
                    : 0;
                  let displayStepIdx = currentStepIdx;
                  if (activeBooking && tsKey === 'quality_check' && qcGatePhotoCountDash >= customerGateMinSlotCount('quality_check')) {
                    displayStepIdx = Math.max(displayStepIdx, STEPS.length - 1);
                  }
                  const readyPickupGateCountDash = activeBooking
                    ? getCustomerStageSlotPhotos(activeBooking as any, 'ready_pickup').length
                    : 0;
                  if (activeBooking && readyPickupGateCountDash >= CUSTOMER_TRACKER_GATE_MIN_PHOTOS) {
                    displayStepIdx = Math.max(displayStepIdx, STEPS.length - 1);
                  }
                  displayStepIdx = bumpCustomerTrackerIndexForReceivedGateComplete(activeBooking, displayStepIdx, 'dashboard5');
                  displayStepIdx = bumpCustomerTrackerIndexForInProgressGateComplete(activeBooking, displayStepIdx, 'dashboard5');
                  const activeIdx = Math.min(Math.max(displayStepIdx, 0), STEPS.length - 1);
                  const pct = postPayComplete
                    ? 100
                    : getTrackerPipelineProgressPct({
                        serviceTrackingStage: trackingStage,
                        status: activeBooking?.status,
                      });
                  const activeStep = STEPS[activeIdx] || STEPS[0];
                  const nextStep = postPayComplete || isFullyComplete || activeIdx >= STEPS.length - 1
                    ? null
                    : STEPS[activeIdx + 1];
                  const updatedLabel = formatTrackerUpdatedLabel(activeBooking?.serviceTrackingUpdatedAt || activeBooking?.updatedAt || activeBooking?.createdAt);
                  const serviceTitle = displayServiceTitle(activeBooking?.serviceName || activeBooking?.serviceType || activeBooking?.packageName, 'AutoSPF+ service');
                  const vehicleTitle = [
                    activeBooking?.vehicleYear,
                    activeBooking?.vehicleMake,
                    activeBooking?.vehicleModel,
                  ].filter(Boolean).join(' ') || activeBooking?.vehicleInfo || 'Your vehicle';
                  const vehicleMeta = [
                    displayVehicleLabel(activeBooking?.vehiclePlate, ''),
                    formatTitleCaseDisplay(activeBooking?.vehicleColor, ''),
                  ].filter(Boolean).join(' / ') || 'Vehicle profile syncing';
                  const reference = activeBooking?.bookingReference || activeBooking?.orderNumber || activeBooking?._id || '';
                  const referenceLabel = reference && !looksLikeOpaqueTechnicalId(reference) ? reference : 'Confirmed job';
                  const assignments: { slot?: string; name?: string; role?: string }[] = activeBooking?.serviceStaffAssignments || [];
                  const assigned = assignments.filter(a => a.name?.trim());
                  const specialistLabel = assigned.length > 0
                    ? `${assigned.length} specialist${assigned.length === 1 ? '' : 's'} assigned`
                    : (activeBooking?.assignedDetailerName || activeBooking?.technicianName || activeBooking?.technician || 'QC team online');
                  const rewardProgressLabel = nextRewardTier
                    ? `${new Intl.NumberFormat(undefined).format(pointsToNextRewardTier)} pts to ${nextRewardTier.name}`
                    : 'Top tier active';
                  const stageNote = postPayComplete
                    ? 'Payment confirmed — thank you for choosing AutoSPF+. Your digital receipt reference is below.'
                    : nextStep
                    ? `${activeStep.detail} Next checkpoint: ${nextStep.label}.`
                    : activeStep.detail;
                  const trackerMotionStyle = {
                    '--tracker-progress': `${pct}%`,
                    '--tracker-progress-angle': `${pct * 3.6}deg`,
                  } as React.CSSProperties;

                  return (
                    <section className="customer-live-tracker-section">
                      <div className="customer-live-tracker" style={trackerMotionStyle}>
                        <div className="customer-live-tracker-header">
                          <div className="customer-live-title-block">
                            <div className="customer-live-eyebrow">
                              <span className="customer-live-dot" />
                              <span>Live Tracking</span>
	                            </div>
	                            <h2>{postPayComplete ? 'Service complete' : isFullyComplete ? 'Ready for pickup' : activeStep.label}</h2>
	                            <p>{serviceTitle} / {vehicleTitle}</p>
	                            <div className="customer-live-chip-row" aria-label="Live tracker details">
	                              <span>
	                                <iconify-icon icon="solar:bolt-circle-bold" width="13"></iconify-icon>
	                                {activeStep.short}
	                              </span>
	                              <span>
	                                <iconify-icon icon="solar:refresh-circle-bold" width="13"></iconify-icon>
	                                {updatedLabel}
	                              </span>
	                              <span>
	                                <iconify-icon icon="solar:hashtag-square-bold" width="13"></iconify-icon>
	                                {referenceLabel}
	                              </span>
	                            </div>
	                          </div>
	                          <div className="customer-live-header-actions">
	                            <button
	                              type="button"
	                              onClick={() => nav('tracker')}
	                              className="customer-live-open-button"
	                              aria-label="Open full live tracker"
	                              title="Open full live tracker"
	                            >
	                              <iconify-icon icon="solar:routing-2-bold" width="18"></iconify-icon>
	                              <span>Full Tracker</span>
	                            </button>
	                          </div>
	                        </div>

                        <div className="customer-live-command-grid">
                          <div className="customer-live-progress-panel">
	                            <div
	                              className="customer-live-progress-ring"
	                              aria-label={`Service ${pct}% complete`}
	                            >
                              <div>
                                <strong>{pct}%</strong>
	                                <span>complete</span>
	                              </div>
	                            </div>
	                            <div className="customer-live-progress-caption">
	                              <strong>{postPayComplete ? 'Service complete' : activeStep.label}</strong>
	                              <span>{postPayComplete ? 'Receipt issued' : nextStep ? `Next: ${nextStep.short}` : 'Pickup ready'}</span>
	                            </div>

	                            <div className="customer-live-summary-list">
                              <div>
                                <span>Vehicle</span>
                                <strong>{vehicleMeta}</strong>
                              </div>
                              <div>
                                <span>Team</span>
                                <strong>{specialistLabel}</strong>
                              </div>
                              <div>
                                <span>Reference</span>
                                <strong>{referenceLabel}</strong>
                              </div>
                            </div>
                          </div>

                          <div className="customer-live-status-panel">
                            <div className="customer-live-status-topline">
                              <div>
                                <span>Current Stage</span>
                                <strong>{postPayComplete ? 'Service complete' : isFullyComplete ? 'Ready for Pickup' : activeStep.label}</strong>
                              </div>
                              <div>
                                <span>Step</span>
	                                <strong>{activeIdx + 1} / {STEPS.length}</strong>
	                              </div>
	                            </div>
	                            <p className="customer-live-stage-note">{stageNote}</p>

	                            <div className="customer-live-rail" aria-hidden="true">
                              <div className="customer-live-rail-fill" style={{ width: `${pct}%` }} />
                              <div className="customer-live-rail-markers">
                                {STEPS.map((step, i) => {
                                  const isDone = postPayComplete || i < activeIdx || (isFullyComplete && i === activeIdx);
                                  const isActive = !postPayComplete && !isFullyComplete && i === activeIdx;
                                  return (
                                    <span
                                      key={step.id}
                                      className={`customer-live-rail-marker ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
                                      style={{ '--live-step-delay': `${i * 90}ms` } as React.CSSProperties}
                                    >
                                      <iconify-icon icon={isDone ? 'solar:check-circle-bold' : step.icon} width="13"></iconify-icon>
                                    </span>
                                  );
	                                })}
	                              </div>
	                            </div>
	                            <div className="customer-live-rail-labels" aria-hidden="true">
	                              {STEPS.map((step, i) => {
	                                const isDone = postPayComplete || i < activeIdx || (isFullyComplete && i === activeIdx);
	                                const isActive = !postPayComplete && !isFullyComplete && i === activeIdx;
	                                return (
	                                  <span
	                                    key={step.id}
	                                    className={`${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
	                                    style={{ '--live-step-delay': `${i * 90}ms` } as React.CSSProperties}
	                                  >
	                                    {step.short}
	                                  </span>
	                                );
	                              })}
	                            </div>

	                            <div className="customer-live-reward-panel">
                              <div>
                                <span>Rewards Balance</span>
                                <strong>{formattedLoyaltyPoints} pts</strong>
                              </div>
                              <div className="customer-live-reward-progress">
                                <span style={{ width: `${rewardTierProgressPct}%` }} />
                              </div>
                              <p>{rewardTier} tier / {rewardProgressLabel}</p>
                            </div>
                          </div>
                        </div>

                        <div className="customer-live-step-grid">
                          {STEPS.map((step, i) => {
                            const isDone = postPayComplete || i < activeIdx || (isFullyComplete && i === activeIdx);
                            const isActive = !postPayComplete && !isFullyComplete && i === activeIdx;
                            const mediaStageKey = DASHBOARD_TRACKER_STEP_MEDIA_STAGE[step.mediaId];
                            const shots = mediaStageKey ? getCustomerStageSlotPhotos(activeBooking as any, mediaStageKey) : [];
                            const thumbDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
                            const caption = resolveTrackerStageDescription(activeBooking as any, mediaStageKey);
                            const statusLabel = isDone ? 'Complete' : isActive ? 'Live now' : 'Upcoming';
                            const hasPhotos = shots.length > 0;
                            const isQcEvidence = mediaStageKey === 'quality_check';
                            /** Booking confirmation is informational only — no customer photo slot or "awaiting" state. */
                            const suppressEvidencePanel = step.id === 'confirmed' && !hasPhotos;
                            const evidenceGridClass = isQcEvidence
                              ? 'customer-live-evidence-grid mt-2 grid max-w-xs grid-cols-1 gap-2'
                              : 'customer-live-evidence-grid mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3';

                            return (
	                              <article
	                                key={step.id}
	                                className={`customer-live-step ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}${suppressEvidencePanel ? ' customer-live-step--confirmation' : ''}`}
	                                aria-current={isActive ? 'step' : undefined}
	                                style={{ '--live-step-delay': `${i * 95}ms` } as React.CSSProperties}
	                              >
	                                <div className="customer-live-step-main">
                                  <div className="customer-live-step-icon">
                                    <iconify-icon icon={isDone ? 'solar:check-read-bold' : step.icon} width="17"></iconify-icon>
                                  </div>
                                  <div className="customer-live-step-copy">
                                    <div>
                                      <h3>{step.label}</h3>
                                      <span>{statusLabel}</span>
                                    </div>
	                                    <p>{step.sub}</p>
	                                  </div>
	                                  <div className="customer-live-step-time">{step.time}</div>
	                                </div>

	                                {suppressEvidencePanel ? (
	                                  <div className="customer-live-confirm-summary" role="region" aria-label="Booking confirmation details">
	                                    <p className="customer-live-confirm-summary-lead">{caption || step.detail}</p>
	                                    <dl className="customer-live-confirm-summary-grid">
	                                      <div className="customer-live-confirm-summary-tile">
	                                        <dt>Service</dt>
	                                        <dd>{serviceTitle}</dd>
	                                      </div>
	                                      <div className="customer-live-confirm-summary-tile">
	                                        <dt>Vehicle</dt>
	                                        <dd>{vehicleTitle}</dd>
	                                        {vehicleMeta && vehicleMeta !== 'Vehicle profile syncing' ? (
	                                          <dd className="customer-live-confirm-summary-meta">{vehicleMeta}</dd>
	                                        ) : null}
	                                      </div>
	                                      <div className="customer-live-confirm-summary-tile">
	                                        <dt>Schedule</dt>
	                                        <dd>
	                                          {[
	                                            activeBooking?.bookingDate || (activeBooking as any)?.date,
	                                            activeBooking?.bookingTime || (activeBooking as any)?.time,
	                                          ]
	                                            .map((x) => String(x || '').trim())
	                                            .filter(Boolean)
	                                            .join(' · ') || 'We will remind you before your slot'}
	                                        </dd>
	                                      </div>
	                                      <div className="customer-live-confirm-summary-tile">
	                                        <dt>Reference</dt>
	                                        <dd className="customer-live-confirm-summary-ref">{referenceLabel}</dd>
	                                      </div>
	                                    </dl>
	                                    <p className="customer-live-confirm-summary-foot">
	                                      Bring your reference to reception for a quick check-in.
	                                    </p>
	                                  </div>
	                                ) : (hasPhotos || isDone || isActive) ? (
	                                  <div className="customer-live-step-evidence">
	                                    <div className="customer-live-evidence-meta">
	                                      <span>{isQcEvidence ? 'QC Form' : 'Customer Evidence'}</span>
	                                      <strong>
                                        {hasPhotos
                                          ? isQcEvidence
                                            ? '1 photo'
                                            : `${shots.length} photo${shots.length === 1 ? '' : 's'}`
                                          : isActive
                                            ? 'Upload pending'
                                            : 'Awaiting photo'}
                                      </strong>
	                                    </div>
	                                    <p>{caption || (hasPhotos ? 'Vehicle photos received.' : step.detail)}</p>
	                                    {hasPhotos ? (
                                      <div className={evidenceGridClass}>
                                        {shots.map((shot, shotIdx) => (
                                          <div key={shot.label} className="min-w-0">
                                            <p className="text-[10px] font-semibold text-slate-500 truncate mb-1">{shot.label}</p>
                                            <button
                                              type="button"
                                              className="customer-live-evidence-thumb cursor-zoom-in"
                                              aria-label={`${step.label} — ${shot.label} — enlarge`}
                                              onClick={() =>
                                                setTrackerEvidenceLightbox({
                                                  stepTitle: step.label,
                                                  items: shots.map((x) => ({ url: x.url, label: x.label })),
                                                  index: shotIdx,
                                                })
                                              }
                                            >
                                              <img src={toCloudinaryEvidenceThumbUrl(shot.url, thumbDpr)} alt="" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="customer-live-photo-placeholder">
                                        <iconify-icon icon="solar:camera-minimalistic-bold" width="18"></iconify-icon>
                                        <span>Awaiting photo</span>
                                      </div>
                                    )}
                                  </div>
	                                ) : null}
                              </article>
                            );
                          })}
                        </div>

                        <div className="customer-live-footer">
                          <span>
                            <iconify-icon icon="solar:shield-star-bold" width="14"></iconify-icon>
                            QC verified live tracker
                          </span>
                          <strong>{pct}% complete</strong>
                        </div>
                        {postPayComplete && (activeBooking as any)?.invoiceId && (
                          <div className="customer-live-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 8, paddingTop: 12 }}>
                            <span>
                              <iconify-icon icon="solar:bill-list-bold" width="14"></iconify-icon>
                              Digital receipt
                            </span>
                            <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{String((activeBooking as any).invoiceId)}</strong>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })()}



                {/* Your Vehicles */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium tracking-tight text-slate-900">Your Garage</h2>
                    <button
                      onClick={() => setAddVehicleOpen(true)}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <iconify-icon icon="solar:add-circle-linear"></iconify-icon>
                      Add Vehicle
                    </button>
                  </div>

                  {vehicles.length === 0 ? (
                    <div className="rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #312e81 100%)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                      <div className="relative px-8 py-10 flex flex-col items-center text-center overflow-hidden">
                        {/* Glow orbs */}
                        <div className="absolute -left-8 -top-8 w-36 h-36 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: '#818cf8' }} />
                        <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: '#6366f1' }} />
                        {/* Brand logo — image only, above empty state */}
                        <div className="relative z-10 flex justify-center mb-5">
                          <img
                            src="/images/autospf-logo.png"
                            alt="AutoSPF+"
                            className="h-14 w-auto max-w-[180px] object-contain"
                          />
                        </div>
                        <h3 className="text-white font-black text-[18px] mb-2">Your Garage is Empty</h3>
                        <p className="text-slate-400 text-[13px] font-medium mb-6 max-w-[260px] leading-relaxed">
                          Add your vehicle first — it auto-fills your details every time you book. Fast, easy, no repeat typing.
                        </p>
                        {/* Steps hint */}
                        <div className="flex items-center gap-2 mb-6">
                          {['Add Vehicle', 'Book Service', 'Track Live'].map((s, i) => (
                            <div key={s} className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={i === 0 ? { background: 'rgba(99,102,241,0.35)', border: '1px solid rgba(99,102,241,0.5)' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <span className="text-[10px] font-bold" style={{ color: i === 0 ? '#a5b4fc' : '#475569' }}>{i + 1}</span>
                                <span className="text-[11px] font-semibold" style={{ color: i === 0 ? '#c7d2fe' : '#475569' }}>{s}</span>
                              </div>
                              {i < 2 && <iconify-icon icon="solar:arrow-right-bold" width="12" style={{ color: '#334155' }}></iconify-icon>}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => setAddVehicleOpen(true)}
                          className="relative flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold text-[14px] transition-all hover:-translate-y-0.5"
                          style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 6px 20px rgba(99,102,241,0.5)' }}
                        >
                          <iconify-icon icon="solar:add-circle-bold" width="18"></iconify-icon>
                          Add Your First Vehicle
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {vehicles.map((v, i) => {
                        // Map color name to a gradient theme
                        const colorThemes: Record<string, { from: string; to: string; glow: string; text: string }> = {
                          white: { from: '#e2e8f0', to: '#94a3b8', glow: 'rgba(148,163,184,0.35)', text: '#334155' },
                          black: { from: '#1e293b', to: '#0f172a', glow: 'rgba(30,41,59,0.5)', text: '#94a3b8' },
                          silver: { from: '#cbd5e1', to: '#64748b', glow: 'rgba(100,116,139,0.4)', text: '#1e293b' },
                          gray: { from: '#94a3b8', to: '#475569', glow: 'rgba(71,85,105,0.4)', text: '#f1f5f9' },
                          blue: { from: '#3b82f6', to: '#1d4ed8', glow: 'rgba(59,130,246,0.4)', text: '#eff6ff' },
                          red: { from: '#ef4444', to: '#b91c1c', glow: 'rgba(239,68,68,0.4)', text: '#fff1f2' },
                          green: { from: '#22c55e', to: '#15803d', glow: 'rgba(34,197,94,0.4)', text: '#f0fdf4' },
                          yellow: { from: '#fbbf24', to: '#d97706', glow: 'rgba(251,191,36,0.4)', text: '#1c1917' },
                          orange: { from: '#f97316', to: '#c2410c', glow: 'rgba(249,115,22,0.4)', text: '#fff7ed' },
                        };
                        const colorKey = v.color?.toLowerCase() || 'white';
                        const theme = colorThemes[colorKey] || colorThemes['white'];

                        // Map vehicle type to icon
                        const typeIcons: Record<string, string> = {
                          hatchback: 'solar:car-2-bold', sedan: 'solar:car-bold',
                          midsized: 'solar:car-bold', suv: 'solar:bus-bold',
                          'pick up': 'solar:bus-bold', pickup: 'solar:bus-bold',
                          'large suv / van': 'solar:bus-bold', highend: 'solar:car-bold',
                          'highend sedan': 'solar:car-bold',
                        };
                        const vehicleIcon = typeIcons[(v.type || '').toLowerCase()] || 'solar:car-bold';

                        return (
                          <div
                            key={i}
                            className="customer-garage-card rounded-[28px] overflow-hidden flex flex-col group border border-white/65 backdrop-blur-2xl"
                            style={{
                              background: 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(248,250,252,0.34))',
                              boxShadow: '0 22px 70px -34px rgba(15,23,42,0.32), 0 8px 28px -24px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.86)',
                              transition: 'box-shadow 0.3s ease, transform 0.3s ease',
                              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                              backdropFilter: 'blur(24px) saturate(180%)',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 30px 86px -34px ${theme.glow}, 0 16px 42px -28px rgba(15,23,42,0.34), inset 0 1px 0 rgba(255,255,255,0.92)`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 22px 70px -34px rgba(15,23,42,0.32), 0 8px 28px -24px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.86)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                          >
                            {/* ── Card Banner ── */}
                            <div
                              className="customer-garage-card-banner relative h-36 flex items-center justify-center overflow-hidden"
                              style={{ background: `linear-gradient(135deg, ${theme.from}e6 0%, ${theme.to}d9 100%)` }}
                            >
                              {/* Decorative circles */}
                              <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full opacity-20" style={{ background: 'rgba(255,255,255,0.3)' }}></div>
                              <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full opacity-10" style={{ background: 'rgba(255,255,255,0.4)' }}></div>
                              {/* Car silhouette */}
                              <div className="relative z-10 flex flex-col items-center justify-center">
                                <iconify-icon icon={vehicleIcon} width="72" style={{ color: theme.text, opacity: 0.85, filter: `drop-shadow(0 4px 16px ${theme.glow})` }}></iconify-icon>
                              </div>
                              {/* Edit pencil — top-left */}
                              <button
                                onClick={() => openEditVehicle(v, i)}
                                className="absolute top-3 left-3 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                                style={{ background: 'rgba(255,255,255,0.28)', backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)', border: '1px solid rgba(255,255,255,0.42)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.42), 0 10px 28px -20px rgba(15,23,42,0.45)' }}
                                title="Edit vehicle"
                              >
                                <iconify-icon icon="solar:pen-bold" width="13" style={{ color: theme.text }}></iconify-icon>
                              </button>
                              {/* Delete button — top-right */}
                              <button
                                onClick={() => setDeleteConfirmIdx(i)}
                                className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                                style={{ background: 'rgba(255,255,255,0.28)', backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)', border: '1px solid rgba(255,255,255,0.42)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.42), 0 10px 28px -20px rgba(15,23,42,0.45)' }}
                                title="Delete vehicle"
                              >
                                <iconify-icon icon="solar:trash-bin-minimalistic-bold" width="13" style={{ color: theme.text }}></iconify-icon>
                              </button>
                              {/* Plate number bottom-left */}
                              <div className="absolute bottom-3 left-3 bg-white/78 backdrop-blur-xl border border-white/70 px-2.5 py-1 rounded-xl text-xs font-bold text-slate-800 tracking-widest shadow-[0_12px_28px_-20px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.8)]">
                                {v.plate}
                              </div>
                              {/* Type badge bottom-right */}
                              {v.type && (
                                <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
                                  style={{ background: 'rgba(255,255,255,0.28)', color: theme.text, backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)', border: '1px solid rgba(255,255,255,0.42)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.42), 0 10px 28px -22px rgba(15,23,42,0.45)' }}>
                                  {v.type}
                                </div>
                              )}

                              {/* ── Delete Confirm Overlay ── */}
                              <div
                                className="absolute inset-0 flex flex-col items-center justify-center z-20"
                                style={{
                                  background: 'rgba(15,10,10,0.72)',
                                  backdropFilter: 'blur(10px)',
                                  WebkitBackdropFilter: 'blur(10px)',
                                  opacity: deleteConfirmIdx === i ? 1 : 0,
                                  pointerEvents: deleteConfirmIdx === i ? 'auto' : 'none',
                                  transition: 'opacity 0.25s cubic-bezier(0.4,0,0.2,1)',
                                }}
                              >
                                <div style={{ transform: deleteConfirmIdx === i ? 'translateY(0)' : 'translateY(10px)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)' }}
                                  className="flex flex-col items-center gap-3 px-4">
                                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}>
                                    <iconify-icon icon="solar:trash-bin-minimalistic-bold" width="20" style={{ color: '#f87171' }}></iconify-icon>
                                  </div>
                                  <p className="text-white text-[13px] font-semibold text-center leading-snug">Remove <span style={{ color: '#f87171' }}>{v.plate}</span>?</p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setDeleteConfirmIdx(-1)}
                                      className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                                      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
                                    >Cancel</button>
                                    <button
                                      onClick={() => deleteVehicle(i)}
                                      className="px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
                                      style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 2px 12px rgba(239,68,68,0.4)' }}
                                    >Delete</button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* ── Card Body ── */}
                            <div className="customer-garage-card-body p-4 flex-1 flex flex-col bg-white/58 backdrop-blur-xl">
                              <h3 className="font-bold text-[15px] text-slate-900 leading-tight">{v.name}</h3>
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="w-3 h-3 rounded-full border border-slate-200 shadow-sm" style={{ background: colorThemes[colorKey]?.from || '#e2e8f0' }}></div>
                                <p className="text-xs text-slate-400">{v.color || 'No color'}</p>
                              </div>

                              {/* Actions */}
                              <div className="customer-garage-actions mt-4 grid grid-cols-2 gap-1.5 pt-3">
                                <button
                                  onClick={() => openBookingModal(v)}
                                  className="flex flex-col items-center justify-center gap-1 min-h-[52px] py-2 px-1 rounded-2xl transition-all font-medium"
                                  style={{ background: `linear-gradient(135deg, ${theme.from}1f, ${theme.to}2e)`, color: theme.to, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72), 0 12px 28px -24px rgba(15,23,42,0.24)' }}
                                >
                                  <iconify-icon icon="solar:calendar-add-linear" width="17"></iconify-icon>
                                  <span className="text-[10px] font-semibold text-center leading-tight">Book Service</span>
                                </button>
                                <button
                                  onClick={() => openVehicleHistory(v)}
                                  className="flex flex-col items-center justify-center gap-1 min-h-[52px] py-2 px-1 text-slate-400 hover:text-slate-700 transition-colors rounded-2xl hover:bg-white/56"
                                >
                                  <iconify-icon icon="solar:history-linear" width="17"></iconify-icon>
                                  <span className="text-[10px] font-semibold text-center leading-tight">View Vehicle History</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Service catalog — after garage: browse / plan without blocking status or booking alerts */}
                <CustomerDashboardServicesShowcase
                  vehicles={vehicles}
                  packages={bookingPackages}
                  getVehiclePriceKey={getVehiclePriceKey}
                  onOpenBooking={(opts) => {
                    void openBookingModal(undefined, opts?.presetPackageId ? { presetPackageId: opts.presetPackageId } : undefined);
                  }}
                />

                {/* Bottom Grid: Documents & Activity */}
                <div className="grid grid-cols-1 gap-8 pb-8 lg:grid-cols-2">

                  {/* AI & Documents */}
                  <section className="min-w-0">
                    <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">AI &amp; documents</h2>
                        <p className="mt-0.5 max-w-md text-[13px] leading-relaxed text-slate-500">
                          Service reports and intake summaries from your bookings — written for people, not internal IDs.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => nav('documents')}
                        className="shrink-0 text-[13px] font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
                      >
                        View all
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.2)]">
                      {documents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                            <iconify-icon icon="solar:folder-with-files-linear" width="28" className="text-slate-300"></iconify-icon>
                          </div>
                          <p className="text-[15px] font-semibold text-slate-900">Nothing here yet</p>
                          <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-slate-500">
                            After each visit, completion summaries and intake details will appear in this list.
                          </p>
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {documents.map((doc, i) => (
                            <li key={doc.id ?? i}>
                              <button
                                type="button"
                                onClick={() => nav('documents')}
                                className="group flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/25 sm:gap-5 sm:px-6 sm:py-5"
                              >
                                <div
                                  className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
                                    doc.type === 'report'
                                      ? 'bg-indigo-50 text-indigo-600 ring-indigo-100/90'
                                      : doc.type === 'waiver'
                                        ? 'bg-emerald-50 text-emerald-600 ring-emerald-100/90'
                                        : 'bg-slate-50 text-slate-600 ring-slate-100'
                                  }`}
                                >
                                  <iconify-icon icon={doc.icon} width="22" height="22" className="shrink-0"></iconify-icon>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[15px] font-semibold leading-snug tracking-tight text-slate-900 transition-colors group-hover:text-indigo-700">
                                    {doc.title}
                                  </p>
                                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{doc.desc}</p>
                                </div>
                                <div className="shrink-0 pt-0.5">
                                  {doc.type === 'report' ? (
                                    <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                                      Signed
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900/90">
                                      Action needed
                                    </span>
                                  )}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>

                  {/* Recent Activity */}
                  <section className="min-w-0">
                    <div className="mb-5">
                      <h2 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Recent activity</h2>
                      <p className="mt-0.5 max-w-md text-[13px] leading-relaxed text-slate-500">
                        A short timeline of each booking — newest first, with plain-language status labels.
                      </p>
                    </div>

                    <div className="flex min-h-[280px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.2)]">
                      {activities.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
                          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                            <iconify-icon icon="solar:history-linear" width="28" className="text-slate-300"></iconify-icon>
                          </div>
                          <p className="text-[15px] font-semibold text-slate-900">No updates yet</p>
                          <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-slate-500">
                            When you book or your service status changes, a clean entry will appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="flex-1 px-2 py-5 sm:px-5 sm:py-6">
                          <ul className="relative">
                            <div
                              className="pointer-events-none absolute bottom-2 left-[15px] top-3 w-px bg-gradient-to-b from-indigo-200 via-slate-200 to-transparent sm:left-[17px]"
                              aria-hidden
                            />
                            {activities.map((activity: any, i) => (
                              <li key={activity.id ?? i} className="relative flex gap-4 pb-8 pl-1 last:pb-1 sm:gap-5">
                                <div className="relative z-10 flex w-8 shrink-0 justify-center pt-1 sm:w-9">
                                  <span
                                    className={`mt-0.5 block size-2.5 rounded-full ring-[5px] ring-white sm:size-3 ${
                                      i === 0 ? 'bg-indigo-500 shadow-[0_0_0_1px_rgba(129,140,248,0.55)]' : 'bg-slate-300'
                                    }`}
                                  />
                                </div>
                                <div className="-mt-0.5 min-w-0 flex-1 pb-1">
                                  <p className="text-[15px] font-semibold leading-snug tracking-tight text-slate-900">{activity.title}</p>
                                  {activity.statusLabel != null ? (
                                    <p className="mt-1 text-[13px] text-slate-600">
                                      <span className="font-medium text-slate-700">{activity.statusLabel}</span>
                                      <span className="mx-1.5 text-slate-300">·</span>
                                      <span>{activity.plate}</span>
                                    </p>
                                  ) : (
                                    <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{activity.desc}</p>
                                  )}
                                  {activity.time ? (
                                    <p className="mt-2 text-[12px] font-medium tabular-nums text-slate-400">{activity.time}</p>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>

                </div>
              </div>
            )}

          </main>
        </div>
      </div>
      {/* ── First-Time Onboarding Modal ── */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl" style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}>

            {/* Header banner */}
            <div className="relative px-8 pt-8 pb-10 text-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #312e81 100%)' }}>
              <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full opacity-20 blur-3xl" style={{ background: '#818cf8' }} />
              <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full opacity-20 blur-3xl" style={{ background: '#6366f1' }} />
              {/* Brand logo — no glass frame, image only */}
              <div className="relative z-10 mx-auto mb-4 flex justify-center">
                <img
                  src="/images/autospf-logo.png"
                  alt="AutoSPF+"
                  className="h-16 w-auto max-w-[200px] object-contain"
                />
              </div>
              <h2 className="text-white text-[22px] font-black tracking-tight mb-1">Welcome to AutoSPF+</h2>
              <p className="text-slate-400 text-[13px] font-medium">Let's get your garage ready in 2 easy steps</p>
            </div>

            {/* Steps */}
            <div className="px-6 py-6 space-y-3">

              {/* Step 1 — Active */}
              <div className="flex items-start gap-4 p-4 rounded-2xl border-2" style={{ background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)', borderColor: '#6366f1' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-white text-[14px]" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>1</div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900 text-[14px]">Add Your Vehicle</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">Register your car so we can pre-fill it when you book a service.</p>
                </div>
                <iconify-icon icon="solar:arrow-right-bold" width="18" style={{ color: '#6366f1', marginTop: '10px', flexShrink: 0 }}></iconify-icon>
              </div>

              {/* Connector */}
              <div className="flex items-center gap-3 px-2">
                <div className="w-[1px] h-6 ml-[28px]" style={{ background: 'linear-gradient(to bottom, #6366f1, #e2e8f0)' }} />
              </div>

              {/* Step 2 — Locked */}
              <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200" style={{ background: '#f8fafc' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-slate-400 text-[14px]" style={{ background: '#e2e8f0' }}>2</div>
                <div className="flex-1">
                  <p className="font-bold text-slate-400 text-[14px]">Book a Service</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Choose a service — your vehicle info auto-fills instantly.</p>
                </div>
                <iconify-icon icon="solar:lock-keyhole-bold" width="16" style={{ color: '#cbd5e1', marginTop: '12px', flexShrink: 0 }}></iconify-icon>
              </div>

              {/* Connector */}
              <div className="flex items-center gap-3 px-2">
                <div className="w-[1px] h-6 ml-[28px]" style={{ background: '#e2e8f0' }} />
              </div>

              {/* Step 3 — Locked */}
              <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200" style={{ background: '#f8fafc' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-slate-400 text-[14px]" style={{ background: '#e2e8f0' }}>3</div>
                <div className="flex-1">
                  <p className="font-bold text-slate-400 text-[14px]">Track in Real-Time</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Watch your car's service status live on the tracker.</p>
                </div>
                <iconify-icon icon="solar:lock-keyhole-bold" width="16" style={{ color: '#cbd5e1', marginTop: '12px', flexShrink: 0 }}></iconify-icon>
              </div>
            </div>

            {/* CTA */}
            <div className="px-6 pb-6 space-y-2">
              <button
                onClick={() => { setShowOnboarding(false); setAddVehicleOpen(true); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-[15px] transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 6px 20px rgba(99,102,241,0.45)' }}
              >
                <iconify-icon icon="solar:add-circle-bold" width="18"></iconify-icon>
                Add My First Vehicle
              </button>
              <button
                onClick={() => setShowOnboarding(false)}
                className="w-full py-2.5 text-[13px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
              >
                I'll do this later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}

      {addVehicleOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:p-5" onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', year: '', brand: '', model: '', color: '', type: '', transmission: '', fuelType: '' }); setNewVehicleShowColorInput(false); }}>
          <div
            className="customer-vehicle-modal flex w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border-0 bg-white"
            onClick={e => e.stopPropagation()}
            style={{
              animation: 'modalIn .2s ease-out',
              maxHeight: '94vh',
            }}
          >

            {/* Header */}
            <div className="customer-vehicle-header flex shrink-0 items-center justify-between gap-4 border-0 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                  <iconify-icon icon="solar:garage-bold" width="20"></iconify-icon>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-950">Add Vehicle</h3>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Create a clean garage profile for booking.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', year: '', brand: '', model: '', color: '', type: '', transmission: '', fuelType: '' }); setNewVehicleShowColorInput(false); }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border-0 bg-white text-slate-500 shadow-md shadow-slate-900/10 transition-all duration-200 hover:bg-slate-50 hover:text-slate-900 hover:shadow-lg"
                aria-label="Close"
              >
                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddVehicleSubmit} className="customer-vehicle-form space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6" noValidate>

              <VehicleGarageForm
                variant="customer-rich"
                values={newVehicle}
                onChange={setNewVehicle}
                errors={vehicleErrors}
                onClearError={(field) => setVehicleErrors((er) => ({ ...er, [field]: '' }))}
                showCustomColorInput={newVehicleShowColorInput}
                onShowCustomColorInput={setNewVehicleShowColorInput}
                apiError={vehicleApiError}
                showPricingPreview
                bookingPackages={bookingPackages}
                enableVehicleDatabase
                footerHint={
                  <>
                    After you save, open <span className="font-semibold text-slate-800">Book</span> on your vehicle card to schedule a service with these details pre-filled.
                  </>
                }
              />

              {/* Actions */}
              <div className="customer-vehicle-actions sticky bottom-0 -mx-5 flex flex-col gap-3 border-0 bg-white/95 px-5 pt-4 shadow-[0_-12px_32px_-16px_rgba(15,23,42,0.08)] backdrop-blur sm:-mx-6 sm:flex-row sm:px-6">
                <button
                  type="button"
                  onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', year: '', brand: '', model: '', color: '', type: '', transmission: '', fuelType: '' }); setNewVehicleShowColorInput(false); }}
                  className="flex-1 rounded-2xl border border-slate-200/75 bg-gradient-to-b from-white to-slate-50/90 py-3 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all hover:border-slate-300/85 hover:shadow-[0_4px_14px_-6px_rgba(15,23,42,0.1)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 py-3 text-sm font-semibold text-white shadow-[0_4px_18px_-6px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] transition-all hover:from-slate-700 hover:to-slate-800 hover:shadow-[0_6px_22px_-6px_rgba(15,23,42,0.5)]"
                >
                  Add Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Book Service Modal */}
      {bookingOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:p-5" onClick={() => { if (!bookingSubmitting) { setBookingOpen(false); setBookingAgreed(false); setBookingTermsReachedEnd(false); setBookingDownpaymentProof(null); } }}>
          <div
            className={`customer-booking-modal w-full min-h-0 overflow-hidden rounded-[1.75rem] border-0 bg-white ${!bookingDone && (bookingStep === 4 || bookingStep === 5) ? 'max-w-4xl' : 'max-w-3xl'}`}
            onClick={e => e.stopPropagation()}
            style={{
              animation: 'modalIn .2s ease-out',
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >

            {/* Header — hidden when success screen is active (hero fills the top) */}
            {!bookingDone && (
              <div className="customer-booking-header flex shrink-0 items-center justify-between gap-4 border-0 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                    <iconify-icon icon="solar:calendar-add-bold" width="20"></iconify-icon>
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-bold text-slate-950">Book a Service</div>
                    <div className="mt-0.5 text-xs font-medium text-slate-500">
                      Step {bookingStep} of 6 · {
                        bookingStep === 1 ? 'Choose Service' :
                        bookingStep === 2 ? 'Your Details' :
                        bookingStep === 3 ? 'Pick Date & Time' :
                        bookingStep === 4 ? 'Review Booking' :
                        bookingStep === 5 ? 'Terms & Conditions' :
                        'GCash Downpayment'
                      }
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border-0 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 shadow-sm shadow-blue-600/12">
                        <iconify-icon icon="solar:wallet-money-bold" width="11"></iconify-icon>
                        Transparent pricing
                      </span>
                    </div>
                  </div>
                </div>
                {!bookingSubmitting && (
                  <button onClick={() => { setBookingOpen(false); setBookingAgreed(false); setBookingTermsReachedEnd(false); setBookingDownpaymentProof(null); }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border-0 bg-white text-slate-500 shadow-md shadow-slate-900/10 transition-all hover:bg-slate-50 hover:text-slate-900 hover:shadow-lg">
                    <iconify-icon icon="solar:close-circle-linear" width="16"></iconify-icon>
                  </button>
                )}
              </div>
            )}

            {/* Progress bar */}
            {!bookingDone && (
              <div className="shrink-0 border-0 bg-slate-50/70 px-5 py-3 shadow-[inset_0_8px_16px_-16px_rgba(15,23,42,0.06)] sm:px-6">
                <div className="grid grid-cols-6 gap-1.5" aria-label={`Booking step ${bookingStep} of 6`}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={index}
                      className={`h-1.5 rounded-full transition-all duration-300 ${index + 1 <= bookingStep ? 'customer-booking-progress-segment-active' : 'bg-slate-200'}`}
                      />
                    ))}
                </div>
                <div className="mt-2 hidden grid-cols-6 gap-1.5 sm:grid">
                  {['Service', 'Details', 'Schedule', 'Review', 'Terms', 'Payment'].map((label, index) => (
                    <span
                      key={label}
                      className={`truncate text-center text-[10px] font-bold ${index + 1 === bookingStep ? 'text-blue-700' : index + 1 < bookingStep ? 'text-slate-500' : 'text-slate-300'}`}
                      >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            <div ref={bookingBodyRef} className="booking-body min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <style dangerouslySetInnerHTML={{ __html: `.booking-body::-webkit-scrollbar { display: none; } @keyframes spin { to { transform: rotate(360deg); } }` }} />
              {bookingDone ? (
                /* ── Success Receipt — Premium Dark Luxury ── */
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                  {/* Hero Header */}
                  <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)', padding: '32px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
                    {/* Decorative rings */}
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', border: '1px solid rgba(245,158,11,0.12)' }} />
                    <div style={{ position: 'absolute', bottom: -30, left: -30, width: 100, height: 100, borderRadius: '50%', border: '1px solid rgba(245,158,11,0.08)' }} />

                    {/* Animated check badge */}
                    <div style={{ position: 'relative', marginBottom: 14 }}>
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 8px rgba(22,163,74,0.15), 0 8px 24px rgba(22,163,74,0.3)' }}>
                        <iconify-icon icon="solar:check-circle-bold" width="34" style={{ color: '#fff' }}></iconify-icon>
                      </div>
                      {/* Gold ring pulse */}
                      <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '2px solid rgba(245,158,11,0.4)', animation: 'ping 1.5s ease-out 1' }} />
                    </div>

                    <p style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Booking Confirmed!</p>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0', fontWeight: 500 }}>We will confirm within 1–3 minutes</p>

                    {/* Status pill */}
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 999, padding: '5px 14px' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 2s infinite' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Pending Confirmation</span>
                    </div>
                  </div>

                  {/* Receipt Body */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 20px', background: '#fff' }}>

                    {/* Schedule Card */}
                    <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ background: '#f8fafc', padding: '7px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <iconify-icon icon="solar:calendar-bold" width="12" style={{ color: '#94a3b8' }}></iconify-icon>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Schedule</p>
                      </div>
                      <div>
                        {[
                          { icon: 'solar:calendar-date-bold', label: 'Date', value: bookingForm.date ? new Date(bookingForm.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                          { icon: 'solar:clock-circle-bold', label: 'Time', value: bookingForm.time || '—' },
                        ].map(({ icon, label, value }) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f8fafc' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <iconify-icon icon={icon} width="13" style={{ color: '#94a3b8' }}></iconify-icon>
                              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Vehicle Card */}
                    <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ background: '#f8fafc', padding: '7px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <iconify-icon icon="solar:car-bold" width="12" style={{ color: '#94a3b8' }}></iconify-icon>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Vehicle</p>
                      </div>
                      <div>
                        {[
                          { icon: 'solar:user-bold', label: 'Owner', value: user?.name || '—' },
                          { icon: 'solar:tag-bold', label: 'Plate number', value: formatPlateDisplay(bookingForm.vehiclePlate) },
                          { icon: 'solar:car-bold', label: 'Brand & model', value: formatVehicleMakeModelDisplay(bookingForm.vehicleMake, bookingForm.vehicleModel) },
                          {
                            icon: 'solar:calendar-date-bold',
                            label: 'Year',
                            value: (bookingForm.vehicleYear || '').trim() || '—',
                          },
                          {
                            icon: 'solar:clipboard-list-bold',
                            label: 'Vehicle type',
                            value: (bookingForm.vehicleCategory || '').trim()
                              ? formatTitleCaseDisplay(bookingForm.vehicleCategory)
                              : '—',
                          },
                          {
                            icon: 'solar:palette-bold',
                            label: 'Color',
                            value: (bookingForm.vehicleColor || '').trim()
                              ? formatTitleCaseDisplay(bookingForm.vehicleColor)
                              : '—',
                          },
                          {
                            icon: 'solar:settings-bold',
                            label: 'Transmission',
                            value: (bookingForm.vehicleTransmission || '').trim()
                              ? formatTitleCaseDisplay(bookingForm.vehicleTransmission)
                              : '—',
                          },
                          {
                            icon: 'solar:gas-station-bold',
                            label: 'Fuel type',
                            value: (bookingForm.vehicleFuelType || '').trim()
                              ? formatTitleCaseDisplay(bookingForm.vehicleFuelType)
                              : '—',
                          },
                        ].map(({ icon, label, value }) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f8fafc' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <iconify-icon icon={icon} width="13" style={{ color: '#94a3b8' }}></iconify-icon>
                              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Service + Price Banner */}
                    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #1e293b' }}>
                      <div style={{ background: '#f8fafc', padding: '7px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <iconify-icon icon="solar:shield-star-bold" width="12" style={{ color: '#94a3b8' }}></iconify-icon>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Service</p>
                      </div>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Package</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{bookingForm.serviceName || '—'}</span>
                      </div>
                      {/* Price row — dark */}
                      <div style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <iconify-icon icon="solar:wallet-money-bold" width="16" style={{ color: '#f59e0b' }}></iconify-icon>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>Total Price</span>
                        </div>
                        <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>
                          ₱{bookingForm.servicePrice.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Downpayment note */}
                    <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <iconify-icon icon="solar:info-circle-bold" width="14" style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }}></iconify-icon>
                      <p style={{ fontSize: 11, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                        Your downpayment has been received. Our team will reach out to <strong>{bookingForm.contactNo}</strong> to confirm your appointment.
                      </p>
                    </div>
                  </div>

                  {/* CTA Footer */}
                  <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', background: '#fff', flexShrink: 0 }}>
                    <button
                      onClick={() => { setBookingOpen(false); setBookingAgreed(false); setBookingTermsReachedEnd(false); setBookingDownpaymentProof(null); }}
                      style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#1e293b,#0f172a)', color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '0.01em', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,23,42,0.2)', transition: 'all 0.2s' }}>
                      Done — Back to Dashboard
                    </button>
                  </div>
                </div>

              ) : bookingStep === 1 ? (
                /* ── Step 1: Service ── */
                <div className="space-y-4 p-4 sm:p-5">
                  <section className="booking-service-panel rounded-[22px] border-0 bg-slate-50/60 p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-950">Choose your vehicle</p>
                        <p className="mt-1 text-xs font-medium text-slate-500">Pricing updates automatically based on the selected class.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full border-0 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm shadow-blue-600/12">
                          <iconify-icon icon="solar:tag-price-linear" width="14"></iconify-icon>
                          {VEHICLE_OPTIONS.find(o => o.type === bookingVehicleType)?.label || bookingVehicleType}
                        </div>
                      </div>
                    </div>

                    {vehicles.length === 0 ? (
                      <div className="flex items-start gap-3 rounded-2xl border-0 bg-blue-50/80 px-4 py-3 shadow-sm shadow-blue-600/10">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm shadow-blue-600/15">
                          <iconify-icon icon="solar:info-circle-bold" width="18"></iconify-icon>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-blue-900">No vehicle saved yet</p>
                          <p className="mt-0.5 text-xs font-medium text-blue-800/90">Showing Hatchback pricing for now. Vehicle details are collected on the next step.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {vehicles.map((v: any, i: number) => {
                          const vKey = getVehiclePriceKey(v.type);
                          const isActive = bookingSelectedVehicleIdx === i;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setBookingSelectedVehicleIdx(i);
                                setBookingVehicleType(vKey);
                                setBookingForm(f => ({
                                  ...f,
                                  service: '', servicePrice: 0,
                                  vehicleMake: v.make || '',
                                  vehicleModel: v.model || '',
                                  vehicleYear: v.year || '',
                                  vehiclePlate: resolveGarageVehiclePlate(v),
                                  vehicleColor: v.color || '',
                                  vehicleCategory: v.type || '',
                                  vehicleTransmission: v.transmission || '',
                                  vehicleFuelType: v.fuelType || '',
                                }));
                              }}
                              className={`booking-service-vehicle-card flex min-w-0 items-center gap-3 rounded-2xl border-0 px-3.5 py-3 text-left transition-all ${isActive
                                ? 'is-active border-0 bg-slate-950 text-white'
                                : 'border-0 bg-white text-slate-700 hover:bg-white'
                                }`}
                            >
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                <iconify-icon icon="solar:car-bold" width="17"></iconify-icon>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold">{v.name}</p>
                                <p className={`mt-0.5 text-xs font-medium ${isActive ? 'text-white/60' : 'text-slate-400'}`}>{v.type || 'Vehicle'}</p>
                              </div>
                              {isActive ? (
                                <iconify-icon icon="solar:check-circle-bold" width="18" className="shrink-0 text-blue-200"></iconify-icon>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      )}
                    </section>

                  <div>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-950">Select a protection package</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">Prices reflect your selected vehicle class.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                            {bookingPackages.length} packages
                          </span>
                        </div>
                    </div>

                    <div ref={packageListRef} className="space-y-3">
                      {bookingPackages.map((svc: any, index: number) => {
                        const currentPrice = svc.prices[bookingVehicleType] ?? null;
                        if (currentPrice === null) return null;
                        const selected = bookingForm.service === svc.id;
                        const packageBadge =
                          svc.id === 'spf89' ? 'Most chosen' :
                          svc.id === 'spf101' ? 'All-in package' :
                          svc.id === 'spf99' ? 'Best value' :
                          'Essential care';
                        const vehicleLabel = VEHICLE_OPTIONS.find(o => o.type === bookingVehicleType)?.label || bookingVehicleType;
                        return (
                          <button
                            key={svc.id}
                            ref={(el) => { packageCardRefs.current[index] = el; }}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setBookingForm(f => ({ ...f, service: svc.id, serviceName: svc.name, servicePrice: currentPrice }))}
                            className={`booking-service-package-card w-full rounded-[22px] border-0 p-4 text-left transition-all ${selected ? 'is-selected border-0 bg-blue-50/50' : 'border-0 bg-white'}`}
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${selected ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>
                                    {packageBadge}
                                  </span>
                                    {selected ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm shadow-blue-600/30">
                                        <iconify-icon icon="solar:check-circle-bold" width="13"></iconify-icon>
                                        Selected
                                      </span>
                                    ) : null}
                                </div>
                                <p className="text-base font-black text-slate-950">{svc.name}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-500">{svc.duration}</p>
                                <p className="mt-3 max-w-[34rem] text-sm font-medium leading-relaxed text-slate-600">{svc.description}</p>
                              </div>

                              <div className="booking-service-price-box flex shrink-0 flex-row items-center justify-between gap-3 rounded-2xl border-0 bg-white px-4 py-3 sm:w-[170px] sm:flex-col sm:items-start">
                                <div className="min-w-0">
                                  <span className="mt-1 block text-xl font-black text-slate-950">₱{currentPrice.toLocaleString()}</span>
                                  <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400">For {vehicleLabel}</span>
                                </div>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${selected ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25' : 'bg-slate-100 text-slate-500'}`}>
                                  {selected ? 'Chosen' : 'Select'}
                                  <iconify-icon icon={selected ? 'solar:check-circle-bold' : 'solar:arrow-right-linear'} width="13"></iconify-icon>
                                </span>
                              </div>
                            </div>

                              {svc.features && (
                                <div className="mt-4 border-0 pt-4 shadow-[inset_0_1px_0_0_rgba(241,245,249,0.85)]">
                                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-blue-800">
                                    <iconify-icon icon="solar:verified-check-bold" width="16" className="text-blue-600"></iconify-icon>
                                    Inclusions
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-3">
                                    {svc.features.map((f: string, i: number) => (
                                      <div key={i} className="booking-service-feature flex items-start gap-2 rounded-xl border-0 bg-white/90 px-3 py-3">
                                        <span
                                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-[0_2px_10px_rgba(37,99,235,0.35)]"
                                          aria-hidden
                                        >
                                          <iconify-icon icon="solar:verified-check-bold" width="15"></iconify-icon>
                                        </span>
                                        <span className="min-w-0 text-xs font-bold leading-snug text-slate-700">{f}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : bookingStep === 2 ? (
                /* ── Step 2: Vehicle Details ── */
                <div className="booking-step2 space-y-4 p-4 sm:p-5">
                  {/* Locked Customer Name */}
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name</p>
                    <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                      <iconify-icon icon="solar:user-bold" width="16" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                      <span className="text-sm font-semibold text-gray-700 flex-1">{user?.name || '—'}</span>
                      <iconify-icon icon="solar:lock-keyhole-bold" width="14" style={{ color: '#d1d5db' }}></iconify-icon>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 pl-1">Auto-filled from your profile</p>
                  </div>

                  {/* Contact No */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contact No. <span className="text-red-500">*</span></label>
                    <input
                      type="tel"
                      placeholder="09XXXXXXXXX"
                      value={bookingForm.contactNo}
                      onChange={e => {
                        setBookingForm(f => ({ ...f, contactNo: e.target.value }));
                        if (step2Errors.contactNo) setStep2Errors(err => ({ ...err, contactNo: '' }));
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 ${step2Errors.contactNo ? 'border-red-400 bg-red-50 ring-0' : 'border-slate-200/90 bg-white'}`}
                    />
                    {step2Errors.contactNo
                      ? <p className="text-[10px] text-red-500 mt-1 pl-1">{step2Errors.contactNo}</p>
                      : (() => {
                          const src = formatContactNoInputFromProfile(profile.phone || (user as any)?.phone || '');
                          return src && formatContactNoInputFromProfile(bookingForm.contactNo) === src ? (
                        <p className="text-[10px] text-gray-400 mt-1 pl-1">Auto-filled from your profile</p>
                          ) : null;
                        })()}
                  </div>

                  {/* Vehicle Fields — read-only from garage, or editable if not pre-selected */}
                  {bookingFromVehicle ? (
                    /* ── Read-only vehicle info from garage ── */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Vehicle Details</p>
                        <button
                          type="button"
                          onClick={() => setBookingOpen(false)}
                          className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                        >
                          <iconify-icon icon="solar:pen-linear" width="12"></iconify-icon>
                          Edit Vehicle
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Brand */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Brand</p>
                          <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                            <iconify-icon icon="solar:car-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{formatTitleCaseDisplay(bookingForm.vehicleMake)}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Model */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Model</p>
                          <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                            <iconify-icon icon="solar:car-2-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{formatTitleCaseDisplay(bookingForm.vehicleModel)}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Color */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Color</p>
                          <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                            <iconify-icon icon="solar:palette-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{formatTitleCaseDisplay(bookingForm.vehicleColor)}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Plate */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Plate No.</p>
                          <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                            <iconify-icon icon="solar:tag-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 tracking-widest">{formatPlateDisplay(bookingForm.vehiclePlate)}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Year */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Year</p>
                          <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                            <iconify-icon icon="solar:calendar-date-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleYear || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Type */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Type</p>
                          <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                            <iconify-icon icon="solar:clipboard-list-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleCategory || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Transmission */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Transmission</p>
                          <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                            <iconify-icon icon="solar:settings-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleTransmission || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Fuel */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Fuel Type</p>
                          <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                            <iconify-icon icon="solar:gas-station-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleFuelType || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 pl-1">Auto-filled from your garage · <button type="button" onClick={() => setBookingOpen(false)} className="text-indigo-500 hover:underline">Go to garage to update</button></p>
                    </div>
                  ) : (
                    /* ── Manual entry when not opened from a vehicle card ── */
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Brand <span className="text-red-500">*</span></label>
                          <select
                            value={bookingForm.vehicleMake}
                            onChange={e => {
                              setBookingForm(f => ({ ...f, vehicleMake: e.target.value }));
                              if (step2Errors.vehicleMake) setStep2Errors(err => ({ ...err, vehicleMake: '' }));
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 appearance-none ${step2Errors.vehicleMake ? 'border-red-400 bg-red-50 ring-0' : 'border-slate-200/90 bg-white'}`}
                          >
                            <option value="">Select brand</option>
                            {CAR_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                          {step2Errors.vehicleMake && <p className="text-[10px] text-red-500 mt-1 pl-1">{step2Errors.vehicleMake}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Model <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            placeholder="e.g. Vios, Civic"
                            value={bookingForm.vehicleModel}
                            onChange={e => {
                              setBookingForm(f => ({ ...f, vehicleModel: e.target.value }));
                              if (step2Errors.vehicleModel) setStep2Errors(err => ({ ...err, vehicleModel: '' }));
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 ${step2Errors.vehicleModel ? 'border-red-400 bg-red-50 ring-0' : 'border-slate-200/90 bg-white'}`}
                          />
                          {step2Errors.vehicleModel && <p className="text-[10px] text-red-500 mt-1 pl-1">{step2Errors.vehicleModel}</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Color <span className="text-red-500">*</span></label>
                          <select
                            value={bookingForm.vehicleColor}
                            onChange={e => {
                              setBookingForm(f => ({ ...f, vehicleColor: e.target.value }));
                              if (step2Errors.vehicleColor) setStep2Errors(err => ({ ...err, vehicleColor: '' }));
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 appearance-none ${step2Errors.vehicleColor ? 'border-red-400 bg-red-50 ring-0' : 'border-slate-200/90 bg-white'}`}
                          >
                            <option value="">Select color</option>
                            {['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Yellow', 'Orange', 'Brown', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {step2Errors.vehicleColor && <p className="text-[10px] text-red-500 mt-1 pl-1">{step2Errors.vehicleColor}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Plate No. <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            placeholder="ABC 1234"
                            value={bookingForm.vehiclePlate}
                            onChange={e => {
                              setBookingForm(f => ({ ...f, vehiclePlate: e.target.value.toUpperCase() }));
                              if (step2Errors.vehiclePlate) setStep2Errors(err => ({ ...err, vehiclePlate: '' }));
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 uppercase tracking-widest font-mono ${step2Errors.vehiclePlate ? 'border-red-400 bg-red-50 ring-0' : 'border-slate-200/90 bg-white'}`}
                          />
                          {step2Errors.vehiclePlate
                            ? <p className="text-[10px] text-red-500 mt-1 pl-1">{step2Errors.vehiclePlate}</p>
                            : <p className="text-[10px] text-gray-400 mt-1 pl-1">4–9 letters/numbers (spaces ignored)</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Year <span className="text-gray-400 font-normal">(optional)</span></label>
                          <select
                            value={bookingForm.vehicleYear}
                            onChange={e => { setBookingForm(f => ({ ...f, vehicleYear: e.target.value })); }}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white text-sm text-slate-900 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 appearance-none"
                          >
                            <option value="">Year</option>
                            {BOOKING_YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Type <span className="text-red-500">*</span></label>
                          <select
                            value={bookingForm.vehicleCategory}
                            onChange={e => {
                              const type = e.target.value;
                              setBookingVehicleType(getVehiclePriceKey(type));
                              setBookingForm(f => ({
                                ...f,
                                vehicleCategory: type,
                                service: '',
                                serviceName: '',
                                servicePrice: 0,
                              }));
                              if (step2Errors.vehicleCategory) setStep2Errors(err => ({ ...err, vehicleCategory: '' }));
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 appearance-none ${step2Errors.vehicleCategory ? 'border-red-400 bg-red-50 ring-0' : 'border-slate-200/90 bg-white'}`}
                          >
                            <option value="">Select type</option>
                            {ADD_VEHICLE_TYPE_LABELS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          {step2Errors.vehicleCategory && <p className="text-[10px] text-red-500 mt-1 pl-1">{step2Errors.vehicleCategory}</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Transmission <span className="text-gray-400 font-normal">(optional)</span></label>
                          <select
                            value={bookingForm.vehicleTransmission}
                            onChange={e => setBookingForm(f => ({ ...f, vehicleTransmission: e.target.value }))}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white text-sm text-slate-900 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 appearance-none"
                          >
                            <option value="">Select...</option>
                            <option value="Automatic">Automatic</option>
                            <option value="Manual">Manual</option>
                            <option value="CVT">CVT</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Fuel Type <span className="text-gray-400 font-normal">(optional)</span></label>
                          <select
                            value={bookingForm.vehicleFuelType}
                            onChange={e => setBookingForm(f => ({ ...f, vehicleFuelType: e.target.value }))}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white text-sm text-slate-900 outline-none transition-all duration-200 shadow-[0_1px_4px_rgba(15,23,42,0.04)] focus:ring-2 focus:ring-indigo-500/20 focus:border-slate-300 appearance-none"
                          >
                            <option value="">Select...</option>
                            <option value="Gasoline">Gasoline</option>
                            <option value="Diesel">Diesel</option>
                            <option value="Electric">Electric</option>
                            <option value="Hybrid">Hybrid</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Service - with Edit button */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Car Service</p>
                      <button type="button" onClick={() => setBookingStep(1)} className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors">
                        <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                        Edit Service
                      </button>
                    </div>
                    <div className="booking-readonly-surface flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-b from-slate-50/95 to-white">
                      <iconify-icon icon="solar:shield-check-bold" width="16" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                      <span className="text-sm font-semibold text-gray-700 flex-1">{bookingForm.serviceName || '—'}</span>
                      <span className="text-xs font-bold text-gray-500">₱{bookingForm.servicePrice.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

              ) : bookingStep === 3 ? (
                /* ── Step 3 — Calendar (real-time availability) ── */
                <div className="p-4 pb-4 sm:p-5 sm:pb-4">

                  {/* Month nav — triggers availability fetch */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <button type="button"
                      disabled={monthAvailLoading}
                      onClick={() => {
                        const prev = new Date(bookingCalMonth.getFullYear(), bookingCalMonth.getMonth() - 1, 1);
                        setBookingCalMonth(prev);
                        fetchMonthAvailability(prev.getFullYear(), prev.getMonth());
                      }}
                      style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: monthAvailLoading ? 'default' : 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
                      ‹
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                        {bookingCalMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </span>
                      {monthAvailLoading && (
                        <div style={{ width: 14, height: 14, border: '2px solid #e2e8f0', borderTopColor: '#0f172a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      )}
                    </div>
                    <button type="button"
                      disabled={monthAvailLoading}
                      onClick={() => {
                        const next = new Date(bookingCalMonth.getFullYear(), bookingCalMonth.getMonth() + 1, 1);
                        setBookingCalMonth(next);
                        fetchMonthAvailability(next.getFullYear(), next.getMonth());
                      }}
                      style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: monthAvailLoading ? 'default' : 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
                      ›
                    </button>
                  </div>

                  {/* Day-of-week headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#b0b8c4', paddingBottom: 8 }}>{d}</div>
                    ))}
                  </div>

                  {/* Date grid — driven by monthAvailability from real API */}
                  {(() => {
                    const year = bookingCalMonth.getFullYear();
                    const month = bookingCalMonth.getMonth();
                    const firstDay = new Date(year, month, 1).getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
                    const todayIso = todayD.toISOString().split('T')[0];
                    const cells: React.ReactNode[] = [];
                    for (let i = 0; i < firstDay; i++) cells.push(<div key={`bl${i}`} />);
                    for (let day = 1; day <= daysInMonth; day++) {
                      const date = new Date(year, month, day);
                      date.setHours(0, 0, 0, 0);
                      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isToday = iso === todayIso;
                      const dayInfo = monthAvailability[iso];
                      // Use API-driven status; fall back to closed for safety while loading.
                      const status: DayAvailabilityStatus = dayInfo?.status || 'closed';
                      const disabled = !!dayInfo?.unavailable || status === 'closed' || status === 'full';
                      const isSelected = bookingForm.date === iso;
                      const unavailableReason =
                        dayInfo?.reason
                        || (status === 'full' ? 'All booking slots for this date are fully booked.' : 'This date is unavailable.');
                      const dotColor = status === 'available' ? '#22c55e' : 'transparent';
                      cells.push(
                        <button key={iso} type="button" disabled={disabled}
                          title={disabled ? unavailableReason : undefined}
                          aria-label={disabled ? `Unavailable date: ${unavailableReason}` : undefined}
                          onClick={() => {
                            if (disabled) return;
                            const prevTime = bookingForm.time;
                            setBookingForm(f => ({ ...f, date: iso, time: '' }));
                            setSlotStatuses([]);
                            setSlotError('');
                            fetchSlotsForDate(iso, prevTime);
                          }}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 3, width: '100%', aspectRatio: '1', borderRadius: '50%', border: 'none',
                            cursor: disabled ? 'default' : 'pointer',
                            opacity: monthAvailLoading ? 0.4 : 1,
                            background: isSelected ? '#0f172a'
                              : isToday && !disabled ? 'rgba(15,23,42,0.06)'
                                : 'transparent',
                            transition: 'all 0.15s',
                          }}>
                          <span style={{
                            fontSize: 14,
                            fontWeight: isSelected ? 700 : isToday ? 700 : 500,
                            color: isSelected ? '#fff'
                              : disabled ? '#9ca3af'
                                : isToday ? '#0f172a'
                                    : '#374151',
                            lineHeight: 1,
                          }}>{day}</span>
                          {status === 'available' && (
                            <span style={{
                              width: 4, height: 4, borderRadius: '50%',
                              background: isSelected ? 'rgba(255,255,255,0.6)' : dotColor,
                            }} />
                          )}
                        </button>
                      );
                    }
                    return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>{cells}</div>;
                  })()}

                  {/* Legend — 3 real states */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12 }}>
                    {[
                      { c: '#22c55e', l: 'Available' },
                      { c: '#9ca3af', l: 'Unavailable' },
                    ].map(({ c, l }) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{l}</span>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: '#f1f5f9', margin: '16px 0' }} />

                  {/* Time picker — status-driven from API */}
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Preferred Time</p>

                  {/* Stale-selection error banner */}
                  {slotError && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 10 }}>
                      <iconify-icon icon="solar:danger-triangle-bold" width="16" style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }}></iconify-icon>
                      <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>{slotError}</span>
                    </div>
                  )}

                  {!bookingForm.date ? (
                    <p style={{ fontSize: 12, color: '#cbd5e1', textAlign: 'center', padding: '12px 0' }}>Select a date to see available times</p>
                  ) : slotsLoading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {BOOKING_TIMES.map(t => (
                        <div key={t} style={{
                          padding: '10px 4px', borderRadius: 8, border: '1px solid #f1f5f9',
                          background: '#f8fafc', height: 40, animation: 'pulse 1.5s ease-in-out infinite'
                        }} />
                      ))}
                    </div>
                  ) : slotStatuses.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#cbd5e1', textAlign: 'center', padding: '12px 0' }}>No slots available for this date</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {slotStatuses.map(({ time: t, status }) => {
                        const isDisabled = status !== 'AVAILABLE';
                        const isActive = bookingForm.time === t && !isDisabled;
                        const bgColor = isActive ? '#0f172a'
                          : status === 'FULL' ? '#fef2f2'
                            : status === 'CLOSED' ? '#f8fafc'
                              : '#fff';
                        const textColor = isActive ? '#fff'
                          : status === 'FULL' ? '#fca5a5'
                            : status === 'CLOSED' ? '#d1d5db'
                              : '#374151';
                        const label = status === 'FULL' ? 'Full' : status === 'CLOSED' ? 'Closed' : t;
                        return (
                          <button key={t} type="button"
                            disabled={isDisabled}
                            title={status === 'FULL' ? 'This slot is fully booked' : status === 'CLOSED' ? 'This slot is unavailable' : t}
                            onClick={() => {
                              if (isDisabled) return;
                              setSlotError('');
                              setBookingForm(f => ({ ...f, time: t }));
                            }}
                            style={{
                              padding: '8px 4px', borderRadius: 8,
                              border: isActive ? 'none' : `1px solid ${status === 'FULL' ? '#fecaca' : status === 'CLOSED' ? '#f1f5f9' : '#e5e7eb'}`,
                              fontSize: 11, fontWeight: 600, lineHeight: 1.3, transition: 'all 0.15s',
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              background: bgColor, color: textColor,
                              textDecoration: status === 'FULL' ? 'line-through' : 'none',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                            }}>
                            <span>{t}</span>
                            {status !== 'AVAILABLE' && (
                              <span style={{ fontSize: 9, fontWeight: 500, color: status === 'FULL' ? '#fca5a5' : '#d1d5db', textDecoration: 'none' }}>
                                {label === t ? '' : label}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Time slot legend */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 10 }}>
                    {[
                      { c: '#374151', l: 'Available' },
                      { c: '#fca5a5', l: 'Full' },
                      { c: '#d1d5db', l: 'Closed' },
                    ].map(({ c, l }) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, border: '1px solid #e5e7eb' }} />
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{l}</span>
                      </div>
                    ))}
                  </div>


                  {/* Notes */}
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Notes <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0, color: '#cbd5e1' }}>(optional)</span>
                      </p>
                      <span style={{ fontSize: 10, color: bookingForm.notes.length > 180 ? '#ef4444' : '#cbd5e1' }}>{bookingForm.notes.length}/200</span>
                    </div>
                    <textarea rows={2}
                      maxLength={200}
                      value={bookingForm.notes}
                      onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Any special requests..."
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb',
                        fontSize: 13, color: '#1e293b', background: '#fff', resize: 'none',
                        outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = '#0f172a'}
                      onBlur={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                  </div>
                </div>


              ) : bookingStep === 4 ? (
                /* ── Step 4: Booking Summary ── */
                <div className="p-4 sm:p-5">
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#1e293b,#0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <iconify-icon icon="solar:clipboard-check-bold" width="18" style={{ color: '#fff' }}></iconify-icon>
                    </div>
                    <div>
                      <p className="text-base font-bold leading-tight text-slate-900" style={{ margin: 0 }}>Review Your Booking</p>
                      <p className="mt-0.5 text-xs text-slate-500" style={{ margin: 0 }}>Please confirm all details before proceeding</p>
                    </div>
                  </div>

                  {/* Customer Card */}
                  <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{ background: '#f8fafc', padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Customer</p>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      {[
                        { icon: 'solar:user-bold', label: 'Name', value: user?.name || '—' },
                        { icon: 'solar:phone-bold', label: 'Contact', value: bookingForm.contactNo || '—' },
                      ].map(({ icon, label, value }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #f8fafc' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <iconify-icon icon={icon} width="13" style={{ color: '#94a3b8' }}></iconify-icon>
                            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Vehicle Card */}
                  <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{ background: '#f8fafc', padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Vehicle</p>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      {[
                        { icon: 'solar:tag-bold', label: 'Plate number', value: formatPlateDisplay(bookingForm.vehiclePlate) },
                        { icon: 'solar:car-bold', label: 'Brand & model', value: formatVehicleMakeModelDisplay(bookingForm.vehicleMake, bookingForm.vehicleModel) },
                        {
                          icon: 'solar:calendar-date-bold',
                          label: 'Year',
                          value: (bookingForm.vehicleYear || '').trim() || '—',
                        },
                        {
                          icon: 'solar:clipboard-list-bold',
                          label: 'Vehicle type',
                          value: (bookingForm.vehicleCategory || '').trim()
                            ? formatTitleCaseDisplay(bookingForm.vehicleCategory)
                            : '—',
                        },
                        {
                          icon: 'solar:palette-bold',
                          label: 'Color',
                          value: (bookingForm.vehicleColor || '').trim()
                            ? formatTitleCaseDisplay(bookingForm.vehicleColor)
                            : '—',
                        },
                        {
                          icon: 'solar:settings-bold',
                          label: 'Transmission',
                          value: (bookingForm.vehicleTransmission || '').trim()
                            ? formatTitleCaseDisplay(bookingForm.vehicleTransmission)
                            : '—',
                        },
                        {
                          icon: 'solar:gas-station-bold',
                          label: 'Fuel type',
                          value: (bookingForm.vehicleFuelType || '').trim()
                            ? formatTitleCaseDisplay(bookingForm.vehicleFuelType)
                            : '—',
                        },
                      ].map(({ icon, label, value }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #f8fafc' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <iconify-icon icon={icon} width="13" style={{ color: '#94a3b8' }}></iconify-icon>
                            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Service + Schedule Card */}
                  <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{ background: '#f8fafc', padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Service & Schedule</p>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      {[
                        { icon: 'solar:shield-star-bold', label: 'Service', value: bookingForm.serviceName || '—' },
                        { icon: 'solar:calendar-bold', label: 'Date', value: bookingForm.date ? new Date(bookingForm.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
                        { icon: 'solar:clock-circle-bold', label: 'Time', value: bookingForm.time || '—' },
                      ].map(({ icon, label, value }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #f8fafc' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <iconify-icon icon={icon} width="13" style={{ color: '#94a3b8' }}></iconify-icon>
                            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Breakdown Banner */}
                  {(() => {
                    const RESERVATION_FEE = 500;
                    const balance = bookingForm.servicePrice - RESERVATION_FEE;
                    return (
                      <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: bookingForm.notes ? 10 : 0 }}>
                        {/* Header */}
                        <div style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <iconify-icon icon="solar:wallet-money-bold" width="18" style={{ color: '#f59e0b' }}></iconify-icon>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Total Service Price</span>
                          </div>
                          <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>₱{bookingForm.servicePrice.toLocaleString()}</span>
                        </div>
                        {/* Breakdown rows */}
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderTop: 'none', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <iconify-icon icon="solar:smartphone-bold" width="14" style={{ color: '#d97706' }}></iconify-icon>
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', margin: 0 }}>GCash Reservation Fee — Due Now</p>
                              <p style={{ fontSize: 10, color: '#b45309', margin: 0, marginTop: 1 }}>Fixed fee to secure your slot</p>
                            </div>
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#d97706', letterSpacing: '-0.02em' }}>₱500</span>
                        </div>
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderTop: 'none', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <iconify-icon icon="solar:shop-bold" width="14" style={{ color: '#16a34a' }}></iconify-icon>
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: '#166534', margin: 0 }}>Balance — Pay Onsite</p>
                              <p style={{ fontSize: 10, color: '#15803d', margin: 0, marginTop: 1 }}>Settle in full on your appointment day</p>
                            </div>
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#16a34a', letterSpacing: '-0.02em' }}>₱{balance.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Notes */}
                  {bookingForm.notes && (
                    <div style={{ padding: '10px 14px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 3 }}>Special Requests</p>
                      <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5, margin: 0 }}>{bookingForm.notes}</p>
                    </div>
                  )}

                </div>

              ) : bookingStep === 5 ? (
                /* ── Step 5: Terms & Conditions ── */
                <div className="booking-step5 flex min-h-0 flex-col gap-4 px-4 pb-6 pt-4 sm:px-6">
                  <div className="booking-terms-surface bg-white p-4">
                    <h3 className="text-base font-semibold leading-snug tracking-tight text-slate-900">{BOOKING_TERMS_DOCUMENT_TITLE}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{BOOKING_TERMS_INTRO}</p>
                    <p className="mt-3 text-xs text-slate-500">
                      Last updated {BOOKING_TERMS_LAST_UPDATED} · Version {BOOKING_TERMS_VERSION}
                    </p>
                  </div>

                  <div className="min-h-0 shrink-0">
                    <p className="booking-modal-label mb-2">Key points</p>
                    <ul className="booking-terms-surface mb-4 list-disc space-y-1.5 bg-slate-50/80 py-3 pl-5 pr-4 text-sm leading-relaxed text-slate-700">
                      {BOOKING_TERMS_SUMMARY.map((line, idx) => (
                        <li key={idx} className="pl-0.5 marker:text-slate-400">{line}</li>
                      ))}
                    </ul>

                    <p className="booking-modal-label mb-2">Full text (scroll to the end)</p>
                    <div
                      ref={bookingTcScrollRef}
                      id="tc-scroll-box"
                      role="region"
                      aria-label="Terms and conditions full text"
                      tabIndex={0}
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (el.scrollHeight - el.scrollTop - el.clientHeight <= 28) setBookingTermsReachedEnd(true);
                      }}
                      className="booking-terms-surface booking-terms-scroll max-h-[min(420px,56vh)] min-h-[min(260px,36vh)] overflow-y-auto overscroll-contain bg-slate-50/90 px-4 py-3.5 text-sm leading-[1.65] text-slate-700 scroll-smooth outline-none"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      {BOOKING_TERMS_SECTIONS.map((sec) => (
                        <section key={sec.id} className="mb-4 last:mb-1">
                          <h4 className="mb-1.5 text-sm font-bold tracking-tight text-slate-900">{sec.title}</h4>
                          <p className="leading-relaxed text-slate-600">{sec.body}</p>
                        </section>
                      ))}
                    </div>
                    {!bookingTermsReachedEnd ? (
                      <p className="mt-2 text-center text-xs font-medium text-blue-700" aria-live="polite">
                        Scroll to the bottom to enable the agreement checkbox.
                      </p>
                    ) : null}
                  </div>

                  <div
                    className={`booking-terms-agree flex flex-col gap-3 px-4 py-4 sm:px-4 ${
                      bookingTermsReachedEnd
                        ? 'is-active bg-white hover:shadow-md focus-within:ring-2 focus-within:ring-[color:var(--booking-focus-ring)]'
                        : 'is-locked bg-slate-50/90 opacity-75'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        id="tc-checkbox"
                        type="checkbox"
                        disabled={!bookingTermsReachedEnd}
                        checked={bookingAgreed}
                        onChange={(e) => {
                          if (!bookingTermsReachedEnd) return;
                          setBookingAgreed(e.target.checked);
                        }}
                        className="mt-[3px] h-4 w-4 shrink-0 rounded border-slate-300 accent-[color:var(--booking-focus)] focus:ring-2 focus:ring-[color:var(--booking-focus-ring)] enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <label
                        htmlFor="tc-checkbox"
                        className={`min-w-0 flex-1 text-sm leading-snug text-pretty ${bookingTermsReachedEnd ? 'cursor-pointer text-slate-600' : 'cursor-not-allowed text-slate-400'}`}
                      >
                        <span className="inline-flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                          <span>I have read and agree to the</span>
                          <strong className="font-semibold text-slate-900">Terms and Conditions</strong>
                          <span className="font-semibold text-red-600" aria-hidden>
                            *
                          </span>
                        </span>
                      </label>
                    </div>
                    {bookingTermsReachedEnd ? (
                      <div className="pl-7 sm:pl-7">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-left text-xs font-semibold text-indigo-600 underline decoration-indigo-500/35 underline-offset-[3px] transition-colors hover:text-indigo-700 hover:decoration-indigo-600"
                          onClick={() => {
                            setBookingTermsReachedEnd(false);
                            setBookingAgreed(false);
                            const box = document.getElementById('tc-scroll-box');
                            box?.scrollTo({ top: 0, behavior: 'smooth' });
                            box?.focus();
                          }}
                        >
                          <iconify-icon icon="solar:arrow-up-linear" width="14" className="shrink-0 translate-y-px" aria-hidden />
                          Jump to start of terms
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                /* ── Step 6: GCash Downpayment ── */
                <div className="booking-step6 px-4 pb-6 pt-4 sm:px-6">
                  {(() => {
                    const RESERVATION_FEE = 500;
                    const total = Number(bookingForm.servicePrice || 0);
                    const balance = Math.max(total - RESERVATION_FEE, 0);
                    return (
                      <div className="booking-step6-payment-card">
                        <div className="booking-step6-hero">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="booking-step6-icon">
                              <iconify-icon icon="solar:smartphone-bold" width="22"></iconify-icon>
                            </div>
                            <div className="min-w-0">
                              <p className="booking-step6-eyebrow">Secure GCash reservation</p>
                              <h3 className="booking-step6-title">Pay the reservation fee to lock your slot.</h3>
                              <p className="booking-step6-subtitle">
                                Scan the QR, send the exact amount, then upload your GCash receipt for verification.
                              </p>
                            </div>
                          </div>
                          <div className="booking-step6-amount">
                            <span>Due now</span>
                            <strong>₱{RESERVATION_FEE.toLocaleString()}</strong>
                          </div>
                        </div>

                        <div className="booking-step6-ledger">
                          <div className="booking-step6-ledger-item">
                            <span>Total service price</span>
                            <strong>₱{total.toLocaleString()}</strong>
                          </div>
                          <div className="booking-step6-ledger-item is-due">
                            <span>GCash downpayment</span>
                            <strong>₱{RESERVATION_FEE.toLocaleString()}</strong>
                          </div>
                          <div className="booking-step6-ledger-item">
                            <span>Remaining balance onsite</span>
                            <strong>₱{balance.toLocaleString()}</strong>
                          </div>
                        </div>

                        <div className="booking-step6-flow" aria-label="GCash payment steps">
                          {[
                            { icon: 'solar:qr-code-bold', label: 'Scan QR' },
                            { icon: 'solar:wallet-money-bold', label: 'Send ₱500' },
                            { icon: 'solar:upload-minimalistic-bold', label: 'Upload receipt' },
                          ].map((item) => (
                            <div key={item.label} className="booking-step6-chip">
                              <iconify-icon icon={item.icon} width="14"></iconify-icon>
                              <span>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="booking-step6-grid">
                    {/* QR Code - do not change the actual QR asset */}
                    <section className="booking-step6-qr-card" aria-label="GCash QR payment">
                      <div className="booking-step6-section-head">
                        <div>
                          <p className="booking-step6-label">Scan to pay</p>
                          <h4>GCash QR</h4>
                        </div>
                        <span className="booking-step6-status-pill">Exact ₱500</span>
                      </div>
                      <div className="booking-step6-qr-frame">
                        <img src="/gcash-qr.png" alt="GCash QR Code" className="h-48 w-48 rounded-2xl object-contain" onError={(e) => { e.currentTarget.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=AutoSPFPayment'; }} />
                      </div>
                      <p className="booking-step6-helper">Open GCash, scan this QR, then save your receipt screenshot.</p>
                    </section>

                    {/* Upload Proof */}
                    <section className="booking-step6-upload-card">
                      <div className="booking-step6-section-head">
                        <div>
                          <p className="booking-step6-label">Payment proof</p>
                          <h4>Upload GCash receipt</h4>
                        </div>
                        {!bookingDownpaymentProof && <span className="booking-step6-required">Required</span>}
                        {bookingDownpaymentProof && (
                          <span className="booking-step6-uploaded">
                            <iconify-icon icon="solar:check-circle-bold" width="13"></iconify-icon>
                            Uploaded
                          </span>
                        )}
                      </div>

                      <label className={`booking-step6-upload-dropzone group ${bookingDownpaymentProof ? 'is-uploaded' : ''}`}>
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const inputEl = e.target;
                          const file = inputEl.files?.[0];
                          if (!file) return;
                          try {
                            const compressed = await compressImageForBookingProof(file);
                            const reader = new FileReader();
                            reader.onloadend = () => setBookingDownpaymentProof(reader.result as string);
                            reader.readAsDataURL(compressed);
                          } catch {
                            const reader = new FileReader();
                            reader.onloadend = () => setBookingDownpaymentProof(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                          inputEl.value = '';
                        }} />
                        {bookingDownpaymentProof ? (
                          <>
                            <img src={bookingDownpaymentProof} alt="GCash receipt proof" className="absolute inset-0 h-full w-full object-cover opacity-55 transition-opacity group-hover:opacity-35" />
                            <div className="booking-step6-upload-action">
                              <iconify-icon icon="solar:check-circle-bold" width="17"></iconify-icon>
                              <span>Receipt attached - tap to change</span>
                            </div>
                          </>
                        ) : (
                          <div className="booking-step6-upload-empty">
                            <div className="booking-step6-upload-icon">
                              <iconify-icon icon="solar:upload-minimalistic-bold" width="22"></iconify-icon>
                            </div>
                            <p>Tap to upload your GCash receipt</p>
                            <span>JPG or PNG screenshot of your successful transaction</span>
                          </div>
                        )}
                      </label>

                      <div className="booking-step6-info-card">
                        <iconify-icon icon="solar:info-circle-bold" width="17"></iconify-icon>
                        <p>
                          Your booking stays <strong>pending confirmation</strong> until our team verifies your payment.
                          The remaining balance is collected <strong>on your appointment day</strong>.
                        </p>
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>

            {bookingStep === 1 && (
              <div
                className={`booking-package-peek-overlay ${packagePeek.visible ? 'is-visible' : ''}`}
                style={{
                  left: packagePeek.left,
                  top: packagePeek.top,
                  width: packagePeek.width,
                }}
                aria-hidden={!packagePeek.visible}
              >
                <div className="booking-package-peek-pill">
                  {packagePeek.remaining === bookingPackages.length
                    ? `View all ${bookingPackages.length} packages ↓`
                    : `↓ ${packagePeek.remaining} more package${packagePeek.remaining === 1 ? '' : 's'} available`}
                </div>
              </div>
            )}

            {/* Footer */}
            {!bookingDone && (() => {
              // ── Per-step validity — single source of truth ──────────────────
              const contactCompact = (bookingForm.contactNo || '').replace(/\s/g, '');
              const contactOk =
                !!contactCompact &&
                (isValidPhilippineBookingContact(bookingForm.contactNo || '') ||
                  /^\+[1-9]\d{7,14}$/.test(contactCompact));
              const garageVForPlate =
                bookingSelectedVehicleIdx >= 0 && bookingSelectedVehicleIdx < vehicles.length
                  ? vehicles[bookingSelectedVehicleIdx]
                  : undefined;
              const effectivePlateRaw =
                (bookingForm.vehiclePlate || '').trim() ||
                resolveGarageVehiclePlate(garageVForPlate);
              const plateNormStep = normalizePlateNumber(effectivePlateRaw);
              const plateOk = plateNormStep.length >= 4 && plateNormStep.length <= 9;
              const step1Valid = !!bookingForm.service;
              const vehicleFieldsValid =
                !!bookingForm.vehicleMake &&
                !!(bookingForm.vehicleModel || '').trim() &&
                !!bookingForm.vehicleColor &&
                plateOk &&
                !!bookingForm.vehicleCategory;
              const step2Valid = contactOk && vehicleFieldsValid;
              const selectedSlotStatus = slotStatuses.find(s => s.time === bookingForm.time)?.status;
              const step3Valid =
                !!bookingForm.date &&
                !!bookingForm.time &&
                selectedSlotStatus === 'AVAILABLE' &&
                !slotError;
              const step4Valid = true; // Summary step — always passable, just review
              const step5Valid = bookingAgreed && bookingTermsReachedEnd;
              const step6Valid = !!bookingDownpaymentProof && !bookingSubmitting;

              const isStepInvalid =
                (bookingStep === 1 && !step1Valid) ||
                (bookingStep === 2 && !step2Valid) ||
                (bookingStep === 3 && !step3Valid) ||
                (bookingStep === 5 && !step5Valid);

              // Hint shown below button when blocked
                const hintText =
                  bookingStep === 1 ? (!step1Valid ? 'Select a service to continue' : '') :
                    bookingStep === 2 ? (!step2Valid ? 'Complete all required fields above' : '') :
                      bookingStep === 3 ? (
                      !bookingForm.date ? 'Select a date' :
                        slotError ? 'Your selected time is no longer available' :
                          !bookingForm.time ? 'Select an available time slot' :
                            selectedSlotStatus !== 'AVAILABLE' ? 'Selected slot is no longer available' : ''
                    ) :
                      bookingStep === 5
                        ? !bookingTermsReachedEnd
                          ? 'Scroll to the bottom of the terms to enable the checkbox.'
                          : !bookingAgreed
                            ? 'Check the box to agree to the Terms and Conditions.'
                            : ''
                          : '';
                const selectedBookingService = bookingPackages.find((svc: any) => svc.id === bookingForm.service);

                return (
                  <div className="booking-service-footer shrink-0 border-0 px-5 py-4">
                    {bookingStep === 1 && selectedBookingService && (
                      <div className="booking-service-footer-summary mb-3 rounded-2xl border-0 bg-white px-3.5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{selectedBookingService.name}</p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{selectedBookingService.duration}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400">Total</p>
                            <p className="text-lg font-black text-slate-950">₱{bookingForm.servicePrice.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      style={{
                      display: 'grid',
                      gridTemplateColumns: bookingStep > 1 ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)',
                      gap: 10,
                      marginBottom: hintText ? 8 : 0,
                    }}
                  >
                    {bookingStep > 1 && (
                      <button type="button"
                        onClick={() => { setSlotError(''); setStep2Errors({}); setBookingStep(s => s - 1); }}
                        disabled={bookingSubmitting}
                        style={{ width: '100%', padding: '11px 16px', borderRadius: 14, border: 'none', background: 'linear-gradient(180deg,#ffffff,#f1f5f9)', fontSize: 13, fontWeight: 600, color: '#475569', cursor: bookingSubmitting ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease', boxShadow: '0 4px 16px -6px rgba(15,23,42,0.12)' }}>
                        Back
                      </button>
                    )}

                    {bookingStep < 6 ? (
                      <button type="button"
                        disabled={isStepInvalid}
                        onClick={() => {
                          if (bookingStep === 2) {
                            // Trigger inline errors on fields even if button was somehow clickable
                            const errs: Record<string, string> = {};
                            const cc = (bookingForm.contactNo || '').replace(/\s/g, '');
                            if (!(bookingForm.contactNo || '').trim()) errs.contactNo = 'Contact number is required.';
                            else if (!isValidPhilippineBookingContact(bookingForm.contactNo || '') && !/^\+[1-9]\d{7,14}$/.test(cc)) {
                              errs.contactNo = 'Enter a valid PH mobile (09…) or international number.';
                            }
                            {
                              const gv =
                                bookingSelectedVehicleIdx >= 0 && bookingSelectedVehicleIdx < vehicles.length
                                  ? vehicles[bookingSelectedVehicleIdx]
                                  : undefined;
                              const mergedPlate =
                                (bookingForm.vehiclePlate || '').trim() || resolveGarageVehiclePlate(gv);
                              if (!mergedPlate) errs.vehiclePlate = 'Plate number is required.';
                              else if (!plateOk) errs.vehiclePlate = 'Use 4–9 letters/numbers (spaces ignored).';
                            }
                            if (!bookingFromVehicle) {
                              if (!bookingForm.vehicleMake) errs.vehicleMake = 'Select a brand.';
                              if (!(bookingForm.vehicleModel || '').trim()) errs.vehicleModel = 'Model is required.';
                              if (!bookingForm.vehicleColor) errs.vehicleColor = 'Select a color.';
                              if (!bookingForm.vehicleCategory) errs.vehicleCategory = 'Select vehicle type.';
                            }
                            if (Object.keys(errs).length > 0) {
                              setStep2Errors(errs);
                              const firstErr = Object.values(errs)[0];
                              toast.warning('Please fix the form', { description: firstErr, duration: 3500 });
                              return;
                            }
                            setStep2Errors({});
                          }
                          // Guard: prevent Step 3 advance if slot is invalid
                          if (bookingStep === 3 && !step3Valid) return;
                          const nextStep = bookingStep + 1;
                          if (nextStep === 3) {
                            fetchMonthAvailability(bookingCalMonth.getFullYear(), bookingCalMonth.getMonth());
                          }
                          setBookingStep(nextStep);
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px', borderRadius: 14, border: 'none',
                          fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', transition: 'all 0.25s ease',
                          cursor: isStepInvalid ? 'not-allowed' : 'pointer',
                          background: isStepInvalid ? '#e2e8f0' : 'linear-gradient(135deg,#1e293b 0%,#0f172a 55%,#1e293b 100%)',
                          color: isStepInvalid ? '#94a3b8' : '#fff',
                          boxShadow: isStepInvalid ? 'none' : '0 10px 32px -10px rgba(15,23,42,0.28)',
                          opacity: isStepInvalid ? 0.7 : 1,
                        }}>
                          Continue →
                      </button>
                    ) : (
                      <button type="button" onClick={submitBooking} disabled={!step6Valid}
                        style={{
                          width: '100%',
                          padding: '12px 16px', borderRadius: 14, border: 'none',
                          fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', transition: 'all 0.25s ease',
                          cursor: step6Valid ? 'pointer' : 'not-allowed',
                          background: step6Valid ? 'linear-gradient(135deg,#1e293b 0%,#0f172a 55%,#1e293b 100%)' : '#e2e8f0',
                          color: step6Valid ? '#fff' : '#94a3b8',
                          boxShadow: step6Valid ? '0 10px 32px -10px rgba(15,23,42,0.28)' : 'none',
                          opacity: step6Valid ? 1 : 0.7,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}>
                        {bookingSubmitting ? (
                          <>
                            <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                            Submitting…
                          </>
                        ) : 'Confirm Booking'}
                      </button>
                    )}
                  </div>

                  {/* Inline hint — what's blocking the button */}
                  {hintText && (
                    <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', fontWeight: 500, letterSpacing: '0.01em' }}>
                      {hintText}
                    </p>
                  )}
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* Tracker stage photos — in-page gallery */}
      {trackerEvidenceLightbox && (() => {
        const lb = trackerEvidenceLightbox;
        const current = lb.items[lb.index];
        if (!current) return null;
        const total = lb.items.length;
        const canPrev = lb.index > 0;
        const canNext = lb.index < total - 1;
        const ariaTitle = `${lb.stepTitle} — ${current.label}`;
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const hiResSrc = toCloudinaryHighResDeliveryUrl(current.url, dpr);
        return (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label={ariaTitle}
          onClick={() => setTrackerEvidenceLightbox(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col px-10 sm:px-12" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setTrackerEvidenceLightbox(null)}
              className="absolute -top-11 right-0 text-white/85 hover:text-white text-sm font-semibold flex items-center gap-1 z-10"
            >
              <iconify-icon icon="solar:close-circle-linear" width="20"></iconify-icon>
              Close
            </button>
            <div className="relative flex w-full items-center justify-center">
              {total > 1 && (
                <button
                  type="button"
                  disabled={!canPrev}
                  aria-label="Previous photo"
                  onClick={() =>
                    setTrackerEvidenceLightbox((p) =>
                      p && p.index > 0 ? { ...p, index: p.index - 1 } : p,
                    )
                  }
                  className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white shadow-lg transition hover:bg-black/60 disabled:pointer-events-none disabled:opacity-25 sm:h-11 sm:w-11"
                >
                  <iconify-icon icon="solar:alt-arrow-left-bold" width="22"></iconify-icon>
                </button>
              )}
              <img
                key={hiResSrc}
                src={hiResSrc}
                alt=""
                className="w-full max-h-[min(85vh,900px)] object-contain rounded-2xl shadow-2xl border border-white/10 bg-slate-950/40"
              />
              {total > 1 && (
                <button
                  type="button"
                  disabled={!canNext}
                  aria-label="Next photo"
                  onClick={() =>
                    setTrackerEvidenceLightbox((p) =>
                      p && p.index < p.items.length - 1 ? { ...p, index: p.index + 1 } : p,
                    )
                  }
                  className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white shadow-lg transition hover:bg-black/60 disabled:pointer-events-none disabled:opacity-25 sm:h-11 sm:w-11"
                >
                  <iconify-icon icon="solar:alt-arrow-right-bold" width="22"></iconify-icon>
                </button>
              )}
            </div>
            <p className="text-center text-white/85 text-xs mt-3 font-medium">{ariaTitle}</p>
            {total > 1 && (
              <p className="text-center text-white/50 text-[11px] mt-1 font-medium tabular-nums">
                {lb.index + 1} / {total} — use arrows or keys ← →
              </p>
            )}
          </div>
        </div>
        );
      })()}

      {/* Feedback Modal */}
      {feedbackOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl w-full max-w-[440px] overflow-hidden" style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.03)', animation: 'modalIn .25s ease-out' }} onClick={e => e.stopPropagation()}>
            {!feedbackSubmitted ? (
              <>
                {/* Gradient Header */}
                <div className="relative px-6 pt-6 pb-5" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)' }}>
                  <button onClick={() => { setFeedbackOpen(false); setFeedbackRating(0); setFeedbackHover(0); setFeedbackText(''); }} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: 'rgba(255,255,255,.15)' }} onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,.25)')} onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,.15)')}>
                    <iconify-icon icon="solar:close-circle-linear" width="18" style={{ color: '#fff' }}></iconify-icon>
                  </button>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ backgroundColor: 'rgba(255,255,255,.2)', color: '#fff' }}>Service Complete</div>
                  </div>
                  <h2 className="font-bold text-xl text-white leading-tight">How was your experience?</h2>
                  <p className="text-indigo-100 text-sm mt-1 opacity-80">Your feedback helps us deliver the best service.</p>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Vehicle Chip */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50" style={{ border: '1px solid #e2e8f0' }}>
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                      <iconify-icon icon="solar:car-bold" width="20" style={{ color: '#fff' }}></iconify-icon>
                    </div>
                    <div className="flex-1 min-w-0">
                      <select value={feedbackVehicle} onChange={e => setFeedbackVehicle(e.target.value)} className="w-full text-sm font-semibold text-slate-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer appearance-none">
                        <option>Tesla Model 3</option>
                        <option>Honda Civic</option>
                      </select>
                      <p className="text-[11px] text-slate-500">Detailing · Premium Package</p>
                    </div>
                    <iconify-icon icon="solar:alt-arrow-down-linear" width="16" style={{ color: '#94a3b8' }}></iconify-icon>
                  </div>

                  {/* Star Rating */}
                  <div className="text-center">
                    <div className="flex justify-center gap-2 mb-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} type="button" onMouseEnter={() => setFeedbackHover(star)} onMouseLeave={() => setFeedbackHover(0)} onClick={() => setFeedbackRating(star)} className="transition-all duration-150" style={{ transform: star <= (feedbackHover || feedbackRating) ? 'scale(1.15)' : 'scale(1)' }}>
                          <iconify-icon icon={star <= (feedbackHover || feedbackRating) ? 'solar:star-bold' : 'solar:star-linear'} width="36" style={{ color: star <= (feedbackHover || feedbackRating) ? '#f59e0b' : '#d1d5db', filter: star <= (feedbackHover || feedbackRating) ? 'drop-shadow(0 2px 4px rgba(245,158,11,.3))' : 'none' }}></iconify-icon>
                        </button>
                      ))}
                    </div>
                    {feedbackRating > 0 && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-100">
                        <span className="text-base">{feedbackRating === 5 ? '🤩' : feedbackRating === 4 ? '😊' : feedbackRating === 3 ? '😐' : feedbackRating === 2 ? '😕' : '😞'}</span>
                        <span className="text-xs font-semibold text-amber-700">{feedbackRating === 5 ? 'Outstanding!' : feedbackRating === 4 ? 'Great experience!' : feedbackRating === 3 ? 'It was okay' : feedbackRating === 2 ? 'Could be better' : 'Needs improvement'}</span>
                      </div>
                    )}
                  </div>

                  {/* Review text */}
                  <div>
                    <label className="text-[13px] font-semibold text-slate-700 block mb-1.5">Tell us more</label>
                    <div className="relative">
                      <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} rows={3} maxLength={500} placeholder="Share details about your experience — what went well, what we could improve..." className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-slate-400" />
                      <div className="flex items-center justify-between mt-1.5 px-1">
                        <div className="flex gap-1">
                          {['😍', '👍', '🔥', '💯'].map(emoji => (
                            <button key={emoji} type="button" onClick={() => setFeedbackText(prev => prev + emoji)} className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-sm transition-colors">{emoji}</button>
                          ))}
                        </div>
                        <span className={`text-[11px] font-medium ${feedbackText.length > 450 ? 'text-amber-500' : 'text-slate-400'}`}>{feedbackText.length}/500</span>
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <button onClick={handleFeedbackSubmit} disabled={feedbackRating === 0 || !feedbackText.trim()} className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${feedbackRating > 0 && feedbackText.trim() ? 'text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`} style={feedbackRating > 0 && feedbackText.trim() ? { background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' } : {}}>
                    <iconify-icon icon="solar:star-shine-bold" width="18"></iconify-icon>
                    Submit Review
                  </button>

                  <p className="text-[11px] text-slate-400 text-center leading-relaxed">Your review will be featured in our <span className="font-semibold text-indigo-500">Trusted by Car Enthusiasts</span> section.</p>
                </div>
              </>
            ) : (
              /* Success state */
              <div className="px-6 py-14 text-center" style={{ animation: 'modalIn .3s ease-out' }}>
                <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' }}>
                  <iconify-icon icon="solar:check-circle-bold" width="48" style={{ color: '#059669' }}></iconify-icon>
                </div>
                <h3 className="font-bold text-xl text-slate-900 mb-2">Thank you, Alex! 🎉</h3>
                <p className="text-sm text-slate-500 max-w-[280px] mx-auto leading-relaxed">Your review has been submitted and will appear in our testimonials. We appreciate your support!</p>
                <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100">
                  <iconify-icon icon="solar:star-bold" width="14" style={{ color: '#f59e0b' }}></iconify-icon>
                  <span className="text-xs font-semibold text-emerald-700">{feedbackRating} Star Review Published</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-[110] flex items-center gap-3 bg-white px-5 py-3.5 rounded-xl shadow-lg border border-slate-200" style={{ animation: 'slideUp .3s ease-out' }}>
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <iconify-icon icon="solar:check-circle-bold" width="20" style={{ color: '#10b981' }}></iconify-icon>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Feedback submitted!</p>
            <p className="text-xs text-slate-500">Your review is now live. Thank you!</p>
          </div>
          <button onClick={() => setFeedbackToast(false)} className="text-slate-400 hover:text-slate-600 ml-2">
            <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
          </button>
        </div>
      )}

      <style>{`
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes modalIn {
        from { opacity: 0; transform: scale(.95) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes ring {
        0% { transform: rotate(0); }
        5% { transform: rotate(15deg); }
        10% { transform: rotate(-10deg); }
        15% { transform: rotate(15deg); }
        20% { transform: rotate(-10deg); }
        25% { transform: rotate(0); }
        100% { transform: rotate(0); }
      }
      @keyframes scanLine {
        0% { top: 0%; opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { top: 100%; opacity: 0; }
      }
      @keyframes fadeInScale {
        from { opacity: 0; transform: scale(0.7); }
        to { opacity: 1; transform: scale(1); }
      }
      @keyframes heroFloatA {
        0%, 100% { transform: translate3d(0, 0, 0); }
        50% { transform: translate3d(0, -12px, 0); }
      }
      @keyframes heroFloatB {
        0%, 100% { transform: translate3d(0, 0, 0); }
        50% { transform: translate3d(-10px, 10px, 0); }
      }
      @keyframes heroSweep {
        0% { transform: translateX(-120%); opacity: 0; }
        20% { opacity: 1; }
        80% { opacity: 1; }
        100% { transform: translateX(120%); opacity: 0; }
      }
      @keyframes gradientMove {
        0% { background-position: 0% 50%; }
        100% { background-position: 100% 50%; }
      }
      @keyframes floatCard {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      @keyframes activePulse {
        0%, 100% { box-shadow: 0 16px 30px rgba(15, 23, 42, 0.18); }
        50% { box-shadow: 0 24px 40px rgba(14, 165, 233, 0.28); }
      }
      @keyframes glowPulse {
        0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.25); }
        50% { box-shadow: 0 0 35px rgba(251, 191, 36, 0.45); }
      }
      @keyframes shimmerGlow {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>

      {/* Edit Vehicle Modal */}
      {editVehicleOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setEditVehicleOpen(false); setEditVehicleErrors({}); }}
        >
          <div
            className="bg-white rounded-xl w-full max-w-[420px] shadow-2xl max-h-[90vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'modalIn .2s ease-out', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <iconify-icon icon="solar:pen-bold" width="15" style={{ color: '#475569' }}></iconify-icon>
                </div>
                <h3 className="text-[15px] font-semibold text-gray-900">Edit Vehicle</h3>
              </div>
              <button
                type="button"
                onClick={() => { setEditVehicleOpen(false); setEditVehicleErrors({}); }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <VehicleGarageForm
                variant="compact"
                values={editVehicleForm}
                onChange={setEditVehicleForm}
                errors={editVehicleErrors}
                onClearError={(field) => setEditVehicleErrors((er) => ({ ...er, [field]: '' }))}
                showCustomColorInput={editVehicleShowColorInput}
                onShowCustomColorInput={setEditVehicleShowColorInput}
                apiError={editVehicleApiError}
                showPricingPreview
                bookingPackages={bookingPackages}
              />
            </div>

            <div className="flex gap-2 px-5 pb-5 pt-1">
              <button
                type="button"
                onClick={() => { setEditVehicleOpen(false); setEditVehicleErrors({}); }}
                className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditVehicle}
                className="flex-1 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle History Modal */}
      {vehicleHistoryOpen && vehicleHistoryVehicle && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(5px)' }}
          onClick={() => setVehicleHistoryOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl shadow-slate-900/15 overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'modalIn .2s ease-out', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                  <iconify-icon icon="solar:car-bold" width="18" style={{ color: '#475569' }}></iconify-icon>
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900">{vehicleHistoryVehicle.name}</h3>
                  <p className="text-xs text-gray-400">{vehicleHistoryVehicle.plate} · {vehicleHistoryVehicle.type}</p>
                </div>
              </div>
              <button onClick={() => setVehicleHistoryOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
              </button>
            </div>

            {/* Body */}
            <div className="booking-body min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {vehicleHistoryLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-400">Loading history...</p>
                </div>
              ) : vehicleHistoryOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                    <iconify-icon icon="solar:history-linear" width="26" style={{ color: '#94a3b8' }}></iconify-icon>
                  </div>
                  <p className="text-[14px] font-semibold text-gray-800">No service history yet</p>
                  <p className="text-xs text-gray-400 mt-1 mb-5">This vehicle has no bookings on record.</p>
                  <button
                    onClick={() => { setVehicleHistoryOpen(false); openBookingModal(vehicleHistoryVehicle); }}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Book a Service Now
                  </button>
                </div>
              ) : (
                <div className="p-5 space-y-3">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    {vehicleHistoryOrders.length} service{vehicleHistoryOrders.length !== 1 ? 's' : ''} found
                  </p>
                  {vehicleHistoryOrders.map((order: any, i: number) => {
                    const statusColors: Record<string, string> = {
                      completed: 'bg-green-50 text-green-700',
                      released: 'bg-green-50 text-green-700',
                      done: 'bg-green-50 text-green-700',
                      pending: 'bg-amber-50 text-amber-700',
                      confirmed: 'bg-blue-50 text-blue-700',
                      'in-progress': 'bg-indigo-50 text-indigo-700',
                      cancelled: 'bg-red-50 text-red-600',
                    };
                    const statusColor = statusColors[order.status] || 'bg-gray-100 text-gray-600';
                    const dateStr = order.bookingDate || order.date
                      ? new Date(order.bookingDate || order.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—';
                    return (
                      <div
                        key={i}
                        className="rounded-2xl p-4 bg-gradient-to-br from-slate-50 to-slate-100/60 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08)] hover:shadow-[0_6px_20px_-6px_rgba(15,23,42,0.12)] transition-shadow duration-200"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-gray-900 truncate">{order.serviceType || order.serviceName || 'Service'}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{dateStr}{order.bookingTime ? ` at ${order.bookingTime}` : ''}</p>
                          </div>
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusColor}`}>
                            {order.status}
                          </span>
                        </div>
                        {order.price > 0 && (
                          <p className="text-sm font-bold text-gray-800 mt-2">₱{Number(order.price).toLocaleString()}</p>
                        )}
                        {order.notes && (
                          <p className="text-xs text-gray-400 mt-1 italic">"{order.notes}"</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {!vehicleHistoryLoading && vehicleHistoryOrders.length > 0 && (
              <div className="px-5 pt-3 pb-5 shrink-0 bg-gradient-to-t from-white via-white to-slate-50/30">
                <button
                  onClick={() => { setVehicleHistoryOpen(false); openBookingModal(vehicleHistoryVehicle); }}
                  className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20"
                >
                  <iconify-icon icon="solar:calendar-add-linear" width="16"></iconify-icon>
                  Book Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
}
