import { motion } from 'framer-motion';
import { Shield, Volume2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { btnHover, btnTap, pageVariants } from './SharedAnimations';

interface SettingsTabProps {
    user: any;
    roleLabel: string;
    notifSound: boolean;
    handleToggleNotifSound: () => void;
    sidebarCollapsed: boolean;
    toggleSidebar: () => void;
}

export function SettingsTab({
    user,
    roleLabel,
    notifSound,
    handleToggleNotifSound,
    sidebarCollapsed,
    toggleSidebar
}: SettingsTabProps) {
    return (
        <motion.div key="settings" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <div className="settings-panel" style={{ margin: '0 auto', maxWidth: 800 }}>
                {/* Profile Card */}
                <motion.div className="settings-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="settings-card-header">
                        <h3>Profile</h3>
                        <p>Your account information</p>
                    </div>
                    <div className="settings-card-body">
                        <div className="settings-row"><div className="settings-row-info"><span className="settings-row-label">Name</span></div><span className="settings-row-value">{user?.name || 'Service Staff'}</span></div>
                        <div className="settings-row"><div className="settings-row-info"><span className="settings-row-label">Email</span></div><span className="settings-row-value">{user?.email || '—'}</span></div>
                        <div className="settings-row"><div className="settings-row-info"><span className="settings-row-label">Role</span></div><span className="settings-badge"><Shield style={{ width: 12, height: 12 }} /> {roleLabel}</span></div>
                    </div>
                </motion.div>

                {/* Preferences */}
                <motion.div className="settings-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div className="settings-card-header">
                        <h3>Preferences</h3>
                        <p>Customize your experience</p>
                    </div>
                    <div className="settings-card-body">
                        <div className="settings-row">
                            <div className="settings-row-info">
                                <span className="settings-row-label">Theme</span>
                                <span className="settings-row-desc">Switch between dark and light mode</span>
                            </div>
                            <ThemeToggle />
                        </div>
                        <div className="settings-row">
                            <div className="settings-row-info">
                                <span className="settings-row-label">Notification Sounds</span>
                                <span className="settings-row-desc">Play audio alerts for new notifications</span>
                            </div>
                            <motion.button whileHover={btnHover} whileTap={btnTap} className={`btn-premium${notifSound ? ' primary' : ''}`} onClick={handleToggleNotifSound} style={{ height: 32, fontSize: 11 }}>
                                <Volume2 style={{ width: 14, height: 14 }} /> {notifSound ? 'On' : 'Off'}
                            </motion.button>
                        </div>
                        <div className="settings-row">
                            <div className="settings-row-info">
                                <span className="settings-row-label">Sidebar</span>
                                <span className="settings-row-desc">Collapse sidebar for more workspace</span>
                            </div>
                            <motion.button whileHover={btnHover} whileTap={btnTap} className="btn-premium" onClick={toggleSidebar} style={{ height: 32, fontSize: 11 }}>
                                {sidebarCollapsed ? 'Expand' : 'Collapse'}
                            </motion.button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
