import React from 'react';

export type QCStatus =
  | 'pending-review' | 'in-review' | 'approved' | 'needs-fix' | 'resubmitted' | 'ai-flagged' | 'ai-clear';

const statusConfig: Record<QCStatus, { label: string; className: string; dot: string }> = {
  'pending-review': {
    label: 'Pending Review',
    className: 'bg-amber-50/80 text-amber-700 border border-amber-200/70',
    dot: 'bg-amber-400',
  },
  'in-review': {
    label: 'In Review',
    className: 'bg-blue-50/80 text-blue-700 border border-blue-200/70',
    dot: 'bg-blue-400',
  },
  'approved': {
    label: 'Approved',
    className: 'bg-emerald-50/80 text-emerald-700 border border-emerald-200/70',
    dot: 'bg-emerald-400',
  },
  'needs-fix': {
    label: 'Needs Fix',
    className: 'bg-rose-50/80 text-rose-700 border border-rose-200/70',
    dot: 'bg-rose-400',
  },
  'resubmitted': {
    label: 'Re-submitted',
    className: 'bg-purple-50/80 text-purple-700 border border-purple-200/70',
    dot: 'bg-purple-400',
  },
  'ai-flagged': {
    label: 'AI Flagged',
    className: 'bg-orange-50/80 text-orange-700 border border-orange-200/70',
    dot: 'bg-orange-400',
  },
  'ai-clear': {
    label: 'AI Clear',
    className: 'bg-slate-50/80 text-slate-500 border border-slate-200/70',
    dot: 'bg-slate-300',
  },
};

export default function QCStatusBadge({ status }: { status: QCStatus }) {
  const config = statusConfig[status] ?? statusConfig['pending-review'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium tracking-wide ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
