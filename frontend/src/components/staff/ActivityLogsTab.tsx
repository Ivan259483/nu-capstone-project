import { motion } from 'framer-motion';
import { Activity, Clock } from 'lucide-react';
import { pageVariants, staggerContainer, staggerItem } from './SharedAnimations';

const mockLogs = [
    { id: '1', action: 'Job Completed', detail: 'Completed interior detailing for Tesla Model Y', user: 'Staff A', time: '10 mins ago', type: 'success' },
    { id: '2', action: 'Inventory Consumed', detail: 'Used 50ml of Ceramic Coating', user: 'Staff B', time: '45 mins ago', type: 'info' },
    { id: '3', action: 'Job Started', detail: 'Started wash sequence for BMW X5', user: 'Staff A', time: '1 hour ago', type: 'active' },
    { id: '4', action: 'Note Added', detail: 'Added scratch observation on rear bumper', user: 'Staff C', time: '2 hours ago', type: 'warning' }
];

export function ActivityLogsTab() {
    return (
        <motion.div key="activity" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto">
            <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-panel-header">
                    <h3><Activity style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Workspace Activity Log</h3>
                </div>
                <div className="glass-panel-body" style={{ padding: '24px' }}>
                    <div className="relative border-l border-zinc-800 ml-4 space-y-8">
                        {mockLogs.map((log, idx) => {
                            let dotColor = 'bg-zinc-600';
                            if (log.type === 'success') dotColor = 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
                            if (log.type === 'info') dotColor = 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]';
                            if (log.type === 'active') dotColor = 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]';
                            if (log.type === 'warning') dotColor = 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]';

                            return (
                                <motion.div key={log.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }} className="relative pl-8">
                                    <span className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full ${dotColor}`} />
                                    <div className="bg-[#18181B] border border-zinc-800 p-4 rounded-xl hover:border-zinc-700 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-semibold text-zinc-100 text-sm">{log.action}</h4>
                                            <span className="flex items-center text-xs text-zinc-500 gap-1 font-mono">
                                                <Clock className="w-3 h-3" /> {log.time}
                                            </span>
                                        </div>
                                        <p className="text-sm text-zinc-400 mb-3">{log.detail}</p>
                                        <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                                            By {log.user}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
