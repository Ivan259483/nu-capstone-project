import React, { useState } from 'react';
import {
  Car, ChevronDown, Sparkles, Clock, LogOut, CheckCircle2, Users, UserCheck, ArrowRight, Loader2, MapPin
} from 'lucide-react';
import type { QCJob } from '@/hooks/useQCData';
import type { ServiceStage } from './QCServiceControlPanel';
import { SERVICE_STAFF_ROSTER } from './QCServiceControlPanel';

// ── Stage config ───────────────────────────────────────────────────────────────
const STAGES: {
  id: ServiceStage; label: string; sub: string;
  color: string; bg: string; border: string; dot: string; icon: string;
}[] = [
  { id: 'received',      label: 'Vehicle Arrive',      sub: 'Received at shop',     icon: '🚗', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6' },
  { id: 'in_progress',   label: 'Service In Progress', sub: 'Detailing underway',   icon: '🔧', color: '#b45309', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
  { id: 'quality_check', label: 'Quality Check',       sub: 'QC inspection',        icon: '🛡️', color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe', dot: '#8b5cf6' },
  { id: 'ready_pickup',  label: 'Ready for Pickup',    sub: 'Notify customer',      icon: '✨', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
];
const STAGE_ORDER: ServiceStage[] = STAGES.map(s => s.id);
function stageIdx(s?: ServiceStage | null) { return s ? STAGE_ORDER.indexOf(s) : -1; }

// ── Stage pill ─────────────────────────────────────────────────────────────────
function StagePill({ stage }: { stage: ServiceStage | null }) {
  if (!stage) return (
    <span className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200 shadow-sm">
      Not started
    </span>
  );
  if (stage === 'confirmed') return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-full border shadow-sm bg-indigo-50 text-indigo-700 border-indigo-200">
      <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-indigo-500" />
      Awaiting Arrival
    </span>
  );
  const cfg = STAGES.find(s => s.id === stage);
  if (!cfg) return null;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-full border shadow-sm transition-all"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.dot, boxShadow: `0 0 6px ${cfg.dot}` }} />
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">{slotLabel}</p>
          <p className={`text-sm font-semibold truncate mt-1 leading-tight ${value ? 'text-slate-800' : 'text-slate-400 italic'}`}>
            {value || 'Assign staff...'}
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

  const vehicleDisplay = [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || job.vehicle || '—';
  const plateDisplay = job.plate?.length > 20 ? '—' : (job.plate || '—');

  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-visible hover:shadow-[0_8px_40px_rgb(0,0,0,0.08)] hover:border-slate-300/80 transition-all duration-300 flex flex-col group">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm transition-all duration-300 ${
              isComplete ? 'bg-slate-800'
              : currentStage ? 'bg-slate-900 shadow-md group-hover:scale-105'
              : 'bg-slate-100'
            }`}>
              <Car size={20} className={isComplete || currentStage ? "text-white" : "text-slate-400"} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">{job.service}</p>
              <p className="text-lg font-bold text-slate-900 leading-tight tracking-tight truncate">{job.jobId}</p>
            </div>
          </div>
          <StagePill stage={currentStage} />
        </div>

        {/* Vehicle + Customer row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <span className="text-slate-800">{vehicleDisplay}</span>
            {plateDisplay !== '—' && <span className="text-slate-300 px-1">·</span>}
            {plateDisplay !== '—' && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-xs font-semibold">{plateDisplay}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-600">
            <span className="text-slate-300 px-1">·</span>
            <span className="font-semibold text-slate-800">{job.customer}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg ml-auto">
            <Clock size={12} />
            <span>{job.elapsed || '0m'}</span>
          </div>
        </div>
      </div>

      {/* ── Stage Stepper ─────────────────────────────────────────────────── */}
      <div className="px-6 py-4 bg-slate-50/50 border-y border-slate-100">
        <div className="flex items-start gap-0 relative">
          {STAGES.map((stage, idx) => {
            const isDone   = curIdx >= idx;
            const isActive = currentStage === stage.id;
            const isPast   = curIdx > idx;

            return (
              <React.Fragment key={stage.id}>
                <div className="flex flex-col items-center gap-2 flex-1 relative z-10">
                  {/* Node */}
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 text-xl border-2 ${
                      isActive ? 'shadow-lg scale-110 bg-white ring-4 ring-offset-2' :
                      isPast   ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-300'
                    }`}
                    style={isActive ? {
                      borderColor: stage.color,
                      color: stage.color,
                      boxShadow: `0 8px 24px ${stage.dot}40`,
                    } : {}}
                  >
                    {isPast && !isActive ? <CheckCircle2 size={20} /> : stage.icon}
                  </div>
                  {/* Label */}
                  <div className="flex flex-col items-center mt-1">
                    <p className={`text-[10px] font-bold text-center leading-tight tracking-wide uppercase ${
                      isActive ? 'text-slate-800' : isPast ? 'text-slate-600' : 'text-slate-400'
                    }`} style={isActive ? { color: stage.color } : {}}>
                      {stage.label}
                    </p>
                  </div>
                </div>
                {idx < STAGES.length - 1 && (
                  <div className={`h-1 flex-[0.5] mt-5.5 rounded-full transition-all duration-500 relative z-0 -mx-4 ${
                    isPast ? 'bg-slate-800' : 'bg-slate-200'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Advance / Release Button ───────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 space-y-3">
        {isComplete ? (
          <>
            <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold bg-green-50 text-green-700 border border-green-200">
              <CheckCircle2 size={18} className="text-green-600" />
              Service Complete · Ready for Pickup
            </div>
            <button
              type="button"
              onClick={() => handleAdvance('released' as any)}
              disabled={!!advancingTo}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl text-sm font-bold text-white shadow-md transition-all duration-200 active:scale-[0.98] disabled:opacity-60 hover:shadow-lg bg-slate-900 hover:bg-black"
            >
              {advancingTo === ('released' as any)
                ? <><Loader2 size={18} className="animate-spin" />Releasing vehicle…</>
                : <><LogOut size={18} />Mark Vehicle as Released</>}
            </button>
          </>
        ) : (!currentStage || currentStage === 'confirmed') ? (
          <button
            type="button"
            onClick={() => handleAdvance('received')}
            disabled={!!advancingTo}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl text-sm font-bold text-white shadow-md transition-all duration-200 active:scale-[0.98] disabled:opacity-60 hover:shadow-lg bg-slate-900 hover:bg-black"
          >
            {advancingTo
              ? <><Loader2 size={18} className="animate-spin" />Starting tracking…</>
              : <><Sparkles size={18} />Start Service Tracking</>}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleAdvance(nextStage!)}
            disabled={!!advancingTo}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl text-sm font-bold border-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 hover:shadow-md"
            style={{
              background: 'white',
              color: nextCfg?.color,
              borderColor: nextCfg?.color,
            }}
          >
            {advancingTo
              ? <><Loader2 size={18} className="animate-spin" />Advancing…</>
              : <><ArrowRight size={18} />Advance → {nextCfg?.label}</>}
          </button>
        )}
      </div>

      {/* ── Staff Assignment ───────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 mt-auto bg-slate-50/30 rounded-b-3xl">
        <button
          type="button"
          onClick={() => setStaffOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors rounded-b-3xl outline-none"
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${assignedCount > 0 ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <Users size={14} className={assignedCount > 0 ? 'text-white' : 'text-slate-500'} />
            </div>
            <span className="text-sm font-bold text-slate-800">Service Team</span>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
              assignedCount === 4 ? 'bg-slate-800 text-white' :
              assignedCount > 0  ? 'bg-slate-200 text-slate-700' :
                                   'bg-slate-100 text-slate-400'
            }`}>
              {assignedCount}/4 assigned
            </span>
          </div>
          <ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 ${staffOpen ? 'rotate-180' : ''}`} />
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
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800 hover:bg-black text-white text-sm font-bold transition-all duration-200 active:scale-[0.98] disabled:opacity-70 shadow-sm"
            >
              {savingStaff
                ? <><Loader2 size={16} className="animate-spin" />Saving team…</>
                : <><UserCheck size={16} />Confirm Team Assignment</>}
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
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Live Tracker Control</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Advance the customer's live tracking step in real-time</p>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75" />
            <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-slate-800" />
          </span>
          <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            {activeJobs.length} Active Job{activeJobs.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Info Banner ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 px-6 py-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0 border border-slate-100">
          <MapPin size={18} className="text-slate-800" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900 mb-1">You control the tracker</p>
          <p className="text-sm text-slate-500 leading-relaxed font-medium">
            Press <strong className="text-slate-800">Start Service Tracking</strong> when the vehicle arrives, then press <strong className="text-slate-800">Advance</strong> to move the customer's live tracking forward at each step. Assign staff to display the team on the customer's screen.
          </p>
        </div>
      </div>

      {/* ── Active Jobs ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {[1, 2].map(i => <div key={i} className="bg-white rounded-3xl border border-slate-100 h-96 animate-pulse" />)}
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-3xl border border-dashed border-slate-300 bg-slate-50/50">
          <div className="w-20 h-20 rounded-3xl bg-white shadow-sm flex items-center justify-center mb-5 border border-slate-100 text-4xl">
            📡
          </div>
          <p className="text-lg font-bold text-slate-900">No active jobs</p>
          <p className="text-sm font-medium text-slate-500 mt-2 text-center max-w-sm leading-relaxed">
            Jobs appear here once a booking is approved. You can then start and control the customer's live tracker.
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
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 size={14} className="text-slate-800" />
              Released Today · {releasedJobs.length}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {releasedJobs.map(job => (
              <div key={job.id} className="flex items-center gap-4 px-5 py-4 bg-white border border-slate-200 shadow-sm rounded-2xl hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xl flex-shrink-0">🏁</div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-slate-900 tracking-tight">{job.jobId}</p>
                  <p className="text-sm font-medium text-slate-500 truncate mt-0.5">
                    {[job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || job.vehicle} · {job.customer}
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 text-white">Released</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
