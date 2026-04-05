import { motion } from 'framer-motion';
import { ClipboardList, Play, CheckCircle } from 'lucide-react';
import { btnHover, btnTap, pageVariants } from './SharedAnimations';
import { CommandCenter } from './CommandCenter';
import type { Booking } from '@/types';

interface QueueTabProps {
    finalPendingJobs: Booking[];
    activeJob?: Booking;
    elapsedTime: number;
    isChecklistComplete: boolean;
    isCompleting: boolean;
    handleStartJob: (job: Booking) => void;
    handleCompleteJob: (job: Booking) => void;
    handleForceReady: (job: Booking) => void;
    handleToggleChecklist: (job: Booking, idx: number) => void;
}

export function QueueTab({
    finalPendingJobs,
    activeJob,
    elapsedTime,
    isChecklistComplete,
    isCompleting,
    handleStartJob,
    handleCompleteJob,
    handleForceReady,
    handleToggleChecklist
}: QueueTabProps) {
    const getJobId = (job: Booking) => (job.id || (job as any)._id) as string;

    return (
        <motion.div key="queue" variants={pageVariants} initial="initial" animate="animate" exit="exit">
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

            {/* Pending Jobs Table */}
            <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <div className="glass-panel-header">
                    <h3><ClipboardList style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Job Queue</h3>
                    <span className="status-badge pending">{finalPendingJobs.length} Pending</span>
                </div>
                <div className="glass-panel-body" style={{ padding: 0 }}>
                    {finalPendingJobs.length === 0 ? (
                        <div style={{ padding: 48, textAlign: 'center' }}>
                            <CheckCircle style={{ width: 36, height: 36, color: 'var(--green)', margin: '0 auto 12px' }} />
                            <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>All clear! No pending jobs.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto w-full">
                            <table className="data-table">
                                <thead><tr><th>Customer</th><th>Vehicle</th><th>Service</th><th>Time</th><th>Status</th><th>Action</th></tr></thead>
                                <tbody>
                                    {finalPendingJobs.map((job, idx) => (
                                        <motion.tr key={getJobId(job) || idx} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.06, type: 'spring', stiffness: 200, damping: 24 }}>
                                            <td style={{ fontWeight: 600 }}>{job.customerName}</td>
                                            <td className="muted">{job.vehicleInfo || '—'}</td>
                                            <td>{job.serviceName}</td>
                                            <td className="muted" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{job.time || '—'}</td>
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
        </motion.div>
    );
}
