import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { pageVariants } from './SharedAnimations';

interface ScheduleItem {
    id: string;
    time: string;
    customer: string;
    status: string;
    vehicle?: string;
    service?: string;
}

interface ScheduleTabProps {
    scheduleItems: ScheduleItem[];
}

export function ScheduleTab({ scheduleItems }: ScheduleTabProps) {
    return (
        <motion.div key="schedule" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-panel-header">
                    <h3><Calendar style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Today's Schedule</h3>
                    <span className="status-badge active">{scheduleItems.length} appointments</span>
                </div>
                <div className="glass-panel-body" style={{ padding: 0 }}>
                    {scheduleItems.length === 0 ? (
                        <div style={{ padding: 48, textAlign: 'center' }}>
                            <Calendar style={{ width: 36, height: 36, color: 'var(--text-dim)', margin: '0 auto 12px' }} />
                            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No appointments scheduled</p>
                        </div>
                    ) : (
                        <div className="schedule-timeline" style={{ padding: '8px 20px' }}>
                            {scheduleItems.map((item, idx) => (
                                <motion.div key={item.id || idx} className="schedule-slot" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.06, type: 'spring', stiffness: 200, damping: 24 }}>
                                    <div className="schedule-time">{item.time}</div>
                                    <div className="schedule-content">
                                        {item.customer && item.customer !== 'Customer' ? (
                                            <motion.div className="schedule-appointment" whileHover={{ x: 6, boxShadow: 'var(--accent-glow)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{item.customer}</span>
                                                    <span className={`status-badge ${item.status === 'COMPLETED' ? 'completed' : item.status === 'IN PROGRESS' || item.status === 'IN-PROGRESS' || item.status === 'PROCESSING' ? 'active' : 'pending'}`}>{item.status}</span>
                                                </div>
                                                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{item.vehicle}</p>
                                                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{item.service}</p>
                                            </motion.div>
                                        ) : (
                                            <div style={{ color: 'var(--text-dim)', fontSize: 12, fontStyle: 'italic', padding: '8px 0' }}>{item.service || 'Available'}</div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
