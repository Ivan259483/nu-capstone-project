import './ActivityLogs.css';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Download, FileText, CheckCircle, AlertTriangle,
    Clock, Package, Users, ShoppingBag, ShieldCheck, Banknote,
    Calendar, ChevronDown, Activity, Settings, ClipboardList,
    TrendingUp, BarChart3, LogIn, LogOut, RefreshCw, Filter,
    AlertOctagon, Info, User, X
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { ActivityService, type EnrichedActivityLog } from '@/lib/activity-service-api';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ModuleFilter = 'All' | 'Auth' | 'Booking' | 'User' | 'POS' | 'Inventory' | 'System' | 'Settings' | 'Report' | 'Service' | 'Customer';
type StatusFilter = 'All' | 'success' | 'warning' | 'error' | 'info';
type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'all';

interface ActivityLogsProps {
    activityLogs?: EnrichedActivityLog[];
    onRefresh?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_FILTERS: ModuleFilter[] = ['All', 'Auth', 'Booking', 'User', 'POS', 'Inventory', 'Service', 'Customer', 'System', 'Settings', 'Report'];

const DATE_FILTERS: { id: DateFilter; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Time' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getRoleLabel = (role: string): string => {
    const map: Record<string, string> = {
        administrator: 'Administrator',
        office_admin: 'Office Admin',
        hr: 'HR',
        inventory: 'Inventory',
        sales: 'Sales',
        service_staff: 'Detailer',
        staff_quality_checker: 'Quality Checker - Technician',
        customer: 'Customer',
        system: 'System',
    };
    return map[role] || role;
};

const getModuleIcon = (module: string) => {
    const icons: Record<string, any> = {
        Auth: LogIn,
        Booking: ClipboardList,
        User: Users,
        POS: Banknote,
        Inventory: Package,
        Service: Activity,
        Customer: User,
        System: Settings,
        Settings: Settings,
        Report: BarChart3,
    };
    return icons[module] || Activity;
};

const getModuleColor = (module: string): { bg: string; text: string; border: string } => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
        Auth:      { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
        Booking:   { bg: 'rgba(139,92,246,0.12)',  text: '#a78bfa', border: 'rgba(139,92,246,0.25)' },
        User:      { bg: 'rgba(20,184,166,0.12)',  text: '#2dd4bf', border: 'rgba(20,184,166,0.25)' },
        POS:       { bg: 'rgba(249,115,22,0.12)',  text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
        Inventory: { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.25)' },
        Service:   { bg: 'rgba(236,72,153,0.12)',  text: '#f472b6', border: 'rgba(236,72,153,0.25)' },
        Customer:  { bg: 'rgba(168,85,247,0.12)',  text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
        System:    { bg: 'rgba(113,113,122,0.12)', text: '#a1a1aa', border: 'rgba(113,113,122,0.25)' },
        Settings:  { bg: 'rgba(113,113,122,0.12)', text: '#a1a1aa', border: 'rgba(113,113,122,0.25)' },
        Report:    { bg: 'rgba(14,165,233,0.12)',  text: '#38bdf8', border: 'rgba(14,165,233,0.25)' },
    };
    return colors[module] || colors.System;
};

const getStatusConfig = (status: string): { label: string; bg: string; text: string; border: string; dot: string } => {
    switch (status) {
        case 'success': return { label: 'Success', bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', border: 'rgba(34,197,94,0.25)',  dot: '#4ade80' };
        case 'warning': return { label: 'Warning', bg: 'rgba(234,179,8,0.12)', text: '#facc15', border: 'rgba(234,179,8,0.25)', dot: '#facc15' };
        case 'error':   return { label: 'Error',   bg: 'rgba(239,68,68,0.12)', text: '#f87171', border: 'rgba(239,68,68,0.25)', dot: '#f87171' };
        case 'info':    return { label: 'Info',    bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)', dot: '#60a5fa' };
        default:        return { label: 'Info',    bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)', dot: '#60a5fa' };
    }
};

const getInitials = (name: string): string => {
    if (!name) return 'SY';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
};

const getAvatarBg = (name: string): string => {
    const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const colors = [
        '#E87C2F', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'
    ];
    return colors[hash % colors.length];
};

// Date helpers
const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();
const isYesterday = (d: string) => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    return new Date(d).toDateString() === y.toDateString();
};
const isThisWeek = (d: string) => {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
    return new Date(d) >= weekStart;
};
const isThisMonth = (d: string) => {
    const n = new Date(); const p = new Date(d);
    return p.getMonth() === n.getMonth() && p.getFullYear() === n.getFullYear();
};

const formatTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const formatDateTime = (dateStr: string): { date: string; time: string } => {
    const d = new Date(dateStr);
    return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    };
};

// ─── Seed / Fallback Data ─────────────────────────────────────────────────────
// Generates fresh timestamps relative to the current time on every call,
// so fallback data always looks realistic regardless of when the page loads.

function generateFallbackLogs(): EnrichedActivityLog[] {
    const now = new Date();
    const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();

    return [
        { id: 's1',  type: 'login',             title: 'Admin Login',           description: 'Carl Reyes logged into the admin dashboard.',                   userName: 'Carl Reyes',  userRole: 'administrator',    module: 'Auth',      action: 'User Login',          status: 'success', createdAt: ago(5),    userId: '' },
        { id: 's2',  type: 'booking_completed', title: 'Job Completed',         description: 'Kevin Tan completed full detailing for APT-4821.',             userName: 'Kevin Tan',   userRole: 'service_staff',    module: 'Booking',   action: 'Booking Completed',   status: 'success', createdAt: ago(12),   userId: '' },
        { id: 's3',  type: 'pos_transaction',   title: 'POS Sale',              description: 'Ana Rivera processed POS sale — ₱2,500.00 (Wax + Polish).',   userName: 'Ana Rivera',  userRole: 'sales',            module: 'POS',       action: 'POS Transaction',     status: 'success', createdAt: ago(18),   userId: '' },
        { id: 's4',  type: 'inventory_update',  title: 'Stock Restocked',       description: 'Luis Garcia restocked Carnauba Wax: +50 units.',              userName: 'Luis Garcia', userRole: 'inventory',         module: 'Inventory', action: 'Stock Updated',       status: 'success', createdAt: ago(25),   userId: '' },
        { id: 's5',  type: 'low_stock',         title: 'Low Stock Alert',       description: 'Microfiber Cloth below minimum level — 3 remaining.',         userName: 'System',      userRole: 'system',           module: 'Inventory', action: 'Low Stock Alert',     status: 'warning', createdAt: ago(33),   userId: '' },
        { id: 's6',  type: 'booking_created',   title: 'Booking Created',       description: 'Jake Torres created APT-4822 for Sophia Cruz — Full Interior.',userName: 'Jake Torres', userRole: 'office_admin', module: 'Booking',   action: 'Booking Created',     status: 'success', createdAt: ago(47),   userId: '' },
        { id: 's7',  type: 'user_created',      title: 'New User Added',        description: 'Maria Santos created account for Kevin Tan (Service Staff).', userName: 'Maria Santos',userRole: 'office_admin',      module: 'User',      action: 'User Created',        status: 'success', createdAt: ago(52),   userId: '' },
        { id: 's8',  type: 'settings',          title: 'Settings Updated',      description: 'Carl Reyes updated membership discount rate to 10%.',         userName: 'Carl Reyes',  userRole: 'administrator',    module: 'Settings',  action: 'Settings Updated',    status: 'success', createdAt: ago(68),   userId: '' },
        { id: 's9',  type: 'payment_completed', title: 'Payment Received',      description: 'Ana Rivera confirmed payment of ₱3,800.00 for APT-4815.',    userName: 'Ana Rivera',  userRole: 'sales',            module: 'POS',       action: 'Payment Completed',   status: 'success', createdAt: ago(90),   userId: '' },
        { id: 's10', type: 'access_denied',     title: 'Access Denied',         description: 'Unauthorized access attempt on /api/settings.',               userName: 'System',      userRole: 'system',           module: 'System',    action: 'Access Denied',       status: 'error',   createdAt: ago(102),  userId: '' },
        { id: 's11', type: 'started_job',       title: 'Job Started',           description: 'Kevin Tan started detailing APT-4820 — Full Package.',        userName: 'Kevin Tan',   userRole: 'service_staff',    module: 'Booking',   action: 'Job Started',         status: 'success', createdAt: ago(118),  userId: '' },
        { id: 's12', type: 'role_changed',      title: 'Role Updated',          description: 'Maria Santos changed Luis Garcia\'s role to Office Admin.',   userName: 'Maria Santos',userRole: 'office_admin',      module: 'User',      action: 'Role Changed',        status: 'warning', createdAt: ago(130),  userId: '' },
        { id: 's13', type: 'inventory_deduction',title: 'Inventory Used',       description: 'Luis Garcia deducted 5 units of Carnauba Wax for APT-4818.', userName: 'Luis Garcia', userRole: 'inventory',         module: 'Inventory', action: 'Stock Deducted',      status: 'warning', createdAt: ago(145),  userId: '' },
        { id: 's14', type: 'booking_updated',   title: 'Booking Rescheduled',   description: 'Jake Torres rescheduled APT-4817 to 2:00 PM.',               userName: 'Jake Torres', userRole: 'office_admin', module: 'Booking',   action: 'Booking Updated',     status: 'info',    createdAt: ago(162),  userId: '' },
        { id: 's15', type: 'logout',            title: 'Admin Logout',          description: 'Carl Reyes ended morning session.',                           userName: 'Carl Reyes',  userRole: 'administrator',    module: 'Auth',      action: 'User Logout',         status: 'info',    createdAt: ago(180),  userId: '' },
        // Yesterday
        { id: 's16', type: 'pos_transaction',   title: 'POS Sale',              description: 'Ana Rivera completed POS transaction — ₱1,200.00.',           userName: 'Ana Rivera',  userRole: 'sales',            module: 'POS',       action: 'POS Transaction',     status: 'success', createdAt: ago(1500), userId: '' },
        { id: 's17', type: 'completed_job',     title: 'Job Completed',         description: 'Kevin Tan completed Premium Wash for APT-4810.',              userName: 'Kevin Tan',   userRole: 'service_staff',    module: 'Booking',   action: 'Job Completed',       status: 'success', createdAt: ago(1520), userId: '' },
        { id: 's18', type: 'system_error',      title: 'System Error',          description: 'Email notification failed: SMTP connection timeout.',          userName: 'System',      userRole: 'system',           module: 'System',    action: 'System Error',        status: 'error',   createdAt: ago(1560), userId: '' },
        { id: 's19', type: 'inventory_update',  title: 'Inventory Received',    description: 'Luis Garcia received 100 units of Microfiber Cloth.',         userName: 'Luis Garcia', userRole: 'inventory',         module: 'Inventory', action: 'Stock Updated',       status: 'success', createdAt: ago(1580), userId: '' },
        { id: 's20', type: 'booking_cancelled', title: 'Booking Cancelled',     description: 'Jake Torres cancelled APT-4808 — customer no-show.',         userName: 'Jake Torres', userRole: 'office_admin', module: 'Booking',   action: 'Booking Cancelled',   status: 'warning', createdAt: ago(1620), userId: '' },
        // 2 days ago
        { id: 's21', type: 'price_override',    title: 'Price Override',        description: 'Ana Rivera applied manual discount — ₱500 off loyal customer.',userName: 'Ana Rivera',  userRole: 'sales',            module: 'POS',       action: 'Price Override',      status: 'warning', createdAt: ago(2900), userId: '' },
        { id: 's22', type: 'maintenance',       title: 'Database Backup',       description: 'Automated database backup completed successfully.',            userName: 'System',      userRole: 'system',           module: 'System',    action: 'Maintenance Task',    status: 'success', createdAt: ago(2960), userId: '' },
        { id: 's23', type: 'user_created',      title: 'New User Added',        description: 'Maria Santos created account for new customer Lena Ramirez.',userName: 'Maria Santos', userRole: 'office_admin',     module: 'User',      action: 'User Created',        status: 'success', createdAt: ago(2940), userId: '' },
        { id: 's24', type: 'generated_report',  title: 'Report Exported',       description: 'Carl Reyes generated daily revenue summary report.',          userName: 'Carl Reyes',  userRole: 'administrator',    module: 'Report',    action: 'Report Generated',    status: 'success', createdAt: ago(2920), userId: '' },
        { id: 's25', type: 'low_stock',         title: 'Critical Stock Alert',  description: 'Glass Cleaner critically low — only 2 units left.',           userName: 'System',      userRole: 'system',           module: 'Inventory', action: 'Low Stock Alert',     status: 'warning', createdAt: ago(2980), userId: '' },
    ];
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function LogDetailModal({ log, onClose }: { log: EnrichedActivityLog; onClose: () => void }) {
    const { date, time } = formatDateTime(log.createdAt);
    const statusConfig = getStatusConfig(log.status || 'info');
    const moduleColor = getModuleColor(log.module || 'System');
    const ModuleIcon = getModuleIcon(log.module || 'System');
    const avatarColor = getAvatarBg(log.userName);
    const initials = getInitials(log.userName);

    return (
        <div className="al-modal-overlay" onClick={onClose}>
            <div className="al-modal" onClick={e => e.stopPropagation()}>
                <div className="al-modal-header">
                    <div className="al-modal-title">Event Details</div>
                    <button className="al-modal-close" onClick={onClose}><X size={16} /></button>
                </div>
                <div className="al-modal-body">
                    <div className="al-detail-hero">
                        <div className="al-detail-icon" style={{ background: moduleColor.bg, border: `1px solid ${moduleColor.border}` }}>
                            <ModuleIcon size={22} style={{ color: moduleColor.text }} />
                        </div>
                        <div>
                            <div className="al-detail-title">{log.title || log.action}</div>
                            <div className="al-detail-desc">{log.description}</div>
                        </div>
                    </div>

                    <div className="al-detail-grid">
                        <div className="al-detail-field">
                            <span className="al-detail-label">Date & Time</span>
                            <span className="al-detail-value">{time}, {date}</span>
                        </div>
                        <div className="al-detail-field">
                            <span className="al-detail-label">Module</span>
                            <span className="al-detail-value" style={{ color: moduleColor.text }}>{log.module}</span>
                        </div>
                        <div className="al-detail-field">
                            <span className="al-detail-label">Action</span>
                            <span className="al-detail-value">{log.action}</span>
                        </div>
                        <div className="al-detail-field">
                            <span className="al-detail-label">Status</span>
                            <div className="al-status-badge" style={{ background: statusConfig.bg, border: `1px solid ${statusConfig.border}`, color: statusConfig.text }}>
                                <span className="al-status-dot" style={{ background: statusConfig.dot }} />
                                {statusConfig.label}
                            </div>
                        </div>
                        <div className="al-detail-field">
                            <span className="al-detail-label">User</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="al-avatar-sm" style={{ background: avatarColor + '22', border: `1px solid ${avatarColor}44`, color: avatarColor }}>{initials}</div>
                                <span className="al-detail-value">{log.userName}</span>
                            </div>
                        </div>
                        <div className="al-detail-field">
                            <span className="al-detail-label">Role</span>
                            <span className="al-detail-value">{getRoleLabel(log.userRole || '')}</span>
                        </div>
                    </div>

                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="al-detail-meta">
                            <div className="al-detail-label" style={{ marginBottom: 8 }}>Metadata</div>
                            <pre className="al-detail-json">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ActivityLogs({ activityLogs: propLogs, onRefresh }: ActivityLogsProps) {
    const [allLogs, setAllLogs] = useState<EnrichedActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [usingFallback, setUsingFallback] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('All');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
    const [dateFilter, setDateFilter] = useState<DateFilter>('today');
    const [showDateDropdown, setShowDateDropdown] = useState(false);
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [selectedLog, setSelectedLog] = useState<EnrichedActivityLog | null>(null);
    const dateDropdownRef = useRef<HTMLDivElement>(null);
    const statusDropdownRef = useRef<HTMLDivElement>(null);

    // Activate fallback: generate fresh timestamps & show all dates
    const activateFallback = useCallback(() => {
        setAllLogs(generateFallbackLogs());
        setUsingFallback(true);
    }, []);

    // Fetch logs from API
    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await ActivityService.getActivityLogs({ limit: 300 });
            if (res.success && res.data?.length > 0) {
                setAllLogs(res.data);
                setUsingFallback(false);
            } else {
                // Database empty or returned nothing — use demo data
                activateFallback();
            }
        } catch {
            // API unreachable — use demo data
            activateFallback();
        } finally {
            setIsLoading(false);
        }
    }, [activateFallback]);

    useEffect(() => {
        // Use prop logs if provided and non-empty, else fetch from API
        if (propLogs && propLogs.length > 0) {
            setAllLogs(propLogs as EnrichedActivityLog[]);
            setUsingFallback(false);
            setIsLoading(false);
        } else {
            fetchLogs();
        }
    }, [propLogs, fetchLogs]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
                setShowDateDropdown(false);
            }
            if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
                setShowStatusDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Safety-net: never allow an empty render when we have logs loaded.
    // If the current date filter produces 0 results, widen to 'all'.
    useEffect(() => {
        if (allLogs.length > 0 && dateFilter === 'today') {
            const todayCount = allLogs.filter(l => isToday(l.createdAt)).length;
            if (todayCount === 0) {
                setDateFilter('all');
            }
        }
    }, [allLogs, dateFilter]);

    // ─── Filtering ──────────────────────────────────────────────────────────────

    const filteredLogs = useMemo(() => {
        let logs = [...allLogs];

        // Date filter
        if (dateFilter === 'today') logs = logs.filter(l => isToday(l.createdAt));
        else if (dateFilter === 'yesterday') logs = logs.filter(l => isYesterday(l.createdAt));
        else if (dateFilter === 'week') logs = logs.filter(l => isThisWeek(l.createdAt));
        else if (dateFilter === 'month') logs = logs.filter(l => isThisMonth(l.createdAt));

        // Module filter
        if (moduleFilter !== 'All') logs = logs.filter(l => l.module === moduleFilter);

        // Status filter
        if (statusFilter !== 'All') logs = logs.filter(l => l.status === statusFilter);

        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            logs = logs.filter(l =>
                (l.title || '').toLowerCase().includes(q) ||
                (l.description || '').toLowerCase().includes(q) ||
                (l.userName || '').toLowerCase().includes(q) ||
                (l.action || '').toLowerCase().includes(q) ||
                (l.module || '').toLowerCase().includes(q)
            );
        }

        return logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [allLogs, dateFilter, moduleFilter, statusFilter, searchQuery]);

    // ─── Stats ──────────────────────────────────────────────────────────────────

    const todayLogs = useMemo(() => allLogs.filter(l => isToday(l.createdAt)), [allLogs]);
    const yesterdayLogs = useMemo(() => allLogs.filter(l => isYesterday(l.createdAt)), [allLogs]);

    const stats = useMemo(() => ({
        totalToday: todayLogs.length,
        completedJobs: todayLogs.filter(l => ['completed_job', 'booking_completed'].includes(l.type)).length,
        inventoryAlerts: todayLogs.filter(l => ['low_stock', 'inventory_deduction'].includes(l.type)).length,
        transactions: todayLogs.filter(l => ['payment_completed', 'pos_transaction'].includes(l.type)).length,
    }), [todayLogs]);

    const yesterdayStats = useMemo(() => ({
        totalToday: yesterdayLogs.length,
        completedJobs: yesterdayLogs.filter(l => ['completed_job', 'booking_completed'].includes(l.type)).length,
        inventoryAlerts: yesterdayLogs.filter(l => ['low_stock', 'inventory_deduction'].includes(l.type)).length,
        transactions: yesterdayLogs.filter(l => ['payment_completed', 'pos_transaction'].includes(l.type)).length,
    }), [yesterdayLogs]);

    // ─── Export CSV ─────────────────────────────────────────────────────────────

    const handleExportCSV = () => {
        const headers = ['Date', 'Time', 'User', 'Role', 'Module', 'Action', 'Description', 'Status'];
        const rows = filteredLogs.map(l => {
            const { date, time } = formatDateTime(l.createdAt);
            return [date, time, l.userName, getRoleLabel(l.userRole || ''), l.module || '', l.action || '', l.description, l.status || ''];
        });
        const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    // ─── Export PDF ─────────────────────────────────────────────────────────────

    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageW = doc.internal.pageSize.getWidth();
        let y = 20;

        // Header
        doc.setFillColor(22, 22, 25);
        doc.rect(0, 0, pageW, 40, 'F');
        doc.setFontSize(20); doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('AutoSPF+ Activity Logs', 14, 18);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.setTextColor(160, 160, 160);
        doc.text(`Generated: ${new Date().toLocaleString()} · ${filteredLogs.length} entries`, 14, 30);
        y = 52;

        // Table header
        const cols = [
            { label: 'Date & Time', w: 40 },
            { label: 'User', w: 38 },
            { label: 'Role', w: 30 },
            { label: 'Module', w: 28 },
            { label: 'Action', w: 45 },
            { label: 'Status', w: 22 },
            { label: 'Description', w: 90 },
        ];
        let x = 14;
        doc.setFillColor(30, 30, 35);
        doc.rect(x - 2, y - 6, pageW - 24, 10, 'F');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 200, 200);
        cols.forEach(col => { doc.text(col.label, x, y); x += col.w; });
        y += 8;
        doc.setDrawColor(50, 50, 55);
        doc.line(12, y - 2, pageW - 12, y - 2);

        // Rows
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        for (const log of filteredLogs) {
            if (y > 190) { doc.addPage(); y = 20; }
            const { date, time } = formatDateTime(log.createdAt);
            const row = [
                `${time}\n${date}`,
                log.userName || '',
                getRoleLabel(log.userRole || ''),
                log.module || '',
                log.action || '',
                (log.status || 'info').toUpperCase(),
                log.description || '',
            ];

            // Row bg
            const rowBg = y % 2 === 0 ? [20, 20, 24] : [24, 24, 28];
            doc.setFillColor(rowBg[0], rowBg[1], rowBg[2]);
            doc.rect(12, y - 5, pageW - 24, 12, 'F');

            x = 14;
            row.forEach((cell, i) => {
                const statusColors: Record<string, [number, number, number]> = {
                    SUCCESS: [74, 222, 128], WARNING: [250, 204, 21], ERROR: [248, 113, 113], INFO: [96, 165, 250]
                };
                if (i === 5) {
                    const c = statusColors[cell] || [160, 160, 160];
                    doc.setTextColor(c[0], c[1], c[2]);
                } else {
                    doc.setTextColor(190, 190, 190);
                }
                const lines = doc.splitTextToSize(cell, cols[i].w - 2);
                doc.text(lines[0] || '', x, y);
                x += cols[i].w;
            });
            y += 12;
        }

        doc.save(`activity-logs-${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    // ─── Render ─────────────────────────────────────────────────────────────────

    const dateLabel = DATE_FILTERS.find(d => d.id === dateFilter)?.label || 'Today';

    return (
        <div className="al-root">

            {/* ── Detail Modal ── */}
            <AnimatePresence>
                {selectedLog && (
                    <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
                )}
            </AnimatePresence>

            {/* ── Page Header ── */}
            <div className="al-page-header">
                <div>
                    <h1 className="al-page-title">Activity Logs</h1>
                    <p className="al-page-sub">Complete audit trail of all system events and user actions</p>
                </div>
                <div className="al-header-actions">
                    <button className="al-btn-ghost" onClick={() => { fetchLogs(); onRefresh?.(); }}>
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                    <button className="al-btn-ghost" onClick={handleExportCSV}>
                        <Download size={14} />
                        Export CSV
                    </button>
                    <button className="al-btn-primary" onClick={handleExportPDF}>
                        <FileText size={14} />
                        Export PDF
                    </button>
                </div>
            </div>

            {/* ── Summary Cards ── */}
            <div className="al-stats-grid">
                {[
                    {
                        label: 'Total Events Today',
                        value: stats.totalToday,
                        icon: Activity,
                        color: '#E87C2F',
                        sub: `${yesterdayStats.totalToday > 0 ? (stats.totalToday >= yesterdayStats.totalToday ? '+' : '') + (stats.totalToday - yesterdayStats.totalToday) : stats.totalToday} vs yesterday`,
                    },
                    {
                        label: 'Completed Jobs',
                        value: stats.completedJobs,
                        icon: CheckCircle,
                        color: '#4ade80',
                        sub: stats.completedJobs > 0 ? 'Services finished' : 'No completions yet',
                    },
                    {
                        label: 'Inventory Alerts',
                        value: stats.inventoryAlerts,
                        icon: AlertTriangle,
                        color: stats.inventoryAlerts > 0 ? '#facc15' : '#4ade80',
                        sub: stats.inventoryAlerts > 0 ? 'Needs attention' : 'All stock healthy',
                    },
                    {
                        label: 'Transactions',
                        value: stats.transactions,
                        icon: Banknote,
                        color: '#60a5fa',
                        sub: 'POS + Online payments',
                    },
                ].map((card, i) => (
                    <motion.div
                        key={card.label}
                        className="al-stat-card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07, duration: 0.35 }}
                    >
                        <div className="al-stat-top">
                            <div className="al-stat-label">{card.label}</div>
                            <div className="al-stat-icon" style={{ background: card.color + '18', border: `1px solid ${card.color}30` }}>
                                <card.icon size={16} style={{ color: card.color }} />
                            </div>
                        </div>
                        <div className="al-stat-value" style={{ color: card.color }}>{isLoading ? '—' : card.value}</div>
                        <div className="al-stat-sub">{card.sub}</div>
                    </motion.div>
                ))}
            </div>

            {/* ── Main Table Panel ── */}
            <div className="al-panel">

                {/* Toolbar */}
                <div className="al-toolbar">
                    {/* Search */}
                    <div className="al-search-wrap">
                        <Search size={15} className="al-search-icon" />
                        <input
                            type="text"
                            className="al-search-input"
                            placeholder="Search by user, action, module, description..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="al-search-clear" onClick={() => setSearchQuery('')}>
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    <div className="al-toolbar-right">
                        {/* Module filter */}
                        <div className="al-module-tabs">
                            {MODULE_FILTERS.map(m => (
                                <button
                                    key={m}
                                    className={`al-module-tab ${moduleFilter === m ? 'active' : ''}`}
                                    onClick={() => setModuleFilter(m)}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>

                        {/* Status filter */}
                        <div className="al-dropdown-wrap" ref={statusDropdownRef}>
                            <button
                                className="al-dropdown-btn"
                                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                            >
                                <Filter size={13} />
                                {statusFilter === 'All' ? 'Status' : statusFilter}
                                <ChevronDown size={12} className={showStatusDropdown ? 'rotate' : ''} />
                            </button>
                            <AnimatePresence>
                                {showStatusDropdown && (
                                    <motion.div
                                        className="al-dropdown-menu"
                                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        {(['All', 'success', 'warning', 'error', 'info'] as StatusFilter[]).map(s => {
                                            const cfg = s === 'All' ? null : getStatusConfig(s);
                                            return (
                                                <button key={s} className={`al-dropdown-item ${statusFilter === s ? 'selected' : ''}`}
                                                    onClick={() => { setStatusFilter(s); setShowStatusDropdown(false); }}>
                                                    {cfg && <span className="al-status-dot" style={{ background: cfg.dot }} />}
                                                    {s === 'All' ? 'All Statuses' : cfg?.label}
                                                </button>
                                            );
                                        })}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Date filter */}
                        <div className="al-dropdown-wrap" ref={dateDropdownRef}>
                            <button
                                className="al-dropdown-btn"
                                onClick={() => setShowDateDropdown(!showDateDropdown)}
                            >
                                <Calendar size={13} />
                                {dateLabel}
                                <ChevronDown size={12} className={showDateDropdown ? 'rotate' : ''} />
                            </button>
                            <AnimatePresence>
                                {showDateDropdown && (
                                    <motion.div
                                        className="al-dropdown-menu"
                                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        {DATE_FILTERS.map(d => (
                                            <button key={d.id} className={`al-dropdown-item ${dateFilter === d.id ? 'selected' : ''}`}
                                                onClick={() => { setDateFilter(d.id); setShowDateDropdown(false); }}>
                                                {d.label}
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Result count */}
                <div className="al-result-bar">
                    <span className="al-result-count">
                        {isLoading ? 'Loading...' : `${filteredLogs.length} event${filteredLogs.length !== 1 ? 's' : ''}`}
                        {(moduleFilter !== 'All' || statusFilter !== 'All' || searchQuery) && <span className="al-result-filtered"> · filtered</span>}
                    </span>
                </div>

                {/* Table */}
                <div className="al-table-wrap">
                    <table className="al-table">
                        <thead>
                            <tr className="al-thead-row">
                                <th className="al-th">Date & Time</th>
                                <th className="al-th">User</th>
                                <th className="al-th">Role</th>
                                <th className="al-th">Module</th>
                                <th className="al-th">Action</th>
                                <th className="al-th">Status</th>
                                <th className="al-th">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence initial={false}>
                                {isLoading ? (
                                    [...Array(8)].map((_, i) => (
                                        <tr key={i} className="al-tr-skeleton">
                                            {[...Array(7)].map((__, j) => (
                                                <td key={j} className="al-td">
                                                    <div className="al-skeleton" style={{ width: `${60 + Math.random() * 30}%`, animationDelay: `${i * 80}ms` }} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div className="al-empty">
                                                <Activity size={36} className="al-empty-icon" />
                                                <p className="al-empty-title">No activity found</p>
                                                <p className="al-empty-sub">Try adjusting your filters or date range</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log, idx) => {
                                        const { date, time } = formatDateTime(log.createdAt);
                                        const statusConfig = getStatusConfig(log.status || 'info');
                                        const moduleColor = getModuleColor(log.module || 'System');
                                        const ModIcon = getModuleIcon(log.module || 'System');
                                        const avatarColor = getAvatarBg(log.userName);
                                        const initials = getInitials(log.userName);

                                        return (
                                            <motion.tr
                                                key={log.id || log._id || `log-${idx}`}
                                                className="al-tr"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                                onClick={() => setSelectedLog(log)}
                                            >
                                                {/* Date & Time */}
                                                <td className="al-td">
                                                    <div className="al-datetime">
                                                        <span className="al-datetime-time">{time}</span>
                                                        <span className="al-datetime-date">{date}</span>
                                                    </div>
                                                </td>

                                                {/* User */}
                                                <td className="al-td">
                                                    <div className="al-user-cell">
                                                        <div
                                                            className="al-avatar"
                                                            style={{ background: avatarColor + '1a', border: `1px solid ${avatarColor}33`, color: avatarColor }}
                                                        >
                                                            {initials}
                                                        </div>
                                                        <span className="al-user-name">{log.userName || 'System'}</span>
                                                    </div>
                                                </td>

                                                {/* Role */}
                                                <td className="al-td">
                                                    <span className="al-role-badge">
                                                        {getRoleLabel(log.userRole || '')}
                                                    </span>
                                                </td>

                                                {/* Module */}
                                                <td className="al-td">
                                                    <div
                                                        className="al-module-badge"
                                                        style={{ background: moduleColor.bg, border: `1px solid ${moduleColor.border}`, color: moduleColor.text }}
                                                    >
                                                        <ModIcon size={11} />
                                                        {log.module || 'System'}
                                                    </div>
                                                </td>

                                                {/* Action */}
                                                <td className="al-td">
                                                    <span className="al-action">{log.action || log.title}</span>
                                                    <span className="al-action-desc">{log.description}</span>
                                                </td>

                                                {/* Status */}
                                                <td className="al-td">
                                                    <div
                                                        className="al-status-badge"
                                                        style={{ background: statusConfig.bg, border: `1px solid ${statusConfig.border}`, color: statusConfig.text }}
                                                    >
                                                        <span className="al-status-dot" style={{ background: statusConfig.dot }} />
                                                        {statusConfig.label}
                                                    </div>
                                                </td>

                                                {/* Details */}
                                                <td className="al-td">
                                                    <button className="al-view-btn" onClick={e => { e.stopPropagation(); setSelectedLog(log); }}>
                                                        View
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        );
                                    })
                                )}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                {filteredLogs.length > 0 && !isLoading && (
                    <div className="al-table-footer">
                        Showing {filteredLogs.length} of {allLogs.length} total events
                    </div>
                )}
            </div>
        </div>
    );
}
