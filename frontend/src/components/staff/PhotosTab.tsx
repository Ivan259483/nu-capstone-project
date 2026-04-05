import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import { btnHover, btnTap, pageVariants } from './SharedAnimations';
import type { Booking } from '@/types';

interface PhotosTabProps {
    activeJob?: Booking;
}

export function PhotosTab({ activeJob }: PhotosTabProps) {
    return (
        <motion.div key="photos" variants={pageVariants} initial="initial" animate="animate" exit="exit">
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
                                <div className="photo-grid">
                                    {[1, 2, 3, 4].map((i) => (
                                        <motion.div key={i} className="photo-slot shimmer-overlay" whileHover={{ scale: 1.04, borderColor: 'var(--accent-border)' }} whileTap={{ scale: 0.97 }}>
                                            <Camera style={{ width: 18, height: 18, color: 'var(--text-dim)' }} />
                                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Slot {i}</span>
                                        </motion.div>
                                    ))}
                                </div>
                                <motion.button whileHover={btnHover} whileTap={btnTap} className="btn-premium primary" style={{ width: '100%', height: 40, justifyContent: 'center' }}>Upload Before Photos</motion.button>
                            </div>
                            {/* After Photos */}
                            <div className="photo-section">
                                <div className="photo-section-label"><div className="photo-section-dot" style={{ background: 'var(--green)' }} /> After Photos</div>
                                <div className="photo-grid">
                                    {[1, 2, 3, 4].map((i) => (
                                        <motion.div key={i} className="photo-slot shimmer-overlay" whileHover={{ scale: 1.04, borderColor: 'var(--accent-border)' }} whileTap={{ scale: 0.97 }}>
                                            <Camera style={{ width: 18, height: 18, color: 'var(--text-dim)' }} />
                                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Slot {i}</span>
                                        </motion.div>
                                    ))}
                                </div>
                                <motion.button whileHover={btnHover} whileTap={btnTap} className="btn-premium success" style={{ width: '100%', height: 40, justifyContent: 'center' }}>Final Submission</motion.button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
