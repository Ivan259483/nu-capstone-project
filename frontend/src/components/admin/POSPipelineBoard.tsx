import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    CalendarCheck, UserCheck, Wrench, ClipboardCheck, CreditCard, CarFront,
    Hash, User as UserIcon, Clock
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { Booking } from '@/types';

interface POSPipelineBoardProps {
    bookings: Booking[];
    onSelectBooking: (booking: Booking) => void;
}

// Pipeline stage definitions
const PIPELINE_STAGES: {
    key: string;
    label: string;
    statuses: string[];
    icon: any;
    color: string;
    bg: string;
    border: string;
    glow: string;
}[] = [
    {
        key: 'confirmed',
        label: 'Confirmed',
        statuses: ['confirmed', 'assigned'],
        icon: CalendarCheck,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        glow: 'shadow-[0_0_20px_rgba(59,130,246,0.08)]',
    },
    {
        key: 'received',
        label: 'Checked-In',
        statuses: ['received'],
        icon: UserCheck,
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/20',
        glow: 'shadow-[0_0_20px_rgba(6,182,212,0.08)]',
    },
    {
        key: 'in_progress',
        label: 'In Progress',
        statuses: ['in_progress'],
        icon: Wrench,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.08)]',
    },
    {
        key: 'completed',
        label: 'QC / Complete',
        statuses: ['completed', 'ready_for_payment'],
        icon: ClipboardCheck,
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        glow: 'shadow-[0_0_20px_rgba(168,85,247,0.08)]',
    },
    {
        key: 'paid',
        label: 'Paid',
        statuses: ['paid'],
        icon: CreditCard,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        glow: 'shadow-[0_0_20px_rgba(16,185,129,0.08)]',
    },
    {
        key: 'released',
        label: 'Released',
        statuses: ['released'],
        icon: CarFront,
        color: 'text-zinc-400',
        bg: 'bg-zinc-500/10',
        border: 'border-zinc-500/20',
        glow: '',
    },
];

export function POSPipelineBoard({ bookings, onSelectBooking }: POSPipelineBoardProps) {
    // Categorize bookings into pipeline stages
    const pipeline = useMemo(() => {
        const result: Record<string, Booking[]> = {};
        PIPELINE_STAGES.forEach(stage => {
            result[stage.key] = bookings.filter(b =>
                stage.statuses.includes(b.status || '') && !(b as any).archived
            );
        });
        return result;
    }, [bookings]);

    const totalActive = useMemo(() =>
        PIPELINE_STAGES.slice(0, 5).reduce((sum, s) => sum + (pipeline[s.key]?.length || 0), 0),
        [pipeline]
    );

    return (
        <div className="space-y-5">
            {/* Pipeline Summary Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">Job Pipeline</h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                        {totalActive} active job{totalActive !== 1 ? 's' : ''} across all stages
                    </p>
                </div>
                {/* Mini stats */}
                <div className="flex items-center gap-3">
                    {PIPELINE_STAGES.slice(0, 5).map(stage => (
                        <div key={stage.key} className="flex items-center gap-1.5" title={stage.label}>
                            <div className={`w-2 h-2 rounded-full ${stage.bg} ${stage.color.replace('text-', 'bg-')}`} />
                            <span className="text-[11px] font-bold text-zinc-400">
                                {pipeline[stage.key]?.length || 0}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pipeline Columns */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {PIPELINE_STAGES.map((stage, stageIdx) => {
                    const cards = pipeline[stage.key] || [];
                    const StageIcon = stage.icon;

                    return (
                        <motion.div
                            key={stage.key}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: stageIdx * 0.06 }}
                            className={`rounded-2xl border ${stage.border} bg-black/40 backdrop-blur-md overflow-hidden flex flex-col ${stage.glow}`}
                        >
                            {/* Column Header */}
                            <div className={`px-3 py-2.5 border-b ${stage.border} ${stage.bg} flex items-center justify-between`}>
                                <div className="flex items-center gap-2">
                                    <StageIcon className={`w-3.5 h-3.5 ${stage.color}`} />
                                    <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-300">
                                        {stage.label}
                                    </span>
                                </div>
                                <Badge className={`text-[9px] font-black px-1.5 py-0 ${stage.bg} ${stage.color} border ${stage.border}`}>
                                    {cards.length}
                                </Badge>
                            </div>

                            {/* Cards */}
                            <div className="flex-1 p-2 space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                                {cards.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-6 text-center opacity-40">
                                        <StageIcon className="w-5 h-5 text-zinc-600 mb-2" />
                                        <span className="text-[10px] text-zinc-600 font-medium">No jobs</span>
                                    </div>
                                ) : (
                                    cards.map((booking, idx) => (
                                        <motion.button
                                            key={booking.id || booking._id}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: stageIdx * 0.06 + idx * 0.04 }}
                                            onClick={() => onSelectBooking(booking)}
                                            className="w-full text-left p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-orange-500/30 hover:bg-orange-500/[0.04] transition-all group cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[11px] font-bold text-white truncate max-w-[80%] group-hover:text-orange-300 transition-colors">
                                                    {booking.customerName || 'Customer'}
                                                </span>
                                                <Hash className="w-2.5 h-2.5 text-zinc-600 flex-shrink-0" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                                                    <UserIcon className="w-2.5 h-2.5" />
                                                    <span className="truncate">
                                                        {booking.serviceName || booking.serviceType || 'Service'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {booking.bookingTime || booking.time || '--:--'}
                                                    </span>
                                                    {(booking.totalPrice || booking.totalAmount) && (
                                                        <span className="text-[10px] font-bold text-orange-400/70">
                                                            {formatCurrency(Number(booking.totalPrice || booking.totalAmount || 0))}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
