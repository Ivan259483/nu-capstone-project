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
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return (
        <motion.div key="notes" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-panel-header">
                    <h3><MessageSquare style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Customer Notes & Communication</h3>
                </div>
                <div className="glass-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <Label className="text-zinc-400 mb-2 block" style={{ fontSize: 12 }}>New Note</Label>
                        <Textarea 
                            placeholder="Document customer requests, damage observations, additional work..." 
                            value={newNote} 
                            onChange={(e) => setNewNote(e.target.value)} 
                            className="bg-zinc-950 border-zinc-800 text-white min-h-[120px] focus:border-orange-500" 
                        />
                    </div>
                    <motion.button 
                        whileHover={newNote.trim() ? btnHover : {}} 
                        whileTap={newNote.trim() ? btnTap : {}} 
                        onClick={handleSaveNote} 
                        disabled={!newNote.trim()} 
                        className="btn-premium primary" 
                        style={{ height: 44, justifyContent: 'center', opacity: newNote.trim() ? 1 : 0.4 }}
                    >
                        Save Note
                    </motion.button>
                    <div style={{ marginTop: 16 }}>
                        <h4 style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                            Recent Notes
                        </h4>
                        {!activeJob ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Please start a job to view or add notes.</p>
                        ) : allNotes.length === 0 ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No notes for this job yet.</p>
                        ) : (
                            <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {allNotes.map(note => (
                                    <motion.div key={note.id} variants={staggerItem} className="queue-card" whileHover={cardHover} style={{ padding: 14 }}>
                                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{note.content}</p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 }}>
                                            <span>{note.author}</span>
                                            <span>{new Date(note.time).toLocaleString()}</span>
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
