import React, { useState, useMemo } from 'react';
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, Eye,
  CheckCircle2, RotateCcw, ChevronLeft, ChevronRight, SlidersHorizontal,
  ClipboardList, Loader2,
} from 'lucide-react';
import QCStatusBadge, { type QCStatus } from './QCStatusBadge';
import { toast } from 'sonner';
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

// ── Minimal Select ────────────────────────────────────────────────────────────
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 font-medium">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all">
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-slate-100">
      <td className="px-5 py-4"><div className="w-4 h-4 bg-slate-100 rounded" /></td>
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-4"><div className="h-3 bg-slate-100 rounded w-3/4" /></td>
      ))}
    </tr>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
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
  onApproveJob?: (id: string) => Promise<boolean>;
  onReturnJob?: (id: string) => Promise<boolean>;
}

export default function QCJobsTable({ jobs, loading, onSelectJob, onApproveJob, onReturnJob }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [serviceFilter, setServiceFilter] = useState('All Services');
  const [techFilter, setTechFilter] = useState('All Technicians');
  const [aiOnly, setAiOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('elapsed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [showFilters, setShowFilters] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const dynamicServices = useMemo(() => ['All Services', ...new Set(jobs.map((j) => j.serviceType).filter(Boolean))], [jobs]);
  const dynamicTechs = useMemo(() => ['All Technicians', ...new Set(jobs.map((j) => j.technician).filter(Boolean))], [jobs]);
  const hasActiveFilters = statusFilter !== 'All Statuses' || serviceFilter !== 'All Services' || techFilter !== 'All Technicians' || aiOnly;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let data = jobs;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((j) => j.jobId.toLowerCase().includes(q) || j.customer.toLowerCase().includes(q) || j.vehicle.toLowerCase().includes(q) || (j.technician || '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'All Statuses') { const m = statusMap[statusFilter]; if (m) data = data.filter((j) => j.status === m); }
    if (serviceFilter !== 'All Services') data = data.filter((j) => j.serviceType === serviceFilter);
    if (techFilter !== 'All Technicians') data = data.filter((j) => j.technician === techFilter);
    if (aiOnly) data = data.filter((j) => j.aiFlag);
    if (sortKey && sortDir) {
      data = [...data].sort((a, b) => {
        let va: any = (a as any)[sortKey], vb: any = (b as any)[sortKey];
        if (sortKey === 'elapsed') { va = a.elapsedMinutes; vb = b.elapsedMinutes; }
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === 'asc' ? va - vb : vb - va;
      });
    }
    return data;
  }, [jobs, search, statusFilter, serviceFilter, techFilter, aiOnly, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const toggleRow = (id: string) => { const s = new Set(selectedRows); s.has(id) ? s.delete(id) : s.add(id); setSelectedRows(s); };
  const toggleAll = () => selectedRows.size === paginated.length ? setSelectedRows(new Set()) : setSelectedRows(new Set(paginated.map((j) => j.id)));

  const handleQuickApprove = async (job: QCJob) => {
    if (!onApproveJob) return;
    setActioningId(job.id);
    await onApproveJob(job.id);
    setActioningId(null);
  };
  const handleQuickReturn = async (job: QCJob) => {
    if (!onReturnJob) return;
    setActioningId(job.id);
    await onReturnJob(job.id);
    setActioningId(null);
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  const thCls = 'text-left px-4 py-3.5 text-[11px] font-medium text-slate-400 tracking-widest uppercase cursor-pointer select-none';

  return (
    <div className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden" style={{ background: '#FFFFFF' }}>
      {/* Toolbar */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by job ID, customer, vehicle, technician..."
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 focus:border-amber-300 transition-all" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
              showFilters || hasActiveFilters
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}>
            <SlidersHorizontal size={14} /> Filters
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
          </button>
          <button onClick={() => setAiOnly(!aiOnly)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
              aiOnly
                ? 'bg-orange-50 border-orange-300 text-orange-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}>
            <AlertTriangle size={14} /> AI Flagged Only
          </button>
          <div className="text-sm text-slate-400 tabular-nums ml-1">
            {loading ? <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</span> : <><span className="font-medium text-slate-500">{filtered.length}</span> jobs</>}
          </div>
        </div>
        {showFilters && (
          <div className="flex items-center gap-4 flex-wrap mt-3 pt-3 border-t border-slate-100">
            <FilterSelect label="Status" value={statusFilter} options={statusOptions} onChange={(v) => { setStatusFilter(v); setPage(1); }} />
            <FilterSelect label="Service" value={serviceFilter} options={dynamicServices} onChange={(v) => { setServiceFilter(v); setPage(1); }} />
            <FilterSelect label="Technician" value={techFilter} options={dynamicTechs} onChange={(v) => { setTechFilter(v); setPage(1); }} />
            {hasActiveFilters && (
              <button onClick={() => { setStatusFilter('All Statuses'); setServiceFilter('All Services'); setTechFilter('All Technicians'); setAiOnly(false); setPage(1); }}
                className="text-sm text-blue-500 hover:text-blue-700 font-medium transition-colors">Clear all</button>
            )}
          </div>
        )}
      </div>

      {/* Bulk action */}
      {selectedRows.size > 0 && (
        <div className="px-5 py-3 bg-blue-50/60 border-b border-blue-100 flex items-center gap-4">
          <span className="text-xs font-semibold text-blue-700">{selectedRows.size} selected</span>
          <button onClick={async () => { for (const id of selectedRows) if (onApproveJob) await onApproveJob(id); setSelectedRows(new Set()); }}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors">
            <CheckCircle2 size={12} /> Approve All
          </button>
          <button onClick={() => setSelectedRows(new Set())} className="ml-auto text-xs text-blue-600 hover:underline">Deselect</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-5 py-3.5 w-10">
                <button
                  type="button"
                  onClick={toggleAll}
                  className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all cursor-pointer ${paginated.length > 0 && selectedRows.size === paginated.length
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-slate-300 hover:border-slate-400'
                    }`}
                >
                  {paginated.length > 0 && selectedRows.size === paginated.length && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </th>
              {([
                { key: 'jobId', label: 'Job ID' }, { key: 'customer', label: 'Customer' },
                { key: 'vehicle', label: 'Vehicle' }, { key: 'service', label: 'Service' },
                { key: 'technician', label: 'Technician' },
              ] as { key: SortKey; label: string }[]).map((col) => (
                <th key={col.key} className={thCls} onClick={() => handleSort(col.key)}>
                  <span className="flex items-center gap-1">{col.label} <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
              ))}
              <th className={`${thCls} cursor-default`}>Submitted</th>
              <th className={thCls} onClick={() => handleSort('elapsed')}>
                <span className="flex items-center gap-1">Elapsed <SortIcon col="elapsed" sortKey={sortKey} sortDir={sortDir} /></span>
              </th>
              <th className={`${thCls} cursor-default`}>AI</th>
              <th className={thCls} onClick={() => handleSort('status')}>
                <span className="flex items-center gap-1">Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} /></span>
              </th>
              <th className="px-4 py-3.5 text-right text-[11px] font-medium text-slate-400 tracking-widest uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
            ) : paginated.length === 0 ? (
              <tr><td colSpan={11} className="px-8 py-20">
                <div className="flex flex-col items-center justify-center text-center py-16 rounded-2xl mx-2" style={{ background: 'linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)' }}>
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-3 ring-4 ring-amber-50">
                    <ClipboardList size={20} className="text-amber-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No jobs yet</p>
                  <p className="text-xs text-slate-400 mt-1">Jobs will appear here when technicians submit completed work</p>
                </div>
              </td></tr>
            ) : paginated.map((job) => (
              <tr key={job.id} className={`group transition-colors duration-150 ${selectedRows.has(job.id) ? 'bg-blue-50/40' : 'hover:bg-slate-50/60'}`}>
                <td className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => toggleRow(job.id)}
                    className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all cursor-pointer ${selectedRows.has(job.id) ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300 hover:border-slate-400'
                      }`}
                  >
                    {selectedRows.has(job.id) && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </td>
                <td className="px-4 py-4"><span className="text-sm font-bold text-slate-900 tabular-nums">{job.jobId}</span></td>
                <td className="px-4 py-4">
                  <p className="text-sm font-medium text-slate-700">{job.customer}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{job.plate}</p>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm font-medium text-slate-700">{job.make}</p>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-[140px] truncate">{job.vehicle}</p>
                </td>
                <td className="px-4 py-4"><p className="text-sm text-slate-600 max-w-[150px] truncate">{job.service}</p></td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-[10px] text-white font-semibold flex-shrink-0">
                      {(job.technician || 'UN').split(' ').map((p) => p[0]).join('').slice(0, 2)}
                    </div>
                    <span className="text-sm text-slate-600 truncate max-w-[100px]">{job.technician || 'Unassigned'}</span>
                  </div>
                </td>
                <td className="px-4 py-4"><p className="text-xs text-slate-400 tabular-nums whitespace-nowrap">{fmtDate(job.submittedAt)}</p></td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium tabular-nums ${job.elapsedMinutes >= 240 ? 'text-rose-500' : job.elapsedMinutes >= 120 ? 'text-amber-500' : 'text-slate-500'}`}>{job.elapsed}</span>
                </td>
                <td className="px-4 py-4">
                  {job.aiFlag
                    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-full"><AlertTriangle size={10} />Flagged</span>
                    : <span className="text-xs text-slate-300">—</span>}
                </td>
                <td className="px-4 py-4"><QCStatusBadge status={job.status as QCStatus} /></td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1 justify-end">
                    {actioningId === job.id ? (
                      <Loader2 size={14} className="animate-spin text-slate-400" />
                    ) : (
                      <>
                        <button title="Review" onClick={() => onSelectJob?.(job.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Eye size={14} /></button>
                        <button title="Approve" onClick={() => handleQuickApprove(job)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"><CheckCircle2 size={14} /></button>
                        <button title="Return" onClick={() => handleQuickReturn(job)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><RotateCcw size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Show</span>
          <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }}
            className="appearance-none border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-600 bg-white focus:outline-none cursor-pointer pr-5"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center' }}>
            {ITEMS_PER_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>per page — <span className="font-medium text-slate-600 tabular-nums">{filtered.length}</span> total</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all ${
                p === page
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}>{p}</button>
          ))}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}
