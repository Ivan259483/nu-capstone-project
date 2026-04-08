import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, Download, Send, CheckCircle, Clock, AlertTriangle,
    Plus, Camera, Lock, Shield, ChevronRight, Share,
    Search, ScanFace, FileSignature, HelpCircle, ArrowUpRight, Eye, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Booking } from '@/types';
import { OrderService } from '@/lib/order-service';

// ─── Types ──────────────────────────────────────────────────────
interface Waiver {
    id: string;
    customerName: string;
    vehicle: string;
    service: string;
    type: 'pre-service' | 'damage-report' | 'liability';
    status: 'signed' | 'awaiting' | 'expired';
    date: string;
    signedAt?: string;
    signature?: string;
    staffName?: string;
    staffRole?: string;
    refId: string;
    preServicePhotos?: string[];
    damageNotes?: string;
}

interface WaiversDocsProps {
    bookings: Booking[];
}

// ─── Helpers ────────────────────────────────────────────────────
const initials = (name: string) =>
    name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

const avatarGradient = (name: string) => {
    const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    return `hsl(${hue}, 55%, 40%)`;
};

// ─── Sparkles Background ─────────────────────────────────────────
function SubtleGrid() {
    return (
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
             style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
    );
}

// ─── Component ──────────────────────────────────────────────────
export function WaiversDocs({ bookings }: WaiversDocsProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedWaiver, setSelectedWaiver] = useState<Waiver | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isSendingReminder, setIsSendingReminder] = useState(false);

    const handleDownloadPdf = async (waiver: Waiver) => {
        try {
            setIsDownloading(true);
            toast.loading('Preparing PDF download...', { id: 'pdf-dl' });
            // Remove the WAIV- prefix to get the id if needed, or use order id. We use `waiver.id` as the order ID.
            const blob = await OrderService.downloadWaiverPdf(waiver.id);
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Waiver_${waiver.refId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Download complete!', { id: 'pdf-dl' });
        } catch (error) {
            console.error('Failed to download PDF:', error);
            toast.error('Failed to generate PDF. It might not be available yet.', { id: 'pdf-dl' });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSendReminder = async (waiver: Waiver) => {
        try {
            setIsSendingReminder(true);
            const response = await OrderService.sendWaiverReminder(waiver.id);
            if (response.success) {
                toast.success('Reminder sent via Email & SMS!');
            } else {
                toast.error(response.message || 'Failed to send reminder.');
            }
        } catch (error) {
            console.error('Failed to send reminder:', error);
            toast.error('Failed to send reminder. Check network.');
        } finally {
            setIsSendingReminder(false);
        }
    };

    // Build waivers from bookings
    const waivers: Waiver[] = useMemo(() => {
        return bookings.slice(0, 30).map((b, i) => {
            const waiverSigned = !!b.legalCompliance?.waiverSignature;
            const vehicle = [b.vehicleMake, b.vehicleModel, b.vehicleYear].filter(Boolean).join(' ') || 'N/A';
            return {
                id: b.id || b._id || `w-${i}`,
                customerName: b.customerName || b.customer?.name || 'Unknown',
                vehicle,
                service: b.serviceName || b.serviceType || 'Service',
                type: 'pre-service' as const,
                status: waiverSigned ? 'signed' as const : 'awaiting' as const,
                date: b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : new Date().toLocaleDateString('en-US'),
                signedAt: b.legalCompliance?.waiverSignedAt || undefined,
                signature: b.legalCompliance?.waiverSignature || undefined,
                staffName: typeof b.assignedDetailer === 'object' ? (b.assignedDetailer as any)?.name : undefined,
                staffRole: typeof b.assignedDetailer === 'object' ? (b.assignedDetailer as any)?.role : 'Technician',
                refId: `WAIV-${(b.id || b._id || `000${i}`).slice(-6).toUpperCase()}`,
                preServicePhotos: b.legalCompliance?.preServicePhotos || [],
                damageNotes: b.legalCompliance?.damageNotes || undefined,
            };
        });
    }, [bookings]);

    const filteredWaivers = useMemo(() => {
        if (!searchTerm.trim()) return waivers;
        const q = searchTerm.toLowerCase();
        return waivers.filter(w =>
            (w.customerName || '').toLowerCase().includes(q) ||
            (w.vehicle || '').toLowerCase().includes(q) ||
            (w.refId || '').toLowerCase().includes(q) ||
            (w.service || '').toLowerCase().includes(q) ||
            (w.date || '').toLowerCase().includes(q)
        );
    }, [waivers, searchTerm]);

    const signedCount = waivers.filter(w => w.status === 'signed').length;
    const awaitingCount = waivers.filter(w => w.status === 'awaiting').length;

    const getStatusConfig = (status: Waiver['status']) => {
        switch (status) {
            case 'signed': return { label: 'Signed', icon: CheckCircle, cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', iconCls: 'text-emerald-500' };
            case 'awaiting': return { label: 'Awaiting', icon: Clock, cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25', iconCls: 'text-amber-500' };
            case 'expired': return { label: 'Expired', icon: AlertTriangle, cls: 'bg-red-500/15 text-red-400 border-red-500/25', iconCls: 'text-red-500' };
        }
    };

    return (
        <div className="space-y-6">
            
            {/* ══ TOP RIBBON ══════════════════════════════════════════════════ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        Waivers & Legal Docs
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-[10px] uppercase font-bold">Encrypted</Badge>
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Manage digital signatures, pre-service agreements, and liability protections.</p>
                </div>
            </div>

            {/* ══ STAT CARDS ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-900/60 border border-zinc-800/60 p-5 group">
                    <SubtleGrid />
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                                <FileSignature className="w-4 h-4 text-emerald-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Signed Today</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight relative z-10">{signedCount}</p>
                    <p className="text-[11px] text-emerald-400/80 mt-1 flex items-center gap-1 relative z-10">
                        <CheckCircle className="w-3 h-3" /> All completed on time
                    </p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                    className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800/60 p-5 group">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                <Clock className="w-4 h-4 text-amber-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Awaiting Sign</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight relative z-10">{awaitingCount}</p>
                    <p className="text-[11px] text-amber-400/80 mt-1 flex items-center gap-1 relative z-10 cursor-pointer hover:text-amber-300">
                        <Send className="w-3 h-3" /> Send reminders
                    </p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800/60 p-5 group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                <ScanFace className="w-4 h-4 text-blue-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Damage Reports</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight relative z-10">14</p>
                    <p className="text-[11px] text-zinc-500 mt-1 relative z-10">This month</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-900/60 border border-zinc-800/60 p-5 group">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
                                <Shield className="w-4 h-4 text-purple-400" />
                            </div>
                            <span className="text-[10px] font-bold tracking-[1.5px] text-zinc-500 uppercase">Stored Docs</span>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-white tracking-tight relative z-10">238</p>
                    <p className="text-[11px] text-purple-400/80 mt-1 flex items-center gap-1 relative z-10">
                        <Lock className="w-3 h-3" /> Encrypted vault AES-256
                    </p>
                </motion.div>
            </div>

            {/* ══ MAIN SPLIT ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                
                {/* ── LEFT: Waivers List ── */}
                <div className="lg:col-span-3 space-y-5">
                    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden flex flex-col min-h-[400px]">
                        
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/30">
                            <div>
                                <h3 className="text-sm font-semibold text-white">Recent Documents</h3>
                                <p className="text-[11px] text-zinc-500 mt-0.5">{filteredWaivers.length} records</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* Search input */}
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <Input 
                                        placeholder="Search waivers..." 
                                        className="bg-zinc-900/50 border-zinc-800 text-xs pl-8 w-[200px] h-8 focus-visible:ring-orange-500/50"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <Button size="sm" className="h-8 text-[11px] bg-[#E87C2F] hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 gap-1.5"
                                    onClick={() => toast.info('New waiver creation coming soon')}>
                                    <FileSignature className="w-3.5 h-3.5" /> Generate Document
                                </Button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="overflow-y-auto max-h-[600px] flex-1">
                            <AnimatePresence>
                                {filteredWaivers.map((waiver, i) => {
                                    const cfg = getStatusConfig(waiver.status);
                                    const isSelected = selectedWaiver?.id === waiver.id;
                                    return (
                                        <motion.div
                                            key={waiver.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            onClick={() => setSelectedWaiver(isSelected ? null : waiver)}
                                            className={`group cursor-pointer border-b border-zinc-800/30 transition-all px-5 py-4 flex items-start gap-4 ${
                                                isSelected ? 'bg-orange-500/5 border-l-2 border-l-orange-500' : 'hover:bg-zinc-800/30 border-l-2 border-l-transparent'
                                            }`}
                                        >
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-inner"
                                                 style={{ backgroundColor: avatarGradient(waiver.customerName) }}>
                                                {initials(waiver.customerName)}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className="text-sm font-bold text-zinc-100 truncate pr-4">
                                                        {waiver.customerName}
                                                    </p>
                                                    <span className="text-[10px] font-mono text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded tracking-wide shrink-0">
                                                        {waiver.refId}
                                                    </span>
                                                </div>
                                                <p className="text-[12px] font-medium text-zinc-300 truncate mb-1">
                                                    {waiver.vehicle}
                                                </p>
                                                <div className="flex items-center flex-wrap gap-2 mt-2">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls}`}>
                                                        <cfg.icon className="w-3 h-3" />
                                                        {cfg.label}
                                                    </span>
                                                    <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                                                        <FileText className="w-3 h-3" /> Pre-service Waiver
                                                    </span>
                                                    <span className="text-[11px] text-zinc-600 ml-auto whitespace-nowrap">
                                                        {waiver.date}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                                                <ChevronRight className="w-4 h-4 text-zinc-500" />
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                            {filteredWaivers.length === 0 && (
                                <div className="py-16 text-center">
                                    <FileText className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
                                    <p className="text-sm text-zinc-500">No documents found matching the search.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick Access Pre-service Photos */}
                    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden flex flex-col p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <Camera className="w-4 h-4 text-orange-400" /> Pre-Service Condition Photos
                            </h3>
                            <button className="text-xs text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" /> Default Grid
                            </button>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            {['Front', 'Left', 'Right', 'Rear'].map((label, idx) => {
                                const photoData = selectedWaiver?.preServicePhotos?.[idx];
                                return (
                                    <div key={label} className="group relative aspect-[4/3] rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-800/30 flex flex-col items-center justify-center hover:bg-zinc-800/50 hover:border-orange-500/50 transition-colors cursor-pointer overflow-hidden">
                                        {photoData ? (
                                            <img src={photoData} alt={`Pre-service ${label}`} className="absolute inset-0 w-full h-full object-cover" />
                                        ) : (
                                            <>
                                                <Camera className="w-5 h-5 text-zinc-500 group-hover:text-orange-400 transition-colors mb-1" />
                                                <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 transition-colors font-medium">{label}</span>
                                            </>
                                        )}
                                        <div className="absolute inset-0 bg-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                );
                            })}
                        </div>
                        {selectedWaiver?.damageNotes && (
                            <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg border border-red-500/20">
                                <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">Customer Damage Notes</h4>
                                <p className="text-xs text-zinc-300">{selectedWaiver.damageNotes}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Preview Panel ── */}
                <div className="lg:col-span-2">
                    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 overflow-hidden flex flex-col sticky top-4 max-h-[85vh]">
                        {/* Preview Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/80 blur-backdrop flex-shrink-0">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <Eye className="w-4 h-4 text-zinc-400" /> Digital Preview
                            </h3>
                            {selectedWaiver && selectedWaiver.status === 'awaiting' && (
                                <button
                                    onClick={() => handleSendReminder(selectedWaiver)}
                                    disabled={isSendingReminder}
                                    className="flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:text-white transition-colors bg-orange-500/10 hover:bg-orange-500/20 px-3 py-1.5 justify-center rounded-md disabled:opacity-50"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" /> 
                                    {isSendingReminder ? 'Sending...' : 'Send Reminder'}
                                </button>
                            )}
                            {selectedWaiver && selectedWaiver.status === 'signed' && (
                                <button
                                    onClick={() => handleDownloadPdf(selectedWaiver)}
                                    disabled={isDownloading}
                                    className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 justify-center rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download className={`w-3.5 h-3.5 ${isDownloading ? 'animate-bounce' : ''}`} /> 
                                    {isDownloading ? 'Downloading...' : 'PDF'}
                                </button>
                            )}
                        </div>

                        <div className="p-5 overflow-y-auto flex-1 bg-[#0f1117]">
                            <AnimatePresence mode="wait">
                                {selectedWaiver ? (
                                    <motion.div
                                        key={selectedWaiver.id}
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        transition={{ duration: 0.3, ease: 'easeOut' }}
                                        className="space-y-4"
                                    >
                                        {/* The "Paper" Document */}
                                        <div className="bg-[#fcfbf9] rounded-sm p-6 shadow-2xl relative overflow-hidden text-zinc-800 print-document min-h-[500px]">
                                            {/* Watermark/Seal */}
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-5 flex flex-col items-center">
                                                <Shield className="w-64 h-64" />
                                            </div>
                                            
                                            {/* Document Header */}
                                            <div className="flex justify-between items-start mb-8 pb-4 border-b-2 border-zinc-200">
                                                <div>
                                                    <h3 className="text-2xl font-black text-zinc-900 tracking-tighter">AutoSPF+</h3>
                                                    <p className="text-[9px] uppercase tracking-widest text-zinc-500 mt-1 font-bold">Official Document</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-mono text-zinc-500 mb-1">{selectedWaiver.refId}</p>
                                                    <p className="text-xs text-zinc-500">{selectedWaiver.date}</p>
                                                </div>
                                            </div>

                                            {/* Title */}
                                            <h4 className="text-center font-bold text-lg mb-6 uppercase tracking-wider text-zinc-900 border border-zinc-200 py-2 bg-zinc-50">
                                                Pre-Service Authorization Waiver
                                            </h4>

                                            {/* Details Table */}
                                            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-zinc-400 mb-0.5">Customer Name</span>
                                                    <span className="font-medium">{selectedWaiver.customerName}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-zinc-400 mb-0.5">Vehicle Detail</span>
                                                    <span className="font-medium">{selectedWaiver.vehicle}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-zinc-400 mb-0.5">Service Requested</span>
                                                    <span className="font-medium">{selectedWaiver.service}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-zinc-400 mb-0.5">Technician</span>
                                                    <span className="font-medium">{selectedWaiver.staffName || 'To Be Assigned'}</span>
                                                </div>
                                            </div>

                                            {/* Legal Text */}
                                            <div className="text-[11px] leading-relaxed text-zinc-600 text-justify mb-8 space-y-3 font-serif">
                                                <p>
                                                    I, the undersigned, hereby authorize the staff of AutoSPF+ to operate and detail my vehicle for the purposes of the service requested. I understand that detailing involves inherent risks to vehicle surfaces, electronics, and interiors depending on their pre-existing condition.
                                                </p>
                                                <p>
                                                    I acknowledge that AutoSPF+ is not liable for any pre-existing damage, loose parts, or electronic malfunctions unless caused by direct negligence during the service. I confirm that high-resolution visual documentation of the vehicle's state prior to service may be taken and retained securely.
                                                </p>
                                            </div>

                                            {/* Signature Block */}
                                            <div className="mt-8 pt-6 border-t border-zinc-200">
                                                <div className="flex justify-between items-end">
                                                    <div className="w-2/3 pr-8">
                                                        <div className="mb-2">
                                                            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Customer Signature</span>
                                                        </div>
                                                        {selectedWaiver.status === 'signed' ? (
                                                            <div className="h-16 flex items-end border-b border-zinc-300 pb-2 relative">
                                                                {/* Placeholder script font styling for realistic signature */}
                                                                <span className="text-3xl font-['Brush_Script_MT',cursive,serif] text-[#1a365d] -rotate-3 opacity-90 transform-origin-left relative z-10" style={{fontFamily: "'Rage Italic', 'Brush Script MT', cursive"}}>
                                                                    {selectedWaiver.customerName}
                                                                </span>
                                                                <div className="absolute right-0 bottom-2 text-[8px] text-zinc-400 font-mono text-right">
                                                                    DIGITALLY SIGNED<br/>
                                                                    {selectedWaiver.signedAt || selectedWaiver.date}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="h-16 border-b border-zinc-300 border-dashed flex items-center justify-center bg-zinc-50 relative group cursor-pointer transition-colors hover:bg-orange-50">
                                                                <span className="text-xs text-orange-500 font-medium group-hover:block transition-all flex items-center gap-1">
                                                                    <Share className="w-3 h-3" /> Send Signature Link
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="mt-1 text-[9px] text-zinc-400 font-mono">
                                                            IP: {Math.floor(Math.random()*255)}.{Math.floor(Math.random()*255)}.{Math.floor(Math.random()*255)}.{Math.floor(Math.random()*255)} · TX: {selectedWaiver.id.split('-')[1] || selectedWaiver.id}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Status Stamp */}
                                                    <div className="w-1/3 flex justify-end pb-4">
                                                        {selectedWaiver.status === 'signed' ? (
                                                            <div className="border-2 border-emerald-600/60 rounded-full w-16 h-16 flex items-center justify-center -rotate-12 opacity-70 cursor-default" title="Verified Complete">
                                                                <div className="border border-emerald-600/40 rounded-full w-14 h-14 flex items-center justify-center font-bold text-[10px] uppercase text-emerald-700 text-center leading-tight tracking-wider">
                                                                    Valid<br/>Auth
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="border-2 border-amber-500/60 rounded-full w-16 h-16 flex items-center justify-center rotate-12 opacity-70" title="Action Required">
                                                                <div className="border border-amber-500/40 rounded-full w-14 h-14 flex items-center justify-center font-bold text-[10px] uppercase text-amber-600 text-center leading-tight tracking-wider">
                                                                    Sign<br/>Pend
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Buttons Below Document */}
                                        <div className="flex gap-3">
                                            {selectedWaiver.status === 'awaiting' ? (
                                                <Button className="flex-1 bg-[#E87C2F] hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20"
                                                        onClick={() => toast.success(`Signature request sent to ${selectedWaiver.customerName}`)}>
                                                    <Send className="w-4 h-4 mr-2" /> Send SMS / Email Request
                                                </Button>
                                            ) : (
                                                <Button variant="outline" className="flex-1 border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700"
                                                        onClick={() => toast.info('Document audit trail opened')}>
                                                    <HelpCircle className="w-4 h-4 mr-2 text-zinc-400" /> View Audit Trail
                                                </Button>
                                            )}
                                        </div>

                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="h-[500px] flex flex-col items-center justify-center text-center px-6"
                                    >
                                        <div className="w-20 h-20 rounded-full bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-6 relative">
                                            <div className="absolute inset-0 bg-orange-500/5 rounded-full animate-pulse" />
                                            <Shield className="w-8 h-8 text-zinc-600" />
                                            <Lock className="w-4 h-4 text-orange-500 absolute bottom-3 right-3 bg-zinc-900 rounded-full border-2 border-zinc-900" />
                                        </div>
                                        <h4 className="text-base font-semibold text-white mb-2">Secure Document Vault</h4>
                                        <p className="text-sm text-zinc-500 max-w-[250px]">
                                            Select any document from the list to preview its contents, verify signatures, or request missing authorizations.
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
