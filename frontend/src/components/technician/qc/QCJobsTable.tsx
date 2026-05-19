import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle,
  ChevronLeft, ChevronRight, SlidersHorizontal, ClipboardList, Loader2,
  Radio, CheckCircle2,
} from 'lucide-react';
import { getQCJobWorkflowAction, getQCJobActionLabel } from '@/lib/qc-job-workflow';
import QCStatusBadge, { type QCStatus } from './QCStatusBadge';
import type { QCJob } from '@/hooks/useQCData';

type SortKey = 'jobId' | 'customer' | 'vehicle' | 'service' | 'technician' | 'elapsed' | 'status';
type SortDir = 'asc' | 'desc' | null;
type JobStatus = 'pending-review' | 'in-review' | 'approved' | 'needs-fix' | 'resubmitted';

const statusOptions = ['All Statuses', 'Pending Review', 'In Review', 'Approved', 'Needs Fix', 'Re-submitted'];
const statusMap: Record<string, JobStatus | ''> = {
  'All Statuses': '', 'Pending Review': 'pending-review', 'In Review': 'in-review',
  'Approved': 'approved', 'Needs Fix': 'needs-fix', 'Re-submitted': 'resubmitted',
};
const ITEMS_PER_PAGE = [8, 12, 20];

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-[148px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm shadow-slate-200/30 transition-all focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/15">
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className={`h-3 rounded-full bg-slate-100 ${i === 0 ? 'w-24' : i === 8 ? 'ml-auto w-16' : 'w-3/4'}`} />
        </td>
      ))}
    </tr>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown size={12} className="text-slate-300" />;
  if (sortDir === 'asc') return <ChevronUp size={12} className="text-blue-500" />;
  if (sortDir === 'desc') return <ChevronDown size={12} className="text-blue-500" />;
  return <ChevronsUpDown size={12} className="text-slate-300" />;
}

interface Props {
  jobs: QCJob[];
  loading: boolean;
  onSelectJob?: (jobId: string) => void;
}

const toText = (value: unknown) => String(value ?? '').trim();
const toSearch = (value: unknown) => toText(value).toLowerCase();
const compareValues = (a: unknown, b: unknown, dir: Exclude<SortDir, null>) => {
  const aNum = typeof a === 'number' && Number.isFinite(a);
  const bNum = typeof b === 'number' && Number.isFinite(b);
  if (aNum && bNum) {
    const av = a as number;
    const bv = b as number;
    return dir === 'asc' ? av - bv : bv - av;
  }
  const av = toText(a);
  const bv = toText(b);
  return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
};

function buildPageNumbers(page: number, totalPages: number) {
  const count = Math.min(totalPages, 7);
  let start = Math.max(1, page - Math.floor(count / 2));
  const end = Math.min(totalPages, start + count - 1);
  start = Math.max(1, end - count + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function QCJobsTable({ jobs, loading, onSelectJob }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [serviceFilter, setServiceFilter] = useState('All Services');
  const [techFilter, setTechFilter] = useState('All Technicians');
  const [aiOnly, setAiOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('elapsed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [showFilters, setShowFilters] = useState(false);

  const dynamicServices = useMemo(() => ['All Services', ...new Set(jobs.map((j) => toText(j.serviceType || j.service)).filter(Boolean))], [jobs]);
  const dynamicTechs = useMemo(() => ['All Technicians', ...new Set(jobs.map((j) => toText(j.technician || 'Unassigned')).filter(Boolean))], [jobs]);
  const hasActiveFilters = statusFilter !== 'All Statuses' || serviceFilter !== 'All Services' || techFilter !== 'All Technicians' || aiOnly;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let data = jobs;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      data = data.filter((j) => [
        j.jobId, j.customer, j.vehicle, j.make, j.plate, j.service, j.serviceType, j.technician,
      ].some((value) => toSearch(value).includes(q)));
    }
    if (statusFilter !== 'All Statuses') { const m = statusMap[statusFilter]; if (m) data = data.filter((j) => j.status === m); }
    if (serviceFilter !== 'All Services') data = data.filter((j) => toText(j.serviceType || j.service) === serviceFilter);
    if (techFilter !== 'All Technicians') data = data.filter((j) => toText(j.technician || 'Unassigned') === techFilter);
    if (aiOnly) data = data.filter((j) => j.aiFlag);
    if (sortKey && sortDir) {
      data = [...data].sort((a, b) => {
        const valueFor = (job: QCJob) => {
          switch (sortKey) {
            case 'elapsed': return job.elapsedMinutes ?? 0;
            case 'service': return job.service || job.serviceType;
            case 'jobId': return job.jobId;
            case 'customer': return job.customer;
            case 'vehicle': return job.vehicle;
            case 'technician': return job.technician;
            case 'status': return job.status;
            default: return '';
          }
        };
        return compareValues(valueFor(a), valueFor(b), sortDir);
      });
    }
    return data;
  }, [jobs, search, statusFilter, serviceFilter, techFilter, aiOnly, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageNumbers = useMemo(() => buildPageNumbers(page, totalPages), [page, totalPages]);
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const fmtDate = (iso: string) => {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const clearFilters = () => {
    setStatusFilter('All Statuses');
    setServiceFilter('All Services');
    setTechFilter('All Technicians');
    setAiOnly(false);
    setPage(1);
  };

  const openJob = (jobId: string) => {
    onSelectJob?.(jobId);
  };

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const thCls = 'text-left px-4 py-3.5 text-[11px] font-semibold text-slate-400 uppercase select-none';

  return (
    <div className="qc-review-table-shell overflow-hidden rounded-[22px] border bg-white ring-1 ring-white">
      {/* Toolbar */}
      <div className="qc-review-toolbar border-b bg-gradient-to-b from-white to-slate-50/80 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-[220px] flex-1 group">
            <Search
              size={16}
              strokeWidth={2.25}
              className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by job ID, customer, vehicle, technician…"
              className="h-11 w-full rounded-full border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 pl-11 pr-4 text-sm font-medium text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_-10px_rgba(15,23,42,0.1)] outline-none transition-[border-color,box-shadow,color] placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300/95 focus:border-blue-400/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(59,130,246,0.16),0_10px_32px_-12px_rgba(37,99,235,0.14)]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all ${
              showFilters || hasActiveFilters
                ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100/60'
                : 'border-slate-200 bg-white text-slate-600 shadow-sm shadow-slate-200/30 hover:border-slate-300 hover:bg-slate-50'
            }`}>
              <SlidersHorizontal size={15} /> Filters
              {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
            </button>
            <button onClick={() => { setAiOnly(!aiOnly); setPage(1); }}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all ${
              aiOnly
                ? 'border-orange-200 bg-orange-50 text-orange-700 shadow-sm shadow-orange-100/60'
                : 'border-slate-200 bg-white text-slate-600 shadow-sm shadow-slate-200/30 hover:border-slate-300 hover:bg-slate-50'
            }`}>
              <AlertTriangle size={15} /> AI Flagged Only
            </button>
            <div className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-400 shadow-sm shadow-slate-200/30 tabular-nums">
              {loading ? <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Loading...</span> : <><span className="font-semibold text-slate-600">{filtered.length}</span>&nbsp;jobs</>}
            </div>
          </div>
        </div>
        {showFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white/80 p-3 shadow-inner shadow-slate-100/50">
            <FilterSelect label="Status" value={statusFilter} options={statusOptions} onChange={(v) => { setStatusFilter(v); setPage(1); }} />
            <FilterSelect label="Service" value={serviceFilter} options={dynamicServices} onChange={(v) => { setServiceFilter(v); setPage(1); }} />
            <FilterSelect label="Technician" value={techFilter} options={dynamicTechs} onChange={(v) => { setTechFilter(v); setPage(1); }} />
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="h-9 rounded-lg px-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700">Clear all</button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-slate-50/50">
        <table className="qc-review-table w-full min-w-[1440px] table-fixed border-separate border-spacing-0">
          <colgroup>
            <col className="w-[170px]" />
            <col className="w-[250px]" />
            <col className="w-[190px]" />
            <col className="w-[190px]" />
            <col className="w-[170px]" />
            <col className="w-[150px]" />
            <col className="w-[110px]" />
            <col className="w-[80px]" />
            <col className="w-[160px]" />
            <col className="w-[130px]" />
          </colgroup>
          <thead className="bg-slate-50/80">
            <tr>
              {([
                { key: 'jobId', label: 'Job ID' }, { key: 'customer', label: 'Customer' },
                { key: 'vehicle', label: 'Vehicle' }, { key: 'service', label: 'Service' },
                { key: 'technician', label: 'Technician' },
              ] as { key: SortKey; label: string }[]).map((col) => (
                <th key={col.key} className={`${thCls} cursor-pointer border-b border-slate-100`} onClick={() => handleSort(col.key)}>
                  <span className="flex items-center gap-1.5">{col.label} <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
              ))}
              <th className={`${thCls} cursor-default border-b border-slate-100`}>Submitted</th>
              <th className={`${thCls} cursor-pointer border-b border-slate-100`} onClick={() => handleSort('elapsed')}>
                <span className="flex items-center gap-1.5">Elapsed <SortIcon col="elapsed" sortKey={sortKey} sortDir={sortDir} /></span>
              </th>
              <th className={`${thCls} cursor-default border-b border-slate-100`}>AI</th>
              <th className={`${thCls} cursor-pointer border-b border-slate-100`} onClick={() => handleSort('status')}>
                <span className="flex items-center gap-1.5">Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} /></span>
              </th>
              <th className="border-b border-slate-100 px-4 py-3.5 text-right text-[11px] font-semibold uppercase text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
            ) : paginated.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-14">
                <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white px-6 py-12 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 ring-4 ring-amber-50">
                    <ClipboardList size={20} className="text-amber-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{hasActiveFilters || search ? 'No matching jobs' : 'No jobs yet'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {hasActiveFilters || search ? 'Adjust the search or filters to broaden the queue.' : 'Jobs will appear here when technicians submit completed work.'}
                  </p>
                </div>
              </td></tr>
            ) : paginated.map((job) => (
              <tr
                key={job.id}
                tabIndex={0}
                onClick={() => openJob(job.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openJob(job.id);
                  }
                }}
                className="group cursor-pointer transition-colors duration-150 hover:bg-slate-50/80 focus:bg-blue-50/70 focus:outline-none"
              >
                <td className="rounded-l-xl border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  <span className="block max-w-[128px] truncate text-sm font-bold text-slate-900 tabular-nums">{job.jobId || '-'}</span>
                </td>
                <td className="border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  <p className="max-w-[210px] truncate text-sm font-semibold text-slate-700">{job.customer || 'Unknown customer'}</p>
                  <p className="mt-0.5 max-w-[210px] truncate text-xs text-slate-400">{job.plate || 'No plate on file'}</p>
                </td>
                <td className="border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  <p className="max-w-[180px] truncate text-sm font-semibold text-slate-700">{job.make || job.vehicleMake || '-'}</p>
                  <p className="mt-0.5 max-w-[180px] truncate text-xs text-slate-400">{job.vehicle || [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || '-'}</p>
                </td>
                <td className="border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  <p className="max-w-[190px] truncate text-sm font-medium text-slate-600">{job.service || job.serviceType || '-'}</p>
                </td>
                <td className="border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-[10px] font-semibold text-white shadow-sm">
                      {(job.technician || 'Unassigned').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="max-w-[130px] truncate text-sm font-medium text-slate-600">{job.technician || 'Unassigned'}</span>
                  </div>
                </td>
                <td className="border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  <p className="whitespace-nowrap text-xs font-medium text-slate-400 tabular-nums">{fmtDate(job.submittedAt)}</p>
                </td>
                <td className="border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  <span className={`whitespace-nowrap text-xs font-semibold tabular-nums ${job.elapsedMinutes >= 240 ? 'text-rose-500' : job.elapsedMinutes >= 120 ? 'text-amber-500' : 'text-slate-500'}`}>{job.elapsed || '-'}</span>
                </td>
                <td className="border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  {job.aiFlag
                    ? <span className="inline-flex items-center gap-1 rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700"><AlertTriangle size={10} />Flagged</span>
                    : <span className="text-xs font-medium text-slate-300">Clear</span>}
                </td>
                <td className="border-b border-slate-100/80 bg-white px-4 py-4 transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70"><QCStatusBadge status={job.status as QCStatus} /></td>
                <td className="rounded-r-xl border-b border-slate-100/80 bg-white px-4 py-4 text-right transition-colors group-hover:bg-slate-50/80 group-focus:bg-blue-50/70">
                  {(() => {
                    const action = getQCJobWorkflowAction(job);
                    const isTracker = action === 'live-tracker';
                    return (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openJob(job.id);
                        }}
                        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold shadow-sm transition-all ${
                          isTracker
                            ? 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        {isTracker ? <Radio size={14} /> : <CheckCircle2 size={14} />}
                        {getQCJobActionLabel(action)}
                      </button>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="qc-review-footer flex flex-wrap items-center justify-between gap-4 border-t bg-slate-50/70 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span>Show</span>
          <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }}
            className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-2 py-1 pr-5 text-sm text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center' }}>
            {ITEMS_PER_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>per page - <span className="font-medium text-slate-600 tabular-nums">{filtered.length}</span> total</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft size={16} /></button>
          {pageNumbers.map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                p === page
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-500 hover:bg-white hover:text-slate-700'
              }`}>{p}</button>
          ))}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}
