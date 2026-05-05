import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Car,
  ChevronDown,
  Clock,
  LogOut,
  CheckCircle2,
  Users,
  UserCheck,
  ArrowRight,
  Loader2,
  MapPin,
  Wrench,
  ShieldCheck,
  PackageCheck,
  Radio,
  PlayCircle,
  Flag,
} from 'lucide-react';
import type { QCJob } from '@/hooks/useQCData';
import type { ServiceStage } from './QCServiceControlPanel';
import { SERVICE_STAFF_ROSTER } from './QCServiceControlPanel';

// ── Stage config (Lucide icons — no emoji; neutral international copy) ─────────
const STAGES: {
  id: ServiceStage;
  label: string;
  sub: string;
  Icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  dot: string;
}[] = [
  {
    id: 'received',
    label: 'Vehicle arrival',
    sub: 'Received at workshop',
    Icon: Car,
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
    dot: '#3b82f6',
  },
  {
    id: 'in_progress',
    label: 'Service in progress',
    sub: 'Work in progress',
    Icon: Wrench,
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fde68a',
    dot: '#f59e0b',
  },
  {
    id: 'quality_check',
    label: 'Quality check',
    sub: 'Inspection',
    Icon: ShieldCheck,
    color: '#6d28d9',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    dot: '#8b5cf6',
  },
  {
    id: 'ready_pickup',
    label: 'Ready for pickup',
    sub: 'Customer notified',
    Icon: PackageCheck,
    color: '#15803d',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    dot: '#22c55e',
  },
];
const STAGE_ORDER: ServiceStage[] = STAGES.map(s => s.id);
function stageIdx(s?: ServiceStage | null) { return s ? STAGE_ORDER.indexOf(s) : -1; }

// ── Stage pill (restrained palette — editorial / global product) ───────────────
function StagePill({ stage }: { stage: ServiceStage | null }) {
  if (!stage) return (
    <span className="inline-flex items-center text-[11px] font-medium px-3 py-1.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200/90 tabular-nums">
      Not started
    </span>
  );
  if (stage === 'confirmed') return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium px-3.5 py-1.5 rounded-full border border-slate-200/90 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-900/[0.04]">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400/40 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-500" />
      </span>
      Awaiting arrival
    </span>
  );
  const cfg = STAGES.find(s => s.id === stage);
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-2 text-[11px] font-medium px-3.5 py-1.5 rounded-full border transition-all shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-black/[0.03]"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot, boxShadow: `0 0 0 3px ${cfg.dot}22` }} />
      {cfg.label}
    </span>
  );
}

// ── Staff Picker ───────────────────────────────────────────────────────────────
function StaffPicker({ slotLabel, value, onChange }: {
  slotLabel: string; value: string; onChange: (name: string, role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const initials = value ? value.split(' ').map(p => p[0]).join('').slice(0, 2) : '?';
  return (
    <div className="relative">
      <button 
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border text-left transition-all duration-200 outline-none focus:ring-2 focus:ring-slate-200 ${
          value ? 'bg-slate-50 border-slate-300 shadow-sm hover:border-slate-400' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
        }`}>
        <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold shadow-sm transition-colors ${
          value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'
        }`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 leading-none">{slotLabel}</p>
          <p className={`text-sm font-medium truncate mt-1.5 leading-snug ${value ? 'text-slate-900' : 'text-slate-400'}`}>
            {value || 'Select team member'}
          </p>
        </div>
        <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 right-0 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Staff Member</p>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {SERVICE_STAFF_ROSTER.map(s => (
              <button 
                key={s.name}
                type="button"
                onClick={() => { onChange(s.name, s.role); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 text-left transition-colors ${value === s.name ? 'bg-slate-50/80' : ''}`}>
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                  {s.name.split(' ').map(p => p[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.role}</p>
                </div>
                {value === s.name && <CheckCircle2 size={16} className="text-slate-800 flex-shrink-0" />}
              </button>
            ))}
          </div>
          <button 
            type="button"
            onClick={() => { onChange('', ''); setOpen(false); }}
            className="w-full px-4 py-3 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600 bg-white text-center transition-colors font-semibold">
            Remove Assignment
          </button>
        </div>
      )}
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────
const SLOTS = [
  { slot: 'staff1', label: 'Staff 1 — Lead' },
  { slot: 'staff2', label: 'Staff 2 — Exterior' },
  { slot: 'staff3', label: 'Staff 3 — Interior' },
  { slot: 'staff4', label: 'Staff 4 — Specialist' },
];

function JobTrackerCard({ job, onAdvance, onSaveStaff }: {
  job: QCJob;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onSaveStaff: (id: string, assignments: { slot: string; name: string; role: string }[]) => Promise<boolean>;
}) {
  const currentStage = (job as any).serviceTrackingStage as ServiceStage | null;
  const curIdx = stageIdx(currentStage);
  const nextStage = STAGE_ORDER[curIdx + 1] as ServiceStage | undefined;
  const nextCfg = nextStage ? STAGES.find(s => s.id === nextStage) : null;

  const [staffSlots, setStaffSlots] = useState(() =>
    SLOTS.map(s => {
      const ex = ((job as any).serviceStaffAssignments || []).find((a: any) => a.slot === s.slot);
      return { ...s, name: ex?.name || '', role: ex?.role || '' };
    })
  );
  const [advancingTo, setAdvancingTo] = useState<ServiceStage | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  const handleAdvance = async (stage: ServiceStage) => {
    setAdvancingTo(stage);
    await onAdvance(job.id, stage);
    setAdvancingTo(null);
  };

  const handleSaveStaff = async () => {
    setSavingStaff(true);
    await onSaveStaff(job.id, staffSlots.map(({ slot, name, role }) => ({ slot, name, role })));
    setSavingStaff(false);
  };

  const assignedCount = staffSlots.filter(s => s.name).length;
  const isComplete = !nextStage;

  const vehicleDisplay = [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || job.vehicle || '—';
  const plateDisplay = job.plate?.length > 20 ? '—' : (job.plate || '—');

  return (
    <div className="group flex flex-col overflow-visible rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04),0_18px_50px_-20px_rgba(15,23,42,0.14)] transition-all duration-300 hover:border-slate-300/90 hover:shadow-[0_1px_0_rgba(15,23,42,0.05),0_22px_56px_-18px_rgba(15,23,42,0.16)]">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-6 pt-7 pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset transition-all duration-300 ${
                isComplete
                  ? 'bg-slate-800 ring-white/10'
                  : currentStage
                    ? 'bg-slate-950 ring-white/10 group-hover:scale-[1.02]'
                    : 'bg-slate-100 ring-slate-900/[0.06]'
              }`}
            >
              <Car size={19} strokeWidth={1.75} className={isComplete || currentStage ? 'text-white' : 'text-slate-500'} />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-medium uppercase leading-none tracking-[0.14em] text-slate-500">
                {job.service}
              </p>
              <p className="truncate text-[17px] font-semibold leading-tight tracking-tight text-slate-950">{job.jobId}</p>
            </div>
          </div>
          <div className="flex-shrink-0 pt-0.5">
            <StagePill stage={currentStage} />
          </div>
        </div>

        {/* Vehicle · customer · elapsed — clearer hierarchy & breathing room */}
        <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Vehicle</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[13px] font-semibold leading-snug text-slate-900">{vehicleDisplay}</span>
                {plateDisplay !== '—' && (
                  <span className="rounded-md border border-slate-200/90 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-slate-600">
                    {plateDisplay}
                  </span>
                )}
              </div>
            </div>
            <span className="hidden h-9 w-px shrink-0 bg-slate-200/90 sm:block" aria-hidden />
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Customer</p>
              <p className="mt-1 truncate text-[13px] font-medium text-slate-700">{job.customer}</p>
            </div>
          </div>
          <div className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 sm:self-center">
            <Clock size={13} className="text-slate-400" strokeWidth={1.75} />
            <span className="text-[12px] font-medium tabular-nums text-slate-600">{job.elapsed || '0m'}</span>
          </div>
        </div>
      </div>

      {/* ── Stage Stepper ─────────────────────────────────────────────────── */}
      <div className="mt-6 border-y border-slate-100 bg-gradient-to-b from-slate-50/95 to-slate-50/50 px-5 py-6 sm:px-6">
        <div className="relative flex items-start gap-0">
          {STAGES.map((stage, idx) => {
            const isActive = currentStage === stage.id;
            const isPast = curIdx > idx;
            const StageIcon = stage.Icon;

            return (
              <React.Fragment key={stage.id}>
                <div className="relative z-10 flex flex-1 flex-col items-center gap-2.5">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-500 ${
                      isActive
                        ? 'scale-105 bg-white shadow-[0_10px_32px_-8px_rgba(15,23,42,0.15)]'
                        : isPast
                          ? 'border-slate-800 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200/90 bg-white text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]'
                    }`}
                    style={
                      isActive
                        ? {
                            borderColor: stage.color,
                            color: stage.color,
                            boxShadow: `0 10px 32px -6px ${stage.dot}40, 0 0 0 3px ${stage.bg}`,
                          }
                        : {}
                    }
                  >
                    {isPast && !isActive ? (
                      <CheckCircle2 size={19} strokeWidth={2} aria-hidden />
                    ) : (
                      <StageIcon size={19} strokeWidth={isActive ? 2.1 : 1.85} aria-hidden />
                    )}
                  </div>
                  <div className="flex max-w-[5.75rem] flex-col items-center sm:max-w-none">
                    <p
                      className={`text-center text-[10px] font-medium leading-snug tracking-wide sm:text-[11px] ${
                        isActive ? 'text-slate-900' : isPast ? 'text-slate-600' : 'text-slate-500'
                      }`}
                      style={isActive ? { color: stage.color } : {}}
                    >
                      {stage.label}
                    </p>
                  </div>
                </div>
                {idx < STAGES.length - 1 && (
                  <div
                    className={`mx-1 mt-[22px] h-0.5 min-w-[12px] flex-1 max-w-[48px] self-start rounded-full transition-colors duration-500 sm:mx-2 sm:max-w-none ${
                      isPast ? 'bg-slate-800' : 'bg-slate-200/90'
                    }`}
                    aria-hidden
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Advance / Release Button ───────────────────────────────────────── */}
      <div className="space-y-3 px-6 pb-5 pt-5">
        {isComplete ? (
          <>
            <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/80 py-3.5 text-[13px] font-medium text-emerald-900">
              <CheckCircle2 size={17} className="text-emerald-700" strokeWidth={2} />
              Service complete — ready for pickup
            </div>
            <button
              type="button"
              onClick={() => handleAdvance('released' as any)}
              disabled={!!advancingTo}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-slate-950 py-3.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_28px_-8px_rgba(0,0,0,0.45)] transition-all duration-200 hover:bg-slate-900 active:scale-[0.99] disabled:opacity-55 disabled:active:scale-100"
            >
              {advancingTo === ('released' as any) ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Releasing vehicle…
                </>
              ) : (
                <>
                  <LogOut size={17} strokeWidth={2} />
                  Mark vehicle as released
                </>
              )}
            </button>
          </>
        ) : !currentStage || currentStage === 'confirmed' ? (
          <button
            type="button"
            onClick={() => handleAdvance('received')}
            disabled={!!advancingTo}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-slate-950 py-3.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_28px_-8px_rgba(0,0,0,0.45)] transition-all duration-200 hover:bg-slate-900 active:scale-[0.99] disabled:opacity-55 disabled:active:scale-100"
          >
            {advancingTo ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                Starting tracking…
              </>
            ) : (
              <>
                <PlayCircle size={17} strokeWidth={2} aria-hidden />
                Start service tracking
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleAdvance(nextStage!)}
            disabled={!!advancingTo}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border bg-white py-3.5 text-[13px] font-semibold transition-all duration-200 hover:bg-slate-50 active:scale-[0.99] disabled:opacity-55"
            style={{
              color: nextCfg?.color,
              borderColor: `${nextCfg?.color}55`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1px ${nextCfg?.color}18`,
            }}
          >
            {advancingTo ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                Advancing…
              </>
            ) : (
              <>
                <ArrowRight size={17} strokeWidth={2} />
                Advance to {nextCfg?.label}
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Staff Assignment ───────────────────────────────────────────────── */}
      <div className="mt-auto rounded-b-2xl border-t border-slate-100 bg-slate-50/50">
        <button
          type="button"
          onClick={() => setStaffOpen(o => !o)}
          className="flex w-full items-center justify-between rounded-b-2xl px-6 py-4 text-left outline-none transition-colors hover:bg-slate-100/60"
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset transition-colors ${
                assignedCount > 0 ? 'bg-slate-900 text-white ring-white/10' : 'bg-white text-slate-500 ring-slate-900/[0.06]'
              }`}
            >
              <Users size={15} strokeWidth={1.75} />
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-slate-900">Service team</span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                assignedCount === 4
                  ? 'border-slate-800 bg-slate-900 text-white'
                  : assignedCount > 0
                    ? 'border-slate-200 bg-white text-slate-700'
                    : 'border-slate-200/80 bg-white text-slate-500'
              }`}
            >
              {assignedCount}/4 assigned
            </span>
          </div>
          <ChevronDown size={16} strokeWidth={1.75} className={`text-slate-400 transition-transform duration-300 ${staffOpen ? 'rotate-180' : ''}`} />
        </button>

        {staffOpen && (
          <div className="px-6 pb-6 space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {staffSlots.map(slot => (
                <StaffPicker
                  key={slot.slot}
                  slotLabel={slot.label}
                  value={slot.name}
                  onChange={(name, role) => setStaffSlots(prev => prev.map(s => s.slot === slot.slot ? { ...s, name, role } : s))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleSaveStaff}
              disabled={savingStaff}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:bg-slate-900 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100"
            >
              {savingStaff ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <UserCheck size={16} strokeWidth={2} />
                  Save team assignment
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const ORDER_STATUSES_ACTIVE = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'completed'];

export default function QCLiveTrackerView({ jobs, loading, onAdvance, onSaveStaff }: {
  jobs: QCJob[];
  loading: boolean;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onSaveStaff: (id: string, assignments: { slot: string; name: string; role: string }[]) => Promise<boolean>;
}) {
  const activeJobs    = jobs.filter(j => ORDER_STATUSES_ACTIVE.includes((j as any).orderStatus || ''));
  const releasedJobs  = jobs.filter(j => (j as any).orderStatus === 'released');

  return (
    <div className="space-y-6">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/60 pb-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.65rem]">Live tracker</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Control each step of the customer-facing tracker in real time.
          </p>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400/50 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-700" />
          </span>
          <span className="text-[13px] font-medium tabular-nums text-slate-800">
            {activeJobs.length} active {activeJobs.length === 1 ? 'job' : 'jobs'}
          </span>
        </div>
      </div>

      {/* ── Info Banner ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 rounded-2xl border border-slate-200/90 bg-white px-5 py-5 shadow-[0_1px_0_rgba(15,23,42,0.04),0_12px_40px_-24px_rgba(15,23,42,0.1)] sm:px-6">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50">
          <MapPin size={17} className="text-slate-700" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-slate-900">Operations control</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            Use <strong className="font-medium text-slate-800">Start service tracking</strong> when the vehicle arrives, then{' '}
            <strong className="font-medium text-slate-800">Advance</strong> at each milestone. Assign staff so names appear on the customer live view.
          </p>
        </div>
      </div>

      {/* ── Active Jobs ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {[1, 2].map(i => (
            <div key={i} className="h-96 animate-pulse rounded-2xl border border-slate-100 bg-slate-50/80" />
          ))}
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 py-24">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-400 shadow-sm">
            <Radio size={28} strokeWidth={1.5} aria-hidden />
          </div>
          <p className="text-[15px] font-semibold text-slate-900">No active jobs</p>
          <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-slate-500">
            Approved bookings will appear here. You can then start and drive the customer live tracker.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {activeJobs.map(job => (
            <JobTrackerCard key={job.id} job={job} onAdvance={onAdvance} onSaveStaff={onSaveStaff} />
          ))}
        </div>
      )}

      {/* ── Released Section ─────────────────────────────────────────────── */}
      {releasedJobs.length > 0 && (
        <div className="pt-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-slate-500">
              <CheckCircle2 size={14} className="text-slate-600" strokeWidth={2} />
              Released today — {releasedJobs.length}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {releasedJobs.map(job => (
              <div key={job.id} className="flex items-center gap-4 rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600">
                  <Flag size={18} strokeWidth={2} aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-base font-semibold tracking-tight text-slate-900">{job.jobId}</p>
                  <p className="text-sm font-medium text-slate-500 truncate mt-0.5">
                    {[job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || job.vehicle} · {job.customer}
                  </p>
                </div>
                <span className="rounded-md border border-slate-800/10 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white">Released</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
