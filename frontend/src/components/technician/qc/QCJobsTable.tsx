import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck,
  Loader2,
  Radio,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import { getQCJobWorkflowAction, getQCJobActionLabel } from '@/lib/qc-job-workflow';
import { getTrackerPipelineProgressPct, TRACKER_PIPELINE_GATE_STAGES } from '@/lib/tracker-pipeline-progress';
import { requiredSlotsCountForGate } from '@/lib/tracker-gate-photo-slots';
import QCStatusBadge, { type QCStatus } from './QCStatusBadge';
import type { QCJob } from '@/hooks/useQCData';
import { filterQCJobsBySearch } from '@/lib/qc-job-search';

type JobStatus = 'pending-review' | 'in-review' | 'approved' | 'needs-fix' | 'resubmitted';
type ReviewState = 'Ready for Sign-off' | 'Needs Evidence' | 'AI Flagged' | 'Returned' | 'In Progress';
type SortMode = 'priority' | 'elapsed' | 'customer' | 'submitted';
type EvidenceTone = 'good' | 'warn' | 'danger' | 'muted';

const statusOptions = ['All Statuses', 'Pending Review', 'In Review', 'Approved', 'Needs Fix', 'Re-submitted'];
const statusMap: Record<string, JobStatus | ''> = {
  'All Statuses': '',
  'Pending Review': 'pending-review',
  'In Review': 'in-review',
  Approved: 'approved',
  'Needs Fix': 'needs-fix',
  'Re-submitted': 'resubmitted',
};
const reviewStateOptions = ['All States', 'Ready for Sign-off', 'Needs Evidence', 'AI Flagged', 'Returned', 'In Progress'];
const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'priority', label: 'Priority queue' },
  { value: 'elapsed', label: 'Longest waiting' },
  { value: 'customer', label: 'Customer A-Z' },
  { value: 'submitted', label: 'Newest submitted' },
];
const ITEMS_PER_PAGE = [8, 12, 20];
const OVERDUE_MINUTES = 240;
const TOTAL_TRACKER_REQUIRED_PHOTOS = TRACKER_PIPELINE_GATE_STAGES.reduce(
  (sum, stage) => sum + requiredSlotsCountForGate(stage, true),
  0
);

const toText = (value: unknown) => String(value ?? '').trim();

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="qc-review-control inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[130px] bg-transparent text-xs font-semibold text-slate-700 outline-none"
      >
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  );
}

function buildPageNumbers(page: number, totalPages: number) {
  const count = Math.min(totalPages, 7);
  let start = Math.max(1, page - Math.floor(count / 2));
  const end = Math.min(totalPages, start + count - 1);
  start = Math.max(1, end - count + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function fmtDate(iso: string) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isSavedTrackerPhoto(media: NonNullable<QCJob['trackerStageMedia']>[number] | undefined | null) {
  if (!media) return false;
  if (String(media.photoUrl || '').trim()) return true;
  if (media.hasPhoto) return true;
  return Boolean(media.stage && media.stage !== 'confirmed');
}

function getUploadedPhotoCount(job: QCJob) {
  return (job.trackerStageMedia || []).filter(isSavedTrackerPhoto).length;
}

function getChecklistStats(job: QCJob) {
  const rows = Array.isArray(job.qcChecklist) ? job.qcChecklist : [];
  const passed = rows.filter((row: any) => row && (row.passed === true || row.checked === true)).length;
  return {
    total: rows.length,
    passed,
    ready: rows.length > 0 && passed === rows.length,
  };
}

function getHandoffStats(job: QCJob) {
  const sheet = job.qcHandoffSheet || {};
  const required = [sheet.clientName, sheet.serviceDate, sheet.makeModel];
  const filled = required.filter((value) => toText(value)).length;
  return {
    filled,
    total: required.length,
    ready: filled === required.length,
  };
}

function getStageLabel(job: QCJob, progressPct: number) {
  const rawStage = toText((job as any).serviceTrackingStage).toLowerCase().replace(/-/g, '_');
  const rawStatus = toText((job as any).orderStatus).toLowerCase().replace(/-/g, '_');
  const key = rawStage || rawStatus;
  const labels: Record<string, string> = {
    confirmed: 'Appointment Confirmed',
    received: 'Vehicle Arrive',
    in_progress: 'Service In Progress',
    quality_check: 'Quality Check',
    ready_pickup: 'Ready for Pickup',
    ready_for_payment: 'Ready for Pickup',
    completed: 'Completed',
    released: 'Released',
  };
  if (labels[key]) return labels[key];
  if (progressPct >= 100) return 'Ready for Pickup';
  if (progressPct >= 75) return 'Quality Check';
  if (progressPct >= 50) return 'Service In Progress';
  if (progressPct >= 25) return 'Vehicle Arrive';
  return 'Not Started';
}

function getReviewState(job: QCJob): ReviewState {
  const action = getQCJobWorkflowAction(job);
  const uploadedPhotos = getUploadedPhotoCount(job);
  const progressPct = getTrackerPipelineProgressPct({
    serviceTrackingStage: (job as any).serviceTrackingStage,
    status: (job as any).orderStatus,
  });

  if (job.status === 'needs-fix') return 'Returned';
  if (job.aiFlag) return 'AI Flagged';
  if (action === 'sign-off') return 'Ready for Sign-off';
  if (uploadedPhotos === 0 || progressPct >= 75) return 'Needs Evidence';
  return 'In Progress';
}

function priorityRank(job: QCJob) {
  const state = getReviewState(job);
  if (getQCJobWorkflowAction(job) === 'sign-off') return 0;
  if (job.aiFlag || (job.elapsedMinutes ?? 0) >= OVERDUE_MINUTES) return 1;
  if (state === 'Needs Evidence') return 2;
  return 3;
}

function getInitials(value: string) {
  return (value || 'Unassigned')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function vehicleDisplay(job: QCJob) {
  return job.vehicle || [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || '-';
}

function reviewStateClass(state: ReviewState) {
  switch (state) {
    case 'Ready for Sign-off':
      return 'bg-emerald-50/90 text-emerald-800 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]';
    case 'AI Flagged':
      return 'bg-rose-50/90 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.2)]';
    case 'Returned':
      return 'bg-orange-50/90 text-orange-700 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.2)]';
    case 'Needs Evidence':
      return 'bg-amber-50/90 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.22)]';
    default:
      return 'bg-blue-50/90 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]';
  }
}

function evidenceClass(tone: EvidenceTone) {
  switch (tone) {
    case 'good':
      return 'bg-emerald-50/90 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]';
    case 'danger':
      return 'bg-rose-50/90 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.18)]';
    case 'warn':
      return 'bg-amber-50/90 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.2)]';
    default:
      return 'bg-slate-50/90 text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.14)]';
  }
}

function SummaryPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: EvidenceTone;
}) {
  return (
    <div className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold ${evidenceClass(tone)}`}>
      <Icon size={14} />
      <span className="tabular-nums">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function EvidenceChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone: EvidenceTone;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 ${evidenceClass(tone)}`}>
      <Icon size={14} className="shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.08em] opacity-70">{label}</p>
        <p className="truncate text-xs font-bold">{value}</p>
      </div>
    </div>
  );
}

function gridTailFillers(itemCount: number, columns: number) {
  if (itemCount <= 0 || columns <= 0) return 0;
  const remainder = itemCount % columns;
  return remainder === 0 ? 0 : columns - remainder;
}

function QueueGridFiller({ className = '' }: { className?: string }) {
  return (
    <div
      className={`qc-review-grid-filler flex min-h-[320px] flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50/90 to-white px-6 py-10 text-center shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)] ${className}`}
      aria-hidden
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100/90 text-slate-400">
        <ClipboardList size={20} />
      </div>
      <p className="max-w-[220px] text-sm font-medium leading-relaxed text-slate-500">
        More review jobs appear here as new work enters the queue.
      </p>
      <p className="mt-2 text-xs text-slate-400">Adjust filters or check the next page for more.</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="qc-review-job-card animate-pulse rounded-2xl bg-white p-4">
      <div className="flex justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="h-5 w-44 rounded bg-slate-100" />
        </div>
        <div className="h-8 w-24 rounded-lg bg-slate-100" />
      </div>
      <div className="mt-5 h-2 rounded-full bg-slate-100" />
      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="h-12 rounded-lg bg-slate-100" />
        <div className="h-12 rounded-lg bg-slate-100" />
        <div className="h-12 rounded-lg bg-slate-100" />
        <div className="h-12 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

interface Props {
  jobs: QCJob[];
  loading: boolean;
  onSelectJob?: (jobId: string) => void;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
}

export default function QCJobsTable({
  jobs,
  loading,
  onSelectJob,
  searchQuery: searchQueryProp,
  onSearchQueryChange,
}: Props) {
  const [localSearch, setLocalSearch] = useState('');
  const searchControlled = onSearchQueryChange !== undefined;
  const search = searchControlled ? (searchQueryProp ?? '') : localSearch;
  const setSearch = searchControlled ? onSearchQueryChange : setLocalSearch;
  const [reviewStateFilter, setReviewStateFilter] = useState('All States');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [serviceFilter, setServiceFilter] = useState('All Services');
  const [techFilter, setTechFilter] = useState('All Technicians');
  const [aiOnly, setAiOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [showFilters, setShowFilters] = useState(false);

  const dynamicServices = useMemo(
    () => ['All Services', ...new Set(jobs.map((j) => toText(j.serviceType || j.service)).filter(Boolean))],
    [jobs]
  );
  const dynamicTechs = useMemo(
    () => ['All Technicians', ...new Set(jobs.map((j) => toText(j.technician || 'Unassigned')).filter(Boolean))],
    [jobs]
  );

  const summary = useMemo(() => {
    const ready = jobs.filter((job) => getQCJobWorkflowAction(job) === 'sign-off').length;
    const needsEvidence = jobs.filter((job) => getReviewState(job) === 'Needs Evidence').length;
    const ai = jobs.filter((job) => job.aiFlag).length;
    const overdue = jobs.filter((job) => (job.elapsedMinutes ?? 0) >= OVERDUE_MINUTES).length;
    return { ready, needsEvidence, ai, overdue, total: jobs.length };
  }, [jobs]);

  const hasActiveFilters =
    reviewStateFilter !== 'All States' ||
    statusFilter !== 'All Statuses' ||
    serviceFilter !== 'All Services' ||
    techFilter !== 'All Technicians' ||
    aiOnly;

  const filtered = useMemo(() => {
    let data = filterQCJobsBySearch(jobs, search);
    if (reviewStateFilter !== 'All States') data = data.filter((j) => getReviewState(j) === reviewStateFilter);
    if (statusFilter !== 'All Statuses') {
      const mappedStatus = statusMap[statusFilter];
      if (mappedStatus) data = data.filter((j) => j.status === mappedStatus);
    }
    if (serviceFilter !== 'All Services') data = data.filter((j) => toText(j.serviceType || j.service) === serviceFilter);
    if (techFilter !== 'All Technicians') data = data.filter((j) => toText(j.technician || 'Unassigned') === techFilter);
    if (aiOnly) data = data.filter((j) => j.aiFlag);

    return [...data].sort((a, b) => {
      if (sortMode === 'customer') return toText(a.customer).localeCompare(toText(b.customer));
      if (sortMode === 'submitted') return new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime();
      if (sortMode === 'elapsed') return (b.elapsedMinutes ?? 0) - (a.elapsedMinutes ?? 0);
      const rank = priorityRank(a) - priorityRank(b);
      if (rank !== 0) return rank;
      return (b.elapsedMinutes ?? 0) - (a.elapsedMinutes ?? 0);
    });
  }, [jobs, search, reviewStateFilter, statusFilter, serviceFilter, techFilter, aiOnly, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageNumbers = useMemo(() => buildPageNumbers(page, totalPages), [page, totalPages]);
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const lgGridFillers = gridTailFillers(paginated.length, 2);
  const xlGridFillers = gridTailFillers(paginated.length, 3);

  const clearFilters = () => {
    setReviewStateFilter('All States');
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

  return (
    <div className="qc-review-table-shell qc-dash-surface overflow-hidden rounded-2xl bg-white">
      <div className="qc-dash-divider bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <SummaryPill icon={CheckCircle2} label="Ready for Sign-off" value={summary.ready} tone="good" />
          <SummaryPill icon={Camera} label="Needs Evidence" value={summary.needsEvidence} tone="warn" />
          <SummaryPill icon={AlertTriangle} label="AI Flagged" value={summary.ai} tone="danger" />
          <SummaryPill icon={Timer} label="Overdue" value={summary.overdue} tone={summary.overdue > 0 ? 'danger' : 'muted'} />
          <SummaryPill icon={ClipboardList} label="Total Jobs" value={summary.total} tone="muted" />
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
          {!searchControlled ? (
            <div className="group relative min-w-[220px] flex-1">
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
                placeholder="Search by job ID, customer, vehicle, technician..."
                className="qc-review-control h-11 w-full rounded-xl bg-slate-50/80 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
          ) : null}

          <div className={`flex flex-wrap items-center gap-2.5 ${searchControlled ? 'w-full' : ''}`}>
            <label className="qc-review-control inline-flex h-11 items-center gap-2 rounded-xl bg-white px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Sort</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
              >
                {sortOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all ${
                showFilters || hasActiveFilters
                  ? 'bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.22)]'
                  : 'qc-review-control bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal size={15} /> Filters
              {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
            </button>
            <button
              type="button"
              onClick={() => { setAiOnly(!aiOnly); setPage(1); }}
              className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all ${
                aiOnly
                  ? 'bg-rose-50 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.2)]'
                  : 'qc-review-control bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle size={15} /> AI Flagged Only
            </button>
            <div className="qc-review-control inline-flex h-11 items-center rounded-xl bg-white px-3 text-sm text-slate-400 tabular-nums">
              {loading ? (
                <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Loading...</span>
              ) : (
                <><span className="font-semibold text-slate-600">{filtered.length}</span>&nbsp;jobs</>
              )}
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="qc-review-inner-panel mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50/80 p-3">
            <FilterSelect label="State" value={reviewStateFilter} options={reviewStateOptions} onChange={(v) => { setReviewStateFilter(v); setPage(1); }} />
            <FilterSelect label="Status" value={statusFilter} options={statusOptions} onChange={(v) => { setStatusFilter(v); setPage(1); }} />
            <FilterSelect label="Service" value={serviceFilter} options={dynamicServices} onChange={(v) => { setServiceFilter(v); setPage(1); }} />
            <FilterSelect label="Technician" value={techFilter} options={dynamicTechs} onChange={(v) => { setTechFilter(v); setPage(1); }} />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-9 rounded-lg px-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-slate-50/60 p-4 sm:p-5">
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)}
          </div>
        ) : paginated.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-amber-50 to-white px-6 py-12 text-center shadow-[inset_0_0_0_1px_rgba(251,191,36,0.2)]">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 ring-4 ring-amber-50">
              <ClipboardList size={20} className="text-amber-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700">{hasActiveFilters || search ? 'No matching review jobs' : 'Review desk is clear'}</p>
            <p className="mt-1 text-xs text-slate-400">
              {hasActiveFilters || search ? 'Adjust the search or filters to broaden the queue.' : 'Jobs will appear here when QC has work to triage or sign off.'}
            </p>
          </div>
        ) : (
          <div className="grid items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {paginated.map((job) => {
              const reviewState = getReviewState(job);
              const action = getQCJobWorkflowAction(job);
              const isTracker = action === 'live-tracker';
              const progressPct = getTrackerPipelineProgressPct({
                serviceTrackingStage: (job as any).serviceTrackingStage,
                status: (job as any).orderStatus,
              });
              const uploadedPhotos = getUploadedPhotoCount(job);
              const checklist = getChecklistStats(job);
              const handoff = getHandoffStats(job);
              const overdue = (job.elapsedMinutes ?? 0) >= OVERDUE_MINUTES;

              return (
                <article
                  key={job.id}
                  tabIndex={0}
                  onClick={() => openJob(job.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openJob(job.id);
                    }
                  }}
                  className="qc-review-job-card group cursor-pointer rounded-2xl bg-white p-4 transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-xs font-black uppercase tracking-[0.14em] text-slate-400">{job.jobId || '-'}</span>
                        <QCStatusBadge status={job.status as QCStatus} />
                      </div>
                      <h3 className="mt-2 truncate text-lg font-black tracking-tight text-slate-950">{job.customer || 'Unknown customer'}</h3>
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-500">{vehicleDisplay(job)}</p>
                    </div>
                    <span className={`shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-black ${reviewStateClass(reviewState)}`}>
                      {reviewState}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="font-black uppercase tracking-[0.08em] text-slate-400">Plate</p>
                      <p className="mt-1 truncate font-bold text-slate-700">{job.plate || 'No plate on file'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="font-black uppercase tracking-[0.08em] text-slate-400">Service</p>
                      <p className="mt-1 truncate font-bold text-slate-700">{job.service || job.serviceType || '-'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="font-black uppercase tracking-[0.08em] text-slate-400">Technician</p>
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[9px] font-black text-white">
                          {getInitials(job.technician)}
                        </span>
                        <span className="truncate font-bold text-slate-700">{job.technician || 'Unassigned'}</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="font-black uppercase tracking-[0.08em] text-slate-400">Elapsed</p>
                      <p className={`mt-1 truncate font-bold tabular-nums ${overdue ? 'text-rose-600' : (job.elapsedMinutes ?? 0) >= 120 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {job.elapsed || '-'}
                      </p>
                    </div>
                  </div>

                  <div className="qc-review-inner-panel mt-4 rounded-xl bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Tracker Stage</p>
                        <p className="mt-0.5 truncate text-sm font-black text-slate-800">{getStageLabel(job, progressPct)}</p>
                      </div>
                      <span className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-black text-white tabular-nums">{progressPct}%</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-slate-400">Submitted {fmtDate(job.submittedAt)}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <EvidenceChip
                      icon={Camera}
                      label="Photos"
                      value={`${uploadedPhotos}/${TOTAL_TRACKER_REQUIRED_PHOTOS} tracker uploads`}
                      tone={uploadedPhotos >= TOTAL_TRACKER_REQUIRED_PHOTOS ? 'good' : uploadedPhotos > 0 ? 'warn' : 'muted'}
                    />
                    <EvidenceChip
                      icon={ShieldCheck}
                      label="Checklist"
                      value={checklist.total > 0 ? `${checklist.passed}/${checklist.total} passed` : 'Not saved yet'}
                      tone={checklist.ready ? 'good' : checklist.total > 0 ? 'warn' : 'muted'}
                    />
                    <EvidenceChip
                      icon={FileCheck}
                      label="Handoff"
                      value={handoff.ready ? 'Ready' : `${handoff.filled}/${handoff.total} fields`}
                      tone={handoff.ready ? 'good' : handoff.filled > 0 ? 'warn' : 'muted'}
                    />
                    <EvidenceChip
                      icon={AlertTriangle}
                      label="AI"
                      value={job.aiFlag ? 'Flagged for review' : 'Clear'}
                      tone={job.aiFlag ? 'danger' : 'good'}
                    />
                  </div>

                  <div className="qc-review-card-footer mt-4 flex items-center justify-between gap-3 pt-4">
                    <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-400">
                      {isTracker ? <Radio size={14} /> : <CheckCircle2 size={14} />}
                      <span className="truncate">
                        {isTracker ? 'Continue evidence collection in Live Tracker' : 'Ready for approve or return decision'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openJob(job.id);
                      }}
                      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold transition-all ${
                        isTracker
                          ? 'bg-blue-600 text-white shadow-[0_8px_20px_-12px_rgba(37,99,235,0.55)] hover:bg-blue-700'
                          : 'bg-emerald-600 text-white shadow-[0_8px_20px_-12px_rgba(5,150,105,0.45)] hover:bg-emerald-700'
                      }`}
                    >
                      {isTracker ? <Radio size={14} /> : <CheckCircle2 size={14} />}
                      {getQCJobActionLabel(action)}
                    </button>
                  </div>
                </article>
              );
            })}
            {Array.from({ length: lgGridFillers }).map((_, index) => (
              <QueueGridFiller key={`lg-filler-${index}`} className="hidden lg:flex 2xl:hidden" />
            ))}
            {Array.from({ length: xlGridFillers }).map((_, index) => (
              <QueueGridFiller key={`xl-filler-${index}`} className="hidden 2xl:flex" />
            ))}
          </div>
        )}
      </div>

      <div className="qc-dash-divider flex flex-wrap items-center justify-between gap-4 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span>Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }}
            className="qc-review-control cursor-pointer rounded-xl bg-white px-2 py-1 text-sm font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
          >
            {ITEMS_PER_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>per page - <span className="font-medium text-slate-600 tabular-nums">{filtered.length}</span> total</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          {pageNumbers.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setPage(p)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold transition-all ${
                p === page
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
