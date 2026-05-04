import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { NotificationService, SystemNotification } from '../lib/notification-service';
import { toast } from 'sonner';
import { invalidate } from '../lib/queryCache';
import { useLiveJobs, type BookingStatusEvent } from '../hooks/useLiveJobs';
import { isValidPhilippineMobileInput, isValidPhilippineBookingContact, formatContactNoInputFromProfile, normalizePhilippineMobileForBooking } from '../lib/phone';
import { normalizePlateNumber } from '../lib/plate';

type DashboardSection = 'dashboard' | 'scan' | 'settings' | 'bookings' | 'documents' | 'rewards' | 'tracker' | 'payments';

type ScanUpload = {
  id: string;
  name: string;
  size: number;
  preview: string;
};

// ---- STATIC DATA FOR BOOKING ----
const ADD_VEHICLE_TYPE_LABELS = ['Hatchback', 'Sedan', 'Midsized', 'SUV', 'Pick UP', 'Large SUV / Van', 'Highend Sedan'] as const;

const BOOKING_YEAR_OPTIONS = Array.from({ length: 36 }, (_, i) => String(2025 - i));

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

const RAW_SPF_PACKAGES = [
  {
    id: "spf80", name: "SPF 80 — Essential",
    duration: "Perfect entry-level protection",
    prices: { hatchback: 7499, sedan: 7999, midsized: 7999, suv: 8999, pickup: 8499, largesuv: 12999, highend: 14999 },
    features: [
      "3 Layers Graphene Ceramic Coating (Canada)",
      "Graphene Sealant",
      "FREE 1 visit Signature AUTOSPF Carwash",
    ]
  },
  {
    id: "spf89", name: "SPF 89 — Advanced",
    duration: "Our most chosen package",
    prices: { hatchback: 8999, sedan: 9999, midsized: 10999, suv: 11999, pickup: 10999, largesuv: 14999, highend: 17999 },
    features: [
      "4 Layers Graphene Ceramic Coating (Canada)",
      "Graphene Sealant",
      "FREE 1 visit Reboost/Maintenance (save ₱1,500)",
    ]
  },
  {
    id: "spf99", name: "SPF 99 — Premium",
    duration: "Maximum protection, best price-to-value",
    prices: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largesuv: 19999, highend: 22999 },
    features: [
      "4 Layers SONAX Profiline CC EVO (Germany)",
      "FREE Full Recoat After 5 Years",
      "FREE 2 visits Reboost/Maintenance (save ₱3,000)",
    ]
  },
  {
    id: "spf101", name: "SPF 101 — Flagship ALL-IN",
    duration: "The complete transformation experience",
    prices: { hatchback: 39999, sedan: 39999, midsized: 46999, suv: 46999, pickup: 46999, largesuv: 49999, highend: 49999 },
    features: [
      "PPF Coverage (Hood, Bumper, Mirrors, Stepsils, Door Bowls, Lights)",
      "4 Layers SONAX Profiline CC EVO (Germany)",
      "FREE 5 visits Reboost/Maintenance (save ₱7,500)",
      "FREE Full Recoat After 5 Years",
      "Nano Ceramic Window Tint (Full Wrap — Any Shade)",
      "FREE Undercoating (Rust Proofing)",
    ]
  }
];

const SCAN_FLOW_STEPS = [
  {
    title: 'Scan Vehicle',
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

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/** Normalize API vehicle → garage / booking UI shape (single source of truth). */
function mapCustomerVehicleApiRecord(v: any) {
  return {
    _id: v._id || v.id,
    id: v._id || v.id,
    plate: v.plateNumber || v.plate || '',
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
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<DashboardSection>(() => {
    const search = new URLSearchParams(location.search);
    const s = search.get('section');
    return s === 'settings'
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
                  : 'dashboard';
  });
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
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

  // ── Real-time tracker updates via useLiveJobs socket ─────────────────────────
  // When QC advances a stage, the backend emits booking:status to user:${id} room.
  // We ONLY patch serviceTrackingStage (and staff assignments) — never status.
  // Patching status from socket events caused the 'Booking Not Confirmed' bug:
  // ready_pickup was emitting status:'completed', hasActiveBooking → false,
  // the live tracker hid, and any old rejected order surfaced instead.
  // The status field is authoritative only from the polling refetch (DB source).
  const handleBookingStatus = useCallback((event: BookingStatusEvent) => {
    const { bookingId, serviceTrackingStage, serviceStaffAssignments } = event;
    if (!bookingId) return;
    console.log('[TRACKER] booking:status → patching stage:', { bookingId, serviceTrackingStage });
    setMyBookings((prev: any[]) =>
      prev.map((b: any) => {
        const id = b.id || b._id;
        if (id !== bookingId) return b;
        return {
          ...b,
          // Only update the fine-grained tracking stage — let polling handle status
          ...(serviceTrackingStage !== undefined ? { serviceTrackingStage } : {}),
          ...(serviceStaffAssignments?.length ? { serviceStaffAssignments } : {}),
        };
      })
    );
    // Bust cache so the very next poll fetches fresh status from DB
    invalidate('/bookings');
  }, []);

  // useLiveJobs manages the singleton socket, room joining, and the booking:status listener.
  // We only need its onBookingStatus callback here — the polling handles myBookings separately.
  // onNotification fires when a notification:customer socket event arrives — prepend to bell list.
  const handleIncomingNotification = useCallback((notif: any) => {
    if (!notif || !notif.id) return;
    setNotifications((prev: any[]) => {
      // Avoid duplicates if the server emits more than once
      if (prev.some((n: any) => n.id === notif.id || n._id === notif.id)) return prev;
      return [{ ...notif, isRead: false }, ...prev];
    });
  }, []);
  useLiveJobs(user, handleBookingStatus, handleIncomingNotification);

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
    const fetchCustomerStats = async () => {
      try {
        const { OrderService } = await import('../lib/order-service');
        const res = await OrderService.getAllOrders({ suppressErrorToast: true });
        if (!res.success || !Array.isArray(res.data)) return;

        // Filter orders belonging to the current customer.
        // Normalize both sides to strings — customer ObjectId serializes as string from API.
        const myId = String(user.id || user._id || '');
        const myOrders = res.data
          .filter((o: any) => {
            const custId = String(
              o.customerId || o.customer?._id || o.customer || ''
            );
            return custId === myId || o.customerName === user.name;
          })
          .sort((a: any, b: any) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );

        // Current status: find active booking (in-progress, assigned, checked-in, etc.)
        // 'completed' means service done, car still in shop — show it as active.
        const activeStatuses = ['in-progress', 'assigned', 'checked-in', 'processing', 'confirmed', 'approved', 'in_progress', 'received', 'completed'];
        const activeOrder = myOrders.find((o: any) => activeStatuses.includes(o.status));
        let currentStatus = '';
        if (activeOrder) {
          const statusMap: Record<string, string> = {
            'in-progress': 'In Shop — In Progress', 'in_progress': 'In Shop — In Progress',
            'assigned': 'Assigned — Waiting', 'checked-in': 'Checked In',
            'processing': 'Processing', 'confirmed': 'Confirmed — Scheduled',
            'approved': 'Approved — Scheduled', 'received': 'Vehicle Received',
            'completed': 'Ready for Pickup ✓',
          };
          currentStatus = statusMap[activeOrder.status] || activeOrder.status;
          if (activeOrder.serviceName && activeOrder.serviceName !== 'Service') {
            currentStatus = `In Shop — ${activeOrder.serviceName}`;
          }
        }

        // Next appointment: find the nearest future booking with 'pending' or 'confirmed' status
        const upcomingStatuses = ['pending', 'confirmed', 'assigned'];
        const upcoming = myOrders
          .filter((o: any) => upcomingStatuses.includes(o.status) && o.date)
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        let nextAppointment = '';
        if (upcoming.length > 0) {
          const d = new Date(upcoming[0].date);
          const timeStr = upcoming[0].time || '';
          nextAppointment = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${timeStr ? `, ${timeStr}` : ''}`;
        }

        // Last service: most recent completed/released booking
        const doneStatuses = ['completed', 'released', 'done', 'delivered'];
        const completed = myOrders
          .filter((o: any) => doneStatuses.includes(o.status))
          .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
        let lastService = '';
        if (completed.length > 0) {
          const ls = completed[0];
          const dateStr = new Date(ls.updatedAt || ls.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          lastService = `${ls.serviceName || 'Service'} (${dateStr})`;
        }

        // Loyalty points: 50 pts per completed booking
        const loyaltyPoints = completed.length * 50;

        // ── hasActiveBooking: show tracker whenever the car is still in the shop ──
        // 'completed' = QC done, service complete, car STILL IN SHOP (ready for pickup).
        // 'released'  = car physically handed back to customer (truly done, hide tracker).
        // We must include 'completed' here — removing it was the root bug that caused
        // the 'Booking Not Confirmed' card to surface from an old rejected booking.
        const trackerStatuses = [
          'approved', 'confirmed', 'assigned',
          'received', 'in_progress', 'in-progress',
          'completed',  // ← service done, car ready for pickup — tracker stays visible
        ];
        const trackerOrder = myOrders.find((o: any) => trackerStatuses.includes(o.status));
        setHasActiveBooking(!!trackerOrder);

        // Approved/Confirmed/Assigned — booking is locked in, waiting for vehicle to arrive
        const approvedOrder = myOrders.find((o: any) => ['approved', 'confirmed', 'assigned'].includes(o.status));
        setApprovedBooking(approvedOrder || null);

        // Pending confirmation — show waiting screen instead of tracker
        const pendingOrder = myOrders.find((o: any) => o.status === 'pending_confirmation');
        setPendingConfirmationBooking(pendingOrder || null);

        // Rejected — only show re-book card if the MOST RECENT order is rejected.
        // Old rejected orders buried behind completed/released ones should never
        // resurface — the customer has already moved on to newer bookings.
        const mostRecent = myOrders[0]; // already sorted newest-first by caller
        const rejected = mostRecent?.status === 'rejected' ? mostRecent : null;
        setRejectedBooking(rejected);

        setCustomerStats({ currentStatus, nextAppointment, lastService, loyaltyPoints });
      } catch (err) {
        console.warn('[CustomerDashboard] Failed to fetch stats:', err);
      }
    };
    fetchCustomerStats();
    // Auto-refresh stats every 5 seconds for live updates
    const interval = setInterval(fetchCustomerStats, 5000);
    return () => clearInterval(interval);
  }, [user]);

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
  const [bookingDownpaymentProof, setBookingDownpaymentProof] = useState<string | null>(null);
  // True when booking was opened from a garage vehicle card (pre-filled, read-only vehicle fields)
  const [bookingFromVehicle, setBookingFromVehicle] = useState(false);

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
    const errors: Record<string, string> = {};
    const plateRaw = editVehicleForm.plate.trim();
    const plateNorm = normalizePlateNumber(plateRaw);
    const brand = editVehicleForm.brand.trim();
    const model = editVehicleForm.model.trim();
    const type = editVehicleForm.type.trim();

    if (!plateRaw) errors.plate = 'Plate number is required.';
    else if (plateNorm.length < 4 || plateNorm.length > 9) {
      errors.plate = 'Use 4–9 letters and numbers (spaces are ignored).';
    }
    if (!brand) errors.brand = 'Select a brand.';
    if (!model) errors.model = 'Model is required (e.g. Vios, Civic).';
    else if (model.length < 2) errors.model = 'Too short — enter the model name.';
    if (!type) errors.type = 'Please select a vehicle type.';
    if (Object.keys(errors).length > 0) { setEditVehicleErrors(errors); return; }
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
  // Map vehicle type labels → pricing keys
  const VEHICLE_TYPE_MAP: Record<string, string> = {
    'hatchback': 'hatchback', 'sedan': 'sedan', 'midsized': 'midsized',
    'suv': 'suv', 'pick up': 'pickup', 'pickup': 'pickup',
    'large suv / van': 'largesuv', 'large suv': 'largesuv', 'van': 'largesuv',
    'highend': 'highend',
    'highend sedan': 'highend', 'high-end sedan': 'highend',
  };
  const getVehiclePriceKey = (type: string) => VEHICLE_TYPE_MAP[type?.toLowerCase()] || 'hatchback';

  const BOOKING_TIMES = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
  const CAR_BRANDS = ['Toyota', 'Honda', 'Mitsubishi', 'Ford', 'Hyundai', 'Kia', 'Nissan', 'Suzuki', 'Mazda', 'Isuzu', 'Chevrolet', 'BMW', 'Mercedes-Benz', 'Audi', 'Subaru', 'Volkswagen', 'Lexus', 'Jeep', 'RAM', 'Other'];
  const [bookingCalMonth, setBookingCalMonth] = useState(() => {
    const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  // Raw booked strings kept for monthAvailability logic
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});
  // Structured per-slot statuses for the selected date
  type SlotStatus = 'AVAILABLE' | 'FULL' | 'CLOSED';
  type TimeSlot = { time: string; status: SlotStatus };
  const [slotStatuses, setSlotStatuses] = useState<TimeSlot[]>([]);
  const [slotError, setSlotError] = useState<string>('');
  // Per-date availability: 'available' | 'full' | 'closed'
  const [monthAvailability, setMonthAvailability] = useState<Record<string, 'available' | 'full' | 'closed'>>({});
  const [monthAvailLoading, setMonthAvailLoading] = useState(false);

  const openBookingModal = async (preSelectedVehicle?: any) => {
    setBookingOpen(true); setBookingStep(1); setBookingDone(false);
    setBookingAgreed(false); setBookingDownpaymentProof(null);
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
    setBookingForm({
      service: '', serviceName: '', servicePrice: 0,
      // Populate individual vehicle fields from the garage record
      vehicleMake: targetVehicle ? (targetVehicle.make || '') : '',
      vehicleModel: targetVehicle ? (targetVehicle.model || '') : '',
      vehicleYear: targetVehicle ? (targetVehicle.year || '') : '',
      vehicleColor: targetVehicle ? (targetVehicle.color || '') : '',
      vehiclePlate: targetVehicle ? (targetVehicle.plate || '') : '',
      vehicleCategory: targetVehicle ? (targetVehicle.type || '') : '',
      vehicleTransmission: targetVehicle ? (targetVehicle.transmission || '') : '',
      vehicleFuelType: targetVehicle ? (targetVehicle.fuelType || '') : '',
      contactNo: formatContactNoInputFromProfile(profile.phone || (user as any)?.phone || ''),
      date: '', time: '', notes: '',
    });
  };

  const fetchSlotsForDate = async (dateIso: string, currentSelectedTime?: string) => {
    if (!dateIso) return;
    setSlotsLoading(true);
    setSlotError('');
    try {
      const res = await fetch(`/api/orders/available-slots?date=${dateIso}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      const data = await res.json();
      const apiBooked: string[] = Array.isArray(data.bookedSlots) ? data.bookedSlots : [];
      setBookedSlots(apiBooked);

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

      const derived: TimeSlot[] = BOOKING_TIMES.map(t => {
        if (apiBooked.includes(t)) return { time: t, status: 'FULL' as SlotStatus };
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
        const nowStatus = derived.find(s => s.time === currentSelectedTime)?.status;
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
    const token = localStorage.getItem('authToken');
    const result: Record<string, 'available' | 'full' | 'closed'> = {};

    // Build list of dates to fetch (skip weekends and past dates)
    const datesToFetch: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isPast = date < today;
      if (isWeekend || isPast) {
        result[iso] = 'closed';
      } else {
        datesToFetch.push(iso);
      }
    }

    // Parallel fetch for all workday dates
    try {
      await Promise.all(datesToFetch.map(async (iso) => {
        try {
          const res = await fetch(`/api/orders/available-slots?date=${iso}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          const booked: string[] = Array.isArray(data.bookedSlots) ? data.bookedSlots : [];
          result[iso] = booked.length >= BOOKING_TIMES.length ? 'full' : 'available';
        } catch {
          result[iso] = 'available'; // fail-open: allow selection if API fails
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
        vehiclePlate: normalizePlateNumber(bookingForm.vehiclePlate || ''),
        price: bookingForm.servicePrice, bookingDate: bookingForm.date,
        bookingTime: bookingForm.time, notes: bookingForm.notes,
        items: JSON.stringify([{ product: bookingForm.service, quantity: 1, price: bookingForm.servicePrice }]),
        // GCash proof — sent as base64 data URL so Sales can verify the payment screenshot
        downpaymentProof: bookingDownpaymentProof || undefined,
        paymentProofUrl: bookingDownpaymentProof || undefined,
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
        // Refresh myBookings so the pending_confirmation card appears
        try {
          const { OrderService: OS } = await import('../lib/order-service');
          const r = await OS.getAllOrders({ suppressErrorToast: true });
          if (r.success && Array.isArray(r.data)) {
            const mine = r.data.filter((o: any) => {
              const cid = o.customerId || o.customer?._id || o.customer;
              return cid === user?.id || cid === user?._id || o.customerName === user?.name;
            });
            setMyBookings(mine);
            const pc = mine.find((o: any) => o.status === 'pending_confirmation');
            setPendingConfirmationBooking(pc || null);
          }
        } catch { /* silent */ }

      } else if (res?.status === 409 || res?.message?.toLowerCase().includes('slot')) {
        const serverMsg = res.message || 'Slot is no longer available. Please select another time.';
        toast.dismiss(loadingId);
        toast.error('Time slot no longer available', { description: serverMsg, duration: 5000 });
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
      const msg = e?.response?.data?.message || e?.message || '';
      if (e?.response?.status === 409 || msg.toLowerCase().includes('slot')) {
        toast.error('Time slot no longer available', {
          description: msg || 'Please select a different time.',
          duration: 5000,
        });
        setSlotError(msg || 'Slot is no longer available. Please select another time.');
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
    const errors: Record<string, string> = {};
    const plate = newVehicle.plate.trim();
    const plateNorm = normalizePlateNumber(plate);
    const brand = newVehicle.brand.trim();
    const model = newVehicle.model.trim();
    const type = newVehicle.type.trim();

    // Plate: required
    if (!plate.trim()) {
      errors.plate = 'Plate number is required.';
    } else if (plateNorm.length < 4 || plateNorm.length > 9) {
      errors.plate = 'Use 4–9 letters and numbers (spaces are ignored).';
    }
    if (!brand) errors.brand = 'Select a brand.';
    if (!model) {
      errors.model = 'Model is required (e.g. Vios, Civic).';
    } else if (model.length < 2) {
      errors.model = 'Too short — enter the model name.';
    }
    if (!type) errors.type = 'Please select a vehicle type.';

    if (Object.keys(errors).length > 0) {
      setVehicleErrors(errors);
      return;
    }

    // Save to DB — optimistic row + refetch so list can't be overwritten by a stale in-flight GET
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
      type,
      transmission: newVehicle.transmission || '',
      fuelType: newVehicle.fuelType || '',
    };

    vehiclesFetchGenRef.current += 1;
    setVehicles(prev => [...prev, optimisticVehicle]);

    try {
      const { VehicleService } = await import('../lib/vehicle-service');
      const res = await VehicleService.addVehicle({
        plateNumber: plateNorm,
        year: newVehicle.year || '',
        make: brand,
        model,
        color: newVehicle.color.trim() || 'Unknown',
        vehicleType: type,
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
    else if (!/[0-9]/.test(passwords.newPass)) errs.newPass = 'Must contain at least one number.';
    if (passwords.newPass !== passwords.confirm) errs.confirm = 'Passwords do not match.';
    setPasswordErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validatePasswords()) return;
    setPasswordSaved(true);
    setPasswords({ current: '', newPass: '', confirm: '' });
    setTimeout(() => setPasswordSaved(false), 3000);
  }

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const s = search.get('section');
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
  }, [location.search]);

  // Fetch My Bookings whenever section opens — with socket-driven instant updates
  const loadBookingsRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!['dashboard', 'bookings', 'documents', 'rewards', 'tracker'].includes(activeSection) || !user) return;

    const load = async () => {
      // ── Bust cache before every fetch so polling always gets fresh data ──
      // The cache TTL (5s) matches the poll interval, meaning the cache would
      // always be fresh and the poll would return stale data. Invalidating first
      // guarantees we hit the network on every poll tick.
      invalidate('/bookings');

      setMyBookingsLoading(true);
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
            const serviceName = booking.serviceName || booking.serviceType || 'Service';
            const status = (booking.status || '').toLowerCase();
            const docType = status === 'completed' || status === 'released' ? 'report' : 'waiver';
            return {
              id: booking._id || booking.id || `${serviceName}-${index}`,
              type: docType,
              icon: docType === 'report' ? 'solar:file-text-bold' : 'solar:document-add-bold',
              title: docType === 'report' ? `${serviceName} Completion Report` : `${serviceName} Service Intake`,
              desc: `${booking.vehiclePlate || 'Vehicle'} • ${booking.date || 'Scheduled service'}`,
              date: booking.date ? new Date(booking.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Pending date',
              status: docType === 'waiver' ? 'Pending' : 'Signed',
            };
          });
          setDocuments(nextDocuments);

          const nextActivities = mine.slice(0, 8).map((booking: any) => ({
            id: booking._id || booking.id,
            title: booking.serviceName || booking.serviceType || 'Service update',
            desc: `${(booking.status || 'pending').replace('-', ' ')} • ${booking.vehiclePlate || 'Vehicle profile pending'}`,
            time: new Date(booking.updatedAt || booking.createdAt || Date.now()).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }),
          }));
          setActivities(nextActivities);
        }
      } catch (e) { console.warn('[MyBookings]', e); }
      setMyBookingsLoading(false);
    };

    // Expose load so the socket listener can trigger it
    loadBookingsRef.current = load;

    load();
    // Poll every 5s — cache is busted at the top of load() so this always hits the network.
    // Real-time updates arrive via useLiveJobs socket (booking:status), this is the fallback.
    const interval = setInterval(load, 5000);

    return () => clearInterval(interval);
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
        vehiclePlate: f.vehiclePlate || vehicles[0].plate || '',
        vehicleCategory: f.vehicleCategory || vehicles[0].type || '',
        vehicleTransmission: f.vehicleTransmission || vehicles[0].transmission || '',
        vehicleFuelType: f.vehicleFuelType || vehicles[0].fuelType || '',
      }));
    }
  }, [vehicles, bookingSelectedVehicleIdx, bookingOpen]);

  useEffect(() => {
    if (location.pathname === '/customer/book' && bookRouteModalOpenedRef.current && !bookingOpen) {
      navigate('/customer/dashboard', { replace: true });
    }
  }, [bookingOpen, location.pathname, navigate]);

  const nav = (section: DashboardSection) => {
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

  const openScanStudio = (vehicle?: any) => {
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
          className={`w-64 bg-white border-r border-slate-200 flex flex-col z-30 fixed inset-y-0 left-0 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full hidden md:flex'
            }`}
        >
          <div className="h-16 flex items-center px-6 border-b border-slate-100 shrink-0">
            <span className="font-semibold text-base tracking-tight text-slate-900">AutoSPF+</span>
          </div>

          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
            <button onClick={() => nav('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'dashboard' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <iconify-icon icon="solar:widget-linear" width="20"></iconify-icon>
              Dashboard
            </button>
            <button onClick={() => nav('scan')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'scan' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <iconify-icon icon="solar:scanner-linear" width="20"></iconify-icon>
              Scan Vehicle
              <span className="ml-auto text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">AI Lab</span>
            </button>
            <button onClick={() => nav('bookings')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'bookings' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <iconify-icon icon="solar:calendar-linear" width="20"></iconify-icon>
              My Bookings
              {myBookings.filter(b => ['pending_confirmation', 'pending', 'confirmed', 'approved'].includes(b.status)).length > 0 && (
                <span className="ml-auto text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                  {myBookings.filter(b => ['pending_confirmation', 'pending', 'confirmed', 'approved'].includes(b.status)).length}
                </span>
              )}
            </button>
            <button onClick={() => nav('tracker')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'tracker' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <iconify-icon icon="solar:routing-2-linear" width="20"></iconify-icon>
              Live Tracker
            </button>

            <button onClick={() => nav('documents')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'documents' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <iconify-icon icon="solar:document-text-linear" width="20"></iconify-icon>
              Documents
            </button>

            <button onClick={() => nav('payments')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'payments' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <iconify-icon icon="solar:card-2-linear" width="20"></iconify-icon>
              Payment History
            </button>

            <button onClick={() => nav('rewards')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'rewards' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <iconify-icon icon="solar:star-linear" width="20"></iconify-icon>
              Rewards
            </button>
          </nav>

        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">

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

              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="text-slate-400 hover:text-slate-600 relative p-1.5 rounded-full hover:bg-slate-50 transition-colors"
                >
                  <div className={`${notifications.filter(n => !n.isRead).length > 0 ? 'animate-[ring_2s_ease-in-out_infinite]' : ''}`}>
                    <iconify-icon icon="solar:bell-linear" width="22"></iconify-icon>
                  </div>
                  {notifications.filter(n => !n.isRead).length > 0 && (
                    <>
                      <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white z-10">
                        {notifications.filter(n => !n.isRead).length > 9 ? '9+' : notifications.filter(n => !n.isRead).length}
                      </span>
                      <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-400 rounded-full animate-ping opacity-75"></span>
                    </>
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
                      <div className="max-h-[400px] overflow-y-auto">
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
                          const plateLabel = booking.vehiclePlate || '';

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
                                  <button
                                    onClick={() => nav('tracker')}
                                    className="flex items-center gap-2 text-sm font-bold text-white px-5 py-2.5 rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
                                    style={{ background: `linear-gradient(135deg, ${cfg.strip}, ${cfg.strip}cc)`, boxShadow: `0 4px 16px ${cfg.strip}50` }}>
                                    <iconify-icon icon="solar:map-arrow-right-bold" width="15"></iconify-icon>
                                    Track Service
                                  </button>
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
                        <p className={`text-[10px] font-bold uppercase tracking-[0.24em] ${highendScanEnabled ? 'text-violet-300' : 'text-slate-400'}`}>{highendScanEnabled ? 'Private Image Transfer' : 'Scan Vehicle (upload)'}</p>
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
                    {myBookings.filter((b: any) => !['pending','cancelled','failed'].includes(b.status)).length} booking{myBookings.filter((b: any) => !['pending','cancelled','failed'].includes(b.status)).length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Bookings</p>
                    <p className="text-2xl font-bold text-slate-900">{myBookings.filter((b: any) => !['pending','cancelled','failed'].includes(b.status)).length}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Reservation Fees</p>
                    <p className="text-2xl font-bold text-indigo-600">
                      ₱{(myBookings.filter((b: any) => ['approved','confirmed','received','in_progress','completed','released','paid'].includes(b.status)).length * 500).toLocaleString()}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Full Payments</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      ₱{myBookings
                          .filter((b: any) => b.paymentStatus === 'paid' || ['completed','released'].includes(b.status))
                          .reduce((sum: number, b: any) => sum + Number(b.totalPrice || b.totalAmount || 0), 0)
                          .toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Payment List */}
                {myBookings.filter((b: any) => !['pending','cancelled','failed'].includes(b.status)).length === 0 ? (
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
                      .filter((b: any) => !['pending','cancelled','failed'].includes(b.status))
                      .sort((a: any, b: any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime())
                      .map((b: any) => {
                        const orderId = b.id || b._id;
                        const total = Number(b.totalPrice || b.totalAmount || 0);
                        const remaining = Math.max(total - 500, 0);
                        const vehicle = [b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(' ') || b.vehicleInfo || '—';
                        const dateStr = b.date || b.bookingDate || b.createdAt;
                        const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                        const proofUrl: string | null = (b as any).paymentProofUrl || (b as any).downpaymentProof || null;

                        const resvBadge = (() => {
                          if (['approved','confirmed','received','in_progress','completed','released','paid'].includes(b.status))
                            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">✓ Approved</span>;
                          if (b.status === 'rejected')
                            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">✕ Rejected</span>;
                          return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">⏳ Pending</span>;
                        })();

                        // Treat as paid if: paymentStatus is 'paid' OR order is completed/released
                        // (handles existing orders created before the paymentStatus=paid backend fix)
                        const isFullyPaid = b.paymentStatus === 'paid' || ['completed', 'released'].includes(b.status);
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
                                <div className="flex items-center gap-3 ml-auto">
                                  {fullBadge}
                                  <span className="text-sm font-bold text-slate-900 w-16 text-right">
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
                      {customerStats.loyaltyPoints.toLocaleString()} points
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
                const activeBooking = myBookings.find(b => ['confirmed', 'received', 'in_progress', 'in-progress', 'completed', 'paid'].includes(b.status));
                const TRACKER_STEPS = [
                  { id: 'confirmed', label: 'Appointment Confirmed', icon: 'solar:calendar-bold' },
                  { id: 'received', label: 'Vehicle Arrive', icon: 'solar:garage-bold' },
                  { id: 'in_progress', label: 'Service In Progress', icon: 'solar:wrench-bold' },
                  { id: 'completed', label: 'Quality Check', icon: 'solar:shield-check-bold' },
                  { id: 'paid', label: 'Ready for Pickup', icon: 'solar:car-bold' },
                ];
                const statusToStep: Record<string, number> = { confirmed: 0, received: 1, in_progress: 2, 'in-progress': 2, completed: 3, paid: 4 };
                const currentStep = activeBooking ? (statusToStep[activeBooking.status] ?? 0) : -1;

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
                                    <div className="pt-1 pb-4">
                                      <p className={`text-sm font-semibold ${isDone ? 'text-emerald-700' : isActive ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</p>
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
                    {(['current', 'newPass', 'confirm'] as const).map((key) => {
                      const labels = { current: 'Current Password', newPass: 'New Password', confirm: 'Confirm New Password' };
                      const hints = { current: '', newPass: 'Min 8 chars, 1 uppercase, 1 number', confirm: '' };
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
                      <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm">Update Password</button>
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
                <div className="bg-white border border-slate-200 rounded-lg flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 shadow-sm">
                  <div className="flex-1 p-5 flex flex-col justify-center">
                    <span className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Current Status</span>
                    {customerStats.currentStatus ? (
                      <div className="flex items-center gap-2 text-indigo-600">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span className="font-medium text-base">{customerStats.currentStatus}</span>
                      </div>
                    ) : (
                      <span className="font-medium text-base text-slate-400">No active service</span>
                    )}
                  </div>
                  <div className="flex-1 p-5 flex flex-col justify-center">
                    <span className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Next Appointment</span>
                    <span className="font-medium text-base text-slate-900">{customerStats.nextAppointment || <span className="text-slate-400">None scheduled</span>}</span>
                  </div>
                  <div className="flex-1 p-5 flex flex-col justify-center">
                    <span className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Last Service</span>
                    <span className="font-medium text-base text-slate-900">{customerStats.lastService || <span className="text-slate-400">No past services</span>}</span>
                  </div>
                  <div className="flex-1 p-5 flex flex-col justify-center">
                    <span className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Loyalty Points</span>
                    <div className="flex items-center gap-1.5">
                      <iconify-icon icon="solar:star-linear" className="text-amber-500" width="18"></iconify-icon>
                      <span className="font-medium text-base text-slate-900">{customerStats.loyaltyPoints.toLocaleString()} pts</span>
                    </div>
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
                          <button onClick={() => { setBookingOpen(true); setBookingStep(1); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.3)', borderRadius: 10, padding: '8px 16px', color: '#a5b4fc', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
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

                {/* ── Live Service Tracker — Ultra Premium ── */}
                {hasActiveBooking && (() => {
                  const activeBooking = myBookings.find((b: any) =>
                    ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'in-progress', 'completed'].includes(b.status)
                  );
                  const status = activeBooking ? activeBooking.status.toLowerCase() : '';
                  
                  // ── Read QC-controlled fine-grained stage (primary) ──────────
                  // When QC advances the tracker, serviceTrackingStage updates.
                  // Falls back to status-based mapping for legacy/pre-tracking orders.
                  const trackingStage = (activeBooking as any)?.serviceTrackingStage;
                  
                  const stageMap: Record<string, number> = {
                    'confirmed':     0,  // Step 1: Appointment Confirmed
                    'received':      1,  // Step 2: Vehicle Arrive
                    'in_progress':   2,  // Step 3: Service In Progress
                    'quality_check': 3,  // Step 4: Quality Check
                    'ready_pickup':  4,  // Step 5: Ready for Pickup
                    'completed':     4,
                  };
                  
                  // Legacy fallback: map old status to step index
                  const statusFallback: Record<string, number> = {
                    'approved': 0, 'confirmed': 0, 'assigned': 0,
                    'received': 1,
                    'in_progress': 2, 'in-progress': 2,
                    'completed': 4,
                    'paid': 4, 'released': 4, 'done': 4
                  };
                  
                  // Prefer QC-controlled stage, fall back to status
                  const currentStepIdx = trackingStage
                    ? (stageMap[trackingStage] ?? 0)
                    : (statusFallback[status] ?? 0);

                  const isFullyComplete = status === 'completed' || status === 'paid' || status === 'released' || trackingStage === 'ready_pickup' || trackingStage === 'completed';

                  const STEPS = [
                    { id: 1, label: 'Appointment Confirmed', sub: 'Waiting for your vehicle', icon: 'solar:calendar-bold', time: activeBooking?.bookingTime || '--', status: currentStepIdx > 0 ? 'done' : currentStepIdx === 0 ? 'active' : 'pending' },
                    { id: 2, label: 'Vehicle Arrive', sub: 'In shop', icon: 'solar:garage-bold', time: '--', status: currentStepIdx > 1 ? 'done' : currentStepIdx === 1 ? 'active' : 'pending' },
                    { id: 3, label: 'Service In Progress', sub: 'Working on vehicle', icon: 'solar:wrench-bold', time: '--', status: currentStepIdx > 2 ? 'done' : currentStepIdx === 2 ? 'active' : 'pending' },
                    { id: 4, label: 'Quality Check', sub: 'Final inspection', icon: 'solar:shield-check-bold', time: '--', status: currentStepIdx > 3 ? 'done' : currentStepIdx === 3 ? 'active' : 'pending' },
                    { id: 5, label: 'Ready for Pickup', sub: 'Service complete', icon: 'solar:car-bold', time: '--', status: isFullyComplete ? 'done' : currentStepIdx === 4 ? 'active' : 'pending' },
                  ];
                  const activeIdx = currentStepIdx;
                  const pct = activeIdx >= 0 ? Math.round((activeIdx / (STEPS.length - 1)) * 100) : 0;

                  return (
                    <section style={{ marginBottom: 32 }}>
                      <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes shimmerLine{0%{background-position:-200% 0}100%{background-position:200% 0}}
                        @keyframes orbPulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.7);opacity:0}}
                        @keyframes goldRing{0%{transform:scale(1);opacity:.8}100%{transform:scale(2.6);opacity:0}}
                        @keyframes breathe{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,.6)}50%{box-shadow:0 0 0 14px rgba(245,158,11,0)}}
                        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
                        @keyframes rotateConic{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
                        @keyframes auroraShift{0%,100%{opacity:.5;transform:translate(0,0) scale(1)}33%{opacity:.8;transform:translate(20px,-15px) scale(1.1)}66%{opacity:.4;transform:translate(-10px,20px) scale(.95)}}
                        @keyframes cardIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
                        @keyframes counterSpin{from{stroke-dashoffset:220}to{stroke-dashoffset:0}}
                        .tracker-step-card:hover{transform:translateX(4px) scale(1.01)!important;transition:all .25s ease!important}
                      `}} />

                      <div style={{ background: 'linear-gradient(145deg,#060c1a 0%,#0d1528 40%,#080e1c 100%)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 80px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.07)', animation: 'slideUp .5s ease-out', position: 'relative' }}>

                        {/* Aurora mesh background */}
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: -100, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,158,11,.09) 0%,transparent 65%)', animation: 'auroraShift 8s ease-in-out infinite' }} />
                          <div style={{ position: 'absolute', bottom: -120, left: -60, width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,.07) 0%,transparent 65%)', animation: 'auroraShift 10s ease-in-out infinite reverse' }} />
                          <div style={{ position: 'absolute', top: '40%', left: '35%', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,197,94,.05) 0%,transparent 65%)', animation: 'auroraShift 12s ease-in-out infinite 2s' }} />
                        </div>

                        {/* Top header bar */}
                        <div style={{ padding: '22px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <div style={{ position: 'relative', width: 8, height: 8 }}>
                                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e' }} />
                                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e', animation: 'orbPulse 2s ease-in-out infinite' }} />
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.14em' }}>Live Tracking</span>
                            </div>
                            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-.035em', lineHeight: 1.1 }}>Service<br /><span style={{ background: 'linear-gradient(90deg,#f59e0b,#fbbf24,#f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundSize: '200%', animation: 'shimmerLine 3s linear infinite' }}>In Progress</span></h2>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                            <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 999, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <iconify-icon icon="solar:clock-circle-bold" width="13" style={{ color: '#f59e0b' }}></iconify-icon>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Est. 2:30 PM</span>
                            </div>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontWeight: 500 }}>Step {activeIdx + 1} of {STEPS.length}</span>
                          </div>
                        </div>

                        {/* Main body — two columns */}
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 0, padding: '20px 28px 24px', position: 'relative', zIndex: 2 }}>

                          {/* LEFT — circular ring progress */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingRight: 24, borderRight: '1px solid rgba(255,255,255,.06)' }}>
                            {/* SVG Ring */}
                            <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 16 }}>
                              <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="8" />
                                <circle cx="60" cy="60" r="50" fill="none" stroke="url(#goldGrad)" strokeWidth="8"
                                  strokeLinecap="round"
                                  strokeDasharray={`${2 * Math.PI * 50}`}
                                  strokeDashoffset={`${2 * Math.PI * 50 * (1 - pct / 100)}`}
                                  style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)', filter: 'drop-shadow(0 0 8px rgba(245,158,11,.6))' }} />
                                <defs>
                                  <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#f59e0b" />
                                    <stop offset="100%" stopColor="#fbbf24" />
                                  </linearGradient>
                                </defs>
                              </svg>
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-.04em', lineHeight: 1 }}>{pct}%</span>
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 2 }}>Done</span>
                              </div>
                            </div>
                            {/* Vehicle info */}
                            <div style={{ textAlign: 'center' }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: '0 0 2px', letterSpacing: '-.02em' }}>
                                {activeBooking?.vehicleMake || activeBooking?.vehicleModel || '—'}
                              </p>
                              <p style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', margin: '0 0 10px', fontWeight: 500 }}>
                                {activeBooking?.vehiclePlate || '—'} · {activeBooking?.vehicleColor || '—'}
                              </p>
                              {/* Service team badges */}
                              {(() => {
                                const assignments: { slot: string; name: string; role: string }[] = activeBooking?.serviceStaffAssignments || [];
                                const assigned = assignments.filter(a => a.name?.trim());
                                if (assigned.length === 0) {
                                  const techName = activeBooking?.assignedDetailerName || activeBooking?.technicianName || activeBooking?.technician || 'QC Team';
                                  return (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 8, padding: '4px 12px' }}>
                                      <iconify-icon icon="solar:user-bold" width="11" style={{ color: '#22c55e' }}></iconify-icon>
                                      <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>{techName}</span>
                                    </div>
                                  );
                                }
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                                    <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 2px' }}>Service Team</p>
                                    {assigned.map((a, i) => (
                                      <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.25)', borderRadius: 8, padding: '3px 10px' }}>
                                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>
                                          {a.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2)}
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#a5b4fc' }}>{a.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* RIGHT — vertical step cards */}
                          <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {STEPS.map((step, i) => {
                              const isDone = step.status === 'done';
                              const isActive = step.status === 'active';
                              const isLast = i === STEPS.length - 1;
                              return (
                                <div key={step.id} className="tracker-step-card" style={{
                                  position: 'relative', display: 'flex', alignItems: 'center', gap: 14,
                                  padding: isActive ? '13px 16px' : '10px 14px',
                                  borderRadius: 14,
                                  background: isDone ? 'rgba(22,163,74,.06)' : isActive ? 'rgba(245,158,11,.07)' : 'rgba(255,255,255,.025)',
                                  border: isDone ? '1px solid rgba(22,163,74,.2)' : isActive ? '1px solid rgba(245,158,11,.3)' : '1px solid rgba(255,255,255,.05)',
                                  boxShadow: isActive ? '0 8px 32px rgba(245,158,11,.15), inset 0 1px 0 rgba(255,255,255,.06)' : isDone ? '0 2px 8px rgba(22,163,74,.1)' : 'none',
                                  transition: 'all .3s ease',
                                  animation: `cardIn .4s ease-out ${i * 0.07}s both`,
                                  overflow: 'hidden',
                                }}>
                                  {/* Active card shimmer overlay */}
                                  {isActive && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(245,158,11,.04),transparent)', backgroundSize: '200% 100%', animation: 'shimmerLine 2.5s linear infinite', borderRadius: 14, pointerEvents: 'none' }} />}

                                  {/* Icon badge */}
                                  <div style={{ position: 'relative', flexShrink: 0 }}>
                                    {/* Spinning conic border for active */}
                                    {isActive && (
                                      <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: 'conic-gradient(from 0deg,#f59e0b,#fbbf24,transparent,transparent,#f59e0b)', animation: 'rotateConic 2s linear infinite', zIndex: 0 }} />
                                    )}
                                    <div style={{
                                      width: isActive ? 40 : 34, height: isActive ? 40 : 34, borderRadius: '50%', position: 'relative', zIndex: 1,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      background: isDone ? 'linear-gradient(135deg,#16a34a,#15803d)' : isActive ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'rgba(255,255,255,.05)',
                                      boxShadow: isActive ? '0 0 20px rgba(245,158,11,.5)' : isDone ? '0 0 14px rgba(22,163,74,.4)' : 'none',
                                      animation: isActive ? 'breathe 2.5s ease-in-out infinite' : 'none',
                                    }}>
                                      <iconify-icon icon={step.icon} width={isActive ? "18" : "15"} style={{ color: isDone || isActive ? '#fff' : 'rgba(255,255,255,.2)' }}></iconify-icon>
                                    </div>
                                  </div>

                                  {/* Text */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: isActive ? 13 : 12, fontWeight: isActive ? 800 : isDone ? 600 : 500, color: isActive ? '#fbbf24' : isDone ? '#e5e7eb' : 'rgba(255,255,255,.25)', letterSpacing: '-.01em' }}>{step.label}</p>
                                    <p style={{ margin: '1px 0 0', fontSize: 10, color: isActive ? 'rgba(251,191,36,.6)' : isDone ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.12)', fontWeight: 500 }}>{step.sub}</p>
                                  </div>

                                  {/* Time badge */}
                                  <div style={{ flexShrink: 0, padding: '3px 10px', borderRadius: 999, background: isActive ? 'rgba(245,158,11,.15)' : isDone ? 'rgba(22,163,74,.1)' : 'rgba(255,255,255,.04)', border: isActive ? '1px solid rgba(245,158,11,.3)' : isDone ? '1px solid rgba(22,163,74,.2)' : '1px solid rgba(255,255,255,.06)' }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? '#fbbf24' : isDone ? '#4ade80' : 'rgba(255,255,255,.2)' }}>{step.time}</span>
                                  </div>

                                  {/* Done checkmark */}
                                  {isDone && <iconify-icon icon="solar:check-circle-bold" width="16" style={{ color: '#22c55e', flexShrink: 0 }}></iconify-icon>}
                                  {isActive && (
                                    <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
                                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#f59e0b' }} />
                                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#f59e0b', animation: 'orbPulse 1.5s ease-in-out infinite' }} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Bottom bar */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <iconify-icon icon="solar:shield-star-bold" width="13" style={{ color: 'rgba(255,255,255,.3)' }}></iconify-icon>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontWeight: 500 }}>AutoSPF+ Premium Service</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,.08)', borderRadius: 10, padding: '5px 14px', border: '1px solid rgba(245,158,11,.15)' }}>
                            <iconify-icon icon="solar:graph-up-bold" width="12" style={{ color: '#f59e0b' }}></iconify-icon>
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.08em' }}>{pct}% Complete</span>
                          </div>
                        </div>
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
                        {/* Icon */}
                        <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)' }}>
                          <iconify-icon icon="solar:car-bold" width="32" style={{ color: '#818cf8' }}></iconify-icon>
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
                            className="rounded-2xl overflow-hidden flex flex-col group"
                            style={{
                              background: '#fff',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
                              transition: 'box-shadow 0.3s ease, transform 0.3s ease',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 6px rgba(0,0,0,0.06), 0 16px 48px ${theme.glow}`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                          >
                            {/* ── Card Banner ── */}
                            <div
                              className="relative h-36 flex items-center justify-center overflow-hidden"
                              style={{ background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)` }}
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
                                style={{ background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.3)' }}
                                title="Edit vehicle"
                              >
                                <iconify-icon icon="solar:pen-bold" width="13" style={{ color: theme.text }}></iconify-icon>
                              </button>
                              {/* Delete button — top-right */}
                              <button
                                onClick={() => setDeleteConfirmIdx(i)}
                                className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                                style={{ background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.3)' }}
                                title="Delete vehicle"
                              >
                                <iconify-icon icon="solar:trash-bin-minimalistic-bold" width="13" style={{ color: theme.text }}></iconify-icon>
                              </button>
                              {/* Plate number bottom-left */}
                              <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-white/60 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-800 tracking-widest shadow-sm">
                                {v.plate}
                              </div>
                              {/* Type badge bottom-right */}
                              {v.type && (
                                <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
                                  style={{ background: 'rgba(255,255,255,0.25)', color: theme.text, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.3)' }}>
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
                            <div className="p-4 flex-1 flex flex-col bg-white">
                              <h3 className="font-bold text-[15px] text-slate-900 leading-tight">{v.name}</h3>
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="w-3 h-3 rounded-full border border-slate-200 shadow-sm" style={{ background: colorThemes[colorKey]?.from || '#e2e8f0' }}></div>
                                <p className="text-xs text-slate-400">{v.color || 'No color'}</p>
                              </div>

                              {/* Actions */}
                              <div className="mt-4 grid grid-cols-2 gap-1 border-t border-slate-100 pt-3">
                                <button
                                  onClick={() => openBookingModal(v)}
                                  className="flex flex-col items-center justify-center gap-1 py-1.5 rounded-lg transition-all font-medium"
                                  style={{ background: `linear-gradient(135deg, ${theme.from}22, ${theme.to}33)`, color: theme.to }}
                                >
                                  <iconify-icon icon="solar:calendar-add-linear" width="17"></iconify-icon>
                                  <span className="text-[11px] font-medium">Book</span>
                                </button>
                                <button
                                  onClick={() => openVehicleHistory(v)}
                                  className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-700 transition-colors py-1.5 rounded-lg hover:bg-slate-50"
                                >
                                  <iconify-icon icon="solar:history-linear" width="17"></iconify-icon>
                                  <span className="text-[11px] font-medium">History</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Bottom Grid: Documents & Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-8">

                  {/* AI & Documents */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-medium tracking-tight text-slate-900">AI &amp; Documents</h2>
                      <button onClick={() => nav('documents')} className="text-sm text-slate-500 hover:text-slate-900">View all</button>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                      {documents.length === 0 ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center">
                          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                            <iconify-icon icon="solar:folder-with-files-linear" width="24" className="text-slate-300"></iconify-icon>
                          </div>
                          <p className="text-[14px] font-medium text-slate-900">No documents yet</p>
                          <p className="text-[12px] text-slate-500 mt-1 max-w-[200px] mx-auto">Service reports, AI damage scans, and waivers will appear here.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {documents.map((doc, i) => (
                            <a key={i} href="#" className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors group">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${doc.type === 'report' ? 'bg-indigo-50 text-indigo-600' : doc.type === 'waiver' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                                <iconify-icon icon={doc.icon} width="20"></iconify-icon>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{doc.title}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{doc.desc}</p>
                              </div>
                              {doc.status === 'Signed' ? (
                                <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 shrink-0">Signed</span>
                              ) : (
                                <span className="text-xs text-slate-400 shrink-0">{doc.date}</span>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Recent Activity */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-medium tracking-tight text-slate-900">Recent Activity</h2>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm h-full">
                      {activities.length === 0 ? (
                        <div className="text-center flex flex-col items-center justify-center h-full min-h-[200px]">
                          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                            <iconify-icon icon="solar:history-linear" width="24" className="text-slate-300"></iconify-icon>
                          </div>
                          <p className="text-[14px] font-medium text-slate-900">No recent activity</p>
                          <p className="text-[12px] text-slate-500 mt-1 max-w-[200px] mx-auto">Your service timeline and updates will appear here.</p>
                        </div>
                      ) : (
                        <div className="relative border-l border-slate-200 ml-3 space-y-6">
                          {activities.map((activity, i) => (
                            <div key={i} className="relative pl-6">
                              <div className={`absolute -left-1.5 top-1.5 w-3 h-3 border-2 rounded-full ${i === 0 ? 'bg-white border-indigo-600' : 'bg-slate-200 border-white'}`}></div>
                              <p className="text-sm font-medium text-slate-900">{activity.title}</p>
                              <p className="text-xs text-slate-500 mt-1">{activity.desc}</p>
                              <p className="text-xs text-slate-400 mt-2">{activity.time}</p>
                            </div>
                          ))}
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
              {/* Welcome icon */}
              <div className="relative w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)' }}>
                <iconify-icon icon="solar:car-bold" width="32" style={{ color: '#818cf8' }}></iconify-icon>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }} onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', year: '', brand: '', model: '', color: '', type: '', transmission: '', fuelType: '' }); setNewVehicleShowColorInput(false); }}>
          <div className="bg-white rounded-xl w-full max-w-[420px] shadow-2xl" onClick={e => e.stopPropagation()} style={{ animation: 'modalIn .2s ease-out', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-[15px] font-semibold text-gray-900">Add Vehicle</h3>
              <button
                onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', year: '', brand: '', model: '', color: '', type: '', transmission: '', fuelType: '' }); setNewVehicleShowColorInput(false); }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddVehicleSubmit} className="px-5 py-4 space-y-3" noValidate>

              {/* API error banner */}
              {vehicleApiError && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                  <iconify-icon icon="solar:danger-triangle-bold" width="15" style={{ color: '#ef4444', marginTop: '1px', flexShrink: 0 }}></iconify-icon>
                  <p className="text-[12px] text-red-600 font-medium leading-snug">{vehicleApiError}</p>
                </div>
              )}

              {/* ── Live Vehicle Card Preview ── */}
              {(newVehicle.brand || newVehicle.model || newVehicle.plate) && (() => {
                const colorHex: Record<string, string> = {
                  White: '#e2e8f0', Black: '#1e293b', Silver: '#94a3b8', Gray: '#64748b',
                  Blue: '#3b82f6', Red: '#ef4444', Green: '#22c55e', Yellow: '#eab308',
                  Orange: '#f97316', Brown: '#92400e',
                };
                const bg = colorHex[newVehicle.color] || '#94a3b8';
                const isLight = ['White', 'Silver', 'Yellow', ''].includes(newVehicle.color);
                const txt = isLight ? '#1e293b' : '#f8fafc';
                const previewName = [newVehicle.year, newVehicle.brand, newVehicle.model].filter(Boolean).join(' ') || 'Your Vehicle';
                return (
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <div style={{ background: `linear-gradient(135deg, ${bg}, ${bg}dd)`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <iconify-icon icon="solar:car-bold" width="36" style={{ color: txt, opacity: 0.8, flexShrink: 0 }}></iconify-icon>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: txt, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewName}</p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                          {newVehicle.plate && <span style={{ fontSize: 10, fontWeight: 700, color: txt, opacity: 0.8, letterSpacing: '0.05em', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: 4 }}>{normalizePlateNumber(newVehicle.plate)}</span>}
                          {newVehicle.type && <span style={{ fontSize: 10, fontWeight: 600, color: txt, opacity: 0.7 }}>{newVehicle.type}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '6px 16px', fontSize: 10, color: '#94a3b8', fontWeight: 500, textAlign: 'center' }}>Live Preview — this is how your card will look</div>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                {/* Plate Number */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Plate Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ABC-1234"
                    value={newVehicle.plate}
                    onChange={(e) => { setNewVehicle({ ...newVehicle, plate: e.target.value }); setVehicleErrors(er => ({ ...er, plate: '' })); }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${vehicleErrors.plate ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'}`}
                  />
                  {vehicleErrors.plate ? (
                    <p className="mt-1 text-[11px] text-red-500">{vehicleErrors.plate}</p>
                  ) : newVehicle.plate.trim() ? (
                    (() => {
                      const pn = normalizePlateNumber(newVehicle.plate);
                      return pn.length >= 4 && pn.length <= 9 ? (
                      <p className="mt-1 text-[11px] text-emerald-500 flex items-center gap-1"><iconify-icon icon="solar:check-circle-bold" width="11"></iconify-icon> Valid plate format</p>
                    ) : (
                      <p className="mt-1 text-[11px] text-amber-500 flex items-center gap-1"><iconify-icon icon="solar:info-circle-bold" width="11"></iconify-icon> 4–9 letters/numbers (spaces ignored)</p>
                    );
                    })()
                  ) : null}
                </div>

                {/* Vehicle Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newVehicle.type}
                    onChange={(e) => { setNewVehicle({ ...newVehicle, type: e.target.value }); setVehicleErrors(er => ({ ...er, type: '' })); }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${vehicleErrors.type ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-400' : newVehicle.type ? 'border-gray-200 text-gray-900 focus:border-gray-400' : 'border-gray-200 text-gray-400 focus:border-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="" disabled>Select...</option>
                    <option value="Hatchback">Hatchback</option>
                    <option value="Sedan">Sedan</option>
                    <option value="Midsized">Midsized</option>
                    <option value="SUV">SUV</option>
                    <option value="Pick UP">Pick UP</option>
                    <option value="Large SUV / Van">Large SUV / Van</option>
                    <option value="Highend Sedan">Highend Sedan</option>
                  </select>
                  {vehicleErrors.type && (
                    <p className="mt-1 text-[11px] text-red-500">{vehicleErrors.type}</p>
                  )}
                </div>
              </div>

              {/* ── Live Price Preview Panel (shows when type is selected) ── */}
              {newVehicle.type && (() => {
                const priceKey = getVehiclePriceKey(newVehicle.type);
                return (
                  <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#f59e0b' }}></iconify-icon>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {newVehicle.type} Pricing — Locked to this vehicle
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {RAW_SPF_PACKAGES.map(pkg => (
                        <div key={pkg.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                          <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>
                            {pkg.name.split('—')[0].trim()}
                          </p>
                          <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em' }}>
                            ₱{(pkg.prices[priceKey as keyof typeof pkg.prices] || 0).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 10, color: '#475569', marginTop: 8, textAlign: 'center' }}>
                      These prices will apply when you book for this vehicle
                    </p>
                  </div>
                );
              })()}

              {/* Brand + Year */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Brand <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newVehicle.brand}
                    onChange={(e) => { setNewVehicle({ ...newVehicle, brand: e.target.value }); setVehicleErrors(er => ({ ...er, brand: '' })); }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${vehicleErrors.brand ? 'border-red-300 bg-red-50 text-red-700' : newVehicle.brand ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="">Select brand</option>
                    {CAR_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  {vehicleErrors.brand && <p className="mt-1 text-[11px] text-red-500">{vehicleErrors.brand}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Year <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={newVehicle.year}
                    onChange={(e) => setNewVehicle({ ...newVehicle, year: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${newVehicle.year ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="">Year</option>
                    {Array.from({ length: 36 }, (_, i) => String(2025 - i)).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Model <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vios, Civic, Ranger"
                  value={newVehicle.model}
                  onChange={(e) => { setNewVehicle({ ...newVehicle, model: e.target.value }); setVehicleErrors(er => ({ ...er, model: '' })); }}
                  className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${vehicleErrors.model ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'}`}
                />
                {vehicleErrors.model && <p className="mt-1 text-[11px] text-red-500">{vehicleErrors.model}</p>}
              </div>

              {/* Color Swatch Picker */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Color <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { name: 'White', hex: '#f1f5f9' }, { name: 'Black', hex: '#1e293b' },
                    { name: 'Silver', hex: '#94a3b8' }, { name: 'Gray', hex: '#64748b' },
                    { name: 'Blue', hex: '#3b82f6' }, { name: 'Red', hex: '#ef4444' },
                    { name: 'Green', hex: '#22c55e' }, { name: 'Yellow', hex: '#eab308' },
                    { name: 'Orange', hex: '#f97316' }, { name: 'Brown', hex: '#92400e' },
                  ].map(c => {
                    const sel = newVehicle.color === c.name && !newVehicleShowColorInput;
                    return (
                      <button key={c.name} type="button" title={c.name}
                        onClick={() => { setNewVehicle(nv => ({ ...nv, color: c.name })); setNewVehicleShowColorInput(false); }}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', border: sel ? '2.5px solid #0f172a' : '2px solid #e2e8f0',
                          background: c.hex, cursor: 'pointer', transition: 'all 0.15s',
                          boxShadow: sel ? '0 0 0 2px #fff, 0 0 0 4px #0f172a' : 'none',
                          outline: 'none', flexShrink: 0,
                        }}
                      />
                    );
                  })}
                  {/* Other button */}
                  <button type="button"
                    onClick={() => { setNewVehicleShowColorInput(true); setNewVehicle(nv => ({ ...nv, color: '' })); }}
                    style={{
                      height: 28, padding: '0 10px', borderRadius: 14, fontSize: 11, fontWeight: 600,
                      border: newVehicleShowColorInput ? '2px solid #0f172a' : '2px solid #e2e8f0',
                      background: newVehicleShowColorInput ? '#f8fafc' : '#fff', color: '#64748b',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >Other</button>
                </div>
                {newVehicleShowColorInput && (
                  <input
                    type="text" placeholder="e.g. Champagne Gold"
                    value={newVehicle.color}
                    onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors mt-2"
                    autoFocus
                  />
                )}
                {newVehicle.color && !newVehicleShowColorInput && (
                  <p className="mt-1.5 text-[11px] text-gray-400 pl-0.5">Selected: <span className="font-semibold text-gray-600">{newVehicle.color}</span></p>
                )}
              </div>

              {/* Transmission + Fuel Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Transmission <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={newVehicle.transmission}
                    onChange={(e) => setNewVehicle({ ...newVehicle, transmission: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${newVehicle.transmission ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="">Select...</option>
                    <option value="Automatic">Automatic</option>
                    <option value="Manual">Manual</option>
                    <option value="CVT">CVT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Fuel Type <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={newVehicle.fuelType}
                    onChange={(e) => setNewVehicle({ ...newVehicle, fuelType: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${newVehicle.fuelType ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="">Select...</option>
                    <option value="Gasoline">Gasoline</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Electric">Electric</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
              </div>

              {/* Hint */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #dcfce7' }}>
                <iconify-icon icon="solar:calendar-add-bold" width="14" style={{ color: '#16a34a', flexShrink: 0 }}></iconify-icon>
                <p style={{ fontSize: 11, color: '#15803d', fontWeight: 500, lineHeight: 1.4 }}>
                  After adding, tap <strong>📅 Book</strong> on your vehicle card to book instantly with all details pre-filled.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', year: '', brand: '', model: '', color: '', type: '', transmission: '', fuelType: '' }); setNewVehicleShowColorInput(false); }}
                  className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(5px)' }} onClick={() => { if (!bookingSubmitting) { setBookingOpen(false); } }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} style={{ animation: 'modalIn .2s ease-out', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px -12px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04)' }}>

            {/* Header — hidden when success screen is active (hero fills the top) */}
            {!bookingDone && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>Book a Service</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>
                    Step {bookingStep} of 6 &mdash; {
                      bookingStep === 1 ? 'Choose Service' :
                      bookingStep === 2 ? 'Your Details' :
                      bookingStep === 3 ? 'Pick Date & Time' :
                      bookingStep === 4 ? 'Review Booking' :
                      bookingStep === 5 ? 'Terms & Conditions' :
                      'GCash Downpayment'
                    }
                  </div>
                </div>
                {!bookingSubmitting && (
                  <button onClick={() => { setBookingOpen(false); setBookingAgreed(false); setBookingDownpaymentProof(null); }}
                    style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>
                    <iconify-icon icon="solar:close-circle-linear" width="16"></iconify-icon>
                  </button>
                )}
              </div>
            )}

            {/* Progress bar */}
            {!bookingDone && (
              <div style={{ width: '100%', height: 2, background: '#f1f5f9', flexShrink: 0 }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg,#f59e0b,#d97706)', borderRadius: 999, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)', width: bookingStep === 1 ? '17%' : bookingStep === 2 ? '33%' : bookingStep === 3 ? '50%' : bookingStep === 4 ? '67%' : bookingStep === 5 ? '83%' : '100%' }} />
              </div>
            )}

            {/* Body */}
            <div className="overflow-y-auto flex-1 booking-body" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                          { icon: 'solar:car-bold', label: 'Model', value: [bookingForm.vehicleMake, bookingForm.vehicleModel].filter(Boolean).join(' ') || '—' },
                          { icon: 'solar:palette-bold', label: 'Color', value: bookingForm.vehicleColor || '—' },
                          { icon: 'solar:tag-bold', label: 'Plate', value: bookingForm.vehiclePlate || '—' },
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
                      onClick={() => { setBookingOpen(false); setBookingAgreed(false); setBookingDownpaymentProof(null); }}
                      style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#1e293b,#0f172a)', color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '0.01em', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,23,42,0.2)', transition: 'all 0.2s' }}>
                      Done — Back to Dashboard
                    </button>
                  </div>
                </div>

              ) : bookingStep === 1 ? (
                /* ── Step 1: Service ── */
                <div className="p-5">
                  {/* ── Vehicle Chip / Auto-detected type ── */}
                  <div className="mb-4">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pricing For</p>
                    {vehicles.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                        <iconify-icon icon="solar:info-circle-bold" width="16" style={{ color: '#d97706' }}></iconify-icon>
                        <span className="text-xs text-amber-700 font-medium">No vehicles added yet. Showing Hatchback prices by default.</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
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
                                  vehiclePlate: v.plate || '',
                                  vehicleColor: v.color || '',
                                  vehicleCategory: v.type || '',
                                  vehicleTransmission: v.transmission || '',
                                  vehicleFuelType: v.fuelType || '',
                                }));
                              }}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all duration-200 ${isActive
                                ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                                }`}
                            >
                              <iconify-icon icon="solar:car-bold" width="14"></iconify-icon>
                              <span>{v.name}</span>
                              {v.type && (
                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{v.type}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── Active vehicle type indicator ── */}
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="h-px flex-1 bg-gray-100"></div>
                    <span className="text-[11px] font-semibold text-gray-400 px-2">
                      Prices for {VEHICLE_OPTIONS.find(o => o.type === bookingVehicleType)?.label || bookingVehicleType}
                    </span>
                    <div className="h-px flex-1 bg-gray-100"></div>
                  </div>

                  <div className="space-y-2.5">
                    {RAW_SPF_PACKAGES.map((svc: any) => {
                      const currentPrice = svc.prices[bookingVehicleType] || 0;
                      return (
                        <button key={svc.id} type="button"
                          onClick={() => setBookingForm(f => ({ ...f, service: svc.id, serviceName: svc.name, servicePrice: currentPrice }))}
                          className={`w-full flex flex-col px-4 py-3.5 rounded-xl border text-left transition-all duration-200 ${bookingForm.service === svc.id ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'}`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div>
                              <p className="text-[15px] font-bold text-gray-900">{svc.name}</p>
                              <p className="text-[13px] font-medium text-gray-500 mt-0.5">{svc.duration}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-black text-gray-900">₱{currentPrice.toLocaleString()}</span>
                              {bookingForm.service === svc.id && <iconify-icon icon="solar:check-circle-bold" width="20" style={{ color: '#111' }}></iconify-icon>}
                            </div>
                          </div>
                          {svc.features && (
                            <div className="mt-3.5 pt-3.5 border-t border-gray-200/60 space-y-2 w-full">
                              {svc.features.map((f: string, i: number) => (
                                <div key={i} className="flex items-start gap-2">
                                  <iconify-icon icon="solar:check-circle-bold" width="16" style={{ color: '#16a34a', marginTop: '2px', flexShrink: 0 }}></iconify-icon>
                                  <span className="text-[12px] font-medium text-gray-600 leading-snug">{f}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : bookingStep === 2 ? (
                /* ── Step 2: Vehicle Details ── */
                <div className="p-5 space-y-4">
                  {/* Locked Customer Name */}
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name</p>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
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
                      className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 ${step2Errors.contactNo ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
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
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                            <iconify-icon icon="solar:car-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleMake || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Model */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Model</p>
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                            <iconify-icon icon="solar:car-2-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleModel || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Color */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Color</p>
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                            <iconify-icon icon="solar:palette-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleColor || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Plate */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Plate No.</p>
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                            <iconify-icon icon="solar:tag-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 tracking-widest">{bookingForm.vehiclePlate ? normalizePlateNumber(bookingForm.vehiclePlate) : '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Year */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Year</p>
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                            <iconify-icon icon="solar:calendar-date-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleYear || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Type */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Type</p>
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
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
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                            <iconify-icon icon="solar:settings-bold" width="14" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{bookingForm.vehicleTransmission || '—'}</span>
                            <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#d1d5db' }}></iconify-icon>
                          </div>
                        </div>
                        {/* Fuel */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Fuel Type</p>
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
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
                            className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 outline-none focus:border-gray-400 appearance-none ${step2Errors.vehicleMake ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
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
                            className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 ${step2Errors.vehicleModel ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
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
                            className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 outline-none focus:border-gray-400 appearance-none ${step2Errors.vehicleColor ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
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
                            className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 ${step2Errors.vehiclePlate ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
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
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 appearance-none"
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
                            className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 outline-none focus:border-gray-400 appearance-none ${step2Errors.vehicleCategory ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
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
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 appearance-none"
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
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 appearance-none"
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
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                      <iconify-icon icon="solar:shield-check-bold" width="16" style={{ color: '#9ca3af', flexShrink: 0 }}></iconify-icon>
                      <span className="text-sm font-semibold text-gray-700 flex-1">{bookingForm.serviceName || '—'}</span>
                      <span className="text-xs font-bold text-gray-500">₱{bookingForm.servicePrice.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

              ) : bookingStep === 3 ? (
                /* ── Step 3 — Calendar (real-time availability) ── */
                <div style={{ padding: '20px 20px 16px' }}>

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
                      // Use API-driven status; fall back to closed for past/weekend while loading
                      const status: 'available' | 'full' | 'closed' = monthAvailability[iso] || 'closed';
                      const disabled = status === 'closed' || status === 'full';
                      const isSelected = bookingForm.date === iso;
                      const dotColor = status === 'full' ? '#ef4444' : status === 'closed' ? 'transparent' : '#22c55e';
                      cells.push(
                        <button key={iso} type="button" disabled={disabled}
                          title={status === 'full' ? 'Fully booked' : status === 'closed' ? 'Unavailable' : undefined}
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
                              : status === 'closed' ? '#d1d5db'
                                : status === 'full' ? '#fca5a5'
                                  : isToday ? '#0f172a'
                                    : '#374151',
                            lineHeight: 1,
                          }}>{day}</span>
                          {status !== 'closed' && (
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
                      { c: '#ef4444', l: 'Fully Booked' },
                      { c: '#d1d5db', l: 'Closed' },
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
                <div style={{ padding: '20px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#1e293b,#0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <iconify-icon icon="solar:clipboard-check-bold" width="18" style={{ color: '#fff' }}></iconify-icon>
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>Review Your Booking</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, marginTop: 2 }}>Please confirm all details before proceeding</p>
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
                        { icon: 'solar:car-bold', label: 'Brand & Model', value: [bookingForm.vehicleMake, bookingForm.vehicleModel].filter(Boolean).join(' ') || '—' },
                        { icon: 'solar:palette-bold', label: 'Color', value: bookingForm.vehicleColor || '—' },
                        { icon: 'solar:tag-bold', label: 'Plate', value: bookingForm.vehiclePlate || '—' },
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
                <div className="p-5">
                  {/* T&C with scroll-to-agree */}
                  <div className="mt-4">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Paint Protection Film General Terms and Conditions</p>
                    <div
                      id="tc-scroll-box"
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
                          const cb = document.getElementById('tc-checkbox') as HTMLInputElement | null;
                          if (cb) cb.disabled = false;
                        }
                      }}
                      style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 11, color: '#6b7280', lineHeight: 1.7, background: '#fafbfc' }}
                    >
                      <p style={{ marginBottom: 8, color: '#374151' }}>Paint protection film is a complicated installation procedure. This document serves to set expectations on your installation, and can serve as a reference point in the future.</p>

                      <p style={{ marginBottom: 4, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>About Paint Protection Film</p>
                      <p style={{ marginBottom: 10 }}>Paint protection film is a film designed to protect your vehicle{"'s"} paint from future paint chip, scratches and swirl mark. It is applied to the exterior of your vehicle paint. The customer understands that PPF is a sacrificial layer of your vehicle, not a completely invisible or matte layer.</p>

                      <p style={{ marginBottom: 4, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Drying Time</p>
                      <p style={{ marginBottom: 10 }}>Your new paint protection film will take 3-4 weeks to fully cure depending on weather conditions. Do not wash the vehicle for the first 7 days. You may notice some telltale signs of water under the film. If you see some water spots under the film, avoid touching them. They will evaporate. Any air left behind we can easily remove once the film is fully dried.</p>

                      <p style={{ marginBottom: 4, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Warranty</p>
                      <p style={{ marginBottom: 10 }}>PPF installed on your vehicle carries a 5-year warranty against yellowing, cracking, and fading. All PPF will turn yellow eventually. It{"'s"} the rate at which it turns to yellow is what the warranty covers. Warranty does <strong>NOT</strong> cover abuse (such as getting too close with a pressure washer, too much sun exposure, improper maintenance, negligence and cutting/lifting the film), accidents, or from debris. The film is designed to sacrifice itself to save your paint.</p>

                      <p style={{ marginBottom: 4, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Existing Rock Chips</p>
                      <p style={{ marginBottom: 10 }}>Please note that existing paint chips will appear as PPF imperfections if we install PPF over them. This is especially true on dark or black vehicles, as the {"\"dots\""} show as a light gray/white spec. We have installed PPF on 5-7-year-old vehicles without issue, and we have installed it on cars with less than 1000 kms that have had a ton of rock chip imperfections.</p>

                      <p style={{ marginBottom: 4, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Badge and Trim Removal</p>
                      <p style={{ marginBottom: 10 }}>On certain installations we may have to remove badging or other parts of the car to provide the best experience for you. All attempts will be made to retain all OEM badges and lettering unless the customer wishes otherwise. We make every attempt to NOT remove badging unless absolutely necessary or requested.</p>

                      <p style={{ marginBottom: 4, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Imperfections</p>
                      <p style={{ marginBottom: 10 }}>We strive for perfection in our installations, but due to the nature of covering an entire vehicle in an adhesive film, it is likely that you will see some degree of dust, contamination, or other debris under the film after installing. We attempt to take every precaution possible to make a near-perfect install, with the understanding that no installation will actually be perfect.</p>

                      <p style={{ marginBottom: 4, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Booking Policy</p>
                      <p>A non-refundable downpayment is required to secure your reservation slot. All bookings are subject to availability and approval by the sales team. Customers must arrive within 30 minutes of their scheduled time. By proceeding, you confirm that all information provided is accurate and complete.</p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 italic">↑ Scroll to the bottom to enable the checkbox</p>
                  </div>

                  <label className="flex items-start gap-2.5 mt-3 cursor-pointer select-none">
                    <input
                      id="tc-checkbox"
                      type="checkbox"
                      disabled
                      checked={bookingAgreed}
                      onChange={e => setBookingAgreed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-gray-900 cursor-pointer flex-shrink-0 disabled:opacity-40"
                    />
                    <span className="text-[12px] text-gray-500 leading-relaxed">
                      I have read and agree to the <span className="text-gray-900 font-semibold">terms and conditions</span>.
                    </span>
                  </label>
                </div>
              ) : (
                /* ── Step 6: GCash Downpayment ── */
                <div className="p-5">

                  {/* Amount Summary Card */}
                  {(() => {
                    const RESERVATION_FEE = 500;
                    const balance = bookingForm.servicePrice - RESERVATION_FEE;
                    return (
                      <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 16, border: '1px solid #fde68a' }}>
                        <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <iconify-icon icon="solar:smartphone-bold" width="18" style={{ color: '#fff' }}></iconify-icon>
                            <div>
                              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: 0, fontWeight: 500 }}>Send via GCash Now</p>
                              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: 0 }}>Fixed reservation fee to confirm your slot</p>
                            </div>
                          </div>
                          <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>₱500</span>
                        </div>
                        <div style={{ background: '#fffbeb', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <iconify-icon icon="solar:shop-bold" width="13" style={{ color: '#92400e' }}></iconify-icon>
                            <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>Remaining balance due onsite</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>₱{balance.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* QR Code */}
                  <div className="w-full flex flex-col items-center mb-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Scan to Pay via GCash</p>
                    <div className="p-2 bg-white rounded-2xl shadow-sm border border-gray-100" style={{ boxShadow: '0 4px 20px -5px rgba(0,0,0,0.08)' }}>
                      <img src="/gcash-qr.png" alt="GCash QR Code" className="w-44 h-44 object-contain rounded-xl" onError={(e) => { e.currentTarget.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=AutoSPFPayment'; }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">Screenshot the QR or scan directly from GCash app</p>
                  </div>

                  {/* Upload Proof */}
                  <div className="w-full">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Upload GCash Receipt</p>
                      {!bookingDownpaymentProof && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>Required</span>}
                      {bookingDownpaymentProof && <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}><iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon> Uploaded</span>}
                    </div>
                    <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl transition-colors cursor-pointer relative overflow-hidden group" style={{ borderColor: bookingDownpaymentProof ? '#86efac' : '#d1d5db', background: bookingDownpaymentProof ? '#f0fdf4' : '#f9fafb' }}>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setBookingDownpaymentProof(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} />
                      {bookingDownpaymentProof ? (
                        <>
                          <img src={bookingDownpaymentProof} alt="Proof" className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-30 transition-opacity" />
                          <div className="z-10 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm flex items-center gap-2">
                            <iconify-icon icon="solar:check-circle-bold" style={{ color: '#16a34a' }}></iconify-icon>
                            <span className="text-xs font-semibold text-gray-800">Tap to Change</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-400">
                            <iconify-icon icon="solar:upload-minimalistic-bold" width="18"></iconify-icon>
                          </div>
                          <p className="text-xs font-semibold text-gray-500">Tap to upload GCash receipt</p>
                          <p className="text-[10px] text-gray-400">JPG or PNG photo of your transaction</p>
                        </div>
                      )}
                    </label>
                  </div>

                  {/* Info note */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                    <iconify-icon icon="solar:info-circle-bold" width="14" style={{ color: '#0284c7', flexShrink: 0, marginTop: 1 }}></iconify-icon>
                    <p style={{ fontSize: 10.5, color: '#0369a1', lineHeight: 1.6, margin: 0 }}>
                      Your booking will be <strong>pending confirmation</strong> until our team verifies your payment. The remaining balance is collected <strong>on the day of your appointment</strong> at our shop.
                    </p>
                  </div>

                </div>
              )}
            </div>

            {/* Footer */}
            {!bookingDone && (() => {
              // ── Per-step validity — single source of truth ──────────────────
              const contactCompact = (bookingForm.contactNo || '').replace(/\s/g, '');
              const contactOk =
                !!contactCompact &&
                (isValidPhilippineBookingContact(bookingForm.contactNo || '') ||
                  /^\+[1-9]\d{7,14}$/.test(contactCompact));
              const plateNormStep = normalizePlateNumber(bookingForm.vehiclePlate || '');
              const plateOk = plateNormStep.length >= 4 && plateNormStep.length <= 9;
              const step1Valid = !!bookingForm.service;
              const vehicleFieldsValid = bookingFromVehicle
                ? true
                : !!bookingForm.vehicleMake &&
                  !!(bookingForm.vehicleModel || '').trim() &&
                  !!bookingForm.vehicleColor &&
                  !!(bookingForm.vehiclePlate || '').trim() &&
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
              const step5Valid = bookingAgreed;
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
                      bookingStep === 5 ? (!step5Valid ? 'Agree to the terms to continue' : '') : '';

              return (
                <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', flexShrink: 0, background: '#fff' }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: hintText ? 6 : 0 }}>
                    {bookingStep > 1 && (
                      <button type="button"
                        onClick={() => { setSlotError(''); setStep2Errors({}); setBookingStep(s => s - 1); }}
                        disabled={bookingSubmitting}
                        style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: bookingSubmitting ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'all 0.15s' }}>
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
                            // Only validate vehicle fields when not pre-filled from garage
                            if (!bookingFromVehicle) {
                              if (!bookingForm.vehicleMake) errs.vehicleMake = 'Select a brand.';
                              if (!(bookingForm.vehicleModel || '').trim()) errs.vehicleModel = 'Model is required.';
                              if (!bookingForm.vehicleColor) errs.vehicleColor = 'Select a color.';
                              if (!bookingForm.vehicleCategory) errs.vehicleCategory = 'Select vehicle type.';
                              if (!(bookingForm.vehiclePlate || '').trim()) errs.vehiclePlate = 'Plate number is required.';
                              else if (!plateOk) errs.vehiclePlate = 'Use 4–9 letters/numbers (spaces ignored).';
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
                          flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
                          fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', transition: 'all 0.2s',
                          cursor: isStepInvalid ? 'not-allowed' : 'pointer',
                          background: isStepInvalid ? '#e2e8f0' : 'linear-gradient(135deg,#1e293b,#0f172a)',
                          color: isStepInvalid ? '#94a3b8' : '#fff',
                          boxShadow: isStepInvalid ? 'none' : '0 4px 14px rgba(15,23,42,0.18)',
                          opacity: isStepInvalid ? 0.7 : 1,
                        }}>
                        Continue →
                      </button>
                    ) : (
                      <button type="button" onClick={submitBooking} disabled={!step6Valid}
                        style={{
                          flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
                          fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', transition: 'all 0.2s',
                          cursor: step6Valid ? 'pointer' : 'not-allowed',
                          background: step6Valid ? 'linear-gradient(135deg,#1e293b,#0f172a)' : '#e2e8f0',
                          color: step6Valid ? '#fff' : '#94a3b8',
                          boxShadow: step6Valid ? '0 4px 14px rgba(15,23,42,0.18)' : 'none',
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
              {editVehicleApiError && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                  <iconify-icon icon="solar:danger-triangle-bold" width="15" style={{ color: '#ef4444', marginTop: '1px', flexShrink: 0 }}></iconify-icon>
                  <p className="text-[12px] text-red-600 font-medium leading-snug">{editVehicleApiError}</p>
                </div>
              )}

              {(editVehicleForm.brand || editVehicleForm.model || editVehicleForm.plate) && (() => {
                const colorHex: Record<string, string> = {
                  White: '#e2e8f0', Black: '#1e293b', Silver: '#94a3b8', Gray: '#64748b',
                  Blue: '#3b82f6', Red: '#ef4444', Green: '#22c55e', Yellow: '#eab308',
                  Orange: '#f97316', Brown: '#92400e',
                };
                const bg = colorHex[editVehicleForm.color] || '#94a3b8';
                const isLight = ['White', 'Silver', 'Yellow', ''].includes(editVehicleForm.color);
                const txt = isLight ? '#1e293b' : '#f8fafc';
                const previewName = [editVehicleForm.year, editVehicleForm.brand, editVehicleForm.model].filter(Boolean).join(' ') || 'Your Vehicle';
                return (
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <div style={{ background: `linear-gradient(135deg, ${bg}, ${bg}dd)`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <iconify-icon icon="solar:car-bold" width="36" style={{ color: txt, opacity: 0.8, flexShrink: 0 }}></iconify-icon>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: txt, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewName}</p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                          {editVehicleForm.plate && <span style={{ fontSize: 10, fontWeight: 700, color: txt, opacity: 0.8, letterSpacing: '0.05em', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: 4 }}>{normalizePlateNumber(editVehicleForm.plate)}</span>}
                          {editVehicleForm.type && <span style={{ fontSize: 10, fontWeight: 600, color: txt, opacity: 0.7 }}>{editVehicleForm.type}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '6px 16px', fontSize: 10, color: '#94a3b8', fontWeight: 500, textAlign: 'center' }}>Live Preview</div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Plate Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ABC-1234"
                    value={editVehicleForm.plate}
                    onChange={(e) => { setEditVehicleForm(f => ({ ...f, plate: e.target.value })); setEditVehicleErrors(er => ({ ...er, plate: '' })); }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${editVehicleErrors.plate ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'}`}
                  />
                  {editVehicleErrors.plate ? (
                    <p className="mt-1 text-[11px] text-red-500">{editVehicleErrors.plate}</p>
                  ) : editVehicleForm.plate.trim() ? (
                    (() => {
                      const pn = normalizePlateNumber(editVehicleForm.plate);
                      return pn.length >= 4 && pn.length <= 9 ? (
                        <p className="mt-1 text-[11px] text-emerald-500 flex items-center gap-1"><iconify-icon icon="solar:check-circle-bold" width="11"></iconify-icon> Valid plate format</p>
                      ) : (
                        <p className="mt-1 text-[11px] text-amber-500 flex items-center gap-1"><iconify-icon icon="solar:info-circle-bold" width="11"></iconify-icon> 4–9 letters/numbers (spaces ignored)</p>
                      );
                    })()
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editVehicleForm.type}
                    onChange={(e) => { setEditVehicleForm(f => ({ ...f, type: e.target.value })); setEditVehicleErrors(er => ({ ...er, type: '' })); }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${editVehicleErrors.type ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-400' : editVehicleForm.type ? 'border-gray-200 text-gray-900 focus:border-gray-400' : 'border-gray-200 text-gray-400 focus:border-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="" disabled>Select...</option>
                    {ADD_VEHICLE_TYPE_LABELS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {editVehicleErrors.type && <p className="mt-1 text-[11px] text-red-500">{editVehicleErrors.type}</p>}
                </div>
              </div>

              {editVehicleForm.type && (() => {
                const priceKey = getVehiclePriceKey(editVehicleForm.type);
                return (
                  <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <iconify-icon icon="solar:lock-keyhole-bold" width="12" style={{ color: '#f59e0b' }}></iconify-icon>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {editVehicleForm.type} Pricing — Locked to this vehicle
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {RAW_SPF_PACKAGES.map(pkg => (
                        <div key={pkg.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                          <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2, lineHeight: 1.3 }}>
                            {pkg.name.split('—')[0].trim()}
                          </p>
                          <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em' }}>
                            ₱{(pkg.prices[priceKey as keyof typeof pkg.prices] || 0).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Brand <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editVehicleForm.brand}
                    onChange={(e) => { setEditVehicleForm(f => ({ ...f, brand: e.target.value })); setEditVehicleErrors(er => ({ ...er, brand: '' })); }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${editVehicleErrors.brand ? 'border-red-300 bg-red-50 text-red-700' : editVehicleForm.brand ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="">Select brand</option>
                    {editVehicleForm.brand && !CAR_BRANDS.includes(editVehicleForm.brand) && (
                      <option value={editVehicleForm.brand}>{editVehicleForm.brand}</option>
                    )}
                    {CAR_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  {editVehicleErrors.brand && <p className="mt-1 text-[11px] text-red-500">{editVehicleErrors.brand}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Year <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={editVehicleForm.year}
                    onChange={(e) => setEditVehicleForm(f => ({ ...f, year: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${editVehicleForm.year ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="">Year</option>
                    {BOOKING_YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Model <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vios, Civic, Ranger"
                  value={editVehicleForm.model}
                  onChange={(e) => { setEditVehicleForm(f => ({ ...f, model: e.target.value })); setEditVehicleErrors(er => ({ ...er, model: '' })); }}
                  className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${editVehicleErrors.model ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'}`}
                />
                {editVehicleErrors.model && <p className="mt-1 text-[11px] text-red-500">{editVehicleErrors.model}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Color <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { name: 'White', hex: '#f1f5f9' }, { name: 'Black', hex: '#1e293b' },
                    { name: 'Silver', hex: '#94a3b8' }, { name: 'Gray', hex: '#64748b' },
                    { name: 'Blue', hex: '#3b82f6' }, { name: 'Red', hex: '#ef4444' },
                    { name: 'Green', hex: '#22c55e' }, { name: 'Yellow', hex: '#eab308' },
                    { name: 'Orange', hex: '#f97316' }, { name: 'Brown', hex: '#92400e' },
                  ].map(c => {
                    const sel = editVehicleForm.color === c.name && !editVehicleShowColorInput;
                    return (
                      <button key={c.name} type="button" title={c.name}
                        onClick={() => { setEditVehicleForm(f => ({ ...f, color: c.name })); setEditVehicleShowColorInput(false); }}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', border: sel ? '2.5px solid #0f172a' : '2px solid #e2e8f0',
                          background: c.hex, cursor: 'pointer', transition: 'all 0.15s',
                          boxShadow: sel ? '0 0 0 2px #fff, 0 0 0 4px #0f172a' : 'none',
                          outline: 'none', flexShrink: 0,
                        }}
                      />
                    );
                  })}
                  <button type="button"
                    onClick={() => { setEditVehicleShowColorInput(true); setEditVehicleForm(f => ({ ...f, color: '' })); }}
                    style={{
                      height: 28, padding: '0 10px', borderRadius: 14, fontSize: 11, fontWeight: 600,
                      border: editVehicleShowColorInput ? '2px solid #0f172a' : '2px solid #e2e8f0',
                      background: editVehicleShowColorInput ? '#f8fafc' : '#fff', color: '#64748b',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >Other</button>
                </div>
                {editVehicleShowColorInput && (
                  <input
                    type="text"
                    placeholder="e.g. Champagne Gold"
                    value={editVehicleForm.color}
                    onChange={(e) => setEditVehicleForm(f => ({ ...f, color: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors mt-2"
                    autoFocus
                  />
                )}
                {editVehicleForm.color && !editVehicleShowColorInput && (
                  <p className="mt-1.5 text-[11px] text-gray-400 pl-0.5">Selected: <span className="font-semibold text-gray-600">{editVehicleForm.color}</span></p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Transmission <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={editVehicleForm.transmission}
                    onChange={(e) => setEditVehicleForm(f => ({ ...f, transmission: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${editVehicleForm.transmission ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="">Select...</option>
                    <option value="Automatic">Automatic</option>
                    <option value="Manual">Manual</option>
                    <option value="CVT">CVT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Fuel Type <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={editVehicleForm.fuelType}
                    onChange={(e) => setEditVehicleForm(f => ({ ...f, fuelType: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors appearance-none ${editVehicleForm.fuelType ? 'border-gray-200 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M8.12 9.29L12 13.17l3.88-3.88a.996.996 0 1 1 1.41 1.41l-4.59 4.59a.996.996 0 0 1-1.41 0L6.7 10.7a.996.996 0 0 1 0-1.41c.39-.38 1.03-.39 1.42 0z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat', paddingRight: '28px' }}
                  >
                    <option value="">Select...</option>
                    <option value="Gasoline">Gasoline</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Electric">Electric</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
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
            className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'modalIn .2s ease-out', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
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
            <div className="overflow-y-auto flex-1 booking-body" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                      <div key={i} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
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
              <div className="px-5 py-4 border-t border-gray-100 shrink-0">
                <button
                  onClick={() => { setVehicleHistoryOpen(false); openBookingModal(vehicleHistoryVehicle); }}
                  className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
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
