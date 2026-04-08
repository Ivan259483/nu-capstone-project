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
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <Activity className="w-8 h-8 opacity-50" />
                </div>
                <h3 className="text-xl font-bold mb-2">No Active Progress Reports</h3>
                <p className="text-sm opacity-60">You do not have any jobs currently in progress to report on.</p>
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

    return (
        <motion.div key="progress" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto space-y-6">
            
            <motion.div className="glass-panel" style={{ background: 'linear-gradient(135deg, rgba(30,30,35,0.7) 0%, rgba(20,20,24,0.9) 100%)' }}>
                <div className="glass-panel-header border-b border-[var(--border)] pb-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 m-0">
                        <Activity className="text-[var(--accent)]" /> Progress Workflow
                    </h2>
                    <span className="text-xs uppercase tracking-widest px-3 py-1 bg-[var(--accent)] text-black font-bold rounded-full">
                        {activeJob.vehicleInfo || 'Vehicle'}
                    </span>
                </div>
                <div className="glass-panel-body p-6">
                    <div className="relative">
                        <div className="absolute top-1/2 left-0 w-full h-1 bg-[var(--bg-canvas)] -translate-y-1/2 rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${(currentPhaseIndex / (REPORT_STATUSES.length - 1)) * 100}%` }} />
                        </div>
                        <div className="relative flex justify-between">
                            {REPORT_STATUSES.map((status, idx) => {
                                const isActive = idx === currentPhaseIndex;
                                const isPast = idx <= currentPhaseIndex;
                                return (
                                    <div key={status} className="flex flex-col items-center group cursor-pointer w-12 pt-8">
                                        <div className={`absolute top-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 -mt-3
                                            ${isActive ? 'bg-[var(--accent)] border-[var(--accent)] shadow-[0_0_15px_var(--accent)] scale-125' : 
                                              isPast ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--bg-card)] border-[var(--border)]'}`}
                                        >
                                            {isPast && !isActive && <Check size={12} className="text-black font-bold" />}
                                            {isActive && <div className="w-2 h-2 bg-black rounded-full" />}
                                        </div>
                                        <span className={`text-[10px] uppercase font-bold text-center tracking-wider transition-colors duration-300 w-24 absolute top-6
                                            ${isActive ? 'text-[var(--accent)]' : isPast ? 'text-white opacity-80' : 'text-white opacity-40'}`}>
                                            {status}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 pt-8">
                
                {/* Ingress Checklist */}
                <motion.div variants={staggerItem} className="glass-panel">
                    <div className="glass-panel-header">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--accent)]">
                            <CheckCircle size={16} /> Prep & Ingress
                        </h3>
                    </div>
                    <div className="glass-panel-body">
                        {ingressChecklist.length === 0 ? (
                            <p className="text-sm opacity-50 py-4 text-center">No ingress items.</p>
                        ) : (
                            <div className="space-y-2">
                                {ingressChecklist.map((item, idx) => (
                                    <div 
                                        key={`in-${idx}`}
                                        className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between
                                            ${item.completed ? 'bg-[var(--accent-glow)] border-[var(--accent)]' : 'bg-[var(--bg-canvas)] border-[var(--border)] hover:border-gray-500'}`}
                                        onClick={() => handleToggleOperationsChecklist(activeJob, 'ingress', idx)}
                                    >
                                        <span className={`text-sm ${item.completed ? 'text-white' : 'opacity-70'}`}>{item.name}</span>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors
                                            ${item.completed ? 'bg-[var(--accent)] border-transparent' : 'border-gray-500'}`}>
                                            {item.completed && <Check size={12} className="text-black" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Service Steps */}
                <motion.div variants={staggerItem} className="glass-panel">
                    <div className="glass-panel-header">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--accent)]">
                            <Activity size={16} /> Service Stages
                        </h3>
                    </div>
                    <div className="glass-panel-body">
                        {steps.length === 0 ? (
                            <p className="text-sm opacity-50 py-4 text-center">No service stages defined.</p>
                        ) : (
                            <div className="space-y-2">
                                {steps.map((step, idx) => {
                                    const isCompleted = step.status === 'completed';
                                    return (
                                        <div 
                                            key={`ss-${idx}`}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between
                                                ${isCompleted ? 'bg-[var(--accent-glow)] border-[var(--accent)]' : 'bg-[var(--bg-canvas)] border-[var(--border)] hover:border-gray-500'}`}
                                            onClick={() => handleToggleChecklist(activeJob, idx)}
                                        >
                                            <span className={`text-sm ${isCompleted ? 'text-white' : 'opacity-70'}`}>{step.name}</span>
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors
                                                ${isCompleted ? 'bg-[var(--accent)] border-transparent' : 'border-gray-500'}`}>
                                                {isCompleted && <Check size={12} className="text-black" />}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Egress Checklist */}
                <motion.div variants={staggerItem} className="glass-panel">
                    <div className="glass-panel-header">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--accent)]">
                            <CheckCircle size={16} /> QC & Egress
                        </h3>
                    </div>
                    <div className="glass-panel-body">
                        {egressChecklist.length === 0 ? (
                            <p className="text-sm opacity-50 py-4 text-center">No egress items.</p>
                        ) : (
                            <div className="space-y-2">
                                {egressChecklist.map((item, idx) => (
                                    <div 
                                        key={`eg-${idx}`}
                                        className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between
                                            ${item.completed ? 'bg-[var(--accent-glow)] border-[var(--accent)]' : 'bg-[var(--bg-canvas)] border-[var(--border)] hover:border-gray-500'}`}
                                        onClick={() => handleToggleOperationsChecklist(activeJob, 'egress', idx)}
                                    >
                                        <span className={`text-sm ${item.completed ? 'text-white' : 'opacity-70'}`}>{item.name}</span>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors
                                            ${item.completed ? 'bg-[var(--accent)] border-transparent' : 'border-gray-500'}`}>
                                            {item.completed && <Check size={12} className="text-black" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Completion Submission */}
                <motion.div variants={staggerItem} className="glass-panel flex flex-col justify-end">
                    <div className="glass-panel-header">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--accent)]">
                            <CheckCircle size={16} /> Sign Off
                        </h3>
                    </div>
                    <div className="glass-panel-body flex-1 flex flex-col">
                        <p className="text-sm opacity-70 mb-6">All stages and checklists must be completed before you can sign off and finalize this job.</p>
                        
                        <div className="mt-auto">
                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}>
                                <Button 
                                    className="w-full h-14 text-base font-bold text-black uppercase tracking-widest relative overflow-hidden group"
                                    style={{ background: isChecklistComplete ? 'var(--accent)' : 'var(--bg-canvas)' }}
                                    onClick={() => isChecklistComplete && handleCompleteJob(activeJob)}
                                    disabled={!isChecklistComplete || isCompleting}
                                >
                                    {isCompleting ? (
                                        <span className="flex items-center gap-2">Finalizing<span className="loading-dots">...</span></span>
                                    ) : (
                                        <span className="flex items-center gap-2 relative z-10">
                                            {isChecklistComplete ? 'Sign Off & Complete' : 'Incomplete Workflow'} 
                                            {isChecklistComplete && <ChevronRight size={18} />}
                                        </span>
                                    )}
                                    {isChecklistComplete && <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />}
                                </Button>
                            </motion.div>
                        </div>
                    </div>
                </motion.div>

            </motion.div>
        </motion.div>
    );
}
