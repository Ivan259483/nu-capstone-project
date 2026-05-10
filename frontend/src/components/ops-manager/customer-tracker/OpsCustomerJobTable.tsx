import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Eye, Phone, AlertTriangle, ChevronUp, ChevronDown, CheckCircle2, Clock, Users, SlidersHorizontal } from 'lucide-react';
import type { OpsJob, OpsTechnician } from '../ops-types';
import { OpsStatusBadge } from '../ui/OpsUIKit';
import type { JobStatus } from '../ui/OpsUIKit';
import { getLiveTrackerStepIndex, LIVE_TRACKER_PROGRESS_LABELS } from '@/lib/customer-live-tracker-step';

const STATUS_FILTERS: (JobStatus | 'All')[] = ['All', 'Queued', 'Assigned', 'En Route', 'Ongoing', 'Completed', 'Delayed'];

/** When `_booking` is missing, approximate customer tracker index from coarse ops status */
function fallbackLiveStepFromOpsStatus(status: JobStatus): number {
  switch (status) {
    case 'Queued':
      return 0;
    case 'Assigned':
      return 1;
    case 'En Route':
      return 2;
    case 'Ongoing':
      return 3;
    case 'Completed':
      return 5;
    case 'Delayed':
      return 3;
    case 'Cancelled':
      return 0;
    default:
      return 0;
  }
}

function ProgressTracker({ job }: { job: OpsJob }) {
  const current = job._booking
    ? getLiveTrackerStepIndex(job._booking)
    : fallbackLiveStepFromOpsStatus(job.status);
  const isDelayed = job.status === 'Delayed';
  const isCancelled = job.status === 'Cancelled';

  return (
    <div className="flex min-w-[220px] max-w-[min(100%,320px)] items-center gap-0">
      {LIVE_TRACKER_PROGRESS_LABELS.map((step, i) => {
        const isComplete = current > i;
        const isActive = current === i;
        const isLast = i === LIVE_TRACKER_PROGRESS_LABELS.length - 1;
        const dotColor = isCancelled ? 'bg-slate-200'
          : isDelayed && isActive ? 'bg-red-500'
          : isComplete || isActive ? 'bg-slate-800' : 'bg-slate-200';
        const lineColor = isComplete ? 'bg-slate-800' : 'bg-slate-200';

        return (
          <React.Fragment key={`prog-${step}`}>
            <div className="group/step relative flex-shrink-0">
              <div
                className={`h-2 w-2 rounded-full transition-all duration-300 ${dotColor} ${
                  isActive && !isCancelled ? 'ring-2 ring-slate-300 ring-offset-1' : ''
                }`}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/step:opacity-100">
                {step}{isActive && isDelayed ? ' (delayed)' : ''}
              </div>
            </div>
            {!isLast && (
              <div className={`h-px min-w-[8px] flex-1 transition-all duration-300 ${lineColor}`} />
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
type SlaFilter = 'All' | 'On Track' | 'At Risk' | 'Breached';

export default function OpsCustomerJobTable({ jobs, technicians, onJobClick, onStatusChange }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'All'>('All');
  const [slaFilter, setSlaFilter] = useState<SlaFilter>('All');
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
          j.serviceType.toLowerCase().includes(q) ||
          j.customerPhone.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'All') result = result.filter(j => j.status === statusFilter);
    if (slaFilter !== 'All') result = result.filter(j => j.slaStatus === slaFilter);

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
  }, [jobs, search, slaFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, perPage * page);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp size={12} className="text-slate-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-slate-700" />
      : <ChevronDown size={12} className="text-slate-700" />;
  };

  const getTech = (id: string | null) => technicians.find(t => t.id === id) ?? null;
  const hasExtraFilters = search || statusFilter !== 'All' || slaFilter !== 'All';

  const slaChip = (sla: string) => {
    if (sla === 'Breached') return <span className="ops-badge bg-red-50 text-red-800 text-[10.5px] shadow-[0_2px_8px_-2px_rgba(220,38,38,0.2)]"><AlertTriangle size={9} />Breached</span>;
    if (sla === 'At Risk') return <span className="ops-badge bg-amber-50 text-amber-900 text-[10.5px] shadow-[0_2px_8px_-2px_rgba(217,119,6,0.18)]"><Clock size={9} />At risk</span>;
    return <span className="ops-badge bg-emerald-50 text-emerald-800 text-[10.5px] shadow-[0_2px_8px_-2px_rgba(5,150,105,0.16)]"><CheckCircle2 size={9} />On track</span>;
  };

  return (
      <div className="ct-job-shell ops-card overflow-hidden rounded-[28px]">
      {/* Toolbar */}
      <div className="bg-gradient-to-b from-slate-50/90 to-white px-4 py-4 shadow-[inset_0_-1px_0_0_rgba(15,23,42,0.04)] sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700 shadow-[0_4px_14px_-4px_rgba(37,99,235,0.22)]">
              <Users size={12} />
              Customer live board
            </div>
            <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-slate-900">Customer job tracker</h3>
            <p className="mt-0.5 text-[12px] text-slate-500">
              <span className="font-medium tabular-nums text-slate-700">{filtered.length}</span> jobs across all customer users
            </p>
          </div>
          <div className="relative w-full min-w-0 lg:max-w-md lg:flex-shrink-0">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search customer, job ID, service, or phone..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="ct-search-input h-10 w-full rounded-xl border-0 bg-slate-50/90 pl-10 pr-9 text-[13px] text-slate-800 shadow-[0_4px_16px_-6px_rgba(15,23,42,0.08),0_1px_4px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/10"
              autoComplete="off"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100/80 p-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] sm:gap-1">
            {STATUS_FILTERS.map(s => {
              const count = s === 'All' ? jobs.length : jobs.filter(j => j.status === s).length;
              const active = statusFilter === s;
              return (
                <button
                  key={`ctf-${s}`}
                  type="button"
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all ${
                    active
                      ? 'bg-white text-slate-900 shadow-[0_6px_20px_-6px_rgba(15,23,42,0.12),0_2px_6px_rgba(15,23,42,0.05)]'
                      : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                  }`}
                >
                  {s}
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                      active ? 'bg-slate-100 text-slate-700' : 'bg-slate-200/60 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="ct-filter-select">
              <span>SLA</span>
              <select
                value={slaFilter}
                onChange={event => { setSlaFilter(event.target.value as SlaFilter); setPage(1); }}
              >
                <option value="All">All SLA</option>
                <option value="On Track">On track</option>
                <option value="At Risk">At risk</option>
                <option value="Breached">Breached</option>
              </select>
            </label>

            {hasExtraFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('All');
                  setSlaFilter('All');
                  setPage(1);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border-0 bg-white px-3 text-[12px] font-medium text-slate-600 shadow-[0_6px_20px_-6px_rgba(15,23,42,0.1),0_2px_6px_rgba(15,23,42,0.04)] transition hover:bg-slate-50/90 hover:text-slate-900"
              >
                <SlidersHorizontal size={14} />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto ops-scrollbar-thin">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="bg-slate-50/85 shadow-[inset_0_-1px_0_0_rgba(15,23,42,0.05)]">
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
                { key: null, label: 'Last update' },
              ].map(({ key, label }) => (
                <th
                  key={`ctth-${label}`}
                  className={`whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${
                    key ? 'cursor-pointer select-none hover:text-slate-700' : ''
                  }`}
                  onClick={key ? () => toggleSort(key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {key && <SortIcon col={key} />}
                  </span>
                </th>
              ))}
              <th className="whitespace-nowrap py-2.5 pr-4 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={11} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                      <Users size={20} className="text-slate-400" />
                    </div>
                    <p className="text-[14px] font-medium text-slate-800">No jobs match your filters</p>
                    <p className="max-w-sm text-[12px] text-slate-500">Try clearing search or choosing a different status.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('All');
                        setSearch('');
                        setSlaFilter('All');
                        setPage(1);
                      }}
                      className="mt-1 text-[12px] font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500"
                    >
                      Reset filters
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
                  className={`transition-colors ${
                    isBreached
                      ? 'bg-red-50/40 hover:bg-red-50/65'
                      : isDelayed
                        ? 'bg-amber-50/25 hover:bg-amber-50/50'
                        : 'even:bg-slate-50/30 hover:bg-slate-50/75'
                  }`}
                >
                  <td className="px-3 py-2.5 align-middle">
                    <button
                      type="button"
                      onClick={() => onJobClick(job)}
                      className="inline-flex rounded-lg bg-slate-100/90 px-2 py-1 font-mono text-[11px] font-semibold text-slate-800 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08)] transition hover:bg-slate-200/70 hover:shadow-[0_4px_12px_-2px_rgba(15,23,42,0.1)]"
                    >
                      {job.jobNumber}
                    </button>
                  </td>
                  <td className="max-w-[160px] px-3 py-2.5 align-middle">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{job.customer}</p>
                    {job.customerPhone && (
                      <a
                        href={`tel:${job.customerPhone}`}
                        className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 transition-colors hover:text-slate-800"
                      >
                        <Phone size={10} className="shrink-0 opacity-70" />
                        {job.customerPhone}
                      </a>
                    )}
                  </td>
                  <td className="min-w-[140px] px-3 py-2.5 align-middle">
                    <p className="text-[12.5px] font-medium text-slate-800">{job.serviceType}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{job.area}</p>
                  </td>
                  <td className="relative px-3 py-2.5 align-middle">
                    <button
                      type="button"
                      onClick={() => setStatusDropdown(statusDropdown === job.id ? null : job.id)}
                      className="rounded-md outline-none ring-slate-900/0 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-slate-400"
                      title="Change status"
                    >
                      <OpsStatusBadge status={job.status} />
                    </button>
                    {statusDropdown === job.id && (
                      <div
                        className="absolute left-2 top-full z-30 mt-1 min-w-[168px] rounded-xl bg-white py-1 ops-animate-scale-in"
                        style={{ boxShadow: '0 0 0 1px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.12)' }}
                      >
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Set status</p>
                        {(['Queued', 'Assigned', 'En Route', 'Ongoing', 'Completed', 'Delayed'] as JobStatus[]).map(s => (
                          <button
                            key={`ctsd-${s}`}
                            type="button"
                            onClick={() => { onStatusChange(job.id, s); setStatusDropdown(null); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-slate-50"
                          >
                            <OpsStatusBadge status={s} />
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <ProgressTracker job={job} />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    {tech ? (
                      <div className="flex items-center gap-2">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${tech.avatar}`}>
                          {tech.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-slate-800">{tech.name}</p>
                          <p className="truncate text-[10px] text-slate-500">{tech.specialty}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12px] text-slate-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <span className="whitespace-nowrap text-[12px] tabular-nums text-slate-700">{job.scheduledAt}</span>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <span
                      className={`whitespace-nowrap text-[12px] tabular-nums ${
                        job.status === 'Delayed' ? 'font-semibold text-red-700' :
                        job.status === 'Completed' ? 'font-medium text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {job.eta}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-middle">{slaChip(job.slaStatus)}</td>
                  <td className="px-3 py-2.5 align-middle">
                    <p className="whitespace-nowrap text-[11px] tabular-nums text-slate-500">
                      {(() => {
                        try {
                          const d = new Date(job.updatedAt);
                          return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        } catch { return '—'; }
                      })()}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => onJobClick(job)}
                        title="Details"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                      >
                        <Eye size={15} />
                      </button>
                      {job.customerPhone && (
                        <a
                          href={`tel:${job.customerPhone}`}
                          title="Call"
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Phone size={15} />
                        </a>
                      )}
                      {(isDelayed || isBreached) && (
                        <span title="Attention" className="rounded-lg p-1.5 text-amber-500">
                          <AlertTriangle size={15} />
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 bg-slate-50/45 px-4 py-3 shadow-[inset_0_1px_0_0_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span className="text-[12px] text-slate-500">
          Showing{' '}
          <span className="font-medium text-slate-700 tabular-nums">
            {Math.min((page - 1) * perPage + 1, filtered.length)}–{Math.min(page * perPage, filtered.length)}
          </span>{' '}
          of <span className="tabular-nums">{filtered.length}</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-white hover:shadow-[0_6px_16px_-6px_rgba(15,23,42,0.1)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
            <button
              key={`ctpage-${p}`}
              type="button"
              onClick={() => setPage(p)}
              className={`h-8 min-w-[2rem] rounded-xl text-[12px] font-medium transition ${
                page === p
                  ? 'bg-slate-900 text-white shadow-[0_8px_24px_-6px_rgba(15,23,42,0.35)]'
                  : 'text-slate-600 hover:bg-white hover:shadow-[0_6px_16px_-6px_rgba(15,23,42,0.1)]'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || totalPages === 0}
            className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-white hover:shadow-[0_6px_16px_-6px_rgba(15,23,42,0.1)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
