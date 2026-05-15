import React, { useState, useCallback } from 'react';
import {
  CheckCircle2, Circle, ChevronRight, Users, UserCheck, Loader2,
  Car, Wrench, ShieldCheck, Star, Play, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  normalizeStaffGateSlot,
  requiredSlotsCountForGate,
} from '@/lib/tracker-gate-photo-slots';

// ── Preset Staff Roster ────────────────────────────────────────────────────────
export const SERVICE_STAFF_ROSTER = [
  { name: 'Marco Reyes',       role: 'Lead Detailer'          },
  { name: 'Carlo Santos',      role: 'Exterior Specialist'     },
  { name: 'Angelo Cruz',       role: 'Interior & Coating'      },
  { name: 'Joven Dela Torre',  role: 'Paint Correction'        },
  { name: 'Renz Villanueva',   role: 'Rim & Undercarriage'     },
  { name: 'Brent Lim',         role: 'Polishing Technician'    },
];

// ── Tracking Stages ────────────────────────────────────────────────────────────
export type ServiceStage = 'confirmed' | 'received' | 'in_progress' | 'quality_check' | 'ready_pickup' | 'completed' | 'released';

const STAGES: { id: ServiceStage; label: string; sub: string; icon: React.ElementType; color: string; bg: string; ring: string }[] = [
  { id: 'received',      label: 'Vehicle Arrive',   sub: 'Vehicle received at shop',      icon: Car,          color: 'text-blue-600',   bg: 'bg-blue-50',   ring: 'ring-blue-200'   },
  { id: 'in_progress',   label: 'Service In Progress', sub: 'Detailing underway',         icon: Wrench,       color: 'text-amber-600',  bg: 'bg-amber-50',  ring: 'ring-amber-200'  },
  { id: 'quality_check', label: 'Quality Check',    sub: 'QC inspection in progress',     icon: ShieldCheck,  color: 'text-violet-600', bg: 'bg-violet-50', ring: 'ring-violet-200' },
  { id: 'ready_pickup',  label: 'Ready for Pickup', sub: 'Vehicle ready — notify client', icon: Star,         color: 'text-green-600',  bg: 'bg-green-50',  ring: 'ring-green-200'  },
];

const STAGE_ORDER: ServiceStage[] = ['received', 'in_progress', 'quality_check', 'ready_pickup'];

function stageIndex(s: ServiceStage | undefined) {
  return STAGE_ORDER.indexOf(s as ServiceStage);
}

// ── Staff Slot Card ────────────────────────────────────────────────────────────
interface StaffSlot {
  slot: string;
  label: string;
  name: string;
  role: string;
}

function StaffSlotCard({
  slot,
  onChange,
}: {
  slot: StaffSlot;
  onChange: (name: string, role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const assigned = slot.name.trim().length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 text-left group ${
          assigned
            ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          assigned
            ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200'
            : 'bg-slate-100 text-slate-400'
        }`}>
          {assigned ? slot.name.split(' ').map(p => p[0]).join('').slice(0, 2) : '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-medium uppercase tracking-widest ${assigned ? 'text-emerald-500' : 'text-slate-400'}`}>
            {slot.label}
          </p>
          <p className={`text-sm font-semibold truncate mt-0.5 ${assigned ? 'text-slate-800' : 'text-slate-400 italic'}`}>
            {assigned ? slot.name : 'Tap to assign'}
          </p>
          {assigned && <p className="text-[11px] text-slate-400 truncate">{slot.role}</p>}
        </div>
        {assigned && <UserCheck size={14} className="text-emerald-500 flex-shrink-0" />}
        {!assigned && <ChevronDown size={14} className="text-slate-300 group-hover:text-slate-400 flex-shrink-0 transition-colors" />}
      </button>

      {/* Dropdown picker */}
      {open && (
        <div className="absolute z-30 top-full mt-1.5 left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-100 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Select Staff</p>
          </div>
          {SERVICE_STAFF_ROSTER.map((s) => (
            <button
              key={s.name}
              onClick={() => { onChange(s.name, s.role); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left ${
                slot.name === s.name ? 'bg-emerald-50' : ''
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                {s.name.split(' ').map(p => p[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                <p className="text-xs text-slate-400 truncate">{s.role}</p>
              </div>
              {slot.name === s.name && <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />}
            </button>
          ))}
          <button
            onClick={() => { onChange('', ''); setOpen(false); }}
            className="w-full px-3 py-2 text-xs text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors text-center border-t border-slate-100"
          >
            Clear assignment
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface Props {
  jobId: string;
  currentStage?: ServiceStage;
  currentAssignments?: { slot: string; name: string; role: string }[];
  trackerStageMedia?: { stage?: string; slot?: string; photoUrl?: string; hasPhoto?: boolean }[];
  onUpdateStage: (id: string, stage: ServiceStage) => Promise<boolean>;
  onAssignStaff: (id: string, assignments: { slot: string; name: string; role: string }[]) => Promise<boolean>;
}

const STAFF_SLOTS: Omit<StaffSlot, 'name' | 'role'>[] = [
  { slot: 'staff1', label: 'Staff 1 · Lead'       },
  { slot: 'staff2', label: 'Staff 2 · Exterior'    },
  { slot: 'staff3', label: 'Staff 3 · Interior'    },
  { slot: 'staff4', label: 'Staff 4 · Specialist'  },
];

export default function QCServiceControlPanel({
  jobId,
  currentStage,
  currentAssignments = [],
  trackerStageMedia = [],
  onUpdateStage,
  onAssignStaff,
}: Props) {
  const [advancingTo, setAdvancingTo] = useState<ServiceStage | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);

  // Build local staff state
  const [staffSlots, setStaffSlots] = useState<StaffSlot[]>(() =>
    STAFF_SLOTS.map((s) => {
      const existing = currentAssignments.find((a) => a.slot === s.slot);
      return { ...s, name: existing?.name || '', role: existing?.role || '' };
    })
  );

  const activeIdx = stageIndex(currentStage);
  const countGatePhotos = (stage: ServiceStage) => {
    if (stage === 'quality_check') {
      return trackerStageMedia.some((item) =>
        item.stage === stage &&
        (String(item.photoUrl || '').trim() || item.hasPhoto)
      ) ? 1 : 0;
    }

    const keys = new Set<string>();
    trackerStageMedia.forEach((item) => {
      if (item.stage !== stage) return;
      if (!String(item.photoUrl || '').trim() && !item.hasPhoto) return;
      const slot = normalizeStaffGateSlot(item.slot, item.stage);
      keys.add(slot || '__legacy__');
    });
    return keys.size;
  };

  const gateReadyForAdvance = (stage: ServiceStage) => {
    const required = requiredSlotsCountForGate(stage, true);
    return countGatePhotos(stage) >= required;
  };

  const handleAdvance = useCallback(async (stage: ServiceStage) => {
    const currentGate = STAGE_ORDER[Math.max(0, STAGE_ORDER.indexOf(stage) - 1)] || stage;
    if (!gateReadyForAdvance(currentGate)) {
      const required = requiredSlotsCountForGate(currentGate, true);
      toast.error(`Upload all ${required} required photo${required === 1 ? '' : 's'} before advancing.`);
      return;
    }
    setAdvancingTo(stage);
    await onUpdateStage(jobId, stage);
    setAdvancingTo(null);
  }, [jobId, onUpdateStage, trackerStageMedia]);

  const handleStaffChange = (slot: string, name: string, role: string) => {
    setStaffSlots((prev) => prev.map((s) => s.slot === slot ? { ...s, name, role } : s));
  };

  const handleSaveStaff = async () => {
    setSavingStaff(true);
    const assignments = staffSlots.map(({ slot, name, role }) => ({ slot, name, role }));
    await onAssignStaff(jobId, assignments);
    setSavingStaff(false);
  };

  const assignedCount = staffSlots.filter((s) => s.name).length;

  return (
    <div className="space-y-4">
      {/* ── Stage Control ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Play size={13} className="text-white" fill="white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Service Tracker Control</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Advance the customer's live tracker</p>
            </div>
          </div>
          {currentStage && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Stage stepper */}
        <div className="p-4 space-y-2">
          {STAGES.map((stage, idx) => {
            const isDone    = activeIdx >= idx && currentStage !== undefined;
            const isActive  = currentStage === stage.id;
            const isNext    = idx === activeIdx + 1 || (activeIdx === -1 && idx === 0);
            const isLocked  = idx > activeIdx + 1;
            const loading   = advancingTo === stage.id;
            const Icon      = stage.icon;
            const gateForAdvance = STAGE_ORDER[Math.max(0, STAGE_ORDER.indexOf(stage.id) - 1)] || stage.id;
            const canAdvance = gateReadyForAdvance(gateForAdvance);
            const required = requiredSlotsCountForGate(gateForAdvance, true);

            return (
              <div key={stage.id} className="flex items-center gap-3">
                {/* Connector line */}
                <div className="flex flex-col items-center flex-shrink-0 w-9">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ring-2 transition-all ${
                    isActive ? `${stage.bg} ${stage.ring} ring-offset-1 shadow-sm` :
                    isDone   ? 'bg-slate-100 ring-slate-200'                        :
                               'bg-white ring-slate-100'
                  }`}>
                    {isDone && !isActive
                      ? <CheckCircle2 size={16} className="text-slate-400" />
                      : isActive
                        ? <Icon size={16} className={stage.color} />
                        : <Circle size={16} className="text-slate-200" />
                    }
                  </div>
                  {idx < STAGES.length - 1 && (
                    <div className={`w-0.5 h-4 mt-1 rounded-full ${isDone && activeIdx > idx ? 'bg-slate-300' : 'bg-slate-100'}`} />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isActive ? 'text-slate-900' : isDone ? 'text-slate-500' : 'text-slate-300'}`}>
                    {stage.label}
                  </p>
                  <p className={`text-[11px] truncate ${isActive ? 'text-slate-500' : 'text-slate-300'}`}>
                    {stage.sub}
                  </p>
                </div>

                {/* Action button */}
                {isActive ? (
                  <span className={`flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${stage.bg} ${stage.color} border ${stage.ring}`}>
                    Current
                  </span>
                ) : isNext ? (
                  <button
                    onClick={() => handleAdvance(stage.id)}
                    disabled={!!advancingTo || !canAdvance}
                    title={!canAdvance ? `Upload ${required} required photo${required === 1 ? '' : 's'} first` : undefined}
                    className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${canAdvance ? `${stage.bg} ${stage.color} border-current hover:opacity-80 shadow-sm` : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                  >
                    {loading
                      ? <Loader2 size={11} className="animate-spin" />
                      : <ChevronRight size={11} />
                    }
                    {loading ? 'Updating…' : canAdvance ? 'Advance' : `${countGatePhotos(gateForAdvance)}/${required}`}
                  </button>
                ) : isDone ? (
                  <CheckCircle2 size={16} className="text-slate-300 flex-shrink-0" />
                ) : (
                  <div className="w-8" />
                )}
              </div>
            );
          })}
        </div>

        {/* Start button (no stage yet or Sales just confirmed) */}
        {(!currentStage || currentStage === 'confirmed') && (
          <div className="px-4 pb-4">
            <button
              onClick={() => handleAdvance('received')}
              disabled={!!advancingTo}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-bold shadow-md shadow-violet-100 transition-all active:scale-[0.98] disabled:opacity-70"
            >
              {advancingTo ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} fill="white" />}
              {advancingTo ? 'Starting…' : 'Start Service Tracking'}
            </button>
          </div>
        )}
      </div>

      {/* ── Staff Assignment ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Users size={13} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Service Team</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Assign staff to this job</p>
            </div>
          </div>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
            assignedCount === 4
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            {assignedCount}/{STAFF_SLOTS.length} assigned
          </span>
        </div>

        <div className="p-4 space-y-2">
          {staffSlots.map((slot) => (
            <StaffSlotCard
              key={slot.slot}
              slot={slot}
              onChange={(name, role) => handleStaffChange(slot.slot, name, role)}
            />
          ))}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={handleSaveStaff}
            disabled={savingStaff}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition-all active:scale-[0.98] disabled:opacity-70"
          >
            {savingStaff
              ? <><Loader2 size={14} className="animate-spin" />Saving…</>
              : <><UserCheck size={14} />Save Team Assignment</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
