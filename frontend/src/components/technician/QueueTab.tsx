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
            return { color: '#6d28d9', bg: 'rgba(109, 40, 217, 0.08)', shadow: 'none', label: 'Assigned', icon: <Wrench size={12} /> };
        case 'in_progress':
            return { color: '#2563eb', bg: 'rgba(37, 99, 235, 0.10)', shadow: 'none', label: 'In Progress', icon: <Activity size={12} /> };
        case 'received':
            return { color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)', shadow: 'none', label: 'Checked In', icon: <Car size={12} /> };
        case 'completed':
            return { color: '#166534', bg: 'rgba(34, 197, 94, 0.12)', shadow: 'none', label: 'QC Complete', icon: <ShieldCheck size={12} /> };
        case 'paid':
            return { color: '#a16207', bg: 'rgba(234, 179, 8, 0.10)', shadow: 'none', label: 'Paid', icon: <CheckCircle size={12} /> };
        case 'released':
            return { color: '#166534', bg: 'rgba(16, 185, 129, 0.10)', shadow: 'none', label: 'Released', icon: <CheckCircle size={12} /> };
        case 'pending':
        case 'confirmed':
        default:
            return { color: '#c2410c', bg: 'rgba(249, 115, 22, 0.08)', shadow: 'none', label: 'Pending / Queued', icon: <Clock size={12} /> };
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
                    { label: 'Pending Jobs', value: pendingCount, icon: <Clock color="#c2410c" />, border: '#f97316' },
                    { label: 'In Progress', value: progressCount, icon: <Activity color="#2563eb" />, border: '#3b82f6' },
                    { label: 'Ready / Finishing', value: readyCount, icon: <CheckCircle color="#166534" />, border: '#22c55e' },
                    { label: 'Total Active Queue', value: finalPendingJobs.length, icon: <ClipboardList color="#74777d" />, border: '#9fa3a9' }
                ].map((metric, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                        style={{ 
                            padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                            borderLeft: `4px solid ${metric.border}`,
                            background: '#ffffff', borderRadius: 12, boxShadow: '0 2px 8px rgba(6,39,75,0.04)'
                        }}>
                        <div>
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#74777d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>{metric.label}</p>
                            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: '2rem', fontWeight: 800, color: '#191c1e' }}>{metric.value}</p>
                        </div>
                        <div style={{ padding: 12, background: 'rgba(6,39,75,0.04)', borderRadius: 12 }}>
                            {metric.icon}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main Queue List */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 8px' }}>
                    <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 700, color: '#191c1e', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Wrench style={{ color: '#06274b', width: 18, height: 18 }} /> 
                        Operational Queue
                    </h3>
                </div>

                {finalPendingJobs.length === 0 ? (
                    <div style={{ padding: 64, textAlign: 'center', background: '#ffffff', borderRadius: 12, boxShadow: '0 2px 8px rgba(6,39,75,0.04)' }}>
                        <ShieldCheck style={{ width: 48, height: 48, color: '#166534', margin: '0 auto 16px', opacity: 0.8 }} />
                        <h4 style={{ fontFamily: "'Manrope', sans-serif", color: '#191c1e', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Queue is fully cleared</h4>
                        <p style={{ fontFamily: "'Inter', sans-serif", color: '#74777d', fontSize: 14 }}>All assigned vehicles have been processed. Great job!</p>
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
                                    whileHover={{ scale: 1.005 }}
                                    style={{ 
                                        position: 'relative',
                                        background: '#ffffff',
                                        border: 'none',
                                        borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                                        borderRadius: 12,
                                        padding: '20px 24px',
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr) minmax(150px, 1fr) auto',
                                        gap: 20,
                                        alignItems: 'center',
                                        boxShadow: '0 2px 8px rgba(6,39,75,0.04)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    {/* Active Highlight Bar — handled by borderLeft now */}

                                    {/* 1. Customer & Status */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                            {job.customerAvatar ? (
                                                <img 
                                                    src={job.customerAvatar} 
                                                    alt={job.customerName || 'Customer'}
                                                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%',
                                                    background: '#e0e7ee',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#06274b',
                                                    flexShrink: 0
                                                }}>
                                                    {(job.customerName || 'U').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 700, color: '#191c1e' }}>{job.customerName}</span>
                                        </div>
                                        <span style={{ 
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '4px 12px', borderRadius: 9999, 
                                            background: conf.bg, color: conf.color, 
                                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                                            border: 'none'
                                        }}>
                                            {conf.icon} {conf.label}
                                        </span>
                                    </div>

                                    {/* 2. Vehicle & Service */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <Car size={14} color="#9fa3a9" />
                                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#74777d' }}>{job.vehicleInfo || 'Awaiting Vehicle Details'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Wrench size={14} color="#9fa3a9" />
                                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: '#06274b' }}>{job.serviceName}</span>
                                        </div>
                                    </div>

                                    {/* 3. Time Details */}
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#9fa3a9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 700 }}>Ingress Time</p>
                                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#43474c', fontWeight: 500 }}>{job.time || 'Schedule Pending'}</p>
                                    </div>

                                    {/* 4. Action */}
                                    <div style={{ display: 'flex', justifySelf: 'end' }}>
                                        {!isActive ? (
                                            job.status === 'received' ? (
                                                <motion.button 
                                                    whileHover={btnHover} whileTap={btnTap} 
                                                    onClick={() => handleStartJob(job)}
                                                    style={{ 
                                                        background: 'transparent', border: '1.5px solid #06274b', color: '#06274b',
                                                        padding: '10px 20px', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'
                                                    }}>
                                                    <Play size={14} /> Start Workflow
                                                </motion.button>
                                            ) : (
                                                <div style={{
                                                    background: '#f2f4f6', border: 'none', color: '#74777d',
                                                    padding: '10px 20px', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
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
                                                    padding: '10px 20px', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
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
