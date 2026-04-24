import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { NotificationService, SystemNotification } from '../lib/notification-service';

type DashboardSection = 'dashboard' | 'scan' | 'settings' | 'bookings' | 'documents' | 'rewards';

type ScanUpload = {
  id: string;
  name: string;
  size: number;
  preview: string;
};

// ---- STATIC DATA FOR BOOKING ----
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
            : s === 'rewards'
              ? 'rewards'
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
  const [documents, setDocuments] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
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

  // Fetch vehicles from DB on mount
  useEffect(() => {
    if (!user) return;
    const loadVehicles = async () => {
      try {
        const { VehicleService } = await import('../lib/vehicle-service');
        const res = await VehicleService.getVehicles();
        if (res.success && Array.isArray(res.data)) {
          // Map backend fields (make/model/year/plateNumber) → frontend shape (name/plate/type)
          setVehicles(res.data.map((v: any) => ({
            _id: v._id || v.id,
            id: v._id || v.id,
            plate: v.plateNumber || v.plate || '',
            year: v.year || '',
            make: v.make || '',
            model: v.model || '',
            name: [v.year, v.make, v.model].filter(Boolean).join(' ') || v.name || '',
            color: v.color || '',
            type: v.vehicleType || v.type || '',
          })));
        }
      } catch (err) {
        console.warn('[Garage] Failed to fetch vehicles:', err);
      }
    };
    loadVehicles();
  }, [user]);

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

        // Filter orders belonging to the current customer
        const myOrders = res.data.filter((o: any) => {
          const custId = o.customerId || o.customer?._id || o.customer;
          return custId === user.id || custId === user._id || o.customerName === user.name;
        });

        // Current status: find active booking (in-progress, assigned, checked-in, etc.)
        const activeStatuses = ['in-progress', 'assigned', 'checked-in', 'processing', 'confirmed'];
        const activeOrder = myOrders.find((o: any) => activeStatuses.includes(o.status));
        let currentStatus = '';
        if (activeOrder) {
          const statusMap: Record<string, string> = {
            'in-progress': 'In Shop — In Progress',
            'assigned': 'Assigned — Waiting',
            'checked-in': 'Checked In',
            'processing': 'Processing',
            'confirmed': 'Confirmed — Scheduled',
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

        // Update active booking flag for Live Tracker
        setHasActiveBooking(!!activeOrder);

        setCustomerStats({ currentStatus, nextAppointment, lastService, loyaltyPoints });
      } catch (err) {
        console.warn('[CustomerDashboard] Failed to fetch stats:', err);
      }
    };
    fetchCustomerStats();
  }, [user]);

  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ plate: '', name: '', color: '', type: '' });
  const [vehicleErrors, setVehicleErrors] = useState<Record<string, string>>({});
  const [vehicleApiError, setVehicleApiError] = useState('');
  // Booking Modal
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);
  const [bookingVehicleType, setBookingVehicleType] = useState<string>('hatchback');
  const [bookingSelectedVehicleIdx, setBookingSelectedVehicleIdx] = useState<number>(-1);

  // Vehicle History Modal
  const [vehicleHistoryOpen, setVehicleHistoryOpen] = useState(false);
  const [vehicleHistoryVehicle, setVehicleHistoryVehicle] = useState<any>(null);
  const [vehicleHistoryOrders, setVehicleHistoryOrders] = useState<any[]>([]);
  const [vehicleHistoryLoading, setVehicleHistoryLoading] = useState(false);
  // Edit Vehicle Modal
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);
  const [editVehicleIndex, setEditVehicleIndex] = useState<number>(-1);
  const [editVehicleForm, setEditVehicleForm] = useState({ plate: '', name: '', color: '', type: '' });
  const [editVehicleErrors, setEditVehicleErrors] = useState<Record<string, string>>({});
  const [editVehicleApiError, setEditVehicleApiError] = useState('');
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number>(-1);

  const openEditVehicle = (v: any, idx: number) => {
    setEditVehicleIndex(idx);
    setEditVehicleForm({ plate: v.plate || '', name: v.name || '', color: v.color || '', type: v.type || '' });
    setEditVehicleErrors({});
    setEditVehicleOpen(true);
  };
  const saveEditVehicle = async () => {
    const errors: Record<string, string> = {};
    const plate = editVehicleForm.plate.trim().toUpperCase();
    const name = editVehicleForm.name.trim();
    const type = editVehicleForm.type;
    // Plate: required, 3-12 alphanumeric/space/hyphen
    if (!plate) errors.plate = 'Plate number is required.';
    else if (!/^[A-Za-z0-9][A-Za-z0-9 \-]{2,11}$/.test(plate)) errors.plate = 'Enter a valid plate (e.g. ABC 1234).';
    // Make & Model: must be at least 2 words, letters/numbers/spaces only, min 5 chars total
    if (!name) errors.name = 'Make & Model is required.';
    else if (name.length < 5) errors.name = 'Too short — enter full make and model (e.g. Toyota Camry).';
    else if (!/^[A-Za-z0-9][A-Za-z0-9 \-]{3,}$/.test(name)) errors.name = 'Only letters, numbers, spaces and hyphens allowed.';
    else if (name.split(/\s+/).length < 2) errors.name = 'Enter both make and model (e.g. Toyota Camry).';
    // Type: required
    if (!type) errors.type = 'Please select a vehicle type.';
    if (Object.keys(errors).length > 0) { setEditVehicleErrors(errors); return; }
    const targetVehicle = vehicles[editVehicleIndex];
    const vehicleId = targetVehicle?._id || targetVehicle?.id;
    setEditVehicleApiError('');
    try {
      const { VehicleService } = await import('../lib/vehicle-service');
      const parts = name.trim().split(/\s+/);
      const make = parts.length >= 2 ? parts.slice(0, -1).join(' ') : name;
      const model = parts.length >= 2 ? parts[parts.length - 1] : name;
      const res = await VehicleService.updateVehicle(vehicleId, {
        plateNumber: plate,
        year: '',
        make,
        model,
        color: editVehicleForm.color.trim(),
        vehicleType: type,
      });
      if (!res.success) {
        setEditVehicleApiError(res.message || 'Failed to update vehicle.');
        return;
      }
    } catch (err: any) {
      setEditVehicleApiError(err?.response?.data?.message || 'Failed to update. Please check your details.');
      return;
    }
    const updated = vehicles.map((v, i) => i === editVehicleIndex ? { ...v, plate, name, color: editVehicleForm.color.trim(), type } : v);
    setVehicles(updated);
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
    setVehicles(prev => prev.filter((_, i) => i !== idx));
    setDeleteConfirmIdx(-1);
  };
  const [bookingForm, setBookingForm] = useState({
    service: '', serviceName: '', servicePrice: 0,
    vehicleMake: '', vehicleModel: '', vehicleYear: '', vehicleColor: '', vehiclePlate: '',
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
  const BOOKING_DATES = (() => {
    const dates: Date[] = []; const d = new Date(); d.setDate(d.getDate() + 1);
    while (dates.length < 14) { if (d.getDay() !== 0) dates.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return dates;
  })();

  const openBookingModal = async (preSelectedVehicle?: any) => {
    setBookingOpen(true); setBookingStep(1); setBookingDone(false);
    const targetVehicle = preSelectedVehicle || vehicles[0];
    const detectedKey = targetVehicle ? getVehiclePriceKey(targetVehicle.type) : 'hatchback';
    setBookingVehicleType(detectedKey);
    // Use ID-based lookup — reference equality (indexOf) can fail if array was recreated
    const targetId = targetVehicle?._id || targetVehicle?.id;
    const targetIdx = targetId
      ? vehicles.findIndex(v => (v._id || v.id) === targetId)
      : targetVehicle ? 0 : -1;
    setBookingSelectedVehicleIdx(targetIdx);
    setBookingForm({
      service: '', serviceName: '', servicePrice: 0,
      vehicleMake: '',
      vehicleModel: targetVehicle ? targetVehicle.name : '',
      vehicleYear: '',
      vehicleColor: targetVehicle ? (targetVehicle.color || '') : '',
      vehiclePlate: targetVehicle ? targetVehicle.plate : '',
      date: '', time: '', notes: '',
    });
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
          const matchesPlate = v.plate && (o.vehiclePlate || '').toUpperCase() === v.plate.toUpperCase();
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
    try {
      const { OrderService } = await import('../lib/order-service');
      const payload = {
        customer: user.id, customerName: user.name || '', customerPhone: '',
        vehicleYear: bookingForm.vehicleYear, vehicleMake: bookingForm.vehicleMake,
        vehicleModel: bookingForm.vehicleModel, vehicleColor: bookingForm.vehicleColor,
        vehiclePlate: bookingForm.vehiclePlate, serviceType: bookingForm.serviceName,
        price: bookingForm.servicePrice, bookingDate: bookingForm.date,
        bookingTime: bookingForm.time, notes: bookingForm.notes,
        items: JSON.stringify([{ product: bookingForm.service, quantity: 1, price: bookingForm.servicePrice }])
      };
      const res = await OrderService.createOrder(payload);
      if (res?.success) { setBookingDone(true); setHasActiveBooking(true); }
    } catch (e) { console.error(e); } finally { setBookingSubmitting(false); }
  };

  const handleAddVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    const plate = newVehicle.plate.trim();
    const name = newVehicle.name.trim();
    const type = newVehicle.type.trim();

    // Plate: required, 3-12 alphanumeric/space/hyphen
    if (!plate) {
      errors.plate = 'Plate number is required.';
    } else if (!/^[A-Za-z0-9][A-Za-z0-9 \-]{2,11}$/.test(plate)) {
      errors.plate = 'Enter a valid plate (e.g. ABC 1234).';
    }
    // Make & Model: at least 2 words, min 5 chars, letters/numbers/spaces/hyphens
    if (!name) {
      errors.name = 'Make & Model is required.';
    } else if (name.length < 5) {
      errors.name = 'Too short — enter full make and model (e.g. Toyota Camry).';
    } else if (!/^[A-Za-z0-9][A-Za-z0-9 \-]{3,}$/.test(name)) {
      errors.name = 'Only letters, numbers, spaces and hyphens allowed.';
    } else if (name.split(/\s+/).length < 2) {
      errors.name = 'Enter both make and model (e.g. Toyota Camry).';
    }
    // Type: required
    if (!type) {
      errors.type = 'Please select a vehicle type.';
    }

    if (Object.keys(errors).length > 0) {
      setVehicleErrors(errors);
      return;
    }

    // Save to DB
    setVehicleApiError('');
    try {
      const { VehicleService } = await import('../lib/vehicle-service');
      // Parse: treat entire name as "make", last word as model if multi-word
      const parts = name.trim().split(/\s+/);
      const make = parts.length >= 2 ? parts.slice(0, -1).join(' ') : name;
      const model = parts.length >= 2 ? parts[parts.length - 1] : name;
      const year = '';
      const res = await VehicleService.addVehicle({
        plateNumber: plate.toUpperCase(),
        year,
        make,
        model,
        color: newVehicle.color.trim() || 'Unknown',
        vehicleType: type,
      });
      if (res.success && res.data) {
        const v = res.data;
        setVehicles(prev => [...prev, {
          _id: v._id || v.id,
          id: v._id || v.id,
          plate: v.plateNumber || plate.toUpperCase(),
          name,
          color: newVehicle.color.trim(),
          type,
        }]);
      } else {
        setVehicleApiError(res.message || 'Failed to add vehicle. Please try again.');
        return;
      }
    } catch (err: any) {
      setVehicleApiError(err?.response?.data?.message || 'Failed to add vehicle. Please check your details.');
      return;
    }
    setAddVehicleOpen(false);
    setNewVehicle({ plate: '', name: '', color: '', type: '' });
    setVehicleErrors({});
    setVehicleApiError('');
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
  const [profile, setProfile] = useState({ fullName: user?.name || '', email: user?.email || '', phone: '+63 912 345 6789' });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile(p => ({ ...p, fullName: user.name || '', email: user.email || '' }));
    }
  }, [user]);

  // Settings — Password
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [showPass, setShowPass] = useState({ current: false, newPass: false, confirm: false });

  // Settings — Notifications
  const [notifs, setNotifs] = useState({ bookingUpdates: true, serviceStatus: true, promotions: false, reminders: true });

  function validateProfile() {
    const errs: Record<string, string> = {};
    if (!profile.fullName.trim() || profile.fullName.trim().length < 2) errs.fullName = 'Full name must be at least 2 characters.';
    if (!profile.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) errs.email = 'Enter a valid email address.';
    if (!profile.phone.trim() || !/^[+\d\s\-()]{7,20}$/.test(profile.phone)) errs.phone = 'Enter a valid phone number.';
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
        email: profile.email
      });

      if (result.success) {
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 3000);
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
              : s === 'rewards'
                ? 'rewards'
                : 'dashboard'
    );
  }, [location.search]);

  // Fetch My Bookings whenever section opens
  useEffect(() => {
    if (!['dashboard', 'bookings', 'documents', 'rewards'].includes(activeSection) || !user) return;
    const load = async () => {
      setMyBookingsLoading(true);
      try {
        const { OrderService } = await import('../lib/order-service');
        const res = await OrderService.getAllOrders({ suppressErrorToast: true });
        if (res.success && Array.isArray(res.data)) {
          const mine = res.data
            .filter((o: any) => {
              const cid = o.customerId || o.customer?._id || o.customer;
              return cid === user.id || cid === user._id || o.customerName === user.name;
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
    load();
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
        vehicleModel: f.vehicleModel || vehicles[0].name || '',
        vehicleColor: f.vehicleColor || vehicles[0].color || '',
        vehiclePlate: f.vehiclePlate || vehicles[0].plate || '',
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
      rewards: '/customer/dashboard?section=rewards',
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
              {myBookings.filter(b => ['pending','confirmed'].includes(b.status)).length > 0 && (
                <span className="ml-auto text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                  {myBookings.filter(b => ['pending','confirmed'].includes(b.status)).length}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/customer/live-tracker')} className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors outline-none">
              <iconify-icon icon="solar:routing-2-linear" width="20"></iconify-icon>
              Live Tracker
            </button>

            <button onClick={() => nav('documents')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium outline-none transition-colors ${activeSection === 'documents' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <iconify-icon icon="solar:document-text-linear" width="20"></iconify-icon>
              Documents
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
              <button
                onClick={() => nav('scan')}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium transition-colors shadow-sm"
              >
                <iconify-icon icon="solar:scanner-linear" width="18"></iconify-icon>
                Scan Vehicle
              </button>

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
                            <button onClick={() => { setProfileMenuOpen(false); setProfileSubMenu(null); nav('settings'); }} className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md hover:bg-slate-50 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><iconify-icon icon="solar:settings-linear" width="18" style={{ color: '#475569' }}></iconify-icon></div>
                              <span className="flex-1 text-left text-[13px] font-medium text-slate-800">Settings & privacy</span>
                              <iconify-icon icon="solar:alt-arrow-right-linear" width="16" style={{ color: '#94a3b8' }}></iconify-icon>
                            </button>
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
                const upcomingStatuses = ['pending','confirmed','assigned'];
                const activeStatuses = ['in-progress','processing','checked-in'];
                const doneStatuses = ['completed','released','done','delivered'];
                const cancelledStatuses = ['cancelled','rejected'];
                const filteredBookings = bookingsFilter === 'all' ? myBookings
                  : bookingsFilter === 'upcoming' ? myBookings.filter(b => upcomingStatuses.includes(b.status))
                  : bookingsFilter === 'active'   ? myBookings.filter(b => activeStatuses.includes(b.status))
                  : bookingsFilter === 'completed'? myBookings.filter(b => doneStatuses.includes(b.status))
                  : myBookings.filter(b => cancelledStatuses.includes(b.status));

                const statusCfg: Record<string, { label: string; color: string; bg: string; strip: string; dot?: boolean }> = {
                  pending:      { label: 'Pending',     color: '#92400e', bg: '#fffbeb', strip: '#f59e0b' },
                  confirmed:    { label: 'Confirmed',   color: '#3730a3', bg: '#eef2ff', strip: '#6366f1' },
                  assigned:     { label: 'Assigned',    color: '#3730a3', bg: '#eef2ff', strip: '#6366f1' },
                  'in-progress':{ label: 'In Progress', color: '#1d4ed8', bg: '#eff6ff', strip: '#3b82f6', dot: true },
                  processing:   { label: 'Processing',  color: '#1d4ed8', bg: '#eff6ff', strip: '#3b82f6', dot: true },
                  'checked-in': { label: 'Checked In',  color: '#0369a1', bg: '#f0f9ff', strip: '#0ea5e9' },
                  completed:    { label: 'Completed',   color: '#065f46', bg: '#f0fdf4', strip: '#10b981' },
                  released:     { label: 'Released',    color: '#065f46', bg: '#f0fdf4', strip: '#10b981' },
                  done:         { label: 'Done',        color: '#065f46', bg: '#f0fdf4', strip: '#10b981' },
                  cancelled:    { label: 'Cancelled',   color: '#991b1b', bg: '#fef2f2', strip: '#ef4444' },
                  rejected:     { label: 'Rejected',    color: '#991b1b', bg: '#fef2f2', strip: '#ef4444' },
                };

                const filterCounts = {
                  all: myBookings.length,
                  upcoming: myBookings.filter(b => upcomingStatuses.includes(b.status)).length,
                  active:   myBookings.filter(b => activeStatuses.includes(b.status)).length,
                  completed:myBookings.filter(b => doneStatuses.includes(b.status)).length,
                  cancelled:myBookings.filter(b => cancelledStatuses.includes(b.status)).length,
                };

                return (
                  <div className="space-y-6 pb-10">

                    {/* ── Header ── */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-[22px] font-semibold text-slate-900 tracking-tight">My Bookings</h2>
                        <p className="text-sm text-slate-500 mt-0.5">Track and manage all your service appointments</p>
                      </div>
                      <button
                        onClick={() => openBookingModal()}
                        className="flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%)' }}
                      >
                        <iconify-icon icon="solar:add-circle-bold" width="16"></iconify-icon>
                        New Booking
                      </button>
                    </div>

                    {/* ── Stats Summary ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total', count: filterCounts.all, icon: 'solar:notebook-bookmark-linear', color: '#6366f1', bg: '#eef2ff' },
                        { label: 'Upcoming', count: filterCounts.upcoming, icon: 'solar:clock-circle-linear', color: '#f59e0b', bg: '#fffbeb' },
                        { label: 'Active', count: filterCounts.active, icon: 'solar:play-circle-linear', color: '#3b82f6', bg: '#eff6ff' },
                        { label: 'Completed', count: filterCounts.completed, icon: 'solar:check-circle-linear', color: '#10b981', bg: '#f0fdf4' },
                      ].map(s => (
                        <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                            <iconify-icon icon={s.icon} width="20" style={{ color: s.color }}></iconify-icon>
                          </div>
                          <div>
                            <p className="text-[22px] font-bold text-slate-900 leading-none">{s.count}</p>
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">{s.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── Filter Tabs ── */}
                    <div className="flex items-center gap-1 bg-white border border-slate-200 p-1.5 rounded-2xl w-fit overflow-x-auto shadow-sm">
                      {(['all', 'upcoming', 'active', 'completed', 'cancelled'] as const).map(f => {
                        const icons = { all: 'solar:layers-linear', upcoming: 'solar:clock-circle-linear', active: 'solar:play-circle-linear', completed: 'solar:check-circle-linear', cancelled: 'solar:close-circle-linear' };
                        return (
                          <button
                            key={f}
                            onClick={() => setBookingsFilter(f)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap capitalize ${
                              bookingsFilter === f ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <iconify-icon icon={icons[f]} width="14"></iconify-icon>
                            {f}
                            {filterCounts[f] > 0 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                bookingsFilter === f ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                              }`}>
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
                        {[1,2,3].map(k => (
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
                            'exterior': 'solar:washing-machine-linear', 'interior': 'solar:sofa-2-linear',
                            'paint': 'solar:pallete-2-linear', 'ceramic': 'solar:shield-check-linear',
                            'engine': 'solar:settings-linear', 'full': 'solar:star-shine-linear',
                          };
                          const svcName = (booking.serviceName || booking.serviceType || '').toLowerCase();
                          const svcIcon = Object.entries(serviceIcons).find(([k]) => svcName.includes(k))?.[1] || 'solar:car-wash-linear';

                          return (
                            <div
                              key={bookingId}
                              className="bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-[2px] group"
                              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
                            >
                              {/* Cancel confirmation */}
                              {isCancelling && (
                                <div className="px-6 py-3.5 flex items-center justify-between gap-4" style={{ background: 'linear-gradient(135deg, #fef2f2, #fff1f2)' }}>
                                  <div className="flex items-center gap-2">
                                    <iconify-icon icon="solar:danger-triangle-linear" width="16" style={{ color: '#ef4444' }}></iconify-icon>
                                    <p className="text-sm font-semibold text-red-700">Cancel this booking?</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => setCancelConfirmId(null)}
                                      className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                                      Keep it
                                    </button>
                                    <button
                                      onClick={async () => {
                                        try {
                                          const { OrderService } = await import('../lib/order-service');
                                          await (OrderService as any).updateOrder?.(bookingId, { status: 'cancelled' });
                                          setMyBookings(prev => prev.map(b => (b._id || b.id) === bookingId ? { ...b, status: 'cancelled' } : b));
                                        } catch { /* silently fail */ }
                                        setCancelConfirmId(null);
                                      }}
                                      className="px-3.5 py-1.5 text-xs font-bold text-white rounded-lg transition-colors shadow-sm"
                                      style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                                      Yes, cancel
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className="flex">
                                {/* Status strip — thicker */}
                                <div className="w-1 shrink-0 rounded-l-2xl" style={{ background: `linear-gradient(to bottom, ${cfg.strip}, ${cfg.strip}88)` }} />

                                <div className="flex-1 p-5 sm:p-6">
                                  <div className="flex items-start gap-4">
                                    {/* Service icon */}
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                                      style={{ background: cfg.bg, border: `1px solid ${cfg.strip}25` }}>
                                      <iconify-icon icon={svcIcon} width="22" style={{ color: cfg.strip }}></iconify-icon>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                                          style={{ background: cfg.bg, color: cfg.color }}>
                                          {cfg.label}
                                        </span>
                                        {cfg.dot && (
                                          <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: cfg.strip }} />
                                            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: cfg.strip }} />
                                          </span>
                                        )}
                                      </div>
                                      <h3 className="font-bold text-slate-900 text-[16px] leading-snug">
                                        {booking.serviceName || booking.serviceType || 'Auto Service'}
                                      </h3>
                                      <p className="text-[13px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                                        <iconify-icon icon="solar:car-linear" width="13"></iconify-icon>
                                        {[booking.vehicleModel || booking.vehicleMake, booking.vehiclePlate].filter(Boolean).join(' · ') || 'Vehicle'}
                                      </p>
                                    </div>

                                    {/* Price */}
                                    <div className="text-right shrink-0">
                                      <p className="font-black text-slate-900 text-[20px] tracking-tight">
                                        {booking.price ? `₱${Number(booking.price).toLocaleString()}` : '—'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Date + Actions footer */}
                                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100/80">
                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                      <span className="flex items-center gap-1.5">
                                        <iconify-icon icon="solar:calendar-linear" width="13" style={{ color: cfg.strip }}></iconify-icon>
                                        <span className="font-medium">{dateStr}</span>
                                      </span>
                                      {timeStr && (
                                        <span className="flex items-center gap-1.5">
                                          <iconify-icon icon="solar:clock-circle-linear" width="13" style={{ color: cfg.strip }}></iconify-icon>
                                          <span className="font-medium">{timeStr}</span>
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {canCancel && (
                                        <button onClick={() => setCancelConfirmId(bookingId)}
                                          className="text-xs font-medium text-slate-400 hover:text-red-600 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all">
                                          Cancel
                                        </button>
                                      )}
                                      <button
                                        onClick={() => navigate('/customer/live-tracker')}
                                        className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-xl transition-all hover:-translate-y-0.5 shadow-sm hover:shadow-md"
                                        style={{ background: `linear-gradient(135deg, ${cfg.strip}, ${cfg.strip}cc)` }}>
                                        <iconify-icon icon="solar:map-arrow-right-linear" width="13"></iconify-icon>
                                        Track
                                      </button>
                                    </div>
                                  </div>
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
                      <div className="relative group cursor-pointer">
                        <div className="w-20 h-20 rounded-full bg-[#eff6ff] flex items-center justify-center text-[#1d4ed8] font-bold text-3xl shadow-sm overflow-hidden border border-slate-200">
                          {user?.avatar ? (
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
                        <div className="flex items-center gap-2">
                          <button type="button" className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md transition-colors shadow-sm">
                            Upload Photo
                          </button>
                          <button type="button" className="px-3 py-1.5 text-slate-500 hover:text-red-600 text-xs font-medium transition-colors">
                            Remove
                          </button>
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
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Email Address</label>
                      <input type="email" value={profile.email} onChange={e => { setProfile(p => ({ ...p, email: e.target.value })); setProfileErrors(er => ({ ...er, email: '' })); }}
                        className={`w-full px-3 py-2 rounded-md border text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${profileErrors.email ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                        placeholder="you@email.com" />
                      {profileErrors.email && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><iconify-icon icon="solar:danger-circle-linear" width="14"></iconify-icon>{profileErrors.email}</p>}
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

                {/* Live Service Tracker */}
                {hasActiveBooking && (
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-medium tracking-tight text-slate-900">Live Service: 2023 Tesla Model 3</h2>
                      <span className="text-xs font-medium px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">Est. completion: 2:30 PM</span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm overflow-x-auto">
                      <div className="min-w-[600px] flex items-center">

                        {/* Step 1: Done */}
                        <div className="flex flex-col items-center relative z-10 w-24">
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center mb-2">
                            <iconify-icon icon="solar:check-read-linear" width="16"></iconify-icon>
                          </div>
                          <span className="text-xs font-medium text-slate-900 text-center">Checked-in</span>
                          <span className="text-xs text-slate-500">8:45 AM</span>
                        </div>

                        <div className="flex-1 h-px bg-slate-900 -mx-6 mb-8 relative z-0"></div>

                        {/* Step 2: Done */}
                        <div className="flex flex-col items-center relative z-10 w-24">
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center mb-2">
                            <iconify-icon icon="solar:check-read-linear" width="16"></iconify-icon>
                          </div>
                          <span className="text-xs font-medium text-slate-900 text-center">Washing</span>
                          <span className="text-xs text-slate-500">9:15 AM</span>
                        </div>

                        <div className="flex-1 h-px bg-indigo-600 -mx-6 mb-8 relative z-0"></div>

                        {/* Step 3: Active */}
                        <div className="flex flex-col items-center relative z-10 w-24">
                          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white border-4 border-indigo-100 flex items-center justify-center mb-2 shadow-sm">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                          <span className="text-xs font-medium text-indigo-700 text-center">Detailing</span>
                          <span className="text-xs text-indigo-500">In Progress</span>
                        </div>

                        <div className="flex-1 h-px bg-slate-200 -mx-6 mb-8 relative z-0"></div>

                        {/* Step 4: Pending */}
                        <div className="flex flex-col items-center relative z-10 w-24 opacity-50">
                          <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-300 text-slate-400 flex items-center justify-center mb-2">
                            <span className="text-xs font-medium">4</span>
                          </div>
                          <span className="text-xs font-medium text-slate-500 text-center">Quality Check</span>
                          <span className="text-xs text-slate-400">Pending</span>
                        </div>

                        <div className="flex-1 h-px bg-slate-200 -mx-6 mb-8 relative z-0"></div>

                        {/* Step 5: Pending */}
                        <div className="flex flex-col items-center relative z-10 w-24 opacity-50">
                          <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-300 text-slate-400 flex items-center justify-center mb-2">
                            <span className="text-xs font-medium">5</span>
                          </div>
                          <span className="text-xs font-medium text-slate-500 text-center">Ready</span>
                          <span className="text-xs text-slate-400">Pending</span>
                        </div>

                      </div>
                    </div>
                  </section>
                )}

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
                    <div className="bg-white border border-slate-200 rounded-lg p-8 text-center flex flex-col items-center justify-center shadow-sm min-h-[220px]">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                        <iconify-icon icon="solar:car-linear" width="24" className="text-slate-300"></iconify-icon>
                      </div>
                      <p className="text-[14px] font-medium text-slate-900">Your garage is empty</p>
                      <p className="text-[12px] text-slate-500 mt-1 mb-4 max-w-[200px] mx-auto">Add your vehicles here to easily book and track services.</p>
                      <button
                        onClick={() => setAddVehicleOpen(true)}
                        className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-sm font-medium transition-colors"
                      >
                        Add Your First Vehicle
                      </button>
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
                              <div className="mt-4 grid grid-cols-3 gap-1 border-t border-slate-100 pt-3">
                                <button
                                  onClick={() => openScanStudio(v)}
                                  className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-700 transition-colors py-1.5 rounded-lg hover:bg-slate-50"
                                >
                                  <iconify-icon icon="solar:scanner-linear" width="17"></iconify-icon>
                                  <span className="text-[11px] font-medium">Scan</span>
                                </button>
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

      {/* Add Vehicle Modal */}
      {addVehicleOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }} onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', name: '', color: '', type: '' }); }}>
          <div className="bg-white rounded-xl w-full max-w-[400px] shadow-2xl" onClick={e => e.stopPropagation()} style={{ animation: 'modalIn .2s ease-out' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-[15px] font-semibold text-gray-900">Add Vehicle</h3>
              <button
                onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', name: '', color: '', type: '' }); }}
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
                  {vehicleErrors.plate && (
                    <p className="mt-1 text-[11px] text-red-500">{vehicleErrors.plate}</p>
                  )}
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

              {/* Make & Model */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Make &amp; Model <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2023 Toyota Camry"
                  value={newVehicle.name}
                  onChange={(e) => { setNewVehicle({ ...newVehicle, name: e.target.value }); setVehicleErrors(er => ({ ...er, name: '' })); }}
                  className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${vehicleErrors.name ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-gray-400'}`}
                />
                {vehicleErrors.name && (
                  <p className="mt-1 text-[11px] text-red-500">{vehicleErrors.name}</p>
                )}
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Color <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pearl White"
                  value={newVehicle.color}
                  onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setAddVehicleOpen(false); setVehicleErrors({}); setNewVehicle({ plate: '', name: '', color: '', type: '' }); }}
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
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} style={{ animation: 'modalIn .2s ease-out', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              {bookingDone ? (
                <h3 className="text-[15px] font-semibold text-gray-900">Booking Confirmed!</h3>
              ) : (
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900">Book a Service</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Step {bookingStep} of 4</p>
                </div>
              )}
              {!bookingSubmitting && (
                <button onClick={() => setBookingOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                </button>
              )}
            </div>

            {/* Progress bar */}
            {!bookingDone && (
              <div className="w-full h-0.5 bg-gray-100 shrink-0">
                <div className="h-full bg-gray-900 transition-all duration-300" style={{ width: bookingStep === 1 ? '25%' : bookingStep === 2 ? '50%' : bookingStep === 3 ? '75%' : '100%' }} />
              </div>
            )}

            {/* Body */}
            <div className="overflow-y-auto flex-1 booking-body" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <style dangerouslySetInnerHTML={{ __html: `.booking-body::-webkit-scrollbar { display: none; }` }} />
              {bookingDone ? (
                /* ── Success ── */
                <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
                    <iconify-icon icon="solar:check-circle-bold" width="32" style={{ color: '#16a34a' }}></iconify-icon>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-1">Booking Submitted!</h4>
                  <p className="text-sm text-gray-500 mb-2">Your appointment has been submitted. We'll confirm it shortly.</p>
                  <p className="text-sm font-medium text-gray-700">{bookingForm.serviceName} — {bookingForm.date} at {bookingForm.time}</p>
                  <button onClick={() => setBookingOpen(false)} className="mt-6 px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors">Done</button>
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
                                  vehicleModel: v.name,
                                  vehiclePlate: v.plate,
                                  vehicleColor: v.color || '',
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
                /* ── Step 2: Vehicle ── */
                <div className="p-5 space-y-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Vehicle Details</p>

                  {/* Make & Model — single combined field like Add Vehicle */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Make & Model <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g. 2023 Toyota Camry"
                      value={bookingForm.vehicleModel}
                      onChange={e => setBookingForm(f => ({ ...f, vehicleModel: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Color <span className="text-red-500">*</span></label>
                      <select value={bookingForm.vehicleColor} onChange={e => setBookingForm(f => ({ ...f, vehicleColor: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 appearance-none">
                        <option value="" disabled>Select color</option>
                        {['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Yellow', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Plate Number</label>
                      <input
                        type="text"
                        placeholder="e.g. ABC 1234"
                        value={bookingForm.vehiclePlate}
                        onChange={e => setBookingForm(f => ({ ...f, vehiclePlate: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400"
                      />
                    </div>
                  </div>

                  {/* Garage quick-pick */}
                  {vehicles.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-500 mb-2">Or pick from your garage:</p>
                      <div className="flex flex-wrap gap-2">
                        {vehicles.map((v: any, i: number) => (
                          <button key={i} type="button"
                            onClick={() => setBookingForm(f => ({
                              ...f,
                              vehicleModel: v.name,
                              vehicleColor: v.color || '',
                              vehiclePlate: v.plate || '',
                            }))}
                            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:border-gray-400 text-gray-700 transition-colors">
                            {v.name} ({v.plate})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              ) : bookingStep === 3 ? (
                /* ── Step 3: Date & Time ── */
                <div className="p-5 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Choose a Date</p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {BOOKING_DATES.map(d => {
                        const iso = d.toISOString().split('T')[0];
                        return (
                          <button key={iso} type="button" onClick={() => setBookingForm(f => ({ ...f, date: iso }))}
                            className={`flex flex-col items-center py-2 px-1 rounded-lg border text-center transition-colors ${bookingForm.date === iso ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                            <span className="text-[10px] font-medium uppercase">{d.toLocaleDateString('en', { weekday: 'short' })}</span>
                            <span className="text-sm font-bold">{d.getDate()}</span>
                            <span className="text-[10px]">{d.toLocaleDateString('en', { month: 'short' })}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Choose a Time</p>
                    <div className="grid grid-cols-4 gap-2">
                      {BOOKING_TIMES.map(t => (
                        <button key={t} type="button" onClick={() => setBookingForm(f => ({ ...f, time: t }))}
                          className={`py-2 rounded-lg border text-sm font-medium transition-colors ${bookingForm.time === t ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Special Requests <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea rows={3} value={bookingForm.notes} onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any specific instructions..." className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 resize-none" />
                  </div>
                </div>
              ) : (
                /* ── Step 4: Confirm ── */
                <div className="p-5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Booking Summary</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Service', value: bookingForm.serviceName },
                      { label: 'Price', value: `₱${bookingForm.servicePrice.toLocaleString()}` },
                      { label: 'Vehicle', value: [bookingForm.vehicleYear, bookingForm.vehicleMake, bookingForm.vehicleModel].filter(Boolean).join(' ') || '—' },
                      { label: 'Plate', value: bookingForm.vehiclePlate || '—' },
                      { label: 'Color', value: bookingForm.vehicleColor || '—' },
                      { label: 'Date', value: bookingForm.date ? new Date(bookingForm.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '—' },
                      { label: 'Time', value: bookingForm.time || '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="text-xs font-medium text-gray-500">{label}</span>
                        <span className="text-sm font-semibold text-gray-900">{value}</span>
                      </div>
                    ))}
                  </div>
                  {bookingForm.notes && <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600"><span className="font-medium">Notes:</span> {bookingForm.notes}</div>}
                </div>
              )}
            </div>

            {/* Footer */}
            {!bookingDone && (
              <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0 bg-white">
                {bookingStep > 1 && (
                  <button type="button" onClick={() => setBookingStep(s => s - 1)} disabled={bookingSubmitting}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    Back
                  </button>
                )}
                {bookingStep < 4 ? (
                  <button type="button"
                    disabled={
                      (bookingStep === 1 && !bookingForm.service) ||
                      (bookingStep === 2 && (!bookingForm.vehicleModel || !bookingForm.vehicleColor)) ||
                      (bookingStep === 3 && (!bookingForm.date || !bookingForm.time))
                    }
                    onClick={() => setBookingStep(s => s + 1)}
                    className="flex-1 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Continue
                  </button>
                ) : (
                  <button type="button" onClick={submitBooking} disabled={bookingSubmitting}
                    className="flex-1 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-60">
                    {bookingSubmitting ? 'Submitting...' : 'Confirm Booking'}
                  </button>
                )}
              </div>
            )}
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
          style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(5px)' }}
          onClick={() => setEditVehicleOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'modalIn .2s ease-out' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <iconify-icon icon="solar:pen-bold" width="15" style={{ color: '#475569' }}></iconify-icon>
                </div>
                <h3 className="text-[15px] font-semibold text-gray-900">Edit Vehicle</h3>
              </div>
              <button onClick={() => setEditVehicleOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">

              {/* API error banner */}
              {editVehicleApiError && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                  <iconify-icon icon="solar:danger-triangle-bold" width="15" style={{ color: '#ef4444', marginTop: '1px', flexShrink: 0 }}></iconify-icon>
                  <p className="text-[12px] text-red-600 font-medium leading-snug">{editVehicleApiError}</p>
                </div>
              )}

              {/* Plate */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Plate Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editVehicleForm.plate}
                  onChange={e => { setEditVehicleForm(f => ({ ...f, plate: e.target.value })); setEditVehicleErrors(er => ({ ...er, plate: '' })); }}
                  placeholder="e.g. ABC-1234"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${editVehicleErrors.plate ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-gray-400'}`}
                />
                {editVehicleErrors.plate && <p className="text-xs text-red-500 mt-1">{editVehicleErrors.plate}</p>}
              </div>

              {/* Make & Model */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Make & Model <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editVehicleForm.name}
                  onChange={e => { setEditVehicleForm(f => ({ ...f, name: e.target.value })); setEditVehicleErrors(er => ({ ...er, name: '' })); }}
                  placeholder="e.g. 2023 Toyota Vios"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${editVehicleErrors.name ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-gray-400'}`}
                />
                {editVehicleErrors.name && <p className="text-xs text-red-500 mt-1">{editVehicleErrors.name}</p>}
              </div>

              {/* Vehicle Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Vehicle Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={editVehicleForm.type}
                  onChange={e => { setEditVehicleForm(f => ({ ...f, type: e.target.value })); setEditVehicleErrors(er => ({ ...er, type: '' })); }}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm text-gray-900 outline-none transition-colors appearance-none ${editVehicleErrors.type ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-gray-400'}`}
                >
                  <option value="" disabled>Select type...</option>
                  {['Hatchback', 'Sedan', 'Midsized', 'SUV', 'Pick UP', 'Large SUV / Van', 'Highend Sedan'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {editVehicleErrors.type && <p className="text-xs text-red-500 mt-1">{editVehicleErrors.type}</p>}
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Color <span className="text-gray-400 font-normal">(optional)</span></label>
                <select
                  value={editVehicleForm.color}
                  onChange={e => setEditVehicleForm(f => ({ ...f, color: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 appearance-none"
                >
                  <option value="">Select color...</option>
                  {['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Yellow', 'Orange', 'Other'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setEditVehicleOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEditVehicle}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
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
