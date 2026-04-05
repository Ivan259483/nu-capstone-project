import { motion } from 'framer-motion';
import { User, Star, TrendingUp, Award } from 'lucide-react';
import { pageVariants, staggerContainer, staggerItem } from './SharedAnimations';

const mockCustomer = {
    name: 'Michael Chang',
    loyaltyTier: 'Gold Member',
    totalVisits: 14,
    lifetimeSpend: '$4,520',
    recentService: 'Ceramic Coating (2 months ago)',
    phone: '+1 (555) 019-2831'
};

export function CustomerDetailsTab() {
    return (
        <motion.div key="customer" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="max-w-4xl mx-auto">
            {/* Header Profile */}
            <motion.div className="glass-panel" style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(30,30,35,0.7) 0%, rgba(20,20,24,0.9) 100%)' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="glass-panel-body" style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '32px 24px' }}>
                    <div style={{ width: 80, height: 80, borderRadius: 40, background: 'var(--accent-glow)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User style={{ width: 32, height: 32, color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>{mockCustomer.name}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 13, background: 'linear-gradient(90deg, #FFD700, #F57C00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Award style={{ width: 14, height: 14, color: '#F57C00' }} /> {mockCustomer.loyaltyTier}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{mockCustomer.phone}</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Lifetime Value</p>
                        <p style={{ fontSize: 24, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{mockCustomer.lifetimeSpend}</p>
                    </div>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <motion.div variants={staggerItem} className="glass-panel">
                    <div className="glass-panel-header">
                        <h3><TrendingUp style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Visit History</h3>
                    </div>
                    <div className="glass-panel-body">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <span style={{ color: 'var(--text-muted)' }}>Total Shop Visits</span>
                            <span style={{ fontSize: 20, fontWeight: 700 }}>{mockCustomer.totalVisits}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Last Service</span>
                            <span style={{ fontWeight: 500 }}>{mockCustomer.recentService}</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={staggerItem} className="glass-panel">
                    <div className="glass-panel-header">
                        <h3><Star style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Preferences</h3>
                    </div>
                    <div className="glass-panel-body">
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <li style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}><span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)' }} /> Prefers morning appointments</li>
                            <li style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}><span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)' }} /> Always requests interior ozone treatment</li>
                            <li style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}><span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)' }} /> Do not use heavy fragrance</li>
                        </ul>
                    </div>
                </motion.div>
            </motion.div>
        </motion.div>
    );
}
