import React, { useState } from 'react';
import { MapPin, Phone, User, History } from 'lucide-react';
import { OpsSlideOver, OpsStatusBadge, OpsPriorityBadge } from '../ui/OpsUIKit';
import type { OpsJob, OpsTechnician } from '../ops-types';
import type { JobStatus } from '../ui/OpsUIKit';

interface Props {
  job: OpsJob | null;
  open: boolean;
  onClose: () => void;
  technicians: OpsTechnician[];
  onAssign: (jobId: string, techId: string) => void;
  onStatusChange: (jobId: string, status: JobStatus) => void;
}

const TABS = ['Overview', 'History', 'Notes'] as const;
type Tab = typeof TABS[number];

export default function OpsJobSlideOver({ job, open, onClose, technicians, onAssign, onStatusChange }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [selectedTech, setSelectedTech] = useState('');
  const [saving, setSaving] = useState(false);

  if (!job) return null;

  const tech = technicians.find(t => t.id === job.technicianId);

  const handleAssign = async () => {
    if (!selectedTech) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    onAssign(job.id, selectedTech);
    setSaving(false);
    setSelectedTech('');
  };

  const slaClass = job.slaStatus === 'Breached' ? 'bg-red-50 text-red-700'
    : job.slaStatus === 'At Risk' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700';

  return (
    <OpsSlideOver
      open={open}
      onClose={onClose}
      title={job.jobNumber}
      subtitle={job.serviceType}
      width="w-[520px]"
    >
      {/* Status + Priority row */}
      <div className="px-6 pt-4 pb-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <OpsStatusBadge status={job.status} />
          <OpsPriorityBadge priority={job.priority} />
          <span className={`ops-badge text-[11px] font-medium ${slaClass}`}>
            SLA: {job.slaStatus}
          </span>
        </div>
      </div>

      {/* Tabs — pill segments, no underline / divider */}
      <div className="px-6 pb-4">
        <div className="ops-tab-segment-wrap" role="tablist">
          {TABS.map(tab => (
            <button
              key={`so-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`ops-tab-segment ${activeTab === tab ? 'ops-tab-segment--active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-6 py-5 space-y-5">
        {activeTab === 'Overview' && (
          <>
            {/* Customer info */}
            <div className="rounded-2xl p-4 space-y-3 bg-gradient-to-br from-slate-50 to-slate-50/40 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.07)]">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Customer</h4>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <User size={16} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">{job.customer}</p>
                  {job.customerPhone && (
                    <a href={`tel:${job.customerPhone}`} className="text-[12px] text-indigo-600 flex items-center gap-1 mt-0.5">
                      <Phone size={11} />
                      {job.customerPhone}
                    </a>
                  )}
                </div>
              </div>
              {job.address && (
                <div className="flex items-start gap-2 pt-1">
                  <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-[12.5px] text-gray-600">{job.address}</p>
                </div>
              )}
            </div>

            {/* Scheduling */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3.5 bg-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                <p className="text-[10.5px] text-gray-400 font-medium uppercase tracking-wide mb-1">Scheduled</p>
                <p className="text-[14px] font-semibold text-gray-900 tabular-nums">{job.scheduledAt}</p>
              </div>
              <div className="rounded-xl p-3.5 bg-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                <p className="text-[10.5px] text-gray-400 font-medium uppercase tracking-wide mb-1">SLA Deadline</p>
                <p className="text-[14px] font-semibold text-gray-900 tabular-nums">{job.slaDeadline}</p>
              </div>
              <div className="rounded-xl p-3.5 bg-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                <p className="text-[10.5px] text-gray-400 font-medium uppercase tracking-wide mb-1">ETA</p>
                <p className={`text-[14px] font-semibold tabular-nums ${job.status === 'Delayed' ? 'text-red-600' : 'text-gray-900'}`}>
                  {job.eta}
                </p>
              </div>
              <div className="rounded-xl p-3.5 bg-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                <p className="text-[10.5px] text-gray-400 font-medium uppercase tracking-wide mb-1">Vehicle</p>
                <p className="text-[14px] font-semibold text-gray-900">{job.area}</p>
                {(job.plateLabel || job.plateLocked) && (
                  <p className="text-[11.5px] text-gray-500 mt-1.5 leading-snug">
                    <span className="text-gray-400 font-medium">Plate</span>
                    {job.plateLabel ? (
                      <span className="text-gray-800 font-semibold ml-1">{job.plateLabel}</span>
                    ) : (
                      <span
                        className="text-gray-400 ml-1"
                        title="Plate is stored encrypted with an older server key. Add LEGACY_ENCRYPTION_KEY (32 chars) to backend .env and restart, or re-enter the plate on the order."
                      >
                        unavailable
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Assigned tech */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2.5">Assigned Technician</h4>
              {tech ? (
                <div className="flex items-center gap-3 rounded-xl p-3.5 bg-indigo-50/80 shadow-[0_1px_4px_rgba(79,70,229,0.08)]">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0 ${tech.avatar}`}>
                    {tech.initials}
                  </div>
                  <div className="flex-1">
                    <p className="text-[13.5px] font-semibold text-gray-900">{tech.name}</p>
                    <p className="text-[11.5px] text-gray-500">{tech.specialty} · {tech.area}</p>
                  </div>
                  {tech.phone && (
                    <a href={`tel:${tech.phone}`} className="p-2 rounded-lg bg-white text-indigo-600 hover:bg-indigo-100 transition-colors">
                      <Phone size={13} />
                    </a>
                  )}
                </div>
              ) : (
                <div className="rounded-xl p-4 bg-slate-50/90 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)]">
                  <p className="text-[13px] text-gray-400 mb-3 text-center">No technician assigned yet</p>
                  <div className="flex gap-2">
                    <select
                      value={selectedTech}
                      onChange={e => setSelectedTech(e.target.value)}
                      className="flex-1 ops-input text-[13px]"
                    >
                      <option value="">Select a technician…</option>
                      {technicians.filter(t => t.status !== 'Offline').map(t => (
                        <option key={`so-tech-${t.id}`} value={t.id}>
                          {t.name} ({t.specialty}) — {t.activeJobs}/{t.maxJobs}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssign}
                      disabled={!selectedTech || saving}
                      className="ops-btn-primary flex items-center gap-2"
                    >
                      {saving ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : 'Assign'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick status actions */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2.5">Update Status</h4>
              <div className="flex flex-wrap gap-2">
                {(['En Route', 'Ongoing', 'Completed', 'Delayed'] as JobStatus[]).map(s => (
                  <button
                    key={`qs-${s}`}
                    onClick={() => onStatusChange(job.id, s)}
                    disabled={job.status === s}
                    className={`text-[12px] font-medium px-3 py-2 rounded-xl transition-all duration-150 active:scale-[0.98] ${
                      job.status === s
                        ? 'bg-slate-200/80 text-slate-500 cursor-default'
                        : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'History' && (
          <div className="space-y-1">
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Event Timeline</h4>
            <div className="relative">
              <div className="absolute left-[18px] top-2 bottom-2 w-px bg-gradient-to-b from-slate-200/50 via-slate-200/30 to-transparent" />
              <div className="space-y-4">
                {job.history.map((event, i) => (
                  <div key={`hist-${job.id}-${i}`} className="flex items-start gap-3 relative">
                    <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 z-10 shadow-sm">
                      <History size={13} className="text-gray-400" />
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-[13px] text-gray-800">{event.event}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-400 tabular-nums">{event.timestamp}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-[11px] text-gray-400">{event.actor}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {job.history.length === 0 && (
                  <p className="text-[13px] text-gray-400 text-center py-8">No events recorded</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Notes' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2.5">Job Notes</h4>
            <div className="rounded-xl p-4 bg-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <p className="text-[13.5px] text-gray-700 leading-relaxed">{job.notes || 'No notes yet'}</p>
            </div>
          </div>
        )}
      </div>
    </OpsSlideOver>
  );
}
