import { motion } from 'framer-motion';
import { CheckCircle, Activity, ChevronRight, Check } from 'lucide-react';
import { pageVariants, staggerContainer, staggerItem, btnHover, btnTap } from './SharedAnimations';
import type { Booking } from '@/types';
import { Button } from '@/components/ui/button';

interface ProgressReportsTabProps {
    activeJob?: Booking;
    handleStartJob: (job: Booking) => void;
    handleCompleteJob: (job: Booking) => void;
    handleForceReady: (job: Booking) => void;
    handleToggleChecklist: (job: Booking, idx: number) => void;
    handleToggleOperationsChecklist: (job: Booking, phase: 'ingress' | 'egress', idx: number) => void;
    isChecklistComplete: boolean;
    isCompleting: boolean;
}

const REPORT_STATUSES = [
    'Pending',
    'Accepted',
    'In Progress',
    'Washing',
    'Paint Correction',
    'Ceramic Coating',
    'Final Inspection',
    'Completed'
];

export function ProgressReportsTab({
    activeJob,
    handleStartJob,
    handleCompleteJob,
    handleToggleChecklist,
    handleToggleOperationsChecklist,
    isChecklistComplete,
    isCompleting
}: ProgressReportsTabProps) {

    if (!activeJob) {
        return (
            <motion.div key="progress-empty" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto flex flex-col items-center justify-center p-12 text-center h-[50vh]">
                <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, background: '#f2f4f6', border: 'none' }}>
                    <Activity style={{ width: 32, height: 32, color: '#74777d', opacity: 0.5 }} />
                </div>
                <h3 style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: 20, color: '#191c1e', margin: '0 0 8px' }}>No Active Progress Reports</h3>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#74777d' }}>You do not have any jobs currently in progress to report on.</p>
            </motion.div>
        );
    }

    const { serviceSteps, operationsChecklist } = activeJob;
    const ingressChecklist = operationsChecklist?.ingress || [];
    const egressChecklist = operationsChecklist?.egress || [];
    const steps = serviceSteps || [];

    // Map existing system status to our custom workflow status
    let currentPhaseIndex = 2; // Default to 'In Progress' for active jobs
    if (activeJob.status === 'completed') currentPhaseIndex = 7;
    else if (activeJob.customerStatus === 'ready') currentPhaseIndex = 6;
    else if (activeJob.customerStatus === 'washing') currentPhaseIndex = 3;
    else if (activeJob.customerStatus === 'detailing') currentPhaseIndex = 4;

    const renderChecklistPanel = (
        title: string,
        icon: React.ReactNode,
        items: { name: string; completed: boolean }[],
        onToggle: (idx: number) => void,
        emptyText: string
    ) => (
        <motion.div variants={staggerItem} style={{ background: '#ffffff', borderRadius: 12, boxShadow: '0 2px 8px rgba(6,39,75,0.05)', border: 'none', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#06274b', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    {icon} {title}
                </h3>
            </div>
            <div style={{ padding: 16 }}>
                {items.length === 0 ? (
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#74777d', textAlign: 'center', padding: '16px 0' }}>{emptyText}</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {items.map((item, idx) => (
                            <div
                                key={idx}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    ...(item.completed
                                        ? { background: 'rgba(6,39,75,0.06)', borderLeft: '3px solid #06274b', border: 'none', borderLeftStyle: 'solid' as const, borderLeftWidth: 3, borderLeftColor: '#06274b' }
                                        : { background: '#f7f9fb', border: 'none' })
                                }}
                                onClick={() => onToggle(idx)}
                            >
                                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: item.completed ? '#191c1e' : '#43474c' }}>{item.name}</span>
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    ...(item.completed
                                        ? { background: '#06274b', border: '2px solid #06274b' }
                                        : { background: 'transparent', border: '2px solid #c4c6cd' })
                                }}>
                                    {item.completed && <Check size={12} style={{ color: '#ffffff' }} />}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );

    return (
        <motion.div key="progress" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto space-y-6">
            
            {/* Progress Workflow Hero */}
            <motion.div style={{ background: '#ffffff', borderRadius: 14, boxShadow: '0 2px 12px rgba(6,39,75,0.06)', border: 'none', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                    <h2 style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 800, fontSize: 20, color: '#06274b', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                        <Activity style={{ width: 20, height: 20, color: '#06274b' }} /> Progress Workflow
                    </h2>
                    <span style={{ background: 'rgba(6,39,75,0.08)', color: '#06274b', borderRadius: 9999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 12px', fontFamily: "'Inter', sans-serif" }}>
                        {activeJob.vehicleInfo || 'Vehicle'}
                    </span>
                </div>
                <div style={{ padding: '32px 24px' }}>
                    <div style={{ position: 'relative' }}>
                        {/* Track */}
                        <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: 4, background: '#eceef0', transform: 'translateY(-50%)', borderRadius: 9999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: 'linear-gradient(90deg, #06274b, #213d62)', transition: 'width 0.5s ease', width: `${(currentPhaseIndex / (REPORT_STATUSES.length - 1)) * 100}%` }} />
                        </div>
                        {/* Steps */}
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
                            {REPORT_STATUSES.map((status, idx) => {
                                const isActive = idx === currentPhaseIndex;
                                const isPast = idx <= currentPhaseIndex;
                                return (
                                    <div key={status} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', width: 48, paddingTop: 32 }}>
                                        <div style={{
                                            position: 'absolute', top: 0, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: '2px solid', marginTop: -12, transition: 'all 0.3s ease',
                                            ...(isActive
                                                ? { background: '#06274b', borderColor: '#06274b', boxShadow: '0 0 0 4px rgba(6,39,75,0.15)', transform: 'scale(1.25)' }
                                                : isPast
                                                    ? { background: '#06274b', borderColor: '#06274b' }
                                                    : { background: '#f7f9fb', borderColor: '#c4c6cd' })
                                        }}>
                                            {isPast && !isActive && <Check size={12} style={{ color: '#ffffff', fontWeight: 'bold' }} />}
                                            {isActive && <div style={{ width: 8, height: 8, background: '#ffffff', borderRadius: '50%' }} />}
                                        </div>
                                        <span style={{
                                            fontFamily: "'Inter', sans-serif", fontSize: 10, textTransform: 'uppercase', fontWeight: 700, textAlign: 'center',
                                            letterSpacing: '0.06em', width: 96, position: 'absolute', top: 24, transition: 'color 0.3s ease',
                                            ...(isActive ? { color: '#06274b' } : isPast ? { color: '#43474c', opacity: 0.8 } : { color: '#74777d', opacity: 0.5 })
                                        }}>
                                            {status}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Checklist Grid */}
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 pt-8">
                
                {renderChecklistPanel('Pre-Assessment & Ingress', <CheckCircle size={14} style={{ color: '#06274b' }} />, ingressChecklist, (idx) => handleToggleOperationsChecklist(activeJob, 'ingress', idx), 'No ingress items.')}
                
                {renderChecklistPanel('Service Stages', <Activity size={14} style={{ color: '#06274b' }} />, steps.map(s => ({ name: s.name, completed: s.status === 'completed' })), (idx) => handleToggleChecklist(activeJob, idx), 'No service stages defined.')}
                
                {renderChecklistPanel('QC & Egress', <CheckCircle size={14} style={{ color: '#06274b' }} />, egressChecklist, (idx) => handleToggleOperationsChecklist(activeJob, 'egress', idx), 'No egress items.')}

                {/* Sign Off Panel */}
                <motion.div variants={staggerItem} style={{ background: '#ffffff', borderRadius: 12, boxShadow: '0 2px 8px rgba(6,39,75,0.05)', border: 'none', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                        <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#06274b', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                            <CheckCircle size={14} style={{ color: '#06274b' }} /> Sign Off
                        </h3>
                    </div>
                    <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#74777d', marginBottom: 24 }}>All stages and checklists must be completed before you can sign off and finalize this job.</p>
                        
                        <div style={{ marginTop: 'auto' }}>
                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}>
                                <Button 
                                    style={{ 
                                        width: '100%', height: 56, fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                                        fontFamily: "'Manrope', sans-serif", borderRadius: 10, border: 'none', cursor: isChecklistComplete ? 'pointer' : 'not-allowed',
                                        position: 'relative', overflow: 'hidden',
                                        ...(isChecklistComplete 
                                            ? { background: 'linear-gradient(135deg, #06274b, #213d62)', color: '#ffffff' }
                                            : { background: '#eceef0', color: '#74777d' })
                                    }}
                                    onClick={() => isChecklistComplete && handleCompleteJob(activeJob)}
                                    disabled={!isChecklistComplete || isCompleting}
                                >
                                    {isCompleting ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Finalizing<span className="loading-dots">...</span></span>
                                    ) : (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 10 }}>
                                            {isChecklistComplete ? 'Sign Off & Complete' : 'Incomplete Workflow'} 
                                            {isChecklistComplete && <ChevronRight size={18} />}
                                        </span>
                                    )}
                                    {isChecklistComplete && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.15)', transform: 'translateY(100%)', transition: 'transform 0.3s ease-out' }} className="group-hover:translate-y-0" />}
                                </Button>
                            </motion.div>
                        </div>
                    </div>
                </motion.div>

            </motion.div>
        </motion.div>
    );
}
