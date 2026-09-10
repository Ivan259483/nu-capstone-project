import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Flag,
  Image as ImageIcon,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Trophy,
  Upload,
  Wrench,
} from 'lucide-react';
import type { QCActivityItem, QCJob, QCStats, QCTrackerStageMedia } from '@/hooks/useQCData';
import { getQCThumbnailUrl } from '@/lib/qc-image';
import { normalizeStaffGateSlot, requiredSlotsCountForGate } from '@/lib/tracker-gate-photo-slots';

import { QCPaymentHandoff } from './QCPaymentHandoff';
import { serviceHandoffState } from '@/lib/service-handoff';

type QCView = 'dashboard' | 'jobs' | 'job-detail' | 'ai-detection' | 'live-tracker' | 'pos-queue';
type DashboardStage = 'received' | 'in_progress' | 'quality_check' | 'ready_pickup' | 'completed';
type ActiveStage = Exclude<DashboardStage, 'completed'>;

interface Props {
  onNavigate: (view: QCView) => void;
  onSelectJob?: (id: string) => void;
  stats: QCStats;
  statsLoading: boolean;
  jobs: QCJob[];
  activity?: QCActivityItem[];
  activityLoading?: boolean;
  selectedRangeDays: 1 | 7 | 30;
  selectedScope: 'all' | 'mine';
  onRangeChange: (days: 1 | 7 | 30) => void;
  onScopeChange: (scope: 'all' | 'mine') => void;
}

const STAGES: ActiveStage[] = ['received', 'in_progress', 'quality_check', 'ready_pickup'];
const STALE_AFTER_MS = 60 * 60 * 1000;
const QC_SLA_MINUTES = 4 * 60;

const RANGE_OPTIONS: Array<{ value: 1 | 7 | 30; label: string }> = [
  { value: 1, label: 'Today' },
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
];

const SCOPE_OPTIONS = [
  { value: 'all' as const, label: 'All Jobs' },
  { value: 'mine' as const, label: 'My Jobs' },
];

const STAGE_META: Record<DashboardStage, { label: string; shortLabel: string }> = {
  received: { label: 'Arrived', shortLabel: 'Arrived' },
  in_progress: { label: 'In Service', shortLabel: 'In Service' },
  quality_check: { label: 'Quality Check', shortLabel: 'QC' },
  ready_pickup: { label: 'Ready for Pickup', shortLabel: 'Ready' },
  completed: { label: 'Completed', shortLabel: 'Completed' },
};

function normalizeValue(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

function isTerminalJob(job: QCJob) {
  const stage = normalizeValue((job as QCJob & { serviceTrackingStage?: string }).serviceTrackingStage);
  const status = normalizeValue(job.orderStatus);
  return stage === 'completed' || stage === 'released' || status === 'completed' || status === 'released';
}

function currentDashboardStage(job: QCJob): DashboardStage {
  if (isTerminalJob(job)) return 'completed';
  const stage = normalizeValue((job as QCJob & { serviceTrackingStage?: string }).serviceTrackingStage);
  const status = normalizeValue(job.orderStatus);
  if (stage === 'ready_pickup' || status === 'ready_for_payment') return 'ready_pickup';
  if (stage === 'quality_check') return 'ready_pickup';
  if (stage === 'in_progress') return 'quality_check';
  if (stage === 'received') return 'in_progress';
  return 'received';
}

function mediaRepresentsEvidence(media?: QCTrackerStageMedia | null) {
  if (!media) return false;
  if (String(media.photoUrl || '').trim()) return true;
  if (media.hasPhoto) return true;
  return Boolean(media.stage && media.stage !== 'confirmed');
}

function countFilledSlots(job: QCJob, stage: ActiveStage) {
  const mediaList = (job.trackerStageMedia || []).filter(mediaRepresentsEvidence);
  if (stage === 'quality_check') {
    return mediaList.some((media) => normalizeValue(media.stage) === stage) ? 1 : 0;
  }
  const slots = new Set<string>();
  mediaList.forEach((media) => {
    if (normalizeValue(media.stage) !== stage) return;
    const slot = normalizeStaffGateSlot(media.slot, stage);
    slots.add(slot || '__legacy__');
  });
  return slots.size;
}

function evidenceForCurrentStage(job: QCJob) {
  const stage = currentDashboardStage(job);
  if (stage === 'completed') return { stage, complete: 0, required: 0, missing: 0 };
  const required = requiredSlotsCountForGate(stage, true);
  const complete = Math.min(required, countFilledSlots(job, stage));
  return { stage, complete, required, missing: Math.max(0, required - complete) };
}

function evidenceTotals(jobs: QCJob[]) {
  let required = 0;
  let uploaded = 0;
  let replacement = 0;
  jobs.forEach((job) => {
    const current = currentDashboardStage(job);
    const lastIndex = current === 'completed' ? STAGES.length - 1 : STAGES.indexOf(current);
    STAGES.slice(0, lastIndex + 1).forEach((stage) => {
      const gateRequired = requiredSlotsCountForGate(stage, true);
      required += gateRequired;
      uploaded += Math.min(gateRequired, countFilledSlots(job, stage));
    });
    if (job.aiFlag || job.status === 'needs-fix' || job.status === 'resubmitted') replacement += 1;
  });
  replacement = Math.min(replacement, uploaded);
  return {
    required,
    complete: Math.max(0, uploaded - replacement),
    missing: Math.max(0, required - uploaded),
    replacement,
  };
}

function latestUpdateMs(job: QCJob) {
  const extra = job as QCJob & { serviceTrackingUpdatedAt?: string; updatedAt?: string };
  const timestamps = [
    ...(job.trackerStageMedia || []).map((media) => media.uploadedAt),
    extra.serviceTrackingUpdatedAt,
    extra.updatedAt,
    job.submittedAt,
  ]
    .map((value) => new Date(String(value || '')).getTime())
    .filter((value) => Number.isFinite(value) && value > 0);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

function latestVehicleImage(job: QCJob) {
  const trackerImage = [...(job.trackerStageMedia || [])]
    .filter((media) => {
      const value = String(media.photoUrl || '').trim();
      return value && !value.startsWith('data:');
    })
    .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())[0]?.photoUrl;
  if (trackerImage) return trackerImage;
  return [...(job.photos?.after || []), ...(job.photos?.before || [])]
    .find((url) => Boolean(url) && !url.startsWith('data:')) || '';
}

function vehicleLabel(job: QCJob) {
  const detailed = [job.vehicleYear, job.vehicleMake || job.make, job.vehicleModel].filter(Boolean).join(' ');
  return detailed || job.vehicle || job.plate || 'Vehicle details pending';
}

function relativeTime(timestamp: string | number) {
  const time = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (!Number.isFinite(time) || time <= 0) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function dueLabel(job: QCJob) {
  const elapsed = Math.max(0, Number(job.elapsedMinutes || 0));
  const remaining = QC_SLA_MINUTES - elapsed;
  if (remaining <= 0) {
    const overdue = Math.abs(remaining);
    return `Overdue by ${overdue >= 60 ? `${Math.floor(overdue / 60)}h ${overdue % 60}m` : `${overdue}m`}`;
  }
  return `Due in ${remaining >= 60 ? `${Math.floor(remaining / 60)}h ${remaining % 60}m` : `${remaining}m`}`;
}

function happenedToday(job: QCJob) {
  if (!isTerminalJob(job)) return false;
  const extra = job as QCJob & { serviceTrackingUpdatedAt?: string; updatedAt?: string; completedAt?: string };
  const time = new Date(extra.completedAt || extra.serviceTrackingUpdatedAt || extra.updatedAt || '').getTime();
  if (!Number.isFinite(time)) return false;
  const today = new Date();
  const value = new Date(time);
  return today.getFullYear() === value.getFullYear()
    && today.getMonth() === value.getMonth()
    && today.getDate() === value.getDate();
}

function DashboardSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 p-5" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-xl bg-slate-50/70 p-3">
          <div className="h-14 w-24 rounded-lg bg-slate-100" />
          <div className="flex-1 space-y-2"><div className="h-3 w-32 rounded bg-slate-200" /><div className="h-3 w-48 rounded bg-slate-100" /></div>
          <div className="h-9 w-28 rounded-lg bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone, onClick, loading }: {
  label: string;
  value: number;
  detail: string;
  icon: React.ElementType;
  tone: 'blue' | 'green' | 'amber';
  onClick: () => void;
  loading: boolean;
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone];
  return (
    <button type="button" onClick={onClick} className="qc-command-kpi group relative min-h-[122px] overflow-hidden rounded-2xl bg-white p-4 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-blue-100">
      <div className="flex items-start gap-3.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}><Icon size={20} strokeWidth={1.9} /></span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-slate-600">{label}</span>
          {loading ? <span className="mt-2 block h-8 w-12 animate-pulse rounded bg-slate-100" /> : <span className="mt-0.5 block text-[30px] font-semibold leading-none tracking-[-0.04em] text-[#0b1020] tabular-nums">{value}</span>}
          <span className="mt-2 block text-[12px] font-medium text-slate-400">{detail}</span>
        </span>
      </div>
    </button>
  );
}

function PriorityThumbnail({ job }: { job: QCJob }) {
  const src = latestVehicleImage(job);
  return (
    <div className="qc-command-thumbnail flex h-[66px] w-[108px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
      {src ? <img src={getQCThumbnailUrl(src)} alt={vehicleLabel(job)} loading="lazy" decoding="async" fetchPriority="low" className="h-full w-full object-cover" /> : <Car size={28} strokeWidth={1.4} className="text-slate-400" aria-hidden />}
    </div>
  );
}

export default function QCDashboardView({ onNavigate, onSelectJob, statsLoading, jobs, activity = [], activityLoading = false, selectedRangeDays, selectedScope, onRangeChange, onScopeChange }: Props) {
  const activeJobs = useMemo(() => jobs.filter((job) => !isTerminalJob(job)), [jobs]);
  const periodJobs = useMemo(() => {
    const now = new Date();
    const start = selectedRangeDays === 1
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      : now.getTime() - selectedRangeDays * 24 * 60 * 60 * 1000;
    return activeJobs.filter((job) => latestUpdateMs(job) >= start);
  }, [activeJobs, selectedRangeDays]);
  const summaries = useMemo(() => new Map(activeJobs.map((job) => [job.id, evidenceForCurrentStage(job)])), [activeJobs]);
  const needEvidenceJobs = useMemo(() => activeJobs.filter((job) => (summaries.get(job.id)?.missing || 0) > 0), [activeJobs, summaries]);
  const readyForQcJobs = useMemo(() => activeJobs.filter((job) => { const summary = summaries.get(job.id); return summary?.stage === 'quality_check' && summary.missing === 0; }), [activeJobs, summaries]);
  const qcIssueJobs = useMemo(() => activeJobs.filter((job) => { const summary = summaries.get(job.id); return job.aiFlag || job.status === 'needs-fix' || job.status === 'resubmitted' || (summary?.stage === 'quality_check' && summary.missing > 0); }), [activeJobs, summaries]);
  const readyForPickupJobs = useMemo(() => activeJobs.filter((job) => currentDashboardStage(job) === 'ready_pickup'), [activeJobs]);
  const completedToday = useMemo(() => jobs.filter(happenedToday), [jobs]);

  const handoffJobs = activeJobs.filter((job) => ['payment', 'handover'].includes(serviceHandoffState(job) || ''));

  const priorityQueue = useMemo(() => activeJobs.filter((job) => !serviceHandoffState(job)).map((job) => {
    const evidence = summaries.get(job.id)!;
    const lastUpdate = latestUpdateMs(job);
    const stale = !lastUpdate || Date.now() - lastUpdate > STALE_AFTER_MS;
    const qcIssue = job.aiFlag || job.status === 'needs-fix' || job.status === 'resubmitted';
    let score = 0;
    if (evidence.missing > 0) score += 700 + evidence.missing * 12;
    if (evidence.stage === 'quality_check') score += 560;
    if (qcIssue) score += 640;
    if (stale) score += 280;
    score += Math.min(240, Math.max(0, job.elapsedMinutes || 0));
    let issue = 'Needs attention';
    let issueDetail = 'Open job';
    let action = 'Review Job';
    let issueTone = 'text-amber-600';
    if (job.status === 'needs-fix' || job.status === 'resubmitted') { issue = 'Rework Required'; issueDetail = 'QC decision unresolved'; issueTone = 'text-rose-600'; }
    else if (job.aiFlag) { issue = 'Evidence Flagged'; issueDetail = 'Automated check needs review'; issueTone = 'text-rose-600'; }
    else if (evidence.stage === 'quality_check' && evidence.missing > 0) { issue = 'QC Evidence Required'; issueDetail = `${evidence.missing} required`; action = 'Start QC'; issueTone = 'text-rose-600'; }
    else if (evidence.missing > 0) { issue = 'Missing Evidence'; issueDetail = `${evidence.missing} required`; action = 'Upload Evidence'; issueTone = 'text-rose-600'; }
    else if (evidence.stage === 'quality_check') { issue = 'Ready for QC'; issueDetail = 'Evidence complete'; action = 'Start QC'; issueTone = 'text-emerald-600'; }
    else if (stale) { issue = 'No Recent Update'; issueDetail = lastUpdate ? relativeTime(lastUpdate) : 'No update recorded'; }
    return { job, evidence, score, issue, issueDetail, action, issueTone };
  }).filter((item) => item.score >= 280).sort((a, b) => b.score - a.score || (b.job.elapsedMinutes || 0) - (a.job.elapsedMinutes || 0)).slice(0, 5), [activeJobs, summaries]);

  const totals = useMemo(() => evidenceTotals(periodJobs), [periodJobs]);
  const evidenceTotal = totals.complete + totals.missing + totals.replacement;
  const completePct = evidenceTotal ? Math.round((totals.complete / evidenceTotal) * 100) : 0;
  const missingPct = evidenceTotal ? Math.round((totals.missing / evidenceTotal) * 100) : 0;
  const replacementPct = evidenceTotal ? Math.max(0, 100 - completePct - missingPct) : 0;
  const donutStyle = { background: evidenceTotal ? `conic-gradient(#10b981 0 ${completePct}%, #f59e0b ${completePct}% ${completePct + missingPct}%, #ef4444 ${completePct + missingPct}% 100%)` : '#e2e8f0' };
  const workflow = STAGES.map((stage) => ({ stage, count: activeJobs.filter((job) => currentDashboardStage(job) === stage).length }));
  const completedCount = completedToday.length;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const openJob = (job?: QCJob) => { if (job && onSelectJob) onSelectJob(job.id); else onNavigate('live-tracker'); };
  const workflowIcons: Record<DashboardStage, React.ElementType> = { received: Car, in_progress: Wrench, quality_check: ShieldCheck, ready_pickup: PackageCheck, completed: Flag };

  return (
    <div className="qc-command-center mx-auto max-w-[1560px] space-y-5 pb-4">
      <section className="qc-command-hero overflow-hidden rounded-[20px] bg-white">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-7 lg:flex-row lg:items-start lg:justify-between lg:py-6">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Quality Command Center</span>
            <h1 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.04em] text-[#0b1020] sm:text-[34px]">What needs attention right now?</h1>
            <p className="mt-2 text-[13px] font-medium text-slate-500 sm:text-sm">{today} — live queue health, evidence status, and detailing progress.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <span className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />Live</span>
            <button type="button" onClick={() => onNavigate('jobs')} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"><ClipboardCheck size={15} className="text-blue-600" />{activeJobs.length} pending</button>
          </div>
        </div>
        <div className="qc-command-hero-divider flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-3"><span className="text-xs font-semibold text-slate-500">Period</span><div className="qc-command-filter-group flex rounded-xl border border-slate-200 bg-slate-50 p-1">{RANGE_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => onRangeChange(option.value)} aria-pressed={selectedRangeDays === option.value} className={`qc-command-filter-pill rounded-lg px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${selectedRangeDays === option.value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>{option.label}</button>)}</div></div>
          <div className="flex items-center gap-3"><span className="text-xs font-semibold text-slate-500">Scope</span><div className="qc-command-filter-group flex rounded-xl border border-slate-200 bg-slate-50 p-1">{SCOPE_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => onScopeChange(option.value)} aria-pressed={selectedScope === option.value} className={`qc-command-filter-pill rounded-lg px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${selectedScope === option.value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>{option.label}</button>)}</div></div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Need Evidence" value={needEvidenceJobs.length} detail="Missing or incomplete" icon={Camera} tone="blue" loading={statsLoading && jobs.length === 0} onClick={() => openJob(needEvidenceJobs[0])} />
        <MetricCard label="Ready for QC" value={readyForQcJobs.length} detail="Awaiting quality check" icon={CheckCircle2} tone="green" loading={statsLoading && jobs.length === 0} onClick={() => openJob(readyForQcJobs[0])} />
        <MetricCard label="QC Issues" value={qcIssueJobs.length} detail="Requires attention" icon={AlertTriangle} tone="amber" loading={statsLoading && jobs.length === 0} onClick={() => openJob(qcIssueJobs[0])} />
        <MetricCard label="Ready for Pickup" value={readyForPickupJobs.length} detail="Payment & customer handover" icon={Car} tone="blue" loading={statsLoading && jobs.length === 0} onClick={() => openJob(readyForPickupJobs[0])} />
        <MetricCard label="Completed Today" value={completedCount} detail="Officially released" icon={Trophy} tone="green" loading={statsLoading && jobs.length === 0} onClick={() => onNavigate('jobs')} />
      </section>

      <section className="qc-command-panel rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold text-slate-950">Pickup &amp; Sales Handoff</h2><p className="mt-1 text-sm text-slate-500">{handoffJobs.filter((job) => serviceHandoffState(job) === 'payment').length} with Sales/POS · {handoffJobs.filter((job) => serviceHandoffState(job) === 'handover').length} ready for customer handover</p></div>
          <button type="button" onClick={() => onNavigate('pos-queue')} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200">Open POS Payment Queue <ArrowRight size={16} /></button>
        </div>
        {handoffJobs.length > 0 ? <div className="mt-4 grid gap-4 xl:grid-cols-2">{handoffJobs.slice(0, 2).map((job) => <article key={job.id}><button type="button" onClick={() => openJob(job)} className="mb-3 text-left text-sm font-semibold text-slate-900 hover:text-blue-700">{job.customerName || job.customer}<span className="mt-1 block font-normal text-slate-500">{vehicleLabel(job)} · {job.plate}</span></button><QCPaymentHandoff job={job} /></article>)}</div> : <p className="mt-4 text-sm text-slate-500">Payment tasks appear automatically after the final QC gate is complete.</p>}
      </section>

      <section className="grid grid-cols-1 gap-4 min-[1400px]:grid-cols-[1.12fr_0.88fr]">
        <div className="qc-command-panel qc-command-priority overflow-hidden rounded-[18px] bg-white">
          <div className="qc-command-panel-header flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2.5"><h2 className="text-base font-semibold tracking-[-0.02em] text-[#0b1020]">Priority Queue</h2><span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">{priorityQueue.length}</span></div><button type="button" onClick={() => onNavigate('live-tracker')} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800 focus:outline-none focus:underline">View all <ArrowRight size={13} /></button></div>
          {statsLoading && jobs.length === 0 ? <DashboardSkeleton rows={4} /> : priorityQueue.length > 0 ? (
            <div className="qc-command-queue-list">{priorityQueue.map(({ job, evidence, issue, issueDetail, action, issueTone }) => (
              <button key={job.id} type="button" onClick={() => openJob(job)} className="qc-command-queue-row group grid w-full grid-cols-1 gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:bg-blue-50/60 sm:grid-cols-[108px_minmax(130px,1.2fr)_minmax(95px,0.8fr)_minmax(95px,0.8fr)_auto] sm:items-center sm:px-5">
                <PriorityThumbnail job={job} />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-950">{job.jobId || job.id}</span><span className="mt-0.5 block truncate text-xs font-medium text-slate-600">{job.customerName || job.customer}</span><span className="mt-0.5 block truncate text-[11px] text-slate-400">{vehicleLabel(job)}</span></span>
                <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Current Stage</span><span className="mt-1 block truncate text-xs font-semibold text-slate-700">{STAGE_META[evidence.stage].label}</span></span>
                <span className="min-w-0"><span className={`block truncate text-xs font-semibold ${issueTone}`}>{issue}</span><span className="mt-1 block truncate text-[11px] text-slate-500">{issueDetail}</span></span>
                <span className="flex items-center justify-between gap-3 sm:block sm:text-right"><span className="qc-command-primary-action inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[11px] font-semibold text-white transition group-hover:bg-blue-700">{action === 'Upload Evidence' ? <Upload size={13} /> : <ArrowRight size={13} />}{action}</span><span className={`mt-0 block text-[10px] font-semibold sm:mt-1.5 ${(job.elapsedMinutes || 0) >= QC_SLA_MINUTES ? 'text-rose-600' : 'text-amber-600'}`}>{dueLabel(job)}</span></span>
              </button>
            ))}</div>
          ) : <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ShieldCheck size={22} /></span><h3 className="mt-4 text-sm font-semibold text-slate-900">Everything looks good</h3><p className="mt-1 text-xs text-slate-500">No active jobs currently require your attention.</p></div>}
        </div>

        <div className="space-y-4">
          <div className="qc-command-panel qc-command-workflow rounded-[18px] bg-white px-5 py-4">
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[#0b1020]">Today's Workflow</h2>
            <div className="mt-5 overflow-x-auto pb-1"><div className="relative grid min-w-[560px] grid-cols-5 gap-2"><div className="qc-command-workflow-connector absolute left-[10%] right-[10%] top-5 h-px bg-slate-200" />{[...workflow, { stage: 'completed' as const, count: completedCount }].map(({ stage, count }) => { const Icon = workflowIcons[stage]; const target = stage === 'completed' ? completedToday[0] : activeJobs.find((job) => currentDashboardStage(job) === stage); const active = count > 0; return <button key={stage} type="button" onClick={() => stage === 'completed' ? onNavigate('jobs') : openJob(target)} className="qc-command-workflow-step relative z-[1] flex flex-col items-center rounded-xl px-1 py-1 text-center transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100"><span className={`qc-command-workflow-icon ${active ? 'is-active' : ''} flex h-10 w-10 items-center justify-center rounded-full border bg-white ${active ? 'border-blue-500 text-blue-600 shadow-[0_0_0_4px_#eff6ff]' : 'border-slate-200 text-slate-400'}`}><Icon size={17} strokeWidth={1.9} /></span><span className="mt-3 min-h-8 text-[11px] font-semibold leading-tight text-slate-600">{STAGE_META[stage].shortLabel}</span><span className="mt-0.5 text-lg font-semibold text-slate-950 tabular-nums">{count}</span></button>; })}</div></div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="qc-command-panel qc-command-evidence rounded-[18px] bg-white p-4">
              <h2 className="text-base font-semibold tracking-[-0.02em] text-[#0b1020]">Evidence Health</h2>
              {evidenceTotal > 0 ? <><div className="mt-5 flex items-center gap-3"><div className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full" style={donutStyle}><div className="flex h-[58px] w-[58px] flex-col items-center justify-center rounded-full bg-white"><span className="text-lg font-semibold tracking-tight text-slate-950">{completePct}%</span><span className="text-[9px] font-medium text-slate-500">Complete</span></div></div><div className="min-w-0 flex-1 space-y-2.5">{[
                { label: 'Complete', pct: completePct, count: totals.complete, dot: 'bg-emerald-500' },
                { label: 'Missing', pct: missingPct, count: totals.missing, dot: 'bg-amber-500' },
                { label: 'Needs Replacement', pct: replacementPct, count: totals.replacement, dot: 'bg-rose-500' },
              ].map((item) => <div key={item.label} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[11px]"><span className={`h-2 w-2 rounded-full ${item.dot}`} /><span className="truncate font-medium text-slate-600">{item.label}</span><span className="font-semibold text-slate-900 tabular-nums">{item.pct}% <span className="ml-1 text-slate-400">{item.count}</span></span></div>)}</div></div><div className="qc-command-soft-divider mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px]"><span className="font-medium text-slate-500">Total Evidence Items</span><span className="font-semibold text-slate-900 tabular-nums">{evidenceTotal}</span></div></> : <div className="qc-command-empty-state flex min-h-[180px] flex-col items-center justify-center text-center"><ImageIcon size={22} className="text-slate-300" /><p className="mt-3 text-xs font-semibold text-slate-700">No evidence recorded for this period</p></div>}
            </div>

            <div className="qc-command-panel qc-command-activity overflow-hidden rounded-[18px] bg-white">
              <div className="flex items-center justify-between px-5 pb-2 pt-5"><h2 className="text-base font-semibold tracking-[-0.02em] text-[#0b1020]">Recent Activity</h2><button type="button" onClick={() => onNavigate('jobs')} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 focus:outline-none focus:underline">View all</button></div>
              {activityLoading ? <DashboardSkeleton rows={3} /> : activity.length > 0 ? <div className="qc-command-activity-list px-3 pb-3">{activity.slice(0, 4).map((item) => { const approved = item.type === 'approved'; return <button key={item.id} type="button" onClick={() => openJob(jobs.find((job) => job.id === item.jobId || job.jobId === item.jobId))} className="qc-command-activity-row flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50 focus:outline-none focus:bg-blue-50"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${approved ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{approved ? <ShieldCheck size={15} /> : <RotateCcw size={15} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-slate-900">{approved ? 'QC approved' : 'Returned for rework'}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{item.jobId} · {item.customer}</span></span><span className="shrink-0 text-[10px] font-medium text-slate-400">{relativeTime(item.timestamp)}</span></button>; })}</div> : <div className="flex min-h-[190px] flex-col items-center justify-center text-center"><Clock3 size={22} className="text-slate-300" /><p className="mt-3 text-xs font-semibold text-slate-700">No recent activity</p><p className="mt-1 text-[11px] text-slate-400">QC decisions will appear here.</p></div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
