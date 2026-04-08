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

    return (
        <motion.div key="activity" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto">
            <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-panel-header flex justify-between items-center">
                    <h3><Activity style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Workspace Activity Log</h3>
                    {loading && <span className="text-xs text-zinc-500">Refreshing...</span>}
                </div>
                <div className="glass-panel-body" style={{ padding: '24px' }}>
                    {logs.length === 0 && !loading ? (
                        <div className="text-center py-12 text-zinc-500">
                            <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                            <p>No activity logs found for your workspace.</p>
                        </div>
                    ) : (
                        <div className="relative border-l border-zinc-800 ml-4 space-y-8">
                            {logs.map((log, idx) => {
                                let dotColor = 'bg-zinc-600';
                                if (log.status === 'success') dotColor = 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
                                if (log.status === 'info') dotColor = 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]';
                                if (log.status === 'error') dotColor = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';
                                if (log.status === 'warning') dotColor = 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]';

                                return (
                                    <motion.div key={log.id || idx} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx * 0.05, 1) }} className="relative pl-8">
                                        <span className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full ${dotColor}`} />
                                        <div className="bg-[#18181B] border border-zinc-800 p-4 rounded-xl hover:border-zinc-700 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-semibold text-zinc-100 text-sm">{log.action || log.title}</h4>
                                                <span className="flex items-center text-xs text-zinc-500 gap-1 font-mono">
                                                    <Clock className="w-3 h-3" /> {formatTime(log.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-zinc-400 mb-3">{log.description}</p>
                                            <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                                                By {log.userName || 'System'}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
