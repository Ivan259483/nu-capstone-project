import React from 'react';

export type QCStatus =
  | 'pending-review' | 'in-review' | 'approved' | 'needs-fix' | 'resubmitted' | 'ai-flagged' | 'ai-clear';

const statusConfig: Record<QCStatus, { label: string; className: string; dot: string }> = {
  'pending-review': {
    label: 'Pending Review',
    // Amber/Yellow — #F59E0B
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-400',
  },
  'in-review': {
    label: 'In Review',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
    dot: 'bg-blue-400',
  },
  'approved': {
    label: 'Approved',
    // Soft green — #22C55E
    className: 'bg-green-50 text-green-700 border border-green-200',
    dot: 'bg-green-500',
  },
  'needs-fix': {
    label: 'Needs Fix',
    // Soft red — #EF4444
    className: 'bg-red-50 text-red-600 border border-red-200',
    dot: 'bg-red-400',
  },
  'resubmitted': {
    label: 'Re-submitted',
    className: 'bg-purple-50 text-purple-700 border border-purple-200',
    dot: 'bg-purple-400',
  },
  'ai-flagged': {
    label: 'AI Flagged',
    // Soft red — #EF4444
    className: 'bg-red-50 text-red-600 border border-red-200',
    dot: 'bg-red-400',
  },
  'ai-clear': {
    label: '0 / Clear',
    // Soft green — #22C55E
    className: 'bg-green-50 text-green-700 border border-green-200',
    dot: 'bg-green-500',
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
