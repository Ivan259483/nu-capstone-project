import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, Clock, AlertTriangle, Users,
    Plus, Zap, Calendar, Bot, CalendarDays, Info, X,
    CheckCircle, Car, Send, Play, BadgeCheck, ShoppingCart, User as UserIcon,
    ArrowRight, ClipboardCheck, CreditCard
} from 'lucide-react';
import type { Booking, User, BusinessSettings, Service } from '@/types';
import { SERVICE_STAFF_ROLE } from '@/lib/roles';
import BookingChip from './BookingChip';

/* ───────────── types ───────────── */
interface SmartCalendarProps {
    bookings: Booking[];
    users: User[];
    services?: Service[];
    isDarkMode: boolean;
    settings?: BusinessSettings | null;
    onSelectBooking: (id: string) => void;
    onNewBooking: () => void;
    onReschedule: (booking: Booking) => void;
    onUpdateStatus: (booking: Booking) => void;
    selectedBookingId: string | null;
}

type CalView = 'month' | 'week' | 'day';

/* ───────────── constants ───────────── */
const STAFF_COLORS = [
    { bg: '#3B82F6', fg: '#BFDBFE', dark: '#1D4ED8' },
    { bg: '#8B5CF6', fg: '#DDD6FE', dark: '#6D28D9' },
    { bg: '#EC4899', fg: '#FBCFE8', dark: '#BE185D' },
    { bg: '#14B8A6', fg: '#99F6E4', dark: '#0F766E' },
    { bg: '#F59E0B', fg: '#FDE68A', dark: '#B45309' },
    { bg: '#10B981', fg: '#A7F3D0', dark: '#065F46' },
    { bg: '#6366F1', fg: '#C7D2FE', dark: '#4338CA' },
    { bg: '#EF4444', fg: '#FEE2E2', dark: '#B91C1C' },
];

const HOUR_START = 7;
const HOUR_END   = 20;
const CELL_H     = 80;

const STATUS_META: Record<string, { color: string; label: string; bg: string }> = {
    pending:           { color: '#F59E0B', label: 'Pending',           bg: 'rgba(245,158,11,0.15)' },
    confirmed:         { color: '#3B82F6', label: 'Confirmed',         bg: 'rgba(59,130,246,0.15)' },
    assigned:          { color: '#8B5CF6', label: 'Assigned',          bg: 'rgba(139,92,246,0.15)' },
    received:          { color: '#14B8A6', label: 'Received',          bg: 'rgba(20,184,166,0.15)' },
    'in-progress':     { color: '#F97316', label: 'In Progress',       bg: 'rgba(249,115,22,0.15)' },
    processing:        { color: '#F97316', label: 'Processing',        bg: 'rgba(249,115,22,0.15)' },
    completed:         { color: '#22C55E', label: 'Completed',         bg: 'rgba(34,197,94,0.15)' },
    cancelled:         { color: '#6B7280', label: 'Cancelled',         bg: 'rgba(107,114,128,0.15)' },
    queued:            { color: '#6366F1', label: 'Queued',            bg: 'rgba(99,102,241,0.15)' },
    ready_for_payment: { color: '#A855F7', label: 'Ready for Payment', bg: 'rgba(168,85,247,0.15)' },
    paid:              { color: '#22C55E', label: 'Paid',              bg: 'rgba(34,197,94,0.15)' },
};

/* ── The operational flow pipeline steps ── */
const FLOW_STEPS = [
    { icon: Calendar,       label: 'Book',      desc: 'Customer books online' },
    { icon: CheckCircle,    label: 'Confirm',    desc: 'Admin confirms & assigns' },
    { icon: Car,            label: 'Check-In',   desc: 'Vehicle arrives at shop' },
    { icon: ClipboardCheck, label: 'Service',    desc: 'Detailing in progress' },
    { icon: BadgeCheck,     label: 'QC',         desc: 'Quality check' },
    { icon: CreditCard,     label: 'Payment',    desc: 'POS checkout & release' },
];

/* ───────────── helpers ───────────── */
function parseBookingTime(t?: string): { h: number; m: number } | null {
    if (!t) return null;
    const m = t.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (m[3] === 'PM' && h !== 12) h += 12;
    if (m[3] === 'AM' && h === 12) h = 0;
    return { h, m: min };
}

function getBookingDate(b: Booking): Date | null {
    const raw = b.bookingDate || (b as any).date || b.createdAt;
    if (!raw) return null;
    const d = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? new Date(`${raw}T00:00:00`) : new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

function dateKey(d: Date) { return d.toLocaleDateString('en-CA'); }
function isSameDay(a: Date, b: Date) { return dateKey(a) === dateKey(b); }
function startOfWeek(d: Date) {
    const c = new Date(d); c.setDate(d.getDate() - d.getDay()); c.setHours(0,0,0,0); return c;
}
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function formatHour(h: number) {
    if (h === 0) return '12 AM'; if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM'; return `${h - 12} PM`;
}
function buildStaffColorMap(users: User[]): Map<string, typeof STAFF_COLORS[0]> {
    const map = new Map<string, typeof STAFF_COLORS[0]>();
    users.filter(u => u.role === SERVICE_STAFF_ROLE)
         .forEach((u, i) => map.set(u.id || u._id || '', STAFF_COLORS[i % STAFF_COLORS.length]));
    return map;
}
function getStaffId(b: Booking): string {
    const ad = b.assignedDetailer;
    if (!ad) return ''; if (typeof ad === 'string') return ad;
    return (ad as User).id || (ad as User)._id || '';
}
function getStaffName(b: Booking, users: User[]): string | null {
    const ad = b.assignedDetailer;
    if (!ad) return null;
    if (typeof ad === 'object') return (ad as User).name || (ad as User).displayName || null;
    const u = users.find(u => (u.id || u._id) === ad);
    return u?.name || u?.displayName || null;
}
function detectConflicts(bookings: Booking[]): Set<string> {
    const conflicts = new Set<string>();
    const sorted = bookings.filter(b => parseBookingTime(b.bookingTime) && getBookingDate(b))
        .sort((a, b) => {
            const da = getBookingDate(a)!.getTime(), db = getBookingDate(b)!.getTime();
            const ta = parseBookingTime(a.bookingTime)!, tb = parseBookingTime(b.bookingTime)!;
            return (da + ta.h * 60 + ta.m) - (db + tb.h * 60 + tb.m);
        });
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const da = getBookingDate(sorted[i])!, db = getBookingDate(sorted[j])!;
            if (!isSameDay(da, db)) continue;
            const ta = parseBookingTime(sorted[i].bookingTime)!;
            const tb = parseBookingTime(sorted[j].bookingTime)!;
            if (Math.abs((ta.h * 60 + ta.m) - (tb.h * 60 + tb.m)) < 60) {
                conflicts.add(sorted[i].id || sorted[i]._id || ''); conflicts.add(sorted[j].id || sorted[j]._id || '');
            }
        }
    }
    return conflicts;
}
function getFlowStep(status: string): number {
    const map: Record<string, number> = {
        'pending': 0, 'confirmed': 1, 'assigned': 1, 'received': 2,
        'in-progress': 3, 'processing': 3, 'queued': 2,
        'completed': 4, 'ready_for_payment': 5, 'paid': 5, 'cancelled': -1,
    };
    return map[status] ?? 0;
}

/* ───────────── MAIN COMPONENT ───────────── */
export const SmartCalendar: React.FC<SmartCalendarProps> = ({
    bookings, users, services, isDarkMode: dark, settings,
    onSelectBooking, onNewBooking, onReschedule, onUpdateStatus, selectedBookingId,
}) => {
    const locale = useMemo(() => {
        try { Intl.DateTimeFormat(undefined, { timeZone: (settings as any)?.timezone || 'Asia/Manila' }); return 'en-PH'; }
        catch { return 'en-US'; }
    }, [settings]);

    const [view, setView]             = useState<CalView>('week');
    const [anchor, setAnchor]         = useState<Date>(new Date());
    const [direction, setDir]         = useState(0);
    const [statusFilter, setStatus]   = useState<string>('all');
    const [staffFilter, setStaff]     = useState<string>('all');
    const scrollRef                   = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current && (view === 'week' || view === 'day'))
            scrollRef.current.scrollTop = (8 - HOUR_START) * CELL_H;
    }, [view]);

    const staffColorMap  = useMemo(() => buildStaffColorMap(users), [users]);
    const safeBookings   = useMemo(() => Array.isArray(bookings) ? bookings : [], [bookings]);
    const conflicts      = useMemo(() => detectConflicts(safeBookings), [safeBookings]);
    const detailers      = useMemo(() => users.filter(u => u.role === SERVICE_STAFF_ROLE), [users]);
    const chipColor      = useCallback((b: Booking) => staffColorMap.get(getStaffId(b)) ?? STAFF_COLORS[0], [staffColorMap]);

    const filteredBookings = useMemo(() => safeBookings.filter(b => {
        const active = ['in-progress','assigned','processing','confirmed','received','queued','in_progress'];
        if (statusFilter === 'pending'   && b.status !== 'pending') return false;
        if (statusFilter === 'active'    && !active.includes(b.status)) return false;
        if (statusFilter === 'done'      && b.status !== 'completed') return false;
        if (staffFilter !== 'all'        && getStaffId(b) !== staffFilter) return false;
        return true;
    }), [safeBookings, statusFilter, staffFilter]);

    const weekDays = useMemo(() => {
        const sw = startOfWeek(anchor);
        return Array.from({ length: 7 }, (_, i) => addDays(sw, i));
    }, [anchor]);

    const monthCells = useMemo(() => {
        const first  = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const offset = first.getDay();
        const total  = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
        return Array.from({ length: offset + total }, (_, i) =>
            i < offset ? null : new Date(anchor.getFullYear(), anchor.getMonth(), i - offset + 1)
        );
    }, [anchor]);

    const bookingsByDay = useMemo(() => {
        const map = new Map<string, Booking[]>();
        filteredBookings.forEach(b => {
            const d = getBookingDate(b); if (!d) return;
            const k = dateKey(d);
            if (!map.has(k)) map.set(k, []); map.get(k)!.push(b);
        });
        return map;
    }, [filteredBookings]);

    const todayKey = dateKey(new Date());
    const todayBookings = useMemo(() => safeBookings.filter(b => {
        const d = getBookingDate(b);
        return d && dateKey(d) === todayKey;
    }), [safeBookings, todayKey]);

    const kpis = useMemo(() => ({
        todayTotal: todayBookings.length,
        waiting:    todayBookings.filter(b => b.status === 'pending').length,
        inService:  todayBookings.filter(b => ['in-progress','assigned','processing','confirmed','received','queued'].includes(b.status)).length,
        done:       todayBookings.filter(b => b.status === 'completed').length,
    }), [todayBookings]);

    const upcomingToday = useMemo(() => {
        const today = new Date();
        return safeBookings
            .filter(b => { const d = getBookingDate(b); return d && isSameDay(d, today) && b.status !== 'completed'; })
            .sort((a, b) => {
                const ta = parseBookingTime(a.bookingTime) ?? { h:23, m:59 };
                const tb = parseBookingTime(b.bookingTime) ?? { h:23, m:59 };
                return (ta.h*60+ta.m) - (tb.h*60+tb.m);
            }).slice(0, 8);
    }, [safeBookings]);

    const staffAvailability = useMemo(() => {
        const todayBks = safeBookings.filter(b => {
            const d = getBookingDate(b);
            return d && dateKey(d) === todayKey && !['completed','cancelled'].includes(b.status);
        });
        return users.filter(u => u.role === SERVICE_STAFF_ROLE).map(u => {
            const uid = u.id || u._id || '';
            const jobs = todayBks.filter(b => getStaffId(b) === uid);
            return { user: u, jobs, color: staffColorMap.get(uid) ?? STAFF_COLORS[0] };
        });
    }, [users, safeBookings, staffColorMap, todayKey]);

    const conflictAlerts = useMemo(() => {
        const msgs: string[] = [];
        safeBookings.filter(b => conflicts.has(b.id || b._id || '')).forEach(b => {
            const d = getBookingDate(b);
            if (d) {
                const day = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
                msgs.push(`Conflict · ${day} · ${b.customerName || 'Unknown'} — ${b.bookingTime || 'unscheduled'}`);
            }
        });
        return [...new Set(msgs)];
    }, [safeBookings, conflicts, locale]);

    const navigate = useCallback((delta: number) => {
        setDir(delta);
        setAnchor(prev => {
            const c = new Date(prev);
            if (view === 'month') c.setMonth(prev.getMonth() + delta);
            else if (view === 'week') c.setDate(prev.getDate() + 7 * delta);
            else c.setDate(prev.getDate() + delta);
            return c;
        });
    }, [view]);

    const goToday = useCallback(() => { setDir(0); setAnchor(new Date()); }, []);

    const navLabel = useMemo(() => {
        if (view === 'month') return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(anchor);
        if (view === 'week') {
            const sw = startOfWeek(anchor), ew = addDays(sw, 6);
            const sm = new Intl.DateTimeFormat(locale, { month: 'short' }).format(sw);
            const em = new Intl.DateTimeFormat(locale, { month: 'short' }).format(ew);
            const yr = new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(ew);
            return sm === em ? `${sm} ${yr}` : `${sm} – ${em} ${yr}`;
        }
        return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(anchor);
    }, [view, anchor, locale]);

    const today = new Date();
    const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

    const slideVariants = {
        enter:  (d: number) => ({ x: d * 40, opacity: 0 }),
        center: { x: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 280, damping: 28 } },
        exit:   (d: number) => ({ x: d * -40, opacity: 0, transition: { duration: 0.15 } }),
    };

    const selectedPanelBooking = safeBookings.find(b => (b.id || b._id) === selectedBookingId) ?? null;

    /* ── Workflow context helpers ── */
    const getNextAction = (status: string): { label: string; icon: React.ReactNode; color: string } => {
        switch (status) {
            case 'pending':     return { label: 'Confirm & Assign',      icon: <CheckCircle className="w-4 h-4" />, color: '#F59E0B' };
            case 'confirmed':   return { label: 'Send to POS Check-In',  icon: <Send className="w-4 h-4" />,        color: '#3B82F6' };
            case 'assigned':    return { label: 'Send to POS Check-In',  icon: <Send className="w-4 h-4" />,        color: '#3B82F6' };
            case 'received':    return { label: 'Start Service',          icon: <Play className="w-4 h-4" />,        color: '#14B8A6' };
            case 'in-progress': return { label: 'Mark Complete',          icon: <BadgeCheck className="w-4 h-4" />,  color: '#F97316' };
            case 'completed':   return { label: 'Send to POS Payment',   icon: <ShoppingCart className="w-4 h-4" />,color: '#22C55E' };
            default:            return { label: 'Update Status',          icon: <Zap className="w-4 h-4" />,         color: '#F97316' };
        }
    };

    /* ══════════ RENDER: Time Grid (week / day) ══════════ */
    const renderTimeGrid = (days: Date[]) => (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="grid shrink-0 border-b sticky top-0 z-10"
                style={{
                    gridTemplateColumns: `48px repeat(${days.length}, 1fr)`,
                    background: dark ? 'rgba(16,16,28,0.98)' : '#fff',
                    borderColor: dark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
                }}>
                <div className="w-[48px]" />
                {days.map(d => {
                    const isTo = isSameDay(d, today);
                    return (
                        <div key={dateKey(d)} className="flex flex-col items-center py-2 gap-0.5 cursor-pointer"
                            onClick={() => { setView('day'); setDir(0); setAnchor(d); }}
                            style={isTo && dark ? { background: 'rgba(249,115,22,0.08)' } : undefined}>
                            <span className={`text-[9px] font-bold tracking-widest ${isTo ? 'text-orange-400' : (dark ? 'text-zinc-500' : 'text-gray-400')}`}>
                                {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d).toUpperCase()}
                            </span>
                            <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold transition-colors ${isTo ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/40' : (dark ? 'text-zinc-200 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-100')}`}>
                                {d.getDate()}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto relative" style={{ scrollbarWidth: 'thin' }}>
                {hours.map(h => (
                    <div key={h} className="grid"
                        style={{
                            gridTemplateColumns: `48px repeat(${days.length}, 1fr)`,
                            height: CELL_H,
                            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'}`,
                        }}>
                        <div className="flex items-start justify-end pr-2 pt-1">
                            <span className={`text-[9px] font-semibold ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>{formatHour(h)}</span>
                        </div>
                        {days.map(d => {
                            const isTo = isSameDay(d, today);
                            return (
                                <div key={dateKey(d) + h} className="relative group"
                                    style={{
                                        borderLeft: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'}`,
                                        background: isTo && dark ? 'rgba(249,115,22,0.03)' : 'transparent',
                                    }}>
                                    {isTo && h > new Date().getHours() && !bookingsByDay.has(dateKey(d)) && (
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
                                            onClick={onNewBooking}>
                                            <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full ${dark ? 'text-emerald-400/70 bg-emerald-400/10 border border-emerald-400/20' : 'text-emerald-600/60 bg-emerald-50'}`}>
                                                + Add
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}

                {/* Current time line */}
                {(view === 'week' ? days.some(d => isSameDay(d, today)) : isSameDay(days[0], today)) && (() => {
                    const now       = new Date();
                    const totalMins = (now.getHours() - HOUR_START) * 60 + now.getMinutes();
                    const topPx     = (totalMins / 60) * CELL_H;
                    const colIdx    = view === 'week' ? today.getDay() : 0;
                    const pct       = view === 'week' ? (colIdx / 7) * 100 : 0;
                    const wPct      = view === 'week' ? (1 / 7) * 100 : 100;
                    return (
                        <div className="absolute z-20 flex items-center pointer-events-none"
                            style={{ top: topPx + 44 - 1, left: `calc(48px + ${pct}%)`, width: `${wPct}%` }}>
                            <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50 -ml-1 flex-shrink-0" style={{ border: '2px solid rgba(13,13,22,0.8)' }} />
                            <div className="flex-1 h-[2px] bg-gradient-to-r from-orange-500 to-orange-500/30" />
                        </div>
                    );
                })()}

                {/* Booking event cards */}
                {days.map((d, di) => {
                    const dk = dateKey(d); const dayBks = bookingsByDay.get(dk) ?? [];
                    const leftPct  = (di / days.length) * 100;
                    const widthPct = (1 / days.length) * 100;
                    const byHour = new Map<number, Booking[]>();
                    dayBks.forEach(b => {
                        const t = parseBookingTime(b.bookingTime);
                        if (!t || t.h < HOUR_START || t.h >= HOUR_END) return;
                        if (!byHour.has(t.h)) byHour.set(t.h, []);
                        byHour.get(t.h)!.push(b);
                    });
                    const items: JSX.Element[] = [];
                    byHour.forEach((bks, h) => {
                        bks.forEach((b, idx) => {
                            const t    = parseBookingTime(b.bookingTime)!;
                            const topPx = (h - HOUR_START) * CELL_H + (t.m / 60) * CELL_H + 44;
                            const slotW = bks.length > 1 ? `${widthPct / bks.length}%` : `calc(${widthPct}% - 8px)`;
                            const slotL = `calc(48px + ${leftPct + (idx * (widthPct / bks.length))}% + 4px)`;
                            const col   = chipColor(b);
                            const conf  = conflicts.has(b.id || b._id || '');
                            const sel   = selectedBookingId === (b.id || b._id);
                            const name  = b.customerName || (b.customer as any)?.name || 'Customer';
                            const svc   = b.serviceName || b.serviceType || 'Service';
                            const staffName = getStaffName(b, users);
                            const sMeta = STATUS_META[b.status] || STATUS_META['pending'];
                            items.push(
                                <motion.div key={b.id || b._id}
                                    initial={{ opacity: 0, scale: 0.9, y: 4 }}
                                    animate={{ opacity: 1, scale: sel ? 1.05 : 1, y: sel ? -3 : 0 }}
                                    whileHover={{ zIndex: 30 }}
                                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                                    className="absolute"
                                    style={{
                                        top: topPx, left: slotL, width: slotW,
                                        height: Math.max(CELL_H - 4, 50),
                                        zIndex: sel ? 25 : 10,
                                        boxShadow: sel ? `0 0 0 2px #F97316` : 'none',
                                        borderRadius: 6
                                    }}>
                                    <BookingChip
                                        booking={{
                                            ...b,
                                            customerName: name,
                                            service: svc,
                                            technician: staffName,
                                            time: b.bookingTime || b.time || '',
                                        }}
                                        onClick={() => onSelectBooking(b.id || b._id || '')}
                                    />
                                </motion.div>
                            );
                        });
                    });
                    return items;
                })}
            </div>
        </div>
    );

    /* ══════════ RENDER: Month Grid (Luxurious) ══════════ */
    const renderMonth = () => (
        <div className="flex flex-col flex-1 overflow-y-auto bg-[#0A0A0F]" style={{ scrollbarWidth: 'thin' }}>
            {/* Day name headers */}
            <div className="grid grid-cols-7 border-b border-white/[0.04] bg-[#0F0F16] backdrop-blur-md sticky top-0 z-20">
                {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(2024,0,7)), i)).map((d, i) => (
                    <div key={i} className={`py-3 text-center text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500`}>
                        {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d).toUpperCase()}
                    </div>
                ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 flex-1" style={{
                gap: '1px',
                background: dark ? 'rgba(255,255,255,0.02)' : '#E5E7EB',
            }}>
                {monthCells.map((d, i) => {
                    if (!d) return <div key={`e${i}`} className="bg-[#0A0A0F]/80 min-h-[140px]" />;
                    const isTo = isSameDay(d, today);
                    const dk = dateKey(d);
                    const dayBks = bookingsByDay.get(dk) ?? [];
                    const hasBookings = dayBks.length > 0;
                    const isPast = d < today && !isTo;

                    return (
                        <motion.div key={dk} whileHover={{ scale: 1.015, zIndex: 10 }}
                            className="flex flex-col overflow-hidden cursor-pointer transition-all relative border border-transparent hover:border-white/[0.08] hover:shadow-2xl"
                            style={{
                                background: dark
                                    ? (isTo
                                        ? 'linear-gradient(180deg, rgba(249,115,22,0.1) 0%, rgba(15,15,22,0.6) 100%)'
                                        : hasBookings
                                            ? 'rgba(23,23,35,0.85)'
                                            : 'rgba(13,13,18,0.7)')
                                    : (isTo ? '#FFF7ED' : '#fff'),
                                minHeight: 180, /* Made the minimum height significantly larger */
                                padding: '8px',
                                ...(isTo && dark ? {
                                    boxShadow: 'inset 0 0 40px rgba(249,115,22,0.05), inset 0 2px 0 rgba(249,115,22,0.5), 0 4px 20px rgba(249,115,22,0.05)',
                                } : {}),
                                ...(isPast && dark ? { opacity: 0.5 } : {}),
                            }}
                            onClick={() => { setView('day'); setDir(0); setAnchor(d); }}>

                            {/* Date number + booking count */}
                            <div className="flex items-start justify-between mb-2">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-xl text-[14px] font-black transition-all ${
                                    isTo
                                        ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/40 ring-2 ring-orange-500/20 ring-offset-2 ring-offset-[#111]'
                                        : (dark ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-gray-700')
                                }`}>
                                    {d.getDate()}
                                </div>
                                {hasBookings && (
                                    <div className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                        isTo 
                                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                                            : dark ? 'bg-white/[0.04] text-zinc-400 border-white/[0.05]' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {dayBks.length} <span className="opacity-50 text-[8px]">JOBS</span>
                                    </div>
                                )}
                            </div>

                            {/* Premium Booking Cards */}
                            <div className="flex flex-col gap-1.5 flex-1">
                                {dayBks.slice(0, 3).map(b => {
                                    const sMeta = STATUS_META[b.status] || STATUS_META['pending'];
                                    const col = chipColor(b);
                                    const conf = conflicts.has(b.id || b._id || '');
                                    const sel = selectedBookingId === (b.id || b._id);
                                    const time = b.bookingTime || b.time || '';
                                    return (
                                        <motion.div key={b.id || b._id}
                                            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                                            className="w-full h-[72px] relative group"
                                            style={{
                                                boxShadow: sel ? `0 0 0 2px #F97316` : 'none',
                                                borderRadius: 6
                                            }}>
                                            <BookingChip
                                                booking={{
                                                    ...b,
                                                    customerName: b.customerName || 'Customer',
                                                    service: b.serviceName || b.serviceType || 'Service',
                                                    technician: getStaffName(b, users),
                                                    time: time,
                                                }}
                                                onClick={() => onSelectBooking(b.id || b._id || '')}
                                            />
                                        </motion.div>
                                    );
                                })}
                                {dayBks.length > 3 && (
                                    <div className={`mt-1 text-[10px] font-black px-2 py-1 rounded w-fit ${dark ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'text-orange-500'}`}>
                                        +{dayBks.length - 3} MORE APPOINTMENTS
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );

    /* ══════════════ MAIN RENDER ══════════════ */
    return (
        <div className="flex flex-col h-full gap-0 min-h-0">

            {/* ═══ KPI SUMMARY ROW ═══ */}
            <div className="grid grid-cols-4 gap-3 mb-4 shrink-0">
                {[
                    { label: "Today's Bookings", value: kpis.todayTotal, color: '#F97316', icon: CalendarDays, filter: 'all' },
                    { label: 'Waiting',          value: kpis.waiting,    color: '#F59E0B', icon: Clock,        filter: 'pending' },
                    { label: 'In Service',       value: kpis.inService,  color: '#3B82F6', icon: Zap,          filter: 'active' },
                    { label: 'Completed',        value: kpis.done,       color: '#22C55E', icon: CheckCircle,  filter: 'done' },
                ].map(kpi => {
                    const KIcon = kpi.icon;
                    const isActive = statusFilter === kpi.filter;
                    return (
                        <motion.button key={kpi.label} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                            onClick={() => setStatus(isActive ? 'all' : kpi.filter)}
                            className={`relative rounded-2xl border overflow-hidden p-4 text-left transition-all group ${
                                dark
                                    ? `border-white/[0.06] ${isActive ? 'bg-white/[0.06] border-orange-500/30' : 'bg-white/[0.02] hover:bg-white/[0.04]'}`
                                    : `shadow-sm ${isActive ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100 hover:border-gray-200'}`
                            }`}
                            style={isActive ? { boxShadow: `0 0 20px ${kpi.color}15` } : undefined}
                        >
                            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: kpi.color }} />
                            <div className="flex items-center justify-between">
                                <div className="pl-2">
                                    <div className="text-[28px] font-black leading-none tracking-tight" style={{ color: kpi.color }}>
                                        {kpi.value}
                                    </div>
                                    <div className={`text-[10px] font-bold uppercase tracking-widest mt-1.5 ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>
                                        {kpi.label}
                                    </div>
                                </div>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                                    dark ? 'bg-white/[0.04] group-hover:bg-white/[0.08]' : 'bg-gray-50 group-hover:bg-gray-100'
                                }`}>
                                    <KIcon className="w-5 h-5" style={{ color: `${kpi.color}99` }} />
                                </div>
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            {/* ═══ TOOLBAR ═══ */}
            <div className="flex items-center gap-2 pb-3 flex-wrap shrink-0">
                <div className={`flex items-center gap-0.5 rounded-xl p-0.5 ${dark ? 'bg-white/[0.04]' : 'bg-gray-100'}`}>
                    <button onClick={() => navigate(-1)} className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/10 text-zinc-300' : 'hover:bg-white text-gray-600'}`}>
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className={`text-[12px] font-bold min-w-[130px] text-center ${dark ? 'text-white' : 'text-gray-800'}`}>{navLabel}</span>
                    <button onClick={() => navigate(1)} className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/10 text-zinc-300' : 'hover:bg-white text-gray-600'}`}>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                <button onClick={goToday} className="text-[11px] font-bold px-3.5 py-1.5 rounded-xl transition-all bg-orange-500/15 text-orange-500 hover:bg-orange-500/25 border border-orange-500/25">
                    Today
                </button>

                <div className={`w-px h-6 ${dark ? 'bg-white/[0.08]' : 'bg-gray-200'}`} />

                <div className={`flex rounded-xl overflow-hidden border ${dark ? 'border-white/[0.08]' : 'border-gray-200'}`}>
                    {(['month','week','day'] as CalView[]).map(v => (
                        <button key={v} onClick={() => { setDir(0); setView(v); }}
                            className={`px-3 py-1.5 text-[11px] font-bold capitalize transition-all ${view === v ? 'bg-orange-500 text-white' : (dark ? 'text-zinc-400 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}`}>
                            {v}
                        </button>
                    ))}
                </div>

                <div className={`w-px h-6 ${dark ? 'bg-white/[0.08]' : 'bg-gray-200'}`} />

                {detailers.length > 0 && (
                    <div className="flex items-center gap-1">
                        {detailers.slice(0, 4).map(u => {
                            const uid = u.id || u._id || '';
                            const col = staffColorMap.get(uid) ?? STAFF_COLORS[0];
                            const active = staffFilter === uid;
                            return (
                                <button key={uid} onClick={() => setStaff(active ? 'all' : uid)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all"
                                    style={{ background: active ? col.bg : `${col.bg}20`, color: active ? '#fff' : col.bg, outline: active ? `1.5px solid ${col.bg}` : 'none' }}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#fff' : col.bg }} />
                                    {(u.name || u.displayName || 'Staff').split(' ')[0]}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex-1" />

                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={onNewBooking}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white text-[11px] font-bold shadow-lg shadow-orange-500/25 transition-all">
                    <Plus className="w-3.5 h-3.5" /> New Booking
                </motion.button>
            </div>

            {/* ═══ SMART ALERTS ═══ */}
            {conflictAlerts.length > 0 && (
                <div className={`flex items-center gap-3 px-3 py-1.5 mb-3 rounded-xl border shrink-0 overflow-hidden ${dark ? 'bg-red-900/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                    <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-red-400' : 'text-red-600'}`} />
                    <div className="flex-1 overflow-hidden">
                        <motion.div className="flex gap-8 whitespace-nowrap"
                            animate={{ x: ['0%', '-50%'] }}
                            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}>
                            {[...conflictAlerts, ...conflictAlerts].map((msg, i) => (
                                <span key={i} className={`text-[10px] font-semibold inline-flex items-center gap-1.5 ${dark ? 'text-red-300' : 'text-red-700'}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse shrink-0" />
                                    {msg}
                                </span>
                            ))}
                        </motion.div>
                    </div>
                </div>
            )}

            {/* ═══ MAIN AREA ═══ */}
            <div className="flex gap-3 flex-1 min-h-0">
                {/* Calendar */}
                <div className={`flex-1 min-w-0 rounded-2xl border overflow-hidden flex flex-col ${dark ? 'border-white/[0.08]' : 'border-gray-200 bg-white shadow-sm'}`}
                    style={{
                        minHeight: 0,
                        ...(dark ? {
                            background: 'linear-gradient(180deg, rgba(16,16,28,0.95) 0%, rgba(12,12,22,0.98) 100%)',
                            boxShadow: '0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                        } : {}),
                    }}>
                    <AnimatePresence mode="wait" custom={direction}>
                        <motion.div key={`${view}-${dateKey(anchor)}`} custom={direction} variants={slideVariants}
                            initial="enter" animate="center" exit="exit" className="flex flex-col flex-1 min-h-0">
                            {view === 'month' && renderMonth()}
                            {view === 'week'  && renderTimeGrid(weekDays)}
                            {view === 'day'   && renderTimeGrid([anchor])}
                        </motion.div>
                    </AnimatePresence>

                    {/* Legend */}
                    <div className={`flex items-center gap-5 px-4 py-2 border-t shrink-0 ${dark ? 'border-white/[0.06]' : 'border-gray-100 bg-gray-50'}`}
                        style={dark ? { background: 'rgba(14,14,24,0.95)' } : undefined}>
                        {[
                            { color: '#F59E0B', label: 'Pending' },
                            { color: '#3B82F6', label: 'Confirmed' },
                            { color: '#F97316', label: 'In Progress' },
                            { color: '#22C55E', label: 'Done' },
                            { color: '#EF4444', label: 'Conflict' },
                        ].map(({ color, label }) => (
                            <div key={label} className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}50` }} />
                                <span className={`text-[9px] font-bold ${dark ? 'text-zinc-400' : 'text-gray-500'}`}>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ═══ RIGHT: Workflow Action Panel ═══ */}
                <div className={`w-[260px] shrink-0 flex flex-col rounded-2xl border overflow-hidden ${dark ? 'border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
                    style={dark ? {
                        background: 'linear-gradient(180deg, rgba(16,16,28,0.95) 0%, rgba(14,14,24,0.98) 100%)',
                        boxShadow: '0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                    } : undefined}>

                    {/* Panel Header */}
                    <div className={`px-4 py-3 border-b shrink-0 ${dark ? 'border-white/[0.06]' : 'border-gray-100'}`}
                        style={dark ? { background: 'rgba(20,20,35,0.8)' } : undefined}>
                        <div className="flex items-center justify-between">
                            <span className={`text-[11px] font-black uppercase tracking-widest ${dark ? 'text-zinc-400' : 'text-gray-600'}`}>
                                Workflow Panel
                            </span>
                            {selectedPanelBooking && (
                                <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold" style={{
                                    background: (STATUS_META[selectedPanelBooking.status] || STATUS_META['pending']).bg,
                                    color: (STATUS_META[selectedPanelBooking.status] || STATUS_META['pending']).color,
                                }}>
                                    {(STATUS_META[selectedPanelBooking.status] || STATUS_META['pending']).label}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: 'thin' }}>
                        {selectedPanelBooking ? (() => {
                            const b = selectedPanelBooking;
                            const staffName = getStaffName(b, users);
                            const col = chipColor(b);
                            const action = getNextAction(b.status);
                            const svc = (services || []).find(s => (s.id || s._id) === b.serviceId || s.name === b.serviceName);

                            return (
                                <>
                                    {/* Selected Booking Summary */}
                                    <div className={`rounded-xl border overflow-hidden ${dark ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-gray-50 border-gray-100'}`}>
                                        <div className={`flex items-center gap-3 p-3 border-b ${dark ? 'border-white/[0.04]' : 'border-gray-100'}`}>
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                                                <Car className="w-5 h-5 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-[13px] font-bold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                                                    {b.customerName || 'Customer'}
                                                </div>
                                                <div className={`text-[10px] truncate ${dark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                                    {[b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(' ') || b.vehicleInfo || 'No vehicle info'}
                                                </div>
                                            </div>
                                            <button onClick={() => onSelectBooking('')} className={`p-1 rounded-lg transition-colors ${dark ? 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        <div className="divide-y" style={{ borderColor: dark ? 'rgba(255,255,255,0.04)' : '#f3f4f6' }}>
                                            {[
                                                { label: 'Service', value: b.serviceName || b.serviceType || '—' },
                                                { label: 'Date & Time', value: (() => {
                                                    const d = b.bookingDate || b.date;
                                                    const t = b.bookingTime || b.time;
                                                    if (!d) return '—';
                                                    return `${new Date(d).toLocaleDateString(locale, { month:'short', day:'numeric' })}${t ? ' · ' + t : ''}`;
                                                })() },
                                                { label: 'Duration', value: svc?.duration || '—' },
                                            ].map(row => (
                                                <div key={row.label} className="flex justify-between items-center px-3 py-2.5">
                                                    <span className={`text-[10px] font-semibold ${dark ? 'text-zinc-500' : 'text-gray-500'}`}>{row.label}</span>
                                                    <span className={`text-[11px] font-bold max-w-[150px] text-right truncate ${dark ? 'text-zinc-300' : 'text-gray-700'}`}>{row.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Assigned Technician */}
                                    <div className={`rounded-xl border p-3 ${dark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-gray-50 border-gray-100'}`}>
                                        <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>Assigned Technician</div>
                                        {staffName ? (
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs text-white" style={{ background: col.bg }}>
                                                    {staffName.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className={`text-[12px] font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>{staffName}</div>
                                                    <div className="flex items-center gap-1">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                        <span className={`text-[9px] ${dark ? 'text-zinc-500' : 'text-gray-500'}`}>Active</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={`text-[11px] italic ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>No technician assigned yet</div>
                                        )}
                                    </div>

                                    {/* Next Action */}
                                    <div className="space-y-2">
                                        <div className={`text-[9px] font-black uppercase tracking-widest ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>Next Action</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => onReschedule(b)}
                                                className={`text-[10px] font-bold py-2.5 rounded-xl transition-colors ${dark ? 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.06]' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'}`}>
                                                Reschedule
                                            </button>
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                                onClick={() => onUpdateStatus(b)}
                                                className="text-[10px] font-bold py-2.5 rounded-xl text-white flex items-center justify-center gap-1.5 transition-all"
                                                style={{
                                                    background: `linear-gradient(135deg, ${action.color}, ${action.color}CC)`,
                                                    boxShadow: `0 4px 16px ${action.color}30`,
                                                }}>
                                                {action.icon}
                                                {action.label}
                                            </motion.button>
                                        </div>
                                    </div>
                                </>
                            );
                        })() : (
                            <div className={`rounded-xl border p-6 text-center ${dark ? 'bg-white/[0.02] border-white/[0.05] border-dashed' : 'bg-gray-50 border-gray-200 border-dashed'}`}>
                                <Calendar className={`w-10 h-10 mx-auto mb-3 ${dark ? 'text-zinc-700' : 'text-gray-300'}`} />
                                <div className={`text-[13px] font-bold mb-1 ${dark ? 'text-zinc-400' : 'text-gray-500'}`}>No Booking Selected</div>
                                <div className={`text-[11px] ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>Click any booking card in the calendar to see details and take action</div>
                            </div>
                        )}

                        {/* Today's Queue */}
                        <div>
                            <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>Today's Queue</div>
                            {upcomingToday.length === 0 ? (
                                <p className={`text-[11px] italic ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>No more bookings today.</p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {upcomingToday.map(b => {
                                        const col = chipColor(b);
                                        const sel = selectedBookingId === (b.id || b._id);
                                        const sMeta = STATUS_META[b.status] || STATUS_META['pending'];
                                        return (
                                            <button key={b.id || b._id} onClick={() => onSelectBooking(b.id || b._id || '')}
                                                className={`flex items-center gap-2 p-2 rounded-xl text-left w-full transition-all ${
                                                    sel
                                                        ? (dark ? 'bg-orange-500/10 border border-orange-500/25' : 'bg-orange-50 border border-orange-200')
                                                        : (dark ? 'hover:bg-white/[0.03] border border-transparent' : 'hover:bg-gray-50 border border-transparent')
                                                }`}>
                                                <div className="w-1.5 h-8 rounded-full shrink-0" style={{ background: col.bg }} />
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-[11px] font-bold truncate ${dark ? 'text-white' : 'text-gray-800'}`}>{b.customerName || 'Customer'}</div>
                                                    <div className={`text-[9px] truncate ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>
                                                        {b.serviceName || b.serviceType || 'Service'} · {b.bookingTime || '--:--'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full" style={{ background: sMeta.color }} />
                                                    <span className={`text-[8px] font-bold ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>{sMeta.label}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Staff Workload */}
                        {staffAvailability.length > 0 && (
                            <div>
                                <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>Staff Workload</div>
                                <div className="flex flex-col gap-1.5">
                                    {staffAvailability.map(({ user: u, jobs, color: col }) => {
                                        const maxJobs = 5;
                                        const pct = Math.min(100, (jobs.length / maxJobs) * 100);
                                        const loadColor = jobs.length === 0 ? '#22C55E' : jobs.length <= 2 ? '#F59E0B' : '#EF4444';
                                        return (
                                            <div key={u.id || u._id} className={`rounded-xl p-2.5 border ${dark ? 'bg-white/[0.02] border-white/[0.04]' : 'bg-gray-50 border-gray-100'}`}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] text-white" style={{ background: col.bg }}>
                                                            {(u.name || u.displayName || 'S').charAt(0)}
                                                        </div>
                                                        <span className={`text-[11px] font-bold ${dark ? 'text-zinc-200' : 'text-gray-800'}`}>
                                                            {(u.name || u.displayName || 'Staff').split(' ')[0]}
                                                        </span>
                                                    </div>
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${loadColor}18`, color: loadColor }}>
                                                        {jobs.length === 0 ? 'Free' : `${jobs.length} job${jobs.length > 1 ? 's' : ''}`}
                                                    </span>
                                                </div>
                                                <div className={`w-full h-1.5 rounded-full overflow-hidden ${dark ? 'bg-white/[0.06]' : 'bg-gray-200'}`}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                                                        className="h-full rounded-full" style={{ background: loadColor }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmartCalendar;
