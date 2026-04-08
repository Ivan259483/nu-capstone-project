import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Filter, User as UserIcon, Car, Hash, Tag, Percent,
    DollarSign, CreditCard, Banknote, Smartphone, CheckCircle, Printer,
    AlertTriangle, ChevronDown, X, Plus, Minus, Receipt, Clock, Download,
    TrendingUp, ShoppingBag, BarChart3, Activity, FileText, Monitor, History, Calendar, SplitSquareVertical, PauseCircle, PlayCircle
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

type PaymentMethodType = 'cash' | 'gcash' | 'card' | 'maya' | 'split';
type DiscountType = 'fixed' | 'percent';

const paymentMethods: { id: PaymentMethodType; label: string; icon: any; color: string }[] = [
    { id: 'cash', label: 'Cash', icon: Banknote, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    { id: 'gcash', label: 'GCash', icon: Smartphone, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { id: 'card', label: 'Credit card', icon: CreditCard, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { id: 'maya', label: 'Maya', icon: Smartphone, color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    { id: 'split', label: 'Split', icon: SplitSquareVertical, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
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
    const [splitPayments, setSplitPayments] = useState<{ method: PaymentMethodType; amount: string }[]>([
        { method: 'cash', amount: '' },
        { method: 'gcash', amount: '' }
    ]);
    const [heldTransactions, setHeldTransactions] = useState<any[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem('posHeldTransactions');
        if (saved) {
            try {
                setHeldTransactions(JSON.parse(saved));
            } catch (e) {
                console.error(e);
            }
        }
    }, []);

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
    const totalSplitAmount = useMemo(() => {
        return splitPayments.reduce((sum, sp) => sum + (Number(sp.amount) || 0), 0);
    }, [splitPayments]);

    const change = useMemo(() => {
        if (selectedPaymentMethod === 'split') {
            return totalSplitAmount - total;
        }
        const received = Number(cashReceived) || 0;
        return received - total;
    }, [cashReceived, total, selectedPaymentMethod, totalSplitAmount]);

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
        setSplitPayments([{ method: 'cash', amount: '' }, { method: 'gcash', amount: '' }]);
    }, []);

    const holdTransaction = useCallback(() => {
        if (!selectedBooking && cart.length === 0) return;
        
        const newHeld = {
            id: Date.now().toString(),
            booking: selectedBooking,
            cart,
            timestamp: new Date().toISOString()
        };
        
        const updated = [...heldTransactions, newHeld];
        setHeldTransactions(updated);
        localStorage.setItem('posHeldTransactions', JSON.stringify(updated));
        toast.success('Transaction placed on hold');
        resetPOS();
    }, [selectedBooking, cart, heldTransactions, resetPOS]);

    const resumeTransaction = useCallback((id: string) => {
        const held = heldTransactions.find(h => h.id === id);
        if (held) {
            setSelectedBooking(held.booking);
            setCart(held.cart);
            const updated = heldTransactions.filter(h => h.id !== id);
            setHeldTransactions(updated);
            localStorage.setItem('posHeldTransactions', JSON.stringify(updated));
            toast.success('Transaction resumed');
        }
    }, [heldTransactions]);

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
                splitPayments: selectedPaymentMethod === 'split' ? splitPayments.map(sp => ({ method: sp.method, amount: Number(sp.amount) || 0 })) : undefined,
                cashReceived: selectedPaymentMethod === 'cash' ? Number(cashReceived)
                            : selectedPaymentMethod === 'split' && splitPayments.find(sp => sp.method === 'cash')?.amount ? Number(splitPayments.find(sp => sp.method === 'cash')?.amount) : null,
            };

            const result = await PaymentService.createPOSTransaction(payload as any);

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
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-1.5 w-max relative shadow-2xl">
                {subTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setPosSubTab(tab.id)}
                        className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 z-10 ${
                            posSubTab === tab.id
                                ? 'text-orange-400'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        {posSubTab === tab.id && (
                            <motion.div 
                                layoutId="posSubTab" 
                                className="absolute inset-0 bg-white/5 rounded-xl border border-white/10"
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <tab.icon className="w-4 h-4 relative z-10" />
                        <span className="relative z-10 font-bold tracking-wide">{tab.label}</span>
                        <span className={`relative z-10 text-[10px] font-bold px-2 py-0.5 rounded-full transition-all duration-300 ${
                            posSubTab === tab.id
                                ? 'bg-orange-500 text-black shadow-[0_0_10px_rgba(249,115,22,0.3)]'
                                : 'bg-zinc-800/80 text-zinc-400'
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
                        whileHover={{ y: -2, scale: 1.01 }}
                        className="relative overflow-hidden rounded-2xl bg-black/40 backdrop-blur-md border border-white/5 p-5 group shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className={`absolute top-4 right-4 p-2.5 rounded-xl ${m.bg} group-hover:scale-110 transition-transform duration-500`}>
                            <m.icon className={`w-4 h-4 ${m.color}`} />
                        </div>
                        <p className="text-[10px] font-bold tracking-[2px] text-zinc-500 uppercase">{m.label}</p>
                        <p className="text-3xl font-bold text-white mt-2 mb-1 tracking-tight">{m.value}</p>
                        <p className="text-xs text-zinc-400">{m.sub}</p>
                        {/* Mini chart bars */}
                        <div className="flex items-end gap-[2px] absolute bottom-4 right-4 opacity-10 group-hover:opacity-30 transition-opacity duration-500">
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
                        {heldTransactions.length > 0 && !selectedBooking && cart.length === 0 && (
                            <div className="relative">
                                <select 
                                    className="appearance-none h-[42px] pl-4 pr-8 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-bold cursor-pointer hover:bg-blue-500/20 transition-colors outline-none"
                                    onChange={(e) => {
                                        if (e.target.value) resumeTransaction(e.target.value);
                                        e.target.value = "";
                                    }}
                                    value=""
                                >
                                    <option value="" disabled>Resume ({heldTransactions.length})</option>
                                    {heldTransactions.map(h => (
                                        <option key={h.id} value={h.id} className="bg-zinc-900 text-white font-medium">
                                            {h.booking?.customerName || 'Walk-in'} - {formatCurrency(h.cart.reduce((s: number, i: any) => s + (i.price * i.quantity), 0))}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-blue-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
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
                    <div className="rounded-2xl border border-white/5 bg-black/40 backdrop-blur-md overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
                                    <Activity className="w-4 h-4 text-orange-400" />
                                </div>
                                <h3 className="text-sm font-bold text-white tracking-wide">Available Services</h3>
                            </div>
                            <div className="relative w-48 group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-orange-400 transition-colors" />
                                <Input
                                    placeholder="Search catalog..."
                                    value={searchFilter}
                                    onChange={e => setSearchFilter(e.target.value)}
                                    className="pl-9 h-9 text-xs bg-zinc-900/50 border-white/10 text-white rounded-xl focus-visible:ring-1 focus-visible:ring-orange-500/50 focus-visible:border-orange-500/50 transition-all placeholder:text-zinc-600 shadow-inner"
                                />
                            </div>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar divide-y divide-white/5">
                            {displayMainServices.map(service => {
                                const inCart = cart.some(i => i.id === (service.id || service._id));
                                return (
                                    <button
                                        key={service.id || service._id}
                                        onClick={() => addToCart(service, false)}
                                        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-all group ${inCart
                                            ? 'bg-orange-500/10 border-l-2 border-l-orange-500'
                                            : 'hover:bg-white/[0.04] border-l-2 border-l-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${inCart ? 'bg-orange-500' : 'bg-zinc-800 text-zinc-500 group-hover:bg-orange-500/20 group-hover:text-orange-400'}`}>
                                                {inCart ? <CheckCircle className={`w-4 h-4 ${inCart ? 'text-black' : ''}`} /> : <Plus className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <span className={`block text-sm font-semibold transition-colors ${inCart ? 'text-orange-400' : 'text-zinc-200 group-hover:text-white'}`}>
                                                    {service.name}
                                                </span>
                                                {service.duration && (
                                                    <span className="text-[11px] font-medium text-zinc-500 flex items-center gap-1 mt-0.5">
                                                        <Clock className="w-3 h-3" />
                                                        {service.duration}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`text-sm font-bold tabular-nums ${inCart ? 'text-orange-400' : 'text-zinc-300'}`}>
                                            {formatCurrency(service.basePrice)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Add-ons Section */}
                        {displayAddonServices.length > 0 && (
                            <>
                                <div className="px-5 py-3 border-t border-white/5 bg-zinc-950/80 flex items-center gap-2">
                                    <h4 className="text-[10px] font-bold tracking-[2px] text-zinc-500 uppercase">Upsell Add-ons</h4>
                                </div>
                                <div className="divide-y divide-white/5 bg-black/20">
                                    {displayAddonServices.map(service => {
                                        const inCart = cart.some(i => i.id === (service.id || service._id));
                                        return (
                                            <button
                                                key={service.id || service._id}
                                                onClick={() => addToCart(service, true)}
                                                className={`w-full flex items-center justify-between px-5 py-3 text-left transition-all group ${inCart
                                                    ? 'bg-orange-500/10 border-l-2 border-l-orange-500'
                                                    : 'hover:bg-white/[0.04] border-l-2 border-l-transparent'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${inCart ? 'bg-orange-500' : 'bg-zinc-800 text-zinc-500 group-hover:bg-orange-500/20 group-hover:text-orange-400'}`}>
                                                        {inCart ? <CheckCircle className={`w-3 h-3 ${inCart ? 'text-black' : ''}`} /> : <Plus className="w-3 h-3" />}
                                                    </div>
                                                    <span className={`text-sm font-medium ${inCart ? 'text-orange-400' : 'text-zinc-400 group-hover:text-zinc-200'}`}>{service.name}</span>
                                                </div>
                                                <span className={`text-sm font-bold ${inCart ? 'text-orange-400' : 'text-zinc-500'}`}>
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
                    <form onSubmit={(e) => e.preventDefault()} className="rounded-2xl border border-white/5 bg-black/40 backdrop-blur-xl p-6 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-[50px] pointer-events-none rounded-full" />
                        
                        <div className="flex items-center justify-between mb-6 relative z-10">
                            <h3 className="text-sm font-bold tracking-wide text-white flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-orange-400" />
                                Digital Receipt
                            </h3>
                            {selectedBooking && (
                                <Badge className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/30 font-mono font-bold px-2 py-0.5 shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                                    #{selectedBooking.orderNumber || selectedBooking.id?.slice(-6)}
                                </Badge>
                            )}
                        </div>

                        {/* Cart Items */}
                        <div className="space-y-1 mb-6 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar relative z-10">
                            {cart.length === 0 ? (
                                <div className="py-10 text-center flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                        <Receipt className="w-5 h-5 text-zinc-600" />
                                    </div>
                                    <p className="text-sm font-medium text-zinc-400">Select a booking</p>
                                    <p className="text-xs text-zinc-600 mt-1">Add services to start</p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-3 px-1">Items</p>
                                    {cart.map(item => (
                                        <motion.div layout key={item.id} className="flex items-center justify-between p-2 hover:bg-white/[0.04] rounded-lg transition-colors group">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {item.isAddon && (
                                                    <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                                        <Tag className="w-3 h-3 text-zinc-400" />
                                                    </div>
                                                )}
                                                <span className={`text-sm font-medium truncate ${item.isAddon ? 'text-zinc-300' : 'text-white'}`}>{item.name}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg px-1 py-0.5">
                                                    <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:text-orange-400 text-zinc-500 transition-colors">
                                                        <Minus className="w-3 h-3" />
                                                    </button>
                                                    <span className="text-xs font-bold text-white w-5 text-center">{item.quantity}</span>
                                                    <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:text-orange-400 text-zinc-500 transition-colors">
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <span className="text-sm font-bold text-white w-20 text-right">{formatCurrency(item.price * item.quantity)}</span>
                                                <button onClick={() => removeFromCart(item.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-600 hover:bg-red-500/10 rounded transition-all">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Discount & Totals area */}
                        {cart.length > 0 && (
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-4 relative z-10">
                                {/* Discount Selector */}
                                <div>
                                    <button
                                        onClick={() => setShowDiscountPanel(!showDiscountPanel)}
                                        className="flex items-center gap-2 text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors mb-2"
                                    >
                                        <Percent className="w-3.5 h-3.5" />
                                        {showDiscountPanel ? 'Hide discount' : 'Add discount'}
                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDiscountPanel ? 'rotate-180' : ''}`} />
                                    </button>
                                    <AnimatePresence>
                                        {showDiscountPanel && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="space-y-3 pt-1 overflow-hidden"
                                            >
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setDiscountType('fixed')}
                                                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${discountType === 'fixed' ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' : 'bg-black/30 border-white/10 text-zinc-400 hover:bg-white/5'}`}
                                                    >
                                                        ₱ Fixed
                                                    </button>
                                                    <button
                                                        onClick={() => setDiscountType('percent')}
                                                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${discountType === 'percent' ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' : 'bg-black/30 border-white/10 text-zinc-400 hover:bg-white/5'}`}
                                                    >
                                                        % Percent
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Input
                                                        type="number"
                                                        placeholder={discountType === 'fixed' ? 'Amount (₱)' : 'Percentage (%)'}
                                                        value={discountValue}
                                                        onChange={e => setDiscountValue(e.target.value)}
                                                        className="h-9 text-xs font-medium bg-black/40 border-white/10 text-white focus:border-orange-500/50 focus:ring-orange-500/20"
                                                    />
                                                    <Input
                                                        placeholder="Reason (Optional)"
                                                        value={discountReason}
                                                        onChange={e => setDiscountReason(e.target.value)}
                                                        className="h-9 text-xs font-medium bg-black/40 border-white/10 text-white focus:border-orange-500/50 focus:ring-orange-500/20"
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Totals */}
                                <div className="border-t border-white/10 pt-3 space-y-2 text-sm">
                                    <div className="flex justify-between text-zinc-400 font-medium">
                                        <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                                    </div>
                                    {discountAmount > 0 && (
                                        <div className="flex justify-between text-orange-400 font-medium">
                                            <span>Discount{discountReason ? ` (${discountReason})` : ''}</span>
                                            <span>−{formatCurrency(discountAmount)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-xl font-black text-white pt-2 border-t border-white/10">
                                        <span>Total</span>
                                        <motion.span
                                            key={total}
                                            initial={{ scale: 1.15, textShadow: '0 0 20px rgba(249,115,22,0.5)' }}
                                            animate={{ scale: 1, textShadow: '0 0 0px rgba(249,115,22,0)' }}
                                            transition={{ duration: 0.3 }}
                                            className="text-orange-400"
                                        >
                                            {formatCurrency(total)}
                                        </motion.span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Staff Assignment */}
                        <div className="mt-4 pt-4 border-t border-white/5 relative z-10">
                            <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-3 px-1">Assign Technician</p>
                            <div className="relative">
                                <select
                                    value={staffId}
                                    onChange={e => setStaffId(e.target.value)}
                                    className="w-full h-11 rounded-xl bg-black/30 border border-white/10 text-sm font-medium text-white px-4 appearance-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 outline-none transition-all cursor-pointer"
                                >
                                    <option value="" className="bg-zinc-900">— Select technician —</option>
                                    {detailers.map(d => (
                                        <option key={d.id || d._id} value={d.id || d._id} className="bg-zinc-900">
                                            {d.name} • {d.role}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                                    <ChevronDown className="w-4 h-4" />
                                </div>
                            </div>
                        </div>

                        {/* Payment Method */}
                        <div className="mt-4 relative z-10">
                            <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-3 px-1">Payment Method</p>
                            <div className="grid grid-cols-2 gap-2">
                                {paymentMethods.map(pm => (
                                    <button
                                        key={pm.id}
                                        onClick={() => setSelectedPaymentMethod(pm.id)}
                                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all duration-300 ${selectedPaymentMethod === pm.id
                                            ? `${pm.color} shadow-lg scale-[1.02]`
                                            : 'bg-black/30 border-white/5 text-zinc-400 hover:bg-white/5 hover:border-white/20'
                                            }`}
                                    >
                                        <pm.icon className="w-4 h-4" />
                                        <span className="text-xs font-bold tracking-wide">{pm.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Cash Input */}
                        <AnimatePresence>
                            {selectedPaymentMethod === 'cash' && cart.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="mt-4 space-y-3 relative z-10"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Received</label>
                                            <Input
                                                type="number"
                                                placeholder="₱ 0.00"
                                                value={cashReceived}
                                                onChange={e => setCashReceived(e.target.value)}
                                                className="h-12 text-xl font-bold bg-black/40 border-white/10 text-white rounded-xl focus:border-orange-500 focus:ring-orange-500/20"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Change</label>
                                            <div className={`h-12 flex items-center justify-center rounded-xl border text-xl font-bold transition-colors ${change >= 0 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                                {change >= 0 ? formatCurrency(change) : `−${formatCurrency(Math.abs(change))}`}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Quick cash buttons */}
                                    {total > 0 && (
                                        <div className="flex gap-2 flex-wrap pb-1">
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
                                                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-zinc-300 hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-400 transition-all hover:scale-105"
                                                >
                                                    {formatCurrency(amount)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Split Payment Input */}
                        <AnimatePresence>
                            {selectedPaymentMethod === 'split' && cart.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="mt-4 space-y-3 relative z-10"
                                >
                                    <div className="space-y-2">
                                        {splitPayments.map((sp, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <div className="relative w-1/3">
                                                    <select
                                                        value={sp.method}
                                                        onChange={e => {
                                                            const newSp = [...splitPayments];
                                                            newSp[idx].method = e.target.value as PaymentMethodType;
                                                            setSplitPayments(newSp);
                                                        }}
                                                        className="w-full h-10 rounded-xl bg-black/40 border border-white/10 text-xs font-medium text-white px-3 appearance-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 outline-none transition-all cursor-pointer"
                                                    >
                                                        <option value="cash" className="bg-zinc-900">Cash</option>
                                                        <option value="gcash" className="bg-zinc-900">GCash</option>
                                                        <option value="card" className="bg-zinc-900">Card</option>
                                                        <option value="maya" className="bg-zinc-900">Maya</option>
                                                    </select>
                                                    <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                                </div>
                                                <Input
                                                    type="number"
                                                    placeholder="₱ 0.00"
                                                    value={sp.amount}
                                                    onChange={e => {
                                                        const newSp = [...splitPayments];
                                                        newSp[idx].amount = e.target.value;
                                                        setSplitPayments(newSp);
                                                    }}
                                                    className="flex-1 h-10 text-sm font-bold bg-black/40 border-white/10 text-white rounded-xl focus:border-orange-500 focus:ring-orange-500/20"
                                                />
                                                <button
                                                    onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))}
                                                    disabled={splitPayments.length <= 2}
                                                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${splitPayments.length > 2 ? 'hover:bg-red-500/20 text-zinc-500 hover:text-red-400' : 'opacity-30 cursor-not-allowed text-zinc-600'}`}
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <button
                                            onClick={() => setSplitPayments([...splitPayments, { method: 'cash', amount: '' }])}
                                            className="text-xs font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20 transition-colors"
                                        >
                                            <Plus className="w-3 h-3" /> Add Method
                                        </button>
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Remaining Status</p>
                                            <div className={`text-sm font-black ${change >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                                {change >= 0 ? `Change: ${formatCurrency(change)}` : `Remaining: ${formatCurrency(Math.abs(change))}`}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-5 gap-3 mt-6 pt-4 border-t border-white/5 relative z-10">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-12 rounded-xl text-[11px] font-bold border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white gap-2 transition-all col-span-2 px-2"
                                onClick={() => {
                                    if (receiptData) setShowReceipt(true);
                                    else if (cart.length > 0) holdTransaction();
                                }}
                            >
                                {receiptData ? <Printer className="w-4 h-4 text-zinc-400" /> : <PauseCircle className="w-4 h-4 text-emerald-500/80" />}
                                {receiptData ? 'Receipt' : 'Hold TRN'}
                            </Button>
                            <Button
                                type="button"
                                onClick={handleConfirmPayment}
                                disabled={!canConfirm || isProcessing}
                                className={`h-12 rounded-xl text-xs font-extrabold uppercase tracking-widest gap-2 transition-all duration-300 col-span-3 ${canConfirm
                                    ? 'bg-orange-500 hover:bg-orange-400 text-black border-none shadow-[0_4px_20px_rgba(249,115,22,0.4)] hover:shadow-[0_6px_25px_rgba(249,115,22,0.6)] hover:-translate-y-0.5'
                                    : 'bg-black/30 text-zinc-600 border border-white/5 cursor-not-allowed'
                                    }`}
                            >
                                {isProcessing ? (
                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                ) : (
                                    <CheckCircle className="w-4 h-4" />
                                )}
                                {isProcessing ? 'Processing' : 'Confirm'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* ───── Transaction History ───── */}
            <div className="rounded-2xl border border-white/5 bg-black/40 backdrop-blur-xl overflow-hidden shadow-2xl relative">
                <div className="absolute -left-32 -top-32 w-64 h-64 bg-orange-500/5 blur-[80px] pointer-events-none rounded-full" />
                
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 relative z-10">
                    <h3 className="text-sm font-bold tracking-wide text-white flex items-center gap-2">
                        <History className="w-4 h-4 text-orange-400" />
                        Transaction History
                    </h3>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <input
                                type="date"
                                value={historyDateFilter}
                                onChange={e => setHistoryDateFilter(e.target.value)}
                                className="h-9 pl-9 pr-3 rounded-xl text-xs font-medium bg-black/30 border border-white/10 text-zinc-300 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20"
                            />
                            <Calendar className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportCSV}
                            className="h-9 rounded-xl text-xs font-bold border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white gap-2"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export
                        </Button>
                    </div>
                </div>
                <div className="overflow-x-auto relative z-10">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 border-b border-white/5 bg-white/[0.01]">
                                <th className="py-4 pl-6">Customer / Vehicle</th>
                                <th className="py-4">Time</th>
                                <th className="py-4">Technician</th>
                                <th className="py-4">Amount</th>
                                <th className="py-4">Status</th>
                                <th className="py-4 pr-6 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredPayments.map((p: any) => (
                                <tr key={p._id || p.id} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="py-4 pl-6">
                                        <div className="font-bold text-white text-[13px]">
                                            {p.customer?.name || p.order?.customerName || 'Walk-in'}
                                        </div>
                                        <div className="text-[11px] font-medium text-zinc-500 mt-1 flex items-center gap-1.5">
                                            <Tag className="w-3 h-3" />
                                            {p.order?.serviceType || p.invoiceId || 'Standard Service'}
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <span className="text-[12px] font-medium text-zinc-400 bg-black/30 px-2 py-1 rounded-md border border-white/5">
                                            {p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </span>
                                    </td>
                                    <td className="py-4 text-[12px] font-medium text-zinc-300">
                                        {p.staffAssigned?.name || '—'}
                                    </td>
                                    <td className="py-4">
                                        <span className="font-bold text-white">{formatCurrency(p.amount || 0)}</span>
                                        <span className="text-[9px] uppercase ml-2 text-zinc-500 font-extrabold tracking-widest">{p.method}</span>
                                    </td>
                                    <td className="py-4">
                                        <Badge className={`text-[10px] font-bold px-2 py-0.5 ${p.status === 'succeeded'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                                            : p.status === 'pending'
                                                ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]'
                                                : 'bg-white/5 text-zinc-400 border border-white/10'
                                            }`}>
                                            {p.status === 'succeeded' ? 'Paid' : p.status}
                                        </Badge>
                                    </td>
                                    <td className="py-4 pr-6 text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleViewReceipt(p._id || p.id)}
                                            className="h-8 rounded-lg text-xs font-bold text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                                        >
                                            <Receipt className="w-3.5 h-3.5 mr-1.5" />
                                            Receipt
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredPayments.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center border-none">
                                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                                            <History className="w-5 h-5 text-zinc-600" />
                                        </div>
                                        <p className="text-sm font-bold text-zinc-400">No transactions found</p>
                                        <p className="text-xs text-zinc-600 mt-1">Try selecting a different date</p>
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
