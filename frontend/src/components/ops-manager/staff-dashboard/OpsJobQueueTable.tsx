import React, { useState, useMemo } from 'react';
import { Search, Filter, ChevronUp, ChevronDown, Eye, Edit2, UserPlus, MoreHorizontal, GripVertical, X, Trash2 } from 'lucide-react';
import type { OpsJob, OpsTechnician } from '../ops-types';
import { OpsStatusBadge, OpsPriorityBadge } from '../ui/OpsUIKit';
import type { JobStatus } from '../ui/OpsUIKit';

const STATUS_FILTERS: (JobStatus | 'All')[] = ['All', 'Queued', 'Assigned', 'En Route', 'Ongoing', 'Completed', 'Delayed'];
const PRIORITY_FILTERS = ['All', 'Critical', 'High', 'Medium', 'Low'];

type SortKey = 'jobNumber' | 'customer' | 'priority' | 'status' | 'area' | 'scheduledAt' | 'slaStatus';

interface Props {
  jobs: OpsJob[];
  technicians: OpsTechnician[];
  onJobClick: (job: OpsJob) => void;
  onAssign: (jobId: string, techId: string) => void;
  onStatusChange: (jobId: string, status: JobStatus) => void;
  onDragStart: (jobId: string) => void;
  onDragEnd: () => void;
  draggedJobId: string | null;
}

const priorityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export default function OpsJobQueueTable({
  jobs, technicians, onJobClick, onAssign, onStatusChange, onDragStart, onDragEnd, draggedJobId
}: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);
  const [assignDropdown, setAssignDropdown] = useState<string | null>(null);
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = [...jobs];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(j =>
        j.jobNumber.toLowerCase().includes(q) ||
        j.customer.toLowerCase().includes(q) ||
        j.serviceType.toLowerCase().includes(q) ||
        j.area.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'All') result = result.filter(j => j.status === statusFilter);
    if (priorityFilter !== 'All') result = result.filter(j => j.priority === priorityFilter);

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
  }, [jobs, search, statusFilter, priorityFilter, sortKey, sortDir]);

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

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === paginated.length) setSelected(new Set());
    else setSelected(new Set(paginated.map(j => j.id)));
  };

  const getTechName = (id: string | null) => {
    if (!id) return null;
    return technicians.find(t => t.id === id)?.name ?? null;
  };

  const slaColor = (sla: string) => {
    if (sla === 'Breached') return 'text-red-600 font-semibold';
    if (sla === 'At Risk') return 'text-amber-600 font-semibold';
    return 'text-green-600';
  };

  return (
    <div className="ops-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h3 className="text-[14px] font-semibold text-gray-900">Job Queue</h3>
            <p className="text-[12px] text-gray-400 mt-0.5">{filtered.length} jobs · {jobs.filter(j => !j.technicianId && j.status === 'Queued').length} unassigned</p>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs…"
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
          <button className="ops-btn-secondary flex items-center gap-2 text-[13px]">
            <Filter size={13} />
            Filters
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[11px] text-gray-400 font-medium">Status:</span>
          {STATUS_FILTERS.map(s => (
            <button
              key={`sf-${s}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`text-[11.5px] px-2.5 py-1 rounded-full font-medium transition-all duration-150 ${
                statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
          <span className="text-gray-200 mx-1">|</span>
          <span className="text-[11px] text-gray-400 font-medium">Priority:</span>
          {PRIORITY_FILTERS.map(p => (
            <button
              key={`pf-${p}`}
              onClick={() => { setPriorityFilter(p); setPage(1); }}
              className={`text-[11.5px] px-2.5 py-1 rounded-full font-medium transition-all duration-150 ${
                priorityFilter === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-2.5 flex items-center gap-3 ops-animate-fade-in">
          <span className="text-[13px] font-medium text-indigo-700">{selected.size} selected</span>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[12px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X size={12} />
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto ops-scrollbar-thin">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="w-10 pl-5 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === paginated.length && paginated.length > 0}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="w-8 py-3" />
              {[
                { key: 'jobNumber' as SortKey, label: 'Job ID' },
                { key: 'customer' as SortKey, label: 'Customer' },
                { key: null, label: 'Service Type' },
                { key: 'priority' as SortKey, label: 'Priority' },
                { key: 'status' as SortKey, label: 'Status' },
                { key: null, label: 'Technician' },
                { key: 'area' as SortKey, label: 'Vehicle' },
                { key: 'scheduledAt' as SortKey, label: 'Scheduled' },
                { key: 'slaStatus' as SortKey, label: 'SLA' },
              ].map(({ key, label }) => (
                <th
                  key={`th-${label}`}
                  className={`text-left py-3 pr-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap ${
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
                <td colSpan={12} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                      <Search size={18} className="text-gray-400" />
                    </div>
                    <p className="text-[14px] font-medium text-gray-700">No jobs match your filters</p>
                    <p className="text-[12px] text-gray-400">Try adjusting the status or priority filter above</p>
                    <button
                      onClick={() => { setStatusFilter('All'); setPriorityFilter('All'); setSearch(''); }}
                      className="mt-2 text-[12px] text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {paginated.map(job => {
              const techName = getTechName(job.technicianId);
              const isSelected = selected.has(job.id);
              const isDragged = draggedJobId === job.id;

              return (
                <tr
                  key={job.id}
                  draggable={job.status === 'Queued'}
                  onDragStart={() => onDragStart(job.id)}
                  onDragEnd={onDragEnd}
                  className={`transition-all duration-150 group ${
                    isSelected ? 'bg-indigo-50/60' : 'hover:bg-gray-50/60'
                  } ${isDragged ? 'opacity-40' : ''} ${job.status === 'Queued' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <td className="pl-5 py-3.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(job.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="py-3.5 pr-1">
                    {job.status === 'Queued' && (
                      <GripVertical size={14} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                    )}
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className="font-mono text-[12px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {job.jobNumber}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <p className="text-[13px] font-medium text-gray-800 truncate max-w-[140px]">{job.customer}</p>
                  </td>
                  <td className="py-3.5 pr-4">
                    <p className="text-[12.5px] text-gray-600 whitespace-nowrap">{job.serviceType}</p>
                  </td>
                  <td className="py-3.5 pr-4">
                    <OpsPriorityBadge priority={job.priority} />
                  </td>
                  <td className="py-3.5 pr-4 relative">
                    <button
                      onClick={() => setStatusDropdown(statusDropdown === job.id ? null : job.id)}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <OpsStatusBadge status={job.status} />
                    </button>
                    {statusDropdown === job.id && (
                      <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl py-1 min-w-[140px] ops-animate-scale-in" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.10)' }}>
                        {(['Queued', 'Assigned', 'En Route', 'Ongoing', 'Completed', 'Delayed', 'Cancelled'] as JobStatus[]).map(s => (
                          <button
                            key={`sd-${s}`}
                            onClick={() => { onStatusChange(job.id, s); setStatusDropdown(null); }}
                            className="w-full text-left px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <OpsStatusBadge status={s} />
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 pr-4 relative">
                    {techName ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-semibold text-indigo-700">
                            {techName.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <span className="text-[12.5px] text-gray-700 whitespace-nowrap">{techName}</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAssignDropdown(assignDropdown === job.id ? null : job.id)}
                        className="flex items-center gap-1.5 text-[12px] text-indigo-600 hover:text-indigo-700 font-medium px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      >
                        <UserPlus size={11} />
                        Assign
                      </button>
                    )}
                    {assignDropdown === job.id && (
                      <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl py-1 min-w-[180px] ops-animate-scale-in" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.10)' }}>
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                          Select Technician
                        </p>
                        {technicians.filter(t => t.status !== 'Offline').map(tech => (
                          <button
                            key={`ad-${tech.id}`}
                            onClick={() => { onAssign(job.id, tech.id); setAssignDropdown(null); }}
                            className="w-full text-left px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold ${tech.avatar}`}>
                              {tech.initials}
                            </div>
                            <span className="flex-1">{tech.name}</span>
                            <span className="text-[10px] text-gray-400 tabular-nums">{tech.activeJobs}/{tech.maxJobs}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className="text-[12px] text-gray-500 whitespace-nowrap">{job.area}</span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className="text-[12px] text-gray-600 tabular-nums whitespace-nowrap">{job.scheduledAt}</span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className={`text-[12px] whitespace-nowrap ${slaColor(job.slaStatus)}`}>
                      {job.slaStatus}
                    </span>
                  </td>
                  <td className="py-3.5 pr-5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                        onClick={() => onJobClick(job)}
                        title="View job details"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-150"
                      >
                        <Eye size={14} />
                      </button>
                      <button title="Edit job" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150">
                        <Edit2 size={14} />
                      </button>
                      <button title="More actions" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150">
                        <MoreHorizontal size={14} />
                      </button>
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
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-400">Show</span>
          <select
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="text-[12px] rounded-lg px-2 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
          >
            {[5, 8, 10, 20].map(n => (
              <option key={`pp-${n}`} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-[12px] text-gray-400">of {filtered.length} jobs</span>
        </div>
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
              key={`page-${p}`}
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
