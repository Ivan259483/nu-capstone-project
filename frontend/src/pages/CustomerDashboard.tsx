import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { OrderService } from '@/lib/order-service';
import { UserService } from '@/lib/user-service';
import { VehicleService } from '@/lib/vehicle-service';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';
import api from '@/lib/api';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

// Imports for new modular components
import { CustomerSidebar } from '@/components/customer/CustomerSidebar';
import { CustomerMobileNav } from '@/components/customer/CustomerMobileNav';
import { DashboardHome } from '@/components/customer/DashboardHome';
import { MyBookings } from '@/components/customer/MyBookings';
import { LiveTracking } from '@/components/customer/LiveTracking';
import { PaymentHistory } from '@/components/customer/PaymentHistory';
import { Notifications } from '@/components/customer/Notifications';
import { Settings } from '@/components/customer/Settings';
import { BookingWizard } from '@/components/customer/BookingWizard';
import { ScanAndBook } from '@/components/customer/ScanAndBook';
import { DocumentsAndWaivers } from '@/components/customer/DocumentsAndWaivers';
import { FloatingChat } from '@/components/customer/FloatingChat';
import { VehicleModal } from '@/components/customer/VehicleModal';
import AIEstimatorPage from '@/pages/AIEstimatorPage';

// UI Imports (Keep necessary ones for Modals/Dialogs that are still handled here)
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SignaturePad from '@/components/SignaturePad';

// Types
import type { Booking, Vehicle, Service, User } from '@/types';

type TabType = 'dashboard' | 'ai-estimator' | 'bookings' | 'tracking' | 'payments' | 'notifications' | 'settings' | 'book' | 'documents' | 'scan-book';

export default function CustomerDashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, updateUser } = useAuth();

    // -- STATE MANAGEMENT --
    const validTabs: TabType[] = ['dashboard', 'ai-estimator', 'bookings', 'tracking', 'payments', 'notifications', 'settings', 'book', 'documents', 'scan-book'];
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        const hash = window.location.hash.replace('#', '');
        return validTabs.includes(hash as TabType) ? (hash as TabType) : 'dashboard';
    });

    useEffect(() => {
        window.location.hash = activeTab;
    }, [activeTab]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Data
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);

    // Modal States
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [isWaiverModalOpen, setIsWaiverModalOpen] = useState(false);
    const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

    // Waiver Logic State
    const [waiverBooking, setWaiverBooking] = useState<Booking | null>(null);
    const [waiverSignature, setWaiverSignature] = useState<string | null>(null);
    const [isSigningWaiver, setIsSigningWaiver] = useState(false);

    // Derived Data
    const activeBooking = bookings.find(b =>
        ['paid', 'queued', 'pending', 'confirmed', 'assigned', 'on-the-way', 'processing', 'in-progress', 'finishing', 'ready'].includes(b.status)
        // Also check allow 'completed' if it was arguably recent, but user requested 'NOT completed' logic effectively.
        // User said: "query for ANY booking that is NOT 'completed'". 
        // So we strictly exclude 'completed' and 'cancelled' via inclusion list.
    ) || null;

    // -- EFFECTS --

    // Allow deep-linking to a specific tab via `?tab=bookings` etc.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (!tab) return;
        const allowedTabs: TabType[] = ['dashboard', 'ai-estimator', 'bookings', 'tracking', 'payments', 'notifications', 'settings', 'book', 'documents', 'scan-book'];
        if (allowedTabs.includes(tab as TabType)) {
            setActiveTab(tab as TabType);
        }
    }, [location.search]);

    // Initial load from backend (ensures MyBookings works even without Firestore)
    useEffect(() => {
        if (!user || user.role !== 'customer') return;
        let cancelled = false;
        (async () => {
            try {
                const res = await OrderService.getAllOrders();
                if (!cancelled && res?.success && Array.isArray(res.data)) {
                    setBookings(res.data);
                }
            } catch (e) {
                // Keep UI usable even if backend is down; Firestore may still populate
                console.warn('Failed to load bookings from backend:', e);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    // Real-time Booking Updates
    useEffect(() => {
        if (!user || user.role !== 'customer') return;

        const customerId = user.id;
        // Track previous payment statuses to detect the 'paid' transition
        const prevPaymentStatus = new Map<string, string>();

        const unsubscribe = OrderService.subscribeToCustomerBookings(customerId, (updatedBookings) => {
            // ── Payment toast detector ─────────────────────────────────────
            updatedBookings.forEach((b) => {
                const prev = prevPaymentStatus.get(b.id);
                if (prev && prev !== 'paid' && b.paymentStatus === 'paid') {
                    toast.success('💳 Payment Received! Your detailer is being assigned.', {
                        description: 'Track your service in real time under Live Tracking.',
                        duration: 6000,
                        action: {
                            label: 'Track Now',
                            onClick: () => setActiveTab('tracking'),
                        },
                    });
                }
                prevPaymentStatus.set(b.id, b.paymentStatus ?? '');
            });
            // ─────────────────────────────────────────────────────────────

            // Don't let an empty Firestore snapshot wipe out backend-loaded bookings.
            setBookings((prev) => (updatedBookings.length > 0 ? updatedBookings : prev));

            // Auto-open waiver if needed
            const pendingWaiver = updatedBookings.find(
                (b) => (b.status as string) === 'assigned' && !b.legalCompliance?.waiverSignature
            );
            if (pendingWaiver) {
                setWaiverBooking(pendingWaiver);
                setIsWaiverModalOpen(true);
            }
        });

        return () => unsubscribe();
    }, [user]);

    // Load Initial Data (Vehicles, Services, Notifications)
    useEffect(() => {
        const loadInitialData = async () => {
            if (!user) return;
            try {
                const [vehiclesRes, servicesRes, notifRes] = await Promise.all([
                    VehicleService.getVehicles(),
                    api.get('/services'),
                    NotificationService.getNotifications()
                ]);

                if (vehiclesRes?.success && Array.isArray(vehiclesRes.data)) setVehicles(vehiclesRes.data);

                if (servicesRes?.data?.success && Array.isArray(servicesRes.data.data)) {
                    const activeServices = servicesRes.data.data.filter((s: any) => s.status === 'Active');
                    setServices(activeServices);
                }

                if (notifRes?.success && Array.isArray(notifRes.data)) {
                    setNotifications(notifRes.data);
                }
            } catch (error) {
                console.error("Failed to load initial data", error);
            }
        };
        loadInitialData();
    }, [user]);

    // -- HANDLERS --

    const refreshBookings = async () => {
        try {
            const res = await OrderService.getAllOrders();
            if (res?.success && Array.isArray(res.data)) {
                setBookings(res.data);
            }
        } catch (e) {
            console.warn('Failed to refresh bookings:', e);
        }
    };

    const handleTabChange = (tab: string) => {
        if (tab === 'book') {
            setIsBookingModalOpen(true); // Open booking modal instead of navigating
        } else {
            if (tab === 'bookings') {
                // Always refresh so newly submitted package bookings show immediately.
                refreshBookings();
            }
            setActiveTab(tab as TabType);
        }
    };

    const handleSaveVehicle = async (vehicleData: Partial<Vehicle>, id?: string) => {
        try {
            if (id) {
                await VehicleService.updateVehicle(id, vehicleData);
                toast.success('Vehicle updated successfully');
            } else {
                await VehicleService.addVehicle({ ...vehicleData, customerId: user?.id });
                toast.success('Vehicle added successfully');
            }
            // Refresh vehicle list
            const res = await VehicleService.getVehicles();
            if (res.success && Array.isArray(res.data)) {
                setVehicles(res.data);
            }
            setIsVehicleModalOpen(false);
            setEditingVehicle(null);
        } catch (error) {
            toast.error('Failed to save vehicle');
            throw error;
        }
    };

    const handleDeleteVehicle = async (id: string) => {
        if (!confirm('Are you sure you want to delete this vehicle?')) return;
        try {
            await VehicleService.deleteVehicle(id);
            toast.success('Vehicle deleted successfully');
            setVehicles(prev => prev.filter(v => v.id !== id));
        } catch (error) {
            toast.error('Failed to delete vehicle');
        }
    };

    const handleUpdateProfile = async (data: { name: string; email: string; phone?: string }) => {
        if (!user) return;
        try {
            // Update Auth Context which handles the API call and local updates
            // We construct a partial user object with the fields we want to update
            const updatedUser = {
                ...user,
                name: data.name,
                phone: data.phone
            };

            await updateUser(updatedUser as User);
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    const handleChangePassword = async (current: string, newPass: string) => {
        if (!user) return;
        try {
            await UserService.changePassword(user.id, current, newPass);
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    const handleSignWaiver = async () => {
        if (!waiverBooking || !waiverSignature) return;
        setIsSigningWaiver(true);
        try {
            await OrderService.signWaiver(waiverBooking.id, waiverSignature);
            toast.success("Waiver signed successfully");
            setIsWaiverModalOpen(false);
        } catch (error) {
            toast.error("Failed to sign waiver");
        } finally {
            setIsSigningWaiver(false);
        }
    };

    const handleCancelBooking = async (booking: Booking) => {
        if (!confirm("Are you sure you want to cancel this booking?")) return;
        try {
            // Use updateOrder instead of non-existent updateOrderStatus
            await OrderService.updateOrder(booking.id, { status: 'cancelled' });
            toast.success("Booking cancelled");
        } catch (error) {
            toast.error("Failed to cancel booking");
        }
    };

    const handleRescheduleBooking = (booking: Booking) => {
        setIsBookingModalOpen(true);
        toast.info("Rescheduling feature coming soon. Please contact support.");
    };

    const handleMarkNotificationRead = async (id: string) => {
        try {
            await NotificationService.markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        } catch (error) {
            console.error(error);
        }
    };

    const handleClearNotifications = async () => {
        setNotifications([]);
        // API call to clear all if backend supports it
    };

    return (
        <div className="flex h-screen bg-[#0c0b08] text-[var(--text-primary)] font-sans overflow-hidden relative">
            {/* Subtle gold radial glow — no image background */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at top right, rgba(139,92,246,0.10) 0%, transparent 60%)' }} />
            <div className="absolute w-[500px] h-[500px] -top-40 -left-40 rounded-full bg-violet-500/5 blur-3xl pointer-events-none" />
            <div className="absolute w-[500px] h-[500px] top-1/2 -right-40 rounded-full bg-purple-500/5 blur-3xl pointer-events-none" />
            
            {/* Sidebar Navigation (Desktop) */}
            <CustomerSidebar
                activeTab={activeTab}
                onTabChange={handleTabChange as any}
                className="z-10"
            />

            {/* Mobile Navigation */}
            <CustomerMobileNav
                activeTab={activeTab}
                onTabChange={handleTabChange as any}
                isOpen={isMobileMenuOpen}
                onOpenChange={setIsMobileMenuOpen}
            />

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
                {/* Mobile Header Trigger */}
                <div className="lg:hidden p-4 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-md z-10">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center">
                            <span className="text-black font-bold">A</span>
                        </div>
                        <span className="font-bold tracking-tight"><span className="text-white">Auto</span><span className="text-violet-400">SPF</span><span className="text-white">+</span></span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
                        <div className="space-y-1.5">
                            <span className="block w-6 h-0.5 bg-white"></span>
                            <span className="block w-6 h-0.5 bg-white"></span>
                            <span className="block w-6 h-0.5 bg-white"></span>
                        </div>
                    </Button>
                </div>

                {/* Content Scroll Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth p-0 md:p-8 relative">
                    <AnimatePresence mode="wait">
                        {activeTab === 'dashboard' && (
                            <motion.div
                                key="dashboard"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <DashboardHome
                                    bookings={bookings}
                                    onNavigate={handleTabChange}
                                    userName={user?.name || 'Customer'}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'ai-estimator' && (
                            <motion.div
                                key="ai-estimator"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="w-full"
                            >
                                <AIEstimatorPage />
                            </motion.div>
                        )}

                        {activeTab === 'bookings' && (
                            <motion.div
                                key="bookings"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <MyBookings
                                    bookings={bookings}
                                    onCancelBooking={handleCancelBooking}
                                    onRescheduleBooking={handleRescheduleBooking}
                                    onNavigate={handleTabChange}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'tracking' && (
                            <motion.div
                                key="tracking"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <LiveTracking activeBooking={activeBooking || null} />
                            </motion.div>
                        )}

                        {activeTab === 'payments' && (
                            <motion.div
                                key="payments"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <PaymentHistory bookings={bookings} />
                            </motion.div>
                        )}

                        {activeTab === 'notifications' && (
                            <motion.div
                                key="notifications"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Notifications
                                    notifications={notifications}
                                    onMarkAsRead={handleMarkNotificationRead}
                                    onClearAll={handleClearNotifications}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'settings' && (
                            <motion.div
                                key="settings"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Settings
                                    onUpdateProfile={handleUpdateProfile}
                                    onChangePassword={handleChangePassword}
                                    vehicles={vehicles}
                                    onAddVehicle={() => { setEditingVehicle(null); setIsVehicleModalOpen(true); }}
                                    onEditVehicle={(v) => { setEditingVehicle(v); setIsVehicleModalOpen(true); }}
                                    onDeleteVehicle={handleDeleteVehicle}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'documents' && (
                            <motion.div
                                key="documents"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <DocumentsAndWaivers />
                            </motion.div>
                        )}

                        {activeTab === 'scan-book' && (
                            <motion.div
                                key="scan-book"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ScanAndBook />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            <FloatingChat />

            {/* -- GLOBAL MODALS -- */}

            {/* WAIVER MODAL */}
            <Dialog open={isWaiverModalOpen} onOpenChange={setIsWaiverModalOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Service Waiver Required</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-zinc-400 text-sm">
                            Please review and sign the service waiver for booking #{waiverBooking?.id} before we proceed.
                        </p>
                        <div className="bg-white rounded-lg p-2 h-40">
                            <SignaturePad onChange={setWaiverSignature} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                onClick={handleSignWaiver}
                                disabled={!waiverSignature || isSigningWaiver}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                {isSigningWaiver ? 'Signing...' : 'Sign & Accept'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* BOOKING MODAL */}
            <Dialog open={isBookingModalOpen} onOpenChange={setIsBookingModalOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-5xl h-[85vh] p-0 flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-zinc-800 shrink-0 flex justify-between items-center">
                        <div className='space-y-1'>
                            <DialogTitle className="text-xl">Book a Service</DialogTitle>
                            <DialogDescription className="text-zinc-400 text-sm">
                                Select a service package and schedule your appointment. Note: Payment is collected on-site.
                            </DialogDescription>
                        </div>
                        {/* Custom Close if needed */}
                    </div>
                    <div className="flex-1 overflow-hidden p-6">
                        <BookingWizard
                            services={services}
                            vehicles={vehicles}
                            user={user}
                            onClose={() => setIsBookingModalOpen(false)}
                            onAddVehicle={() => { setEditingVehicle(null); setIsVehicleModalOpen(true); }}
                            onSuccess={() => {
                                setIsBookingModalOpen(false);
                                toast.success("Booking confirmed! You will be notified shortly.");
                                refreshBookings();
                                setActiveTab('bookings');
                            }}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <VehicleModal
                isOpen={isVehicleModalOpen}
                onClose={() => { setIsVehicleModalOpen(false); setEditingVehicle(null); }}
                onSave={handleSaveVehicle}
                vehicle={editingVehicle}
            />

        </div>
    );
}
