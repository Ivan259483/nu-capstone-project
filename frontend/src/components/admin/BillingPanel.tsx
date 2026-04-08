import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp, TrendingDown, AlertCircle, FileText, RotateCcw,
    Download, Plus, Mail, Printer, ChevronRight, CreditCard,
    Smartphone, Banknote, CheckCircle2, Clock, XCircle,
    ArrowUpRight, ArrowDownRight, Dot, Sparkles, Eye, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface BillingPanelProps {
    payments: any[];
    onRefresh?: () => void;
}

type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';

// ─── Helpers ────────────────────────────────────────────────────────────────
const initials = (name: string) =>
    name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

const avatarGradient = (name: string) => {
    const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    return `hsl(${hue},45%,35%)`;
};

const methodIcon = (method: string) => {
    const m = (method || '').toLowerCase();
    if (m === 'gcash' || m === 'maya') return <Smartphone className="w-3 h-3" />;
    if (m === 'card') return <CreditCard className="w-3 h-3" />;
    return <Banknote className="w-3 h-3" />;
};

const methodLabel = (method: string) => (method || 'cash').toUpperCase();

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; cls: string; dot: string; icon: React.ReactNode }> = {
    paid: {
        label: 'Paid',
        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
        dot: 'bg-emerald-400',
        icon: <CheckCircle2 className="w-3 h-3" />,
    },
    unpaid: {
        label: 'Pending',
        cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
        dot: 'bg-amber-400',
        icon: <Clock className="w-3 h-3" />,
    },
    overdue: {
        label: 'Overdue',
        cls: 'bg-red-500/15 text-red-400 border-red-500/25',
        dot: 'bg-red-400',
        icon: <XCircle className="w-3 h-3" />,
    },
};

// ─── Sparkline paths ─────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const w = 80, h = 28;
    const pts = data.map((v, i) => [
        (i / (data.length - 1)) * w,
        h - (v / max) * (h - 4),
    ]);
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${d} L${w} ${h} L0 ${h} Z`;
    return (
        <svg width={w} height={h} className="overflow-visible">
            <defs>
                <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#sg-${color})`} />
            <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
export function BillingPanel({ payments, onRefresh }: BillingPanelProps) {
    const [selectedPayment, setSelectedPayment] = useState<any>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | InvoiceStatus>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const handlePrint = (e: React.MouseEvent) => {
        e.preventDefault();
        const content = document.getElementById('printable-receipt');
        if (!content) return;
        
        const stylesHtml = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(node => node.outerHTML)
            .join('\n');
            
        toast.info('Preparing document...');
        
        setTimeout(() => {
            const printWindow = window.open('', '_blank', 'width=800,height=900,left=200,top=100');
            if (!printWindow) {
                toast.error("Please allow pop-ups to print the receipt.");
                return;
            }
            
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>AutoSPF+ Receipt</title>
                        ${stylesHtml}
                        <style>
                            html, body {
                                background-color: #18181b !important;
                                color: #e8edf5 !important;
                                margin: 0;
                                padding: 40px 20px;
                                display: flex;
                                justify-content: center;
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                            #printable-receipt {
                                width: 100% !important;
                                max-width: 700px !important;
                                position: static !important;
                                margin: 0 auto !important;
                            }
                        </style>
                    </head>
                    <body>
                        ${content.outerHTML}
                        <script>
                            setTimeout(() => {
                                window.print();
                                window.close();
                            }, 600);
                        </script>
                    </body>
                </html>
            `);
            printWindow.document.close();
        }, 150);
    };

    // ─── Revenue calculations ───────────────────────────────────────────
    const now = useMemo(() => new Date(), []);

    const monthRevenue = useMemo(() => payments
        .filter(p => {
            if (!p.createdAt || p.status !== 'succeeded') return false;
            const d = new Date(p.createdAt);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .reduce((s, p) => s + (Number(p.amount) || 0), 0),
        [payments, now]
    );

    const lastMonthRevenue = useMemo(() => {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return payments
            .filter(p => {
                if (!p.createdAt || p.status !== 'succeeded') return false;
                const d = new Date(p.createdAt);
                return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
            })
            .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    }, [payments, now]);

    const revenueGrowth = lastMonthRevenue > 0
        ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
        : monthRevenue > 0 ? 100 : 0;

    const outstandingTotal = useMemo(() =>
        payments.filter(p => p.status !== 'succeeded').reduce((s, p) => s + (Number(p.amount) || 0), 0),
        [payments]);
    const outstandingCount = payments.filter(p => p.status !== 'succeeded').length;
    const receiptsCount = useMemo(() =>
        payments.filter(p => p.status === 'succeeded').length, [payments]);

    // ─── Invoices derived ──────────────────────────────────────────────
    const invoices = useMemo(() => payments.map((p: any) => {
        const status: InvoiceStatus = p.status === 'succeeded' ? 'paid'
            : (p.createdAt && (Date.now() - new Date(p.createdAt).getTime()) > 7 * 86400000) ? 'overdue'
                : 'unpaid';
        const customer = p.customer?.name || p.order?.customerName || 'Walk-in';
        const ref = p.invoiceId
            || `INV-${new Date(p.createdAt || Date.now()).toISOString().slice(0, 10).replace(/-/g, '')}-${(p._id || p.id || '').slice(-6).toUpperCase()}`;
        return { ...p, invoiceStatus: status, customer, ref };
    }), [payments]);

    const filteredInvoices = useMemo(() => {
        let result = filterStatus === 'all' ? invoices : invoices.filter(i => i.invoiceStatus === filterStatus);
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            result = result.filter(i => 
                (i.customer || '').toLowerCase().includes(q) ||
                (i.ref || '').toLowerCase().includes(q) ||
                (i.order?.serviceType || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [invoices, filterStatus, searchTerm]);

    const paidCount = invoices.filter(i => i.invoiceStatus === 'paid').length;
    const unpaidCount = invoices.filter(i => i.invoiceStatus === 'unpaid').length;
    const overdueCount = invoices.filter(i => i.invoiceStatus === 'overdue').length;

    // ─── Chart data (last 14 days) ────────────────────────────────────
    const chartData = useMemo(() => {
        return Array.from({ length: 14 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (13 - i));
            const ds = d.toISOString().slice(0, 10);
            const val = payments
                .filter(p => p.status === 'succeeded' && p.createdAt?.slice(0, 10) === ds)
                .reduce((s, p) => s + (Number(p.amount) || 0), 0);
            return {
                label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                shortLabel: d.toLocaleDateString('en-US', { day: 'numeric' }),
                isToday: i === 13,
                val,
            };
        });
    }, [payments]);

    const maxChart = Math.max(...chartData.map(d => d.val), 1);
    const sparklineData = chartData.map(d => d.val);

    // ─── Render ────────────────────────────────────────────────────────
    return (
        <div className="space-y-5">

            {/* ══ TOP RIBBON ══════════════════════════════════════════════════ */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Billing & Finance</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-zinc-700/60 bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5"
                        onClick={() => toast.info('Exporting CSV…')}
                    >
                        <Download className="w-3.5 h-3.5" /> Export CSV
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 text-xs bg-[#E87C2F] hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 gap-1.5"
                        onClick={() => toast.info('Invoice creation coming soon')}
                    >
                        <Plus className="w-3.5 h-3.5" /> New Invoice
                    </Button>
                </div>
            </div>

            {/* ══ STAT CARDS ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Monthly Revenue */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-900/60 border border-zinc-800/60 p-5"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none rounded-2xl" />
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
                                <TrendingUp className="w-4 h-4 text-orange-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Revenue</span>
                        </div>
                        <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${revenueGrowth >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {revenueGrowth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(revenueGrowth)}%
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight">{formatCurrency(monthRevenue)}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">vs {formatCurrency(lastMonthRevenue)} last month</p>
                    <div className="mt-3 opacity-70">
                        <Sparkline data={sparklineData} color="#E87C2F" />
                    </div>
                </motion.div>

                {/* Outstanding */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
                    className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800/60 p-5"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${outstandingTotal > 0 ? 'bg-amber-500/15' : 'bg-zinc-800'}`}>
                                <AlertCircle className={`w-4 h-4 ${outstandingTotal > 0 ? 'text-amber-400' : 'text-zinc-600'}`} />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Outstanding</span>
                        </div>
                        {outstandingCount > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                                {outstandingCount} pending
                            </span>
                        )}
                    </div>
                    <p className={`text-2xl font-bold tracking-tight ${outstandingTotal > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {formatCurrency(outstandingTotal)}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1">{outstandingCount} open invoice{outstandingCount !== 1 ? 's' : ''}</p>
                    {outstandingTotal > 0 && (
                        <div className="mt-3 w-full bg-zinc-800 rounded-full h-1">
                            <div
                                className="h-1 rounded-full bg-amber-400"
                                style={{ width: `${Math.min((outstandingTotal / (monthRevenue || 1)) * 100, 100)}%` }}
                            />
                        </div>
                    )}
                </motion.div>

                {/* Receipts issued */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
                    className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800/60 p-5"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                <FileText className="w-4 h-4 text-blue-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Receipts</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight">{receiptsCount}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">Issued this month</p>
                    <div className="mt-3 grid grid-cols-3 gap-1">
                        {[paidCount, unpaidCount, overdueCount].map((v, i) => {
                            const colors = ['bg-emerald-500', 'bg-amber-500', 'bg-red-500'];
                            const labels = ['Paid', 'Pending', 'Due'];
                            return (
                                <div key={i} className="text-center">
                                    <div className={`h-0.5 rounded-full ${colors[i]} mb-1 opacity-70`} />
                                    <span className="text-[9px] text-zinc-600">{v} {labels[i]}</span>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Refunds */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }}
                    className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800/60 p-5"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center">
                                <RotateCcw className="w-4 h-4 text-zinc-500" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Refunds</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-zinc-500 tracking-tight">{formatCurrency(0)}</p>
                    <p className="text-[11px] text-zinc-600 mt-1">0 processed this period</p>
                    <div className="mt-3 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-emerald-500/60" />
                        <span className="text-[10px] text-emerald-500/80">No refund requests</span>
                    </div>
                </motion.div>
            </div>

            {/* ══ MAIN SPLIT ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                {/* ── LEFT: Invoice Table ── */}
                <div className="lg:col-span-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden flex flex-col">

                    {/* Table header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-zinc-800/50">
                        <div>
                            <h3 className="text-sm font-semibold text-white">Invoices</h3>
                            <p className="text-[11px] text-zinc-500 mt-0.5">{filteredInvoices.length} total records</p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            {/* Search input */}
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <Input 
                                    placeholder="Search invoices..." 
                                    className="bg-zinc-900/50 border-zinc-800 text-xs pl-8 w-[200px] h-8 focus-visible:ring-orange-500/50"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            {/* Filter pills */}
                            <div className="flex gap-1 p-0.5 bg-zinc-800/60 rounded-lg border border-zinc-700/30">
                                {(['all', 'paid', 'unpaid', 'overdue'] as const).map(s => {
                                    const counts: Record<string, number> = { all: invoices.length, paid: paidCount, unpaid: unpaidCount, overdue: overdueCount };
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => setFilterStatus(s)}
                                            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${filterStatus === s
                                                ? 'bg-zinc-700 text-white shadow-sm'
                                                : 'text-zinc-500 hover:text-zinc-300'
                                                }`}
                                        >
                                            {s.charAt(0).toUpperCase() + s.slice(1)}
                                            <span className={`ml-1 opacity-60 ${filterStatus === s ? 'opacity-100' : ''}`}>
                                                {counts[s]}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-widest text-zinc-600 border-b border-zinc-800/40">
                                    <th className="font-semibold text-left py-3 pl-5">Customer</th>
                                    <th className="font-semibold text-left py-3">Reference</th>
                                    <th className="font-semibold text-left py-3">Date</th>
                                    <th className="font-semibold text-right py-3">Amount</th>
                                    <th className="font-semibold text-right py-3 pr-5">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence>
                                    {filteredInvoices.slice(0, 20).map((inv: any, i) => {
                                        const cfg = STATUS_CONFIG[inv.invoiceStatus as InvoiceStatus];
                                        const isSelected = selectedPayment && ((inv._id && selectedPayment._id === inv._id) || (inv.id && selectedPayment.id === inv.id));
                                        return (
                                            <motion.tr
                                                key={inv._id || inv.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ delay: i * 0.03 }}
                                                onClick={() => setSelectedPayment(isSelected ? null : inv)}
                                                className={`group cursor-pointer border-b border-zinc-800/30 transition-all ${isSelected
                                                    ? 'bg-orange-500/5 border-l-2 border-l-orange-500'
                                                    : 'hover:bg-zinc-800/25 border-l-2 border-l-transparent'
                                                    }`}
                                            >
                                                {/* Customer */}
                                                <td className="py-3.5 pl-5">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                                            style={{ backgroundColor: avatarGradient(inv.customer) }}
                                                        >
                                                            {initials(inv.customer)}
                                                        </div>
                                                        <div>
                                                            <p className="text-[13px] font-semibold text-zinc-200 leading-tight">
                                                                {inv.customer}
                                                            </p>
                                                            {inv.order?.serviceType && (
                                                                <p className="text-[10px] text-zinc-600 mt-0.5">{inv.order.serviceType}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Reference */}
                                                <td className="py-3.5">
                                                    <span className="text-[10px] font-mono text-orange-400/80 bg-orange-500/8 px-2 py-0.5 rounded">
                                                        {inv.ref}
                                                    </span>
                                                </td>

                                                {/* Date */}
                                                <td className="py-3.5 text-[12px] text-zinc-500">
                                                    {inv.createdAt
                                                        ? new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                        : '—'}
                                                </td>

                                                {/* Amount */}
                                                <td className="py-3.5 text-right">
                                                    <span className="text-[14px] font-bold text-zinc-100 tabular-nums">
                                                        {formatCurrency(inv.amount || 0)}
                                                    </span>
                                                    <div className="flex items-center justify-end gap-1 mt-0.5 text-zinc-600">
                                                        {methodIcon(inv.method)}
                                                        <span className="text-[10px] font-semibold">{methodLabel(inv.method)}</span>
                                                    </div>
                                                </td>

                                                {/* Status */}
                                                <td className="py-3.5 pr-5 text-right">
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
                                                        {cfg.icon}
                                                        {cfg.label}
                                                    </span>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                                {filteredInvoices.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center">
                                            <FileText className="w-8 h-8 mx-auto mb-2 text-zinc-700" />
                                            <p className="text-sm text-zinc-600">No invoices found</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── RIGHT: Receipt Preview ── */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/40">
                            <h3 className="text-sm font-semibold text-white">Receipt preview</h3>
                            {selectedPayment && (
                                <button
                                    onClick={handlePrint}
                                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-orange-400 transition-colors"
                                >
                                    <Printer className="w-3.5 h-3.5" /> Print
                                </button>
                            )}
                        </div>

                        <div className="p-5 flex-1">
                            <AnimatePresence mode="wait">
                                {selectedPayment ? (
                                    <motion.div
                                        key="receipt"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="space-y-4"
                                    >
                                        {/* Receipt card */}
                                        <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/40 overflow-hidden">
                                            {/* Orange top stripe */}
                                            <div className="h-1 bg-gradient-to-r from-orange-500 to-orange-400" />

                                            <div className="p-4 space-y-4">
                                                {/* Brand + meta */}
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="text-base font-black tracking-tight bg-gradient-to-r from-orange-400 to-orange-300 bg-clip-text text-transparent">
                                                            AutoSPF+
                                                        </div>
                                                        <div className="text-[10px] text-zinc-600 mt-0.5">Official Receipt</div>
                                                        <div className="text-[8px] text-zinc-500 mt-1.5 leading-relaxed">
                                                            123 Auto Detailing Ave, Manila<br />
                                                            contact@autospf.com | +63 917 123 4567<br />
                                                            TIN: 123-456-789-000
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] font-mono text-orange-400/80 bg-orange-500/8 px-2 py-0.5 rounded">
                                                            {selectedPayment.ref || `#RCPT-${(selectedPayment._id || '').slice(-6).toUpperCase()}`}
                                                        </div>
                                                        <div className="text-[10px] text-zinc-600 mt-1">
                                                            {selectedPayment.createdAt
                                                                ? new Date(selectedPayment.createdAt).toLocaleDateString('en-US', {
                                                                    month: 'long', day: 'numeric', year: 'numeric'
                                                                })
                                                                : 'N/A'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Divider */}
                                                <div className="border-t border-dashed border-zinc-700/50" />

                                                {/* Customer info */}
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                                                        style={{ backgroundColor: avatarGradient(selectedPayment.customer || 'X') }}
                                                    >
                                                        {initials(selectedPayment.customer || 'X')}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{selectedPayment.customer}</p>
                                                        <p className="text-[10px] text-zinc-500">
                                                            {selectedPayment.order?.vehicleMake && `${selectedPayment.order.vehicleMake} `}
                                                            {selectedPayment.order?.vehicleModel || 'Vehicle N/A'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Divider */}
                                                <div className="border-t border-dashed border-zinc-700/50" />

                                                {/* Line items */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[12px] text-zinc-300">
                                                            {selectedPayment.order?.serviceType || 'Detailing Service'}
                                                        </span>
                                                        <span className="text-[12px] font-semibold text-zinc-100 tabular-nums">
                                                            {formatCurrency(selectedPayment.amount || 0)}
                                                        </span>
                                                    </div>
                                                    {selectedPayment.discount?.value > 0 && (
                                                        <div className="flex justify-between">
                                                            <span className="text-[11px] text-red-400/80">Discount</span>
                                                            <span className="text-[11px] text-red-400/80">
                                                                −{formatCurrency(selectedPayment.discount.value)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                                                            {methodIcon(selectedPayment.method)}
                                                            {methodLabel(selectedPayment.method)}
                                                        </span>
                                                        {selectedPayment.staffAssigned?.name && (
                                                            <span className="text-[10px] text-zinc-600">
                                                                Staff: {selectedPayment.staffAssigned.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Total */}
                                                <div className="bg-zinc-900/80 rounded-lg p-3 flex justify-between items-center">
                                                    <span className="text-xs text-zinc-400 font-semibold">TOTAL PAID</span>
                                                    <span className="text-xl font-black text-orange-400 tabular-nums">
                                                        {formatCurrency(selectedPayment.amount || 0)}
                                                    </span>
                                                </div>

                                                {/* Warranty & Payment Detail */}
                                                <div className="flex justify-between items-center bg-zinc-900/40 rounded-lg p-2.5 border border-zinc-700/30">
                                                    <div>
                                                        <span className="text-[9px] text-zinc-500 block mb-0.5 mt-0">PAYMENT TYPE</span>
                                                        <span className="text-[10px] font-medium text-zinc-300 uppercase">
                                                            {selectedPayment.order?.paymentExtent ? `${selectedPayment.order.paymentExtent} Payment` : 'Full Payment'}
                                                        </span>
                                                    </div>
                                                    {(selectedPayment.order?.warrantyAndReceipt?.certificateNumber || selectedPayment.order?.certificateNumber) && (
                                                        <div className="text-right">
                                                            <span className="text-[9px] text-orange-500 block mb-0.5 mt-0">WARRANTY CERT</span>
                                                            <span className="text-[10px] font-mono font-bold text-orange-400">
                                                                {selectedPayment.order?.warrantyAndReceipt?.certificateNumber || selectedPayment.order?.certificateNumber}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Authorization */}
                                                <div className="pt-3 pb-1 flex justify-between items-end border-t border-dashed border-zinc-700/50">
                                                    <div className="text-center w-24">
                                                        <div className="border-b border-zinc-600 h-6 mb-1"></div>
                                                        <div className="text-[8px] text-zinc-500 uppercase tracking-widest">Customer</div>
                                                    </div>
                                                    <div className="text-center w-24">
                                                        <div className="border-b border-zinc-600 h-6 mb-1 px-1 flex items-end justify-center">
                                                            <span className="text-[10px] font-medium text-zinc-300 truncate w-full">{selectedPayment.staffAssigned?.name || 'Cashier'}</span>
                                                        </div>
                                                        <div className="text-[8px] text-zinc-500 uppercase tracking-widest">Autospf+</div>
                                                    </div>
                                                </div>

                                                {/* Footer meta */}
                                                <div className="text-[9px] text-zinc-600 text-center space-y-1.5 mt-4">
                                                    <div className="border-t border-solid border-zinc-700/30 pt-3">
                                                        <span className="font-mono">Ref: {selectedPayment.providerReference || (selectedPayment._id || '').slice(-16).toUpperCase()}</span>
                                                    </div>
                                                    <div className="text-[8px] text-zinc-500/80 px-2 leading-relaxed">
                                                        All sales are final. Warranty claims require presenting this official receipt and the warranty certificate. Vehicles left over 24 hours after completion may be subject to parking fees.
                                                    </div>
                                                    <div className="pt-1 font-bold text-zinc-400">Thank you for choosing AutoSPF+ · VAT inclusive</div>
                                                </div>

                                                {/* Status badge */}
                                                <div className="flex justify-center">
                                                    {(() => {
                                                        const cfg = STATUS_CONFIG[selectedPayment.invoiceStatus as InvoiceStatus] || STATUS_CONFIG.paid;
                                                        return (
                                                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border ${cfg.cls}`}>
                                                                {cfg.icon}
                                                                {cfg.label}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                className="h-9 text-xs border-zinc-700/60 bg-zinc-800/40 text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5"
                                                onClick={() => toast.success('Email copy sent!')}
                                            >
                                                <Mail className="w-3.5 h-3.5" /> Email copy
                                            </Button>
                                            <Button
                                                className="h-9 text-xs bg-[#E87C2F] hover:bg-orange-600 text-white shadow-md shadow-orange-500/20 gap-1.5"
                                                onClick={handlePrint}
                                            >
                                                <Download className="w-3.5 h-3.5" /> Download PDF
                                            </Button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex flex-col items-center justify-center py-16 text-center"
                                    >
                                        <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/30 flex items-center justify-center mb-4">
                                            <FileText className="w-7 h-7 text-zinc-600" />
                                        </div>
                                        <p className="text-sm font-medium text-zinc-500">Select an invoice</p>
                                        <p className="text-xs text-zinc-700 mt-1">Click any row to preview its receipt</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══ REVENUE CHART ═══════════════════════════════════════════════ */}
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/40">
                    <div>
                        <h3 className="text-sm font-semibold text-white">
                            Revenue trend — {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </h3>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Last 14 days · Daily breakdown</p>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-1.5 rounded-full bg-[#E87C2F]" />Collected
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-1.5 rounded-full bg-zinc-700" />No activity
                        </span>
                    </div>
                </div>

                <div className="px-6 pt-4 pb-6">
                    {/* Y-axis labels + bars */}
                    <div className="flex gap-3">
                        {/* Y labels */}
                        <div className="flex flex-col justify-between text-[9px] text-zinc-700 text-right w-10 shrink-0" style={{ height: 120 }}>
                            {[maxChart, maxChart * 0.75, maxChart * 0.5, maxChart * 0.25, 0].map((v, i) => (
                                <span key={i}>₱{v >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v)}</span>
                            ))}
                        </div>

                        {/* Chart area */}
                        <div className="flex-1 relative" style={{ height: 120 }}>
                            {/* Grid lines */}
                            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => (
                                <div
                                    key={i}
                                    className="absolute left-0 right-0 border-t border-zinc-800/40"
                                    style={{ top: `${frac * 100}%` }}
                                />
                            ))}

                            {/* Bars */}
                            <div className="absolute inset-0 flex items-end gap-1.5">
                                {chartData.map((day, i) => {
                                    const pct = Math.max((day.val / maxChart) * 100, day.val > 0 ? 6 : 2);
                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group/bar relative">
                                            {/* Tooltip */}
                                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/bar:flex flex-col items-center z-10">
                                                <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-center whitespace-nowrap shadow-xl">
                                                    <p className="text-[11px] font-bold text-white">{formatCurrency(day.val)}</p>
                                                    <p className="text-[10px] text-zinc-500">{day.label}</p>
                                                </div>
                                                <div className="w-1.5 h-1.5 bg-zinc-800 border-r border-b border-zinc-700 rotate-45 -mt-1" />
                                            </div>

                                            <motion.div
                                                initial={{ height: 0 }}
                                                animate={{ height: `${pct}%` }}
                                                transition={{ delay: i * 0.04, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                                className={`w-full rounded-t-md transition-all ${day.isToday
                                                    ? 'bg-gradient-to-t from-orange-600 to-orange-400 shadow-lg shadow-orange-500/25'
                                                    : day.val > 0
                                                        ? 'bg-orange-500/30 group-hover/bar:bg-orange-500/50'
                                                        : 'bg-zinc-800/60'
                                                    }`}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* X-axis labels */}
                    <div className="flex gap-1.5 mt-2 pl-13">
                        <div className="w-10 shrink-0" />
                        {chartData.map((day, i) => (
                            <div key={i} className="flex-1 text-center">
                                <span className={`text-[9px] ${day.isToday ? 'text-orange-400 font-bold' : 'text-zinc-700'}`}>
                                    {day.shortLabel}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
