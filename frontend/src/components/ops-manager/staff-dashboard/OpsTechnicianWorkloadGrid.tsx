import React from 'react';
import { Star, MapPin } from 'lucide-react';
import type { OpsTechnician, OpsJob } from '../ops-types';

const statusConfig = {
  Available: { cls: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
  Busy:      { cls: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  Break:     { cls: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-400' },
  Offline:   { cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' },
};

const utilizationColor = (pct: number) => {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-orange-500';
  if (pct >= 40) return 'bg-indigo-500';
  return 'bg-green-500';
};

interface Props {
  technicians: OpsTechnician[];
  jobs: OpsJob[];
  onDrop: (techId: string) => void;
  draggedJobId: string | null;
}

export default function OpsTechnicianWorkloadGrid({ technicians, jobs, onDrop, draggedJobId }: Props) {
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, techId: string) => {
    e.preventDefault();
    onDrop(techId);
  };

  return (
    <div className="ops-card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Technician Workload</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Drag jobs here to assign</p>
        </div>
        <span className="text-[11px] text-gray-400">{technicians.filter(t => t.status !== 'Offline').length} active</span>
      </div>

      <div className="space-y-2.5 overflow-y-auto max-h-[340px] ops-scrollbar-thin pr-1">
        {technicians.map(tech => {
          const scfg = statusConfig[tech.status];
          const isDraggable = draggedJobId !== null && tech.status !== 'Offline' && tech.activeJobs < tech.maxJobs;

          return (
            <div
              key={tech.id}
              onDragOver={isDraggable ? handleDragOver : undefined}
              onDrop={isDraggable ? (e) => handleDrop(e, tech.id) : undefined}
              className={`rounded-xl p-3.5 transition-all duration-200 ${
                isDraggable
                  ? 'bg-indigo-50/50 cursor-copy'
                  : 'bg-gray-50/50'
              } ${tech.status === 'Offline' ? 'opacity-50' : ''}`}
              style={{ boxShadow: isDraggable ? '0 0 0 1.5px rgba(99,102,241,0.35), 0 2px 8px rgba(99,102,241,0.08)' : '0 0 0 1px rgba(0,0,0,0.04)' }}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold ${tech.avatar}`}>
                  {tech.initials}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{tech.name}</p>
                    <span className={`ops-badge text-[10px] ${scfg.cls} flex-shrink-0`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${scfg.dot}`} />
                      {tech.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-400">{tech.specialty}</span>
                    <span className="text-gray-200">·</span>
                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                      <MapPin size={9} />
                      {tech.area}
                    </span>
                  </div>
                  {/* Utilization bar */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400">{tech.activeJobs}/{tech.maxJobs} jobs</span>
                      <span className="text-[10px] font-semibold text-gray-600 tabular-nums">{tech.utilization}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ops-workload-bar ${utilizationColor(tech.utilization)}`}
                        style={{ width: `${tech.utilization}%` }}
                      />
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10.5px] text-gray-400">
                      <span className="text-gray-700 font-medium">{tech.completedToday}</span> done today
                    </span>
                    <span className="flex items-center gap-0.5 text-[10.5px] text-amber-600">
                      <Star size={9} fill="currentColor" />
                      {tech.rating.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
              {/* Drop hint */}
              {isDraggable && (
                <div className="mt-2 rounded-lg py-1.5 text-center text-[10.5px] text-indigo-500 font-medium" style={{ boxShadow: 'inset 0 0 0 1.5px rgba(99,102,241,0.25)', backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(99,102,241,0.08) 4px, rgba(99,102,241,0.08) 8px)' }}>
                  Drop to assign
                </div>
              )}
            </div>
          );
        })}
        {technicians.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-gray-400">No staff members found</p>
          </div>
        )}
      </div>
    </div>
  );
}
