import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import './AdminDashboard.css';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LogOut, Package, Users, ShoppingCart, PhilippinePeso, Activity, Settings,
    Plus, Search, AlertTriangle, Bell, Trash2, Edit, Send, CheckCircle,
    Clock, FileText, ClipboardList, Sun, Moon, Volume2, ShieldCheck, Eye, EyeOff, BarChart,
    ChevronDown,
    X,
    Filter,
    Camera,
    Image as ImageIcon,
    Calendar, User as UserIcon,
    ChevronLeft, ChevronRight, List,
    LayoutTemplate, ArrowUp, ArrowDown, Download, LayoutGrid,
    RefreshCw, MapPin, Truck, Mail, Phone, Monitor, Menu, BadgeCheck, Play, Car, Zap,
    ExternalLink, Sparkles, MoreHorizontal, Tag, Save, DollarSign
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow } from 'date-fns';
import { io, Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { createSecondaryUser } from '@/config/firebase';
import {
    inventoryStorage, supplierStorage, serviceStorage,
    activityLogStorage, settingsStorage
} from '@/lib/storage';
import { OrderService } from '@/lib/order-service';
import { UserService } from '@/lib/user-service';
import { SupplierService } from '@/lib/supplier-service';
import { InventoryService } from '@/lib/inventory-service-api';
import { DetailService } from '@/lib/detail-service-api';
import { AIEstimatorEmbed } from '@/pages/AIEstimatorPage';
import { PaymentService } from '@/lib/payment-service';
import { SystemService } from '@/lib/system-service';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';
import { SettingsService } from '@/lib/settings-service';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { SmartCalendar } from '@/components/admin/SmartCalendar';
import LandingPageEditor from '@/components/admin/LandingPageEditor';
import { POSSystem } from '@/components/admin/POSSystem';
import { ActivityLogs } from '@/components/admin/ActivityLogs';
import { ServicesPricing } from '@/components/admin/ServicesPricing';
import { SupplierManagement } from '@/components/admin/SupplierManagement';
import { UserManagementPanel } from '@/components/admin/UserManagementPanel';
import { WaiversDocs } from '@/components/admin/WaiversDocs';
import { CheckInDialog } from '@/components/admin/CheckInDialog';
import { ActivityService } from '@/lib/activity-service-api';
import { formatCurrency } from '@/lib/utils';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import {
    FULL_ADMIN_ROLES,
    SERVICE_STAFF_ROLE,
    getRoleLabel,
    getSafeUserRole,
    isAdminDashboardRole,
    isBookingManagerRole,
    isInventoryManagerRole,
    isPosManagerRole,
    isReportingRole,
    isServiceCatalogRole,
    isSettingsManagerRole,
    isStaffManagerRole,
    isSupplierManagerRole,
    isSupplierViewRole,
    isWaiverAccessRole,
    isAppointmentViewRole,
    isUserRegistrationRole,
    isAIEstimatorRole,
} from '@/lib/roles';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { InventoryItem, User, Supplier, Service, ActivityLog, BusinessSettings, Booking } from '@/types';

function CountUp({ end, duration = 2, prefix = '', suffix = '' }: { end: number, duration?: number, prefix?: string, suffix?: string }) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime: number;
        let animationFrame: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / (duration * 1000), 1);

            // easeOutExpo
            const easeOut = percentage === 1 ? 1 : 1 - Math.pow(2, -10 * percentage);

            setCount(end * easeOut);

            if (percentage < 1) {
                animationFrame = requestAnimationFrame(animate);
            }
        };

        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [end, duration]);

    return <span>{prefix}{Math.floor(count).toLocaleString()}{suffix}</span>;
}

const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } }
};

const staggerContainer = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const staggerItem = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } }
};

const modalSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30
};

type TabType =
    | 'inventory'
    | 'users'
    | 'suppliers'
    | 'pricing'
    | 'activity'
    | 'settings'
    | 'bookings'
    | 'pos'
    | 'appointments'
    | 'waivers'
    | 'ai_estimator'
    | 'profile'
    | 'landing';

import { getBackendSocketUrl } from '@/lib/api';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const { user, logout, updateUser } = useAuth();
    const isAdmin = isAdminDashboardRole(user?.role);
    const canAccessUsers = isStaffManagerRole(user?.role);
    const canAccessBookings = isBookingManagerRole(user?.role);
    const canAccessReports = isReportingRole(user?.role);
    const canAccessInventory = isInventoryManagerRole(user?.role);
    const canAccessPOS = isPosManagerRole(user?.role);
    const canAccessSettings = isSettingsManagerRole(user?.role);
    const canAccessPricing = isServiceCatalogRole(user?.role);
    const canAccessSupplierModule = isSupplierManagerRole(user?.role);
    const canViewSupplierData = isSupplierViewRole(user?.role);
    const canAccessLanding = FULL_ADMIN_ROLES.includes(getSafeUserRole(user?.role));
    const canAccessWaivers = isWaiverAccessRole(user?.role);
    const canAccessAppointments = isAppointmentViewRole(user?.role);
    const canRegisterUsers = isUserRegistrationRole(user?.role);
    const canAccessAIEstimator = isAIEstimatorRole(user?.role);
    const needsUserDirectory = canAccessUsers || canAccessBookings || canAccessPOS || canRegisterUsers;
    const needsServiceCatalogData = canAccessPricing || canAccessPOS;
    const needsBookingsData = canAccessBookings || canAccessPOS || canAccessAppointments;
    const needsAnalyticsData = canAccessBookings || canAccessPOS;

    // Realtime Database Sync
    // Refs to avoid putting functions directly in deps and causing cycles.
    const loadDataRef = useRef<(() => void) | null>(null);
    const fetchBookingsRef = useRef<(() => void) | null>(null);
    useRealtimeSync(
        ['orders', 'users', 'suppliers', 'categories', 'services', 'settings', 'notifications', 'products', 'activitylogs'],
        useCallback((collection: string) => {
            // Short debounce to prevent a spike of fetches if 10 rows update at once
            if (collection === 'orders') {
                // Bookings live in a separate state — refresh them immediately
                setTimeout(() => fetchBookingsRef.current && fetchBookingsRef.current(), 300);
            }
            if (loadDataRef.current) {
                setTimeout(() => loadDataRef.current && loadDataRef.current(), 500);
            }
        }, [])
    );

    // Theme State
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const globalTheme = localStorage.getItem('autospf_global_theme');
        if (globalTheme === 'light' || globalTheme === 'dark') return globalTheme;
        const stored = localStorage.getItem('autospf_theme');
        if (stored === 'light' || stored === 'dark') return stored;
        return 'dark';
    });
    const isDarkMode = theme === 'dark';

    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('light', theme === 'light');
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('autospf_theme', theme);
        localStorage.setItem('autospf_global_theme', theme);
        document.documentElement.style.colorScheme = theme;
    }, [theme]);



    const validTabs: TabType[] = ['inventory', 'users', 'suppliers', 'pricing', 'activity', 'settings', 'bookings', 'pos', 'appointments', 'waivers', 'ai_estimator', 'profile', 'landing'];
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        const hash = window.location.hash.replace('#', '');
        return validTabs.includes(hash as TabType) ? (hash as TabType) : 'inventory';
    });

    useEffect(() => {
        window.location.hash = activeTab;
    }, [activeTab]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);
    const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
    const [settings, setSettings] = useState<BusinessSettings | null>(null);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [totalSales, setTotalSales] = useState(0);
    const socketRef = useRef<Socket | null>(null);

    // Dynamic Analytics State
    const [dashboardStats, setDashboardStats] = useState({
        totalSales: 0,
        growth: 0,
        activeCount: 0
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [speechSupported, setSpeechSupported] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setSpeechSupported('speechSynthesis' in window);
    }, []);

    // Booking Assignment
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showCheckInModal, setShowCheckInModal] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [isBookingDetailOpen, setIsBookingDetailOpen] = useState(false);
    const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
    const [selectedDetailerId, setSelectedDetailerId] = useState('');
    const [operationalAction, setOperationalAction] = useState('assigned');

    // Bookings View States
    const [bookingsView, setBookingsView] = useState<'calendar' | 'list'>('calendar');
    const [bookingsFilter, setBookingsFilter] = useState<'all' | 'pending' | 'active' | 'done'>('all');
    const [selectedBookingsPanelId, setSelectedBookingsPanelId] = useState<string | null>(null);

    // Schedule Edit Modal
    const [isEditScheduleOpen, setIsEditScheduleOpen] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [bookedSlots, setBookedSlots] = useState<string[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);

    // Inventory Modal
    const [showInventoryModal, setShowInventoryModal] = useState(false);
    const [isEditingInventory, setIsEditingInventory] = useState(false);
    const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
    const [itemName, setItemName] = useState('');
    const [itemCategory, setItemCategory] = useState('');
    const [itemQuantity, setItemQuantity] = useState('');
    const [itemUnit, setItemUnit] = useState('');
    const [itemMinLevel, setItemMinLevel] = useState('');
    const [itemMaxLevel, setItemMaxLevel] = useState('');
    const [itemSku, setItemSku] = useState('');
    const [itemCost, setItemCost] = useState('');
    const [itemSupplier, setItemSupplier] = useState('');
    const [itemCategoryFilter, setItemCategoryFilter] = useState('All Category');
    const [itemStatusFilter, setItemStatusFilter] = useState<'All' | 'Optimal' | 'Warning' | 'Critical' | 'Out of Stock'>('All');
    const [selectedInventoryItems, setSelectedInventoryItems] = useState<string[]>([]);

    // Restock Modal
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [restockItemId, setRestockItemId] = useState<string | null>(null);
    const [restockQuantity, setRestockQuantity] = useState('');

    // Bulk Stock Modal
    const [showBulkStockModal, setShowBulkStockModal] = useState(false);
    const [bulkRestockQuantity, setBulkRestockQuantity] = useState('');

    // Supplier Details Modal
    const [showSupplierDetailsModal, setShowSupplierDetailsModal] = useState(false);
    const [selectedSupplierDetails, setSelectedSupplierDetails] = useState<Supplier | null>(null);


    // User Modal (State logic moved to UserManagementPanel)    // Supplier Modal
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [isEditingSupplier, setIsEditingSupplier] = useState(false);
    const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
    const [supplierName, setSupplierName] = useState('');
    const [supplierContact, setSupplierContact] = useState('');
    const [supplierEmail, setSupplierEmail] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [supplierProducts, setSupplierProducts] = useState('');



    // Service Modal
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [isEditingService, setIsEditingService] = useState(false);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
    const [serviceName, setServiceName] = useState('');
    const [serviceCategory, setServiceCategory] = useState('');
    const [serviceDuration, setServiceDuration] = useState('');
    const [servicePrice, setServicePrice] = useState('');

    // Supplier Order Modal
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [selectedSupplierForOrder, setSelectedSupplierForOrder] = useState<Supplier | null>(null);

    // Danger Zone Modal
    const [showDangerModal, setShowDangerModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'inventory' | 'user' | 'supplier' | 'service'; name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    // System Management
    const [showResetModal, setShowResetModal] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [resetConfirmText, setResetConfirmText] = useState('');

    const isValidDate = (date: any) => {
        if (!date) return false;
        const d = new Date(date);
        return d instanceof Date && !isNaN(d.getTime());
    };

    const [isLoading, setIsLoading] = useState(false);
    const [isCleaningBookings, setIsCleaningBookings] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const [showSignoutModal, setShowSignoutModal] = useState(false);
    const [signoutStep, setSignoutStep] = useState<'confirm' | 'signing_out' | 'success'>('confirm');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    // Close user menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
                setShowUserMenu(false);
            }
        };
        if (showUserMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showUserMenu]);

    // Form States
    const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
    const [profileFirstName, setProfileFirstName] = useState('');
    const [profileLastName, setProfileLastName] = useState('');
    const [profileDisplayName, setProfileDisplayName] = useState('');
    const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
    const [profileNewPassword, setProfileNewPassword] = useState('');
    const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [activeProfileTab, setActiveProfileTab] = useState<'general' | 'security' | 'sessions' | 'activity'>('general');

    useEffect(() => {
        if (user) {
            const parts = user.name ? user.name.split(' ') : [];
            setProfileFirstName(parts[0] || '');
            setProfileLastName(parts.slice(1).join(' ') || '');
            setProfileDisplayName(user.name || '');
            setProfilePhoto(user.avatar || null);
        }
    }, [user]);

    const handleUpdatePersonalInformation = async () => {
        // Prioritize MongoDB _id if available, fallback to id
        const userId = user?._id || (localStorage.getItem('autospf_backend_user') ? JSON.parse(localStorage.getItem('autospf_backend_user')!)._id : null) || user?.id;
        
        if (!userId) return;
        try {
            setIsSavingProfile(true);
            const updatedName = `${profileFirstName} ${profileLastName}`.trim() || profileDisplayName;
            const updatedUser = {
                ...user,
                name: updatedName,
                avatar: profilePhoto
            } as User;
            await updateUser(updatedUser);
            toast.success('Profile updated successfully');
        } catch (error) {
            console.error('Update profile error:', error);
            toast.error('Failed to update profile');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (profileNewPassword !== profileConfirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (!profileCurrentPassword) {
            toast.error('Current password is required');
            return;
        }
        if (profileNewPassword.length < 8) {
            toast.error('New password must be at least 8 characters');
            return;
        }
        try {
            setIsUpdatingPassword(true);
            await UserService.changePassword(profileCurrentPassword, profileNewPassword);
            toast.success('Password updated successfully');
            setProfileCurrentPassword('');
            setProfileNewPassword('');
            setProfileConfirmPassword('');
        } catch (error: any) {
            console.error('Change password error:', error);
            toast.error(error.response?.data?.message || 'Failed to update password');
        } finally {
            setIsUpdatingPassword(false);
        }
    };
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.metaKey && e.key === 'q') {
                e.preventDefault();
                setShowSignoutModal(true);
                setSignoutStep('confirm');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleToggleSidebar = () => {
        setSidebarCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('autospf_sidebar_collapsed', String(next));
            return next;
        });
    };
    const [calendarMonth, setCalendarMonth] = useState(new Date());

    const loadData = useCallback(async () => {
        setActivityLogs(activityLogStorage.getAll());

        try {
            console.log('🔄 [AdminDashboard] Starting data sync...');

            if (isAdmin) {
                if (!canAccessUsers) setUsers([]);
                if (!canViewSupplierData) setSuppliers([]);
                if (!needsServiceCatalogData) setServices([]);
                if (!canAccessInventory) setInventory([]);
                if (!canAccessSettings) setSettings(null);
                if (!canAccessReports) setActivityLogs([]);
                if (!canAccessPOS) {
                    setPayments([]);
                    setTotalSales(0);
                }

                const [usersRes, suppliersRes, servicesRes, productsRes, settingsRes, notifyRes, activityRes, paymentsRes] = await Promise.all([
                    needsUserDirectory ? UserService.getAllUsers().catch(e => {
                        console.error('❌ [AdminDashboard] UserService.getAllUsers() failed:', e);
                        return { success: false, data: [], error: e.message };
                    }) : Promise.resolve({ success: false, data: [] }),
                    canViewSupplierData ? SupplierService.getAllSuppliers().catch(e => {
                        console.error('❌ [AdminDashboard] SupplierService.getAllSuppliers() failed:', e);
                        return { success: false, data: [], error: e.message };
                    }) : Promise.resolve({ success: false, data: [] }),
                    needsServiceCatalogData ? DetailService.getAllServices().catch(e => {
                        console.error('❌ [AdminDashboard] DetailService.getAllServices() failed:', e);
                        return { success: false, data: [], error: e.message };
                    }) : Promise.resolve({ success: false, data: [] }),
                    canAccessInventory ? InventoryService.getAllProducts().catch(e => {
                        console.error('❌ [AdminDashboard] InventoryService.getAllProducts() failed:', e);
                        return { success: false, data: [], error: e.message };
                    }) : Promise.resolve({ success: false, data: [] }),
                    canAccessSettings ? SettingsService.getSettings().catch(e => {
                        console.error('❌ [AdminDashboard] SettingsService.getSettings() failed:', e);
                        return { success: false, data: null, error: e.message };
                    }) : Promise.resolve({ success: false, data: null }),
                    NotificationService.getNotifications().catch(e => {
                        console.error('❌ [AdminDashboard] NotificationService.getNotifications() failed:', e);
                        return { success: false, data: [], unreadCount: 0, error: e.message };
                    }),
                    canAccessReports ? ActivityService.getActivityLogs({ limit: 300 }).catch(e => {
                        console.error('❌ [AdminDashboard] ActivityService.getActivityLogs() failed:', e);
                        return { success: false, data: [], error: e.message };
                    }) : Promise.resolve({ success: false, data: [] }),
                    canAccessPOS ? PaymentService.getAllPayments().catch(e => {
                        console.error('❌ [AdminDashboard] PaymentService.getAllPayments() failed:', e);
                        return { success: false, data: [], totalRevenue: 0, error: e.message };
                    }) : Promise.resolve({ success: false, data: [], totalRevenue: 0 })
                ]);

                console.log('✅ [AdminDashboard] Data fetch completed:', {
                    users: usersRes.success ? 'OK' : 'FAILED',
                    suppliers: suppliersRes.success ? 'OK' : 'FAILED',
                    services: servicesRes.success ? 'OK' : 'FAILED',
                    products: productsRes.success ? 'OK' : 'FAILED',
                    settings: settingsRes.success ? 'OK' : 'FAILED',
                    notifications: notifyRes.success ? 'OK' : 'FAILED',
                    activity: activityRes.success ? 'OK' : 'FAILED',
                    payments: paymentsRes.success ? 'OK' : 'FAILED'
                });

                if (usersRes.success) setUsers(usersRes.data);
                if (suppliersRes.success) setSuppliers(suppliersRes.data);
                if (settingsRes.success) {
                    setSettings(settingsRes.data);
                    // Sync theme from DB if available
                    if (settingsRes.data?.systemTheme && (settingsRes.data.systemTheme === 'light' || settingsRes.data.systemTheme === 'dark')) {
                        setTheme(settingsRes.data.systemTheme);
                    }
                }
                if (notifyRes.success) {
                    setNotifications(notifyRes.data);
                    setUnreadNotificationsCount(notifyRes.unreadCount);
                }
                if (activityRes.success) setActivityLogs(activityRes.data);
                if (paymentsRes.success) {
                    setPayments(paymentsRes.data || []);
                    setTotalSales(Number(paymentsRes.totalRevenue || 0));
                }

                if (productsRes.success) {
                    const mappedProducts: InventoryItem[] = productsRes.data.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        categoryId: typeof p.category === 'object' ? p.category?._id : p.category,
                        category: (typeof p.category === 'object' && p.category !== null) ? (p.category.name || 'Uncategorized') : (p.category || 'Uncategorized'),
                        stock: p.inventory,
                        unit: p.unit || 'units',
                        minLevel: p.minLevel || 5,
                        maxLevel: p.maxLevel,
                        sku: p.sku,
                        cost: p.price,
                        supplierId: typeof p.supplier === 'object' ? p.supplier?._id : p.supplier,
                        supplier: p.supplier?.name || 'Manual'
                    }));
                    setInventory(mappedProducts);
                }

                if (servicesRes.success) {
                    const mappedServices: Service[] = servicesRes.data.map((s: any) => ({
                        ...s,
                        category: (typeof s.category === 'object' && s.category !== null) ? (s.category.name || 'Standard') : (s.category || 'Standard')
                    }));
                    setServices(mappedServices);
                }

                // Note: Bookings are now handled via real-time Firebase listener (onSnapshot)
            }
        } catch (error: any) {
            console.error('🚨 [AdminDashboard] loadData Exception:', {
                message: error.message,
                stack: error.stack,
                response: error.response?.data
            });
            toast.error('Failed to sync data with server');

            setInventory(inventoryStorage.getAll());
            setSuppliers(supplierStorage.getAll());
            setServices(serviceStorage.getAll());
        } finally {
            // Background sync complete
        }
    }, [
        canAccessInventory,
        canAccessPOS,
        canAccessReports,
        canAccessSettings,
        canAccessUsers,
        canViewSupplierData,
        isAdmin,
        needsServiceCatalogData,
        needsUserDirectory,
    ]);

    useEffect(() => {
        loadDataRef.current = loadData;
    }, [loadData]);


    useEffect(() => {
        if (!user || !isAdminDashboardRole(user.role)) {
            navigate('/');
            return;
        }

        loadData();
    }, [user, navigate, loadData]);

    // Real-Time Bookings Sync from MongoDB (Source of Truth)
    const fetchBookingsFromMongo = useCallback(async () => {
        if (!user || !isAdminDashboardRole(user.role)) return;
        if (!needsBookingsData) {
            setBookings([]);
            return;
        }
        try {
            const res = await OrderService.getAllOrders();
            if (res.success && Array.isArray(res.data)) {
                setBookings(res.data);
            }
        } catch (error) {
            console.error('❌ [AdminDashboard] Failed to fetch bookings from MongoDB:', error);
        }
    }, [needsBookingsData, user]);

    useEffect(() => {
        fetchBookingsRef.current = fetchBookingsFromMongo;
    }, [fetchBookingsFromMongo]);

    // Initial Fetch & Fallback Polling
    useEffect(() => {
        if (!user || !isAdminDashboardRole(user.role)) return;
        if (!needsBookingsData) {
            setBookings([]);
            return;
        }

        // 1. Initial robust fetch directly from DB
        fetchBookingsFromMongo();

        // 2. Poll every 30s to ensure near real-time sync if sockets fail
        const pid = window.setInterval(fetchBookingsFromMongo, 30000);

        return () => window.clearInterval(pid);
    }, [fetchBookingsFromMongo, needsBookingsData, user]);

    useEffect(() => {
        const handleStorage = () => {
            loadData();
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [loadData]);

    // Dynamic Analytics Sync - Only for roles that are allowed to read bookings/POS data.
    useEffect(() => {
        if (!user || !isAdminDashboardRole(user.role) || !needsAnalyticsData) {
            setDashboardStats({
                totalSales: 0,
                growth: 0,
                activeCount: 0
            });
            return;
        }

        const syncAnalytics = async () => {
            try {
                console.log('📊 Starting analytics sync...');

                let allOrders: any[] = [];
                let dataSource = 'none';

                // STEP 1: Try to fetch from API
                try {
                    const allOrdersResponse = await OrderService.getAllOrders({ suppressErrorToast: true });
                    if (allOrdersResponse.success && Array.isArray(allOrdersResponse.data)) {
                        allOrders = allOrdersResponse.data;
                        dataSource = 'API';
                        console.log('📊 Fetched from API:', allOrders.length, 'orders');
                    } else {
                        throw new Error('API response unsuccessful');
                    }
                } catch (apiError: any) {
                    console.warn('⚠️ API fetch failed, using localStorage fallback:', apiError.message);

                    // STEP 2: Fallback to localStorage
                    dataSource = 'localStorage';

                    // Read from pending_bookings (active bookings)
                    try {
                        const pendingRaw = localStorage.getItem('pending_bookings');
                        if (pendingRaw) {
                            const pendingBookings = JSON.parse(pendingRaw);
                            if (Array.isArray(pendingBookings)) {
                                allOrders = [...allOrders, ...pendingBookings];
                                console.log('📊 Loaded from pending_bookings:', pendingBookings.length, 'orders');
                            }
                        }
                    } catch (e) {
                        console.warn('⚠️ Failed to read pending_bookings:', e);
                    }

                    // Read from archived_sales_backup (archived/completed orders)
                    try {
                        const archivedRaw = localStorage.getItem('archived_sales_backup');
                        if (archivedRaw) {
                            const archivedSales = JSON.parse(archivedRaw);
                            if (Array.isArray(archivedSales)) {
                                allOrders = [...allOrders, ...archivedSales];
                                console.log('📊 Loaded from archived_sales_backup:', archivedSales.length, 'orders');
                            }
                        }
                    } catch (e) {
                        console.warn('⚠️ Failed to read archived_sales_backup:', e);
                    }

                    // Read from cached sales total
                    try {
                        const cachedSales = localStorage.getItem('autospf_sales_cache');
                        if (cachedSales) {
                            const salesAmount = Number(cachedSales);
                            if (salesAmount > 0) {
                                // Add a synthetic order to represent cached sales
                                allOrders.push({
                                    id: 'cached-sale',
                                    totalPrice: salesAmount,
                                    paymentStatus: 'paid',
                                    status: 'completed',
                                    createdAt: new Date().toISOString(),
                                    archivedAt: new Date().toISOString(),
                                    source: 'cached'
                                });
                                console.log('📊 Loaded cached sales:', salesAmount);
                            }
                        }
                    } catch (e) {
                        console.warn('⚠️ Failed to read autospf_sales_cache:', e);
                    }
                }

                // STEP 3: Calculate total sales
                const total = allOrders.reduce((sum, order) => {
                    const amount = Number(order.totalPrice || order.totalAmount || order.amount || 0);
                    // Only count paid or completed orders
                    if (order.paymentStatus === 'paid' || order.status === 'completed') {
                        return sum + amount;
                    }
                    return sum;
                }, 0);

                // STEP 4: Save to localStorage for future offline use
                try {
                    const currentBackup = localStorage.getItem('archived_sales_backup');
                    let backupOrders: any[] = currentBackup ? JSON.parse(currentBackup) : [];

                    // Merge new orders into backup
                    allOrders.forEach(order => {
                        if (order.status === 'completed' || order.paymentStatus === 'paid') {
                            // Check if order already exists in backup
                            const existingIndex = backupOrders.findIndex(
                                b => b.id === order.id || b.id === `cached-sale`
                            );
                            if (existingIndex >= 0) {
                                backupOrders[existingIndex] = order;
                            } else {
                                backupOrders.push(order);
                            }
                        }
                    });

                    localStorage.setItem('archived_sales_backup', JSON.stringify(backupOrders));
                    console.log('📊 Saved to archived_sales_backup:', backupOrders.length, 'orders');
                } catch (e) {
                    console.warn('⚠️ Failed to save to archived_sales_backup:', e);
                }

                // STEP 5: Smart Growth Calculation (Last 30 days vs Previous 30 days)
                const now = new Date();
                const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

                // Current month sales (last 30 days)
                const currentMonthSales = allOrders
                    .filter(o => {
                        const orderDate = new Date(o.archivedAt || o.completedAt || o.createdAt);
                        return orderDate > thirtyDaysAgo && (o.paymentStatus === 'paid' || o.status === 'completed');
                    })
                    .reduce((sum, o) => sum + (Number(o.totalPrice || o.totalAmount || o.amount || 0)), 0);

                // Previous month sales (30-60 days ago)
                const prevMonthSales = allOrders
                    .filter(o => {
                        const orderDate = new Date(o.archivedAt || o.completedAt || o.createdAt);
                        return orderDate > sixtyDaysAgo && orderDate <= thirtyDaysAgo && (o.paymentStatus === 'paid' || o.status === 'completed');
                    })
                    .reduce((sum, o) => sum + (Number(o.totalPrice || o.totalAmount || o.amount || 0)), 0);

                // STEP 6: Calculate growth percentage (with NaN protection)
                let growthPercent = 0;
                if (currentMonthSales === 0 && prevMonthSales === 0) {
                    growthPercent = 0; // No sales in either period
                } else if (prevMonthSales === 0 && currentMonthSales > 0) {
                    growthPercent = 100; // 100% if starting from zero
                } else if (prevMonthSales === 0 && currentMonthSales === 0) {
                    growthPercent = 0; // No growth if both are zero
                } else {
                    // Safe division with NaN protection
                    const growth = ((currentMonthSales - prevMonthSales) / prevMonthSales) * 100;
                    growthPercent = isNaN(growth) ? 0 : growth;
                }

                // STEP 7: Count active (non-archived) orders
                const activeCount = allOrders.filter(o => {
                    // Consider active if not archived AND not completed/cancelled
                    return !o.archived && o.status !== 'completed' && o.status !== 'cancelled';
                }).length;

                // STEP 8: Update state
                setDashboardStats({
                    totalSales: total,
                    growth: Math.round(growthPercent * 10) / 10, // 1 decimal place
                    activeCount: activeCount
                });

                console.log('✅ Analytics Sync Complete:', {
                    dataSource,
                    totalSales: total,
                    growth: growthPercent.toFixed(1) + '%',
                    activeCount,
                    currentMonthSales,
                    prevMonthSales
                });
            } catch (err) {
                // FINAL FALLBACK: Even if everything fails, show cached values
                console.error('💥 Analytics sync completely failed:', err);

                try {
                    // Try to load from localStorage as last resort
                    const cachedTotal = localStorage.getItem('autospf_sales_cache');
                    const cachedGrowth = localStorage.getItem('cached_growth');

                    setDashboardStats({
                        totalSales: cachedTotal ? Number(cachedTotal) : 1900, // Default to demo value
                        growth: cachedGrowth ? Number(cachedGrowth) : 12.5,
                        activeCount: 0
                    });

                    console.log('📊 Using emergency fallback from localStorage');
                } catch (fallbackErr) {
                    console.error('💥 Even fallback failed:', fallbackErr);
                    // Set demo values as final fallback
                    setDashboardStats({
                        totalSales: 1900,
                        growth: 12.5,
                        activeCount: 0
                    });
                }
            }
        };

        // Run initial sync
        syncAnalytics();

        // Re-sync every 60 seconds
        const analyticsInterval = setInterval(syncAnalytics, 60000);

        return () => clearInterval(analyticsInterval);
    }, [bookings, needsAnalyticsData, user]); // Re-run when accessible booking data changes

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const handleGenerateReceipt = (payment: any) => {
        try {
            const customerName = payment.customer?.name || payment.order?.customerName || 'Customer';
            const invoiceId = payment.invoiceId || payment.providerReference || payment._id || 'INV';
            const amount = Number(payment.amount || 0);
            const method = (payment.method || payment.provider || 'card').toUpperCase();
            const paidAt = payment.createdAt ? new Date(payment.createdAt).toLocaleString() : new Date().toLocaleString();

            const doc = new jsPDF({ unit: 'pt', format: 'a4' });
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('AutoSPF+ Receipt', 40, 50);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            doc.text(`Invoice: ${invoiceId}`, 40, 90);
            doc.text(`Customer: ${customerName}`, 40, 110);
            doc.text(`Amount: ${formatCurrency(amount)}`, 40, 130);
            doc.text(`Method: ${method}`, 40, 150);
            doc.text(`Date: ${paidAt}`, 40, 170);
            doc.save(`Receipt-${invoiceId}.pdf`);
        } catch (error) {
            console.error('Failed to generate receipt:', error);
            toast.error('Failed to generate receipt');
        }
    };

    const speak = useCallback((text: string) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }, []);

    useEffect(() => {
        if (!user || !isAdminDashboardRole(user.role)) return;

        const socket = io(getBackendSocketUrl(), {
            auth: {
                token: localStorage.getItem('autospf_token'),
            },
            transports: ['websocket'],
        });

        socketRef.current = socket;

        socket.on('admin:chat', (payload) => {
            const notificationId = payload?.id || payload?._id || `chat-${Date.now()}`;
            setNotifications((prev) => {
                if (prev.some((n) => (n.id || n._id) === notificationId)) {
                    return prev;
                }
                const newNotification: SystemNotification = {
                    id: notificationId,
                    title: payload?.title || 'Chat Message',
                    message: payload?.message || 'New chat message received.',
                    type: 'chat',
                    isRead: false,
                    createdAt: payload?.createdAt || new Date().toISOString(),
                    link: payload?.link,
                };
                return [newNotification, ...prev];
            });

            setUnreadNotificationsCount((prev) => prev + 1);

            if (speechSupported && payload?.message) {
                speak(`New chat message. ${payload.message}`);
            }
        });

        socket.on('admin:notification', (payload) => {
            const notificationId = payload?.id || payload?._id || `notif-${Date.now()}`;
            setNotifications((prev) => {
                if (prev.some((n) => (n.id || n._id) === notificationId)) {
                    return prev;
                }
                const newNotification: SystemNotification = {
                    id: notificationId,
                    title: payload?.title || 'Update',
                    message: payload?.message || 'A new update was recorded.',
                    type: payload?.type || 'info',
                    isRead: false,
                    createdAt: payload?.createdAt || new Date().toISOString(),
                    link: payload?.link,
                };
                return [newNotification, ...prev];
            });

            setUnreadNotificationsCount((prev) => prev + 1);

            if (payload?.message) {
                toast.success(payload.message);
            }

            // Sync bookings immediately when admin receives a booking-related notification
            if (payload?.type === 'booking') {
                fetchBookingsFromMongo();
            }
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [user, speechSupported, speak, fetchBookingsFromMongo]);

    const readLatestChatMessage = () => {
        if (!speechSupported) {
            toast.error('Speech synthesis is not supported in this browser.');
            return;
        }

        const latestUnreadChat = notifications.find(n => !n.isRead && n.type === 'chat')
            || notifications.find(n => n.type === 'chat');

        if (!latestUnreadChat) {
            toast.error('No unread chat messages to read.');
            return;
        }

        speak(`${latestUnreadChat.title}. ${latestUnreadChat.message}`);

        const notificationId = latestUnreadChat.id || latestUnreadChat._id;
        if (notificationId && !latestUnreadChat.isRead) {
            handleMarkAsRead(notificationId);
        }
    };

    const safeBookings = Array.isArray(bookings) ? bookings : [];

    const bookingsStats = useMemo(() => {
        return {
            total: safeBookings.length,
            pending: safeBookings.filter(b => b.status === 'pending').length,
            active: safeBookings.filter(b => ['in_progress', 'received', 'confirmed'].includes(b.status || '')).length,
            completed: safeBookings.filter(b => ['completed', 'paid', 'released'].includes(b.status || '')).length
        };
    }, [safeBookings]);

    const lowStockItems = inventory.filter(item => {
        const threshold = settings?.inventoryThreshold ?? item.minLevel;
        return item.stock < threshold;
    });
    const activeBookingsCount = safeBookings.filter(b => !['completed', 'paid', 'released', 'cancelled'].includes(b.status)).length;

    const addonPriceMap: Record<string, number> = {
        'Engine Bay Shield': 1400,
        'Rain-Repel Glass Coat': 1300,
        'Ozone Odor Removal': 900,
        'Wheel & Caliper Spa': 1600,
    };

    const cachedSales = typeof window !== 'undefined' ? Number(localStorage.getItem('autospf_sales_cache') || 0) : 0;
    const bookingSales = safeBookings
        .filter((b) => b.status === 'confirmed' || b.status === 'completed')
        .reduce((acc, b) => {
            const base = Number(b.totalPrice ?? b.totalAmount ?? 0);
            const addons = Array.isArray((b as any).addons)
                ? (b as any).addons.reduce((sum: number, title: string) => sum + (addonPriceMap[title] ?? 0), 0)
                : 0;
            return acc + base + addons;
        }, 0);

    // Use dynamic analytics if available, otherwise fall back to computed sales
    const computedTotalSales = dashboardStats.totalSales > 0
        ? dashboardStats.totalSales
        : (() => {
            const paymentSum = payments.reduce((acc, payment: any) => acc + Number(payment?.amount || 0), 0);
            const fallback = totalSales > 0 ? totalSales : paymentSum;
            return Math.max(bookingSales, fallback, cachedSales);
        })();
    const [salesWhole, salesDecimal] = Number(computedTotalSales || 0).toFixed(2).split('.');

    const getBookingColor = (booking: Booking) => {
        // Released / paid = green
        if (['released', 'paid'].includes(booking.status) || booking.paymentStatus === 'paid') {
            return '#16a34a';
        }
        // Completed (QC done) = emerald
        if (booking.status === 'completed') {
            return '#10b981';
        }
        // In-progress work = blue
        if (booking.status === 'in_progress') {
            return '#2563eb';
        }
        // Checked in / received = purple
        if (booking.status === 'received') {
            return '#8b5cf6';
        }
        // Confirmed & awaiting service = amber
        if (booking.status === 'confirmed') {
            return '#f59e0b';
        }
        // Pending bookings = indigo
        if (booking.status === 'pending' || booking.paymentStatus === 'unpaid') {
            return '#6366f1';
        }
        return '#6b7280';
    };

    const normalizeDate = (value: string | Date) => {
        if (value instanceof Date) return value;
        if (typeof value === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                return new Date(`${value}T00:00:00`);
            }
            return new Date(value);
        }
        return null;
    };

    const getBookingDateKey = (booking: Booking) => {
        const rawDate = booking.bookingDate || (booking as any).date || booking.createdAt;
        if (!rawDate) return null;
        const date = normalizeDate(rawDate);
        if (!date || Number.isNaN(date.getTime())) return null;
        return date.toLocaleDateString('en-CA');
    };

    const currentMonth = calendarMonth;
    const handlePrevMonth = () => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    const handleNextMonth = () => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const startOffset = monthStart.getDay();
    const daysInMonth = monthEnd.getDate();
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const bookingsByDate = safeBookings.reduce((acc, booking) => {
        const key = getBookingDateKey(booking);
        if (!key) return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(booking);
        return acc;
    }, {} as Record<string, Booking[]>);

    const calendarCells = Array.from({ length: startOffset + daysInMonth }, (_, index) => {
        if (index < startOffset) return null;
        const day = index - startOffset + 1;
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const key = date.toLocaleDateString('en-CA');
        return { day, key };
    });

    // Inventory handlers
    const handleAddInventory = async () => {
        if (user && !canAccessInventory) {
            toast.error('Insufficient permissions to manage inventory.');
            return;
        }
        if (!itemName || !itemCategory || !itemQuantity || !itemUnit || !itemMinLevel || !itemCost) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        const payload = {
            name: itemName,
            category: itemCategory,
            inventory: parseInt(itemQuantity),
            price: parseFloat(itemCost),
            minLevel: parseInt(itemMinLevel),
            maxLevel: itemMaxLevel ? parseInt(itemMaxLevel) : undefined,
            sku: itemSku || undefined,
            unit: itemUnit,
            supplier: itemSupplier
        };
        console.log(`🚀 ${isEditingInventory ? 'Update' : 'Add'} Inventory Payload:`, payload);

        try {
            let response;
            if (isEditingInventory && editingInventoryId) {
                response = await InventoryService.updateProduct(editingInventoryId, payload);
            } else {
                response = await InventoryService.createProduct(payload);
            }

            if (response.success) {
                toast.success(`Item ${isEditingInventory ? 'updated' : 'added'} successfully!`);
                await loadData();
                setShowInventoryModal(false);
                resetInventoryForm();
            } else {
                toast.error(response.message || `Failed to ${isEditingInventory ? 'update' : 'add'} item`);
            }
        } catch (error: any) {
            console.error('🚨 Inventory Action Exception:', error);
            toast.error(`Failed to ${isEditingInventory ? 'update' : 'add'} inventory item`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditInventory = (item: InventoryItem) => {
        if (user && !canAccessInventory) {
            toast.error('Insufficient permissions to manage inventory.');
            return;
        }
        setIsEditingInventory(true);
        setEditingInventoryId(item.id);
        setItemName(item.name);
        setItemCategory(item.categoryId || item.category || '');
        setItemQuantity(item.stock.toString());
        setItemUnit(item.unit);
        setItemMinLevel(item.minLevel.toString());
        setItemMaxLevel(item.maxLevel?.toString() || '');
        setItemSku(item.sku || '');
        setItemCost(item.cost.toString());
        setItemSupplier(item.supplierId || item.supplier || '');
        setShowInventoryModal(true);
    };

    const handleDeleteInventory = (id: string, name: string) => {
        if (user && !isInventoryManagerRole(user.role)) {
            toast.error('Insufficient permissions to delete inventory.');
            return;
        }
        handleOpenDangerModal(id, 'inventory', name);
    };

    const resetInventoryForm = () => {
        setItemName('');
        setItemCategory('');
        setItemQuantity('');
        setItemUnit('');
        setItemMinLevel('');
        setItemMaxLevel('');
        setItemSku('');
        setItemCost('');
        setItemSupplier('');
        setIsEditingInventory(false);
        setEditingInventoryId(null);
    };

    // User Handlers (Logic moved to UserManagementPanel)
    // Danger Zone handlers
    const handleOpenDangerModal = (id: string, type: 'inventory' | 'user' | 'supplier' | 'service', name: string) => {
        setItemToDelete({ id, type, name });
        setShowDangerModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;

        const token = localStorage.getItem('autospf_token') || '';
        setIsDeleting(true);

        try {
            let response;
            switch (itemToDelete.type) {
                case 'inventory':
                    response = await InventoryService.deleteProduct(itemToDelete.id);
                    break;
                case 'user':
                    if (itemToDelete.id === user?.id) {
                        toast.error('Cannot delete your own account');
                        setIsDeleting(false);
                        setShowDangerModal(false);
                        return;
                    }
                    response = await UserService.deleteUser(itemToDelete.id);
                    break;
                case 'supplier':
                    response = await SupplierService.deleteSupplier(itemToDelete.id);
                    break;
                case 'service':
                    response = await DetailService.deleteService(itemToDelete.id);
                    break;
            }

            if (response?.success) {
                toast.success(`${itemToDelete.type.charAt(0).toUpperCase() + itemToDelete.type.slice(1)} deleted successfully!`);
                loadData();
            } else {
                toast.error(response?.message || `Failed to delete ${itemToDelete.type}`);
            }
        } catch (error: any) {
            console.error('🚨 Delete Exception:', {
                type: itemToDelete.type,
                id: itemToDelete.id,
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            const errorMsg = error.response?.data?.message || 'Delete failed';
            toast.error(errorMsg);
        } finally {
            setIsDeleting(false);
            setShowDangerModal(false);
            setItemToDelete(null);
        }
    };

    const handleBulkDelete = async () => {
        if (user && !isInventoryManagerRole(user.role)) {
            toast.error('Insufficient permissions to delete inventory.');
            return;
        }
        if (!selectedInventoryItems.length) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedInventoryItems.length} items?`)) return;

        setIsDeleting(true);
        const toastId = toast.loading('Deleting items...');

        try {
            const promises = selectedInventoryItems.map(id => InventoryService.deleteProduct(id));
            await Promise.all(promises);
            toast.success(`Successfully deleted ${selectedInventoryItems.length} items.`, { id: toastId });
            setSelectedInventoryItems([]);
            loadData();
        } catch (error) {
            console.error('🚨 Bulk Delete Action Exception:', error);
            toast.error('Failed to delete some items. They may be in use.', { id: toastId });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkUpdateStock = async () => {
        if (user && !canAccessInventory) {
            toast.error('Insufficient permissions to manage inventory.');
            return;
        }
        if (!selectedInventoryItems.length || !bulkRestockQuantity) return;

        const qty = parseInt(bulkRestockQuantity, 10);
        if (isNaN(qty) || qty === 0) {
            toast.error('Please enter a valid quantity.');
            return;
        }

        const toastId = toast.loading(`Updating stock for ${selectedInventoryItems.length} items...`);
        try {
            const promises = selectedInventoryItems.map(id => {
                const item = inventory.find(i => i.id === id || i._id === id);
                if (!item) return Promise.resolve();
                return InventoryService.updateProduct(id, { inventory: (item.stock || 0) + qty });
            });
            await Promise.all(promises);
            toast.success(`Successfully updated stock.`, { id: toastId });
            setSelectedInventoryItems([]);
            setBulkRestockQuantity('');
            setShowBulkStockModal(false);
            loadData();
        } catch (error) {
            console.error('🚨 Bulk Stock Action Exception:', error);
            toast.error('Failed to update some items.', { id: toastId });
        }
    };

    const handleRestockSingle = async () => {
        if (user && !canAccessInventory) {
            toast.error('Insufficient permissions to manage inventory.');
            return;
        }
        if (!restockItemId || !restockQuantity) return;

        const qty = parseInt(restockQuantity, 10);
        if (isNaN(qty) || qty === 0) {
            toast.error('Enter a valid quantity');
            return;
        }

        const item = inventory.find(i => i.id === restockItemId || i._id === restockItemId);
        if (!item) return;

        const toastId = toast.loading('Updating stock...');
        try {
            await InventoryService.updateProduct(item.id || (item as any)._id, { inventory: (item.stock || 0) + qty });
            toast.success('Restocked successfully!', { id: toastId });
            setShowRestockModal(false);
            setRestockItemId(null);
            setRestockQuantity('');
            loadData();
        } catch (error) {
            toast.error('Failed to restock item', { id: toastId });
        }
    };

    // Supplier Order handlers
    const handleOpenOrderModal = (supplier: Supplier) => {
        if (user && !canAccessSupplierModule) {
            toast.error('Insufficient permissions to manage suppliers.');
            return;
        }
        setSelectedSupplierForOrder(supplier);
        setShowOrderModal(true);
    };

    const handleConfirmOrder = async () => {
        if (!selectedSupplierForOrder) return;

        const token = localStorage.getItem('autospf_token') || '';

        const previousSuppliers = [...suppliers];
        setSuppliers(prev => prev.map(s =>
            s.id === selectedSupplierForOrder.id
                ? { ...s, lastOrder: new Date().toISOString().split('T')[0], totalSpent: s.totalSpent + (1000) }
                : s
        ));

        try {
            const response = await SupplierService.placeOrder(selectedSupplierForOrder.id);
            if (response.success) {
                toast.success(`Order placed with ${selectedSupplierForOrder.name}!`);
                setShowOrderModal(false);
                loadData();
            } else {
                setSuppliers(previousSuppliers);
                toast.error(response.message || 'Failed to place order');
            }
        } catch (error: any) {
            setSuppliers(previousSuppliers);
            toast.error('An error occurred while placing order');
        }
    };

    // Supplier handlers
    const handleAddSupplier = async () => {
        if (user && !canAccessSupplierModule) {
            toast.error('Insufficient permissions to manage suppliers.');
            return;
        }
        if (!supplierName || !supplierContact || !supplierEmail) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        const normalizedProducts = supplierProducts
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        const payload = {
            name: supplierName,
            contactPerson: supplierContact,
            email: supplierEmail,
            phone: supplierPhone,
            products: normalizedProducts
        };
        console.log(`🚀 ${isEditingSupplier ? 'Update' : 'Add'} Supplier Payload:`, payload);

        try {
            let response;
            if (isEditingSupplier && editingSupplierId) {
                response = await SupplierService.updateSupplier(editingSupplierId, payload);
            } else {
                response = await SupplierService.createSupplier(payload);
            }

            if (response.success) {
                toast.success(`Supplier ${isEditingSupplier ? 'updated' : 'added'} successfully!`);
                await loadData();
                setShowSupplierModal(false);
                resetSupplierForm();
            } else {
                toast.error(response.message || `Failed to ${isEditingSupplier ? 'update' : 'add'} supplier`);
            }
        } catch (error: any) {
            console.error('🚨 Supplier Action Exception:', error);
            // Offline/demo fallback: persist locally so the list still shows the supplier
            const tempSupplier: Supplier = {
                id: editingSupplierId || `temp-supplier-${Date.now()}`,
                name: supplierName,
                contactPerson: supplierContact,
                email: supplierEmail,
                phone: supplierPhone,
                products: normalizedProducts,
                lastOrder: new Date().toISOString(),
                totalSpent: 0,
            };
            supplierStorage.add(tempSupplier);
            setSuppliers(prev => [...prev, tempSupplier]);
            toast.success('Supplier saved locally (offline mode).');
            setShowSupplierModal(false);
            resetSupplierForm();
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditSupplier = (s: Supplier) => {
        if (user && !canAccessSupplierModule) {
            toast.error('Insufficient permissions to manage suppliers.');
            return;
        }
        setIsEditingSupplier(true);
        setEditingSupplierId(s.id);
        setSupplierName(s.name);
        setSupplierContact(s.contactPerson);
        setSupplierEmail(s.email);
        setSupplierPhone(s.phone);
        setSupplierProducts(s.products?.join(', ') || '');
        setShowSupplierModal(true);
    };

    const resetSupplierForm = () => {
        setSupplierName('');
        setSupplierContact('');
        setSupplierEmail('');
        setSupplierPhone('');
        setSupplierProducts('');
        setIsEditingSupplier(false);
        setEditingSupplierId(null);
    };

    // Service handlers
    const handleAddService = async () => {
        if (user && !canAccessPricing) {
            toast.error('Insufficient permissions to manage services.');
            return;
        }
        if (!serviceName || !serviceCategory || !serviceDuration || !servicePrice) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        const payload = {
            name: serviceName,
            category: serviceCategory as 'Basic' | 'Standard' | 'Premium',
            duration: serviceDuration,
            basePrice: parseFloat(servicePrice),
            status: 'Active' as const,
        };
        console.log(`🚀 ${isEditingService ? 'Update' : 'Add'} Service Payload:`, payload);

        try {
            let response;
            if (isEditingService && editingServiceId) {
                response = await DetailService.updateService(editingServiceId, payload);
            } else {
                response = await DetailService.createService(payload);
            }

            if (response.success) {
                toast.success(`Service ${isEditingService ? 'updated' : 'added'} successfully!`);
                await loadData();
                setShowServiceModal(false);
                resetServiceForm();
            } else {
                toast.error(response.message || `Failed to ${isEditingService ? 'update' : 'add'} service`);
            }
        } catch (error: any) {
            console.error('🚨 Service Action Exception:', error);
            toast.error(`Failed to ${isEditingService ? 'update' : 'add'} service`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditService = (s: Service) => {
        if (user && !canAccessPricing) {
            toast.error('Insufficient permissions to manage services.');
            return;
        }
        setIsEditingService(true);
        setEditingServiceId(s.id);
        setServiceName(s.name);
        setServiceCategory(s.category);
        setServiceDuration(s.duration);
        setServicePrice(s.basePrice.toString());
        setShowServiceModal(true);
    };

    const handleDeleteService = (id: string, name: string) => {
        if (user && !isServiceCatalogRole(user.role)) {
            toast.error('Insufficient permissions to delete services.');
            return;
        }
        handleOpenDangerModal(id, 'service', name);
    };

    const handleCleanupBookings = async () => {
        if (user && !canAccessBookings) {
            toast.error('Insufficient permissions to manage bookings.');
            return;
        }
        setIsCleaningBookings(true);
        const toastId = toast.loading('Archiving stale bookings...');
        try {
            const response = await OrderService.cleanupStaleBookings();
            if (response.success) {
                toast.success(`Archived ${response.archived || 0} bookings`, { id: toastId });
                loadData();
            } else {
                toast.error(response.message || 'Failed to archive bookings', { id: toastId });
            }
        } catch (error: any) {
            toast.error('Failed to archive bookings', { id: toastId });
        } finally {
            setIsCleaningBookings(false);
        }
    };

    const resetServiceForm = () => {
        setServiceName('');
        setServiceCategory('');
        setServiceDuration('');
        setServicePrice('');
        setIsEditingService(false);
        setEditingServiceId(null);
    };

    // Booking Handlers
    const handleCheckInSubmit = async (amount: number, method: string, signature: string) => {
        if (!selectedBooking) return;
        const toastId = toast.loading('Processing check-in...');
        try {
            const res = await OrderService.operateCheckIn(selectedBooking.id, {
                paymentMethod: method,
                downPaymentAmount: amount,
                signature
            });
            if (res.success) {
                toast.success('Vehicle successfully checked in!');
                setShowCheckInModal(false);
                setShowAssignModal(false);
                loadData();
            } else {
                toast.error(res.message || 'Check-in failed');
            }
        } catch (e) {
            toast.error('Error during check-in');
        } finally {
            toast.dismiss(toastId);
        }
    };

    const handleAssignDetailer = async () => {
        if (user && !canAccessBookings) {
            toast.error('Insufficient permissions to manage bookings.');
            return;
        }
        if (!selectedBooking) return;

        // Ensure we load users dynamically from context/state
        if (operationalAction === 'pending' || operationalAction === 'assigned' || operationalAction === 'confirmed') {
            // If the user clicks "POS Check-in" when operationalAction === 'confirmed'
            if (operationalAction === 'confirmed') {
                setShowCheckInModal(true);
                return;
            }

            if (!selectedDetailerId) {
                toast.error('Please select a detailer.');
                return;
            }
            const toastId = toast.loading('Assigning detailer...');
            try {
                let response = await OrderService.assignDetailer(selectedBooking.id, selectedDetailerId);
                const currentStatus = selectedBooking.status || 'pending';
                if (response.success && operationalAction !== currentStatus && operationalAction !== 'assigned') {
                    response = await OrderService.updateOrder(selectedBooking.id, {
                        status: 'confirmed'
                    });
                }
                if (response.success) {
                    toast.success('Detailer assigned.');

                    // Firestore real-time sync — so DetailerDashboard picks up assignment live
                    try {
                        await setDoc(doc(db, 'bookings', selectedBooking.id), {
                            assignedDetailer: selectedDetailerId,
                            status: response.data?.status || 'assigned',
                            updatedAt: new Date().toISOString()
                        }, { merge: true });
                    } catch (fsErr) {
                        console.warn('[FIRESTORE] Assignment sync failed (non-critical):', fsErr);
                    }

                    setShowAssignModal(false);
                    setSelectedBooking(null);
                    setSelectedDetailerId('');
                    loadData();
                } else {
                    toast.error(response.message || 'Failed to assign detailer');
                }
            } catch (error: any) {
                 toast.error('Error assigning detailer');
            } finally {
                toast.dismiss(toastId);
            }
            return;
        }

        const runOp = async (opName: string, opFn: (id: string) => Promise<any>, successMsg: string) => {
             const toastId = toast.loading(`${opName}...`);
             try {
                  const res = await opFn(selectedBooking.id);
                  if (res.success) {
                       toast.success(successMsg);
                       setShowAssignModal(false);
                       loadData();
                  } else {
                       toast.error(res.message || `${opName} failed`);
                  }
             } catch (e) {
                  toast.error(`Error during ${opName}`);
             } finally {
                  toast.dismiss(toastId);
             }
        };

        if (operationalAction === 'received') {
             runOp('Starting Service', OrderService.operateStartService, 'Service started successfully.');
        } else if (operationalAction === 'in_progress') {
             runOp('QC Completion', OrderService.operateQCComplete, 'QC Completed successfully.');
        } else if (operationalAction === 'completed') {
             setShowAssignModal(false);
             setActiveTab('pos');
             toast.info('Switched to POS for final payment.');
        } else if (operationalAction === 'paid') {
             runOp('Releasing Vehicle', OrderService.operateRelease, 'Vehicle Released successfully!');
        }
    };

    const handleConfirmBooking = async (booking: Booking) => {
        if (user && !canAccessBookings) {
            toast.error('Insufficient permissions to manage bookings.');
            return;
        }
        if (!booking?.id) return;
        const toastId = toast.loading('Confirming booking...');
        try {
            const response = await OrderService.updateOrder(booking.id, { status: 'confirmed' });
            if (response.success) {
                // ATOMIC UPDATE for Real-Time Sync — use 'confirmed' to match backend
                await setDoc(doc(db, 'bookings', booking.id), {
                    status: 'confirmed',
                    customerStatus: 'Confirmed',
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                toast.success('Booking confirmed ✓', { id: toastId });
                setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: 'confirmed' } : b)));
            } else {
                toast.error(response.message || 'Failed to confirm booking', { id: toastId });
            }
        } catch (error: any) {
            console.error('Confirm error:', error);
            toast.error('Failed to confirm booking', { id: toastId });
        }
    };

    const handleUpdatePaymentStatus = async (booking: Booking, newStatus: 'paid' | 'unpaid') => {
        if (user && !canAccessBookings) {
            toast.error('Insufficient permissions to manage bookings.');
            return;
        }
        if (!booking?.id) return;

        // ── Optimistic update: flip the UI instantly ──────────────────────
        const previousStatus = booking.paymentStatus as 'paid' | 'unpaid';
        setBookings((prev) =>
            prev.map((b) => b.id === booking.id ? { ...b, paymentStatus: newStatus } : b)
        );
        setDetailBooking((prev) => prev ? { ...prev, paymentStatus: newStatus } : prev);

        // ── Fire API in the background ────────────────────────────────────
        try {
            const response = await OrderService.updateOrder(booking.id, { paymentStatus: newStatus });
            if (response.success) {
                toast.success(newStatus === 'paid' ? 'Payment marked as paid ✓' : 'Marked as unpaid');
                // Firestore sync for real-time calendar color update (best-effort)
                setDoc(doc(db, 'bookings', booking.id), {
                    paymentStatus: newStatus,
                    updatedAt: new Date().toISOString()
                }, { merge: true }).catch(() => { });
            } else {
                throw new Error(response.message || 'Update failed');
            }
        } catch (error: any) {
            // ── Revert on failure ─────────────────────────────────────────
            console.error('Payment status update error:', error);
            setBookings((prev) =>
                prev.map((b) => b.id === booking.id ? { ...b, paymentStatus: previousStatus } : b)
            );
            setDetailBooking((prev) => prev ? { ...prev, paymentStatus: previousStatus } : prev);
            toast.error('Failed to update payment status — reverted');
        }
    };

    // ── Schedule Edit Logic ───────────────────────────────────────────
    useEffect(() => {
        if (!editDate || !isEditScheduleOpen) {
            setBookedSlots([]);
            return;
        }
        const fetchEditSlots = async () => {
            setIsLoadingSlots(true);
            try {
                const response = await OrderService.getAvailableSlots(editDate);
                if (response.success && response.bookedSlots) {
                    // Filter out the booking's own original time so they can keep their slot
                    const slots = detailBooking?.bookingDate === editDate
                        ? response.bookedSlots.filter((t: string) => t !== detailBooking.bookingTime)
                        : response.bookedSlots;

                    setBookedSlots(slots);
                    if (editTime && slots.includes(editTime)) {
                        setEditTime('');
                        toast.error('The selected time slot is already booked.');
                    }
                }
            } catch (error) {
                toast.error('Could not verify time slot availability.');
            } finally {
                setIsLoadingSlots(false);
            }
        };
        fetchEditSlots();
    }, [editDate, isEditScheduleOpen, detailBooking]);

    const handleSaveSchedule = async () => {
        if (user && !canAccessBookings) {
            toast.error('Insufficient permissions to manage bookings.');
            return;
        }
        if (!detailBooking?.id) return;
        if (!editDate || !editTime) {
            toast.error('Please select both a date and time.');
            return;
        }

        const idToast = toast.loading('Updating schedule...');
        try {
            const payload = {
                bookingDate: editDate,
                bookingTime: editTime
            };
            const response = await OrderService.updateOrder(detailBooking.id, payload);

            if (response.success && response.data) {
                toast.success('Schedule updated successfully', { id: idToast });

                // Update local list
                setBookings(prev => prev.map(b => b.id === detailBooking.id ? { ...b, ...payload } : b));
                setDetailBooking(prev => prev ? { ...prev, ...payload } : null);

                // Firestore sync best-effort for live calendar
                setDoc(doc(db, 'bookings', detailBooking.id), {
                    ...payload,
                    updatedAt: new Date().toISOString()
                }, { merge: true }).catch(() => { });

                setIsEditScheduleOpen(false);
            }
        } catch (error: any) {
            console.error('Save schedule error:', error);
            const msg = error.response?.data?.message || 'Failed to update schedule.';
            toast.error(msg, { id: idToast });
        }
    };
    // ──────────────────────────────────────────────────────────────────

    const detailers = users.filter((u) => u.role === SERVICE_STAFF_ROLE);

    // Platform Management Handlers
    const handleExportData = async () => {
        const loadingToast = toast.loading('Generating data archive...');
        try {
            await SystemService.exportAllData();
            toast.success('Data archive downloaded', { id: loadingToast });
        } catch (error) {
            toast.error('Failed to export data', { id: loadingToast });
        }
    };

    const handleBackupDB = async () => {
        const loadingToast = toast.loading('Initiating cloud backup...');
        try {
            const res = await SystemService.backupDatabase();
            if (res.success) {
                toast.success('Backup successful', { id: loadingToast, description: res.message });
                if (user) {
                    await ActivityService.createActivityLog(
                        'maintenance',
                        'Database Backup',
                        `${user.name} triggered a database backup`,
                        user.id,
                        user.name
                    );
                }
            }
        } catch (error) {
            toast.error('Backup failed', { id: loadingToast });
        }
    };

    const handleClearCache = async () => {
        const loadingToast = toast.loading('Purging memory buffers...');
        try {
            const res = await SystemService.clearCache();
            if (res.success) {
                toast.success('Cache cleared', { id: loadingToast });
            }
        } catch (error) {
            toast.error('Failed to clear cache', { id: loadingToast });
        }
    };

    const handleConfirmReset = async () => {
        if (resetConfirmText !== 'RESET') {
            toast.error('Please type RESET to confirm');
            return;
        }

        setIsResetting(true);
        try {
            const res = await SystemService.resetSystem();
            if (res.success) {
                toast.success('System reset successfully');
                setShowResetModal(false);
                logout();
                navigate('/');
            }
        } catch (error) {
            toast.error('Failed to reset system');
        } finally {
            setIsResetting(false);
        }
    };

    // Notification handlers
    const handleMarkAsRead = async (id: string) => {
        try {
            const res = await NotificationService.markAsRead(id);
            if (res.success) {
                setNotifications(prev => prev.map(n => n._id === id || n.id === id ? { ...n, isRead: true } : n));
                setUnreadNotificationsCount(prev => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const handleMarkAllRead = async (silent: boolean = false) => {
        try {
            const res = await NotificationService.markAllAsRead();
            if (res.success) {
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                setUnreadNotificationsCount(0);
                if (!silent) {
                    toast.success('All notifications marked as read');
                }
            }
        } catch (error) {
            toast.error('Failed to mark all as read');
        }
    };

    // Settings handlers
    const handleSaveSettings = async (updatedSettings?: Partial<BusinessSettings>) => {
        const payload = updatedSettings || settings;
        if (!payload) return;

        const loadingToast = toast.loading('Saving settings...');
        try {
            const res = await SettingsService.updateSettings(payload);
            if (res.success) {
                setSettings(res.data);
                if (typeof window !== 'undefined') {
                    if (res.data?.currency) localStorage.setItem('autospf_currency', res.data.currency);
                    if (res.data?.membershipDiscount !== undefined) localStorage.setItem('autospf_membership_discount', String(res.data.membershipDiscount));
                    if (res.data?.inventoryThreshold !== undefined) localStorage.setItem('autospf_inventory_threshold', String(res.data.inventoryThreshold));
                    if (res.data?.systemTheme) {
                        localStorage.setItem('autospf_global_theme', res.data.systemTheme);
                        localStorage.setItem('autospf_theme', res.data.systemTheme);
                        setTheme(res.data.systemTheme);
                    }
                }
                if (user) {
                    await ActivityService.createActivityLog(
                        'settings',
                        'Settings Updated',
                        `${user.name} updated business settings`,
                        user.id,
                        user.name,
                        { currency: res.data?.currency, membershipDiscount: res.data?.membershipDiscount }
                    );
                }
                toast.success('Settings updated successfully', { id: loadingToast });
                if (res.data?.systemTheme) {
                    toast.success('Global System Theme Updated!');
                }
            } else {
                toast.error(res.message || 'Failed to update settings', { id: loadingToast });
            }
        } catch (error) {
            toast.error('Error saving settings', { id: loadingToast });
        }
    };

    const filteredInventory = inventory.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.supplier || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = itemCategoryFilter === 'All Category' || item.category === itemCategoryFilter;

        let matchesStatus = true;
        if (itemStatusFilter !== 'All') {
            const stockStatus = item.stock < 5 ? 'Critical' : item.stock <= 10 ? 'Warning' : 'Optimal';
            if (itemStatusFilter === 'Out of Stock') {
                matchesStatus = item.stock === 0;
            } else {
                matchesStatus = (stockStatus as string) === itemStatusFilter;
            }
        }

        return matchesSearch && matchesCategory && matchesStatus;
    });

    const getTabsForRole = (role: string | undefined): any[] => {
        if (!role) return [];

        const safeRole = getSafeUserRole(role);

        const allAdminTabs = [
            { id: 'inventory' as TabType, label: 'Inventory', icon: Package },
            { id: 'bookings' as TabType, label: 'Bookings', icon: ClipboardList },
            { id: 'pos' as TabType, label: 'POS System', icon: Monitor },
            { id: 'users' as TabType, label: 'User Management', icon: Users },
            { id: 'suppliers' as TabType, label: 'Suppliers', icon: ShoppingCart },
            { id: 'pricing' as TabType, label: 'Pricing', icon: PhilippinePeso },
            { id: 'activity' as TabType, label: 'Activity Logs', icon: Activity },
            { id: 'waivers' as TabType, label: 'Waivers & Docs', icon: FileText },
            { id: 'appointments' as TabType, label: 'Appointments', icon: Calendar },
            { id: 'ai_estimator' as TabType, label: 'AI Damage Detection', icon: Zap },
        ];

        switch (safeRole) {
            case 'administrator':
                // Exclude 'appointments' — bookings tab already shows the full SmartCalendar
                return allAdminTabs.filter(tab => tab.id !== 'appointments');
            case 'office_admin':
                // Office Admin: AI Estimator + Waivers only (per spec)
                return allAdminTabs.filter(tab => ['ai_estimator', 'waivers'].includes(tab.id));
            case 'operation_manager':
                // Operation Manager: User Reg, Inventory, AI Estimator, Waivers, Bookings — NO appointments
                return allAdminTabs.filter(tab => ['users', 'inventory', 'bookings', 'waivers', 'ai_estimator', 'activity'].includes(tab.id));
            case 'hr':
                // HR: User Reg, User Management, Appointments (staff availability/schedule)
                return allAdminTabs.filter(tab => ['users', 'appointments'].includes(tab.id));
            case 'inventory':
                // Inventory Staff: Inventory only
                return allAdminTabs.filter(tab => ['inventory'].includes(tab.id));
            case 'sales':
                // Sales: User Reg, Appointments (smart calendar), not shown - chatbot handled elsewhere
                return allAdminTabs.filter(tab => ['users', 'appointments', 'pos'].includes(tab.id));
            default:
                return [];
        }
    };

    const tabs = getTabsForRole(user?.role);

    useEffect(() => {
        const isSystemTab = activeTab === 'settings' || activeTab === 'profile';
        if (tabs.length > 0 && !isSystemTab && !tabs.some(t => t.id === activeTab)) {
            setActiveTab(tabs[0].id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.role]);


    const getActivityIcon = (type: ActivityLog['type']) => {
        switch (type) {
            case 'completed_job': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'inventory_update': return <Clock className="w-5 h-5 text-blue-600" />;
            case 'low_stock': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
            case 'new_booking': return <Clock className="w-5 h-5 text-blue-600" />;
            case 'started_job': return <Clock className="w-5 h-5 text-blue-600" />;
            case 'generated_report': return <FileText className="w-5 h-5 text-green-600" />;
            case 'status_change': return <ClipboardList className="w-5 h-5 text-orange-600" />;
            case 'customer_status_change': return <ShieldCheck className="w-5 h-5 text-orange-600" />;
            default: return <Clock className="w-5 h-5 text-gray-600" />;
        }
    };

    const getCategoryBadge = (category: any) => {
        const catName = (typeof category === 'object' && category !== null) ? (category.name || 'Standard') : (category || 'Standard');
        switch (catName) {
            case 'Basic': return <Badge className="bg-blue-100 text-blue-800">Basic</Badge>;
            case 'Standard': return <Badge className="bg-yellow-100 text-yellow-800">Standard</Badge>;
            case 'Premium': return <Badge className="bg-purple-100 text-purple-800">Premium</Badge>;
            default: return <Badge className="bg-zinc-800 text-zinc-300">{catName}</Badge>;
        }
    };
    const getRoleDisplayName = (role: string | undefined) => {
        return getRoleLabel(role);
    };

    return (
        <div className={`admin-root admin-shell ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>

            {/* ── OVERLAY ── */}
            <div
                className={`drawer-overlay ${!sidebarCollapsed ? 'open' : ''}`}
                onClick={() => setSidebarCollapsed(true)}
            />

            {/* ── SIDEBAR ── */}
            <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="brand">
                    <div className="sidebar-profile-avatar" onClick={() => { setActiveTab('profile'); setSidebarCollapsed(true); }}>
                        {profilePhoto ? <img src={profilePhoto} alt="Profile" /> : (user?.name?.charAt(0).toUpperCase() || 'A')}
                        <div className="edit-overlay">
                            <Camera size={20} className="mb-0.5" />
                            <span className="text-[11px] font-bold tracking-wide">Edit</span>
                        </div>
                    </div>
                    <div>
                        <div className="brand-name">{user?.name || 'Administrator'}</div>
                        <div className="brand-role">
                            <span className="role-dot"></span>
                            {getRoleDisplayName(user?.role)}
                        </div>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto mt-2">
                    <div className="nav-section">Workspace</div>
                    {tabs.filter(t => ['inventory', 'bookings', 'pos', 'users'].includes(t.id)).map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button key={tab.id} title={sidebarCollapsed ? tab.label : undefined} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                <tab.icon className="ni w-[15px] h-[15px]" />
                                <span className="nav-label">{tab.label}</span>
                                {tab.id === 'bookings' && activeBookingsCount > 0 && <span className="nav-badge">{activeBookingsCount}</span>}
                            </button>
                        )
                    })}

                    {tabs.some(t => ['suppliers', 'pricing', 'activity', 'waivers', 'appointments', 'ai_estimator'].includes(t.id)) && (
                        <div className="nav-section mt-2">Operations</div>
                    )}
                    {tabs.filter(t => ['suppliers', 'pricing', 'activity', 'waivers', 'appointments', 'ai_estimator'].includes(t.id)).map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button key={tab.id} title={sidebarCollapsed ? tab.label : undefined} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                <tab.icon className="ni w-[15px] h-[15px]" />
                                <span className="nav-label">{tab.label}</span>
                            </button>
                        )
                    })}
                </nav>

                <div className="sidebar-footer" ref={userMenuRef}>
                    <AnimatePresence>
                        {showUserMenu && (
                            <motion.div
                                className="user-popover-menu"
                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            >
                                {[
                                    { icon: <UserIcon className="w-4 h-4" />, label: 'My profile', onClick: () => { setActiveTab('profile'); setShowUserMenu(false); setSidebarCollapsed(true); } },
                                    { icon: <Settings className="w-4 h-4" />, label: 'Settings', onClick: () => { setActiveTab('settings'); setShowUserMenu(false); setSidebarCollapsed(true); } },
                                    { icon: <Sparkles className="w-4 h-4" />, label: 'Toggle theme', badge: isDarkMode ? 'D' : 'L', onClick: () => { toggleTheme(); } },
                                    { icon: <ExternalLink className="w-4 h-4" />, label: 'Homepage', onClick: () => { navigate('/'); setShowUserMenu(false); }, highlight: true },
                                    { icon: <LogOut className="w-4 h-4" />, label: 'Log out', onClick: () => { setShowUserMenu(false); setShowSignoutModal(true); setSignoutStep('confirm'); }, isDanger: true },
                                ].map((item, i) => (
                                    <motion.button
                                        key={item.label}
                                        className={`user-popover-item ${item.highlight ? 'highlight' : ''} ${item.isDanger ? 'danger' : ''}`}
                                        onClick={item.onClick}
                                        initial={{ opacity: 0, x: -16 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                        whileHover={{ x: 4 }}
                                    >
                                        <span className="user-popover-icon">{item.icon}</span>
                                        <span className="user-popover-label">{item.label}</span>
                                        {item.badge && <span className="user-popover-badge">{item.badge}</span>}
                                    </motion.button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <button
                        className="user-email-trigger"
                        onClick={() => setShowUserMenu(prev => !prev)}
                    >
                        <div className="user-email-avatar">
                            {profilePhoto
                                ? <img src={profilePhoto} alt="" />
                                : (user?.name?.charAt(0).toUpperCase() || 'A')}
                        </div>
                        <span className="user-email-text">{user?.email || 'user@autospf.com'}</span>
                        <MoreHorizontal className="w-4 h-4 user-email-dots" />
                    </button>
                </div>
            </div>

            {/* ── MAIN AREA ── */}
            <div className="main">
                {/* Topbar */}
                <div className="topbar">
                    <div className="flex items-center gap-3">
                        <button
                            className="p-2 rounded-md hover:bg-[var(--surface2)] text-[var(--text2)] hover:text-[var(--text)] transition-colors"
                            onClick={() => setSidebarCollapsed(false)}
                            title="Open Menu"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="page-head">
                            <div className="title">
                                {tabs.find(t => t.id === activeTab)?.label || 'Dashboard'}
                            </div>
                            <div className="sub">
                                {activeTab === 'inventory' ? 'Track stock levels, costs, and supplier info' : `Manage your ${tabs.find(t => t.id === activeTab)?.label.toLowerCase()} settings and configuration`}
                            </div>
                        </div>
                    </div>
                    <div className="tb-right">
                        <div className="flex items-center gap-3 ml-2">
                            <Popover onOpenChange={(open) => { if (open && unreadNotificationsCount > 0) handleMarkAllRead(true); }}>
                                <PopoverTrigger asChild>
                                    <button className="relative cursor-pointer group outline-none p-1 shrink-0 rounded-md text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                                        <Bell className="w-4 h-4" />
                                        {unreadNotificationsCount > 0 && (
                                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[var(--red)] text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse border-2 border-[var(--bg)]">
                                                {unreadNotificationsCount}
                                            </span>
                                        )}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className={`w-80 p-0 shadow-2xl z-[9999] ${theme === 'light' ? 'bg-white border-zinc-200' : 'bg-[#121214] border-zinc-800'}`} align="end">
                                    <div className={`flex items-center justify-between p-4 border-b ${theme === 'light' ? 'border-zinc-200' : 'border-zinc-800'}`}>
                                        <h3 className={`font-bold text-sm ${theme === 'light' ? 'text-zinc-900' : 'text-white'}`}>Notifications</h3>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="icon" className={`h-6 w-6 ${theme === 'light' ? 'text-zinc-500 hover:text-orange-500' : 'text-zinc-400 hover:text-orange-400'}`} onClick={readLatestChatMessage} title="Read latest chat">
                                                <Volume2 className="h-4 w-4" />
                                            </Button>
                                            {unreadNotificationsCount > 0 && (
                                                <Button variant="ghost" size="sm" className={`text-[10px] hover:opacity-80 p-0 h-auto ${theme === 'light' ? 'text-orange-600' : 'text-orange-500'}`} onClick={() => handleMarkAllRead()}>Mark all read</Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="max-h-[320px] overflow-y-auto">
                                        {notifications.length === 0 ? (
                                            <div className="p-8 text-center">
                                                <Bell className={`w-8 h-8 mx-auto mb-2 opacity-20 ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`} />
                                                <p className={`text-xs ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>No new notifications.</p>
                                            </div>
                                        ) : (
                                            <div className={`divide-y ${theme === 'light' ? 'divide-zinc-200' : 'divide-zinc-800/50'}`}>
                                                {(notifications || []).map((n) => {
                                                    const notificationId = n.id || n._id;
                                                    return (
                                                        <div key={notificationId} className={`p-3.5 cursor-pointer transition-colors ${theme === 'light' ? 'hover:bg-zinc-50' : 'hover:bg-zinc-900/50'} ${!n.isRead ? (theme === 'light' ? 'bg-orange-50' : 'bg-orange-500/10') : ''}`} onClick={() => notificationId && handleMarkAsRead(notificationId)}>
                                                            <div className="flex justify-between items-start gap-2">
                                                                <p className={`text-xs font-bold ${!n.isRead ? (theme === 'light' ? 'text-zinc-900' : 'text-zinc-100') : (theme === 'light' ? 'text-zinc-600' : 'text-zinc-300')}`}>{n.title}</p>
                                                                {!n.isRead && <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${theme === 'light' ? 'bg-orange-500' : 'bg-orange-500'}`} />}
                                                            </div>
                                                            <p className={`text-[11px] mt-0.5 ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>{n.message}</p>
                                                            <p className={`text-[9px] mt-1.5 font-mono uppercase tracking-tighter ${theme === 'light' ? 'text-zinc-400' : 'text-zinc-500'}`}>{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="content">

                    <AnimatePresence mode="wait">
                        {activeTab === 'inventory' && canAccessInventory && (() => {
                            const totalItems = inventory.length;
                            const lowStockCount = inventory.filter(i => (i.stock || 0) <= (i.minLevel || 0)).length;
                            const outOfStockCount = inventory.filter(i => (i.stock || 0) === 0).length;
                            const mostUsedItem = inventory.length > 0 ? [...inventory].sort((a, b) => (a.stock || 0) - (b.stock || 0))[0] : null;

                            return (
                                <motion.div
                                    key="inventory"
                                    variants={pageVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                >
                                    <div className="flex flex-col w-full">
                                        {outOfStockCount > 0 ? (
                                            <div className="alert mt-0" style={{ backgroundColor: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)' }}>
                                                <div className="alert-icon" style={{ background: 'var(--red)', color: 'white' }}>!</div>
                                                <span><strong>Smart Insights:</strong> {outOfStockCount} items are out of stock — immediate restocking required to avoid service disruption.</span>
                                                <button onClick={() => setItemStatusFilter('Out of Stock')} className="ml-auto text-xs underline font-medium hover:text-white transition-colors">View items</button>
                                            </div>
                                        ) : lowStockCount > 0 ? (
                                            <div className="alert mt-0">
                                                <div className="alert-icon">!</div>
                                                <span><strong>Smart Insights:</strong> {lowStockCount} items are running low — consider restocking soon based on current run rate.</span>
                                                <button onClick={() => setItemStatusFilter('Critical')} className="ml-auto text-xs underline font-medium hover:text-orange-300 transition-colors">View items</button>
                                            </div>
                                        ) : null}

                                        <div className="kpi-row mt-4">
                                            <div className="kpi hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => setItemStatusFilter('All')}>
                                                <div className="kpi-label">TOTAL ITEMS</div>
                                                <div className="kpi-val">{totalItems}</div>
                                                <div className="kpi-meta">
                                                    <span className="chip gray">{Array.from(new Set(inventory.map(i => i.category))).length} categories</span>
                                                </div>
                                            </div>
                                            <div className="kpi hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => setItemStatusFilter('Critical')}>
                                                <div className="kpi-label">LOW STOCK</div>
                                                <div className="kpi-val" style={{ color: 'var(--amber)' }}>{lowStockCount}</div>
                                                <div className="kpi-meta">
                                                    {lowStockCount > 0 ? (
                                                        <span className="chip amber text-amber-500"><AlertTriangle className="w-3 h-3" /> Action needed</span>
                                                    ) : (
                                                        <span className="chip green"><CheckCircle className="w-3 h-3" /> Looking good</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="kpi hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => setItemStatusFilter('Out of Stock')}>
                                                <div className="kpi-label text-red-500">OUT OF STOCK</div>
                                                <div className="kpi-val" style={{ color: 'var(--red)' }}>{outOfStockCount}</div>
                                                <div className="kpi-meta">
                                                    {outOfStockCount > 0 ? (
                                                        <span className="chip red">Urgent action required</span>
                                                    ) : (
                                                        <span className="chip green">All items available</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="kpi">
                                                <div className="kpi-label text-blue-400">MOST USED ITEM</div>
                                                <div className="kpi-val text-xl truncate tracking-tight">{mostUsedItem?.name || 'N/A'}</div>
                                                <div className="kpi-meta">
                                                    <span className="chip blue">High consumption</span>
                                                </div>
                                            </div>
                                        </div>

                                        {selectedInventoryItems.length > 0 ? (
                                            <div className="toolbar bg-orange-500/10 border border-orange-500/20" style={{ border: '1px solid rgba(249,115,22,0.2)' }}>
                                                <div className="flex items-center gap-4 flex-1 pl-2">
                                                    <span className="text-orange-500 font-medium text-sm">
                                                        {selectedInventoryItems.length} {selectedInventoryItems.length === 1 ? 'item' : 'items'} selected
                                                    </span>
                                                    <div className="h-4 w-px bg-zinc-700"></div>
                                                    <button onClick={() => setSelectedInventoryItems([])} className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors uppercase tracking-wider">Clear selection</button>
                                                </div>
                                                <div className="toolbar-right">
                                                    <button onClick={() => setShowBulkStockModal(true)} className="btn hover:bg-zinc-800" style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)' }}>
                                                        <RefreshCw className="w-3 h-3 mr-2 inline-block" /> Update Stock
                                                    </button>
                                                    <button onClick={handleBulkDelete} className="btn danger" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--red)', border: 'none' }}>
                                                        <Trash2 className="w-3 h-3 mr-2 inline-block" /> Delete Selected
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="toolbar">
                                                <div className="search-wrap">
                                                    <Search className="si" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search inventory..."
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                    />
                                                </div>

                                                <div className="seg">
                                                    <div className={`seg-item ${itemCategoryFilter === 'All Category' ? 'on' : ''}`} onClick={() => setItemCategoryFilter('All Category')}>All items</div>
                                                    <div className={`seg-item ${itemCategoryFilter === 'Uncategorized' ? 'on' : ''}`} onClick={() => setItemCategoryFilter('Uncategorized')}>Uncategorized</div>
                                                    <div className={`seg-item ${itemCategoryFilter === 'Cleaning Chemicals' ? 'on' : ''}`} onClick={() => setItemCategoryFilter('Cleaning Chemicals')}>Cleaning Chemicals</div>
                                                    <div className={`seg-item ${itemCategoryFilter === 'Waxes & Polishes' ? 'on' : ''}`} onClick={() => setItemCategoryFilter('Waxes & Polishes')}>Waxes & Polishes</div>
                                                    <div className={`seg-item ${itemCategoryFilter === 'Tools & Equipment' ? 'on' : ''}`} onClick={() => setItemCategoryFilter('Tools & Equipment')}>Tools & Equipment</div>
                                                    <div className={`seg-item ${itemCategoryFilter === 'Accessories' ? 'on' : ''}`} onClick={() => setItemCategoryFilter('Accessories')}>Accessories</div>
                                                </div>

                                                <div className="toolbar-right">
                                                    <button className="btn">
                                                        <Download className="w-3.5 h-3.5" /> Export
                                                    </button>
                                                    <button className="btn">
                                                        <LayoutGrid className="w-3.5 h-3.5" /> View
                                                    </button>
                                                    <button className="btn"><ArrowDown className="w-3 h-3" /> Sort</button>
                                                    <button className="btn"><Filter className="w-3 h-3" /> Filter</button>

                                                    <Dialog open={showInventoryModal} onOpenChange={setShowInventoryModal}>
                                                        <DialogTrigger asChild>
                                                            <button
                                                                className="btn primary"
                                                                onClick={() => {
                                                                    resetInventoryForm();
                                                                    setShowInventoryModal(true);
                                                                }}
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                                Add Item
                                                            </button>
                                                        </DialogTrigger>
                                                        <DialogContent className={theme === 'light' ? 'bg-white sm:max-w-[650px]' : 'bg-[#0c0c0e] border-[#27272a]/50 sm:max-w-[650px] shadow-2xl shadow-orange-500/5'}>
                                                            <DialogHeader className="pb-4 border-b border-zinc-800/50 mb-4">
                                                                <DialogTitle className={`text-xl font-bold tracking-tight ${theme === 'light' ? 'text-gray-900' : 'text-zinc-100 flex items-center gap-2'}`}>
                                                                    <div className="p-2 bg-orange-500/10 rounded-lg">
                                                                        <Package className="w-5 h-5 text-orange-500" />
                                                                    </div>
                                                                    {isEditingInventory ? 'Update Inventory Item' : 'Register New Item'}
                                                                </DialogTitle>
                                                                <p className={`text-xs mt-1.5 ${theme === 'light' ? 'text-gray-500 ml-0' : 'text-zinc-500 ml-[44px]'}`}>Fill out the details below to track this item in your inventory system.</p>
                                                            </DialogHeader>

                                                            <div className="space-y-6">
                                                                {/* SECTION 1: Item Identification */}
                                                                <div className="space-y-4">
                                                                    <h4 className={`text-[10px] uppercase tracking-widest font-bold pb-2 ${theme === 'light' ? 'text-gray-500 border-b border-gray-200' : 'text-zinc-500 border-b border-zinc-800/60'}`}>Item Identification</h4>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        <div className="space-y-1.5">
                                                                            <Label className={theme === 'light' ? 'text-xs font-bold text-gray-700 uppercase tracking-widest' : 'text-[11px] font-bold tracking-widest uppercase text-zinc-400'}>Item Name</Label>
                                                                            <Input
                                                                                value={itemName}
                                                                                placeholder="e.g. Ceramic Coating Spray"
                                                                                onChange={(e) => setItemName(e.target.value)}
                                                                                className={theme === 'light' ? 'bg-gray-50 border-gray-200 focus:ring-orange-500 focus:border-orange-500' : 'bg-[#121214] border-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50'}
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label className={theme === 'light' ? 'text-xs font-bold text-gray-700 uppercase tracking-widest' : 'text-[11px] font-bold tracking-widest uppercase text-zinc-400'}>Category</Label>
                                                                            <Select value={itemCategory} onValueChange={setItemCategory}>
                                                                                <SelectTrigger className={theme === 'light' ? 'bg-gray-50 border-gray-200 focus:ring-orange-500 focus:border-orange-500' : 'bg-[#121214] border-zinc-800/60 text-zinc-200 focus:ring-orange-500/50'}>
                                                                                    <SelectValue placeholder="Select Category" />
                                                                                </SelectTrigger>
                                                                                <SelectContent className={theme === 'light' ? 'bg-white border-gray-200' : 'bg-[#18181b] border-zinc-800 text-zinc-200'}>
                                                                                    <SelectItem value="Uncategorized">Uncategorized</SelectItem>
                                                                                    <SelectItem value="Cleaning Chemicals">Cleaning Chemicals</SelectItem>
                                                                                    <SelectItem value="Waxes & Polishes">Waxes & Polishes</SelectItem>
                                                                                    <SelectItem value="Tools & Equipment">Tools & Equipment</SelectItem>
                                                                                    <SelectItem value="Accessories">Accessories</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                        <div className="space-y-1.5 md:col-span-2">
                                                                            <Label className={theme === 'light' ? 'text-xs font-bold text-gray-700 uppercase tracking-widest' : 'text-[11px] font-bold tracking-widest uppercase text-zinc-400'}>SKU (Item Code)</Label>
                                                                            <div className="relative">
                                                                                <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme === 'light' ? 'text-gray-400' : 'text-zinc-500'}`}><Tag className="w-3.5 h-3.5" /></span>
                                                                                <Input
                                                                                    value={itemSku}
                                                                                    placeholder="e.g. CHM-CC-001"
                                                                                    onChange={(e) => setItemSku(e.target.value)}
                                                                                    className={theme === 'light' ? 'pl-9 bg-gray-50 border-gray-200 focus:ring-orange-500 focus:border-orange-500' : 'pl-9 bg-[#121214] border-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50'}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* SECTION 2: Stock Metrics */}
                                                                <div className="space-y-4 pt-1">
                                                                    <h4 className={`text-[10px] uppercase tracking-widest font-bold pb-2 ${theme === 'light' ? 'text-gray-500 border-b border-gray-200' : 'text-zinc-500 border-b border-zinc-800/60'}`}>Stock Metrics</h4>
                                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                        <div className="space-y-1.5">
                                                                            <Label className={theme === 'light' ? 'text-[10px] font-bold text-gray-700 uppercase tracking-widest' : 'text-[10px] font-bold tracking-widest uppercase text-zinc-400'}>Initial Qty</Label>
                                                                            <Input type="number" value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} placeholder="0" className={theme === 'light' ? 'bg-gray-50 border-gray-200 focus:ring-orange-500 focus:border-orange-500' : 'bg-[#121214] border-zinc-800/60 text-zinc-200 font-mono'} />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label className={theme === 'light' ? 'text-[10px] font-bold text-gray-700 uppercase tracking-widest' : 'text-[10px] font-bold tracking-widest uppercase text-zinc-400'}>Unit</Label>
                                                                            <Input value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} placeholder="pcs, ml, L" className={theme === 'light' ? 'bg-gray-50 border-gray-200 focus:ring-orange-500 focus:border-orange-500' : 'bg-[#121214] border-zinc-800/60 text-zinc-200 text-center'} />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label className={theme === 'light' ? 'text-[10px] font-bold text-gray-700 uppercase tracking-widest' : 'text-[10px] font-bold tracking-widest uppercase text-zinc-400'}>Min Level</Label>
                                                                            <Input type="number" value={itemMinLevel} onChange={(e) => setItemMinLevel(e.target.value)} placeholder="5" className={theme === 'light' ? 'bg-gray-50 border-gray-200 focus:ring-orange-500 border-l-[3px] border-l-red-500' : 'bg-[#121214] border-zinc-800/60 text-zinc-200 font-mono text-orange-200/70 border-l-[3px] border-l-red-500/50'} />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label className={theme === 'light' ? 'text-[10px] font-bold text-gray-700 uppercase tracking-widest' : 'text-[10px] font-bold tracking-widest uppercase text-zinc-400'}>Max Level</Label>
                                                                            <Input type="number" value={itemMaxLevel} onChange={(e) => setItemMaxLevel(e.target.value)} placeholder="50" className={theme === 'light' ? 'bg-gray-50 border-gray-200 focus:ring-orange-500 border-l-[3px] border-l-emerald-500' : 'bg-[#121214] border-zinc-800/60 text-zinc-200 font-mono border-l-[3px] border-l-emerald-500/50'} />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* SECTION 3: Cost & Supplier */}
                                                                <div className="space-y-4 pt-1">
                                                                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#121214]/50 border-zinc-800/40'}`}>
                                                                        <div className="space-y-1.5">
                                                                            <Label className={theme === 'light' ? 'text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1.5' : 'text-[11px] font-bold tracking-widest uppercase text-zinc-400 flex items-center gap-1.5'}><DollarSign className="w-3.5 h-3.5" /> Unit Cost</Label>
                                                                            <div className="relative">
                                                                                <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold ${theme === 'light' ? 'text-gray-500' : 'text-zinc-500'}`}>₱</span>
                                                                                <Input type="number" step="0.01" value={itemCost} onChange={(e) => setItemCost(e.target.value)} placeholder="0.00" className={theme === 'light' ? 'pl-7 bg-white border-gray-200 focus:ring-orange-500 focus:border-orange-500' : 'pl-7 bg-[#0c0c0e] border-zinc-800/60 text-zinc-200 font-mono text-emerald-400'} />
                                                                            </div>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label className={theme === 'light' ? 'text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1.5' : 'text-[11px] font-bold tracking-widest uppercase text-zinc-400 flex items-center gap-1.5'}><Truck className="w-3.5 h-3.5" /> Supplier</Label>
                                                                            <Input value={itemSupplier} onChange={(e) => setItemSupplier(e.target.value)} placeholder="Supplier Name" className={theme === 'light' ? 'bg-white border-gray-200 focus:ring-orange-500 focus:border-orange-500' : 'bg-[#0c0c0e] border-zinc-800/60 text-zinc-200'} />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* BUTTONS */}
                                                                <div className={`pt-4 border-t flex gap-3 ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800/50'}`}>
                                                                    <DialogClose asChild>
                                                                        <Button variant="ghost" className={`w-1/3 ${theme === 'light' ? 'text-gray-600 hover:bg-gray-100' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} disabled={isLoading}>Cancel</Button>
                                                                    </DialogClose>
                                                                    <Button
                                                                        onClick={handleAddInventory}
                                                                        disabled={isLoading}
                                                                        className="w-2/3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-lg shadow-orange-900/20 border border-orange-500/30 transition-all font-semibold"
                                                                    >
                                                                        {isLoading ? (
                                                                            <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</span>
                                                                        ) : isEditingInventory ? (
                                                                            <span className="flex items-center gap-2"><Save className="w-4 h-4" /> Save Changes</span>
                                                                        ) : (
                                                                            <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add Item to Inventory</span>
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </DialogContent>
                                                    </Dialog>
                                                </div>
                                            </div>
                                        )}

                                        <div className="table-wrap">
                                            <div className="table-head">
                                                <div className="th flex items-center justify-center">
                                                    <Checkbox
                                                        checked={filteredInventory.length > 0 && selectedInventoryItems.length === filteredInventory.length}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedInventoryItems(filteredInventory.map(i => i.id || (i as any)._id));
                                                            } else {
                                                                setSelectedInventoryItems([]);
                                                            }
                                                        }}
                                                        className="border-zinc-500 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                                                    />
                                                </div>
                                                <div className="th">ITEM</div>
                                                <div className="th">CATEGORY</div>
                                                <div className="th">STOCK</div>
                                                <div className="th">UNIT COST</div>
                                                <div className="th">STATUS</div>
                                                <div className="th" style={{ justifyContent: 'flex-end', paddingRight: '12px' }}>ACTIONS</div>
                                            </div>

                                            <div className="tbody">
                                                {filteredInventory.map(item => {
                                                    const isCritical = item.stock < 5;
                                                    const isWarn = item.stock >= 5 && item.stock < 10;
                                                    const isOut = item.stock === 0;
                                                    const statusClass = isOut ? 'row-crit' : (isCritical ? 'row-crit' : (isWarn ? 'row-warn' : 'row-ok'));
                                                    const spClass = isOut ? 'sp-crit' : (isCritical ? 'sp-crit' : (isWarn ? 'sp-warn' : 'sp-good'));
                                                    const spText = isOut ? 'Out of Stock' : (isCritical ? 'Critical' : (isWarn ? 'Warning' : 'Optimal'));

                                                    const catLower = item.category.toLowerCase();
                                                    let pillColor = 'pill-gray';
                                                    if (catLower.includes('chemical') || catLower.includes('liquid')) pillColor = 'pill-blue';
                                                    else if (catLower.includes('tool') || catLower.includes('equip')) pillColor = 'pill-amber';
                                                    else if (catLower.includes('access')) pillColor = 'pill-purple';
                                                    else if (catLower.includes('pad') || catLower.includes('polish')) pillColor = 'pill-green';

                                                    const stockPercentage = Math.min((item.stock / (item.minLevel * 3)) * 100, 100);
                                                    const barColor = isCritical ? 'var(--red)' : (isWarn ? 'var(--amber)' : 'var(--green)');

                                                    return (
                                                        <div className={`row ${statusClass}`} key={item.id || item._id}>
                                                            <div className="flex items-center justify-center">
                                                                <Checkbox
                                                                    checked={selectedInventoryItems.includes(item.id || (item as any)._id)}
                                                                    onCheckedChange={(checked) => {
                                                                        const id = item.id || (item as any)._id;
                                                                        if (checked) {
                                                                            setSelectedInventoryItems(prev => [...prev, id]);
                                                                        } else {
                                                                            setSelectedInventoryItems(prev => prev.filter(i => i !== id));
                                                                        }
                                                                    }}
                                                                    className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                                                                />
                                                            </div>
                                                            <div className="item-info">
                                                                <div className="item-icon">
                                                                    {item.image ? (
                                                                        <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-md" />
                                                                    ) : (
                                                                        <Package className="w-4 h-4 opacity-70" />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div className="item-name flex items-center gap-1.5">
                                                                        {(isCritical || isOut) && <AlertTriangle size={14} className="text-red-500" />}
                                                                        {item.name}
                                                                    </div>
                                                                    <div className="item-cat">Supplier: {item.supplier || 'Manual'}</div>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <div className={`cat-pill ${pillColor}`}>{item.category}</div>
                                                            </div>

                                                            <div className="stock-cell">
                                                                <div className="stock-num">{item.stock} <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{item.unit}</span></div>
                                                                <div className="mini-bar">
                                                                    <div className="mini-fill" style={{ width: `${stockPercentage}%`, background: barColor }} />
                                                                </div>
                                                            </div>

                                                            <div className="cost-val">
                                                                ₱{(item.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </div>

                                                            <div>
                                                                <span className={`status-pill ${spClass}`}>
                                                                    <span className="dot" /> {spText}
                                                                </span>
                                                            </div>

                                                            <div className="row-actions flex items-center gap-1">
                                                                <button className="ra px-2 py-1 flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300" title="Restock" onClick={(e) => { e.stopPropagation(); setRestockItemId(item.id || (item as any)._id); setShowRestockModal(true); }}>
                                                                    <RefreshCw size={12} /> +Qty
                                                                </button>
                                                                <button className="ra px-2 py-1" title="Edit" onClick={(e) => { e.stopPropagation(); handleEditInventory(item); }}>
                                                                    Edit
                                                                </button>
                                                                <button className="ra danger px-2 py-1" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteInventory(item.id, item.name); }}>
                                                                    Del
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {filteredInventory.length === 0 && (
                                                    <div className="row" style={{ justifyContent: 'center', padding: '32px' }}>
                                                        <div className="text-[#52525b] text-sm flex items-center gap-2">
                                                            <Package className="w-4 h-4 opacity-50" />
                                                            No items found matching your filter.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {(filteredInventory.length > 0) && (
                                                <div className="table-footer">
                                                    <div className="tf-info">Showing {filteredInventory.length} of {inventory.length} items</div>
                                                    <div className="pag">
                                                        <button className="pg"><ChevronLeft className="w-4 h-4" /></button>
                                                        <button className="pg on">1</button>
                                                        <button className="pg"><ChevronRight className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })()}


                        {(canAccessBookings || canAccessAppointments) && (activeTab === 'bookings' || activeTab === 'appointments') && (
                            <motion.div key="bookings" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col w-full h-[calc(100vh-180px)] min-h-[600px]">
                                <SmartCalendar
                                    bookings={safeBookings}
                                    users={users}
                                    services={services}
                                    isDarkMode={isDarkMode}
                                    settings={settings}
                                    selectedBookingId={selectedBookingsPanelId}
                                    onSelectBooking={setSelectedBookingsPanelId}
                                    onNewBooking={() => setIsBookingDetailOpen(true)}
                                    onReschedule={(b) => {
                                        setDetailBooking(b);
                                        setEditDate(b.bookingDate || (b as any).schedule?.date || '');
                                        setEditTime(b.bookingTime || (b as any).schedule?.time || '');
                                        setIsEditScheduleOpen(true);
                                    }}
                                    onUpdateStatus={(b) => {
                                        setSelectedBooking(b);
                                        setShowAssignModal(true);
                                    }}
                                />
                            </motion.div>
                        )}

                        {canAccessWaivers && activeTab === 'waivers' && (
                            <motion.div key="waivers" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="w-full">
                                <WaiversDocs bookings={safeBookings} />
                            </motion.div>
                        )}

                        {activeTab === 'ai_estimator' && (
                            <motion.div key="ai_estimator" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="w-full">
                                <AIEstimatorEmbed />
                            </motion.div>
                        )}

                        {activeTab === 'pos' && canAccessPOS && (
                            <motion.div key="pos" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                                <POSSystem
                                    bookings={bookings}
                                    services={services}
                                    users={users}
                                    payments={payments}
                                    settings={settings}
                                    onTransactionComplete={() => loadData()}
                                />
                            </motion.div>
                        )}


                        {activeTab === 'users' && (canAccessUsers || canRegisterUsers) && (
                            <UserManagementPanel theme={theme} users={users} loadData={loadData} currentUserRole={user?.role} />
                        )}

                        {activeTab === 'suppliers' && canAccessSupplierModule && (
                            <motion.div key="suppliers" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                                <SupplierManagement
                                    suppliers={suppliers}
                                    onAddSupplier={() => { resetSupplierForm(); setShowSupplierModal(true); }}
                                    onEditSupplier={handleEditSupplier}
                                    onOrder={handleOpenOrderModal}
                                />

                                {/* Maintain the add/edit modal as controlled from AdminDashboard state */}
                                <Dialog open={showSupplierModal} onOpenChange={setShowSupplierModal}>
                                    <DialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                                        <DialogHeader>
                                            <DialogTitle className={theme === 'light' ? 'text-gray-900' : 'text-white'}>
                                                {isEditingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
                                            </DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                            <div>
                                                <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Company Name</Label>
                                                <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'} />
                                            </div>
                                            <div>
                                                <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Contact Person</Label>
                                                <Input value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'} />
                                            </div>
                                            <div>
                                                <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Email</Label>
                                                <Input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'} />
                                            </div>
                                            <div>
                                                <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Phone</Label>
                                                <Input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'} />
                                            </div>
                                            <div>
                                                <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Products (comma-separated)</Label>
                                                <Input value={supplierProducts} onChange={(e) => setSupplierProducts(e.target.value)} className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'} />
                                            </div>
                                            <Button onClick={handleAddSupplier} disabled={isLoading} className="w-full bg-orange-600 hover:bg-orange-700">
                                                {isLoading ? 'Saving...' : isEditingSupplier ? 'Update Supplier' : 'Add Supplier'}
                                            </Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </motion.div>
                        )}

                        {activeTab === 'pricing' && canAccessPricing && (
                            <motion.div key="pricing" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                                <ServicesPricing
                                    services={services}
                                    onRefresh={() => loadData()}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'activity' && canAccessReports && (
                            <motion.div key="activity" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                                <ActivityLogs
                                    activityLogs={activityLogs}
                                    onRefresh={() => loadData()}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'landing' && canAccessLanding && (
                            <motion.div key="landing" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="p-4 sm:p-6 lg:p-8 space-y-6">
                                <LandingPageEditor
                                    settings={settings}
                                    setSettings={setSettings}
                                    onSave={(partial) => handleSaveSettings(partial)}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'profile' && (
                            <div className="flex-1 bg-[var(--bg)] text-[var(--text)] overflow-y-auto">
                                <div className="profile-hero">
                                    <div className="hero-avatar">
                                        {profilePhoto ? (
                                            <img src={profilePhoto} alt="Profile" />
                                        ) : (
                                            user?.name?.charAt(0).toUpperCase() || 'A'
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                            title="Upload Profile Photo"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (ev) => {
                                                        const p = ev.target?.result as string;
                                                        setProfilePhoto(p);
                                                        toast.success('Profile photo updated.');
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="hero-info">
                                        <h1>{user?.name || 'Administrator'}</h1>
                                        <div className="hero-sub">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="hero-role-badge">{getRoleDisplayName(user?.role)}</span>
                                                <span className="hero-status-badge">
                                                    <span className="status-dot"></span> Active Session
                                                </span>
                                            </div>
                                            <span>{user?.email}</span>
                                        </div>
                                    </div>
                                    <div className="hero-stats">
                                        <div className="stat-item">
                                            <span className="stat-val">
                                                {user?.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Today'}
                                            </span>
                                            <span className="stat-lbl">Last login</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-val text-[var(--green)]">1</span>
                                            <span className="stat-lbl">Active session</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-val">
                                                {user?.createdAt 
                                                    ? Math.max(1, Math.floor((new Date().getTime() - new Date(user.createdAt).getTime()) / (1000 * 3600 * 24))) 
                                                    : '1'}
                                            </span>
                                            <span className="stat-lbl">Days active</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="profile-tabs">
                                    <button className={`profile-tab ${activeProfileTab === 'general' ? 'active' : ''}`} onClick={() => setActiveProfileTab('general')}>General</button>
                                    <button className={`profile-tab ${activeProfileTab === 'security' ? 'active' : ''}`} onClick={() => setActiveProfileTab('security')}>Security</button>
                                    <button className={`profile-tab ${activeProfileTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveProfileTab('sessions')}>Sessions</button>
                                    <button className={`profile-tab ${activeProfileTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveProfileTab('activity')}>Activity</button>
                                </div>

                                <div className="profile-content">
                                    <div className="left-col md:pr-6 md:border-r border-zinc-200 dark:border-zinc-800/50">
                                        {activeProfileTab === 'general' && (
                                            <div className="space-y-8 animate-in fade-in duration-500">
                                                <div>
                                                    <h3 className={`text-lg font-bold tracking-tight mb-1 ${theme === 'light' ? 'text-zinc-900' : 'text-white'}`}>Personal Information</h3>
                                                    <p className={`text-[13px] ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>Manage your administrative identity and profile settings.</p>
                                                </div>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <Label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>First name</Label>
                                                        <Input className={`h-11 ${theme === 'light' ? 'bg-zinc-50 border-zinc-200 focus:bg-white' : 'bg-[#09090b] border-zinc-800'} transition-all`} type="text" value={profileFirstName} onChange={(e) => setProfileFirstName(e.target.value)} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>Last name</Label>
                                                        <Input className={`h-11 ${theme === 'light' ? 'bg-zinc-50 border-zinc-200 focus:bg-white' : 'bg-[#09090b] border-zinc-800'} transition-all`} type="text" value={profileLastName} onChange={(e) => setProfileLastName(e.target.value)} />
                                                    </div>
                                                </div>
                                                
                                                <div className="space-y-6">
                                                    <div className="space-y-2">
                                                        <Label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>Email address</Label>
                                                        <Input className={`h-11 ${theme === 'light' ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-zinc-900/50 border-zinc-800 text-zinc-500'} cursor-not-allowed`} type="email" defaultValue={user?.email || ''} readOnly />
                                                        <p className="text-[11px] text-zinc-500 mt-1">Used for login and notifications</p>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>Display name</Label>
                                                        <Input className={`h-11 ${theme === 'light' ? 'bg-zinc-50 border-zinc-200 focus:bg-white' : 'bg-[#09090b] border-zinc-800'} transition-all`} type="text" placeholder="e.g. Admin Team" value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} />
                                                        <p className="text-[11px] text-zinc-500 mt-1">Visible to other users in the system</p>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>Role</Label>
                                                        <Input className={`h-11 ${theme === 'light' ? 'bg-zinc-100 border-zinc-200 text-zinc-500' : 'bg-zinc-900/50 border-zinc-800 text-zinc-500'} cursor-not-allowed`} type="text" value={getRoleDisplayName(user?.role)} readOnly />
                                                    </div>
                                                </div>
                                                
                                                <div className={`mt-8 pt-6 border-t ${theme === 'light' ? 'border-zinc-200' : 'border-zinc-800'} flex flex-col sm:flex-row justify-between items-center gap-4`}>
                                                    <span className="text-[12px] text-zinc-500">Last updated Today</span>
                                                    <Button onClick={handleUpdatePersonalInformation} disabled={isSavingProfile} className="bg-orange-500 hover:bg-orange-600 text-white font-medium hover:brightness-110 w-full sm:w-auto transition-all shadow-md px-8">
                                                        {isSavingProfile ? 'Saving...' : 'Save changes'}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {activeProfileTab === 'security' && (
                                            <div className="profile-card">
                                                <h3>Change Password</h3>
                                                <div className="form-group">
                                                    <label>Current password</label>
                                                    <input type="password" value={profileCurrentPassword} onChange={(e) => setProfileCurrentPassword(e.target.value)} />
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>New password</label>
                                                        <input type="password" value={profileNewPassword} onChange={(e) => setProfileNewPassword(e.target.value)} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Confirm new password</label>
                                                        <input type="password" value={profileConfirmPassword} onChange={(e) => setProfileConfirmPassword(e.target.value)} />
                                                    </div>
                                                </div>
                                                <div className="profile-actions">
                                                    <span className="update-info">Must be at least 8 characters</span>
                                                    <Button size="sm" onClick={handleUpdatePassword} disabled={isUpdatingPassword} className="bg-[var(--surface3)] text-[var(--text2)] hover:bg-[var(--surface3)] hover:text-[var(--text)] transition-colors border border-[var(--border)]">
                                                        {isUpdatingPassword ? 'Updating...' : 'Update password'}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {activeProfileTab === 'sessions' && (
                                            <div className="profile-card">
                                                <h3>Active Sessions</h3>
                                                <p className="text-[12px] text-[var(--text3)] mb-4">View and manage your active login sessions across devices.</p>
                                                <div className="flex flex-col gap-4 text-[13px] text-[var(--text2)] mt-4">
                                                    <div className="flex justify-between items-center pb-4 border-b border-[var(--border)]">
                                                        <div>
                                                            <div className="text-[var(--text)] font-semibold mb-1">{(() => {
                                                                const ua = navigator.userAgent;
                                                                let os = 'Unknown OS';
                                                                if (ua.includes('Win')) os = 'Windows';
                                                                if (ua.includes('Mac')) os = 'Mac OS';
                                                                if (ua.includes('Linux')) os = 'Linux';
                                                                if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
                                                                if (ua.includes('Android')) os = 'Android';
                                                                
                                                                let browser = 'Unknown Browser';
                                                                if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
                                                                if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
                                                                if (ua.includes('Firefox')) browser = 'Firefox';
                                                                if (ua.includes('Edg')) browser = 'Edge';
                                                                
                                                                return `${os} • ${browser}`;
                                                            })()}</div>
                                                            <div className="text-[var(--text3)] text-[11px]">Current Session • {navigator.language || 'en-US'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[var(--green)] font-semibold mb-1 text-[11px] uppercase tracking-wide">Active Now</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <div className="text-[var(--text)] font-semibold mb-1">Mobile App • iOS</div>
                                                            <div className="text-[var(--text3)] text-[11px]">Manila, Philippines</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[var(--text3)] mb-1 text-[11px] uppercase tracking-wide">Yesterday</div>
                                                            <button className="text-[var(--accent)] hover:underline text-[12px]">Logout session</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {activeProfileTab === 'activity' && (
                                            <div className="profile-card">
                                                <h3>Recent Activity</h3>
                                                <p className="text-[12px] text-[var(--text3)] mb-4">A log of recent changes to your profile and account.</p>
                                                <div className="flex flex-col gap-4 text-[13px] text-[var(--text2)] mt-4">
                                                    <div className="pb-4 border-b border-[var(--border)]">
                                                        <div className="text-[var(--text)] font-semibold mb-1">Updated Profile Information</div>
                                                        <div className="text-[var(--text3)]">Today at 2:15 PM</div>
                                                    </div>
                                                    <div className="pb-4 border-b border-[var(--border)]">
                                                        <div className="text-[var(--text)] font-semibold mb-1">Changed Password</div>
                                                        <div className="text-[var(--text3)]">Yesterday at 1:00 PM</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[var(--text)] font-semibold mb-1">Logged in from Safari (Mac OS)</div>
                                                        <div className="text-[var(--text3)]">Yesterday at 9:00 AM</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="right-col flex flex-col gap-6">
                                        <div className={`p-6 rounded-xl border flex flex-col items-center relative shadow-sm ${theme === 'light' ? 'bg-white border-zinc-200' : 'bg-[#121214] border-zinc-800'}`}>
                                            <div className="w-full flex justify-between items-center mb-6">
                                                <h3 className={`font-bold text-sm tracking-wide uppercase ${theme === 'light' ? 'text-zinc-600' : 'text-zinc-400'}`}>Profile Photo</h3>
                                                {profilePhoto && (
                                                    <button
                                                        className="text-[10px] text-red-500 hover:text-red-400 transition-colors uppercase font-bold tracking-wider px-2 py-1 bg-red-500/10 rounded-md"
                                                        onClick={() => { setProfilePhoto(null); toast.success('Profile photo removed'); }}
                                                    >Remove</button>
                                                )}
                                            </div>
                                            
                                            <div className="relative group mb-4">
                                                <div className={`w-36 h-36 rounded-full overflow-hidden flex items-center justify-center text-4xl font-bold tracking-tighter border-[6px] shadow-2xl transition-all duration-300 ${theme === 'light' ? 'bg-zinc-100 border-white text-zinc-400 shadow-zinc-200/50' : 'bg-zinc-900 border-[#1a1a1f] text-zinc-600 shadow-black/80'} group-hover:scale-105`}>
                                                    {profilePhoto ? (
                                                        <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span>{user?.name?.charAt(0).toUpperCase() || 'A'}</span>
                                                    )}
                                                </div>
                                                
                                                <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300 cursor-pointer border-[6px] border-transparent scale-105 group-hover:scale-105">
                                                    <span className="text-white text-xs font-semibold tracking-wide uppercase">Change</span>
                                                    <input
                                                        title="Upload profile photo"
                                                        type="file"
                                                        accept="image/*"
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onload = (ev) => {
                                                                    setProfilePhoto(ev.target?.result as string);
                                                                    toast.success('Profile photo updated.');
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <p className={`text-[12px] mb-6 text-center ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                Click the avatar or upload button
                                            </p>
                                            
                                            <div className="flex justify-center w-full mb-6">
                                                <Button size="sm" className="bg-orange-500 text-white hover:bg-orange-600 font-medium relative w-full transition-colors shadow-md">
                                                    Upload photo
                                                    <input
                                                        title="Upload profile photo"
                                                        type="file"
                                                        accept="image/*"
                                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onload = (ev) => {
                                                                    setProfilePhoto(ev.target?.result as string);
                                                                    toast.success('Profile photo updated.');
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                </Button>
                                            </div>
                                            
                                            <div className={`w-full text-center border-t pt-5 ${theme === 'light' ? 'border-zinc-200/80 text-zinc-500' : 'border-zinc-800/80 text-zinc-500'}`}>
                                                <p className="text-[10px] leading-relaxed tracking-wide">
                                                    Accepted: JPG, PNG • Max 2 MB<br />Recommended 256×256 px
                                                </p>
                                            </div>
                                        </div>

                                        <div className={`p-6 rounded-xl border flex flex-col shadow-sm ${theme === 'light' ? 'bg-white border-zinc-200' : 'bg-[#121214] border-zinc-800'}`}>
                                            <h3 className={`font-bold text-sm tracking-wide uppercase mb-5 ${theme === 'light' ? 'text-zinc-600' : 'text-zinc-400'}`}>Account Details</h3>
                                            <div className="flex flex-col gap-4 text-[12px]">
                                                <div className={`flex justify-between items-center pb-3 border-b ${theme === 'light' ? 'border-zinc-100' : 'border-zinc-800/50'}`}>
                                                    <span className={`${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'} font-medium`}>User ID</span>
                                                    <span className={`${theme === 'light' ? 'text-zinc-800' : 'text-white'} font-mono bg-zinc-100 dark:bg-[#1a1a1f] px-2 py-1 rounded text-[10px] shadow-inner`}>#{isAdminDashboardRole(user?.role) ? 'ADM' : 'STF'}-{String(user?._id || '0001').slice(-4).toUpperCase()}</span>
                                                </div>
                                                <div className={`flex justify-between items-center pb-3 border-b ${theme === 'light' ? 'border-zinc-100' : 'border-zinc-800/50'}`}>
                                                    <span className={`${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'} font-medium`}>Role</span>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <BadgeCheck className="w-4 h-4 text-orange-500" />
                                                        <span className="text-orange-500 bg-orange-500/10 px-2 py-1 rounded text-[10px] font-bold tracking-widest uppercase">{getRoleDisplayName(user?.role)}</span>
                                                    </div>
                                                </div>
                                                <div className={`flex justify-between items-center pb-3 border-b ${theme === 'light' ? 'border-zinc-100' : 'border-zinc-800/50'}`}>
                                                    <span className={`${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'} font-medium`}>Status</span>
                                                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${user?.isActive !== false ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                                                        {user?.isActive !== false ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                                <div className={`flex justify-between items-center pb-3 border-b ${theme === 'light' ? 'border-zinc-100' : 'border-zinc-800/50'}`}>
                                                    <span className={`${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'} font-medium`}>Member since</span>
                                                    <span className={`${theme === 'light' ? 'text-zinc-800' : 'text-white'} text-[11px] font-medium tracking-wide`}>
                                                        {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jan 1, 2025'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center pt-1">
                                                    <span className={`${theme === 'light' ? 'text-zinc-500' : 'text-zinc-400'} font-medium`}>Last login</span>
                                                    <span className={`${theme === 'light' ? 'text-zinc-800' : 'text-white'} text-[11px] font-medium tracking-wide`}>
                                                        {user?.lastActive ? new Date(user.lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Today, 2:15 PM'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'settings' && canAccessSettings && (
                            <motion.div key="settings" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="p-4 sm:p-6 lg:p-8 space-y-6">
                                <AdminSettings
                                    settings={settings}
                                    isDarkMode={theme === 'dark'}
                                    onSave={handleSaveSettings}
                                    onExportData={handleExportData}
                                    onBackupDB={handleBackupDB}
                                    onClearCache={handleClearCache}
                                    onResetSystem={() => setShowResetModal(true)}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modals */}
            <Dialog open={showAssignModal} onOpenChange={(open) => {
                setShowAssignModal(open);
                if (open) {
                    const currentStatus = selectedBooking?.status || 'pending';
                    const validStatuses = ['pending', 'confirmed', 'received', 'in_progress', 'completed', 'paid', 'released'];
                    setOperationalAction(validStatuses.includes(currentStatus) ? currentStatus : 'pending');
                }
            }}>
                <DialogContent className={`${theme === 'light' ? 'bg-white' : 'bg-[#08080a] border-zinc-800/60 backdrop-blur-xl'} max-w-xl p-0 overflow-hidden duration-300 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 shadow-[0_25px_60px_rgba(0,0,0,0.5)]`}>

                    {/* ═══ ORANGE TOP GLOW LINE ═══ */}
                    <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-80" />

                    {selectedBooking && (() => {
                        const stepOrder = ['pending', 'confirmed', 'received', 'in_progress', 'completed', 'paid', 'released'];
                        const currentIdx = stepOrder.indexOf(operationalAction);
                        const plateVal = selectedBooking.vehiclePlate || '';
                        const isEncrypted = plateVal.includes(':') && plateVal.length > 20;

                        return (
                            <>
                                {/* ═══ HEADER: Vehicle Hero ═══ */}
                                <div className={`px-6 pt-5 pb-5 ${theme === 'light' ? 'bg-gradient-to-b from-orange-50/60 to-white' : 'bg-gradient-to-b from-orange-950/15 via-[#0c0c0e] to-[#08080a]'}`}>
                                    <div className="flex items-start gap-4">
                                        <div className="relative flex-shrink-0">
                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 flex items-center justify-center shadow-[0_8px_24px_rgba(249,115,22,0.35)]">
                                                <Car className="w-7 h-7 text-white" />
                                            </div>
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${theme === 'light' ? 'border-white' : 'border-[#08080a]'} ${currentIdx <= 1 ? 'bg-amber-400' : currentIdx <= 3 ? 'bg-emerald-400' : 'bg-blue-400'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full bg-white ${currentIdx <= 3 ? 'animate-pulse' : ''}`} />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`text-lg font-bold tracking-tight truncate ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                                                {selectedBooking.vehicleYear} {selectedBooking.vehicleMake} {selectedBooking.vehicleModel}
                                            </h3>
                                            <p className={`text-sm mt-0.5 ${theme === 'light' ? 'text-gray-500' : 'text-zinc-400'}`}>
                                                {selectedBooking.serviceType || 'Premium Detailing Service'}
                                            </p>
                                        </div>
                                        {!isEncrypted && plateVal && (
                                            <div className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold tracking-wider ${theme === 'light' ? 'bg-gray-100 text-gray-800 border border-gray-200' : 'bg-zinc-800/80 text-zinc-200 border border-zinc-700/50'}`}>
                                                {plateVal}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info Grid */}
                                    <div className={`grid grid-cols-3 gap-3 mt-4 p-3 rounded-xl border ${theme === 'light' ? 'bg-white border-gray-100 shadow-sm' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${theme === 'light' ? 'bg-blue-50' : 'bg-blue-500/10'}`}>
                                                <UserIcon className="w-4 h-4 text-blue-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-gray-400' : 'text-zinc-500'}`}>Customer</p>
                                                <p className={`text-xs font-semibold truncate ${theme === 'light' ? 'text-gray-800' : 'text-white'}`}>{selectedBooking.customerName || 'N/A'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${theme === 'light' ? 'bg-violet-50' : 'bg-violet-500/10'}`}>
                                                <Calendar className="w-4 h-4 text-violet-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-gray-400' : 'text-zinc-500'}`}>Schedule</p>
                                                <p className={`text-xs font-semibold truncate ${theme === 'light' ? 'text-gray-800' : 'text-white'}`}>{selectedBooking.bookingDate || 'TBD'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${theme === 'light' ? 'bg-orange-50' : 'bg-orange-500/10'}`}>
                                                <Clock className="w-4 h-4 text-orange-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className={`text-[10px] uppercase tracking-wider ${theme === 'light' ? 'text-gray-400' : 'text-zinc-500'}`}>Time</p>
                                                <p className={`text-xs font-semibold truncate ${theme === 'light' ? 'text-gray-800' : 'text-white'}`}>{selectedBooking.bookingTime || 'TBD'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ═══ WORKFLOW TRACK ═══ */}
                                <div className={`px-6 py-5 border-t border-b ${theme === 'light' ? 'border-gray-100' : 'border-zinc-800/40'}`}>
                                    <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-4 ${theme === 'light' ? 'text-gray-400' : 'text-zinc-500'}`}>
                                        Service Pipeline
                                    </p>

                                    <div className="relative">
                                        {/* Background Track */}
                                        <div className={`absolute top-[18px] left-[18px] right-[18px] h-[3px] rounded-full ${theme === 'light' ? 'bg-gray-100' : 'bg-zinc-800/50'}`} />
                                        {/* Active Fill */}
                                        <div
                                            className="absolute top-[18px] left-[18px] h-[3px] rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-700 ease-out"
                                            style={{
                                                width: `calc((100% - 36px) * ${Math.max(0, currentIdx) / (stepOrder.length - 1)})`,
                                                boxShadow: '0 0 12px rgba(249,115,22,0.5)'
                                            }}
                                        />

                                        <div className="flex justify-between items-start relative z-10">
                                            {[
                                                { id: 'pending',       label: 'Booked',      icon: Clock },
                                                { id: 'confirmed',     label: 'Confirmed',   icon: CheckCircle },
                                                { id: 'received',      label: 'Received',    icon: Car },
                                                { id: 'in_progress',   label: 'In Service',  icon: Zap },
                                                { id: 'completed',     label: 'Done',        icon: BadgeCheck },
                                                { id: 'paid',          label: 'POS',         icon: ShoppingCart },
                                                { id: 'released',      label: 'Released',    icon: CheckCircle }
                                            ].map((step, idx) => {
                                                const isActive = currentIdx === idx;
                                                const isPast = currentIdx > idx;
                                                const StepIcon = step.icon;

                                                return (
                                                    <div key={step.id} className="flex flex-col items-center w-[52px] group">
                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 cursor-default relative
                                                            ${isActive
                                                                ? 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.5)] scale-110'
                                                                : isPast
                                                                    ? theme === 'light' ? 'bg-orange-100' : 'bg-orange-500/15'
                                                                    : theme === 'light' ? 'bg-gray-100 group-hover:bg-gray-200' : 'bg-zinc-800/50 group-hover:bg-zinc-700/50'
                                                            }
                                                        `}>
                                                            {isPast ? (
                                                                <CheckCircle className={`w-4 h-4 ${theme === 'light' ? 'text-orange-600' : 'text-orange-400'}`} />
                                                            ) : (
                                                                <StepIcon className={`w-4 h-4 ${isActive ? 'text-white' : theme === 'light' ? 'text-gray-400 group-hover:text-gray-500' : 'text-zinc-500 group-hover:text-zinc-400'}`} />
                                                            )}
                                                            {isActive && <div className="absolute inset-0 rounded-xl bg-orange-500/20 animate-ping" style={{ animationDuration: '2s' }} />}
                                                        </div>
                                                        <span className={`mt-2 text-[10px] font-semibold leading-tight text-center transition-colors duration-300
                                                            ${isActive ? 'text-orange-500' : isPast ? (theme === 'light' ? 'text-gray-700' : 'text-zinc-300') : theme === 'light' ? 'text-gray-400 group-hover:text-gray-500' : 'text-zinc-600 group-hover:text-zinc-400'}
                                                        `}>
                                                            {step.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* ═══ BODY ═══ */}
                                <div className="px-6 py-5 space-y-4">
                                    <div>
                                        <Label className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2.5 block ${theme === 'light' ? 'text-gray-400' : 'text-zinc-500'}`}>
                                            Assigned Technician
                                        </Label>
                                        <Select value={selectedDetailerId} onValueChange={(val) => {
                                            setSelectedDetailerId(val);
                                            if (operationalAction === 'pending' || !operationalAction) setOperationalAction('confirmed');
                                        }}>
                                            <SelectTrigger className={`h-12 rounded-xl ${theme === 'light' ? 'bg-white border-gray-200 shadow-sm hover:border-gray-300' : 'bg-zinc-900/60 border-zinc-700/40 hover:border-zinc-600/60 shadow-inner'} transition-colors`}>
                                                <SelectValue placeholder="Select a technician..." />
                                            </SelectTrigger>
                                            <SelectContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                                                {detailers.map((d) => (
                                                    <SelectItem key={d.id} value={d.id} className="cursor-pointer py-2.5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-[11px] text-white font-bold shadow-sm">
                                                                {d.name.charAt(0)}
                                                            </div>
                                                            <span className="font-semibold text-sm">{d.name}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Status Info */}
                                    {(() => {
                                        const sc: Record<string, { icon: any; title: string; msg: string; c: string; bg: string; bd: string }> = {
                                            'pending':            { icon: Clock,        title: 'Awaiting Review',     msg: 'This booking needs admin review. Select a technician and confirm to proceed.',       c: theme === 'light' ? 'text-amber-700' : 'text-amber-300',   bg: theme === 'light' ? 'bg-amber-50' : 'bg-amber-500/[0.06]',   bd: theme === 'light' ? 'border-amber-200' : 'border-amber-500/15' },
                                            'confirmed':          { icon: CheckCircle,  title: 'Booking Confirmed',   msg: 'Customer notified. Waiting for arrival at the shop for POS check-in.',               c: theme === 'light' ? 'text-blue-700' : 'text-blue-300',     bg: theme === 'light' ? 'bg-blue-50' : 'bg-blue-500/[0.06]',     bd: theme === 'light' ? 'border-blue-200' : 'border-blue-500/15' },
                                            'received':           { icon: Car,          title: 'Vehicle Received',    msg: 'Vehicle checked in via POS. Ready to begin detailing service.',                       c: theme === 'light' ? 'text-emerald-700' : 'text-emerald-300', bg: theme === 'light' ? 'bg-emerald-50' : 'bg-emerald-500/[0.06]', bd: theme === 'light' ? 'border-emerald-200' : 'border-emerald-500/15' },
                                            'in_progress':        { icon: Zap,          title: 'Service In Progress', msg: 'Technician is actively working on the vehicle. Live tracking is enabled.',            c: theme === 'light' ? 'text-orange-700' : 'text-orange-300', bg: theme === 'light' ? 'bg-orange-50' : 'bg-orange-500/[0.06]', bd: theme === 'light' ? 'border-orange-200' : 'border-orange-500/15' },
                                            'completed':          { icon: BadgeCheck,   title: 'Service Complete',    msg: 'Quality check passed! Send to POS for final payment and vehicle release.',            c: theme === 'light' ? 'text-green-700' : 'text-green-300',   bg: theme === 'light' ? 'bg-green-50' : 'bg-green-500/[0.06]',   bd: theme === 'light' ? 'border-green-200' : 'border-green-500/15' },
                                            'paid':               { icon: ShoppingCart, title: 'Ready for Release',   msg: 'Final payment received. Vehicle is ready to be released to the customer.',                c: theme === 'light' ? 'text-purple-700' : 'text-purple-300', bg: theme === 'light' ? 'bg-purple-50' : 'bg-purple-500/[0.06]', bd: theme === 'light' ? 'border-purple-200' : 'border-purple-500/15' },
                                        };
                                        const cfg = sc[operationalAction] || sc['pending'];
                                        const SIcon = cfg.icon;
                                        return (
                                            <div className={`p-4 rounded-xl border ${cfg.bg} ${cfg.bd}`}>
                                                <div className="flex items-start gap-3">
                                                    <SIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.c}`} />
                                                    <div>
                                                        <p className={`text-sm font-bold ${cfg.c}`}>{cfg.title}</p>
                                                        <p className={`text-xs mt-1 leading-relaxed opacity-80 ${cfg.c}`}>{cfg.msg}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* ═══ FOOTER ═══ */}
                                <div className={`px-6 py-4 border-t ${theme === 'light' ? 'border-gray-100 bg-gray-50/40' : 'border-zinc-800/40 bg-zinc-900/20'}`}>
                                    <div className="flex items-center gap-3">
                                        <Button variant="ghost" onClick={() => setShowAssignModal(false)} className={`flex-1 h-11 rounded-xl font-medium ${theme === 'light' ? 'hover:bg-gray-100 text-gray-500' : 'hover:bg-white/5 text-zinc-400 hover:text-white'}`}>
                                            Cancel
                                        </Button>
                                        {(() => {
                                            const bc: Record<string, { label: string; icon: any, needDetailer?: boolean }> = {
                                                'pending':            { label: 'Confirm & Assign',     icon: CheckCircle, needDetailer: true },
                                                'confirmed':          { label: 'POS Check-In', icon: Send, needDetailer: false },
                                                'received':           { label: 'Start Service',        icon: Play, needDetailer: false },
                                                'in_progress':        { label: 'Mark QC Complete',         icon: BadgeCheck, needDetailer: false },
                                                'completed':          { label: 'Process Final Payment',           icon: ShoppingCart, needDetailer: false },
                                                'paid':               { label: 'Release Vehicle',       icon: Send, needDetailer: false },
                                                'released':           { label: 'Released',              icon: CheckCircle, needDetailer: false },
                                            };
                                            const cfg = bc[operationalAction] || bc['pending'];
                                            const isTerminal = operationalAction === 'released';
                                            const BIcon = cfg.icon;
                                            return (
                                                <Button onClick={handleAssignDetailer} disabled={(cfg.needDetailer && !selectedDetailerId) || isTerminal}
                                                    className={`flex-[1.4] h-11 gap-2 rounded-xl font-bold text-sm tracking-tight transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 border-0
                                                        ${isTerminal
                                                            ? `${theme === 'light' ? 'bg-gray-200 text-gray-400' : 'bg-zinc-800 text-zinc-500'} cursor-not-allowed shadow-none`
                                                            : 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:via-orange-400 hover:to-amber-400 text-white shadow-[0_4px_24px_rgba(249,115,22,0.35)] hover:shadow-[0_8px_32px_rgba(249,115,22,0.5)]'
                                                        }
                                                    `}
                                                >
                                                    <BIcon className="w-4 h-4" />
                                                    {cfg.label}
                                                </Button>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            <Dialog open={isBookingDetailOpen} onOpenChange={setIsBookingDetailOpen}>
                <DialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                    <DialogHeader>
                        <DialogTitle className={theme === 'light' ? 'text-gray-900' : 'text-white'}>Booking Details</DialogTitle>
                    </DialogHeader>
                    {detailBooking ? (
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className={theme === 'light' ? 'text-gray-500' : 'text-zinc-500'}>Customer</p>
                                <p className={theme === 'light' ? 'text-gray-900' : 'text-white'}>
                                    {detailBooking.customerName || detailBooking.customer?.name || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className={theme === 'light' ? 'text-gray-500' : 'text-zinc-500'}>Vehicle</p>
                                <p className={theme === 'light' ? 'text-gray-900' : 'text-white'}>
                                    {detailBooking.vehicleInfo
                                        || [detailBooking.vehicleYear, detailBooking.vehicleMake, detailBooking.vehicleModel].filter(Boolean).join(' ')
                                        || 'N/A'}
                                </p>
                                <p className={theme === 'light' ? 'text-gray-500' : 'text-zinc-500'}>
                                    Plate: {detailBooking.vehiclePlate || 'N/A'}
                                </p>
                            </div>

                            {/* ── Schedule with Edit Button ── */}
                            <div>
                                <div className="flex justify-between items-center">
                                    <p className={theme === 'light' ? 'text-gray-500' : 'text-zinc-500'}>Schedule</p>
                                    {canAccessBookings && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                                            onClick={() => {
                                                setEditDate(detailBooking.bookingDate || '');
                                                setEditTime(detailBooking.bookingTime || '');
                                                setIsEditScheduleOpen(true);
                                            }}
                                        >
                                            <Calendar className="w-3 h-3 mr-1" /> Edit
                                        </Button>
                                    )}
                                </div>
                                <p className={theme === 'light' ? 'text-gray-900' : 'text-white'}>
                                    {detailBooking.bookingDate ? new Date(detailBooking.bookingDate).toLocaleDateString() : 'N/A'}
                                    {' '}at{' '}
                                    {detailBooking.bookingTime || 'N/A'}
                                </p>
                            </div>

                            <div>
                                <p className={theme === 'light' ? 'text-gray-500' : 'text-zinc-500'}>Service</p>
                                <p className={theme === 'light' ? 'text-gray-900' : 'text-white'}>
                                    {detailBooking.serviceType || detailBooking.serviceName || 'N/A'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Payment Status Toggle */}
                                {canAccessBookings ? (
                                    <button
                                        onClick={() => handleUpdatePaymentStatus(
                                            detailBooking,
                                            detailBooking.paymentStatus === 'paid' ? 'unpaid' : 'paid'
                                        )}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 ${detailBooking.paymentStatus === 'paid'
                                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25'
                                                : 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/25'
                                            }`}
                                    >
                                        <span>{detailBooking.paymentStatus === 'paid' ? '✓' : '○'}</span>
                                        {detailBooking.paymentStatus === 'paid' ? 'Paid — click to revert' : 'Unpaid — click to mark paid'}
                                    </button>
                                ) : (
                                    <Badge className={detailBooking.paymentStatus === 'paid' ? 'bg-emerald-600' : 'bg-yellow-600'}>
                                        {detailBooking.paymentStatus || 'unpaid'}
                                    </Badge>
                                )}
                                <Badge className="bg-zinc-700">
                                    {detailBooking.status}
                                </Badge>
                            </div>
                            <div>
                                <p className={theme === 'light' ? 'text-gray-500' : 'text-zinc-500'}>Digital Waiver</p>
                                {detailBooking.legalCompliance?.waiverPdf ? (
                                    <a
                                        className="text-orange-500 hover:text-orange-400 text-sm"
                                        href={detailBooking.legalCompliance.waiverPdf}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        View Signed Waiver
                                    </a>
                                ) : (
                                    <p className={theme === 'light' ? 'text-gray-400' : 'text-zinc-500'}>No waiver on file</p>
                                )}
                            </div>
                            {canAccessBookings && detailBooking.status === 'pending' && (
                                <div className="flex flex-col gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => handleConfirmBooking(detailBooking)}
                                        className="w-full border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-white"
                                    >
                                        Confirm
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            setSelectedBooking(detailBooking);
                                            setShowAssignModal(true);
                                            setIsBookingDetailOpen(false);
                                        }}
                                        className="w-full bg-orange-600 hover:bg-orange-700"
                                    >
                                        Assign Detailer
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className={theme === 'light' ? 'text-gray-500' : 'text-zinc-500'}>No booking selected.</p>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={isEditScheduleOpen} onOpenChange={setIsEditScheduleOpen}>
                <DialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                    <DialogHeader>
                        <DialogTitle className={theme === 'light' ? 'text-gray-900' : 'text-white'}>Edit Schedule</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Date</Label>
                            <Input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]} // prevent past dates
                                className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Time Slot</Label>
                            <Select value={editTime} onValueChange={setEditTime} disabled={isLoadingSlots || !editDate}>
                                <SelectTrigger className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'}>
                                    <SelectValue placeholder={isLoadingSlots ? 'Checking availability...' : 'Select new time'} />
                                </SelectTrigger>
                                <SelectContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                                    {['09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'].map((t) => {
                                        const isBooked = bookedSlots.includes(t);
                                        return (
                                            <SelectItem
                                                key={t}
                                                value={t}
                                                disabled={isBooked}
                                                className={isBooked ? "opacity-50 text-zinc-500" : ""}
                                            >
                                                {t} {isBooked ? '(Booked)' : ''}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end mt-4">
                        <Button variant="ghost" onClick={() => setIsEditScheduleOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleSaveSchedule}
                            disabled={!editDate || !editTime}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            Save Changes
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
                <DialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                    <DialogHeader>
                        <DialogTitle className={theme === 'light' ? 'text-gray-900' : 'text-white'}>Place Order</DialogTitle>
                    </DialogHeader>
                    <p className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>
                        Place an order with {selectedSupplierForOrder?.name}?
                    </p>
                    <div className="flex gap-3">
                        <Button onClick={() => setShowOrderModal(false)} variant="outline" className="flex-1">
                            Cancel
                        </Button>
                        <Button onClick={handleConfirmOrder} className="flex-1 bg-orange-600 hover:bg-orange-700">
                            Confirm Order
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showRestockModal} onOpenChange={setShowRestockModal}>
                <DialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                    <DialogHeader>
                        <DialogTitle className={theme === 'light' ? 'text-gray-900' : 'text-white'}>Restock Item</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Quantity to Add</Label>
                        <Input
                            type="number"
                            min="1"
                            value={restockQuantity}
                            onChange={(e) => setRestockQuantity(e.target.value)}
                            placeholder="e.g. 50"
                            className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'}
                        />
                        <Button
                            onClick={handleRestockSingle}
                            disabled={!restockQuantity || parseInt(restockQuantity) <= 0}
                            className="w-full bg-orange-600 hover:bg-orange-700"
                        >
                            Update Stock
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showBulkStockModal} onOpenChange={setShowBulkStockModal}>
                <DialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                    <DialogHeader>
                        <DialogTitle className={theme === 'light' ? 'text-gray-900' : 'text-white'}>Bulk Update Stock</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-zinc-400'}`}>
                            You are updating the stock for {selectedInventoryItems.length} selected items.
                        </p>
                        <Label className={theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}>Quantity to Add to Each</Label>
                        <Input
                            type="number"
                            min="1"
                            value={bulkRestockQuantity}
                            onChange={(e) => setBulkRestockQuantity(e.target.value)}
                            placeholder="e.g. 10"
                            className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-[#09090b] border-zinc-800'}
                        />
                        <Button
                            onClick={handleBulkUpdateStock}
                            disabled={!bulkRestockQuantity || parseInt(bulkRestockQuantity) <= 0}
                            className="w-full bg-orange-600 hover:bg-orange-700"
                        >
                            Confirm Bulk Update
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showSupplierDetailsModal} onOpenChange={setShowSupplierDetailsModal}>
                <DialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'} style={{ maxWidth: '500px' }}>
                    <DialogHeader>
                        <DialogTitle className={theme === 'light' ? 'text-gray-900' : 'text-white'}>Supplier Details</DialogTitle>
                    </DialogHeader>
                    {selectedSupplierDetails && (
                        <div className={`space-y-4 ${theme === 'light' ? 'text-gray-700' : 'text-zinc-300'}`}>
                            <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
                                <div className="w-12 h-12 rounded bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                    <Truck className="w-6 h-6 text-orange-500" />
                                </div>
                                <div>
                                    <h3 className={`text-lg font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{selectedSupplierDetails.name}</h3>
                                    <p className="text-sm opacity-80">{(selectedSupplierDetails as any).category || 'General Supplier'}</p>
                                </div>
                            </div>

                            <div className="space-y-3 pt-2 text-sm">
                                <div className="flex justify-between items-center py-1">
                                    <span className="opacity-60 flex items-center gap-2"><UserIcon size={14} /> Contact Person</span>
                                    <span className="font-medium">{selectedSupplierDetails.contactPerson || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="opacity-60 flex items-center gap-2"><Phone size={14} /> Phone</span>
                                    <span className="font-medium">{selectedSupplierDetails.phone || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="opacity-60 flex items-center gap-2"><Mail size={14} /> Email</span>
                                    <span className="font-medium">{selectedSupplierDetails.email || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="opacity-60 flex items-center gap-2"><MapPin size={14} /> Country</span>
                                    <span className="font-medium">{(selectedSupplierDetails as any).country || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="opacity-60 flex items-center gap-2">Status</span>
                                    <span className={`px-2 py-0.5 rounded text-xs ${(selectedSupplierDetails as any).status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                        {(selectedSupplierDetails as any).status?.toUpperCase() || 'ACTIVE'}
                                    </span>
                                </div>
                            </div>

                            <Button className="w-full mt-4 bg-zinc-800 hover:bg-zinc-700" onClick={() => setShowSupplierDetailsModal(false)}>
                                Close
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={showDangerModal} onOpenChange={setShowDangerModal}>
                <AlertDialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className={theme === 'light' ? 'text-gray-900' : 'text-white'}>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription className={theme === 'light' ? 'text-gray-600' : 'text-zinc-400'}>
                            This will permanently delete {itemToDelete?.name}. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className={theme === 'light' ? 'bg-gray-100 hover:bg-gray-200' : 'bg-zinc-800 hover:bg-zinc-700'}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showResetModal} onOpenChange={setShowResetModal}>
                <AlertDialogContent className={theme === 'light' ? 'bg-white' : 'bg-[#121214] border-zinc-800'}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-600">Reset Entire System</AlertDialogTitle>
                        <AlertDialogDescription className={theme === 'light' ? 'text-gray-600' : 'text-zinc-400'}>
                            This will delete ALL data including users, inventory, bookings, and settings. Type <strong>RESET</strong> to confirm.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value)}
                        placeholder="Type RESET"
                        className={theme === 'light' ? 'bg-gray-50 border-gray-300' : 'bg-zinc-900 border-zinc-800'}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmReset}
                            disabled={isResetting || resetConfirmText !== 'RESET'}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isResetting ? 'Resetting...' : 'Reset System'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── SIGNOUT MODAL ── */}
            {showSignoutModal && (
                <div className="signout-modal-overlay">
                    <div className="signout-modal">
                        {signoutStep === 'confirm' && (
                            <>
                                <div className="signout-icon">
                                    <LogOut className="w-6 h-6" />
                                </div>
                                <h2>Sign out of AutoSPF+?</h2>
                                <p>You will need to re-enter your credentials to access the console again.</p>
                                <div className="signout-user-card">
                                    <div className="su-avatar">
                                        {profilePhoto ? <img src={profilePhoto} alt="Profile" /> : (user?.name?.charAt(0).toUpperCase() || 'A')}
                                    </div>
                                    <div className="signout-user-info">
                                        <div className="su-name">{user?.name}</div>
                                        <div className="su-email">{user?.email}</div>
                                    </div>
                                    <span className="text-[var(--green)] bg-[var(--green-bg)] px-2 py-0.5 rounded text-[10px] font-bold tracking-wide">Active</span>
                                </div>
                                <div className="signout-modal-actions">
                                    <button className="btn-confirm-signout" onClick={() => {
                                        setSignoutStep('signing_out');
                                        setTimeout(() => {
                                            setSignoutStep('success');
                                            setTimeout(() => {
                                                handleLogout();
                                            }, 800);
                                        }, 1200);
                                    }}>
                                        Yes, sign me out
                                    </button>
                                    <button className="btn-cancel-signout" onClick={() => setShowSignoutModal(false)}>
                                        Cancel — stay signed in
                                    </button>
                                </div>
                            </>
                        )}
                        {signoutStep === 'signing_out' && (
                            <>
                                <div className="signout-icon spinner-icon">
                                    <RefreshCw className="w-6 h-6 animate-spin" />
                                </div>
                                <h2>Signing you out securely...</h2>
                                <p>Closing active sessions and clearing tokens from this device.</p>
                            </>
                        )}
                    </div>
                </div>
            )}
            
            {showCheckInModal && selectedBooking && (
                <CheckInDialog
                    booking={selectedBooking}
                    isOpen={showCheckInModal}
                    onClose={() => setShowCheckInModal(false)}
                    onSubmit={handleCheckInSubmit}
                    theme={theme}
                />
            )}
        </div>
    );
}
