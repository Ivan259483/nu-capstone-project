import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, X } from 'lucide-react';
import { btnHover, btnTap, pageVariants } from './SharedAnimations';
import { OrderService } from '@/lib/order-service';
import { toast } from 'sonner';
import type { Booking } from '@/types';

interface PhotosTabProps {
    activeJob?: Booking;
}

export function PhotosTab({ activeJob }: PhotosTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadPhase, setUploadPhase] = useState<'before' | 'after' | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const triggerUpload = (phase: 'before' | 'after') => {
        setUploadPhase(phase);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadPhase || !activeJob) return;

        // Reset input
        e.target.value = '';

        // For demo: convert file to a local object URL or base64.
        // In a real app we'd upload to Storage and pass the remote URL.
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64Data = reader.result as string;

            setIsUploading(true);
            toast.loading(`Uploading ${uploadPhase} photo...`, { id: 'upload' });
            try {
                const jobId = activeJob.id || (activeJob as any)._id;
                const res = await OrderService.addPhoto(jobId, uploadPhase, base64Data);
                
                if (res.success) {
                    toast.success('Photo uploaded successfully!', { id: 'upload' });
                } else {
                    toast.error(res.message || 'Upload failed', { id: 'upload' });
                }
            } catch (err) {
                console.error('Photo upload error:', err);
                toast.error('Network error during upload', { id: 'upload' });
            } finally {
                setIsUploading(false);
                setUploadPhase(null);
            }
        };
        reader.readAsDataURL(file);
    };

    // Derived state for photos
    const beforePhotos = activeJob?.photos?.before || [];
    const afterPhotos = activeJob?.photos?.after || [];

    const renderPhotoSlots = (phasePhotos: string[]) => {
        const slots = [0, 1, 2, 3]; // 4 slots
        return (
            <div className="photo-grid">
                {slots.map((i) => {
                    const photoUrl = phasePhotos[i];
                    return (
                        <motion.div key={i} className="photo-slot shimmer-overlay relative overflow-hidden" whileHover={{ scale: 1.04, borderColor: 'var(--accent-border)' }} whileTap={{ scale: 0.97 }}>
                            {photoUrl ? (
                                <img src={photoUrl} alt="Uploaded photo" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                                <>
                                    <Camera style={{ width: 18, height: 18, color: 'var(--text-dim)' }} />
                                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Slot {i + 1}</span>
                                </>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        );
    };

    return (
        <motion.div key="photos" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-panel-header">
                    <h3><Camera style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Photo Documentation</h3>
                </div>
                <div className="glass-panel-body">
                    {!activeJob ? (
                        <motion.div style={{ textAlign: 'center', padding: '48px 24px' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                            <Camera style={{ width: 48, height: 48, color: 'var(--text-dim)', margin: '0 auto 16px' }} />
                            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Start a job to enable photo documentation</p>
                        </motion.div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-8">
                            {/* Before Photos */}
                            <div className="photo-section">
                                <div className="photo-section-label"><div className="photo-section-dot" style={{ background: 'var(--red)' }} /> Before Photos</div>
                                {renderPhotoSlots(beforePhotos)}
                                <motion.button 
                                    whileHover={btnHover} whileTap={btnTap} 
                                    onClick={() => triggerUpload('before')}
                                    disabled={isUploading}
                                    className="btn-premium primary mt-4" style={{ width: '100%', height: 40, justifyContent: 'center' }}
                                >
                                    <Upload className="w-4 h-4 mr-2" /> Upload Before Photo
                                </motion.button>
                            </div>
                            {/* After Photos */}
                            <div className="photo-section">
                                <div className="photo-section-label"><div className="photo-section-dot" style={{ background: 'var(--green)' }} /> After Photos</div>
                                {renderPhotoSlots(afterPhotos)}
                                <motion.button 
                                    whileHover={btnHover} whileTap={btnTap} 
                                    onClick={() => triggerUpload('after')}
                                    disabled={isUploading}
                                    className="btn-premium success mt-4" style={{ width: '100%', height: 40, justifyContent: 'center' }}
                                >
                                    <Upload className="w-4 h-4 mr-2" /> Upload After Photo
                                </motion.button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
