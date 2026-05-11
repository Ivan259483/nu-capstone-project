import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap, CheckCircle, ClipboardList, AlertTriangle, Clock, Play, Package, Camera,
    Car, ShieldCheck, Pause, ChevronRight, Upload, Info, FileText, Plus, Wrench, Activity
} from 'lucide-react';
import { btnHover, btnTap, pageVariants, staggerContainer, staggerItem } from './SharedAnimations';
import { Checkbox } from '@/components/ui/checkbox';
import { OrderService } from '@/lib/order-service';
import { toast } from 'sonner';
import type { Booking, InventoryItem, InventoryUsage } from '@/types';

interface DashboardTabProps {
    safeJobs: Booking[];
    activeJob?: Booking;
    finalPendingJobs: Booking[];
    completedToday: number;
    hoursLogged: number;
    inventory: InventoryItem[];
    inventoryThreshold?: number;
    inventoryUsage?: InventoryUsage[];
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

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

const formatElapsedHM = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}`;
};

const getJobId = (job: Booking) => (job.id || (job as any)._id) as string;

export function DashboardTab({
    safeJobs,
    activeJob,
    finalPendingJobs,
    completedToday,
    hoursLogged,
    inventory,
    inventoryThreshold,
    inventoryUsage,
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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadPhase, setUploadPhase] = useState<'before' | 'after' | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showChecklist, setShowChecklist] = useState(false);

    const nonCompletedJobs = safeJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
    const lowStockItems = inventory.filter(i => i.stock <= (inventoryThreshold ?? i.minLevel));

    // Photo upload handler
    const triggerUpload = (phase: 'before' | 'after') => {
        setUploadPhase(phase);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadPhase || !activeJob) return;
        e.target.value = '';
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64Data = reader.result as string;
            setIsUploading(true);
            toast.loading(`Uploading ${uploadPhase} photo...`, { id: 'upload' });
            try {
                const jobId = getJobId(activeJob);
                const res = await OrderService.addPhoto(jobId, uploadPhase, base64Data);
                if (res.success) {
                    toast.success('Photo uploaded!', { id: 'upload' });
                } else {
                    toast.error(res.message || 'Upload failed', { id: 'upload' });
                }
            } catch (err) {
                toast.error('Network error', { id: 'upload' });
            } finally {
                setIsUploading(false);
                setUploadPhase(null);
            }
        };
        reader.readAsDataURL(file);
    };

    const beforePhotos = activeJob?.photos?.before || [];
    const afterPhotos = activeJob?.photos?.after || [];
    const allPhotos = [...beforePhotos, ...afterPhotos];

    // Checklist stats
    const serviceSteps = activeJob?.serviceSteps || [];
    const ingressSteps = activeJob?.operationsChecklist?.ingress || [];
    const egressSteps = activeJob?.operationsChecklist?.egress || [];
    const totalSteps = serviceSteps.length + ingressSteps.length + egressSteps.length;
    const completedSteps = serviceSteps.filter(s => s.status === 'completed').length +
        ingressSteps.filter(s => s.completed).length +
        egressSteps.filter(s => s.completed).length;

    const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
    const startedAt = (activeJob as any)?.startedAt ? new Date((activeJob as any).startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

    // Used inventory for active job
    const jobUsage = (inventoryUsage || []).filter(u => u.jobId === getJobId(activeJob || {} as Booking));
    const usedItems = jobUsage.map(u => {
        const item = inventory.find(i => i.id === u.itemId);
        return { ...u, name: item?.name || u.itemId, unit: item?.unit || 'unit', sku: (item as any)?.sku || '' };
    });

    /* ═══ IF NO ACTIVE JOB — SHOW TODAY'S QUEUE ═══ */
    if (!activeJob) {
        return (
            <motion.div key="dashboard-queue" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                {/* Hero Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40 }}>
                    <div>
                        <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '2.5rem', fontWeight: 800, color: '#06274b', margin: 0, letterSpacing: '-0.5px' }}>
                            {getGreeting()}, {userName || 'there'}.
                        </h1>
                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: '#515f74', fontWeight: 500, margin: '4px 0 0' }}>
                            You have {finalPendingJobs.length} detailing appointment{finalPendingJobs.length !== 1 ? 's' : ''} scheduled for today.
                        </p>
                    </div>
                </div>

                {/* Bento Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24, marginBottom: 32 }}>
                    {/* KPI Widgets */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                        {/* Cars Completed */}
                        <div style={{
                            background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'
                        }}>
                            <div style={{ position: 'relative', width: 96, height: 96, marginBottom: 16 }}>
                                <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                                    <circle cx="48" cy="48" r="40" fill="transparent" stroke="#e0e3e5" strokeWidth="8" />
                                    <circle cx="48" cy="48" r="40" fill="transparent" stroke="#06274b" strokeWidth="8"
                                        strokeDasharray="251.2"
                                        strokeDashoffset={251.2 - (251.2 * (finalPendingJobs.length > 0 ? completedToday / (completedToday + finalPendingJobs.length) : 1))}
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 800 }}>
                                    {finalPendingJobs.length > 0 ? Math.round((completedToday / (completedToday + finalPendingJobs.length)) * 100) : 100}%
                                </span>
                            </div>
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, color: '#515f74', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Cars Completed</p>
                            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: '#06274b' }}>
                                {completedToday} / {completedToday + finalPendingJobs.length}
                            </p>
                        </div>
                        {/* Low Stock */}
                        <div style={{
                            background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'
                        }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%', background: '#213d62',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                                color: '#8ea8d3'
                            }}>
                                <Package style={{ width: 28, height: 28 }} />
                            </div>
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, color: '#515f74', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Supplies Status</p>
                            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: '#06274b' }}>
                                {lowStockItems.length > 0 ? `${lowStockItems.length} Low` : 'All Good'}
                            </p>
                        </div>
                    </div>

                    {/* Today's Appointment Queue */}
                    <div style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 800, color: '#06274b', margin: 0 }}>Today's Appointment Queue</h2>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {nonCompletedJobs.length === 0 ? (
                                <div style={{ padding: 48, textAlign: 'center' }}>
                                    <ShieldCheck style={{ width: 40, height: 40, color: '#166534', margin: '0 auto 12px', opacity: 0.6 }} />
                                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 700, color: '#191c1e', marginBottom: 4 }}>Queue is clear</p>
                                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#74777d' }}>No appointments scheduled. Enjoy the moment!</p>
                                </div>
                            ) : (
                                nonCompletedJobs.slice(0, 5).map((job, idx) => {
                                    const isActive = job.status === 'in_progress';
                                    const isDone = job.status === 'completed';
                                    return (
                                        <motion.div key={getJobId(job) || idx} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.06 }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 20, padding: 16, borderRadius: 12,
                                                background: isActive ? '#fff' : '#f2f4f6',
                                                border: isActive ? '2px solid rgba(6,39,75,0.1)' : 'none',
                                                boxShadow: isActive ? '0 4px 16px rgba(6,39,75,0.06)' : 'none',
                                                position: 'relative', overflow: 'hidden', transition: 'all 0.15s ease'
                                            }}>
                                            {isActive && <div style={{ position: 'absolute', left: 0, top: 0, width: 3, height: '100%', background: '#06274b' }} />}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 56 }}>
                                                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: isActive ? '#06274b' : '#515f74' }}>
                                                    {job.time || '—'}
                                                </span>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 700, color: '#06274b', margin: 0 }}>
                                                    {job.serviceName || 'Service'}
                                                </h3>
                                                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#515f74', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Car style={{ width: 13, height: 13 }} /> {job.vehicleInfo || 'Vehicle'} - {job.customerName}
                                                </p>
                                            </div>
                                            <span style={{
                                                padding: '4px 12px', borderRadius: 9999,
                                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                                                background: isDone ? 'rgba(34,197,94,0.12)' : isActive ? '#dae2fd' : '#eceef0',
                                                color: isDone ? '#166534' : isActive ? '#06274b' : '#515f74'
                                            }}>
                                                {isDone ? 'DONE' : isActive ? 'IN-PROGRESS' : 'QUEUED'}
                                            </span>
                                            {job.status === 'received' && (
                                                <motion.button whileHover={btnHover} whileTap={btnTap} onClick={() => handleStartJob(job)}
                                                    style={{
                                                        padding: '8px 16px', background: '#06274b', color: '#fff', border: 'none',
                                                        borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                                                    }}>
                                                    <Play style={{ width: 12, height: 12 }} /> Start
                                                </motion.button>
                                            )}
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Detailing Feed + Low Stock */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    {/* Detailing Feed — LIVE */}
                    <div style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 800, color: '#06274b', margin: 0 }}>Detailing Feed</h2>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px rgba(34,197,94,0.5)', animation: 'pulse 2s infinite' }} />
                                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live</span>
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 260, overflowY: 'auto' }}>
                            {/* Active job feed item */}
                            {activeJob && (
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                        <Wrench style={{ width: 14, height: 14 }} />
                                    </div>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: '#06274b', margin: 0 }}>Job In Progress</p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#43474c', margin: '2px 0', lineHeight: 1.5 }}>
                                            {activeJob.serviceName || 'Service'} for {activeJob.customerName || 'customer'} — Timer running ({formatElapsedHM(elapsedTime)})
                                        </p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#3b82f6', fontWeight: 600, marginTop: 2 }}>Active Now</p>
                                    </div>
                                </div>
                            )}

                            {/* Low stock alerts */}
                            {lowStockItems.length > 0 && (
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#ffdad6', color: '#ba1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                        <AlertTriangle style={{ width: 14, height: 14 }} />
                                    </div>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: '#ba1a1a', margin: 0 }}>Low Stock Alert</p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#43474c', margin: '2px 0', lineHeight: 1.5 }}>
                                            {lowStockItems.slice(0, 3).map(i => i.name).join(', ')} — restock needed.
                                        </p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#ba1a1a', fontWeight: 600, marginTop: 2 }}>Urgent</p>
                                    </div>
                                </div>
                            )}

                            {/* Upcoming queue items */}
                            {finalPendingJobs.slice(0, 3).map((job, i) => (
                                <div key={getJobId(job) || i} style={{ display: 'flex', gap: 12 }}>
                                    {job.customerAvatar ? (
                                        <img src={job.customerAvatar} alt="Customer" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 2 }} />
                                    ) : (
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(6,39,75,0.06)', color: '#06274b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                            <Clock style={{ width: 14, height: 14 }} />
                                        </div>
                                    )}
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: '#06274b', margin: 0 }}>Queued — {job.customerName || 'Customer'}</p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#43474c', margin: '2px 0', lineHeight: 1.5 }}>
                                            {job.serviceName || 'Detailing service'} • {job.vehicleInfo || (job as any).vehicleType || 'Vehicle'}
                                        </p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#515f74', fontWeight: 500, marginTop: 2 }}>
                                            {(job as any).scheduledTime || (job as any).appointmentTime || 'Pending'}
                                        </p>
                                    </div>
                                </div>
                            ))}

                            {/* Completed today summary */}
                            {completedToday > 0 && (
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                        <CheckCircle style={{ width: 14, height: 14 }} />
                                    </div>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: '#06274b', margin: 0 }}>{completedToday} Job{completedToday !== 1 ? 's' : ''} Completed</p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#43474c', margin: '2px 0', lineHeight: 1.5 }}>
                                            Great work today! {completedToday} vehicle{completedToday !== 1 ? 's' : ''} serviced and released.
                                        </p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#166534', fontWeight: 600, marginTop: 2 }}>Today</p>
                                    </div>
                                </div>
                            )}

                            {/* System ready fallback */}
                            {!activeJob && finalPendingJobs.length === 0 && completedToday === 0 && lowStockItems.length === 0 && (
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e6e8ea', color: '#515f74', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                        <ShieldCheck style={{ width: 14, height: 14 }} />
                                    </div>
                                    <div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: '#06274b', margin: 0 }}>System Ready</p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#43474c', margin: '2px 0', lineHeight: 1.5 }}>All systems nominal. Waiting for new appointments.</p>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#515f74', fontWeight: 500, marginTop: 2 }}>System</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Safety Tip Card */}
                    <div style={{
                        position: 'relative', borderRadius: 12, overflow: 'hidden', height: 200,
                        background: 'linear-gradient(135deg, #06274b 0%, #213d62 60%, #2d486d 100%)',
                        display: 'flex', alignItems: 'flex-end', padding: 24
                    }}>
                        <div style={{ position: 'relative', zIndex: 1, color: '#fff' }}>
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#adc8f5', marginBottom: 6 }}>Chemical Safety</p>
                            <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 800, lineHeight: 1.3, margin: 0 }}>Always wear PPE when handling wheel acids and degreasers.</h3>
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    /* ═══ ACTIVE JOB WORKSPACE — TWO COLUMN LAYOUT ═══ */
    return (
        <motion.div key="dashboard-workspace" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ paddingBottom: 40 }}>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

            {/* Active Job Header */}
            <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, marginBottom: 32 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <span style={{
                            background: 'rgba(30,38,58,0.15)', color: '#1e263a', fontSize: 10, fontWeight: 700,
                            padding: '4px 12px', borderRadius: 9999, textTransform: 'uppercase', letterSpacing: '0.08em'
                        }}>In Progress</span>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#43474c', fontWeight: 500 }}>Started at {startedAt}</span>
                    </div>
                    <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '2.25rem', fontWeight: 800, color: '#06274b', margin: 0, letterSpacing: '-0.5px' }}>
                        {(activeJob as any).serviceCategory || activeJob.jobOrder?.serviceCategory || activeJob.serviceType || activeJob.serviceName || 'Active Service'}
                    </h2>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, color: '#43474c', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {activeJob.customerAvatar ? (
                            <img src={activeJob.customerAvatar} alt="Customer" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : null}
                        {activeJob.customerName} • Bay {(activeJob as any).bayNumber || '—'}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <motion.button whileHover={btnHover} whileTap={btnTap} onClick={() => handleForceReady(activeJob)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px',
                            background: '#e6e8ea', borderRadius: 12, border: 'none',
                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: '#06274b', cursor: 'pointer'
                        }}>
                        <Pause style={{ width: 16, height: 16 }} /> Pause
                    </motion.button>
                    <motion.button whileHover={btnHover} whileTap={btnTap}
                        disabled={isCompleting || !isChecklistComplete}
                        onClick={() => handleCompleteJob(activeJob)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 32px',
                            background: (isCompleting || !isChecklistComplete) ? '#c4c6cd' : 'linear-gradient(135deg, #06274b, #213d62)',
                            borderRadius: 12, border: 'none',
                            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: '#fff', cursor: isChecklistComplete ? 'pointer' : 'not-allowed',
                            boxShadow: isChecklistComplete ? '0 4px 16px rgba(6,39,75,0.15)' : 'none'
                        }}>
                        <CheckCircle style={{ width: 16, height: 16 }} /> {isCompleting ? 'Completing...' : 'Mark as Complete'}
                    </motion.button>
                </div>
            </section>

            {/* Two-Column Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>
                {/* LEFT COLUMN — Core Data */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                    {/* Time Tracking Bento */}
                    <div style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32, marginBottom: 24 }}>
                            <div>
                                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#43474c', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Estimated Time</p>
                                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 24, fontWeight: 700, color: '#191c1e', margin: 0 }}>
                                    {(activeJob as any).estimatedDuration || '—'} <span style={{ fontSize: 13, fontWeight: 400, color: '#43474c' }}>HRS</span>
                                </p>
                            </div>
                            <div>
                                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#43474c', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Actual Time</p>
                                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 24, fontWeight: 700, color: '#06274b', margin: 0 }}>
                                    {formatElapsedHM(elapsedTime)} <span style={{ fontSize: 13, fontWeight: 400, color: '#43474c' }}>HRS</span>
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 16px', background: 'rgba(34,197,94,0.08)', color: '#166534',
                                    borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700,
                                    textTransform: 'uppercase', letterSpacing: '0.06em', border: '1px solid rgba(34,197,94,0.15)'
                                }}>
                                    <Play style={{ width: 12, height: 12 }} fill="currentColor" /> Timer Running
                                </div>
                            </div>
                        </div>
                        {/* Progress Bar */}
                        <div style={{ height: 8, width: '100%', background: '#e0e3e5', borderRadius: 9999, overflow: 'hidden' }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.8 }}
                                style={{ height: '100%', background: 'linear-gradient(135deg, #06274b, #213d62)', borderRadius: 9999 }} />
                        </div>
                    </div>

                    {/* Customer Notes / Detailing Specifications */}
                    <div style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: '#06274b', margin: 0 }}>Detailing Specifications</h3>
                        </div>
                        <div style={{
                            padding: 24, background: '#f2f4f6', borderRadius: 12, borderLeft: '4px solid #06274b'
                        }}>
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#43474c', lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                                {activeJob.notes || (activeJob as any).specialInstructions || '"No special instructions provided by customer. Standard service protocol applies."'}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
                                <Info style={{ width: 14, height: 14, color: '#06274b' }} />
                                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#06274b', textTransform: 'uppercase' }}>
                                    Vehicle: {[
                                        (activeJob as any).vehicleType || activeJob.vehicleMake,
                                        activeJob.vehicleModel,
                                        (activeJob as any).plateNumber || activeJob.vehiclePlate
                                    ].filter(Boolean).join(' • ') || activeJob.vehicleInfo || 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Inventory Used */}
                    <div style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: '#06274b', margin: 0 }}>Inventory Used</h3>
                            <button onClick={() => setActiveTab('inventory')} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 16px', background: '#f2f4f6', border: 'none',
                                borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#43474c',
                                cursor: 'pointer', fontWeight: 600
                            }}>
                                <Plus style={{ width: 12, height: 12 }} /> Log Usage
                            </button>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '0 0 16px', fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#43474c', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>Supply Name</th>
                                    <th style={{ padding: '0 0 16px', fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#43474c', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Quantity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usedItems.length === 0 ? (
                                    <tr><td colSpan={2} style={{ padding: 32, textAlign: 'center', fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#74777d' }}>No supplies logged yet for this job.</td></tr>
                                ) : (
                                    usedItems.map((item, i) => (
                                        <tr key={i} style={{ borderTop: '1px solid #eceef0', transition: 'background 0.15s' }}
                                            onMouseOver={e => (e.currentTarget.style.background = '#f7f9fb')}
                                            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                                            <td style={{ padding: '16px 0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#eceef0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06274b' }}>
                                                        <Package style={{ width: 18, height: 18 }} />
                                                    </div>
                                                    <div>
                                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: '#191c1e', margin: 0 }}>{item.name}</p>
                                                        {item.sku && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: '#43474c', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '2px 0 0' }}>SKU: {item.sku}</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px 0', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#191c1e' }}>
                                                {item.quantity} {item.unit}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* RIGHT COLUMN — Actions & Evidence */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                    {/* Job Evidence */}
                    <div style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)' }}>
                        <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: '#06274b', margin: '0 0 20px' }}>Job Evidence</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            {/* Add Before Photo Slot */}
                            <div onClick={() => triggerUpload('before')} style={{
                                aspectRatio: '1', borderRadius: 12, background: '#f2f4f6',
                                border: '2px dashed rgba(196,198,205,0.4)', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                color: '#43474c', transition: 'all 0.15s ease'
                            }}>
                                <Camera style={{ width: 24, height: 24, marginBottom: 8 }} />
                                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    {isUploading ? 'Uploading...' : 'Add Before'}
                                </span>
                            </div>
                            {/* Add After Photo Slot */}
                            <div onClick={() => triggerUpload('after')} style={{
                                aspectRatio: '1', borderRadius: 12, background: '#f2f4f6',
                                border: '2px dashed rgba(196,198,205,0.4)', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                color: '#43474c', transition: 'all 0.15s ease'
                            }}>
                                <Camera style={{ width: 24, height: 24, marginBottom: 8 }} />
                                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    {isUploading ? 'Uploading...' : 'Add After'}
                                </span>
                            </div>
                            {/* Show existing photos */}
                            {allPhotos.slice(0, 2).map((photo, i) => (
                                <div key={i} style={{ aspectRatio: '1', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                                    <img src={photo} alt={`Evidence ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            ))}
                        </div>
                        {allPhotos.length > 2 && (
                            <button onClick={() => setActiveTab('photos')} style={{
                                width: '100%', marginTop: 12, padding: '10px 0', background: 'none', border: 'none',
                                fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: '#06274b',
                                cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 4
                            }}>View All {allPhotos.length} Photos</button>
                        )}
                    </div>

                    {/* Action Sidebar Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Inspection Checklist */}
                        <motion.button whileHover={{ x: 4 }} onClick={() => setShowChecklist(!showChecklist)} style={{
                            width: '100%', padding: '16px 24px',
                            background: '#f2f4f6', border: 'none', borderRadius: 12,
                            fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#06274b',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            transition: 'background 0.15s ease'
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <ClipboardList style={{ width: 20, height: 20 }} />
                                Inspection Checklist ({completedSteps}/{totalSteps})
                            </span>
                            <ChevronRight style={{ width: 18, height: 18, transform: showChecklist ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }} />
                        </motion.button>

                        {/* MSDS & Guides */}
                        <motion.button whileHover={{ x: 4 }} onClick={() => setActiveTab('progress')} style={{
                            width: '100%', padding: '16px 24px',
                            background: '#f2f4f6', border: 'none', borderRadius: 12,
                            fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#06274b',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            transition: 'background 0.15s ease'
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <FileText style={{ width: 20, height: 20 }} />
                                Progress Report
                            </span>
                            <ChevronRight style={{ width: 18, height: 18 }} />
                        </motion.button>

                        {/* Log Issue */}
                        <motion.button whileHover={{ x: 4 }} onClick={() => setActiveTab('notes')} style={{
                            width: '100%', padding: '16px 24px',
                            background: 'transparent', border: '2px solid rgba(186,26,26,0.12)', borderRadius: 12,
                            fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: '#ba1a1a',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                            transition: 'background 0.15s ease'
                        }}>
                            <AlertTriangle style={{ width: 18, height: 18 }} />
                            Log Issue / Add Note
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* Expandable Checklist Panel */}
            <AnimatePresence>
                {showChecklist && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden', marginTop: 24 }}>
                        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)', padding: 32 }}>
                            {/* Ingress */}
                            {ingressSteps.length > 0 && (
                                <div style={{ marginBottom: 24 }}>
                                    <h4 style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#43474c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Pre-Assessment / Ingress Operations</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {ingressSteps.map((step, idx) => (
                                            <motion.div key={`ing-${idx}`} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}
                                                onClick={() => handleToggleOperationsChecklist(activeJob, 'ingress', idx)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                                                    background: step.completed ? 'rgba(34,197,94,0.06)' : '#f7f9fb',
                                                    borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s'
                                                }}>
                                                <Checkbox checked={step.completed} />
                                                <span style={{
                                                    fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#191c1e',
                                                    textDecoration: step.completed ? 'line-through' : 'none',
                                                    opacity: step.completed ? 0.6 : 1
                                                }}>{step.name}</span>
                                                {step.isMustExplain && <span title="MUST BE EXPLAINED" style={{ fontSize: 13, cursor: 'help' }}>⚠️</span>}
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Service Steps */}
                            {serviceSteps.length > 0 && (
                                <div style={{ marginBottom: 24 }}>
                                    <h4 style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#43474c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Service Steps</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                                        {serviceSteps.map((step, idx) => (
                                            <motion.div key={`srv-${idx}`} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}
                                                onClick={() => handleToggleChecklist(activeJob, idx)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                                                    background: step.status === 'completed' ? 'rgba(34,197,94,0.06)' : '#f7f9fb',
                                                    borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s'
                                                }}>
                                                <Checkbox checked={step.status === 'completed'} />
                                                <span style={{
                                                    fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#191c1e',
                                                    textDecoration: step.status === 'completed' ? 'line-through' : 'none',
                                                    opacity: step.status === 'completed' ? 0.6 : 1
                                                }}>{step.name}</span>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Egress */}
                            {egressSteps.length > 0 && (
                                <div>
                                    <h4 style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#43474c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Egress Operations</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {egressSteps.map((step, idx) => (
                                            <motion.div key={`eg-${idx}`} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}
                                                onClick={() => handleToggleOperationsChecklist(activeJob, 'egress', idx)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                                                    background: step.completed ? 'rgba(34,197,94,0.06)' : '#f7f9fb',
                                                    borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s'
                                                }}>
                                                <Checkbox checked={step.completed} />
                                                <span style={{
                                                    fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#191c1e',
                                                    textDecoration: step.completed ? 'line-through' : 'none',
                                                    opacity: step.completed ? 0.6 : 1
                                                }}>{step.name}</span>
                                                {step.isMustExplain && <span title="MUST BE EXPLAINED" style={{ fontSize: 13, cursor: 'help' }}>⚠️</span>}
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
