import React, { useState } from 'react';
import {
  Radio, Car, ChevronRight, CheckCircle2, Circle, Loader2,
  Users, UserCheck, ChevronDown, Sparkles, Clock, Wrench,
  ArrowRightCircle, MapPin,
} from 'lucide-react';
import type { QCJob } from '@/hooks/useQCData';
import type { ServiceStage } from './QCServiceControlPanel';
import { SERVICE_STAFF_ROSTER } from './QCServiceControlPanel';

// ── Stage config ───────────────────────────────────────────────────────────────
const STAGES: {
  id: ServiceStage; label: string; sub: string;
  color: string; bg: string; border: string; dot: string; icon: string;
}[] = [
  { id: 'received',      label: 'Vehicle Arrive',      sub: 'Received at shop',     icon: '🚗', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6' },
  { id: 'in_progress',   label: 'Service In Progress', sub: 'Detailing underway',   icon: '🔧', color: '#b45309', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
  { id: 'quality_check', label: 'Quality Check',       sub: 'QC inspection',        icon: '🛡️', color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe', dot: '#8b5cf6' },
  { id: 'ready_pickup',  label: 'Ready for Pickup',    sub: 'Notify customer',      icon: '✅', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
];
const STAGE_ORDER: ServiceStage[] = STAGES.map(s => s.id);
function stageIdx(s?: ServiceStage | null) { return s ? STAGE_ORDER.indexOf(s) : -1; }

// ── Stage pill ─────────────────────────────────────────────────────────────────
function StagePill({ stage }: { stage: ServiceStage | null }) {
  if (!stage) return (
    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-400 border border-slate-200">
      Not started
    </span>
  );
  if (stage === 'confirmed') return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-indigo-50 text-indigo-600 border-indigo-200">
      <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-indigo-500" />
      Confirmed · Awaiting Arrival
    </span>
  );
  const cfg = STAGES.find(s => s.id === stage);
  if (!cfg) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.dot }} />
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
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
          value ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'
        }`}>
        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
          value ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
        }`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none">{slotLabel}</p>
          <p className={`text-sm font-semibold truncate mt-0.5 leading-tight ${value ? 'text-emerald-800' : 'text-slate-400 italic'}`}>
            {value || 'Tap to assign…'}
          </p>
        </div>
        <ChevronDown size={13} className={`flex-shrink-0 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Staff Member</p>
          </div>
          {SERVICE_STAFF_ROSTER.map(s => (
            <button key={s.name}
              onClick={() => { onChange(s.name, s.role); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left transition-colors ${value === s.name ? 'bg-emerald-50' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-[11px] text-white font-bold flex-shrink-0">
                {s.name.split(' ').map(p => p[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                <p className="text-xs text-slate-400">{s.role}</p>
              </div>
              {value === s.name && <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />}
            </button>
          ))}
          <button onClick={() => { onChange('', ''); setOpen(false); }}
            className="w-full px-4 py-2.5 text-xs text-rose-400 hover:bg-rose-50 border-t border-slate-100 text-center transition-colors font-medium">
            Remove Assignment
          </button>
        </div>
      )}
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────
const SLOTS = [
  { slot: 'staff1', label: 'Staff 1 · Lead'      },
  { slot: 'staff2', label: 'Staff 2 · Exterior'   },
  { slot: 'staff3', label: 'Staff 3 · Interior'   },
  { slot: 'staff4', label: 'Staff 4 · Specialist' },
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

  // Clean vehicle display — avoid showing IDs
  const vehicleDisplay = [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || job.vehicle || '—';
  const plateDisplay = job.plate?.length > 20 ? '—' : (job.plate || '—'); // hide if it looks like a hash/ID

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible hover:shadow-lg hover:border-slate-200 transition-all duration-200 flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
              isComplete ? 'bg-gradient-to-br from-green-500 to-emerald-600'
              : currentStage ? 'bg-gradient-to-br from-violet-500 to-indigo-600'
              : 'bg-gradient-to-br from-slate-600 to-slate-800'
            }`}>
              <Car size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">{job.service}</p>
              <p className="text-base font-bold text-slate-900 leading-tight">{job.jobId}</p>
            </div>
          </div>
          <StagePill stage={currentStage} />
        </div>

        {/* Vehicle + Customer row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Car size={11} className="text-slate-300" />
            <span className="font-medium">{vehicleDisplay}</span>
            {plateDisplay !== '—' && <span className="text-slate-300">·</span>}
            {plateDisplay !== '—' && <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-semibold">{plateDisplay}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="text-slate-300">·</span>
            <span className="font-semibold text-slate-700">{job.customer}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 ml-auto">
            <Clock size={10} />
            <span>{job.elapsed || '0m'}</span>
          </div>
        </div>
      </div>

      {/* ── Stage Stepper ─────────────────────────────────────────────────── */}
      <div className="px-5 pb-1">
        <div className="flex items-start gap-0">
          {STAGES.map((stage, idx) => {
            const isDone   = curIdx >= idx;
            const isActive = currentStage === stage.id;
            const isPast   = curIdx > idx;

            return (
              <React.Fragment key={stage.id}>
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  {/* Node */}
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 text-base ${
                      isActive ? 'shadow-lg scale-110 ring-4' :
                      isPast   ? 'opacity-40' : 'opacity-20'
                    }`}
                    style={isActive ? {
                      background: stage.bg,
                      boxShadow: `0 4px 14px ${stage.dot}55`,
                    } : isPast ? {
                      background: '#f1f5f9',
                    } : {
                      background: '#f8fafc',
                    }}
                  >
                    {isPast && !isActive ? '✓' : stage.icon}
                  </div>
                  {/* Label */}
                  <p className={`text-[9px] font-bold text-center leading-tight w-14 ${
                    isActive ? 'text-slate-800' : isPast ? 'text-slate-300' : 'text-slate-200'
                  }`} style={isActive ? { color: stage.color } : {}}>
                    {stage.label}
                  </p>
                </div>
                {idx < STAGES.length - 1 && (
                  <div className={`h-0.5 flex-[0.3] mt-5 rounded-full transition-all ${isPast ? 'bg-slate-300' : 'bg-slate-100'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Advance Button ─────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        {isComplete ? (
          <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold bg-green-50 text-green-700 border-2 border-green-200">
            <CheckCircle2 size={16} />
            Service Complete · Ready for Pickup
          </div>
        ) : (!currentStage || currentStage === 'confirmed') ? (
          <button
            onClick={() => handleAdvance('received')}
            disabled={!!advancingTo}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-60 hover:shadow-xl"
            style={{ background: 'linear-gradient(135deg,#7c3aed 0%,#6366f1 100%)', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}
          >
            {advancingTo
              ? <><Loader2 size={16} className="animate-spin" />Starting tracking…</>
              : <><Sparkles size={16} />Start Service Tracking</>}
          </button>
        ) : (
          <button
            onClick={() => handleAdvance(nextStage!)}
            disabled={!!advancingTo}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-bold border-2 transition-all active:scale-[0.98] disabled:opacity-60 hover:opacity-90 shadow-sm"
            style={{
              background: nextCfg?.bg,
              color: nextCfg?.color,
              borderColor: nextCfg?.border,
              boxShadow: `0 4px 12px ${nextCfg?.dot}30`,
            }}
          >
            {advancingTo
              ? <><Loader2 size={16} className="animate-spin" />Advancing…</>
              : <><ArrowRightCircle size={16} />Advance → {nextCfg?.label}</>}
          </button>
        )}
      </div>

      {/* ── Staff Assignment ───────────────────────────────────────────────── */}
      <div className="border-t border-slate-50 mt-auto">
        <button
          onClick={() => setStaffOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50/70 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${assignedCount > 0 ? 'bg-emerald-100' : 'bg-slate-100'}`}>
              <Users size={12} className={assignedCount > 0 ? 'text-emerald-600' : 'text-slate-400'} />
            </div>
            <span className="text-xs font-bold text-slate-600">Service Team</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              assignedCount === 4 ? 'bg-emerald-100 text-emerald-700' :
              assignedCount > 0  ? 'bg-amber-100 text-amber-700' :
                                   'bg-slate-100 text-slate-400'
            }`}>
              {assignedCount}/4 assigned
            </span>
          </div>
          <ChevronDown size={14} className={`text-slate-300 transition-transform duration-200 ${staffOpen ? 'rotate-180' : ''}`} />
        </button>

        {staffOpen && (
          <div className="px-5 pb-5 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
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
              onClick={handleSaveStaff}
              disabled={savingStaff}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-70 shadow-sm mt-1"
            >
              {savingStaff
                ? <><Loader2 size={14} className="animate-spin" />Saving team…</>
                : <><UserCheck size={14} />Save Team Assignment</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const ORDER_STATUSES_ACTIVE = ['approved', 'confirmed', 'assigned', 'received', 'in_progress'];

export default function QCLiveTrackerView({ jobs, loading, onAdvance, onSaveStaff }: {
  jobs: QCJob[];
  loading: boolean;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onSaveStaff: (id: string, assignments: { slot: string; name: string; role: string }[]) => Promise<boolean>;
}) {
  const activeJobs   = jobs.filter(j => ORDER_STATUSES_ACTIVE.includes((j as any).orderStatus || ''));
  const completedJobs = jobs.filter(j => (j as any).orderStatus === 'completed');

  return (
    <div className="space-y-5">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Tracker Control</h1>
          <p className="text-sm text-slate-400 mt-0.5">Advance the customer's live tracking step in real-time</p>
        </div>
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 shadow-sm">
          <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-500" />
          </span>
          <span className="text-sm font-bold text-emerald-700">
            {activeJobs.length} Active Job{activeJobs.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Info Banner ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl border"
        style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#eef2ff 100%)', borderColor: '#ddd6fe' }}>
        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <MapPin size={13} className="text-violet-600" />
        </div>
        <div>
          <p className="text-xs font-bold text-violet-800 mb-0.5">You control the tracker</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Press <strong className="text-slate-700">Start Service Tracking</strong> when the vehicle arrives, then press <strong className="text-slate-700">Advance</strong> to move the customer's live tracking forward at each step. Assign staff to display the team on the customer's screen.
          </p>
        </div>
      </div>

      {/* ── Active Jobs ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-72 animate-pulse" />)}
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-violet-200"
          style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)' }}>
          <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4 ring-4 ring-violet-50 text-3xl">
            📡
          </div>
          <p className="text-base font-bold text-slate-700">No active jobs</p>
          <p className="text-sm text-slate-400 mt-1.5 text-center max-w-sm">
            Jobs appear here once a booking is approved by Sales. You can then start and control the customer's live tracker.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {activeJobs.map(job => (
            <JobTrackerCard key={job.id} job={job} onAdvance={onAdvance} onSaveStaff={onSaveStaff} />
          ))}
        </div>
      )}

      {/* ── Completed Section ───────────────────────────────────────────── */}
      {completedJobs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-green-400" />
              Completed Today · {completedJobs.length}
            </span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {completedJobs.map(job => (
              <div key={job.id} className="flex items-center gap-3 px-4 py-3.5 bg-green-50 border border-green-100 rounded-xl">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center text-lg flex-shrink-0">✅</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{job.jobId}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {[job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || job.vehicle} · {job.customer}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-600 text-white">Done</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
