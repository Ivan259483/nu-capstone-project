import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Filter, User as UserIcon, Car, Hash, Tag, Percent,
    DollarSign, CreditCard, Banknote, Smartphone, CheckCircle, Printer,
    AlertTriangle, ChevronDown, X, Plus, Minus, Receipt, Clock, Download,
    TrendingUp, ShoppingBag, BarChart3, Activity, FileText, Monitor
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { PaymentService } from '@/lib/payment-service';
import { OrderService } from '@/lib/order-service';
import { formatCurrency } from '@/lib/utils';
import { POSReceipt, type ReceiptData } from './POSReceipt';
import { WaiversDocs } from './WaiversDocs';
import { BillingPanel } from './BillingPanel';
import type { Booking, Service, User, BusinessSettings } from '@/types';
import { SERVICE_STAFF_ROLE } from '@/lib/roles';

type POSSubTab = 'pos' | 'waivers' | 'billing';

interface POSSystemProps {
    bookings: Booking[];
    services: Service[];
    users: User[];
    payments: any[];
    settings: BusinessSettings | null;
    onTransactionComplete: () => void;
}

interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    isAddon: boolean;
}

type PaymentMethodType = 'cash' | 'gcash' | 'card' | 'maya';
type DiscountType = 'fixed' | 'percent';

const paymentMethods: { id: PaymentMethodType; label: string; icon: any; color: string }[] = [
    { id: 'cash', label: 'Cash', icon: Banknote, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    { id: 'gcash', label: 'GCash', icon: Smartphone, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { id: 'card', label: 'Credit card', icon: CreditCard, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { id: 'maya', label: 'Maya', icon: Smartphone, color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

export function POSSystem({ bookings, services, users, payments, settings, onTransactionComplete }: POSSystemProps) {
    // ─── State ─────────────────────────────────────────────────────────────────────
    const [searchFilter, setSearchFilter] = useState('');
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [showBookingDropdown, setShowBookingDropdown] = useState(false);
    const [bookingSearch, setBookingSearch] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethodType>('cash');
    const [cashReceived, setCashReceived] = useState('');
    const [staffId, setStaffId] = useState<string>('');
    const [discountType, setDiscountType] = useState<DiscountType>('fixed');
    const [discountValue, setDiscountValue] = useState('');
    const [discountReason, setDiscountReason] = useState('');
    const [showDiscountPanel, setShowDiscountPanel] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
    const [showReceipt, setShowReceipt] = useState(false);
    const [historyDateFilter, setHistoryDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
    const [posSubTab, setPosSubTab] = useState<POSSubTab>('pos');

    // ─── Derived ───────────────────────────────────────────────────────────────────
    const detailers = useMemo(() =>
        users.filter(u => u.role === SERVICE_STAFF_ROLE),
        [users]
    );

    const unpaidBookings = useMemo(() =>
        bookings.filter(b =>
            b.paymentStatus !== 'paid' &&
            (b.status === 'completed' || b.status === 'ready_for_payment') &&
            !(b as any).archived
        ),
        [bookings]
    );

    const filteredBookings = useMemo(() => {
        if (!bookingSearch.trim()) return unpaidBookings.slice(0, 15);
        const q = bookingSearch.toLowerCase();
        return unpaidBookings.filter(b =>
            (b.customerName || '').toLowerCase().includes(q) ||
            (b.orderNumber || '').toLowerCase().includes(q) ||
            (b.vehiclePlate || '').toLowerCase().includes(q) ||
            (b.serviceName || '').toLowerCase().includes(q)
        ).slice(0, 15);
    }, [bookingSearch, unpaidBookings]);

    // Separate services into main and addons
    const mainServices = useMemo(() =>
        services.filter(s => s.status === 'Active' && (s.category as string) !== 'Add-on'),
        [services]
    );
    const addonServices = useMemo(() =>
        services.filter(s => s.status === 'Active' && (s.category as string) === 'Add-on'),
        [services]
    );
    // If no category === 'Add-on', use price threshold heuristic
    const displayMainServices = useMemo(() => {
        const filtered = mainServices.filter(s =>
            !searchFilter || s.name.toLowerCase().includes(searchFilter.toLowerCase())
        );
        return filtered.length ? filtered : services.filter(s =>
            s.status === 'Active' && (!searchFilter || s.name.toLowerCase().includes(searchFilter.toLowerCase()))
        );
    }, [mainServices, services, searchFilter]);

    const displayAddonServices = useMemo(() =>
        addonServices.filter(s =>
            !searchFilter || s.name.toLowerCase().includes(searchFilter.toLowerCase())
        ),
        [addonServices, searchFilter]
    );

    const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
    const discountAmount = useMemo(() => {
        const val = Number(discountValue) || 0;
        if (val <= 0) return 0;
        if (discountType === 'percent') return Math.round((subtotal * val) / 100);
        return Math.min(val, subtotal);
    }, [subtotal, discountType, discountValue]);
    const total = useMemo(() => Math.max(subtotal - discountAmount, 0), [subtotal, discountAmount]);
    const change = useMemo(() => {
        const received = Number(cashReceived) || 0;
        return received - total;
    }, [cashReceived, total]);

    // Auto-load booking services into cart
    const handleSelectBooking = useCallback((booking: Booking) => {
        setSelectedBooking(booking);
        setShowBookingDropdown(false);
        setBookingSearch('');

        // Pre-select assigned staff
        if (booking.assignedDetailer) {
            const detailerId = typeof booking.assignedDetailer === 'object'
                ? (booking.assignedDetailer as User)?.id || (booking.assignedDetailer as User)?._id
                : booking.assignedDetailer;
            if (detailerId) setStaffId(String(detailerId));
        }

        // Auto-load service into cart
        const newCart: CartItem[] = [];
        const svcName = booking.serviceName || booking.serviceType || '';
        if (svcName) {
            const matchedService = services.find(s =>
                s.name.toLowerCase() === svcName.toLowerCase()
            );
            const price = matchedService?.basePrice || booking.totalPrice || booking.totalAmount || 0;
            newCart.push({
                id: matchedService?.id || `booking-svc-${Date.now()}`,
                name: svcName,
                price: Number(price),
                quantity: 1,
                isAddon: false,
            });
        }

        // Load addons from booking
        if (booking.addons?.length) {
            for (const addon of booking.addons) {
                const addonName = typeof addon === 'string' ? addon : (addon as any).name || '';
                if (addonName) {
                    const matchedAddon = services.find(s =>
                        s.name.toLowerCase() === addonName.toLowerCase()
                    );
                    newCart.push({
                        id: matchedAddon?.id || `addon-${Date.now()}-${Math.random()}`,
                        name: addonName,
                        price: matchedAddon?.basePrice || (addon as any).price || 0,
                        quantity: 1,
                        isAddon: true,
                    });
                }
            }
        }

        setCart(newCart);
    }, [services]);

    const addToCart = useCallback((service: Service, isAddon: boolean = false) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === (service.id || service._id));
            if (existing) {
                return prev.map(item =>
                    item.id === (service.id || service._id)
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, {
                id: service.id || service._id || `svc-${Date.now()}`,
                name: service.name,
                price: service.basePrice,
                quantity: 1,
                isAddon,
            }];
        });
    }, []);

    const removeFromCart = useCallback((itemId: string) => {
        setCart(prev => prev.filter(item => item.id !== itemId));
    }, []);

    const updateQuantity = useCallback((itemId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id !== itemId) return item;
            const newQty = Math.max(1, item.quantity + delta);
            return { ...item, quantity: newQty };
        }));
    }, []);

    const resetPOS = useCallback(() => {
        setSelectedBooking(null);
        setCart([]);
        setSelectedPaymentMethod('cash');
        setCashReceived('');
        setStaffId('');
        setDiscountValue('');
        setDiscountReason('');
        setShowDiscountPanel(false);
    }, []);

    // ─── Confirm Payment ───────────────────────────────────────────────────────────
    const handleConfirmPayment = async () => {
        if (!selectedBooking) {
            toast.error('Please select a booking first');
            return;
        }
        if (cart.length === 0) {
            toast.error('Cart is empty');
            return;
        }
        if (selectedPaymentMethod === 'cash' && change < 0) {
            toast.error('Insufficient cash amount');
            return;
        }

        setIsProcessing(true);

        try {
            const mainItems = cart.filter(i => !i.isAddon).map(i => ({
                name: i.name, price: i.price, quantity: i.quantity,
            }));
            const addonItems = cart.filter(i => i.isAddon).map(i => ({
                name: i.name, price: i.price, quantity: i.quantity,
            }));

            const payload = {
                orderId: selectedBooking.id || selectedBooking._id || '',
                items: mainItems,
                addons: addonItems,
                paymentMethod: selectedPaymentMethod,
                staffId: staffId || null,
                discount: Number(discountValue) > 0
                    ? { discountType, value: Number(discountValue), reason: discountReason }
                    : null,
                cashReceived: selectedPaymentMethod === 'cash' ? Number(cashReceived) : null,
            };

            const result = await PaymentService.createPOSTransaction(payload);

            if (result.success) {
                toast.success('Payment processed successfully!');
                setReceiptData(result.data.receipt);
                setShowReceipt(true);

                if (result.data.inventoryWarnings?.length) {
                    toast.warning(`Inventory warnings: ${result.data.inventoryWarnings.map((w: any) => w.product).join(', ')}`, {
                        duration: 6000,
                    });
                }

                // Sync to Firestore
                try {
                    const updatedBooking = {
                        ...selectedBooking,
                        status: 'completed',
                        paymentStatus: 'paid',
                        paidAt: new Date().toISOString(),
                    };
                    await OrderService.syncBookingToFirestore(updatedBooking as any);
                } catch (syncErr) {
                    console.warn('Firestore sync failed (non-blocking):', syncErr);
                }

                onTransactionComplete();
                resetPOS();
            } else {
                toast.error(result.message || 'Payment failed');
            }
        } catch (error: any) {
            console.error('POS payment error:', error);
            toast.error(error.message || 'Payment failed');
        } finally {
            setIsProcessing(false);
        }
    };

    // ─── Transaction History ───────────────────────────────────────────────────────
    const filteredPayments = useMemo(() => {
        if (!historyDateFilter) return payments.slice(0, 50);
        return payments.filter(p => {
            if (!p.createdAt) return false;
            return p.createdAt.slice(0, 10) === historyDateFilter;
        }).slice(0, 50);
    }, [payments, historyDateFilter]);

    const todayPayments = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return payments.filter(p => p.status === 'succeeded' && p.createdAt?.slice(0, 10) === today);
    }, [payments]);

    const todayRevenue = useMemo(() => todayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [todayPayments]);
    const unpaidTotal = useMemo(() => {
        return unpaidBookings.reduce((s, b) => s + (Number(b.totalPrice || b.totalAmount) || 0), 0);
    }, [unpaidBookings]);
    const completedToday = useMemo(() => todayPayments.length, [todayPayments]);
    const avgTicket = useMemo(() => completedToday > 0 ? Math.round(todayRevenue / completedToday) : 0, [todayRevenue, completedToday]);

    const handleExportCSV = () => {
        const headers = ['Invoice ID', 'Customer', 'Amount', 'Method', 'Status', 'Date'];
        const rows = filteredPayments.map((p: any) => [
            p.invoiceId || '',
            p.customer?.name || p.order?.customerName || '',
            p.amount || 0,
            (p.method || '').toUpperCase(),
            p.status || '',
            p.createdAt ? new Date(p.createdAt).toLocaleString() : '',
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pos-transactions-${historyDateFilter || 'all'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleViewReceipt = async (paymentId: string) => {
        const result = await PaymentService.getReceiptData(paymentId);
        if (result.success) {
            setReceiptData(result.data);
            setShowReceipt(true);
        } else {
            toast.error('Failed to load receipt');
        }
    };

    const canConfirm = cart.length > 0 && selectedBooking && (
        selectedPaymentMethod !== 'cash' || (Number(cashReceived) >= total && total > 0)
    );

    // ─── Render ────────────────────────────────────────────────────────────────────
    const subTabs: { id: POSSubTab; label: string; icon: any; count: number }[] = [
        { id: 'pos', label: 'POS System', icon: Monitor, count: unpaidBookings.length },
        { id: 'waivers', label: 'Waivers & Docs', icon: FileText, count: bookings.filter(b => !!b.legalCompliance?.waiverSignature).length || 6 },
        { id: 'billing', label: 'Billing', icon: Receipt, count: payments.length },
    ];

    return (
        <div className="space-y-6">
            {/* ───── Sub-Tab Navigation ───── */}
            <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-1">
                {subTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setPosSubTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            posSubTab === tab.id
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            posSubTab === tab.id
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-zinc-700/50 text-zinc-500'
                        }`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* ───── Sub-Tab Content ───── */}
            <AnimatePresence mode="wait">
                {posSubTab === 'pos' && (
                    <motion.div
                        key="pos-subtab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {POSContent()}
                    </motion.div>
                )}

                {posSubTab === 'waivers' && (
                    <motion.div
                        key="waivers-subtab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        <WaiversDocs bookings={bookings} />
                    </motion.div>
                )}

                {posSubTab === 'billing' && (
                    <motion.div
                        key="billing-subtab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        <BillingPanel payments={payments} onRefresh={onTransactionComplete} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    // ─── POS Content (extracted from original render) ──────────────────────────────
    function POSContent() {
    return (
        <div className="space-y-6">
            {/* ───── Metrics Bar ───── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "TODAY'S REVENUE", value: formatCurrency(todayRevenue), sub: `${completedToday} transactions`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'UNPAID', value: formatCurrency(unpaidTotal), sub: `${unpaidBookings.length} pending collections`, icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                    { label: 'COMPLETED JOBS', value: String(completedToday), sub: 'today', icon: ShoppingBag, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { label: 'AVG. TICKET SIZE', value: formatCurrency(avgTicket), sub: 'per transaction', icon: BarChart3, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                ].map((m, i) => (
                    <motion.div
                        key={m.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="relative overflow-hidden rounded-xl bg-zinc-900/80 border border-zinc-800/60 p-4"
                    >
                        <div className={`absolute top-3 right-3 p-2 rounded-lg ${m.bg}`}>
                            <m.icon className={`w-4 h-4 ${m.color}`} />
                        </div>
                        <p className="text-[10px] font-semibold tracking-[1.5px] text-zinc-500 uppercase">{m.label}</p>
                        <p className="text-2xl font-bold text-white mt-1">{m.value}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{m.sub}</p>
                        {/* Mini chart bars */}
                        <div className="flex items-end gap-[2px] absolute bottom-3 right-3 opacity-30">
                            {[40, 65, 45, 80, 55, 70, 90].map((h, j) => (
                                <div key={j} className={`w-[3px] rounded-full ${m.bg}`} style={{ height: `${h * 0.25}px` }} />
                            ))}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* ───── Main POS Layout ───── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* ─── LEFT: Services Panel ─── */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Booking Selector + Search */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <button
                                onClick={() => setShowBookingDropdown(!showBookingDropdown)}
                                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${selectedBooking
                                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                                    }`}
                            >
                                <Hash className="w-4 h-4" />
                                {selectedBooking
                                    ? `Booking #${selectedBooking.orderNumber || selectedBooking.id?.slice(-6)} — ${selectedBooking.customerName}`
                                    : 'Select booking...'
                                }
                                <ChevronDown className="w-4 h-4 ml-auto" />
                            </button>

                            <AnimatePresence>
                                {showBookingDropdown && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                        className="absolute top-full left-0 right-0 mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
                                    >
                                        <div className="p-2">
                                            <Input
                                                placeholder="Search by name, booking #, plate..."
                                                value={bookingSearch}
                                                onChange={e => setBookingSearch(e.target.value)}
                                                className="bg-zinc-800 border-zinc-700 text-white text-sm"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800">
                                            {filteredBookings.length === 0 && (
                                                <div className="p-4 text-center text-sm text-zinc-500">No unpaid bookings found</div>
                                            )}
                                            {filteredBookings.map(b => (
                                                <button
                                                    key={b.id}
                                                    onClick={() => handleSelectBooking(b)}
                                                    className="w-full text-left px-4 py-3 hover:bg-zinc-800/60 transition-colors"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <span className="text-sm font-semibold text-white">{b.customerName || 'Customer'}</span>
                                                            <span className="text-[10px] text-zinc-500 ml-2 font-mono">#{b.orderNumber || b.id?.slice(-6)}</span>
                                                        </div>
                                                        <Badge className="text-[10px] bg-zinc-800 text-zinc-400 border-zinc-700">
                                                            {b.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
                                                        <span className="flex items-center gap-1"><Car className="w-3 h-3" />{b.vehicleInfo || [b.vehicleMake, b.vehicleModel].filter(Boolean).join(' ') || 'N/A'}</span>
                                                        <span>•</span>
                                                        <span>{b.serviceName || 'Service'}</span>
                                                        {b.totalPrice && <><span>•</span><span className="text-orange-400 font-semibold">{formatCurrency(Number(b.totalPrice))}</span></>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        {selectedBooking && (
                            <button onClick={resetPOS} className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Booking Info Bar */}
                    <AnimatePresence>
                        {selectedBooking && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/50 text-[11px]"
                            >
                                <span className="flex items-center gap-1.5 text-zinc-400"><UserIcon className="w-3.5 h-3.5" />{selectedBooking.customerName}</span>
                                <span className="text-zinc-700">|</span>
                                <span className="flex items-center gap-1.5 text-zinc-400"><Car className="w-3.5 h-3.5" />{[selectedBooking.vehicleYear, selectedBooking.vehicleMake, selectedBooking.vehicleModel].filter(Boolean).join(' ') || 'N/A'}</span>
                                {selectedBooking.vehiclePlate && <><span className="text-zinc-700">|</span><span className="font-mono text-zinc-500">{selectedBooking.vehiclePlate}</span></>}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Visual Separator */}
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-zinc-800 to-transparent my-6" />

                    {/* Services List */}
                    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
                            <h3 className="text-sm font-semibold text-zinc-300">Add Extra Services</h3>
                            <div className="relative w-48">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                <Input
                                    placeholder="Filter..."
                                    value={searchFilter}
                                    onChange={e => setSearchFilter(e.target.value)}
                                    className="pl-8 h-8 text-xs bg-zinc-800 border-zinc-700 text-white"
                                />
                            </div>
                        </div>
                        <div className="max-h-[340px] overflow-y-auto divide-y divide-zinc-800/40">
                            {displayMainServices.map(service => {
                                const inCart = cart.some(i => i.id === (service.id || service._id));
                                return (
                                    <button
                                        key={service.id || service._id}
                                        onClick={() => addToCart(service, false)}
                                        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all ${inCart
                                            ? 'bg-orange-500/8 border-l-2 border-l-orange-500'
                                            : 'hover:bg-zinc-800/40 border-l-2 border-l-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {inCart && <CheckCircle className="w-4 h-4 text-orange-400" />}
                                            <span className={`text-sm font-medium ${inCart ? 'text-orange-300' : 'text-zinc-200'}`}>
                                                {service.name}
                                            </span>
                                            {service.duration && (
                                                <span className="text-[10px] text-zinc-600">{service.duration}</span>
                                            )}
                                        </div>
                                        <span className={`text-sm font-semibold tabular-nums ${inCart ? 'text-orange-400' : 'text-orange-500/80'}`}>
                                            {formatCurrency(service.basePrice)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Add-ons Section */}
                        {displayAddonServices.length > 0 && (
                            <>
                                <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-900/80">
                                    <h4 className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Add-ons</h4>
                                </div>
                                <div className="divide-y divide-zinc-800/40">
                                    {displayAddonServices.map(service => {
                                        const inCart = cart.some(i => i.id === (service.id || service._id));
                                        return (
                                            <button
                                                key={service.id || service._id}
                                                onClick={() => addToCart(service, true)}
                                                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-all ${inCart
                                                    ? 'bg-orange-500/8 border-l-2 border-l-orange-400'
                                                    : 'hover:bg-zinc-800/40 border-l-2 border-l-transparent'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Plus className="w-3 h-3 text-zinc-600" />
                                                    <span className={`text-sm ${inCart ? 'text-orange-300' : 'text-zinc-300'}`}>{service.name}</span>
                                                </div>
                                                <span className={`text-sm font-medium ${inCart ? 'text-orange-400' : 'text-zinc-500'}`}>
                                                    {formatCurrency(service.basePrice)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {displayMainServices.length === 0 && displayAddonServices.length === 0 && (
                            <div className="p-8 text-center text-sm text-zinc-500">
                                No services found
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── RIGHT: Order Summary ─── */}
                <div className="lg:col-span-2 space-y-4">
                    <form onSubmit={(e) => e.preventDefault()} className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-zinc-300">Order summary</h3>
                            {selectedBooking && (
                                <Badge className="text-[10px] bg-orange-500/15 text-orange-400 border-orange-500/30 font-mono">
                                    #{selectedBooking.orderNumber || selectedBooking.id?.slice(-6)}
                                </Badge>
                            )}
                        </div>

                        {/* Cart Items */}
                        <div className="space-y-0 mb-4 max-h-[200px] overflow-y-auto">
                            {cart.length === 0 ? (
                                <div className="py-8 text-center text-sm text-zinc-600">
                                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                    Select a booking & add services
                                </div>
                            ) : (
                                <>
                                    <p className="text-[9px] font-bold tracking-[1.5px] text-zinc-500 uppercase mb-2">Items</p>
                                    {cart.map(item => (
                                        <div key={item.id} className="flex items-center justify-between py-2 group">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {item.isAddon && <Tag className="w-3 h-3 text-zinc-600 flex-shrink-0" />}
                                                <span className="text-sm text-zinc-200 truncate">{item.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-1.5 py-0.5">
                                                    <button onClick={() => updateQuantity(item.id, -1)} className="p-0.5 hover:text-white text-zinc-500 transition-colors">
                                                        <Minus className="w-3 h-3" />
                                                    </button>
                                                    <span className="text-xs font-medium text-zinc-300 w-5 text-center">{item.quantity}</span>
                                                    <button onClick={() => updateQuantity(item.id, 1)} className="p-0.5 hover:text-white text-zinc-500 transition-colors">
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <span className="text-sm font-semibold text-zinc-200 w-20 text-right">{formatCurrency(item.price * item.quantity)}</span>
                                                <button onClick={() => removeFromCart(item.id)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 text-zinc-600 transition-all">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Discount */}
                        {cart.length > 0 && (
                            <div className="border-t border-zinc-800/50 pt-3 mb-3">
                                <button
                                    onClick={() => setShowDiscountPanel(!showDiscountPanel)}
                                    className="flex items-center gap-2 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mb-2"
                                >
                                    <Percent className="w-3 h-3" />
                                    {showDiscountPanel ? 'Hide discount' : 'Add discount'}
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showDiscountPanel ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                    {showDiscountPanel && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-2"
                                        >
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setDiscountType('fixed')}
                                                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${discountType === 'fixed' ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}
                                                >
                                                    ₱ Fixed
                                                </button>
                                                <button
                                                    onClick={() => setDiscountType('percent')}
                                                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${discountType === 'percent' ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}
                                                >
                                                    % Percent
                                                </button>
                                            </div>
                                            <Input
                                                type="number"
                                                placeholder={discountType === 'fixed' ? '₱ Amount' : '% Percentage'}
                                                value={discountValue}
                                                onChange={e => setDiscountValue(e.target.value)}
                                                className="h-8 text-xs bg-zinc-800 border-zinc-700 text-white"
                                            />
                                            <Input
                                                placeholder="Reason (optional)"
                                                value={discountReason}
                                                onChange={e => setDiscountReason(e.target.value)}
                                                className="h-8 text-xs bg-zinc-800 border-zinc-700 text-white"
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Totals */}
                        {cart.length > 0 && (
                            <div className="border-t border-zinc-800/50 pt-3 space-y-1.5 text-sm">
                                {discountAmount > 0 && (
                                    <>
                                        <div className="flex justify-between text-zinc-400">
                                            <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between text-red-400">
                                            <span>Discount{discountReason ? ` (${discountReason})` : ''}</span>
                                            <span>−{formatCurrency(discountAmount)}</span>
                                        </div>
                                    </>
                                )}
                                <div className="flex justify-between text-lg font-bold text-white pt-1">
                                    <span>Total</span>
                                    <motion.span
                                        key={total}
                                        initial={{ scale: 1.15, color: '#f97316' }}
                                        animate={{ scale: 1, color: '#fff' }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        {formatCurrency(total)}
                                    </motion.span>
                                </div>
                            </div>
                        )}

                        {/* Staff Assignment */}
                        <div className="border-t border-zinc-800/50 mt-4 pt-3">
                            <p className="text-[9px] font-bold tracking-[1.5px] text-zinc-500 uppercase mb-2">Assign Technician</p>
                            <select
                                value={staffId}
                                onChange={e => setStaffId(e.target.value)}
                                className="w-full h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 outline-none transition-colors"
                            >
                                <option value="">— Select staff —</option>
                                {detailers.map(d => (
                                    <option key={d.id || d._id} value={d.id || d._id}>
                                        {d.name} ({d.role})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Payment Method */}
                        <div className="border-t border-zinc-800/50 mt-4 pt-3">
                            <p className="text-[9px] font-bold tracking-[1.5px] text-zinc-500 uppercase mb-2">Payment Method</p>
                            <div className="grid grid-cols-2 gap-2">
                                {paymentMethods.map(pm => (
                                    <button
                                        key={pm.id}
                                        onClick={() => setSelectedPaymentMethod(pm.id)}
                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${selectedPaymentMethod === pm.id
                                            ? pm.color
                                            : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800'
                                            }`}
                                    >
                                        <pm.icon className="w-4 h-4" />
                                        {pm.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Cash Input */}
                        <AnimatePresence>
                            {selectedPaymentMethod === 'cash' && cart.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-3 space-y-2"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <label className="text-[10px] text-zinc-500 mb-1 block">Amount Received</label>
                                            <Input
                                                type="number"
                                                placeholder="₱ 0.00"
                                                value={cashReceived}
                                                onChange={e => setCashReceived(e.target.value)}
                                                className="h-10 text-lg font-bold bg-zinc-800 border-zinc-700 text-white"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[10px] text-zinc-500 mb-1 block">Change</label>
                                            <div className={`h-10 flex items-center justify-center rounded-lg border text-lg font-bold ${change >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                                {change >= 0 ? formatCurrency(change) : `−${formatCurrency(Math.abs(change))}`}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Quick cash buttons */}
                                    {total > 0 && (
                                        <div className="flex gap-1.5 flex-wrap">
                                            {[
                                                total,
                                                Math.ceil(total / 100) * 100,
                                                Math.ceil(total / 500) * 500,
                                                Math.ceil(total / 1000) * 1000,
                                                5000, 10000,
                                            ].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 4).map(amount => (
                                                <button
                                                    key={amount}
                                                    onClick={() => setCashReceived(String(amount))}
                                                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-orange-500/50 hover:text-orange-400 transition-colors"
                                                >
                                                    {formatCurrency(amount)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 gap-2"
                                onClick={() => {
                                    if (receiptData) setShowReceipt(true);
                                    else toast.info('Complete a transaction first');
                                }}
                            >
                                <Printer className="w-4 h-4" />
                                Print receipt
                            </Button>
                            <Button
                                type="button"
                                onClick={handleConfirmPayment}
                                disabled={!canConfirm || isProcessing}
                                className={`gap-2 font-semibold transition-all ${canConfirm
                                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/20'
                                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                    }`}
                            >
                                {isProcessing ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <CheckCircle className="w-4 h-4" />
                                )}
                                {isProcessing ? 'Processing...' : 'Confirm payment'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* ───── Transaction History ───── */}
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/60">
                    <h3 className="text-sm font-semibold text-zinc-300">Transaction history</h3>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={historyDateFilter}
                            onChange={e => setHistoryDateFilter(e.target.value)}
                            className="h-8 px-3 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 outline-none focus:border-orange-500"
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportCSV}
                            className="h-8 text-[11px] border-zinc-700 text-zinc-400 hover:bg-zinc-800 gap-1.5"
                        >
                            <Download className="w-3 h-3" />
                            Export CSV
                        </Button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/50">
                                <th className="font-semibold py-3 pl-5">Customer / Vehicle</th>
                                <th className="font-semibold py-3">Time</th>
                                <th className="font-semibold py-3">Detailer</th>
                                <th className="font-semibold py-3">Amount</th>
                                <th className="font-semibold py-3">Status</th>
                                <th className="font-semibold py-3 pr-5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                            {filteredPayments.map((p: any) => (
                                <tr key={p._id || p.id} className="group hover:bg-zinc-800/30 transition-colors">
                                    <td className="py-3 pl-5">
                                        <div className="font-medium text-zinc-200 text-[13px]">
                                            {p.customer?.name || p.order?.customerName || 'Walk-in'}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 mt-0.5">
                                            {p.order?.serviceType || p.invoiceId || '—'}
                                        </div>
                                    </td>
                                    <td className="py-3 text-[12px] text-zinc-400">
                                        {p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </td>
                                    <td className="py-3 text-[12px] text-zinc-400">
                                        {p.staffAssigned?.name || '—'}
                                    </td>
                                    <td className="py-3">
                                        <span className="font-semibold text-zinc-200">{formatCurrency(p.amount || 0)}</span>
                                        <span className="text-[10px] uppercase ml-1.5 text-zinc-500 font-bold tracking-wider">{p.method}</span>
                                    </td>
                                    <td className="py-3">
                                        <Badge className={`text-[10px] font-semibold ${p.status === 'succeeded'
                                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                            : p.status === 'pending'
                                                ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                                                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                            }`}>
                                            {p.status === 'succeeded' ? 'Paid' : p.status}
                                        </Badge>
                                    </td>
                                    <td className="py-3 pr-5 text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleViewReceipt(p._id || p.id)}
                                            className="h-7 px-2.5 text-[11px] text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10"
                                        >
                                            <Receipt className="w-3.5 h-3.5 mr-1" />
                                            Receipt
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredPayments.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-sm text-zinc-600">
                                        No transactions for this date.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ───── Receipt Modal ───── */}
            <AnimatePresence>
                {showReceipt && receiptData && (
                    <POSReceipt
                        receipt={receiptData}
                        businessName={settings?.businessName || 'AutoSPF+'}
                        businessAddress={settings?.address}
                        businessPhone={settings?.phoneNumber}
                        onClose={() => setShowReceipt(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
    }
}
