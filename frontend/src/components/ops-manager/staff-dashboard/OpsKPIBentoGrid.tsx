import React from 'react';
import { Briefcase, AlertTriangle, Clock, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import type { OpsJob } from '../ops-types';

interface Props {
  jobs: OpsJob[];
}

export default function OpsKPIBentoGrid({ jobs }: Props) {
  const activeJobs = jobs.filter(j => ['Assigned', 'En Route', 'Ongoing'].includes(j.status)).length;
  const unassigned = jobs.filter(j => j.status === 'Queued' && !j.technicianId).length;
  const delayed = jobs.filter(j => j.status === 'Delayed').length;
  const completed = jobs.filter(j => j.status === 'Completed').length;
  const total = jobs.length;
  const onTimeRate = total > 0 ? Math.round(((total - delayed) / total) * 100) : 0;
  const slaBreached = jobs.filter(j => j.slaStatus === 'Breached').length;
  const atRisk = jobs.filter(j => j.slaStatus === 'At Risk').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Active Jobs */}
      <div className="ops-card p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -translate-y-8 translate-x-8 opacity-60" />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Briefcase size={18} className="text-indigo-600" />
            </div>
            <span className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">
              <TrendingUp size={10} />
              Live
            </span>
          </div>
          <p className="text-[11.5px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Active Jobs</p>
          <p className="text-4xl font-bold text-gray-900 tabular-nums leading-none">{activeJobs}</p>
          <p className="text-[12px] text-gray-400 mt-1.5">{total} total in system today</p>
        </div>
      </div>

      {/* Unassigned */}
      <div className={`ops-card p-5 relative overflow-hidden ${unassigned >= 3 ? '!bg-amber-50 !border-amber-100' : ''}`}>
        {unassigned >= 3 && (
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-100 rounded-full -translate-y-6 translate-x-6 opacity-40" />
        )}
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${unassigned >= 3 ? 'bg-amber-100' : 'bg-gray-100'}`}>
              <AlertTriangle size={18} className={unassigned >= 3 ? 'text-amber-600' : 'text-gray-500'} />
            </div>
            {unassigned >= 3 && (
              <span className="text-[11px] text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">
                Needs Dispatch
              </span>
            )}
          </div>
          <p className="text-[11.5px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Unassigned</p>
          <p className={`text-4xl font-bold tabular-nums leading-none ${unassigned >= 3 ? 'text-amber-700' : 'text-gray-900'}`}>
            {unassigned}
          </p>
          <p className="text-[12px] text-gray-400 mt-1.5">jobs waiting for a tech</p>
        </div>
      </div>

      {/* On-Time Rate */}
      <div className={`ops-card p-5 relative overflow-hidden ${onTimeRate < 80 ? '!bg-red-50 !border-red-100' : ''}`}>
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${onTimeRate < 80 ? 'bg-red-100' : 'bg-green-100'}`}>
              <TrendingUp size={18} className={onTimeRate < 80 ? 'text-red-600' : 'text-green-600'} />
            </div>
            <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${onTimeRate < 80 ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {onTimeRate < 80 ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
              {onTimeRate < 80 ? 'Below target' : 'Above target'}
            </span>
          </div>
          <p className="text-[11.5px] font-semibold uppercase tracking-widest text-gray-400 mb-1">On-Time Rate</p>
          <p className={`text-4xl font-bold tabular-nums leading-none ${onTimeRate < 80 ? 'text-red-600' : 'text-gray-900'}`}>
            {onTimeRate}%
          </p>
          <p className="text-[12px] text-gray-400 mt-1.5">{slaBreached} SLA breached today</p>
        </div>
      </div>

      {/* Completed Today */}
      <div className="ops-card p-5 relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-20 h-20 bg-green-50 rounded-full translate-y-6 translate-x-6 opacity-60" />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={18} className="text-green-600" />
            </div>
            <span className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
              <Clock size={10} />
              Today
            </span>
          </div>
          <p className="text-[11.5px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Completed Today</p>
          <p className="text-4xl font-bold text-gray-900 tabular-nums leading-none">{completed}</p>
          <p className="text-[12px] text-gray-400 mt-1.5">{atRisk} at SLA risk right now</p>
        </div>
      </div>
    </div>
  );
}
