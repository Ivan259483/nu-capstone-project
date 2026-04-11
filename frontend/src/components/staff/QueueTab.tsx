import { motion } from 'framer-motion';
import { ClipboardList, Play, CheckCircle, Clock, Car, Wrench, ShieldCheck, Activity } from 'lucide-react';
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
    handleToggleOperationsChecklist: (job: Booking, phase: 'ingress' | 'egress', idx: number) => void;
}

const getJobId = (job: Booking) => (job.id || (job as any)._id) as string;

// Helper to determine status styling
const getStatusConfig = (status: string) => {
    switch(status) {
        case 'assigned':
            return { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', shadow: '0 0 10px rgba(168, 85, 247, 0.4)', label: 'Assigned', icon: <Wrench size={12} /> };
        case 'in_progress':
            return { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', shadow: '0 0 10px rgba(59, 130, 246, 0.4)', label: 'In Progress', icon: <Activity size={12} /> };
        case 'received':
            return { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', shadow: '0 0 10px rgba(139, 92, 246, 0.4)', label: 'Checked In', icon: <Car size={12} /> };
        case 'completed':
            return { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', shadow: '0 0 10px rgba(34, 197, 94, 0.4)', label: 'QC Complete', icon: <ShieldCheck size={12} /> };
        case 'paid':
            return { color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', shadow: '0 0 10px rgba(234, 179, 8, 0.4)', label: 'Paid', icon: <CheckCircle size={12} /> };
        case 'released':
            return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', shadow: '0 0 10px rgba(16, 185, 129, 0.4)', label: 'Released', icon: <CheckCircle size={12} /> };
        case 'pending':
        case 'confirmed':
        default:
            return { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', shadow: 'none', label: 'Pending / Queued', icon: <Clock size={12} /> };
    }
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
    handleToggleChecklist,
    handleToggleOperationsChecklist
}: QueueTabProps) {

    // Derived Metrics
    const pendingCount = finalPendingJobs.filter(j => ['assigned', 'received'].includes(j.status)).length;
    const progressCount = finalPendingJobs.filter(j => ['in_progress'].includes(j.status)).length;
    const readyCount = finalPendingJobs.filter(j => ['completed', 'paid', 'released'].includes(j.status)).length;

    return (
        <motion.div key="queue" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
            
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

            {/* Quick Metrics Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {[
                    { label: 'Pending Jobs', value: pendingCount, icon: <Clock color="#f97316" />, border: 'rgba(249, 115, 22, 0.4)' },
                    { label: 'In Progress', value: progressCount, icon: <Activity color="#3b82f6" />, border: progressCount > 0 ? 'rgba(59, 130, 246, 0.8)' : 'rgba(59, 130, 246, 0.2)' },
                    { label: 'Ready / Finishing', value: readyCount, icon: <CheckCircle color="#22c55e" />, border: 'rgba(34, 197, 94, 0.4)' },
                    { label: 'Total Active Queue', value: finalPendingJobs.length, icon: <ClipboardList color="#a1a1aa" />, border: 'rgba(255,255,255,0.1)' }
                ].map((metric, i) => (
                    <motion.div key={i} className="glass-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                        style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `4px solid ${metric.border}` }}>
                        <div>
                            <p style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{metric.label}</p>
                            <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{metric.value}</p>
                        </div>
                        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                            {metric.icon}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main Queue List */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 8px' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Wrench style={{ color: 'var(--accent)', width: 18, height: 18 }} /> 
                        Operational Queue
                    </h3>
                </div>

                {finalPendingJobs.length === 0 ? (
                    <div className="glass-panel" style={{ padding: 64, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <ShieldCheck style={{ width: 48, height: 48, color: 'var(--green)', margin: '0 auto 16px', opacity: 0.8 }} />
                        <h4 style={{ color: 'var(--text)', fontSize: 18, marginBottom: 8 }}>Queue is fully cleared</h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>All assigned vehicles have been processed. Great job!</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {finalPendingJobs.map((job, idx) => {
                            const conf = getStatusConfig(job.status);
                            const isActive = job.status === 'in_progress';

                            return (
                                <motion.div 
                                    key={getJobId(job)} 
                                    initial={{ opacity: 0, x: -16 }} 
                                    animate={{ opacity: 1, x: 0 }} 
                                    transition={{ delay: idx * 0.05 + 0.2 }}
                                    whileHover={{ scale: 1.01, backgroundColor: 'rgba(255,255,255,0.03)' }}
                                    style={{ 
                                        position: 'relative',
                                        background: isActive ? 'linear-gradient(to right, rgba(20, 20, 20, 0.95), rgba(30, 30, 30, 0.95))' : 'rgba(15, 15, 15, 0.8)',
                                        border: `1px solid ${isActive ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.05)'}`,
                                        borderRadius: 16,
                                        padding: '20px 24px',
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr) minmax(150px, 1fr) auto',
                                        gap: 20,
                                        alignItems: 'center',
                                        boxShadow: isActive ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.2)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    {/* Active Highlight Bar */}
                                    {isActive && (
                                        <motion.div 
                                            animate={{ opacity: [0.5, 1, 0.5] }} 
                                            transition={{ duration: 2, repeat: Infinity }}
                                            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: conf.color, boxShadow: `0 0 10px ${conf.color}` }} 
                                        />
                                    )}

                                    {/* 1. Customer & Status */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{job.customerName}</span>
                                        </div>
                                        <span style={{ 
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '4px 10px', borderRadius: 20, 
                                            background: conf.bg, color: conf.color, 
                                            fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                                            boxShadow: conf.shadow
                                        }}>
                                            {conf.icon} {conf.label}
                                        </span>
                                    </div>

                                    {/* 2. Vehicle & Service */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <Car size={14} color="var(--text-dim)" />
                                            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{job.vehicleInfo || 'Awaiting Vehicle Details'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Wrench size={14} color="var(--text-dim)" />
                                            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>{job.serviceName}</span>
                                        </div>
                                    </div>

                                    {/* 3. Time Details */}
                                    <div>
                                        <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Ingress Time</p>
                                        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'var(--text-muted)' }}>{job.time || 'Schedule Pending'}</p>
                                    </div>

                                    {/* 4. Action */}
                                    <div style={{ display: 'flex', justifySelf: 'end' }}>
                                        {!isActive ? (
                                            job.status === 'received' ? (
                                                <motion.button 
                                                    whileHover={btnHover} whileTap={btnTap} 
                                                    onClick={() => handleStartJob(job)}
                                                    style={{ 
                                                        background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)',
                                                        padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'
                                                    }}>
                                                    <Play size={14} /> Start Workflow
                                                </motion.button>
                                            ) : (
                                                <div style={{
                                                    background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)',
                                                    padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'not-allowed'
                                                }}>
                                                    {job.status === 'assigned' ? 'Awaiting Check-in' : 'Not Ready'}
                                                </div>
                                            )
                                        ) : (
                                            <motion.button 
                                                whileHover={btnHover} whileTap={btnTap} 
                                                onClick={() => handleStartJob(job)}
                                                style={{ 
                                                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none', color: '#fff',
                                                    padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)'
                                                }}>
                                                <Play size={14} /> Continue Job
                                            </motion.button>
                                        )}
                                    </div>

                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
