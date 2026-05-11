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
                        <motion.div key={i} className="photo-slot relative overflow-hidden" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                            {photoUrl ? (
                                <img src={photoUrl} alt="Uploaded photo" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                                <>
                                    <Camera style={{ width: 18, height: 18, color: '#c4c6cd' }} />
                                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, color: '#c4c6cd', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slot {i + 1}</span>
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
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ background: '#ffffff', borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(6,39,75,0.05)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                    <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 15, fontWeight: 700, color: '#191c1e', display: 'flex', alignItems: 'center', gap: 8 }}><Camera style={{ width: 14, height: 14, color: '#06274b' }} /> Photo Documentation</h3>
                </div>
                <div style={{ padding: 24 }}>
                    {!activeJob ? (
                        <motion.div style={{ textAlign: 'center', padding: '48px 24px' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                            <Camera style={{ width: 48, height: 48, color: '#c4c6cd', margin: '0 auto 16px' }} />
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#74777d' }}>Start a job to enable photo documentation</p>
                        </motion.div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-8">
                            {/* Before Photos */}
                            <div className="photo-section">
                                <div className="photo-section-label"><div className="photo-section-dot" style={{ background: '#ba1a1a' }} /> Before Photos</div>
                                {renderPhotoSlots(beforePhotos)}
                                <motion.button 
                                    whileHover={btnHover} whileTap={btnTap} 
                                    onClick={() => triggerUpload('before')}
                                    disabled={isUploading}
                                    style={{ 
                                        width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: '#f2f4f6', color: '#06274b', border: '1.5px solid rgba(6,39,75,0.2)', borderRadius: 8,
                                        fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 16, gap: 8
                                    }}
                                >
                                    <Upload className="w-4 h-4" /> Upload Before Photo
                                </motion.button>
                            </div>
                            {/* After Photos */}
                            <div className="photo-section">
                                <div className="photo-section-label"><div className="photo-section-dot" style={{ background: '#22c55e' }} /> After Photos</div>
                                {renderPhotoSlots(afterPhotos)}
                                <motion.button 
                                    whileHover={btnHover} whileTap={btnTap} 
                                    onClick={() => triggerUpload('after')}
                                    disabled={isUploading}
                                    style={{ 
                                        width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'rgba(34,197,94,0.08)', color: '#166534', border: '1.5px solid rgba(34,197,94,0.3)', borderRadius: 8,
                                        fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 16, gap: 8
                                    }}
                                >
                                    <Upload className="w-4 h-4" /> Upload After Photo
                                </motion.button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
