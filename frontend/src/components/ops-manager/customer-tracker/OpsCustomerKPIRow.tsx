import React from 'react';
import { Users, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import type { OpsJob } from '../ops-types';

interface Props {
  jobs: OpsJob[];
}

export default function OpsCustomerKPIRow({ jobs }: Props) {
  const total = jobs.length;
  const queued = jobs.filter(j => j.status === 'Queued').length;
  const ongoing = jobs.filter(j => ['Assigned', 'En Route', 'Ongoing'].includes(j.status)).length;
  const completed = jobs.filter(j => j.status === 'Completed').length;
  const delayed = jobs.filter(j => j.status === 'Delayed').length;
  const escalated = jobs.filter(j => j.slaStatus === 'Breached' || j.slaStatus === 'At Risk').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Total Tracked */}
      <div className="ops-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Users size={18} className="text-indigo-600" />
          </div>
          <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.05)' }}>Today</span>
        </div>
        <p className="text-[11.5px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Tracked Jobs</p>
        <p className="text-4xl font-bold text-gray-900 tabular-nums leading-none">{total}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[11.5px] text-gray-400"><span className="text-gray-700 font-medium">{queued}</span> queued</span>
          <span className="text-[11.5px] text-gray-400"><span className="text-gray-700 font-medium">{ongoing}</span> in progress</span>
        </div>
      </div>

      {/* Completed */}
      <div className="ops-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
            <CheckCircle2 size={18} className="text-green-600" />
          </div>
          <span className="text-[11px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
            {total > 0 ? Math.round((completed / total) * 100) : 0}% rate
          </span>
        </div>
        <p className="text-[11.5px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Completed</p>
        <p className="text-4xl font-bold text-gray-900 tabular-nums leading-none">{completed}</p>
        <p className="text-[12px] text-gray-400 mt-2">jobs resolved today</p>
      </div>

      {/* Delayed */}
      <div className={`ops-card p-5 ${delayed > 0 ? '!bg-red-50/60' : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${delayed > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
            <Clock size={18} className={delayed > 0 ? 'text-red-600' : 'text-gray-500'} />
          </div>
          {delayed > 0 && (
            <span className="text-[11px] text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-semibold">
              Action needed
            </span>
          )}
        </div>
        <p className="text-[11.5px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Delayed</p>
        <p className={`text-4xl font-bold tabular-nums leading-none ${delayed > 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {delayed}
        </p>
        <p className="text-[12px] text-gray-400 mt-2">past ETA or SLA window</p>
      </div>

      {/* SLA At Risk */}
      <div className={`ops-card p-5 ${escalated >= 2 ? '!bg-amber-50/60' : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${escalated >= 2 ? 'bg-amber-100' : 'bg-gray-100'}`}>
            <AlertTriangle size={18} className={escalated >= 2 ? 'text-amber-600' : 'text-gray-500'} />
          </div>
          {escalated >= 2 && (
            <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
              Escalation risk
            </span>
          )}
        </div>
        <p className="text-[11.5px] font-semibold uppercase tracking-widest text-gray-400 mb-1">SLA At Risk</p>
        <p className={`text-4xl font-bold tabular-nums leading-none ${escalated >= 2 ? 'text-amber-700' : 'text-gray-900'}`}>
          {escalated}
        </p>
        <p className="text-[12px] text-gray-400 mt-2">breached or at-risk SLAs</p>
      </div>
    </div>
  );
}
