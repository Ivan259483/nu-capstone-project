import { motion } from 'framer-motion';
import { BadgeHelp, ChevronRight } from 'lucide-react';
import { pageVariants, staggerContainer, staggerItem, cardHover } from './SharedAnimations';

const mockRequests = [
    { id: 'REQ-01', customer: 'Alice Johnson', vehicle: 'Tesla Model Y', service: 'Full Detailing', estimatedPrice: '$350', status: 'Pending Review', isVip: true },
    { id: 'REQ-02', customer: 'Bob Smith', vehicle: 'BMW X5', service: 'Ceramic Coating', estimatedPrice: '$1,200', status: 'Pending Quote', isVip: false },
    { id: 'REQ-03', customer: 'Charlie Davis', vehicle: 'Porsche 911', service: 'Interior Detailing', estimatedPrice: '$200', status: 'Follow Up', isVip: true },
];

export function ServiceRequestsTab() {
    return (
        <motion.div key="requests" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <motion.div className="glass-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-panel-header">
                    <h3><BadgeHelp style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Incoming Service Requests</h3>
                    <span className="status-badge pending">{mockRequests.length} New</span>
                </div>
                <div className="glass-panel-body" style={{ padding: 0 }}>
                    <div className="overflow-x-auto w-full">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Request Ref</th>
                                    <th>Customer</th>
                                    <th>Vehicle</th>
                                    <th>Requested Service</th>
                                    <th>Est. Value</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
                                {mockRequests.map((req, idx) => (
                                    <motion.tr key={req.id} variants={staggerItem} whileHover={{ backgroundColor: 'var(--surface-hover)' }}>
                                        <td className="muted" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{req.id}</td>
                                        <td style={{ fontWeight: 600 }}>
                                            {req.customer}
                                            {req.isVip && <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', background: 'var(--accent-glow)', color: 'var(--accent)', borderRadius: 12, border: '1px solid var(--accent-border)' }}>VIP</span>}
                                        </td>
                                        <td className="muted">{req.vehicle}</td>
                                        <td>{req.service}</td>
                                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{req.estimatedPrice}</td>
                                        <td><span className="status-badge pending">{req.status}</span></td>
                                        <td style={{ textAlign: 'right' }}>
                                            <ChevronRight style={{ width: 16, height: 16, color: 'var(--text-dim)' }} />
                                        </td>
                                    </motion.tr>
                                ))}
                            </motion.tbody>
                        </table>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
