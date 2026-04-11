import { motion } from 'framer-motion';
import { Zap, CheckCircle, ClipboardList, AlertTriangle, Clock, Play, Sparkles, Package, Camera, Activity, Car, ShieldCheck } from 'lucide-react';
import { btnHover, btnTap, pageVariants, staggerContainer, staggerItem } from './SharedAnimations';
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
    userName?: string;
    handleStartJob: (job: Booking) => void;
    handleCompleteJob: (job: Booking) => void;
    handleForceReady: (job: Booking) => void;
    handleToggleChecklist: (job: Booking, idx: number) => void;
    handleToggleOperationsChecklist: (job: Booking, phase: 'ingress' | 'egress', idx: number) => void;
    setActiveTab: (tab: string) => void;
}

// Time-based greeting
function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

// Mini sparkline data (mock trend bars)
function getSparkBars(value: number, seed: number): number[] {
    const base = Math.max(value, 1);
    return [
        Math.round(base * (0.3 + (seed * 0.1))),
        Math.round(base * (0.5 + (seed * 0.05))),
        Math.round(base * (0.4 + (seed * 0.12))),
        Math.round(base * (0.7 + (seed * 0.03))),
        Math.round(base * (0.6 + (seed * 0.08))),
        Math.round(base * (0.8 + (seed * 0.02))),
        base,
    ];
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
    handleToggleOperationsChecklist,
    setActiveTab,
    userName
}: DashboardTabProps) {
    const getJobId = (job: Booking) => (job.id || (job as any)._id) as string;
    const activeCount = safeJobs.filter(j => j.status === 'in_progress').length;
    const lowStockItems = inventory.filter(i => i.stock <= (inventoryThreshold ?? i.minLevel));
    const nonCompletedJobs = safeJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');

    const kpis = [
        { label: 'Active Jobs', value: activeCount, icon: Zap, color: 'orange', accent: true },
        { label: 'Completed Today', value: completedToday, icon: CheckCircle, color: 'green' },
        { label: 'Pending Queue', value: finalPendingJobs.length, icon: ClipboardList, color: 'blue' },
        { label: 'Low Stock', value: lowStockItems.length, icon: AlertTriangle, color: 'red' },
        { label: 'Hours Logged', value: hoursLogged, icon: Clock, color: 'purple' },
    ];

    const dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    return (
        <motion.div key="dashboard" variants={pageVariants} initial="initial" animate="animate" exit="exit">

            {/* ── Welcome Bar ── */}
            <motion.div
                className="dash-welcome"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
                <div className="dash-welcome-text">
                    <h2>{getGreeting()}, {userName || 'there'}</h2>
                    <p>{dateStr}</p>
                </div>
                <div className="dash-status-pill">
                    <span className="dash-status-dot" />
                    Online · Service Bay
                </div>
            </motion.div>

            {/* ── KPI Cards V2 ── */}
            <motion.div
                className="kpi-grid-v2"
                variants={staggerContainer}
                initial="initial"
                animate="animate"
            >
                {kpis.map((kpi, idx) => {
                    const bars = getSparkBars(kpi.value, idx);
                    const maxBar = Math.max(...bars, 1);
                    return (
                        <motion.div
                            key={kpi.label}
                            variants={staggerItem}
                            className={`kpi-card-v2 ${kpi.color}${kpi.accent ? ' accent' : ''}`}
                            whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
                        >
                            {/* Watermark icon */}
                            <div className="kpi-card-v2-watermark">
                                <kpi.icon style={{ width: 64, height: 64 }} />
                            </div>

                            <p className="kpi-card-v2-label">{kpi.label}</p>
                            <div className="kpi-card-v2-value">
                                <CountUp end={kpi.value} duration={1.5 + idx * 0.15} />
                            </div>

                            {/* Sparkline bars */}
                            <div className="kpi-sparkline">
                                {bars.map((h, i) => (
                                    <div
                                        key={i}
                                        className="kpi-spark-bar"
                                        style={{ height: `${Math.max((h / maxBar) * 18, 3)}px` }}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    );
                })}
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
                    handleToggleOperationsChecklist={handleToggleOperationsChecklist}
                />
            )}

            {/* ── Dashboard Grid — Jobs + Quick Actions ── */}
            <div className="dashboard-grid">

                {/* Today's Jobs — Kanban Cards */}
                <motion.div
                    className="glass-panel"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <div className="glass-panel-header">
                        <h3><Car style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Today's Jobs</h3>
                        <span className={`status-badge ${nonCompletedJobs.length > 0 ? 'active' : 'completed'}`}>
                            {nonCompletedJobs.length > 0 ? `${nonCompletedJobs.length} Active` : 'Clear'}
                        </span>
                    </div>
                    <div className="glass-panel-body" style={{ padding: nonCompletedJobs.length === 0 ? 0 : 14 }}>
                        {nonCompletedJobs.length === 0 ? (
                            <div className="empty-state-v2">
                                <div className="empty-state-v2-icon">
                                    <ShieldCheck style={{ width: 24, height: 24 }} />
                                </div>
                                <h4>Your bay is clear</h4>
                                <p>No active jobs right now. Enjoy the moment!</p>
                            </div>
                        ) : (
                            <div className="job-cards-grid">
                                {nonCompletedJobs.slice(0, 6).map((job, idx) => {
                                    const isActive = job.status === 'in_progress';
                                    const initials = (job.customerName || 'C')
                                        .split(' ')
                                        .map((w: string) => w[0])
                                        .join('')
                                        .toUpperCase()
                                        .slice(0, 2);

                                    return (
                                        <motion.div
                                            key={getJobId(job) || idx}
                                            className={`job-card-v2${isActive ? ' active-job' : ''}`}
                                            initial={{ opacity: 0, x: -12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.06 }}
                                        >
                                            <div className="job-avatar">{initials}</div>
                                            <div className="job-card-info">
                                                <div className="job-card-customer">{job.customerName}</div>
                                                <div className="job-card-meta">
                                                    {job.vehicleInfo || 'Vehicle'} · {job.serviceName}
                                                </div>
                                            </div>
                                            <div className="job-card-right">
                                                <span className={`status-badge ${isActive ? 'active' : 'pending'}`}>
                                                    {job.status}
                                                </span>
                                                {job.status === 'received' && (
                                                    <motion.button
                                                        whileHover={btnHover}
                                                        whileTap={btnTap}
                                                        className="btn-premium primary"
                                                        style={{ height: 30, fontSize: 11, padding: '0 14px' }}
                                                        onClick={() => handleStartJob(job)}
                                                    >
                                                        <Play style={{ width: 11, height: 11 }} /> Start
                                                    </motion.button>
                                                )}
                                                {(job.status === 'assigned') && (
                                                    <span className="status-badge pending" style={{ fontSize: 10, padding: '2px 8px' }}>
                                                        Awaiting Check-in
                                                    </span>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Right Column — Quick Actions + Low Stock */}
                <motion.div
                    style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    {/* Quick Actions — Tile Grid */}
                    <div className="glass-panel">
                        <div className="glass-panel-header">
                            <h3><Sparkles style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Quick Actions</h3>
                        </div>
                        <div className="glass-panel-body">
                            <div className="action-grid">
                                <motion.button
                                    className="action-tile"
                                    whileHover={{ y: -3 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setActiveTab('queue')}
                                >
                                    <div className="action-tile-icon">
                                        <ClipboardList style={{ width: 20, height: 20 }} />
                                    </div>
                                    <span className="action-tile-label">Job Queue</span>
                                </motion.button>

                                <motion.button
                                    className="action-tile"
                                    whileHover={{ y: -3 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setActiveTab('inventory')}
                                >
                                    <div className="action-tile-icon">
                                        <Package style={{ width: 20, height: 20 }} />
                                    </div>
                                    <span className="action-tile-label">Inventory</span>
                                </motion.button>

                                <motion.button
                                    className="action-tile"
                                    whileHover={{ y: -3 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setActiveTab('photos')}
                                >
                                    <div className="action-tile-icon">
                                        <Camera style={{ width: 20, height: 20 }} />
                                    </div>
                                    <span className="action-tile-label">Photos</span>
                                </motion.button>

                                <motion.button
                                    className="action-tile"
                                    whileHover={{ y: -3 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setActiveTab('activity')}
                                >
                                    <div className="action-tile-icon">
                                        <Activity style={{ width: 20, height: 20 }} />
                                    </div>
                                    <span className="action-tile-label">Analytics</span>
                                </motion.button>
                            </div>
                        </div>
                    </div>

                    {/* Low Stock Alerts */}
                    {lowStockItems.length > 0 && (
                        <motion.div
                            className="glass-panel"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5 }}
                        >
                            <div className="glass-panel-header">
                                <h3><AlertTriangle style={{ width: 14, height: 14, color: 'var(--red)' }} /> Low Stock Alerts</h3>
                            </div>
                            <div className="glass-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {lowStockItems.slice(0, 4).map(item => (
                                    <motion.div
                                        key={item.id}
                                        className="job-card-v2"
                                        whileHover={{ x: 4 }}
                                        style={{ padding: '12px 16px' }}
                                    >
                                        <div className="job-avatar" style={{ width: 32, height: 32, fontSize: 11, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-border)' }}>
                                            <AlertTriangle style={{ width: 14, height: 14 }} />
                                        </div>
                                        <div className="job-card-info">
                                            <div className="job-card-customer" style={{ fontSize: 12 }}>{item.name}</div>
                                        </div>
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
