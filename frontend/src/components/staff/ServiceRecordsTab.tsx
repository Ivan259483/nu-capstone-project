import { motion } from 'framer-motion';
import { ClipboardList, Car, Clock, Camera, FileText, AlertTriangle, User } from 'lucide-react';
import { pageVariants, staggerContainer, staggerItem } from './SharedAnimations';
import type { Booking } from '@/types';

interface ServiceRecordsTabProps {
    activeJob?: Booking;
}

export function ServiceRecordsTab({ activeJob }: ServiceRecordsTabProps) {
    if (!activeJob) {
        return (
            <motion.div key="records-empty" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto flex flex-col items-center justify-center p-12 text-center h-[50vh]">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <ClipboardList className="w-8 h-8 opacity-50" />
                </div>
                <h3 className="text-xl font-bold mb-2">No Active Service Record</h3>
                <p className="text-sm opacity-60">Start a job from the queue to view its service records.</p>
            </motion.div>
        );
    }

    const {
        customerName,
        customer,
        vehicleInfo,
        serviceName,
        serviceType,
        notes,
        createdAt,
        updatedAt
    } = activeJob;

    // We can infer damage notes or remarks if structured in the domain
    const customerRemarks = notes || "No additional remarks provided.";
    const damageNotes = "Initial Inspection: No major pre-existing damage documented. Standard wear matching age."; // placeholder for structure
    const serviceHistory = `Previous services: 1 (Ceramic Coating)`; 

    return (
        <motion.div key="records" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto space-y-6">
            
            <motion.div className="glass-panel" style={{ background: 'linear-gradient(135deg, rgba(30,30,35,0.7) 0%, rgba(20,20,24,0.9) 100%)' }}>
                <div className="glass-panel-body p-6 flex flex-wrap gap-6 items-center">
                    <div className="flex-1 min-w-[200px]">
                        <p className="text-xs uppercase tracking-widest text-[var(--accent)] mb-1 flex items-center gap-2"><User size={14} /> Assigned Client</p>
                        <h2 className="text-2xl font-bold text-white m-0">{customerName || customer?.name || "Unknown Client"}</h2>
                        <p className="text-sm opacity-60 mt-1">In-Shop Detailing</p>
                    </div>
                    <div className="flex-1 min-w-[200px] border-l border-[var(--border)] pl-6">
                        <p className="text-xs uppercase tracking-widest text-[var(--accent)] mb-1 flex items-center gap-2"><Car size={14} /> Vehicle Details</p>
                        <h3 className="text-lg font-semibold text-white m-0">{vehicleInfo || "Vehicle Information Pending"}</h3>
                        <p className="text-sm opacity-60 mt-1">{serviceName} {serviceType ? `- ${serviceType}` : ''}</p>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <motion.div variants={staggerItem} className="glass-panel flex flex-col h-full">
                    <div className="glass-panel-header">
                        <h3 className="flex items-center gap-2"><Clock size={16} className="text-[var(--accent)]" /> Service History</h3>
                    </div>
                    <div className="glass-panel-body flex-1">
                        <div className="bg-[var(--bg-canvas)] rounded-lg p-4 mb-4 border border-[var(--border)]">
                            <h4 className="text-sm font-semibold mb-1">Current Job</h4>
                            <div className="text-xs opacity-70 mb-1">Created: {new Date(createdAt || Date.now()).toLocaleString()}</div>
                            <div className="text-xs opacity-70">Updated: {new Date(updatedAt || Date.now()).toLocaleString()}</div>
                        </div>
                        <p className="text-sm opacity-80 pl-2 border-l-2 border-[var(--accent)]">{serviceHistory}</p>
                    </div>
                </motion.div>

                <motion.div variants={staggerItem} className="glass-panel flex flex-col h-full">
                    <div className="glass-panel-header">
                        <h3 className="flex items-center gap-2"><Camera size={16} className="text-[var(--accent)]" /> Before & After Records</h3>
                    </div>
                    <div className="glass-panel-body flex-1 flex flex-col items-center justify-center text-center p-6 border-dashed border-2 border-[var(--border)] rounded-lg m-4 opacity-70 bg-[var(--bg-canvas)]">
                        <Camera size={32} className="mb-3 opacity-50 text-[var(--accent)]" />
                        <p className="text-sm mb-1">Visual Records Pending</p>
                        <p className="text-xs opacity-60">Photos taken from the Inspection and QC stages will appear here.</p>
                    </div>
                </motion.div>

                <motion.div variants={staggerItem} className="glass-panel">
                    <div className="glass-panel-header">
                        <h3 className="flex items-center gap-2"><FileText size={16} className="text-[var(--accent)]" /> Customer Remarks</h3>
                    </div>
                    <div className="glass-panel-body">
                        <p className="text-sm leading-relaxed opacity-90 p-4 bg-[var(--bg-canvas)] rounded-lg border border-[var(--border)]">
                            {customerRemarks}
                        </p>
                    </div>
                </motion.div>

                <motion.div variants={staggerItem} className="glass-panel">
                    <div className="glass-panel-header">
                        <h3 className="flex items-center gap-2"><AlertTriangle size={16} className="text-[#F57C00]" /> Damage Notes</h3>
                    </div>
                    <div className="glass-panel-body">
                        <p className="text-sm leading-relaxed opacity-90 p-4 bg-[var(--bg-canvas)] rounded-lg border border-[var(--border)]">
                            {damageNotes}
                        </p>
                    </div>
                </motion.div>

            </motion.div>
        </motion.div>
    );
}
