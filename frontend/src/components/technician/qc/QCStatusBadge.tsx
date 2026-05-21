import React from 'react';

export type QCStatus =
  | 'pending-review' | 'in-review' | 'approved' | 'needs-fix' | 'resubmitted' | 'ai-flagged' | 'ai-clear';

const statusConfig: Record<QCStatus, { label: string; className: string; dot: string }> = {
  'pending-review': {
    label: 'Pending Review',
    className: 'bg-amber-50/90 text-amber-700 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.22)]',
    dot: 'bg-amber-400',
  },
  'in-review': {
    label: 'In Review',
    className: 'bg-blue-50/90 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]',
    dot: 'bg-blue-400',
  },
  'approved': {
    label: 'Approved',
    className: 'bg-emerald-50/90 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]',
    dot: 'bg-emerald-500',
  },
  'needs-fix': {
    label: 'Needs Fix',
    className: 'bg-rose-50/90 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.2)]',
    dot: 'bg-rose-400',
  },
  'resubmitted': {
    label: 'Re-submitted',
    className: 'bg-violet-50/90 text-violet-700 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]',
    dot: 'bg-violet-400',
  },
  'ai-flagged': {
    label: 'AI Flagged',
    className: 'bg-rose-50/90 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.2)]',
    dot: 'bg-rose-400',
  },
  'ai-clear': {
    label: '0 / Clear',
    className: 'bg-emerald-50/90 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]',
    dot: 'bg-emerald-500',
  },
};

export default function QCStatusBadge({ status }: { status: QCStatus }) {
  const config = statusConfig[status] ?? statusConfig['pending-review'];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
