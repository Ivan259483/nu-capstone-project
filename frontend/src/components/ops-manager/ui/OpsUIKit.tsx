import React from 'react';

// ═══ Types ═══
export type JobStatus = 'Queued' | 'Assigned' | 'En Route' | 'Ongoing' | 'Completed' | 'Delayed' | 'Cancelled';
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

// ═══ Status Badge ═══
const statusConfig: Record<JobStatus, { cls: string; dot: string; label: string }> = {
  Queued:     { cls: 'bg-gray-100 text-gray-700',     dot: 'bg-gray-400',   label: 'Queued' },
  Assigned:   { cls: 'bg-blue-50 text-blue-700',      dot: 'bg-blue-500',   label: 'Assigned' },
  'En Route': { cls: 'bg-purple-50 text-purple-700',  dot: 'bg-purple-500', label: 'En Route' },
  Ongoing:    { cls: 'bg-indigo-50 text-indigo-700',   dot: 'bg-indigo-500', label: 'Ongoing' },
  Completed:  { cls: 'bg-green-50 text-green-700',    dot: 'bg-green-500',  label: 'Completed' },
  Delayed:    { cls: 'bg-red-50 text-red-700',        dot: 'bg-red-500',    label: 'Delayed' },
  Cancelled:  { cls: 'bg-gray-100 text-gray-400',     dot: 'bg-gray-300',   label: 'Cancelled' },
};

const priorityConfig: Record<Priority, { cls: string }> = {
  Critical: { cls: 'bg-red-50 text-red-700 border border-red-100' },
  High:     { cls: 'bg-orange-50 text-orange-700 border border-orange-100' },
  Medium:   { cls: 'bg-yellow-50 text-yellow-700 border border-yellow-100' },
  Low:      { cls: 'bg-gray-50 text-gray-600 border border-gray-200' },
};

export function OpsStatusBadge({ status }: { status: JobStatus }) {
  const cfg = statusConfig[status] || statusConfig.Queued;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}

export function OpsPriorityBadge({ priority }: { priority: Priority }) {
  const cfg = priorityConfig[priority] || priorityConfig.Medium;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${cfg.cls}`}>
      {priority}
    </span>
  );
}

// ═══ SlideOver ═══
interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: string;
  children: React.ReactNode;
}

export function OpsSlideOver({ open, onClose, title, subtitle, width = 'w-[520px]', children }: SlideOverProps) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="ops-slide-backdrop" onClick={onClose} />
      <div className={`ops-slide-panel ${width}`}>
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-[12px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150 flex-shrink-0 ml-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto ops-scrollbar-thin">
          {children}
        </div>
      </div>
    </>
  );
}
