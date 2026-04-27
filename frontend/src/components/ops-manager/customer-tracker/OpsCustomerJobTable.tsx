import React, { useState, useMemo } from 'react';
import { Search, X, Eye, Phone, AlertTriangle, ChevronUp, ChevronDown, CheckCircle2, Clock, Users } from 'lucide-react';
import type { OpsJob, OpsTechnician } from '../ops-types';
import { OpsStatusBadge } from '../ui/OpsUIKit';
import type { JobStatus } from '../ui/OpsUIKit';

const STATUS_FILTERS: (JobStatus | 'All')[] = ['All', 'Queued', 'Assigned', 'En Route', 'Ongoing', 'Completed', 'Delayed'];

const PROGRESS_STEPS = ['Queued', 'Assigned', 'En Route', 'Ongoing', 'Completed'] as const;

function getProgressStep(status: JobStatus): number {
  const map: Record<string, number> = {
    Queued: 0, Assigned: 1, 'En Route': 2, Ongoing: 3, Completed: 4, Delayed: 3, Cancelled: 0,
  };
  return map[status] ?? 0;
}

function ProgressTracker({ status }: { status: JobStatus }) {
  const current = getProgressStep(status);
  const isDelayed = status === 'Delayed';
  const isCancelled = status === 'Cancelled';

  return (
    <div className="flex items-center gap-0 min-w-[200px]">
      {PROGRESS_STEPS.map((step, i) => {
        const isComplete = current > i;
        const isActive = current === i;
        const isLast = i === PROGRESS_STEPS.length - 1;
        const dotColor = isCancelled ? 'bg-gray-200'
          : isDelayed && isActive ? 'bg-red-500'
          : isComplete || isActive ? 'bg-indigo-600' : 'bg-gray-200';
        const lineColor = isComplete ? 'bg-indigo-600' : 'bg-gray-200';

        return (
          <React.Fragment key={`prog-${step}`}>
            <div className="relative group/step flex-shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${dotColor} ${isActive && !isCancelled ? 'ring-2 ring-indigo-200 ring-offset-1' : ''}`} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover/step:opacity-100 transition-opacity duration-150 pointer-events-none z-10">
                {step}{isActive && isDelayed ? ' (Delayed)' : ''}
              </div>
            </div>
            {!isLast && (
              <div className={`flex-1 h-0.5 transition-all duration-300 ${lineColor} min-w-[16px]`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

type SortKey = 'jobNumber' | 'customer' | 'status' | 'priority' | 'scheduledAt' | 'slaStatus';

interface Props {
  jobs: OpsJob[];
  technicians: OpsTechnician[];
  onJobClick: (job: OpsJob) => void;
  onStatusChange: (jobId: string, status: JobStatus) => void;
}

const priorityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export default function OpsCustomerJobTable({ jobs, technicians, onJobClick, onStatusChange }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = [...jobs];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(j =>
        j.jobNumber.toLowerCase().includes(q) ||
        j.customer.toLowerCase().includes(q) ||
        j.serviceType.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'All') result = result.filter(j => j.status === statusFilter);

    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortKey === 'priority') {
        aVal = priorityOrder[a.priority] ?? 9;
        bVal = priorityOrder[b.priority] ?? 9;
      } else {
        aVal = (a as any)[sortKey] ?? '';
        bVal = (b as any)[sortKey] ?? '';
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [jobs, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp size={12} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-indigo-500" />
      : <ChevronDown size={12} className="text-indigo-500" />;
  };

  const getTech = (id: string | null) => technicians.find(t => t.id === id) ?? null;

  const slaChip = (sla: string) => {
    if (sla === 'Breached') return <span className="ops-badge bg-red-50 text-red-700 text-[10.5px]"><AlertTriangle size={9} />Breached</span>;
    if (sla === 'At Risk') return <span className="ops-badge bg-amber-50 text-amber-700 text-[10.5px]"><Clock size={9} />At Risk</span>;
    return <span className="ops-badge bg-green-50 text-green-700 text-[10.5px]"><CheckCircle2 size={9} />On Track</span>;
  };

  return (
    <div className="ops-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <div className="flex-1">
            <h3 className="text-[14px] font-semibold text-gray-900">Customer Job Tracker</h3>
            <p className="text-[12px] text-gray-400 mt-0.5">{filtered.length} jobs across all customers</p>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer or job…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="ops-input pl-9 !w-56"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => {
            const count = s === 'All' ? jobs.length : jobs.filter(j => j.status === s).length;
            return (
              <button
                key={`ctf-${s}`}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`flex items-center gap-1.5 text-[11.5px] px-3 py-1.5 rounded-full font-medium transition-all duration-150 ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
                <span className={`text-[10px] px-1 py-0.5 rounded-full tabular-nums ${
                  statusFilter === s ? 'bg-white/20 text-white' : 'bg-white text-gray-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto ops-scrollbar-thin">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b border-gray-100">
              {[
                { key: 'jobNumber' as SortKey, label: 'Job ID' },
                { key: 'customer' as SortKey, label: 'Customer' },
                { key: null, label: 'Service' },
                { key: 'status' as SortKey, label: 'Status' },
                { key: null, label: 'Progress' },
                { key: null, label: 'Technician' },
                { key: 'scheduledAt' as SortKey, label: 'Scheduled' },
                { key: null, label: 'ETA' },
                { key: 'slaStatus' as SortKey, label: 'SLA' },
                { key: null, label: 'Last Update' },
              ].map(({ key, label }) => (
                <th
                  key={`ctth-${label}`}
                  className={`text-left py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap ${
                    key ? 'cursor-pointer hover:text-gray-600 select-none' : ''
                  }`}
                  onClick={key ? () => toggleSort(key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {label}
                    {key && <SortIcon col={key} />}
                  </span>
                </th>
              ))}
              <th className="py-3 pr-5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={11} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                      <Users size={18} className="text-gray-400" />
                    </div>
                    <p className="text-[14px] font-medium text-gray-700">No customer jobs found</p>
                    <p className="text-[12px] text-gray-400">Try adjusting your search or status filter</p>
                    <button
                      onClick={() => { setStatusFilter('All'); setSearch(''); }}
                      className="mt-2 text-[12px] text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Clear filters
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {paginated.map(job => {
              const tech = getTech(job.technicianId);
              const isDelayed = job.status === 'Delayed';
              const isBreached = job.slaStatus === 'Breached';

              return (
                <tr
                  key={job.id}
                  className={`transition-colors duration-150 group ${
                    isBreached ? 'bg-red-50/30 hover:bg-red-50/50' : isDelayed ? 'bg-amber-50/20 hover:bg-amber-50/40' : 'hover:bg-gray-50/60'
                  }`}
                >
                  <td className="py-4 pl-4 pr-4">
                    <span className="font-mono text-[12px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {job.jobNumber}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <div>
                      <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[150px]">{job.customer}</p>
                      {job.customerPhone && (
                        <a href={`tel:${job.customerPhone}`} className="text-[11px] text-gray-400 hover:text-indigo-600 flex items-center gap-1 mt-0.5 transition-colors">
                          <Phone size={9} />
                          {job.customerPhone}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <p className="text-[12.5px] text-gray-600 whitespace-nowrap">{job.serviceType}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{job.area}</p>
                  </td>
                  <td className="py-4 pr-4 relative">
                    <button
                      onClick={() => setStatusDropdown(statusDropdown === job.id ? null : job.id)}
                      className="hover:opacity-80 transition-opacity"
                      title="Click to change status"
                    >
                      <OpsStatusBadge status={job.status} />
                    </button>
                    {statusDropdown === job.id && (
                      <div className="absolute left-0 top-full mt-1 z-30 bg-white rounded-xl py-1 min-w-[150px] ops-animate-scale-in" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.10)' }}>
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Change Status</p>
                        {(['Queued', 'Assigned', 'En Route', 'Ongoing', 'Completed', 'Delayed'] as JobStatus[]).map(s => (
                          <button
                            key={`ctsd-${s}`}
                            onClick={() => { onStatusChange(job.id, s); setStatusDropdown(null); }}
                            className="w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50 flex items-center gap-2"
                          >
                            <OpsStatusBadge status={s} />
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-4 pr-6">
                    <ProgressTracker status={job.status} />
                  </td>
                  <td className="py-4 pr-4">
                    {tech ? (
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0 ${tech.avatar}`}>
                          {tech.initials}
                        </div>
                        <div>
                          <p className="text-[12px] font-medium text-gray-800 whitespace-nowrap">{tech.name}</p>
                          <p className="text-[10.5px] text-gray-400">{tech.specialty}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12px] text-gray-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="py-4 pr-4">
                    <span className="text-[12.5px] text-gray-600 tabular-nums whitespace-nowrap">{job.scheduledAt}</span>
                  </td>
                  <td className="py-4 pr-4">
                    <span className={`text-[12.5px] tabular-nums whitespace-nowrap ${
                      job.status === 'Delayed' ? 'text-red-600 font-semibold' :
                      job.status === 'Completed' ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {job.eta}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    {slaChip(job.slaStatus)}
                  </td>
                  <td className="py-4 pr-4">
                    <p className="text-[11.5px] text-gray-400 whitespace-nowrap tabular-nums">
                      {(() => {
                        try {
                          const d = new Date(job.updatedAt);
                          return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        } catch { return '—'; }
                      })()}
                    </p>
                  </td>
                  <td className="py-4 pr-5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                        onClick={() => onJobClick(job)}
                        title="View full job detail"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-150"
                      >
                        <Eye size={14} />
                      </button>
                      {job.customerPhone && (
                        <a
                          href={`tel:${job.customerPhone}`}
                          title="Call customer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all duration-150"
                        >
                          <Phone size={14} />
                        </a>
                      )}
                      {(isDelayed || isBreached) && (
                        <button
                          title="Flag for escalation"
                          className="p-1.5 rounded-lg text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-all duration-150"
                        >
                          <AlertTriangle size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
        <span className="text-[12px] text-gray-400">
          Showing {Math.min((page - 1) * perPage + 1, filtered.length)}–{Math.min(page * perPage, filtered.length)} of {filtered.length} jobs
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
            <button
              key={`ctpage-${p}`}
              onClick={() => setPage(p)}
              className={`w-7 h-7 text-[12px] font-medium rounded-lg transition-colors ${
                page === p ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || totalPages === 0}
            className="px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
