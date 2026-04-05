import { motion } from 'framer-motion';
import { Zap, CheckCircle, ClipboardList, AlertTriangle, Clock, Play, Sparkles, Package, Camera } from 'lucide-react';
import { btnHover, btnTap, pageVariants, staggerContainer, staggerItem, cardTap, cardHover } from './SharedAnimations';
import { CountUp } from './Utils';
import { CommandCenter } from './CommandCenter';
import type { Booking, InventoryItem } from '@/types';

interface DashboardTabProps {
    safeJobs: Booking[];
    activeJob?: Booking;
    finalPendingJobs: Booking[];
    completedToday: number;
    hoursLogged: number;
    inventory: InventoryItem[];
    inventoryThreshold?: number;
    elapsedTime: number;
    isChecklistComplete: boolean;
    isCompleting: boolean;
    handleStartJob: (job: Booking) => void;
    handleCompleteJob: (job: Booking) => void;
    handleForceReady: (job: Booking) => void;
    handleToggleChecklist: (job: Booking, idx: number) => void;
    setActiveTab: (tab: string) => void;
}

export function DashboardTab({
    safeJobs,
    activeJob,
    finalPendingJobs,
    completedToday,
    hoursLogged,
    inventory,
    inventoryThreshold,
    elapsedTime,
    isChecklistComplete,
    isCompleting,
    handleStartJob,
    handleCompleteJob,
    handleForceReady,
    handleToggleChecklist,
    setActiveTab
}: DashboardTabProps) {
    const getJobId = (job: Booking) => (job.id || (job as any)._id) as string;

    return (
        <motion.div key="dashboard" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            {/* KPI Cards */}
            <motion.div className="kpi-grid" style={{ marginBottom: 24 }} variants={staggerContainer} initial="initial" animate="animate">
                {[
                    { label: 'Active Jobs', value: safeJobs.filter(j => j.status === 'in-progress' || j.status === 'processing').length, icon: Zap, color: 'orange', accent: true },
                    { label: 'Completed Today', value: completedToday, icon: CheckCircle, color: 'green' },
                    { label: 'Pending Queue', value: finalPendingJobs.length, icon: ClipboardList, color: 'blue' },
                    { label: 'Low Stock', value: inventory.filter(i => i.stock <= (inventoryThreshold ?? i.minLevel)).length, icon: AlertTriangle, color: 'red' },
                    { label: 'Hours Logged', value: hoursLogged, icon: Clock, color: 'purple' },
                ].map((kpi, idx) => (
                    <motion.div key={kpi.label} variants={staggerItem} className={`kpi-card${kpi.accent ? ' accent' : ''}`} whileHover={{ y: -6, boxShadow: '0 20px 60px rgba(0,0,0,0.15), var(--accent-glow)' }} whileTap={cardTap}>
                        <div className="kpi-header">
                            <motion.div className={`kpi-icon-wrap ${kpi.color}`} whileHover={{ rotate: -8, scale: 1.15 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                                <kpi.icon style={{ width: 18, height: 18 }} />
                            </motion.div>
                        </div>
                        <p className="kpi-label">{kpi.label}</p>
                        <div className="kpi-value"><CountUp end={kpi.value} duration={1.5 + idx * 0.15} /></div>
                    </motion.div>
                ))}
            </motion.div>

            {/* Active Job Command Center */}
            {activeJob && (
                <CommandCenter 
                    activeJob={activeJob}
                    elapsedTime={elapsedTime}
                    isChecklistComplete={isChecklistComplete}
                    isCompleting={isCompleting}
                    handleCompleteJob={handleCompleteJob}
                    handleForceReady={handleForceReady}
                    handleToggleChecklist={handleToggleChecklist}
                />
            )}

            {/* Dashboard Grid — Jobs Table + Activity */}
            <div className="dashboard-grid">
                {/* Today's Jobs */}
                <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <div className="glass-panel-header">
                        <h3><ClipboardList style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Today's Jobs</h3>
                        <span className="status-badge active">{safeJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').length} Active</span>
                    </div>
                    <div className="glass-panel-body" style={{ padding: 0 }}>
                        {safeJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').length === 0 ? (
                            <div style={{ padding: 48, textAlign: 'center' }}>
                                <ClipboardList style={{ width: 36, height: 36, color: 'var(--text-dim)', margin: '0 auto 12px' }} />
                                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No active jobs assigned</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto w-full">
                                <table className="data-table">
                                    <thead><tr><th>Customer</th><th>Vehicle</th><th>Service</th><th>Status</th><th>Action</th></tr></thead>
                                    <tbody>
                                        {safeJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').slice(0, 8).map((job, idx) => (
                                            <motion.tr key={getJobId(job) || idx} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}>
                                                <td style={{ fontWeight: 600 }}>{job.customerName}</td>
                                                <td className="muted">{job.vehicleInfo || '—'}</td>
                                                <td>{job.serviceName}</td>
                                                <td><span className={`status-badge ${job.status === 'in-progress' || job.status === 'processing' ? 'active' : 'pending'}`}>{job.status}</span></td>
                                                <td>
                                                    {(job.status === 'pending' || job.status === 'assigned') && (
                                                        <motion.button whileHover={btnHover} whileTap={btnTap} className="btn-premium primary" style={{ height: 28, fontSize: 11, padding: '0 12px' }} onClick={() => handleStartJob(job)}>
                                                            <Play style={{ width: 11, height: 11 }} /> Start
                                                        </motion.button>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Activity + Quick Actions */}
                <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    {/* Quick Actions */}
                    <div className="glass-panel">
                        <div className="glass-panel-header"><h3><Sparkles style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Quick Actions</h3></div>
                        <div className="glass-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <motion.button whileHover={btnHover} whileTap={btnTap} className="btn-premium primary" style={{ width: '100%', justifyContent: 'center', height: 40 }} onClick={() => setActiveTab('queue')}>
                                <ClipboardList style={{ width: 14, height: 14 }} /> View Job Queue
                            </motion.button>
                            <motion.button whileHover={btnHover} whileTap={btnTap} className="btn-premium" style={{ width: '100%', justifyContent: 'center', height: 40 }} onClick={() => setActiveTab('inventory')}>
                                <Package style={{ width: 14, height: 14 }} /> Log Inventory Usage
                            </motion.button>
                            <motion.button whileHover={btnHover} whileTap={btnTap} className="btn-premium" style={{ width: '100%', justifyContent: 'center', height: 40 }} onClick={() => setActiveTab('photos')}>
                                <Camera style={{ width: 14, height: 14 }} /> Upload Photos
                            </motion.button>
                        </div>
                    </div>
                    {/* Low Stock Alerts */}
                    {inventory.filter(i => i.stock <= (inventoryThreshold ?? i.minLevel)).length > 0 && (
                        <motion.div className="glass-panel" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
                            <div className="glass-panel-header"><h3><AlertTriangle style={{ width: 14, height: 14, color: 'var(--red)' }} /> Low Stock Alerts</h3></div>
                            <div className="glass-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {inventory.filter(i => i.stock <= (inventoryThreshold ?? i.minLevel)).slice(0, 4).map(item => (
                                    <motion.div key={item.id} className="queue-card" whileHover={cardHover} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
                                        <span style={{ fontSize: 12, fontWeight: 500 }}>{item.name}</span>
                                        <span className="status-badge low-stock">{item.stock} {item.unit}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </motion.div>
    );
}
