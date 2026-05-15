import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
    LogOut, ClipboardList, Calendar, Package, Camera, MessageSquare,
    Clock, CheckCircle, Play, AlertTriangle, Plus, Bell, Activity,
    Mic, Zap, Timer, Gauge, Wifi, TrendingUp, BarChart3, Sparkles,
    ChevronRight, ChevronLeft, Eye, Settings, Menu, X, LayoutDashboard, User,
    Shield, Volume2, Info, Hash, Sun, Moon, BadgeHelp, Monitor, ScanLine, Receipt
} from 'lucide-react';
import { DashboardTab } from '@/components/technician/DashboardTab';
import { QueueTab } from '@/components/technician/QueueTab';
import { ScheduleTab } from '@/components/technician/ScheduleTab';
import { InventoryTab } from '@/components/technician/InventoryTab';
import { PhotosTab } from '@/components/technician/PhotosTab';
import { NotesTab } from '@/components/technician/NotesTab';
import { SettingsTab } from '@/components/technician/SettingsTab';
import { ServiceRecordsTab } from '@/components/technician/ServiceRecordsTab';
import { ProgressReportsTab } from '@/components/technician/ProgressReportsTab';
import { ActivityLogsTab } from '@/components/technician/ActivityLogsTab';
import { HistoryTab } from '@/components/technician/HistoryTab';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { formatDistanceToNow } from 'date-fns';
import { collection, query, where, onSnapshot, orderBy, doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { jobStorage, inventoryStorage, inventoryUsageStorage } from '@/lib/storage';
import { InventoryService } from '@/lib/inventory-service-api';
import { OrderService } from '@/lib/order-service';
import { ActivityService } from '@/lib/activity-service-api';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';
import InspectionCapture from '@/components/InspectionCapture';
import WarrantyReceiptModal from '@/components/technician/WarrantyReceiptModal';
import api from '@/lib/api';
import { SERVICE_STAFF_ROLE, STAFF_ROLES, isStaffQCRole, isStaffInventoryRole, isTechnicianRole } from '@/lib/roles';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import type { Booking, InventoryItem, InventoryUsage, CustomerNote } from '@/types';
import WorkflowOrchestrator from '@/components/technician/workflow/WorkflowOrchestrator';

import { AIEstimatorEmbed } from '@/pages/AIEstimatorPage';
import QCDashboardPanel from '@/components/technician/qc/QCDashboardPanel';
import './DetailerDashboard.css';

type TabType = 'dashboard' | 'queue' | 'schedule' | 'inventory' | 'records' | 'progress' | 'activity' | 'photos' | 'notes' | 'settings' | 'history' | 'pos' | 'voice_assistant' | 'ai_damage_detection' | 'qc_review';

const LOW_STOCK_THRESHOLD = 10;
const normalizeBookingId = (id?: string) => (id ? String(id).replace(/^#/, '') : '');

/* ── CountUp Animation ── */
function CountUp({ end, duration = 1.8, prefix = '', suffix = '' }: { end: number; duration?: number; prefix?: string; suffix?: string }) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let startTime: number;
        let frame: number;
        const animate = (ts: number) => {
            if (!startTime) startTime = ts;
            const pct = Math.min((ts - startTime) / (duration * 1000), 1);
            const ease = pct === 1 ? 1 : 1 - Math.pow(2, -10 * pct);
            setCount(end * ease);
            if (pct < 1) frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [end, duration]);
    return <span>{prefix}{Math.floor(count).toLocaleString()}{suffix}</span>;
}

/* ── Service Stage Map ── */
const SERVICE_STAGES = ['Received', 'Wash', 'Polish', 'Interior', 'AI Scan', 'Final QC', 'Ready'] as const;

const pageVariants = {
    initial: { opacity: 0, y: 20, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
    exit: { opacity: 0, y: -10, scale: 0.99, transition: { duration: 0.2 } }
};

const staggerContainer = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } }
};

const staggerItem = {
    initial: { opacity: 0, y: 16, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } }
};

const cardHover = { scale: 1.015, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } };
const cardTap = { scale: 0.985, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } };
const btnHover = { scale: 1.03, transition: { type: 'spring' as const, stiffness: 400, damping: 20 } };
const btnTap = { scale: 0.96, transition: { type: 'spring' as const, stiffness: 400, damping: 20 } };

const SERVICE_USAGE_SUGGESTIONS: Record<string, { name: string; quantity: number; unit?: string }[]> = {
    'body wash': [{ name: 'Car Wash Shampoo', quantity: 100, unit: 'ml' }],
    'full detailing': [
        { name: 'All Purpose Cleaner', quantity: 150, unit: 'ml' },
        { name: 'Leather Conditioner', quantity: 50, unit: 'ml' }
    ],
    'interior cleaning': [
        { name: 'Leather Conditioner', quantity: 60, unit: 'ml' },
        { name: 'Interior Detailer', quantity: 80, unit: 'ml' }
    ],
    'wax & polish': [{ name: 'Wax Sealant', quantity: 80, unit: 'ml' }],
    'engine cleaning': [{ name: 'Engine Degreaser', quantity: 120, unit: 'ml' }],
    'clothing': [{ name: 'PPF Film', quantity: 1, unit: 'panel' }],
    'diamond paint correction': [
        { name: 'Cutting Compound', quantity: 60, unit: 'ml' },
        { name: 'Polishing Compound', quantity: 60, unit: 'ml' }
    ],
    'ceramic shield pro': [{ name: 'Ceramic Coating', quantity: 50, unit: 'ml' }],
    'graphene gloss package': [{ name: 'Graphene Coating', quantity: 50, unit: 'ml' }],
    'headlight restoration pro': [{ name: 'Headlight Restoration Kit', quantity: 1, unit: 'kit' }],
    'ozone odor removal': [{ name: 'Ozone Cartridge', quantity: 1, unit: 'unit' }],
    'engine bay shield': [{ name: 'Engine Dressing', quantity: 80, unit: 'ml' }],
    'wheel & caliper spa': [{ name: 'Iron Remover', quantity: 120, unit: 'ml' }],
    'trim & chrome revival': [{ name: 'Trim Restorer', quantity: 50, unit: 'ml' }],
    'rain-repel glass coat': [{ name: 'Glass Coating', quantity: 40, unit: 'ml' }],
    'odorlock cabin detox': [{ name: 'Cabin Fresh Mist', quantity: 1, unit: 'unit' }],
};
const modalSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30
};

export default function DetailerDashboard() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const getJobId = (job: Booking) => (job.id || (job as any)._id) as string | undefined;
    const readPendingBookings = useCallback(() => {
        if (typeof window === 'undefined') return [];
        try {
            const pendingRaw = localStorage.getItem('pending_bookings');
            const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
            return Array.isArray(pending) ? pending : [];
        } catch {
            return [];
        }
    }, []);
    const normalizePendingBooking = useCallback((booking: any) => {
        const id = booking.id || booking._id;
        const paymentStatus = booking.paymentStatus || booking.payment_status;
        const inferredStatus = paymentStatus === 'paid' ? 'in_progress' : undefined;
        const inferredCustomerStatus = paymentStatus === 'paid' ? 'queued' : undefined;
        return {
            ...booking,
            id,
            status: booking.status || inferredStatus,
            customerStatus: booking.customerStatus || inferredCustomerStatus,
        } as Booking;
    }, []);
    const ensureWaiverSigned = useCallback((booking: Booking) => ({
        ...booking,
        legalCompliance: {
            ...(booking.legalCompliance || {}),
            waiverSignature: booking.legalCompliance?.waiverSignature || 'signed',
        },
    }), []);
    const dispatchStorageSync = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new Event('local-booking-update'));
        } catch {
            // no-op
        }
    }, []);





    const validTabs: TabType[] = ['dashboard', 'queue', 'schedule', 'inventory', 'records', 'progress', 'activity', 'photos', 'notes', 'settings', 'qc_review', 'ai_damage_detection', 'voice_assistant', 'pos', 'history'];
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        const hash = window.location.hash.replace('#', '');
        if (validTabs.includes(hash as TabType)) return hash as TabType;

        try {
            const savedSettings = localStorage.getItem('detailer_settings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                if (parsed.defaultView) {
                    const defaultTab = parsed.defaultView.toLowerCase();
                    if (validTabs.includes(defaultTab as TabType)) {
                        return defaultTab as TabType;
                    }
                    if (defaultTab === 'history') return 'records' as TabType; // map history to records tab
                }
            }
        } catch (e) { }

        return 'dashboard';
    });
    // Default QC users to the QC Inspection tab on first load
    useEffect(() => {
        if (isStaffQCRole(user?.role) && activeTab === 'dashboard') {
            setActiveTab('qc_review');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.role]);

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('autospf_sidebar_collapsed') === 'true');
    const [notifSound, setNotifSound] = useState(() => localStorage.getItem('autospf_notif_sound') !== 'off');
    const [isDark, setIsDark] = useState(() => {
        // Use a detailer-scoped key so the public marketing site is never affected
        const saved = localStorage.getItem('autospf_detailer_theme');
        return saved ? saved === 'dark' : true; // default dark
    });

    // Sync dark mode when SettingsTab saves — scoped to detailer portal only.
    // IMPORTANT: Do NOT touch document.documentElement here. The `.detailer-root.dark`
    // class on the wrapper div handles all dark-mode CSS. Mutating <html> would
    // bleed into the public marketing site.
    useEffect(() => {
        const syncTheme = () => {
            const saved = localStorage.getItem('autospf_detailer_theme');
            const dark = saved ? saved === 'dark' : true;
            setIsDark(dark);
        };
        window.addEventListener('storage', syncTheme);
        window.addEventListener('autospf-detailer-theme-change', syncTheme);
        return () => {
            window.removeEventListener('storage', syncTheme);
            window.removeEventListener('autospf-detailer-theme-change', syncTheme);
        };
    }, []);

    // ── Dynamic dark-mode style injection ─────────────────────────────────────
    // React serialises inline colours as rgb() in the DOM, so CSS [style*="'#fff'"]
    // never matches. Instead we inject a <style> tag with !important rules that
    // target element types by their computed position inside `.detailer-root.dark`.
    useEffect(() => {
        const STYLE_ID = 'autospf-dark-override';
        let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

        if (isDark) {
            if (!el) {
                el = document.createElement('style');
                el.id = STYLE_ID;
                document.head.appendChild(el);
            }
            el.textContent = `
/* ── AutoSPF+ Dark Mode: inline-style override injection ── */

/* ── Background: white (rgb(255,255,255)) — React serialises '#fff' / '#ffffff' as this ── */
.detailer-root.dark .detailer-main-area [style*="rgb(255, 255, 255)"], 
.detailer-root.dark .detailer-main-area [style*="#fff"], 
.detailer-root.dark .detailer-main-area [style*="#ffffff"], 
.detailer-root.dark .detailer-main-area [style*="white"],
.detailer-root.dark .detailer-main-area [style*="rgb(255,255,255)"] {
  background: #1A1A1A !important;
  color: #E5E5E5 !important;
  border-color: #2A2A2A !important;
}

/* All card-shell elements with a border-radius inside the content area */
.detailer-root.dark .detailer-content [style*="border-radius"] {
  border-color: #2A2A2A !important;
}

/* ── Background near-white shades (Cards/Panels) ── */
.detailer-root.dark .detailer-main-area [style*="rgb(247, 249, 251)"],
.detailer-root.dark .detailer-main-area [style*="rgb(242, 244, 246)"],
.detailer-root.dark .detailer-main-area [style*="rgba(242,244,246"],
.detailer-root.dark .detailer-main-area [style*="rgba(242, 244, 246"],
.detailer-root.dark .detailer-main-area [style*="rgb(248, 250, 252)"],
.detailer-root.dark .detailer-main-area [style*="rgb(250, 251, 252)"],
.detailer-root.dark .detailer-main-area [style*="rgb(236, 238, 240)"],
.detailer-root.dark .detailer-main-area [style*="rgb(230, 232, 234)"],
.detailer-root.dark .detailer-main-area [style*="#f7f9fb"],
.detailer-root.dark .detailer-main-area [style*="#f2f4f6"],
.detailer-root.dark .detailer-main-area [style*="#eceef0"],
.detailer-root.dark .detailer-main-area [style*="#e6e8ea"],
.detailer-root.dark .detailer-main-area [style*="#dae2fd"] {
  background: #111111 !important;
  color: #E5E5E5 !important;
  border-color: #2A2A2A !important;
}

/* ── Text: dark navy (#06274b = rgb(6,39,75)) ── */
.detailer-root.dark .detailer-main-area [style*="rgb(6, 39, 75)"],
.detailer-root.dark .detailer-main-area h1[style], .detailer-root.dark .detailer-main-area h2[style],
.detailer-root.dark .detailer-main-area h3[style], .detailer-root.dark .detailer-main-area h4[style] {
  color: #E5E5E5 !important;
}

/* ── Text: medium-dark (#191c1e = rgb(25,28,30)) ── */
.detailer-root.dark .detailer-main-area [style*="color: rgb(25, 28, 30)"],
.detailer-root.dark .detailer-main-area [style*="color: rgb(67, 71, 76)"],
.detailer-root.dark .detailer-main-area [style*="color: rgb(81, 95, 116)"] {
  color: #B0B0B0 !important;
}

/* ── Text: muted (#74777d = rgb(116,119,125)) ── */
.detailer-root.dark .detailer-main-area [style*="color: rgb(116, 119, 125)"],
.detailer-root.dark .detailer-main-area [style*="color: rgb(159, 163, 169)"] {
  color: #777777 !important;
}

/* ── Schedule Tab: light-blue slate tones ── */
.detailer-root.dark .detailer-main-area [style*="color: rgb(15, 23, 42)"],
.detailer-root.dark .detailer-main-area [style*="color: rgb(30, 41, 59)"],
.detailer-root.dark .detailer-main-area [style*="color: rgb(51, 65, 85)"] {
  color: #E5E5E5 !important;
}
.detailer-root.dark .detailer-main-area [style*="color: rgb(71, 85, 105)"],
.detailer-root.dark .detailer-main-area [style*="color: rgb(100, 116, 139)"] {
  color: #B0B0B0 !important;
}
.detailer-root.dark .detailer-main-area [style*="color: rgb(148, 163, 184)"] {
  color: #555555 !important;
}

/* ── Schedule: white panel backgrounds ── */
.detailer-root.dark .detailer-main-area [style*="rgb(255, 255, 255)"] {
  background: #1A1A1A !important;
  border-color: #2A2A2A !important;
}
.detailer-root.dark .detailer-main-area [style*="rgb(248, 250, 252)"],
.detailer-root.dark .detailer-main-area [style*="rgb(250, 251, 252)"],
.detailer-root.dark .detailer-main-area [style*="rgb(241, 245, 249)"] {
  background: #222222 !important;
  border-color: #2A2A2A !important;
}

/* ── Table overrides ── */
.detailer-root.dark .data-table,
.detailer-root.dark .data-table thead,
.detailer-root.dark .data-table tbody { background: #1A1A1A !important; }
.detailer-root.dark .data-table thead th { color: #777777 !important; border-bottom: 1px solid #2A2A2A !important; }
.detailer-root.dark .data-table tbody td { color: #E5E5E5 !important; border-bottom: 1px solid #2A2A2A !important; }
.detailer-root.dark .data-table tbody td.muted { color: #777777 !important; }
.detailer-root.dark .data-table tbody tr:hover { background: #222222 !important; }

/* ── Settings cards ── */
.detailer-root.dark .settings-card { background: #1A1A1A !important; border: 1px solid #2A2A2A !important; }
.detailer-root.dark .settings-card-header { background: #111111 !important; border-bottom: 1px solid #2A2A2A !important; }
.detailer-root.dark .settings-card-header h3 { color: #E5E5E5 !important; }
.detailer-root.dark .settings-card-header p { color: #777777 !important; }
.detailer-root.dark .settings-row-label { color: #E5E5E5 !important; }
.detailer-root.dark .settings-row-desc { color: #777777 !important; }
.detailer-root.dark .settings-row-value { color: #B0B0B0 !important; }
.detailer-root.dark .settings-row { border-bottom: 1px solid #2A2A2A !important; }

/* ── KPI/Job cards with CSS classes ── */
.detailer-root.dark .kpi-card-v2 { background: #1A1A1A !important; }
.detailer-root.dark .kpi-card-v2-label { color: #777777 !important; }
.detailer-root.dark .kpi-card-v2-value { color: #E5E5E5 !important; }
.detailer-root.dark .job-card-v2 { background: #111111 !important; }
.detailer-root.dark .schedule-appointment { background: #1A1A1A !important; border-left-color: #E8650A !important; }
.detailer-root.dark .photo-slot { background: #1A1A1A !important; border-color: #2A2A2A !important; }

/* ── Dialogs / Radix modals ── */
.detailer-root.dark [role="dialog"],
.detailer-root.dark [data-radix-dialog-content] {
  background: #1A1A1A !important;
  border: 1px solid #2A2A2A !important;
  color: #E5E5E5 !important;
}
.detailer-root.dark [role="listbox"],
.detailer-root.dark [data-radix-select-content] {
  background: #1A1A1A !important;
  border: 1px solid #2A2A2A !important;
  color: #E5E5E5 !important;
}
.detailer-root.dark [role="option"]:hover { background: #2A2A2A !important; }

/* ── Form inputs ── */
.detailer-root.dark .detailer-main-area input:not([type=checkbox]):not([type=radio]),
.detailer-root.dark .detailer-main-area select,
.detailer-root.dark .detailer-main-area textarea {
  background: #1A1A1A !important;
  border-color: #2A2A2A !important;
  color: #E5E5E5 !important;
}

/* ── General heading/text inheritance ── */
.detailer-root.dark .detailer-main-area h1:not([style]),
.detailer-root.dark .detailer-main-area h2:not([style]),
.detailer-root.dark .detailer-main-area h3:not([style]),
.detailer-root.dark .detailer-main-area h4:not([style]) { color: #E5E5E5 !important; }
.detailer-root.dark .detailer-main-area p:not([style]) { color: #B0B0B0 !important; }
`;
        } else {
            // Light mode: remove the override tag if present
            el?.remove();
        }
    }, [isDark]);

    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('autospf_sidebar_collapsed', String(next));
            return next;
        });
    }, []);

    useEffect(() => {
        window.location.hash = activeTab;
    }, [activeTab]);
    const [jobs, setJobs] = useState<Booking[]>([]);
    const [warrantyReceiptJob, setWarrantyReceiptJob] = useState<Booking | null>(null);
    const [workflowJob, setWorkflowJob] = useState<Booking | null>(null);
    const [storageUpdateTrigger, setStorageUpdateTrigger] = useState(0); // Force re-render trigger
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [inventoryUsage, setInventoryUsage] = useState<InventoryUsage[]>([]);
    const inventoryThreshold = useMemo(() => {
        if (typeof window === 'undefined') return undefined;
        const stored = localStorage.getItem('autospf_inventory_threshold');
        const parsed = stored ? Number(stored) : undefined;
        return Number.isFinite(parsed) ? parsed : undefined;
    }, []);
    const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>([]);
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);
    const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

    const [isLoading, setIsLoading] = useState(false);
    const apiDataLoadedRef = useRef(false);

    // ── Real-time MongoDB Change Stream Sync ─────────────────────────
    // When admin assigns a detailer or any order changes, this fires
    // and auto-refreshes the dashboard — no manual reload needed.
    const loadDataRef = useRef<(() => void) | null>(null);
    const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useRealtimeSync(
        ['orders', 'products'],
        useCallback((_collection: string) => {
            // Debounce rapid successive changes (e.g. assign + status change)
            if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
            realtimeDebounceRef.current = setTimeout(() => {
                console.log('⚡ [REALTIME] db_change detected, refreshing detailer data...');
                loadDataRef.current?.();
            }, 400);
        }, [])
    );
    const [isCompleting, setIsCompleting] = useState(false);
    // Time tracking
    const [elapsedTime, setElapsedTime] = useState(0);
    const [activeJobStartTime, setActiveJobStartTime] = useState<number | null>(null);

    // Log usage modal
    const [showUsageModal, setShowUsageModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState('');
    const [usageQuantity, setUsageQuantity] = useState('');

    // Note form
    const [newNote, setNewNote] = useState('');

    const [profilePhotoUrl, setProfilePhotoUrl] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('detailer_profile_photo') : null);

    const loadData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);

        try {
            const response = await OrderService.getDetailerOrders();
            console.log('📋 [DASHBOARD] RAW API response:', response);
            if (response.success && Array.isArray(response.data)) {
                console.log('📋 [DASHBOARD] RAW ORDERS count:', response.data.length);
                console.log('📋 [DASHBOARD] RAW ORDERS statuses:', response.data.map((j: Booking) => ({ id: j.id, status: j.status, assignedDetailer: j.assignedDetailer, customerName: j.customerName })));
                apiDataLoadedRef.current = true;
                setJobs(response.data.map(ensureWaiverSigned));

                // Check for active job start time (derived from status)
                const activeJob = response.data.find((j: Booking) => j.status === 'in_progress' || (j.status as string) === 'processing');
                if (activeJob) {
                    setActiveJobStartTime(prev => prev || Date.now());
                }
            } else {
                setJobs([]);
            }

            // Fetch products/inventory from backend
            const productsRes = await InventoryService.getAllProducts();
            if (productsRes.success) {
                const mappedProducts: InventoryItem[] = productsRes.data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category?.name || 'Uncategorized',
                    stock: p.inventory,
                    unit: 'units',
                    minLevel: p.minLevel || 5,
                    cost: p.price,
                    supplier: p.supplier?.name || 'Manual'
                }));
                setInventory(mappedProducts);
            } else {
                setInventory(inventoryStorage.getAll()); // Fallback
            }

            setInventoryUsage(inventoryUsageStorage.getAll());
            // local legacy notes sync is now fully handled in NotesTab backend integration

            const notifyRes = await NotificationService.getNotifications();
            if (notifyRes.success) {
                setNotifications(notifyRes.data);
                setUnreadNotificationsCount(notifyRes.unreadCount || 0);
            }

        } catch (error) {
            console.error('Failed to load detailer data:', error);
            setInventory(inventoryStorage.getAll());
        } finally {
            setIsLoading(false);
        }
    }, [user, ensureWaiverSigned]);

    // Keep loadDataRef in sync so realtime callback uses latest loadData
    useEffect(() => { loadDataRef.current = loadData; }, [loadData]);

    // Emergency Refresh Listener - IMMEDIATE SYNC
    useEffect(() => {
        const handleEmergencyRefresh = () => {
            console.log('🔄 IMMEDIATE SYNC: Storage event detected, forcing re-render');
            // Force immediate re-render by updating trigger state
            setStorageUpdateTrigger(prev => prev + 1);
            // Also reload data
            loadData();
        };

        const handleProfileUpdate = () => {
            setProfilePhotoUrl(localStorage.getItem('detailer_profile_photo'));
        };

        window.addEventListener('storage', handleEmergencyRefresh);
        window.addEventListener('local-booking-update', handleEmergencyRefresh);
        window.addEventListener('profile-photo-updated', handleProfileUpdate);

        return () => {
            window.removeEventListener('storage', handleEmergencyRefresh);
            window.removeEventListener('local-booking-update', handleEmergencyRefresh);
            window.removeEventListener('profile-photo-updated', handleProfileUpdate);
        };
    }, [loadData]);

    useEffect(() => {
        if (!user || !STAFF_ROLES.includes(user.role as any)) {
            navigate('/');
            return;
        }

        // Fetch initial data from API
        loadData();

        // REAL-TIME LISTENER — Merge Firestore status updates into API-loaded jobs
        // MongoDB API is the authoritative data source; Firestore only provides live status patches.
        const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const firestoreDocs = new Map<string, any>();
            snapshot.docs.forEach(doc => {
                firestoreDocs.set(doc.id, { id: doc.id, ...doc.data() });
            });

            console.log('🔥 [FIRESTORE] Real-time snapshot:', firestoreDocs.size, 'docs');

            // Merge: update existing jobs with Firestore status, don't wipe API data
            setJobs(prevJobs => {
                if (!apiDataLoadedRef.current && prevJobs.length === 0 && firestoreDocs.size > 0) {
                    // API hasn't loaded yet — use Firestore as temporary fallback
                    const liveJobs = Array.from(firestoreDocs.values()) as Booking[];
                    console.log('🔥 [FIRESTORE] API not loaded yet, using Firestore fallback:', liveJobs.length);
                    return liveJobs.map(ensureWaiverSigned);
                }

                // Merge Firestore real-time fields into existing API jobs
                const merged = prevJobs.map(job => {
                    const jobId = (job.id || (job as any)._id || '').toString().replace(/^#/, '');
                    const firestoreData = firestoreDocs.get(jobId);
                    if (firestoreData) {
                        // Only merge real-time trackable fields, not replace whole job
                        return {
                            ...job,
                            ...(firestoreData.status && { status: firestoreData.status }),
                            ...(firestoreData.customerStatus && { customerStatus: firestoreData.customerStatus }),
                            ...(firestoreData.customerStatusUpdatedAt && { customerStatusUpdatedAt: firestoreData.customerStatusUpdatedAt }),
                            ...(firestoreData.assignedDetailer && { assignedDetailer: firestoreData.assignedDetailer }),
                        };
                    }
                    return job;
                });

                console.log('🔥 [FIRESTORE] Merged', firestoreDocs.size, 'Firestore updates into', merged.length, 'API jobs');
                return merged;
            });

            // Check for active job
            const activeDoc = Array.from(firestoreDocs.values()).find((j: any) => j.status === 'in_progress' || j.status === 'processing');
            if (activeDoc) {
                setActiveJobStartTime(prev => prev || Date.now());
            }
        });

        // Keep notification polling distinct as it might be a different service
        const pollInterval = window.setInterval(() => {
            NotificationService.getNotifications().then(res => {
                if (res.success) {
                    setNotifications(res.data);
                    setUnreadNotificationsCount(res.unreadCount || 0);
                }
            });
        }, 30000);

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'pending_bookings') {
                loadData();
            }
        };

        window.addEventListener('storage', handleStorageChange);

        return () => {
            unsubscribe();
            if (pollInterval) {
                clearInterval(pollInterval);
            }
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [user, navigate, loadData]);

    // Timer effect
    useEffect(() => {
        if (!activeJobStartTime) return;

        const interval = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - activeJobStartTime) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [activeJobStartTime]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const handleMarkAsRead = async (id: string) => {
        try {
            const res = await NotificationService.markAsRead(id);
            if (res.success) {
                setNotifications(prev => prev.map(n => (n._id === id || n.id === id) ? { ...n, isRead: true } : n));
                setUnreadNotificationsCount(prev => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            const res = await NotificationService.markAllAsRead();
            if (res.success) {
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                setUnreadNotificationsCount(0);
            }
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
        }
    };

    const formatElapsedTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        const pad = (n: number) => String(n).padStart(2, '0');
        return <>{pad(hours)}<span className="timer-colon">:</span>{pad(minutes)}<span className="timer-colon">:</span>{pad(secs)}</>;
    };

    const speak = useCallback((text: string) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }, []);

    const findInventoryItemByNames = useCallback((names: string[]) => {
        for (const name of names) {
            const item = inventory.find(i => i.name.toLowerCase() === name.toLowerCase());
            if (item) return item;
        }
        for (const name of names) {
            const item = inventory.find(i => i.name.toLowerCase().includes(name.toLowerCase()));
            if (item) return item;
        }
        return undefined;
    }, [inventory]);

    const getPrimaryChemicalForJob = useCallback((job?: Booking) => {
        const serviceText = `${job?.serviceName || ''} ${job?.serviceType || ''}`.toLowerCase();
        if (serviceText.includes('wax')) {
            return findInventoryItemByNames(['Wax Sealant', 'Wax', 'Ceramic Coating']);
        }
        if (serviceText.includes('detail')) {
            return findInventoryItemByNames(['Interior Detailer', 'Detailing Spray', 'Detailer']);
        }
        return findInventoryItemByNames(['Car Wash Shampoo', 'Premium Wash Soap', 'Wash Shampoo', 'Wash Soap']);
    }, [findInventoryItemByNames]);

    const consumeInventory = useCallback(async (
        item: InventoryItem,
        usageAmount: number,
        jobId?: string,
        options?: { voiceAlert?: boolean }
    ) => {
        const previousInventory = [...inventory];
        const updatedInventory = inventory.map(i =>
            i.id === item.id ? { ...i, stock: i.stock - usageAmount } : i
        );
        setInventory(updatedInventory);

        try {
            const response = await api.patch('/products/inventory/consume', {
                productId: item.id,
                quantity: usageAmount,
                userId: user?.id,
                userName: user?.name,
                jobId: jobId || 'general'
            });
            const data = response.data;
            if (!data.success) {
                throw new Error(data.message || 'Failed to consume inventory');
            }

            const usage: InventoryUsage = {
                id: `use-${Date.now()}`,
                itemId: item.id,
                itemName: item.name,
                quantity: usageAmount,
                unit: item.unit,
                jobId: jobId || 'general',
                detailerId: user?.id || 'unknown',
                usedAt: new Date().toISOString(),
            };
            inventoryUsageStorage.add(usage);
            loadData();

            const remaining = data.data?.remaining ?? (item.stock - usageAmount);
            const threshold = inventoryThreshold ?? item.minLevel;
            if (remaining <= threshold) {
                toast.warning(`Low stock: ${item.name} is at ${remaining} ${item.unit}. Check Admin Low Stock Items.`);
            }
            if (options?.voiceAlert && remaining <= LOW_STOCK_THRESHOLD) {
                speak('Warning: Stock is now critically low.');
            }

            return { success: true, remaining };
        } catch (error: any) {
            setInventory(previousInventory);
            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to consume inventory';
            toast.error(errorMessage);
            return { success: false };
        }
    }, [inventory, user, loadData, speak]);

    const handleStartJob = async (job: Booking) => {
        try {
            const jobId = getJobId(job);
            if (!jobId) {
                toast.error('Missing job identifier.');
                return false;
            }

            // Open the 7-step workflow overlay
            setWorkflowJob(job);

            // Also update status to in-progress for live tracking
            const normalizedJobId = normalizeBookingId(jobId);

            // ATOMIC FIRESTORE UPDATE (Critical for Live Tracking)
            if (normalizedJobId && db) {
                try {
                    await setDoc(doc(db, 'bookings', normalizedJobId), {
                        status: 'in_progress',
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    console.log('✅ Atomic Firestore Update: in-progress');
                } catch (err) {
                    console.error('🔥 Firestore Update Failed:', err);
                    toast.error('Network error: Could not sync status to live tracking.');
                }
            }

            try {
                // If this is an unassigned booking, claim it for this detailer
                const updatePayload: Record<string, any> = { status: 'in_progress' };
                if (!job.assignedDetailer && (job.status === 'pending' || job.status === 'confirmed' || job.status === 'received')) {
                    updatePayload.assignedDetailer = user?.id;
                }
                // Backend Sync
                const response = await OrderService.updateOrder(jobId, updatePayload);
                if (response.success) {
                    toast.success('Job started successfully!');

                    try {
                        await ActivityService.createActivityLog(
                            'status_change',
                            'Job Started',
                            `Started working on job ${jobId}`,
                            user?.id || 'unknown',
                            user?.name || user?.email || 'Detailer',
                            { jobId },
                            { module: 'Service', action: 'job_started', status: 'success' }
                        );
                    } catch (e) {
                        console.error('Failed to log activity', e);
                    }

                    loadData(); // Sync with server state
                    return true;
                } else {
                    throw new Error('Backend update failed');
                }
            } catch (error) {
                // Keep optimistic state but warn
                console.warn('Backend sync failed, relying on Firestore/Local:', error);
                toast.success('Job started (Offline Mode)');
                return true;
            }
        } catch (error) {
            console.error('Critical error starting job:', error);
            toast.error('Failed to start job. Please try again.');
            return false;
        }
    };

    const handleCompleteJob = (job: Booking) => {
        setWarrantyReceiptJob(job);
    };

    const submitWarrantyReceipt = async (data: any) => {
        if (!warrantyReceiptJob) return;
        try {
            const jobId = getJobId(warrantyReceiptJob);
            if (!jobId) return;
            const res = await api.patch(`/orders/${jobId}/warranty-receipt`, { warrantyAndReceipt: data });
            if (res.data.success) {
                await executeCompleteJob(warrantyReceiptJob);
                setWarrantyReceiptJob(null);
            } else {
                toast.error(res.data.message || 'Failed to save warranty receipt');
            }
        } catch (error) {
            toast.error('Error saving warranty receipt');
        }
    };

    const executeCompleteJob = async (job: Booking) => {
        try {
            const jobId = getJobId(job);
            if (!jobId) {
                toast.error('Missing job identifier.');
                return false;
            }
            const normalizedJobId = normalizeBookingId(jobId);
            const lastStepIndex = job.serviceSteps && job.serviceSteps.length > 0
                ? job.serviceSteps.length - 1
                : undefined;

            // OPTIMISTIC UPDATE
            const previousJobs = [...jobs];
            const previousStartTime = activeJobStartTime;
            const previousElapsed = elapsedTime;

            const updatedJobs = jobs.map(j =>
                getJobId(j) === jobId ? { ...j, status: 'completed' as const } : j
            );
            setJobs(updatedJobs);
            setActiveJobStartTime(null);
            setElapsedTime(0);
            setIsCompleting(true);
            dispatchStorageSync();

            try {
                const response = await OrderService.updateProgress(jobId, lastStepIndex, 'completed', true, 'completed');
                if (response.success) {
                    toast.success('Job completed!');

                    try {
                        await ActivityService.createActivityLog(
                            'status_change',
                            'Job Completed',
                            `Completed job ${jobId}`,
                            user?.id || 'unknown',
                            user?.name || user?.email || 'Detailer',
                            { jobId },
                            { module: 'Service', action: 'job_completed', status: 'success' }
                        );
                    } catch (e) {
                        console.error('Failed to log activity', e);
                    }

                    loadData(); // Refresh to get server state
                    dispatchStorageSync();
                    return true;
                } else {
                    throw new Error(response.message || 'Failed to complete job');
                }
            } catch (error) {
                // ROLLBACK ON ERROR
                setJobs(previousJobs);
                setActiveJobStartTime(previousStartTime);
                setElapsedTime(previousElapsed);
                const errorMessage = (error as any)?.response?.data?.message || (error as any)?.message;
                if (errorMessage) {
                    toast.error(`Error: ${errorMessage}`);
                } else {
                    toast.error('Failed to complete job - rolled back');
                }
                return false;
            } finally {
                setIsCompleting(false);
            }
        } catch (error) {
            console.warn('Complete job failed:', error);
            setIsCompleting(false);
            return false;
        }
    };

    const handleForceReady = async (job: Booking) => {
        try {
            const jobId = getJobId(job);
            if (!jobId) return;
            const normalizedJobId = normalizeBookingId(jobId);



            const updatedJobs = jobs.map(j =>
                getJobId(j) === jobId ? { ...j, status: 'completed' as const, customerStatus: 'ready' as const } : j
            );
            setJobs(updatedJobs);
            dispatchStorageSync();

            try {
                await OrderService.updateOrder(jobId, { status: 'completed', customerStatus: 'ready' });
                toast.success('Job marked Ready');
                dispatchStorageSync();
            } catch (error) {
                // Keep optimistic state for demo
                console.warn('Force ready failed, keeping local state', error);
                toast.success('Job Started (Local Sync Active)');
            }
        } catch (error) {
            console.warn('Force ready failed:', error);
        }
    };

    const handleToggleChecklist = async (job: Booking, stepIndex: number) => {
        try {
            const jobId = getJobId(job);
            if (!jobId) return;
            if (!job.serviceSteps || !job.serviceSteps[stepIndex]) return;
            const normalizedJobId = normalizeBookingId(jobId);

            const previousJobs = [...jobs];
            const currentStep = job.serviceSteps[stepIndex];
            const nextStatus: NonNullable<Booking['serviceSteps']>[number]['status'] =
                currentStep.status === 'completed' ? 'pending' : 'completed';

            const updatedJobs: Booking[] = jobs.map(j => {
                if (getJobId(j) !== jobId) return j;
                const serviceSteps = j.serviceSteps?.map((step, idx) => {
                    if (idx !== stepIndex) return step;
                    const updatedStep: NonNullable<Booking['serviceSteps']>[number] = {
                        ...step,
                        status: nextStatus,
                        completedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined
                    };
                    return updatedStep;
                });
                return {
                    ...j,
                    serviceSteps
                };
            });
            setJobs(updatedJobs);
            dispatchStorageSync();



            try {
                const response = await OrderService.updateProgress(jobId, stepIndex, nextStatus);
                if (!response.success) {
                    throw new Error(response.message || 'Failed to update checklist');
                }
                dispatchStorageSync();
            } catch (error: any) {
                setJobs(previousJobs);
                const errorMessage = error?.response?.data?.message || error?.message || 'Failed to update checklist';
                toast.error(errorMessage);
            }
        } catch (error) {
            console.warn('Checklist update failed:', error);
        }
    };

    const handleToggleOperationsChecklist = async (job: Booking, phase: 'ingress' | 'egress', stepIndex: number) => {
        try {
            const jobId = getJobId(job);
            if (!jobId) return;
            const checklist = job.operationsChecklist?.[phase];
            if (!checklist || !checklist[stepIndex]) return;

            const previousJobs = [...jobs];
            const currentStep = checklist[stepIndex];
            const nextStatus = !currentStep.completed;

            const updatedJobs: Booking[] = jobs.map(j => {
                if (getJobId(j) !== jobId) return j;
                const newPhaseChecklist = j.operationsChecklist?.[phase]?.map((step, idx) => {
                    if (idx !== stepIndex) return step;
                    return { ...step, completed: nextStatus, completedAt: nextStatus ? new Date().toISOString() : undefined };
                });
                return {
                    ...j,
                    operationsChecklist: {
                        ...j.operationsChecklist,
                        [phase]: newPhaseChecklist
                    }
                };
            });
            setJobs(updatedJobs);
            dispatchStorageSync();

            try {
                const response = await api.patch(`/orders/${jobId}/operations-checklist`, {
                    phase,
                    stepIndex,
                    completed: nextStatus
                });
                if (!response.data.success) {
                    throw new Error(response.data.message || 'Failed to update operations checklist');
                }
                dispatchStorageSync();
            } catch (error: any) {
                setJobs(previousJobs);
                const errorMessage = error?.response?.data?.message || error?.message || 'Failed to update operations checklist';
                toast.error(errorMessage);
            }
        } catch (error) {
            console.warn('Operations checklist update failed:', error);
        }
    };

    const handleLogUsage = async () => {
        if (!selectedItem || !usageQuantity || !user) {
            toast.error('Please fill in all fields');
            return;
        }

        const item = inventory.find(i => i.id === selectedItem);
        if (!item) return;

        const usageAmount = parseFloat(usageQuantity);
        if (usageAmount > item.stock) {
            toast.error('Usage exceeds available stock!');
            return;
        }

        const activeJob = safeJobs.find(j => j.status === 'in_progress' || (j.status as string) === 'processing');

        toast.loading('Logging usage...');
        const result = await consumeInventory(item, usageAmount, activeJob?.id || 'general', { voiceAlert: false });
        if (result.success) {
            try {
                await ActivityService.createActivityLog(
                    'inventory_update',
                    'Inventory Consumed',
                    `Used ${usageAmount} ${item.unit} of ${item.name} for job ${activeJob?.id || 'general'}`,
                    user?.id || 'unknown',
                    user?.name || user?.email || 'Detailer',
                    { itemId: item.id, amount: usageAmount, jobId: activeJob?.id },
                    { module: 'Inventory', action: 'consume', status: 'success' }
                );
            } catch (e) {
                console.error('Failed to log activity', e);
            }

            toast.success('Usage logged and stock updated!');
            setShowUsageModal(false);
            setSelectedItem('');
            setUsageQuantity('');
        }
    };

    const handleSaveNote = async () => {
        if (!newNote.trim() || !user) {
            toast.error('Please enter a note');
            return;
        }

        const activeJob = safeJobs.find(j => j.status === 'in_progress' || (j.status as string) === 'processing');
        if (!activeJob) {
            toast.error('No active job found to add a note to.');
            return;
        }

        const noteContent = newNote;
        const jobId = activeJob.id || (activeJob as any)._id;

        try {
            // Call our new backend API endpoint
            const res = await OrderService.addNote(jobId, noteContent);
            if (res.success) {
                // Let real-time Firestore sync or loadData() fetch the updated note
                try {
                    await ActivityService.createActivityLog(
                        'status_change',
                        'Notes Updated',
                        `Added a new note for job ${jobId}`,
                        user?.id || 'unknown',
                        user?.name || user?.email || 'Detailer',
                        { jobId: jobId },
                        { module: 'Service', action: 'add_note', status: 'success' }
                    );
                } catch (e) {
                    console.error('Failed to log activity', e);
                }

                loadData();
                setNewNote('');
                toast.success('Note saved!');
            } else {
                toast.error(res.message || 'Failed to save note');
            }
        } catch (error) {
            console.error("Failed to sync note to backend:", error);
            toast.error('Error saving note.');
        }
    };

    const safeJobs = Array.isArray(jobs) ? jobs : [];
    console.log('📋 [DASHBOARD] STATE JOBS exactly as set in state:', safeJobs.length, safeJobs.map(j => ({ id: j.id, status: j.status })));
    const activeJobRaw = safeJobs.find(j => j.status === 'in_progress') || safeJobs.find(j => (j.status as string) === 'processing');

    const activeJob = activeJobRaw;
    const isChecklistComplete = (() => {
        if (!activeJob) return false;

        const hasServiceSteps = activeJob.serviceSteps && activeJob.serviceSteps.length > 0;
        const hasIngress = activeJob.operationsChecklist?.ingress && activeJob.operationsChecklist.ingress.length > 0;
        const hasEgress = activeJob.operationsChecklist?.egress && activeJob.operationsChecklist.egress.length > 0;

        if (!hasServiceSteps && !hasIngress && !hasEgress) return false;

        const serviceComplete = !hasServiceSteps || activeJob.serviceSteps!.every(s => s.status === 'completed');
        const ingressComplete = !hasIngress || activeJob.operationsChecklist!.ingress.every(s => s.completed);
        const egressComplete = !hasEgress || activeJob.operationsChecklist!.egress.every(s => s.completed);

        return serviceComplete && ingressComplete && egressComplete;
    })();

    const pendingJobs = safeJobs.filter(j =>
        j.status === 'pending'
        || j.status === 'confirmed'
        || j.status === 'assigned'
        || (j.status as string) === 'processing'
        || j.status === 'in_progress'
        || j.status === 'received'
        || j.customerStatus === 'washing'
        || j.customerStatus === 'detailing'
    );
    console.log('📋 [DASHBOARD] safeJobs total:', safeJobs.length, '→ FILTERED pendingJobs:', pendingJobs.length, pendingJobs.map(j => ({ id: j.id, status: j.status, name: j.customerName })));
    const finalPendingJobs = pendingJobs.filter(j =>
        activeTab === 'queue' ? (j.status !== 'completed' && j.status !== 'cancelled') : true
    );
    console.log('📋 [DASHBOARD] finalPendingJobs:', finalPendingJobs.length);
    const completedToday = safeJobs.filter(j => {
        if (j.status !== 'completed' && j.customerStatus !== 'ready') return false;

        // Use the most relevant timestamp for completion
        const completionTime = j.customerStatusUpdatedAt || j.updatedAt;
        if (!completionTime) return false;

        const today = new Date().toDateString();
        return new Date(completionTime).toDateString() === today;
    }).length;

    const hoursLogged = safeJobs.reduce((acc, job) => {
        // Simple estimation: 1.5 hours per completed job for now as we don't track exact start/end in Order model yet
        if (job.status === 'completed') {
            return acc + 1.5;
        }
        return acc;
    }, 0);

    // Calculate purely unstarted/pending jobs
    const totalPending = safeJobs.filter(j => j.status?.toLowerCase() === 'pending').length;

    // ── Role-aware tab configuration ──────────────────────────────────
    const getTabsForRole = (): { id: TabType; label: string; icon: any; badge?: number; badgeDanger?: boolean }[] => {
        const role = user?.role;

        if (isStaffQCRole(role)) {
            // Quality Checker spec:
            //   • QC Inspection Dashboard → full review queue with KPIs, jobs table,
            //     before/after comparison, AI detection cards, and approve/return flow
            return [
                { id: 'qc_review', label: 'QC Inspection', icon: Shield },
                { id: 'photos', label: 'Before / After', icon: Camera },
                { id: 'notes', label: 'Customer Notes', icon: MessageSquare },
                { id: 'ai_damage_detection', label: 'AI Scan & AR', icon: Zap },
            ];
        }

        if (isStaffInventoryRole(role)) {
            // Inventory Management Personnel spec:
            //   • Inventory Management Module → real-time stock monitoring, automatic
            //     deductions, low-stock alerts (all inside the Inventory tab)
            //   • Supports: voice assistant inventory logging
            return [
                { id: 'inventory', label: 'Inventory', icon: Package },
                { id: 'voice_assistant', label: 'Voice Assistant', icon: Mic },
            ];
        }

        if (isTechnicianRole(role)) {
            // Technician: voice assistant, AI damage detection, inventory
            return [
                { id: 'voice_assistant', label: 'Voice Assistant', icon: Mic },
                { id: 'ai_damage_detection', label: 'AI Scan & AR', icon: Zap },
                { id: 'inventory', label: 'Inventory', icon: Package },
            ];
        }

        // Default: legacy service_staff — full dashboard
        return [
            { id: 'dashboard', label: "Today's Jobs", icon: LayoutDashboard, badge: finalPendingJobs.length > 0 ? finalPendingJobs.length : undefined },
            { id: 'schedule', label: 'Schedule', icon: Calendar, badge: totalPending > 0 ? totalPending : undefined, badgeDanger: true },
            { id: 'history', label: 'History', icon: ClipboardList },
            { id: 'inventory', label: 'Inventory', icon: Package },
            { id: 'settings', label: 'Settings', icon: Settings },
        ];
    };

    const sidebarNavItems = getTabsForRole();

    const handleToggleNotifSound = () => {
        const next = !notifSound;
        setNotifSound(next);
        localStorage.setItem('autospf_notif_sound', next ? 'on' : 'off');
        toast.success(next ? 'Notification sounds enabled' : 'Notification sounds muted');
    };

    const userInitials = (user?.name || 'S')
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    const roleLabel = (user?.role || 'service_staff').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

    const scheduleItems = safeJobs.map((j) => ({
        time: j.time || j.bookingTime || '—',
        customer: j.customer?.name || j.customerName || 'Customer',
        status: j.status?.toUpperCase?.() || 'PENDING',
        vehicle: j.vehicleInfo || (j.vehicleMake ? `${j.vehicleMake} ${j.vehicleModel}` : undefined),
        service: j.serviceName,
        rawDate: j.date || j.bookingDate || j.createdAt,
        id: getJobId(j)
    }));

    const isTodayBooking = (value?: string) => {
        if (!value) return false;
        const d = new Date(value);
        if (isNaN(d.getTime())) return false;
        const today = new Date();
        return d.toDateString() === today.toDateString();
    };

    if (isLoading) {
        return (
            <div className={`detailer-shell detailer-root${isDark ? ' dark' : ' light-mode'}`}>
                <div className="detailer-layout">
                    {/* Skeleton Sidebar */}
                    <aside className="detailer-sidebar">
                        <div className="sidebar-user-card">
                            <div className="skeleton" style={{ width: 42, height: 42, borderRadius: 12 }} />
                            <div style={{ flex: 1 }}>
                                <div className="skeleton skeleton-line w-80 h-4" style={{ marginBottom: 6 }} />
                                <div className="skeleton skeleton-line w-40" />
                            </div>
                        </div>
                        <div className="sidebar-nav">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="skeleton" style={{ height: 38, borderRadius: 10, marginBottom: 4 }} />
                            ))}
                        </div>
                    </aside>
                    {/* Skeleton Content */}
                    <div className="detailer-main-area">
                        <div className="detailer-header">
                            <div className="detailer-header-content">
                                <div className="detailer-header-left">
                                    <div className="skeleton skeleton-line h-6 w-60" style={{ marginBottom: 8 }} />
                                    <div className="skeleton skeleton-line h-4 w-40" />
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '24px 24px 32px' }}>
                            <div className="kpi-grid" style={{ marginBottom: 24 }}>
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="skeleton skeleton-card" style={{ height: 94 }} />
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
                                <div className="skeleton" style={{ height: 320, borderRadius: 16 }} />
                                <div className="skeleton" style={{ height: 320, borderRadius: 16 }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* ── QC FULL-TAKEOVER LAYOUT ── */
    if (activeTab === 'qc_review') {
        return (
            <div className={`detailer-shell detailer-root${isDark ? ' dark' : ' light-mode'}`}>
                <QCDashboardPanel />

                {warrantyReceiptJob && (
                    <WarrantyReceiptModal
                        job={warrantyReceiptJob}
                        onClose={() => setWarrantyReceiptJob(null)}
                        onSubmit={submitWarrantyReceipt}
                    />
                )}
                <AnimatePresence>
                    {workflowJob && (
                        <WorkflowOrchestrator
                            order={workflowJob}
                            onClose={() => { setWorkflowJob(null); loadData(); }}
                            onOrderUpdated={(updated) => {
                                setJobs(prev => prev.map(j => (getJobId(j) === getJobId(updated)) ? { ...j, ...updated } : j));
                            }}
                        />
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className={`detailer-shell detailer-root${isDark ? ' dark' : ' light-mode'}`}>
            <div className="detailer-layout">

                {/* ── Mobile Hamburger ── */}
                <button className="sidebar-mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    {sidebarOpen ? <X style={{ width: 18, height: 18 }} /> : <Menu style={{ width: 18, height: 18 }} />}
                </button>
                {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

                {/* ══════════ SIDEBAR ══════════ */}
                <aside className={`detailer-sidebar${sidebarCollapsed ? ' collapsed' : ''}${sidebarOpen ? ' open' : ''}`}>
                    {/* Brand + User Combined */}
                    <div className="sidebar-brand" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="sidebar-brand-text">
                            <span className="sidebar-brand-name">AutoSPF+</span>
                            <span className="sidebar-brand-sub" style={{ fontSize: 10, opacity: 0.5 }}>{user?.name || 'Service Staff'} · {roleLabel}</span>
                        </div>
                        <motion.button
                            className="sidebar-collapse-btn"
                            onClick={toggleSidebar}
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {sidebarCollapsed ? <ChevronRight style={{ width: 16, height: 16 }} strokeWidth={2.5} /> : <ChevronLeft style={{ width: 16, height: 16 }} strokeWidth={2.5} />}
                        </motion.button>
                    </div>

                    {/* Navigation */}
                    <nav className="sidebar-nav">
                        <div className="sidebar-nav-label">Workspace</div>
                        {sidebarNavItems.map((item) => (
                            <motion.button
                                key={item.id}
                                className={`sidebar-nav-item${activeTab === item.id ? ' active' : ''}`}
                                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                                whileHover={{ x: sidebarCollapsed ? 0 : 4 }}
                                whileTap={{ scale: 0.97 }}
                                title={sidebarCollapsed ? item.label : undefined}
                            >
                                <item.icon className="sidebar-nav-icon" />
                                <span className="nav-label">{item.label}</span>
                                {item.badge && <span className={`sidebar-nav-badge ${item.badgeDanger ? 'danger' : ''}`}>{item.badge}</span>}
                            </motion.button>
                        ))}
                    </nav>

                    {/* Sidebar Footer */}
                    <div className="sidebar-footer">
                        <motion.button className="sidebar-nav-item danger" onClick={handleLogout} whileHover={{ x: 4 }} whileTap={{ scale: 0.97 }}>
                            <LogOut className="sidebar-nav-icon" />
                            <span className="nav-label">Sign Out</span>
                        </motion.button>
                    </div>
                </aside>

                {/* ══════════ MAIN AREA ══════════ */}
                <div className={`detailer-main-area${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
                    {/* Header */}
                    <header className="detailer-header">
                        <div className="detailer-header-content">
                            <div className="detailer-header-left">
                                <h1 className="title">Detailing Portal</h1>
                                <p className="subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            </div>
                            <div className="detailer-header-actions">
                                {activeJob && (
                                    <motion.div className="detailer-badge live" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
                                        <span className="pulse-dot" />
                                        <Timer style={{ width: 12, height: 12 }} />
                                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700 }}>{formatElapsedTime(elapsedTime)}</span>
                                    </motion.div>
                                )}
                                {/* Notifications */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <motion.button className="btn-premium" style={{ position: 'relative', padding: '8px 10px' }} whileHover={btnHover} whileTap={btnTap}>
                                            <Bell style={{ width: 16, height: 16 }} />
                                            {unreadNotificationsCount > 0 && (
                                                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }} style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}>
                                                    {unreadNotificationsCount}
                                                </motion.span>
                                            )}
                                        </motion.button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-0" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
                                            {unreadNotificationsCount > 0 && <button onClick={handleMarkAllRead} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark all read</button>}
                                        </div>
                                        <div style={{ maxHeight: 280, overflowY: 'auto', padding: 8 }}>
                                            {notifications.length === 0 ? (
                                                <p style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No notifications</p>
                                            ) : (
                                                notifications.slice(0, 8).map((n) => (
                                                    <motion.div key={n._id || n.id} onClick={() => !n.isRead && handleMarkAsRead(n._id || n.id)} whileHover={{ backgroundColor: 'var(--surface-hover)' }} style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', opacity: n.isRead ? 0.5 : 1, marginBottom: 2 }}>
                                                        <p style={{ fontSize: 12, fontWeight: n.isRead ? 400 : 600, color: 'var(--text)', margin: 0 }}>{n.title}</p>
                                                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{n.message?.slice(0, 60)}</p>
                                                    </motion.div>
                                                ))
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </header>

                    {/* ── Tab Content ── */}
                    <div className="detailer-content">
                        <AnimatePresence mode="wait">
                            {/* ── PRIMARY 4-TAB ROUTING ── */}
                            {activeTab === 'dashboard' && (
                                <DashboardTab
                                    activeJob={activeJob}
                                    safeJobs={safeJobs}
                                    finalPendingJobs={finalPendingJobs}
                                    completedToday={completedToday}
                                    hoursLogged={hoursLogged}
                                    inventory={inventory}
                                    inventoryThreshold={inventoryThreshold}
                                    inventoryUsage={inventoryUsage}
                                    elapsedTime={elapsedTime}
                                    isChecklistComplete={isChecklistComplete}
                                    isCompleting={isCompleting}
                                    userName={user?.name}
                                    setActiveTab={(tab: string) => setActiveTab(tab as TabType)}
                                    handleStartJob={handleStartJob}
                                    handleCompleteJob={handleCompleteJob}
                                    handleForceReady={handleForceReady}
                                    handleToggleChecklist={handleToggleChecklist}
                                    handleToggleOperationsChecklist={handleToggleOperationsChecklist}
                                />
                            )}

                            {activeTab === 'history' && (
                                <HistoryTab
                                    completedJobs={safeJobs.filter(j => j.status === 'completed' || j.status === 'released' || j.status === 'paid' || j.status === 'cancelled')}
                                />
                            )}

                            {activeTab === 'inventory' && (
                                <InventoryTab
                                    inventory={inventory}
                                    inventoryThreshold={inventoryThreshold}
                                    inventoryUsage={inventoryUsage}
                                    activeJob={activeJob}
                                    showUsageModal={showUsageModal}
                                    setShowUsageModal={setShowUsageModal}
                                    selectedItem={selectedItem}
                                    setSelectedItem={setSelectedItem}
                                    usageQuantity={usageQuantity}
                                    setUsageQuantity={setUsageQuantity}
                                    handleLogUsage={handleLogUsage}
                                    SERVICE_USAGE_SUGGESTIONS={SERVICE_USAGE_SUGGESTIONS}
                                    findInventoryItemByNames={findInventoryItemByNames}
                                />
                            )}

                            {activeTab === 'settings' && (
                                <SettingsTab
                                    user={user}
                                    roleLabel={roleLabel}
                                    notifSound={notifSound}
                                    handleToggleNotifSound={handleToggleNotifSound}
                                    sidebarCollapsed={sidebarCollapsed}
                                    toggleSidebar={toggleSidebar}
                                />
                            )}

                            {/* ── INTERNAL ROUTES (accessible via inline buttons) ── */}
                            {activeTab === 'queue' && (
                                <QueueTab
                                    finalPendingJobs={finalPendingJobs}
                                    activeJob={activeJob}
                                    elapsedTime={elapsedTime}
                                    isChecklistComplete={isChecklistComplete}
                                    isCompleting={isCompleting}
                                    handleStartJob={handleStartJob}
                                    handleCompleteJob={handleCompleteJob}
                                    handleForceReady={handleForceReady}
                                    handleToggleChecklist={handleToggleChecklist}
                                    handleToggleOperationsChecklist={handleToggleOperationsChecklist}
                                />
                            )}

                            {activeTab === 'schedule' && (
                                <ScheduleTab scheduleItems={scheduleItems} />
                            )}

                            {activeTab === 'records' && (
                                <ServiceRecordsTab activeJob={activeJob} />
                            )}

                            {activeTab === 'progress' && (
                                <ProgressReportsTab
                                    activeJob={activeJob}
                                    handleStartJob={handleStartJob}
                                    handleCompleteJob={handleCompleteJob}
                                    handleForceReady={handleForceReady}
                                    handleToggleChecklist={handleToggleChecklist}
                                    handleToggleOperationsChecklist={handleToggleOperationsChecklist}
                                    isChecklistComplete={isChecklistComplete}
                                    isCompleting={isCompleting}
                                />
                            )}

                            {activeTab === 'activity' && (
                                <ActivityLogsTab />
                            )}

                            {activeTab === 'photos' && (
                                <PhotosTab activeJob={activeJob} />
                            )}

                            {activeTab === 'notes' && (
                                <NotesTab
                                    activeJob={activeJob}
                                    newNote={newNote}
                                    setNewNote={setNewNote}
                                    handleSaveNote={handleSaveNote}
                                    customerNotes={customerNotes}
                                />
                            )}

                            {/* ── Quality Checker: POS / Receipts panel ── */}
                            {activeTab === 'pos' && (
                                <div className="flex flex-col items-center justify-center h-64 text-center">
                                    <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
                                        <span className="text-2xl">🧾</span>
                                    </div>
                                    <p className="font-semibold text-slate-700">POS has moved</p>
                                    <p className="text-sm text-slate-500 mt-1">The Point of Sale module is now exclusively available in the Sales Staff dashboard.</p>
                                </div>
                            )}

                            {/* ── Technician: Voice Assistant panel ── */}
                            {activeTab === 'voice_assistant' && (
                                <motion.div key="voice_assistant" variants={pageVariants} initial="initial" animate="animate" exit="exit"
                                    style={{ padding: '32px 24px' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Mic style={{ width: 22, height: 22, color: '#fff' }} />
                                        </div>
                                        <div>
                                            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Voice-Activated Assistant</h2>
                                            <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>Hands-free job updates, inventory checks, and task progress</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        {[
                                            { icon: Mic, label: 'Hands-Free Job Updates', desc: 'Dictate job status transitions without touching the screen.' },
                                            { icon: Package, label: 'Voice Inventory Check', desc: 'Ask stock levels and log chemical usage by voice.' },
                                            { icon: CheckCircle, label: 'Task Progress Reporting', desc: 'Mark checklist items and complete stages via voice commands.' },
                                            { icon: Bell, label: 'Next Job Notifications', desc: 'Receive spoken alerts when a new job is assigned to you.' },
                                        ].map(({ icon: Icon, label, desc }) => (
                                            <div key={label} style={{ padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <Icon style={{ width: 18, height: 18, color: '#8b5cf6' }} />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{label}</div>
                                                    <div style={{ fontSize: 12, opacity: 0.55 }}>{desc}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {/* ── Technician: AI Damage Detection & AR panel ── */}
                            {activeTab === 'ai_damage_detection' && (
                                <motion.div
                                    key="ai_damage_detection"
                                    variants={pageVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    style={{ background: '#000', borderRadius: 16, overflow: 'hidden' }}
                                >
                                    <AIEstimatorEmbed />
                                </motion.div>
                            )}


                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {warrantyReceiptJob && (
                <WarrantyReceiptModal
                    job={warrantyReceiptJob}
                    onClose={() => setWarrantyReceiptJob(null)}
                    onSubmit={submitWarrantyReceipt}
                />
            )}

            {/* ═══ WORKFLOW OVERLAY ═══ */}
            <AnimatePresence>
                {workflowJob && (
                    <WorkflowOrchestrator
                        order={workflowJob}
                        onClose={() => { setWorkflowJob(null); loadData(); }}
                        onOrderUpdated={(updated) => {
                            setJobs(prev => prev.map(j => (getJobId(j) === getJobId(updated)) ? { ...j, ...updated } : j));
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

