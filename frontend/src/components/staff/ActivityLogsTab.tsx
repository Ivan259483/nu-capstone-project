import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Clock } from 'lucide-react';
import { pageVariants } from './SharedAnimations';
import { ActivityService, type EnrichedActivityLog } from '@/lib/activity-service-api';

export function ActivityLogsTab() {
    const [logs, setLogs] = useState<EnrichedActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const fetchLogs = async () => {
            setLoading(true);
            try {
                // Fetch recent logs (detailer scoping is enforced backend-side)
                const res = await ActivityService.getActivityLogs({ limit: 50 });
                if (mounted && res.success) {
                    setLogs(res.data || []);
                }
            } catch (err) {
                console.error('Failed to load detailer activity logs:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchLogs();
        return () => { mounted = false; };
    }, []);

    const formatTime = (isoString?: string) => {
        if (!isoString) return 'Just now';
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + d.toLocaleDateString();
    };

    const getDotStyle = (status?: string): React.CSSProperties => {
        switch (status) {
            case 'success': return { background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.35)' };
            case 'info': return { background: '#3b82f6', boxShadow: '0 0 8px rgba(59,130,246,0.35)' };
            case 'error': return { background: '#ba1a1a', boxShadow: '0 0 8px rgba(186,26,26,0.35)' };
            case 'warning': return { background: '#f59e0b', boxShadow: '0 0 8px rgba(245,158,11,0.35)' };
            default: return { background: '#c4c6cd' };
        }
    };

    return (
        <motion.div key="activity" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ background: '#ffffff', borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(6,39,75,0.05)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                    <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 700, color: '#06274b', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><Activity style={{ width: 14, height: 14, color: '#06274b' }} /> Workspace Activity Log</h3>
                    {loading && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#74777d' }}>Refreshing...</span>}
                </div>
                <div style={{ padding: 24 }}>
                    {logs.length === 0 && !loading ? (
                        <div style={{ textAlign: 'center', padding: '48px 0' }}>
                            <Activity style={{ width: 32, height: 32, color: '#c4c6cd', margin: '0 auto 12px', display: 'block' }} />
                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#74777d' }}>No activity logs found for your workspace.</p>
                        </div>
                    ) : (
                        <div style={{ position: 'relative', borderLeft: '2px solid rgba(196,198,205,0.4)', marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {logs.map((log, idx) => (
                                <motion.div key={log.id || idx} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx * 0.05, 1) }} style={{ position: 'relative', paddingLeft: 32 }}>
                                    <span style={{ position: 'absolute', left: -7, top: 6, width: 12, height: 12, borderRadius: '50%', ...getDotStyle(log.status) }} />
                                    <div style={{ background: '#f7f9fb', border: 'none', borderRadius: 10, padding: '14px 16px', transition: 'background 0.2s ease' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <h4 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 13, color: '#191c1e', margin: 0 }}>{log.action || log.title}</h4>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#74777d', flexShrink: 0 }}>
                                                <Clock style={{ width: 10, height: 10, color: '#74777d' }} /> {formatTime(log.createdAt)}
                                            </span>
                                        </div>
                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#43474c', marginBottom: 10, marginTop: 0 }}>{log.description}</p>
                                        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#74777d' }}>
                                            By {log.userName || 'System'}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
