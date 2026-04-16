import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Download, ChevronLeft, ChevronRight, Search, Activity, Clock } from 'lucide-react';
import { pageVariants } from './SharedAnimations';
import { ActivityService, type EnrichedActivityLog } from '@/lib/activity-service-api';
import type { Booking } from '@/types';
import { toast } from 'sonner';

interface HistoryTabProps {
    completedJobs: Booking[];
}

const getJobId = (job: Booking) => (job.id || (job as any)._id) as string;

const getStatusBadge = (status: string) => {
    switch (status) {
        case 'completed':
            return { label: 'Completed', bg: 'rgba(34,197,94,0.12)', color: '#166534' };
        case 'released':
        case 'ready':
            return { label: 'Delivered', bg: 'rgba(34,197,94,0.12)', color: '#166534' };
        case 'paid':
            return { label: 'Invoiced', bg: 'rgba(59,130,246,0.12)', color: '#1d4ed8' };
        case 'cancelled':
            return { label: 'Cancelled', bg: 'rgba(186,26,26,0.08)', color: '#ba1a1a' };
        default:
            return { label: status?.toUpperCase() || 'UNKNOWN', bg: 'rgba(6,39,75,0.06)', color: '#06274b' };
    }
};

const getInitials = (name?: string) => {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

const initialsColors = ['#dae2fd', '#d5e3fc', '#d5e3ff', '#ffdad6', '#e0e3e5'];

export function HistoryTab({ completedJobs }: HistoryTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [activityLogs, setActivityLogs] = useState<EnrichedActivityLog[]>([]);
    const [activeSubTab, setActiveSubTab] = useState<'records' | 'activity'>('records');
    const [loadingLogs, setLoadingLogs] = useState(false);
    const itemsPerPage = 10;

    useEffect(() => {
        if (activeSubTab === 'activity') {
            let mounted = true;
            setLoadingLogs(true);
            ActivityService.getActivityLogs({ limit: 50 })
                .then(res => {
                    if (mounted && res.success) setActivityLogs(res.data || []);
                })
                .catch(err => console.error('Failed to load activity logs:', err))
                .finally(() => { if (mounted) setLoadingLogs(false); });
            return () => { mounted = false; };
        }
    }, [activeSubTab]);

    // View Details handler
    const [detailJob, setDetailJob] = useState<Booking | null>(null);

    // Filter jobs
    const filteredJobs = completedJobs.filter(job => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (job.customerName || '').toLowerCase().includes(q) ||
            (job.vehicleInfo || '').toLowerCase().includes(q) ||
            (job.serviceName || '').toLowerCase().includes(q) ||
            getJobId(job)?.toLowerCase().includes(q)
        );
    });

    // Export CSV handler
    const handleExportCsv = useCallback(() => {
        if (filteredJobs.length === 0) {
            toast.error('No records to export.');
            return;
        }
        const headers = ['Order ID', 'Date', 'Customer', 'Vehicle', 'Package', 'Status'];
        const rows = filteredJobs.map(job => [
            `#${getJobId(job)?.slice(-6) || '—'}`,
            job.updatedAt ? new Date(job.updatedAt).toLocaleDateString() : '—',
            job.customerName || 'Unknown',
            job.vehicleInfo || '—',
            job.serviceName || '—',
            job.status?.toUpperCase() || 'UNKNOWN'
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `service-records-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${filteredJobs.length} records.`);
    }, [filteredJobs]);
    const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
    const paginatedJobs = filteredJobs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const formatTime = (dateStr?: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        <motion.div key="history" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ paddingBottom: 40 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '2.5rem', fontWeight: 800, color: '#06274b', margin: 0, letterSpacing: '-0.5px' }}>
                        History
                    </h2>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: '#515f74', margin: '4px 0 0', fontWeight: 500 }}>
                        Review and manage {completedJobs.length.toLocaleString()} completed detailing service records.
                    </p>
                </div>
                <button onClick={handleExportCsv} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', background: '#fff', border: '1px solid rgba(196,198,205,0.3)',
                    borderRadius: 12, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                    color: '#43474c', cursor: 'pointer', boxShadow: '0 1px 3px rgba(6,39,75,0.04)',
                    transition: 'all 0.15s ease'
                }}>
                    <Download style={{ width: 16, height: 16 }} /> Export CSV
                </button>
            </div>

            {/* Sub-tab Switcher */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#f2f4f6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
                <button onClick={() => { setActiveSubTab('records'); setCurrentPage(1); }} style={{
                    padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                    background: activeSubTab === 'records' ? '#fff' : 'transparent',
                    color: activeSubTab === 'records' ? '#06274b' : '#74777d',
                    boxShadow: activeSubTab === 'records' ? '0 1px 3px rgba(6,39,75,0.08)' : 'none',
                    transition: 'all 0.2s ease'
                }}>Service Records</button>
                <button onClick={() => setActiveSubTab('activity')} style={{
                    padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                    background: activeSubTab === 'activity' ? '#fff' : 'transparent',
                    color: activeSubTab === 'activity' ? '#06274b' : '#74777d',
                    boxShadow: activeSubTab === 'activity' ? '0 1px 3px rgba(6,39,75,0.08)' : 'none',
                    transition: 'all 0.2s ease'
                }}>Activity Log</button>
            </div>

            {activeSubTab === 'records' ? (
                <>
                    {/* Filter Bar */}
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
                        padding: 16, background: '#f2f4f6', borderRadius: 12, marginBottom: 24
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#43474c', padding: '0 8px' }}>
                            <Search style={{ width: 14, height: 14 }} />
                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Filters</span>
                        </div>
                        <div style={{ position: 'relative', width: 280 }}>
                            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#9fa3a9' }} />
                            <input
                                type="text"
                                placeholder="Search orders, vehicles, or clients..."
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                style={{
                                    width: '100%', padding: '8px 12px 8px 36px', background: '#fff', border: 'none',
                                    borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 13,
                                    outline: 'none', color: '#191c1e'
                                }}
                            />
                        </div>
                    </div>

                    {/* Data Table */}
                    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(6,39,75,0.04)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'rgba(242,244,246,0.5)' }}>
                                    {['Order ID', 'Date', 'Customer', 'Vehicle Model', 'Package', 'Status', ''].map((col, i) => (
                                        <th key={i} style={{
                                            padding: '16px 24px', fontFamily: "'Inter', sans-serif", fontSize: 11,
                                            fontWeight: 700, color: '#43474c', textTransform: 'uppercase',
                                            letterSpacing: '0.06em', borderBottom: '1px solid rgba(6,39,75,0.06)',
                                            textAlign: i === 6 ? 'right' : 'left'
                                        }}>{col}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedJobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: 64, textAlign: 'center', fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#74777d' }}>
                                            {searchQuery ? 'No matching records found.' : 'No completed service records yet.'}
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedJobs.map((job, idx) => {
                                        const badge = getStatusBadge(job.status);
                                        const initials = getInitials(job.customerName);
                                        return (
                                            <tr key={getJobId(job) || idx} style={{
                                                borderBottom: '1px solid rgba(6,39,75,0.04)',
                                                transition: 'background 0.15s ease',
                                                cursor: 'default'
                                            }}
                                                onMouseOver={e => (e.currentTarget.style.background = '#f7f9fb')}
                                                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <td style={{ padding: '20px 24px' }}>
                                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#06274b' }}>
                                                        #{getJobId(job)?.slice(-6) || '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '20px 24px' }}>
                                                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: '#191c1e' }}>
                                                        {formatDate(job.updatedAt || (job as any).createdAt)}
                                                    </div>
                                                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#43474c' }}>
                                                        {formatTime(job.updatedAt || (job as any).createdAt)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '20px 24px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        {job.customerAvatar ? (
                                                            <img 
                                                                src={job.customerAvatar} 
                                                                alt={job.customerName || 'Customer'}
                                                                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: 32, height: 32, borderRadius: '50%',
                                                                background: initialsColors[idx % initialsColors.length],
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#06274b',
                                                                flexShrink: 0
                                                            }}>{initials}</div>
                                                        )}
                                                        <div>
                                                            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: '#191c1e' }}>
                                                                {job.customerName || 'Unknown'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '20px 24px', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: '#191c1e' }}>
                                                    {job.vehicleInfo || '—'}
                                                </td>
                                                <td style={{ padding: '20px 24px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#43474c' }}>
                                                    {job.serviceName || '—'}
                                                </td>
                                                <td style={{ padding: '20px 24px' }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center',
                                                        padding: '4px 12px', borderRadius: 9999,
                                                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                                                        background: badge.bg, color: badge.color
                                                    }}>{badge.label}</span>
                                                </td>
                                                <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                                                    <button onClick={() => setDetailJob(job)} style={{
                                                        fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700,
                                                        color: '#06274b', background: 'none', border: 'none',
                                                        cursor: 'pointer', textDecoration: 'underline',
                                                        textUnderlineOffset: 4, opacity: 0.7
                                                    }}>View Details</button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {filteredJobs.length > itemsPerPage && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, padding: '0 8px' }}>
                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#43474c', fontWeight: 500 }}>
                                Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredJobs.length)} of {filteredJobs.length.toLocaleString()} service records
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                                    style={{
                                        padding: 8, background: '#fff', border: '1px solid rgba(196,198,205,0.3)',
                                        borderRadius: 8, color: '#06274b', cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === 1 ? 0.3 : 1, display: 'flex', alignItems: 'center'
                                    }}>
                                    <ChevronLeft style={{ width: 16, height: 16 }} />
                                </button>
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                    let page: number;
                                    if (totalPages <= 5) { page = i + 1; }
                                    else if (currentPage <= 3) { page = i + 1; }
                                    else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i; }
                                    else { page = currentPage - 2 + i; }
                                    return (
                                        <button key={page} onClick={() => setCurrentPage(page)} style={{
                                            width: 32, height: 32, borderRadius: 8, border: 'none',
                                            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                            background: page === currentPage ? '#06274b' : 'transparent',
                                            color: page === currentPage ? '#fff' : '#06274b',
                                            transition: 'all 0.15s ease'
                                        }}>{page}</button>
                                    );
                                })}
                                {totalPages > 5 && <span style={{ padding: '0 4px', color: '#43474c' }}>…</span>}
                                {totalPages > 5 && (
                                    <button onClick={() => setCurrentPage(totalPages)} style={{
                                        width: 32, height: 32, borderRadius: 8, border: 'none',
                                        fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        background: currentPage === totalPages ? '#06274b' : 'transparent',
                                        color: currentPage === totalPages ? '#fff' : '#06274b'
                                    }}>{totalPages}</button>
                                )}
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                                    style={{
                                        padding: 8, background: '#fff', border: '1px solid rgba(196,198,205,0.3)',
                                        borderRadius: 8, color: '#06274b', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === totalPages ? 0.3 : 1, display: 'flex', alignItems: 'center'
                                    }}>
                                    <ChevronRight style={{ width: 16, height: 16 }} />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                /* Activity Log Sub-Tab */
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(6,39,75,0.05)', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(6,39,75,0.06)' }}>
                        <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 700, color: '#06274b', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                            <Activity style={{ width: 14, height: 14, color: '#06274b' }} /> Workspace Activity Log
                        </h3>
                        {loadingLogs && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#74777d' }}>Refreshing...</span>}
                    </div>
                    <div style={{ padding: 24 }}>
                        {activityLogs.length === 0 && !loadingLogs ? (
                            <div style={{ textAlign: 'center', padding: '48px 0' }}>
                                <Activity style={{ width: 32, height: 32, color: '#c4c6cd', margin: '0 auto 12px', display: 'block' }} />
                                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#74777d' }}>No activity logs found.</p>
                            </div>
                        ) : (
                            <div style={{ position: 'relative', borderLeft: '2px solid rgba(196,198,205,0.4)', marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
                                {activityLogs.map((log, idx) => (
                                    <motion.div key={log.id || idx} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx * 0.05, 1) }} style={{ position: 'relative', paddingLeft: 32 }}>
                                        <span style={{ position: 'absolute', left: -7, top: 6, width: 12, height: 12, borderRadius: '50%', ...getDotStyle(log.status) }} />
                                        <div style={{ background: '#f7f9fb', borderRadius: 10, padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                <h4 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 13, color: '#191c1e', margin: 0 }}>{log.action || log.title}</h4>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#74777d', flexShrink: 0 }}>
                                                    <Clock style={{ width: 10, height: 10 }} /> {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date(log.createdAt).toLocaleDateString() : 'Just now'}
                                                </span>
                                            </div>
                                            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#43474c', margin: '0 0 10px' }}>{log.description}</p>
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
            )}
            {/* View Details Modal */}
            {detailJob && (
                <div onClick={() => setDetailJob(null)} style={{
                    position: 'fixed', inset: 0, background: 'rgba(6,39,75,0.3)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
                }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 520,
                            boxShadow: '0 20px 60px rgba(6,39,75,0.15)', maxHeight: '80vh', overflowY: 'auto'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <h3 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 800, color: '#06274b', margin: 0 }}>
                                Service Record
                            </h3>
                            <button onClick={() => setDetailJob(null)} style={{
                                width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f2f4f6',
                                cursor: 'pointer', fontSize: 16, color: '#43474c', fontWeight: 700
                            }}>✕</button>
                        </div>

                        {/* Detail fields */}
                        {[{ label: 'Order ID', value: `#${getJobId(detailJob)?.slice(-6) || '—'}` },
                          { label: 'Customer', value: detailJob.customerName || 'Unknown' },
                          { label: 'Vehicle', value: detailJob.vehicleInfo || '—' },
                          { label: 'Service Package', value: detailJob.serviceName || '—' },
                          { label: 'Status', value: detailJob.status?.toUpperCase() || 'UNKNOWN' },
                          { label: 'Completed', value: formatDate(detailJob.updatedAt || (detailJob as any).createdAt) + ' ' + formatTime(detailJob.updatedAt || (detailJob as any).createdAt) },
                          { label: 'Notes', value: detailJob.notes || 'No notes recorded.' },
                        ].map((field, i) => (
                            <div key={i} style={{ marginBottom: 16 }}>
                                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#74777d', marginBottom: 4 }}>
                                    {field.label}
                                </p>
                                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, color: '#191c1e', margin: 0, lineHeight: 1.5 }}>
                                    {field.value}
                                </p>
                            </div>
                        ))}

                        {/* Service Steps if available */}
                        {detailJob.serviceSteps && detailJob.serviceSteps.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#74777d', marginBottom: 8 }}>
                                    Service Checklist
                                </p>
                                {detailJob.serviceSteps.map((step, si) => (
                                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontFamily: "'Inter', sans-serif", fontSize: 13 }}>
                                        <span style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: step.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(6,39,75,0.06)', color: step.status === 'completed' ? '#166534' : '#74777d' }}>
                                            {step.status === 'completed' ? '✓' : '○'}
                                        </span>
                                        <span style={{ color: '#191c1e' }}>{step.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
}
