import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Receipt, List, PlusCircle, Printer, Download, RefreshCw,
    CheckCircle, Clock, XCircle, ChevronDown, Search, FileText,
    DollarSign, CreditCard, Smartphone, Banknote, AlertCircle,
    Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { PaymentService } from '@/lib/payment-service';
import { OrderService } from '@/lib/order-service';
import { useAuth } from '@/contexts/AuthContext';
import type { Booking } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Payment {
    _id: string;
    id?: string;
    orderId?: string;
    booking?: { serviceName?: string; customerName?: string; id?: string };
    serviceName?: string;
    customerName?: string;
    amount?: number;
    totalAmount?: number;
    paymentMethod?: string;
    status?: string;
    createdAt?: string;
    paidAt?: string;
    invoiceId?: string;
}

type ViewSection = 'receipts' | 'new_transaction' | 'history';

const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash', icon: Banknote },
    { value: 'gcash', label: 'GCash', icon: Smartphone },
    { value: 'maya', label: 'Maya', icon: Smartphone },
    { value: 'card', label: 'Card', icon: CreditCard },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v?: number) =>
    v != null ? `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—';

const fmtDate = (v?: string) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusColor = (s?: string) => {
    switch (s?.toLowerCase()) {
        case 'paid': case 'completed': case 'success': return { bg: '#dcfce7', color: '#166534' };
        case 'pending': return { bg: '#fef9c3', color: '#854d0e' };
        case 'failed': case 'cancelled': return { bg: '#fee2e2', color: '#991b1b' };
        default: return { bg: '#f1f5f9', color: '#475569' };
    }
};

const StatusBadge = ({ status }: { status?: string }) => {
    const { bg, color } = statusColor(status);
    const icons: Record<string, any> = { paid: CheckCircle, completed: CheckCircle, success: CheckCircle, pending: Clock, failed: XCircle, cancelled: XCircle };
    const Icon = icons[status?.toLowerCase() ?? ''] ?? Clock;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color }}>
            <Icon style={{ width: 11, height: 11 }} />
            {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
        </span>
    );
};

// ── Section: Receipts ─────────────────────────────────────────────────────────

function ReceiptsSection() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [printing, setPrinting] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await PaymentService.getAllPayments(100);
        if (res?.success && Array.isArray(res.data)) {
            setPayments(res.data.filter((p: Payment) => p.status === 'paid' || p.status === 'completed'));
        } else {
            setPayments([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = payments.filter(p => {
        const q = search.toLowerCase();
        return (
            (p.booking?.customerName || p.customerName || '').toLowerCase().includes(q) ||
            (p.booking?.serviceName || p.serviceName || '').toLowerCase().includes(q) ||
            (p.invoiceId || '').toLowerCase().includes(q)
        );
    });

    const handlePrint = useCallback(async (p: Payment) => {
        const id = p._id || p.id;
        if (!id) return;
        setPrinting(id);
        try {
            const res = await PaymentService.getReceiptData(id);
            if (res?.success && res.data) {
                // Build a printable receipt window
                const win = window.open('', '_blank', 'width=400,height=600');
                if (win) {
                    const { booking, amount, totalAmount, paymentMethod, createdAt, paidAt, invoiceId } = res.data;
                    win.document.write(`
                        <html><head><title>Receipt - ${invoiceId || id}</title>
                        <style>
                            body{font-family:monospace;padding:24px;max-width:320px;margin:auto}
                            h2{text-align:center;margin-bottom:4px}
                            .sub{text-align:center;color:#666;font-size:12px;margin-bottom:16px}
                            .row{display:flex;justify-content:space-between;margin:4px 0;font-size:13px}
                            .divider{border-top:1px dashed #ccc;margin:10px 0}
                            .total{font-size:15px;font-weight:bold}
                            .footer{text-align:center;color:#888;font-size:11px;margin-top:16px}
                        </style></head><body>
                        <h2>AutoSPF+</h2>
                        <div class="sub">Official Digital Receipt</div>
                        <div class="divider"></div>
                        <div class="row"><span>Invoice #</span><span>${invoiceId || id}</span></div>
                        <div class="row"><span>Date</span><span>${fmtDate(paidAt || createdAt)}</span></div>
                        <div class="row"><span>Customer</span><span>${booking?.customerName || '—'}</span></div>
                        <div class="row"><span>Service</span><span>${booking?.serviceName || '—'}</span></div>
                        <div class="row"><span>Method</span><span>${paymentMethod?.toUpperCase() || '—'}</span></div>
                        <div class="divider"></div>
                        <div class="row total"><span>TOTAL PAID</span><span>${fmt(amount || totalAmount)}</span></div>
                        <div class="divider"></div>
                        <div class="footer">Thank you for choosing AutoSPF+<br/>This is your official receipt.</div>
                        </body></html>
                    `);
                    win.document.close();
                    win.print();
                }
            } else {
                toast.error('Could not load receipt data');
            }
        } catch {
            toast.error('Print failed');
        } finally {
            setPrinting(null);
        }
    }, []);

    return (
        <div>
            {/* Search + Refresh */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, opacity: 0.4 }} />
                    <input
                        id="staff-pos-receipts-search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by customer, service, or invoice #"
                        style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>
                <motion.button id="staff-pos-receipts-refresh" onClick={load} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <RefreshCw style={{ width: 14, height: 14 }} />
                </motion.button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, opacity: 0.4 }}>
                    <Loader2 style={{ width: 24, height: 24, margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: 13 }}>Loading receipts…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, opacity: 0.4 }}>
                    <FileText style={{ width: 32, height: 32, margin: '0 auto 10px' }} />
                    <p style={{ fontSize: 13 }}>No paid receipts found</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filtered.map(p => {
                        const pid = p._id || p.id || '';
                        const customer = p.booking?.customerName || p.customerName || '—';
                        const service = p.booking?.serviceName || p.serviceName || '—';
                        const amount = p.amount ?? p.totalAmount;
                        return (
                            <motion.div key={pid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                style={{ padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Receipt style={{ width: 18, height: 18, color: '#16a34a' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer}</div>
                                    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{service} · {fmtDate(p.paidAt || p.createdAt)}</div>
                                    {p.invoiceId && <div style={{ fontSize: 10, opacity: 0.4, marginTop: 1 }}>#{p.invoiceId}</div>}
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(amount)}</div>
                                    <StatusBadge status={p.status} />
                                </div>
                                <motion.button
                                    id={`staff-pos-print-${pid}`}
                                    onClick={() => handlePrint(p)}
                                    disabled={printing === pid}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, opacity: printing === pid ? 0.5 : 1 }}
                                >
                                    {printing === pid ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <Printer style={{ width: 13, height: 13 }} />}
                                    Print
                                </motion.button>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Section: New Transaction ──────────────────────────────────────────────────

function NewTransactionSection() {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [form, setForm] = useState({
        jobId: '',
        amount: '',
        paymentMethod: 'cash' as 'cash' | 'gcash' | 'maya' | 'card',
        notes: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        const load = async () => {
            setLoadingJobs(true);
            const res = await OrderService.getAllOrders({ suppressErrorToast: true });
            if (res?.success && Array.isArray(res.data)) {
                // Only show jobs that are in_progress, completed, or paid — relevant for POS
                setBookings(res.data.filter((b: Booking) =>
                    ['in_progress', 'completed', 'paid', 'assigned'].includes(b.status || '')
                ));
            }
            setLoadingJobs(false);
        };
        load();
    }, []);

    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.jobId) e.jobId = 'Please select a job';
        const amt = parseFloat(form.amount);
        if (!form.amount || isNaN(amt) || amt <= 0) e.amount = 'Enter a valid amount';
        if (!form.paymentMethod) e.paymentMethod = 'Select payment method';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setSubmitting(true);
        try {
            const booking = bookings.find(b => (b.id || (b as any)._id) === form.jobId);
            const serviceName = booking?.serviceName || 'Service';
            const res = await PaymentService.createPOSTransaction({
                orderId: form.jobId,
                items: [{ name: serviceName, price: parseFloat(form.amount), quantity: 1 }],
                paymentMethod: form.paymentMethod,
                staffId: user?.id || user?._id || null,
            });
            if (res?.success) {
                toast.success('Transaction logged successfully');
                setForm({ jobId: '', amount: '', paymentMethod: 'cash', notes: '' });
                setErrors({});
            } else {
                toast.error(res?.message || 'Transaction failed');
            }
        } catch {
            toast.error('Unexpected error — please try again');
        } finally {
            setSubmitting(false);
        }
    };

    const inputStyle = (hasErr: boolean): React.CSSProperties => ({
        width: '100%',
        padding: '10px 14px',
        borderRadius: 10,
        border: `1px solid ${hasErr ? '#ef4444' : 'var(--border)'}`,
        background: 'var(--bg-surface)',
        fontSize: 13,
        outline: 'none',
        boxSizing: 'border-box',
    });

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Job Selector */}
            <div>
                <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.65, display: 'block', marginBottom: 6 }}>
                    Select Job / Task *
                </label>
                {loadingJobs ? (
                    <div style={{ ...inputStyle(false), opacity: 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Loading jobs…
                    </div>
                ) : (
                    <div style={{ position: 'relative' }}>
                        <select
                            id="staff-pos-job-select"
                            value={form.jobId}
                            onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}
                            style={{ ...inputStyle(!!errors.jobId), appearance: 'none', paddingRight: 36, cursor: 'pointer' }}
                        >
                            <option value="">— Select a job —</option>
                            {bookings.map(b => {
                                const bid = (b.id || (b as any)._id) as string;
                                return (
                                    <option key={bid} value={bid}>
                                        #{bid.slice(-6).toUpperCase()} · {b.customerName || 'Customer'} — {b.serviceName || 'Service'}
                                    </option>
                                );
                            })}
                        </select>
                        <ChevronDown style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, opacity: 0.4, pointerEvents: 'none' }} />
                    </div>
                )}
                {errors.jobId && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.jobId}</p>}
            </div>

            {/* Amount */}
            <div>
                <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.65, display: 'block', marginBottom: 6 }}>
                    Amount (₱) *
                </label>
                <div style={{ position: 'relative' }}>
                    <DollarSign style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, opacity: 0.4 }} />
                    <input
                        id="staff-pos-amount"
                        type="number"
                        min="1"
                        step="0.01"
                        value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        style={{ ...inputStyle(!!errors.amount), paddingLeft: 34 }}
                    />
                </div>
                {errors.amount && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.amount}</p>}
            </div>

            {/* Payment Method */}
            <div>
                <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.65, display: 'block', marginBottom: 8 }}>
                    Payment Method *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                        <motion.button
                            key={value}
                            id={`staff-pos-method-${value}`}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, paymentMethod: value as any }))}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            style={{
                                padding: '10px 8px',
                                borderRadius: 10,
                                border: `1.5px solid ${form.paymentMethod === value ? '#f97316' : 'var(--border)'}`,
                                background: form.paymentMethod === value ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                fontWeight: form.paymentMethod === value ? 700 : 400,
                                color: form.paymentMethod === value ? '#f97316' : 'inherit',
                            }}
                        >
                            <Icon style={{ width: 16, height: 16 }} />
                            {label}
                        </motion.button>
                    ))}
                </div>
                {errors.paymentMethod && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.paymentMethod}</p>}
            </div>

            {/* Notes */}
            <div>
                <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.65, display: 'block', marginBottom: 6 }}>
                    Notes (optional)
                </label>
                <textarea
                    id="staff-pos-notes"
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any remarks about this transaction…"
                    rows={3}
                    style={{ ...inputStyle(false), resize: 'vertical', fontFamily: 'inherit' }}
                />
            </div>

            {/* Submit */}
            <motion.button
                id="staff-pos-submit"
                type="submit"
                disabled={submitting}
                whileHover={submitting ? {} : { scale: 1.01 }}
                whileTap={submitting ? {} : { scale: 0.98 }}
                style={{
                    padding: '13px',
                    borderRadius: 12,
                    border: 'none',
                    background: submitting ? '#d1d5db' : 'linear-gradient(135deg,#f97316,#fb923c)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                }}
            >
                {submitting ? (
                    <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />Logging Transaction…</>
                ) : (
                    <><PlusCircle style={{ width: 16, height: 16 }} />Log Transaction</>
                )}
            </motion.button>
        </form>
    );
}

// ── Section: Transaction History ──────────────────────────────────────────────

function TransactionHistorySection() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await PaymentService.getAllPayments(200);
        if (res?.success && Array.isArray(res.data)) {
            setPayments(res.data);
        } else {
            setPayments([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = payments.filter(p => {
        const q = search.toLowerCase();
        const matchSearch =
            (p.booking?.customerName || p.customerName || '').toLowerCase().includes(q) ||
            (p.booking?.serviceName || p.serviceName || '').toLowerCase().includes(q) ||
            (p.invoiceId || '').toLowerCase().includes(q);
        const matchStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const totalFiltered = filtered.reduce((acc, p) => acc + (p.amount ?? p.totalAmount ?? 0), 0);

    return (
        <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, opacity: 0.4 }} />
                    <input
                        id="staff-pos-history-search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search customer, service, invoice…"
                        style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>
                <select
                    id="staff-pos-history-status-filter"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
                >
                    <option value="all">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <motion.button id="staff-pos-history-refresh" onClick={load} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                </motion.button>
            </div>

            {/* Summary strip */}
            <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.18)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ opacity: 0.65 }}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</span>
                <span style={{ fontWeight: 700, color: '#f97316' }}>Total: {fmt(totalFiltered)}</span>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, opacity: 0.4 }}>
                    <Loader2 style={{ width: 24, height: 24, margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: 13 }}>Loading history…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, opacity: 0.4 }}>
                    <List style={{ width: 32, height: 32, margin: '0 auto 10px' }} />
                    <p style={{ fontSize: 13 }}>No transactions match your filter</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', opacity: 0.55 }}>
                                {['Date', 'Customer', 'Service', 'Method', 'Amount', 'Status'].map(h => (
                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {filtered.map((p, i) => {
                                    const pid = p._id || p.id || String(i);
                                    return (
                                        <motion.tr key={pid}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            style={{ borderBottom: '1px solid var(--border)' }}
                                        >
                                            <td style={{ padding: '10px', whiteSpace: 'nowrap', opacity: 0.65 }}>{fmtDate(p.paidAt || p.createdAt)}</td>
                                            <td style={{ padding: '10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {p.booking?.customerName || p.customerName || '—'}
                                            </td>
                                            <td style={{ padding: '10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {p.booking?.serviceName || p.serviceName || '—'}
                                            </td>
                                            <td style={{ padding: '10px', textTransform: 'capitalize' }}>
                                                {p.paymentMethod || '—'}
                                            </td>
                                            <td style={{ padding: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                {fmt(p.amount ?? p.totalAmount)}
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <StatusBadge status={p.status} />
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Main: StaffPOSView ────────────────────────────────────────────────────────

const SECTION_TABS: { id: ViewSection; label: string; icon: any }[] = [
    { id: 'receipts', label: 'Receipts', icon: Receipt },
    { id: 'new_transaction', label: 'New Transaction', icon: PlusCircle },
    { id: 'history', label: 'History', icon: List },
];

export function StaffPOSView() {
    const [activeSection, setActiveSection] = useState<ViewSection>('receipts');

    return (
        <div style={{ padding: '32px 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#f97316,#fb923c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Receipt style={{ width: 22, height: 22, color: '#fff' }} />
                </div>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>POS & Digital Receipts</h2>
                    <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>Transaction recording and receipt management</p>
                </div>
            </div>

            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '4px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', marginBottom: 24, width: 'fit-content' }}>
                {SECTION_TABS.map(({ id, label, icon: Icon }) => (
                    <motion.button
                        key={id}
                        id={`staff-pos-tab-${id}`}
                        onClick={() => setActiveSection(id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 9,
                            border: 'none',
                            background: activeSection === id ? '#f97316' : 'transparent',
                            color: activeSection === id ? '#fff' : 'inherit',
                            fontWeight: activeSection === id ? 700 : 400,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'background 0.18s, color 0.18s',
                        }}
                    >
                        <Icon style={{ width: 14, height: 14 }} />
                        {label}
                    </motion.button>
                ))}
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeSection === 'receipts' && <ReceiptsSection />}
                    {activeSection === 'new_transaction' && <NewTransactionSection />}
                    {activeSection === 'history' && <TransactionHistorySection />}
                </motion.div>
            </AnimatePresence>

            {/* Scope notice */}
            <div style={{ marginTop: 24, padding: '10px 14px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, opacity: 0.75 }}>
                <AlertCircle style={{ width: 13, height: 13, color: '#3b82f6', flexShrink: 0 }} />
                <span>This is a scoped view — refunds, pricing edits, and payment management are handled by the admin team.</span>
            </div>
        </div>
    );
}
