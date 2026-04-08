import { motion } from 'framer-motion';
import { Gauge, CheckCircle, Zap } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { btnHover, btnTap, staggerContainer, staggerItem } from './SharedAnimations';
import type { Booking } from '@/types';

interface CommandCenterProps {
    activeJob: Booking;
    elapsedTime: number;
    isChecklistComplete: boolean;
    isCompleting: boolean;
    handleCompleteJob: (job: Booking) => void;
    handleForceReady: (job: Booking) => void;
    handleToggleChecklist: (job: Booking, idx: number) => void;
    handleToggleOperationsChecklist: (job: Booking, phase: 'ingress' | 'egress', idx: number) => void;
}

const formatElapsedTimeJSX = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        <>
            {pad(hours)}<span className="timer-colon">:</span>{pad(minutes)}<span className="timer-colon">:</span>{pad(secs)}
        </>
    );
};

export function CommandCenter({
    activeJob,
    elapsedTime,
    isChecklistComplete,
    isCompleting,
    handleCompleteJob,
    handleForceReady,
    handleToggleChecklist,
    handleToggleOperationsChecklist
}: CommandCenterProps) {
    return (
        <motion.div className="command-center" style={{ marginBottom: 24 }} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.2 }}>
            <div className="command-center-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                        <Gauge style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                    </motion.div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.3 }}>ACTIVE JOB — COMMAND CENTER</span>
                </div>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                    {formatElapsedTimeJSX(elapsedTime)}
                </span>
            </div>
            <div className="command-center-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginBottom: 20 }}>
                    <div>
                        <p style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Customer</p>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{activeJob.customerName}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Vehicle</p>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{activeJob.vehicleInfo || 'N/A'}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Service</p>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)' }}>{activeJob.serviceName}</p>
                    </div>
                </div>
                {/* Ingress Checklist */}
                {activeJob.operationsChecklist?.ingress && activeJob.operationsChecklist.ingress.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Ingress Operations</h4>
                        <div className="progress-track" style={{ marginBottom: 12 }}>
                            <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${(activeJob.operationsChecklist.ingress.filter(s => s.completed).length / activeJob.operationsChecklist.ingress.length) * 100}%` }} transition={{ duration: 0.8 }} />
                        </div>
                        <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                            {activeJob.operationsChecklist.ingress.map((step, idx) => (
                                <motion.div key={`ing-${idx}`} variants={staggerItem} className={`checklist-item${step.completed ? ' checked' : ''}`} onClick={() => handleToggleOperationsChecklist(activeJob, 'ingress', idx)} whileHover={{ x: 4 }} whileTap={{ scale: 0.97 }}>
                                    <Checkbox checked={step.completed} className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500" />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                                        <span className="checklist-label" style={{ textDecoration: step.completed ? 'line-through' : 'none' }}>{step.name}</span>
                                        {step.isMustExplain && <span title="MUST BE EXPLAINED 1 BY 1" style={{ fontSize: 13, cursor: 'help' }}>⚠️</span>}
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                )}

                {/* Service Steps Checklist */}
                {activeJob.serviceSteps && activeJob.serviceSteps.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Service Steps</h4>
                        <div className="progress-track" style={{ marginBottom: 12 }}>
                            <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${(activeJob.serviceSteps.filter(s => s.status === 'completed').length / activeJob.serviceSteps.length) * 100}%` }} transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }} />
                        </div>
                        <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                            {activeJob.serviceSteps.map((step, idx) => (
                                <motion.div key={`srv-${idx}`} variants={staggerItem} className={`checklist-item${step.status === 'completed' ? ' checked' : ''}`} onClick={() => handleToggleChecklist(activeJob, idx)} whileHover={{ x: 4 }} whileTap={{ scale: 0.97 }}>
                                    <Checkbox checked={step.status === 'completed'} className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500" />
                                    <span className="checklist-label" style={{ textDecoration: step.status === 'completed' ? 'line-through' : 'none' }}>{step.name}</span>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                )}

                {/* Egress Checklist */}
                {activeJob.operationsChecklist?.egress && activeJob.operationsChecklist.egress.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Egress Operations</h4>
                        <div className="progress-track" style={{ marginBottom: 12 }}>
                            <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${(activeJob.operationsChecklist.egress.filter(s => s.completed).length / activeJob.operationsChecklist.egress.length) * 100}%` }} transition={{ duration: 0.8 }} />
                        </div>
                        <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                            {activeJob.operationsChecklist.egress.map((step, idx) => (
                                <motion.div key={`eg-${idx}`} variants={staggerItem} className={`checklist-item${step.completed ? ' checked' : ''}`} onClick={() => handleToggleOperationsChecklist(activeJob, 'egress', idx)} whileHover={{ x: 4 }} whileTap={{ scale: 0.97 }}>
                                    <Checkbox checked={step.completed} className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500" />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                                        <span className="checklist-label" style={{ textDecoration: step.completed ? 'line-through' : 'none' }}>{step.name}</span>
                                        {step.isMustExplain && <span title="MUST BE EXPLAINED 1 BY 1" style={{ fontSize: 13, cursor: 'help' }}>⚠️</span>}
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                )}
                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <motion.button whileHover={btnHover} whileTap={btnTap} disabled={isCompleting || !isChecklistComplete} className="btn-premium success" style={{ flex: 1, justifyContent: 'center', height: 44, opacity: isChecklistComplete ? 1 : 0.4 }} onClick={() => handleCompleteJob(activeJob)}>
                        <CheckCircle style={{ width: 16, height: 16 }} /> {isCompleting ? 'Completing...' : 'Complete Job'}
                    </motion.button>
                    <motion.button whileHover={btnHover} whileTap={btnTap} className="btn-premium" style={{ height: 44 }} onClick={() => handleForceReady(activeJob)}>
                        <Zap style={{ width: 14, height: 14 }} /> Force Ready
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
}
