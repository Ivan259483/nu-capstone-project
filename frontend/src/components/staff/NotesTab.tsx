import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { btnHover, btnTap, pageVariants, staggerContainer, staggerItem, cardHover } from './SharedAnimations';
import type { Booking, CustomerNote } from '@/types';

interface NotesTabProps {
    activeJob?: Booking;
    newNote: string;
    setNewNote: (val: string) => void;
    handleSaveNote: () => void;
    customerNotes: CustomerNote[];
}

export function NotesTab({ activeJob, newNote, setNewNote, handleSaveNote, customerNotes }: NotesTabProps) {
    // Merge backend staff notes with local legacy notes
    const backendNotes = activeJob?.staffNotes || [];
    const localNotes = customerNotes.filter(n => n.jobId === (activeJob?.id || (activeJob as any)?._id));
    
    // Convert to a unified format for rendering
    const allNotes = [
        ...backendNotes.map((n: any) => ({
            id: n._id || String(Date.now() + Math.random()),
            content: n.content,
            author: n.detailerName || `Staff ${n.detailerId}`,
            time: n.timestamp
        })),
        ...localNotes.map(n => ({
            id: n.id,
            content: n.content,
            author: `Staff ${n.detailerId}`,
            time: n.createdAt
        }))
    ].sort((a, b) => {
        const ta = a.time ? new Date(a.time).getTime() : 0;
        const tb = b.time ? new Date(b.time).getTime() : 0;
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });

    return (
        <motion.div key="notes" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ background: '#ffffff', borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(6,39,75,0.05)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                    <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 700, color: '#06274b', display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare style={{ width: 14, height: 14, color: '#06274b' }} /> Customer Notes & Communication</h3>
                </div>
                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#74777d', display: 'block', marginBottom: 8 }}>New Note</label>
                        <Textarea 
                            placeholder="Document customer requests, damage observations, additional work..." 
                            value={newNote} 
                            onChange={(e) => setNewNote(e.target.value)} 
                            style={{ 
                                background: '#f2f4f6', border: 'none', borderRadius: 8, color: '#191c1e', 
                                fontFamily: "'Inter', sans-serif", fontSize: 13, padding: '12px 14px', minHeight: 120,
                                outline: 'none'
                            }}
                        />
                    </div>
                    <motion.button 
                        whileHover={newNote.trim() ? btnHover : {}} 
                        whileTap={newNote.trim() ? btnTap : {}} 
                        onClick={handleSaveNote} 
                        disabled={!newNote.trim()} 
                        style={{ 
                            height: 44, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'linear-gradient(135deg, #06274b, #213d62)', color: '#fff', border: 'none', borderRadius: 8,
                            fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 13, cursor: newNote.trim() ? 'pointer' : 'not-allowed',
                            opacity: newNote.trim() ? 1 : 0.35
                        }}
                    >
                        Save Note
                    </motion.button>
                    <div style={{ marginTop: 16 }}>
                        <h4 style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, color: '#74777d', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                            Recent Notes
                        </h4>
                        {!activeJob ? (
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#c4c6cd', fontStyle: 'italic' }}>Please start a job to view or add notes.</p>
                        ) : allNotes.length === 0 ? (
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#c4c6cd', fontStyle: 'italic' }}>No notes for this job yet.</p>
                        ) : (
                            <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {allNotes.map(note => (
                                    <motion.div key={note.id} variants={staggerItem} whileHover={{ backgroundColor: '#eceef0' }} style={{ background: '#f7f9fb', borderRadius: 10, border: 'none', padding: '14px 16px', transition: 'background 0.2s ease' }}>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#43474c', lineHeight: 1.6, margin: 0 }}>{note.content}</p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, color: '#74777d', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 8 }}>
                                            <span>{note.author}</span>
                                            <span>{note.time && !isNaN(new Date(note.time).getTime()) ? new Date(note.time).toLocaleString() : '—'}</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
