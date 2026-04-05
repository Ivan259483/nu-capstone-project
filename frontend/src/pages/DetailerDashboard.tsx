import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
    LogOut, ClipboardList, Calendar, Package, Camera, MessageSquare,
    Clock, CheckCircle, Play, AlertTriangle, Plus, Bell, Activity,
    Mic, Zap, Timer, Gauge, Wifi, TrendingUp, BarChart3, Sparkles,
    ChevronRight, ChevronLeft, Eye, Settings, Menu, X, LayoutDashboard, User,
    Shield, Volume2, Info, Hash, Sun, Moon, BadgeHelp
} from 'lucide-react';
import { DashboardTab } from '@/components/staff/DashboardTab';
import { QueueTab } from '@/components/staff/QueueTab';
import { ScheduleTab } from '@/components/staff/ScheduleTab';
import { InventoryTab } from '@/components/staff/InventoryTab';
import { PhotosTab } from '@/components/staff/PhotosTab';
import { NotesTab } from '@/components/staff/NotesTab';
import { SettingsTab } from '@/components/staff/SettingsTab';
import { ServiceRequestsTab } from '@/components/staff/ServiceRequestsTab';
import { CustomerDetailsTab } from '@/components/staff/CustomerDetailsTab';
import { ActivityLogsTab } from '@/components/staff/ActivityLogsTab';
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
import { jobStorage, inventoryStorage, inventoryUsageStorage, customerNoteStorage } from '@/lib/storage';
import { InventoryService } from '@/lib/inventory-service-api';
import { OrderService } from '@/lib/order-service';
import { ActivityService } from '@/lib/activity-service-api';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';
import InspectionCapture from '@/components/InspectionCapture';
import api from '@/lib/api';
import { SERVICE_STAFF_ROLE } from '@/lib/roles';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import type { Booking, InventoryItem, InventoryUsage, CustomerNote } from '@/types';
import './DetailerDashboard.css';

type TabType = 'dashboard' | 'queue' | 'schedule' | 'inventory' | 'requests' | 'customers' | 'activity' | 'photos' | 'notes' | 'settings';

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
        const inferredStatus = paymentStatus === 'paid' ? 'in-progress' : undefined;
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





    const validTabs: TabType[] = ['dashboard', 'queue', 'schedule', 'inventory', 'requests', 'customers', 'activity', 'photos', 'notes', 'settings'];
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        const hash = window.location.hash.replace('#', '');
        return validTabs.includes(hash as TabType) ? (hash as TabType) : 'dashboard';
    });
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('autospf_sidebar_collapsed') === 'true');
    const [notifSound, setNotifSound] = useState(() => localStorage.getItem('autospf_notif_sound') !== 'off');
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

    const loadData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);

        try {
            const response = await OrderService.getDetailerOrders();
            if (response.success && Array.isArray(response.data)) {
                setJobs(response.data.map(ensureWaiverSigned));

                // Check for active job start time (derived from status)
                const activeJob = response.data.find((j: Booking) => j.status === 'in-progress' || j.status === 'processing');
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
            setCustomerNotes(customerNoteStorage.getAll());

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

    // Emergency Refresh Listener - IMMEDIATE SYNC
    useEffect(() => {
        const handleEmergencyRefresh = () => {
            console.log('🔄 IMMEDIATE SYNC: Storage event detected, forcing re-render');
            // Force immediate re-render by updating trigger state
            setStorageUpdateTrigger(prev => prev + 1);
            // Also reload data
            loadData();
        };

        window.addEventListener('storage', handleEmergencyRefresh);
        window.addEventListener('local-booking-update', handleEmergencyRefresh);

        return () => {
            window.removeEventListener('storage', handleEmergencyRefresh);
            window.removeEventListener('local-booking-update', handleEmergencyRefresh);
        };
    }, [loadData]);

    useEffect(() => {
        if (!user || user.role !== SERVICE_STAFF_ROLE) {
            navigate('/');
            return;
        }

        // REAL-TIME LISTENER (Replaces Polling)
        const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const liveJobs: Booking[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Booking));

            // Client-side filtering for detailer scope (optional, or rely on backend for heavy lifting)
            // For now, we sync ALL bookings to ensure instant updates, then filter in render
            setJobs(liveJobs.map(ensureWaiverSigned));

            // Also check for active job start time
            const activeJob = liveJobs.find((j: Booking) => j.status === 'in-progress' || j.status === 'processing');
            if (activeJob) {
                setActiveJobStartTime(prev => prev || Date.now());
            }

            console.log('🔥 Detailer Dashboard: Real-time update received', liveJobs.length);
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
            // BYPASS INSPECTION FOR DEMO - FORCE START
            const jobId = getJobId(job);
            if (!jobId) {
                toast.error('Missing job identifier.');
                return false;
            }
            const normalizedJobId = normalizeBookingId(jobId);

            // OPTIMISTIC UPDATE (Immediate UI Feedback)
            const updatedJobs = jobs.map(j =>
                getJobId(j) === jobId ? { ...j, status: 'in-progress' as const } : j
            );
            setJobs(updatedJobs);
            setActiveJobStartTime(Date.now());
            dispatchStorageSync();
            console.log('🚀 Job started optimistically:', jobId);

            // ATOMIC FIRESTORE UPDATE (Critical for Live Tracking)
            if (normalizedJobId && db) {
                try {
                    await setDoc(doc(db, 'bookings', normalizedJobId), {
                        status: 'in-progress',
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    console.log('✅ Atomic Firestore Update: in-progress');
                } catch (err) {
                    console.error('🔥 Firestore Update Failed:', err);
                    toast.error('Network error: Could not sync status to live tracking.');
                }
            }

            try {
                // Backend Sync
                const response = await OrderService.updateOrder(jobId, { status: 'in-progress' });
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

    const handleCompleteJob = async (job: Booking) => {
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

        const activeJob = safeJobs.find(j => j.status === 'in-progress' || j.status === 'processing');

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

        const activeJob = safeJobs.find(j => j.status === 'in-progress' || j.status === 'processing');

        const noteContent = newNote;
        
        if (activeJob && (activeJob.id || activeJob._id)) {
            try {
                const jobId = activeJob.id || activeJob._id;
                const existingNotes = activeJob.notes ? activeJob.notes + "\n\n" : "";
                const updatedNotes = existingNotes + `[${new Date().toLocaleString()}] By ${user.name || user.email}:\n${noteContent}`;
                
                await OrderService.updateOrder(jobId, { notes: updatedNotes });
            } catch (error) {
                console.error("Failed to sync note to backend:", error);
            }
        }

        const note: CustomerNote = {
            id: `note-${Date.now()}`,
            jobId: activeJob?.id || activeJob?._id || 'general',
            detailerId: user.id,
            content: noteContent,
            createdAt: new Date().toISOString(),
        };

        customerNoteStorage.add(note);
        
        try {
            await ActivityService.createActivityLog(
                'status_change',
                'Notes Updated',
                `Added a new note for job ${activeJob?.id || activeJob?._id || 'general'}`,
                user?.id || 'unknown',
                user?.name || user?.email || 'Detailer',
                { jobId: activeJob?.id || activeJob?._id || 'general' },
                { module: 'Service', action: 'add_note', status: 'success' }
            );
        } catch (e) {
            console.error('Failed to log activity', e);
        }

        loadData();
        setNewNote('');
        toast.success('Note saved!');
    };

    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const activeJobRaw = safeJobs.find(j => j.status === 'in-progress') || safeJobs.find(j => j.status === 'processing');

    const activeJob = activeJobRaw;
    const isChecklistComplete = !!activeJob?.serviceSteps?.length &&
        activeJob.serviceSteps.every(step => step.status === 'completed');

    const pendingJobs = safeJobs.filter(j =>
        j.status === 'pending'
        || j.status === 'assigned'
        || j.status === 'in-progress'
        || j.customerStatus === 'received'
        || j.customerStatus === 'washing'
        || j.customerStatus === 'detailing'
    );
    const finalPendingJobs = pendingJobs.filter(j =>
        activeTab === 'queue' ? (j.status !== 'completed' && j.status !== 'cancelled') : true
    );
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
    const sidebarNavItems = [
        { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'queue' as TabType, label: 'Job Queue', icon: ClipboardList, badge: finalPendingJobs.length > 0 ? finalPendingJobs.length : undefined },
        { id: 'schedule' as TabType, label: 'Schedule', icon: Calendar },
        { id: 'inventory' as TabType, label: 'Inventory', icon: Package },
        { id: 'requests' as TabType, label: 'Requests', icon: BadgeHelp },
        { id: 'customers' as TabType, label: 'Customers', icon: User },
        { id: 'activity' as TabType, label: 'Activity Logs', icon: Activity },
        { id: 'photos' as TabType, label: 'Photos', icon: Camera },
        { id: 'notes' as TabType, label: 'Notes', icon: MessageSquare },
        { id: 'settings' as TabType, label: 'Settings', icon: Settings },
    ];

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
        time: j.time || '—',
        customer: j.customer?.name || j.customerName || 'Customer',
        status: j.status?.toUpperCase?.() || 'PENDING',
        vehicle: j.vehicleInfo,
        service: j.serviceName,
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
            <div className="detailer-shell detailer-root">
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

    return (
        <div className={`detailer-shell detailer-root${document.documentElement.classList.contains('light') ? ' light-mode' : ''}`}>
            <div className="detailer-layout">

                {/* ── Mobile Hamburger ── */}
                <button className="sidebar-mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    {sidebarOpen ? <X style={{ width: 18, height: 18 }} /> : <Menu style={{ width: 18, height: 18 }} />}
                </button>
                {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

                {/* ══════════ SIDEBAR ══════════ */}
                <aside className={`detailer-sidebar${sidebarCollapsed ? ' collapsed' : ''}${sidebarOpen ? ' open' : ''}`}>
                    {/* Brand */}
                    <div className="sidebar-brand" style={{ position: 'relative' }}>
                        <motion.div className="sidebar-brand-logo" whileHover={{ rotate: -8, scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            <Zap style={{ width: 18, height: 18, color: '#fff' }} />
                        </motion.div>
                        <div className="sidebar-brand-text">
                            <span className="sidebar-brand-name">AutoSPF+</span>
                            <span className="sidebar-brand-sub">Service Portal</span>
                        </div>
                        <motion.button
                            className="sidebar-collapse-btn"
                            onClick={toggleSidebar}
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {sidebarCollapsed ? <ChevronRight style={{ width: 12, height: 12 }} /> : <ChevronLeft style={{ width: 12, height: 12 }} />}
                        </motion.button>
                    </div>

                    {/* User Card */}
                    <div className="sidebar-user-card">
                        <motion.div className="sidebar-avatar" whileHover={{ scale: 1.08 }}>{userInitials}</motion.div>
                        <div className="sidebar-user-info">
                            <div className="sidebar-user-name">{user?.name || 'Service Staff'}</div>
                            <div className="sidebar-user-role">{roleLabel}</div>
                        </div>
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
                                {item.badge && <span className="sidebar-nav-badge">{item.badge}</span>}
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
                                <h1 className="title">{sidebarNavItems.find(i => i.id === activeTab)?.label || 'Dashboard'}</h1>
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
                            {activeTab === 'dashboard' && (
                                <DashboardTab 
                                    activeJob={activeJob}
                                    safeJobs={safeJobs}
                                    finalPendingJobs={finalPendingJobs}
                                    completedToday={completedToday}
                                    hoursLogged={hoursLogged}
                                    inventory={inventory}
                                    inventoryThreshold={inventoryThreshold}
                                    elapsedTime={elapsedTime}
                                    isChecklistComplete={isChecklistComplete}
                                    isCompleting={isCompleting}
                                    setActiveTab={(tab: string) => setActiveTab(tab as TabType)}
                                    handleStartJob={handleStartJob}
                                    handleCompleteJob={handleCompleteJob}
                                    handleForceReady={handleForceReady}
                                    handleToggleChecklist={handleToggleChecklist}
                                />
                            )}

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
                                />
                            )}

                            {activeTab === 'schedule' && (
                                <ScheduleTab scheduleItems={scheduleItems} />
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
                            
                            {activeTab === 'requests' && (
                                <ServiceRequestsTab />
                            )}
                            
                            {activeTab === 'customers' && (
                                <CustomerDetailsTab />
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
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}

