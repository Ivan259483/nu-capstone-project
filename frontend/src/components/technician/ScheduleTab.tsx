import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, Package, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { pageVariants } from './SharedAnimations';

interface ScheduleItem {
    id: string;
    time: string;
    customer: string;
    status: string;
    vehicle?: string;
    service?: string;
    rawDate?: Date | string | number; // Fallback for calendar placing
}

interface ScheduleTabProps {
    scheduleItems: ScheduleItem[];
}

export function ScheduleTab({ scheduleItems }: ScheduleTabProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());

    const handlePrevMonth = () => setCurrentDate(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentDate(prev => addMonths(prev, 1));

    // Derive the grid days
    const daysInterval = useMemo(() => {
        const start = startOfWeek(startOfMonth(currentDate));
        const end = endOfWeek(endOfMonth(currentDate));
        return eachDayOfInterval({ start, end });
    }, [currentDate]);

    // Parse item dates mapping
    const itemsWithDates = useMemo(() => {
        return scheduleItems.map(item => {
            // If the item doesn't have rawDate but we know it's injected today we can pad it, 
            // but ideally rawDate should be passed down. Let's assume rawDate exists or default to today if time shows.
            const dateObj = item.rawDate ? new Date(item.rawDate) : new Date();
            return { ...item, dateObj };
        });
    }, [scheduleItems]);

    const itemsForSelectedDate = useMemo(() => {
        return itemsWithDates.filter(item => isSameDay(item.dateObj, selectedDate));
    }, [itemsWithDates, selectedDate]);

    // Quick counts for dots on calendar
    const activeDatesCount = useMemo(() => {
        const counts = new Map<string, number>();
        const statusMap = new Map<string, 'pending' | 'active' | 'completed'>();

        itemsWithDates.forEach(item => {
            const dateStr = format(item.dateObj, 'yyyy-MM-dd');
            counts.set(dateStr, (counts.get(dateStr) || 0) + 1);

            // Determine worst status for the dot color
            const currentStatus = statusMap.get(dateStr) || 'completed';
            const s = (item.status || '').toLowerCase();
            if (s === 'completed' || s === 'released') {
                if (currentStatus !== 'active' && currentStatus !== 'pending') statusMap.set(dateStr, 'completed');
            } else if (s === 'in_progress' || s === 'processing') {
                if (currentStatus !== 'pending') statusMap.set(dateStr, 'active');
            } else {
                statusMap.set(dateStr, 'pending'); // pending/default
            }
        });
        return { counts, statusMap };
    }, [itemsWithDates]);

    const getStatusStyles = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'completed' || s === 'released' || s === 'paid') return { bg: 'rgba(34,197,94,0.15)', text: '#166534', dot: '#22c55e' };
        if (s === 'in_progress' || s === 'processing') return { bg: 'rgba(14, 165, 233, 0.15)', text: '#0369a1', dot: '#0ea5e9' };
        if (s === 'cancelled' || s === 'failed') return { bg: 'rgba(239, 68, 68, 0.15)', text: '#991b1b', dot: '#ef4444' };
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#b45309', dot: '#f59e0b' };
    };

    return (
        <motion.div key="schedule" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                <div>
                    <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 800, color: '#06274b', margin: 0, letterSpacing: '-0.02em' }}>Schedule & Workflow</h2>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#74777d', margin: '4px 0 0 0' }}>Plan and organize your active detailing queues</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
                
                {/* ── CALENDAR PANE ── */}
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ background: '#ffffff', borderRadius: 16, border: '1px solid rgba(6,39,75,0.06)', boxShadow: '0 8px 24px rgba(6,39,75,0.04)', overflow: 'hidden' }}>
                    <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                        <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: '#06274b', margin: 0 }}>
                            {format(currentDate, 'MMMM yyyy')}
                        </h3>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={handlePrevMonth} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#475569' }}>
                                <ChevronLeft style={{ width: 16, height: 16 }} />
                            </button>
                            <button onClick={handleNextMonth} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#475569' }}>
                                <ChevronRight style={{ width: 16, height: 16 }} />
                            </button>
                        </div>
                    </div>
                    
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 12 }}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>{d}</div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px 4px' }}>
                            {daysInterval.map((day, idx) => {
                                const isSelected = isSameDay(day, selectedDate);
                                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                                const isTodayDate = isToday(day);
                                const dayStr = format(day, 'yyyy-MM-dd');
                                const jobsCount = activeDatesCount.counts.get(dayStr) || 0;
                                const dotStatus = activeDatesCount.statusMap.get(dayStr);
                                
                                let dotColor = '#e2e8f0';
                                if (dotStatus === 'active') dotColor = '#0ea5e9';
                                else if (dotStatus === 'pending') dotColor = '#f59e0b';
                                else if (dotStatus === 'completed') dotColor = '#22c55e';

                                return (
                                    <motion.button
                                        key={day.toISOString() + idx}
                                        onClick={() => setSelectedDate(day)}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        style={{
                                            aspectRatio: '1',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 4,
                                            background: isSelected ? '#06274b' : isTodayDate ? '#f1f5f9' : 'transparent',
                                            border: isTodayDate && !isSelected ? '1px solid #cbd5e1' : '1px solid transparent',
                                            borderRadius: 12,
                                            cursor: 'pointer',
                                            opacity: isCurrentMonth ? 1 : 0.3,
                                            color: isSelected ? '#fff' : '#1e293b',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <span style={{ fontSize: 14, fontWeight: isSelected || isTodayDate ? 700 : 500, fontFamily: "'Inter', sans-serif" }}>
                                            {format(day, 'd')}
                                        </span>
                                        {jobsCount > 0 && (
                                            <div style={{ display: 'flex', gap: 2 }}>
                                                {/* limit to 3 dots max */}
                                                {Array.from({ length: Math.min(jobsCount, 3) }).map((_, i) => (
                                                    <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: isSelected ? '#38bdf8' : dotColor }} />
                                                ))}
                                            </div>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>

                {/* ── AGENDA PANE ── */}
                <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} style={{ background: '#ffffff', borderRadius: 16, border: '1px solid rgba(6,39,75,0.06)', boxShadow: '0 8px 24px rgba(6,39,75,0.04)', overflow: 'hidden', minHeight: 400, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(6,39,75,0.06)', background: '#fafbfc' }}>
                        <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: '#06274b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CalendarIcon style={{ width: 16, height: 16, color: '#0ea5e9' }} />
                            {isToday(selectedDate) ? "Today's Agenda" : format(selectedDate, 'EEEE, MMM do')}
                        </h3>
                    </div>

                    <div style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <AnimatePresence mode="popLayout">
                            {itemsForSelectedDate.length === 0 ? (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, textAlign: 'center' }}>
                                    <div style={{ width: 64, height: 64, background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                        <CalendarIcon style={{ width: 28, height: 28, color: '#cbd5e1' }} />
                                    </div>
                                    <h4 style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: '#334155', margin: '0 0 4px 0' }}>No Jobs Scheduled</h4>
                                    <p style={{ fontFamily: "'Inter', sans-serif", color: '#94a3b8', fontSize: 13, margin: 0 }}>Your workflow is clear for this day.</p>
                                </motion.div>
                            ) : (
                                itemsForSelectedDate.map((item, idx) => {
                                    const st = getStatusStyles(item.status);
                                    return (
                                        <motion.div 
                                            key={item.id} 
                                            initial={{ opacity: 0, y: 12 }} 
                                            animate={{ opacity: 1, y: 0 }} 
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: idx * 0.05 }}
                                            style={{ 
                                                display: 'flex', gap: 16, padding: 16, borderRadius: 12, 
                                                background: '#f8fafc', border: '1px solid #e2e8f0', 
                                                position: 'relative', overflow: 'hidden' 
                                            }}
                                        >
                                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: st.dot }} />
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60, paddingRight: 16, borderRight: '1px dashed #cbd5e1' }}>
                                                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.time || '--:--'}</span>
                                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 4 }}>EST</span>
                                            </div>

                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                    <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 15, color: '#0f172a', letterSpacing: '-0.01em' }}>{item.customer || 'Unknown Client'}</span>
                                                    <span style={{ 
                                                        background: st.bg, color: st.text, 
                                                        fontSize: 10, fontWeight: 700, padding: '4px 10px', 
                                                        borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em' 
                                                    }}>
                                                        {item.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 13 }}>
                                                        <Package style={{ width: 14, height: 14 }} />
                                                        <span style={{ fontWeight: 500 }}>{item.service || 'General Detail'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 12 }}>
                                                        <AlertCircle style={{ width: 14, height: 14 }} />
                                                        <span>{item.vehicle || 'Unknown Vehicle'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

export default ScheduleTab;
