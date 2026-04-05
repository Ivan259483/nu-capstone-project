import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, Clock, AlertTriangle, Users,
    Plus, Zap, Calendar, Bot, CalendarDays, Info, X
} from 'lucide-react';
import type { Booking, User, BusinessSettings, Service } from '@/types';
import { SERVICE_STAFF_ROLE } from '@/lib/roles';

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
type PanelTab = 'details' | 'staff' | 'ai';

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
const CELL_H     = 64;

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
    const [panelTab, setPanelTab]     = useState<PanelTab>('details');
    const [aiAssist, setAiAssist]     = useState(false);
    const scrollRef                   = useRef<HTMLDivElement>(null);
    const tickerRef                   = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current && (view === 'week' || view === 'day'))
            scrollRef.current.scrollTop = (8 - HOUR_START) * CELL_H;
    }, [view]);

    const staffColorMap  = useMemo(() => buildStaffColorMap(users), [users]);
    const safeBookings   = useMemo(() => Array.isArray(bookings) ? bookings : [], [bookings]);
    const conflicts      = useMemo(() => detectConflicts(safeBookings), [safeBookings]);
    const detailers      = useMemo(() => users.filter(u => u.role === SERVICE_STAFF_ROLE), [users]);
    const chipColor      = useCallback((b: Booking) => staffColorMap.get(getStaffId(b)) ?? STAFF_COLORS[7], [staffColorMap]);

    const filteredBookings = useMemo(() => safeBookings.filter(b => {
        const active = ['in-progress','assigned','processing','confirmed','queued','in_progress'];
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

    const stats = useMemo(() => ({
        total:   safeBookings.length,
        waiting: safeBookings.filter(b => b.status === 'pending').length,
        active:  safeBookings.filter(b => ['in-progress','assigned','processing','confirmed','queued'].includes(b.status)).length,
        done:    safeBookings.filter(b => b.status === 'completed').length,
    }), [safeBookings]);

    const upcomingToday = useMemo(() => {
        const today = new Date();
        return safeBookings
            .filter(b => { const d = getBookingDate(b); return d && isSameDay(d, today) && b.status !== 'completed'; })
            .sort((a, b) => {
                const ta = parseBookingTime(a.bookingTime) ?? { h:23, m:59 };
                const tb = parseBookingTime(b.bookingTime) ?? { h:23, m:59 };
                return (ta.h*60+ta.m) - (tb.h*60+tb.m);
            }).slice(0, 6);
    }, [safeBookings]);

    const staffAvailability = useMemo(() => {
        const today = dateKey(new Date());
        const todayBks = safeBookings.filter(b => {
            const d = getBookingDate(b);
            return d && dateKey(d) === today && !['completed','cancelled'].includes(b.status);
        });
        return users.filter(u => u.role === SERVICE_STAFF_ROLE).map(u => {
            const uid = u.id || u._id || '';
            const jobs = todayBks.filter(b => getStaffId(b) === uid);
            return { user: u, jobs, color: staffColorMap.get(uid) ?? STAFF_COLORS[0] };
        });
    }, [users, safeBookings, staffColorMap]);

    const conflictAlerts = useMemo(() => {
        const msgs: string[] = [];
        safeBookings.filter(b => conflicts.has(b.id || b._id || '')).forEach(b => {
            const d = getBookingDate(b);
            if (d) {
                const day = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
                msgs.push(`Schedule conflict on ${day} · ${b.customerName || 'Unknown'} — ${b.bookingTime || 'unscheduled'}`);
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

    /* ── Time Grid (week / day) ── */
    const renderTimeGrid = (days: Date[]) => (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Column headers */}
            <div className="grid shrink-0 border-b sticky top-0 z-10"
                style={{
                    gridTemplateColumns: `52px repeat(${days.length}, 1fr)`,
                    background: dark ? 'rgba(13,13,22,0.95)' : '#fff',
                    borderColor: dark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
                    backdropFilter: dark ? 'blur(12px)' : undefined,
                }}>
                <div className="w-[52px]" />
                {days.map(d => {
                    const isTo = isSameDay(d, today);
                    return (
                        <div key={dateKey(d)} className="flex flex-col items-center py-2.5 gap-0.5 cursor-pointer"
                            onClick={() => { setView('day'); setDir(0); setAnchor(d); }}
                            style={isTo && dark ? { background: 'rgba(249,115,22,0.06)', borderRadius: '8px 8px 0 0' } : undefined}>
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

            {/* Time grid body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto relative" style={{ scrollbarWidth: 'thin' }}>
                {hours.map(h => (
                    <div key={h} className="grid"
                        style={{
                            gridTemplateColumns: `52px repeat(${days.length}, 1fr)`,
                            height: CELL_H,
                            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'}`,
                        }}>
                        <div className="flex items-start justify-end pr-2 pt-1">
                            <span className={`text-[9px] font-semibold ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>{formatHour(h)}</span>
                        </div>
                        {days.map((d, di) => {
                            const isTo = isSameDay(d, today);
                            const dk = dateKey(d);
                            const hasBks = bookingsByDay.has(dk);
                            const nowH = new Date().getHours();
                            const isFutureSlot = isTo && h > nowH && !hasBks;
                            const isOddCol = di % 2 === 1;
                            // Build cell background
                            let cellBg = 'transparent';
                            if (dark) {
                                if (isTo) {
                                    cellBg = 'rgba(249,115,22,0.035)';
                                } else if (isOddCol) {
                                    cellBg = 'rgba(255,255,255,0.015)';
                                } else {
                                    cellBg = 'rgba(255,255,255,0.005)';
                                }
                            }
                            return (
                                <div key={dateKey(d) + h} className="relative group"
                                    style={{
                                        borderLeft: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'}`,
                                        background: cellBg,
                                        ...(isTo && dark ? { boxShadow: 'inset 0 0 20px rgba(249,115,22,0.02)' } : {}),
                                    }}>
                                    {isFutureSlot && (
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
                                            onClick={onNewBooking}>
                                            <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm ${dark ? 'text-emerald-400/70 bg-emerald-400/10 border border-emerald-400/20' : 'text-emerald-600/60 bg-emerald-50'}`}>
                                                + Add booking
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
                    const now        = new Date();
                    const totalMins  = (now.getHours() - HOUR_START) * 60 + now.getMinutes();
                    const topPx      = (totalMins / 60) * CELL_H;
                    const colIdx     = view === 'week' ? today.getDay() : 0;
                    const pct        = view === 'week' ? (colIdx / 7) * 100 : 0;
                    const wPct       = view === 'week' ? (1 / 7) * 100 : 100;
                    return (
                        <div className="absolute z-20 flex items-center pointer-events-none"
                            style={{ top: topPx + 52 - 1, left: `calc(52px + ${pct}%)`, width: `${wPct}%` }}>
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
                            const topPx = (h - HOUR_START) * CELL_H + (t.m / 60) * CELL_H + 52;
                            const slotW = bks.length > 1 ? `${widthPct / bks.length}%` : `calc(${widthPct}% - 6px)`;
                            const slotL = `calc(52px + ${leftPct + (idx * (widthPct / bks.length))}% + 3px)`;
                            const col   = chipColor(b);
                            const conf  = conflicts.has(b.id || b._id || '');
                            const sel   = selectedBookingId === (b.id || b._id);
                            const name  = b.customerName || (b.customer as any)?.name || 'Customer';
                            const svc   = b.serviceName || b.serviceType || 'Service';
                            const staffName = (() => {
                                const ad = b.assignedDetailer;
                                if (!ad) return null;
                                if (typeof ad === 'object') return (ad as User).name || (ad as User).displayName;
                                const u = users.find(u => (u.id || u._id) === ad);
                                return u?.name || u?.displayName || null;
                            })();
                            items.push(
                                <motion.button key={b.id || b._id}
                                    initial={{ opacity: 0, scale: 0.9, y: 4 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    whileHover={{ scale: 1.04, y: -2, zIndex: 30 }}
                                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                                    onClick={() => onSelectBooking(b.id || b._id || '')}
                                    className="absolute text-left rounded-xl overflow-hidden"
                                    style={{
                                        top: topPx, left: slotL, width: slotW,
                                        height: Math.max(CELL_H - 6, 48),
                                        background: conf
                                            ? (dark ? 'linear-gradient(145deg, rgba(127,29,29,0.6), rgba(153,27,27,0.8))' : 'linear-gradient(145deg,#fee2e2,#fca5a5)')
                                            : (dark ? `linear-gradient(145deg, ${col.bg}20, ${col.bg}45)` : `linear-gradient(145deg,${col.bg}18,${col.bg}38)`),
                                        borderLeft: `3px solid ${conf ? '#EF4444' : col.bg}`,
                                        outline: sel ? `2px solid ${col.bg}` : 'none',
                                        outlineOffset: '1px',
                                        zIndex: sel ? 20 : 10,
                                        backdropFilter: dark ? 'blur(8px)' : undefined,
                                        boxShadow: dark
                                            ? (sel
                                                ? `0 4px 20px ${col.bg}40, 0 0 0 1px ${col.bg}30`
                                                : `0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px ${col.bg}18`)
                                            : `0 2px 8px rgba(0,0,0,0.08)`,
                                    }}>
                                    <div className="px-2 py-1.5 h-full flex flex-col justify-start gap-0.5">
                                        <div className="flex items-center gap-0.5">
                                            <span className="text-[10px] font-black truncate leading-tight" style={{ color: dark ? '#fff' : (conf ? '#991b1b' : col.dark) }}>
                                                {name} · {svc}
                                            </span>
                                        </div>
                                        {staffName && (
                                            <span className="text-[9px] truncate" style={{ color: dark ? col.fg : col.dark, opacity: 0.85 }}>
                                                {staffName} Detailer
                                            </span>
                                        )}
                                        {conf && (
                                            <span className="inline-flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-md bg-red-500/25 text-red-300 w-fit mt-0.5 backdrop-blur-sm">
                                                <AlertTriangle className="w-2 h-2" /> Conflict
                                            </span>
                                        )}
                                    </div>
                                </motion.button>
                            );
                        });
                    });
                    return items;
                })}
            </div>
        </div>
    );

    /* ── Month Grid ── */
    const renderMonth = () => (
        <div className="flex flex-col flex-1">
            <div className="grid grid-cols-7 border-b text-[9px] font-black uppercase tracking-widest"
                style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }}>
                {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(2024,0,7)), i)).map((d, i) => (
                    <div key={i} className={`py-2.5 pl-2 ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>
                        {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d).toUpperCase()}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 flex-1 gap-px" style={{ background: dark ? 'rgba(255,255,255,0.04)' : '#E5E7EB' }}>
                {monthCells.map((d, i) => {
                    if (!d) return <div key={`e${i}`} style={{ background: dark ? 'rgba(10,10,18,0.6)' : '#F9FAFB' }} />;
                    const isTo = isSameDay(d, today);
                    const dk = dateKey(d); const dayBks = bookingsByDay.get(dk) ?? [];
                    const isOddCol = i % 7 % 2 === 1;
                    return (
                        <motion.div key={dk} whileHover={{ scale: 1.01 }}
                            className="p-1.5 flex flex-col gap-1 overflow-hidden cursor-pointer transition-colors"
                            style={{
                                background: dark
                                    ? (isTo ? 'rgba(249,115,22,0.04)' : (isOddCol ? 'rgba(255,255,255,0.015)' : 'rgba(12,12,20,0.8)'))
                                    : '#fff',
                                minHeight: 90,
                                ...(isTo && dark ? { boxShadow: 'inset 0 0 24px rgba(249,115,22,0.03)' } : {}),
                            }}
                            onClick={() => { setView('day'); setDir(0); setAnchor(d); }}>
                            <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0 ${isTo ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : (dark ? 'text-zinc-400' : 'text-gray-600')}`}>
                                {d.getDate()}
                            </div>
                            {dayBks.slice(0, 3).map(b => {
                                const col = chipColor(b); const conf = conflicts.has(b.id || b._id || '');
                                return (
                                    <motion.button key={b.id || b._id} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }}
                                        whileHover={{ scale: 1.03 }}
                                        onClick={e => { e.stopPropagation(); onSelectBooking(b.id || b._id || ''); }}
                                        className="w-full text-left rounded-lg overflow-hidden px-1.5 py-0.5 text-[9px] font-bold truncate"
                                        style={{
                                            background: conf ? 'rgba(239,68,68,0.2)' : `${col.bg}25`,
                                            color: conf ? '#FCA5A5' : (dark ? col.fg : col.dark),
                                            borderLeft: `2px solid ${conf ? '#EF4444' : col.bg}`,
                                            backdropFilter: dark ? 'blur(4px)' : undefined,
                                        }}>
                                        {b.customerName || 'Customer'}{conf ? ' ⚠' : ''}
                                    </motion.button>
                                );
                            })}
                            {dayBks.length > 3 && <div className={`text-[9px] font-black px-1 ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>+{dayBks.length - 3} more</div>}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );

    /* ── Right Detail Panel ── */
    const selectedPanelBooking = safeBookings.find(b => (b.id || b._id) === selectedBookingId) ?? null;

    const renderDetailsTab = () => {
        const svc = selectedPanelBooking 
            ? (services || []).find(s => (s.id || s._id) === selectedPanelBooking.serviceId || s.name === selectedPanelBooking.serviceName) 
            : null;
        return (
        <div className="flex flex-col gap-3">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2">
                {[
                    { label: 'TOTAL BOOKINGS', value: stats.total, color: dark ? '#ffffff' : '#111' },
                    { label: 'WAITING',         value: stats.waiting, color: '#F59E0B' },
                    { label: 'IN PROGRESS',     value: stats.active,  color: '#FF6B00' },
                    { label: 'COMPLETED',        value: stats.done,    color: '#22C55E' },
                ].map(s => (
                    <div key={s.label} className={`rounded-xl p-3 border flex flex-col gap-0.5 ${dark ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-gray-50 border-gray-100'}`}>
                        <span className="text-[20px] font-black leading-none" style={{ color: s.color }}>{s.value}</span>
                        <span className={`text-[8px] font-black uppercase tracking-widest ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Booking Details */}
            <div>
                <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>
                    BOOKING DETAILS{!selectedPanelBooking && ' — Click any booking'}
                </div>
                <div className={`rounded-xl border overflow-hidden ${dark ? 'bg-[#12121A] border-white/[0.06]' : 'bg-white border-gray-100 shadow-sm'}`}>
                    {selectedPanelBooking ? (
                        <div>
                            {/* Customer header */}
                            <div className={`flex items-center gap-3 px-4 py-3 border-b ${dark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center font-black text-sm text-white shrink-0">
                                    {(selectedPanelBooking.customerName || 'C').charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`text-[12px] font-bold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                                        {selectedPanelBooking.customerName || 'Customer'}
                                    </div>
                                    <div className={`text-[10px] truncate ${dark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                        {selectedPanelBooking.vehicleInfo || `${selectedPanelBooking.vehicleYear || ''} ${selectedPanelBooking.vehicleMake || ''} ${selectedPanelBooking.vehicleModel || ''}`.trim() || 'No vehicle info'}
                                    </div>
                                </div>
                                <button onClick={() => onSelectBooking('')} className={`text-xs ${dark ? 'text-zinc-600 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600'}`}>—</button>
                            </div>
                            {/* Detail rows */}
                            {[
                                { label: 'Service', value: selectedPanelBooking.serviceName || selectedPanelBooking.serviceType || selectedPanelBooking.items?.[0]?.product?.name || null },
                                { label: 'Assigned Staff', value: (() => {
                                    const ad = selectedPanelBooking.assignedDetailer;
                                    if (!ad) return null;
                                    if (typeof ad === 'object') return (ad as User).name || (ad as User).displayName || null;
                                    const u = users.find(u => (u.id || u._id) === ad);
                                    return u?.name || u?.displayName || null;
                                })() },
                                { label: 'Date & Time', value: (() => {
                                    const d = selectedPanelBooking.bookingDate || selectedPanelBooking.date;
                                    const t = selectedPanelBooking.bookingTime || selectedPanelBooking.time;
                                    if (!d) return null;
                                    return `${new Date(d).toLocaleDateString(locale, { month:'short', day:'numeric', year:'numeric' })}${t ? ' · ' + t : ''}`;
                                })() },
                                { label: 'Duration', value: svc?.duration || '--' },
                            ].map(row => (
                                <div key={row.label} className={`flex justify-between items-center px-4 py-2.5 border-b ${dark ? 'border-white/[0.04]' : 'border-gray-50'}`}>
                                    <span className={`text-[10px] font-semibold ${dark ? 'text-zinc-500' : 'text-gray-500'}`}>{row.label}</span>
                                    <span className={`text-[10px] font-bold ${dark ? 'text-zinc-300' : 'text-gray-700'} max-w-[120px] text-right truncate`}>
                                        {row.value ?? '—'}
                                    </span>
                                </div>
                            ))}
                            {/* Actions */}
                            <div className="grid grid-cols-2 gap-2 p-3">
                                <button onClick={() => onReschedule(selectedPanelBooking)}
                                    className={`text-[10px] font-bold py-2 rounded-lg transition-colors ${dark ? 'bg-white/5 hover:bg-white/10 text-zinc-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                                    Reschedule
                                </button>
                                <button onClick={() => onUpdateStatus(selectedPanelBooking)}
                                    className="text-[10px] font-bold py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-md shadow-orange-500/20">
                                    Update Status
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="px-4 py-5">
                            {[
                                { label: 'Service' }, { label: 'Assigned Staff' },
                                { label: 'Date & Time' }, { label: 'Duration' },
                            ].map(row => (
                                <div key={row.label} className={`flex justify-between items-center py-2.5 border-b ${dark ? 'border-white/[0.04]' : 'border-gray-50'}`}>
                                    <span className={`text-[10px] font-semibold ${dark ? 'text-zinc-500' : 'text-gray-500'}`}>{row.label}</span>
                                    <span className={`text-[10px] ${dark ? 'text-zinc-700' : 'text-gray-300'}`}>—</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Upcoming Today */}
            <div>
                <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>UPCOMING TODAY</div>
                {upcomingToday.length === 0 ? (
                    <p className={`text-[11px] ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>No more bookings scheduled today.</p>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {upcomingToday.map(b => {
                            const col = chipColor(b);
                            return (
                                <button key={b.id || b._id} onClick={() => onSelectBooking(b.id || b._id || '')}
                                    className={`flex items-center gap-2 p-2 rounded-lg text-left w-full transition-all ${dark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} ${selectedBookingId === (b.id || b._id) ? (dark ? 'bg-white/5' : 'bg-gray-50') : ''}`}>
                                    <div className="w-1 h-8 rounded-full shrink-0" style={{ background: col.bg }} />
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-[10px] font-bold truncate ${dark ? 'text-white' : 'text-gray-800'}`}>{b.customerName || 'Customer'}</div>
                                        <div className={`text-[9px] truncate ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>{b.serviceName || b.serviceType || 'Service'} · {b.bookingTime || '--:--'}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    )};

    const renderStaffTab = () => (
        <div className="flex flex-col gap-3">
            <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>STAFF AVAILABILITY — TODAY</div>
            {staffAvailability.length === 0 ? (
                <p className={`text-[11px] ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>No service staff found.</p>
            ) : staffAvailability.map(({ user: u, jobs, color: col }) => {
                const label = jobs.length === 0 ? 'Free' : jobs.length === 1 ? '1 job' : `${jobs.length} jobs`;
                const dot   = jobs.length === 0 ? '#22C55E' : jobs.length <= 2 ? '#F59E0B' : '#EF4444';
                return (
                    <div key={u.id || u._id} className={`flex items-center justify-between rounded-xl p-3 border ${dark ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white" style={{ background: col.bg }}>
                                {(u.name || u.displayName || 'S').charAt(0)}
                            </div>
                            <div>
                                <div className={`text-[11px] font-bold ${dark ? 'text-zinc-200' : 'text-gray-800'}`}>{u.name || u.displayName}</div>
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                                    <span className={`text-[9px] ${dark ? 'text-zinc-500' : 'text-gray-500'}`}>{label}</span>
                                </div>
                            </div>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-1 rounded-full" style={{ background: `${col.bg}22`, color: col.bg }}>{label}</span>
                    </div>
                );
            })}
        </div>
    );

    const renderAITab = () => (
        <div className="flex flex-col gap-3">
            <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>AI SMART SUGGESTIONS</div>
            {conflicts.size === 0 ? (
                <div className={`rounded-xl p-4 border flex items-start gap-2.5 ${dark ? 'bg-emerald-900/20 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                    <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                        <div className={`text-[11px] font-bold ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>No conflicts detected!</div>
                        <div className={`text-[10px] mt-0.5 ${dark ? 'text-emerald-400/60' : 'text-emerald-600/70'}`}>Your schedule looks clean. All bookings are properly spaced.</div>
                    </div>
                </div>
            ) : (
                <>
                    <div className={`rounded-xl p-3 border flex items-start gap-2.5 ${dark ? 'bg-orange-900/20 border-orange-500/20' : 'bg-orange-50 border-orange-100'}`}>
                        <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                        <div>
                            <div className={`text-[11px] font-bold ${dark ? 'text-orange-300' : 'text-orange-700'}`}>{Math.ceil(conflicts.size / 2)} Schedule Conflict{conflicts.size > 2 ? 's' : ''}</div>
                            <div className={`text-[10px] mt-0.5 ${dark ? 'text-orange-400/70' : 'text-orange-600/70'}`}>Review and reschedule overlapping bookings to avoid delays.</div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        {safeBookings.filter(b => conflicts.has(b.id || b._id || '')).map(b => {
                            const col = chipColor(b);
                            return (
                                <div key={b.id || b._id} className={`rounded-xl p-3 border ${dark ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-gray-50 border-gray-100'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className={`text-[11px] font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{b.customerName}</span>
                                    </div>
                                    <div className={`text-[9px] ${dark ? 'text-zinc-500' : 'text-gray-500'}`}>{b.bookingDate} · {b.bookingTime}</div>
                                    <button onClick={() => onReschedule(b)}
                                        className="mt-2 text-[9px] font-bold px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors">
                                        Suggest Reschedule →
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );

    /* ══════════════ MAIN RENDER ══════════════ */
    return (
        <div className="flex flex-col h-full gap-0 min-h-0">
            {/* ── TOOLBAR ── */}
            <div className={`flex items-center gap-2 px-1 pb-3 flex-wrap shrink-0`}>
                {/* Nav */}
                <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${dark ? 'bg-white/[0.05]' : 'bg-gray-100'}`}>
                    <button onClick={() => navigate(-1)} className={`p-1.5 rounded-md transition-colors ${dark ? 'hover:bg-white/10 text-zinc-300' : 'hover:bg-white text-gray-600'}`}>
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className={`text-[12px] font-bold min-w-[120px] text-center ${dark ? 'text-white' : 'text-gray-800'}`}>{navLabel}</span>
                    <button onClick={() => navigate(1)} className={`p-1.5 rounded-md transition-colors ${dark ? 'hover:bg-white/10 text-zinc-300' : 'hover:bg-white text-gray-600'}`}>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                <button onClick={goToday} className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all ${dark ? 'bg-white/[0.05] text-zinc-300 hover:bg-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    Today
                </button>

                {/* View toggle */}
                <div className={`flex rounded-lg overflow-hidden border ${dark ? 'border-white/[0.08]' : 'border-gray-200'}`}>
                    {(['month','week','day'] as CalView[]).map(v => (
                        <button key={v} onClick={() => { setDir(0); setView(v); }}
                            className={`px-3 py-1.5 text-[11px] font-bold capitalize transition-all ${view === v ? 'bg-orange-500 text-white' : (dark ? 'text-zinc-400 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')}`}>
                            {v}
                        </button>
                    ))}
                </div>

                {/* Status filter */}
                <div className={`flex rounded-lg overflow-hidden border ${dark ? 'border-white/[0.08]' : 'border-gray-200'}`}>
                    {[['all','All'],['pending','Pending'],['active','In Progress'],['done','Completed']].map(([k, label]) => (
                        <button key={k} onClick={() => setStatus(k)}
                            className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all ${statusFilter === k ? 'bg-[#1E1E2A] text-white border-b-2 border-orange-500' : (dark ? 'text-zinc-500 hover:bg-white/5' : 'text-gray-400 hover:bg-gray-50')}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Staff pill filter */}
                {detailers.length > 0 && (
                    <div className="flex items-center gap-1">
                        {detailers.slice(0, 4).map(u => {
                            const uid = u.id || u._id || '';
                            const col = staffColorMap.get(uid) ?? STAFF_COLORS[0];
                            const active = staffFilter === uid;
                            return (
                                <button key={uid} onClick={() => setStaff(active ? 'all' : uid)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all"
                                    style={{ background: active ? col.bg : `${col.bg}22`, color: active ? '#fff' : col.bg, outline: active ? `1.5px solid ${col.bg}` : 'none' }}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#fff' : col.bg }} />
                                    {(u.name || u.displayName || 'Staff').split(' ')[0]}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* AI Smart Assist */}
                <button onClick={() => { setAiAssist(!aiAssist); setPanelTab('ai'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${aiAssist ? 'border-orange-500 bg-orange-500/10 text-orange-400' : (dark ? 'border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}`}>
                    <Bot className="w-3.5 h-3.5" />
                    AI Smart Assist
                </button>

                <div className="flex-1" />

                {/* New Booking */}
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={onNewBooking}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold shadow-md shadow-orange-500/25">
                    <Plus className="w-3.5 h-3.5" /> New Booking
                </motion.button>
            </div>

            {/* ── SMART ALERTS TICKER ── */}
            {conflictAlerts.length > 0 && (
                <div className={`flex items-center gap-3 px-3 py-1.5 mb-3 rounded-xl border shrink-0 overflow-hidden ${dark ? 'bg-orange-900/10 border-orange-500/20' : 'bg-orange-50 border-orange-100'}`}>
                    <span className={`text-[9px] font-black uppercase tracking-widest shrink-0 ${dark ? 'text-orange-400/70' : 'text-orange-600/70'}`}>SMART ALERTS</span>
                    <div className="flex-1 overflow-hidden">
                        <motion.div className="flex gap-8 whitespace-nowrap"
                            animate={{ x: ['0%', '-50%'] }}
                            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}>
                            {[...conflictAlerts, ...conflictAlerts].map((msg, i) => (
                                <span key={i} className={`text-[10px] font-semibold inline-flex items-center gap-1.5 ${dark ? 'text-orange-300' : 'text-orange-700'}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse shrink-0" />
                                    {msg}
                                </span>
                            ))}
                        </motion.div>
                    </div>
                </div>
            )}

            {/* ── MAIN AREA ── */}
            <div className="flex gap-3 flex-1 min-h-0">
                {/* Calendar */}
                <div className={`flex-1 min-w-0 rounded-2xl border overflow-hidden flex flex-col ${dark ? 'border-white/[0.08]' : 'border-gray-200 bg-white shadow-sm'}`}
                    style={{
                        minHeight: 0,
                        ...(dark ? {
                            background: 'linear-gradient(180deg, rgba(14,14,24,0.95) 0%, rgba(10,10,18,0.98) 100%)',
                            backdropFilter: 'blur(16px)',
                            boxShadow: '0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
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

                    {/* Legend bar */}
                    <div className={`flex items-center gap-4 px-4 py-2.5 border-t shrink-0 ${dark ? 'border-white/[0.06]' : 'border-gray-100 bg-gray-50'}`}
                        style={dark ? { background: 'rgba(13,13,22,0.9)', backdropFilter: 'blur(8px)' } : undefined}>
                        {[
                            { color: '#6366F1', label: 'Booked' },
                            { color: '#EF4444', label: 'Schedule conflict' },
                            { color: '#10B981', label: 'Empty slot' },
                            { color: '#F59E0B', label: 'Staff day off' },
                            { color: '#22C55E', label: 'Available' },
                        ].map(({ color, label }) => (
                            <div key={label} className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: `${color}55`, boxShadow: `0 0 6px ${color}22` }} />
                                <span className={`text-[9px] font-semibold ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Detail Panel */}
                <div className={`w-[270px] shrink-0 flex flex-col rounded-2xl border overflow-hidden ${dark ? 'border-white/[0.06]' : 'bg-white border-gray-200 shadow-sm'}`}
                    style={dark ? {
                        background: 'linear-gradient(180deg, rgba(15,15,26,0.95) 0%, rgba(13,13,22,0.98) 100%)',
                        backdropFilter: 'blur(16px)',
                        boxShadow: '0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
                    } : undefined}>
                    {/* Tab header */}
                    <div className={`flex border-b shrink-0 ${dark ? 'border-white/[0.06]' : 'border-gray-100 bg-gray-50'}`}
                        style={dark ? { background: 'rgba(18,18,28,0.8)' } : undefined}>
                        {(['details','staff','ai'] as PanelTab[]).map(t => (
                            <button key={t} onClick={() => setPanelTab(t)}
                                className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${panelTab === t ? `border-b-2 border-orange-500 ${dark ? 'text-white' : 'text-gray-900'}` : (dark ? 'text-zinc-600 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600')}`}>
                                {t === 'ai' ? 'AI Assist' : t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
                        <AnimatePresence mode="wait">
                            <motion.div key={panelTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                                {panelTab === 'details' && renderDetailsTab()}
                                {panelTab === 'staff'   && renderStaffTab()}
                                {panelTab === 'ai'      && renderAITab()}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmartCalendar;
