import React from 'react';

type StatusType = 'in-stock' | 'low-stock' | 'critical' | 'out-of-stock' | 'on-order';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
}

const statusConfig: Record<StatusType, { label: string; className: string; dot: string }> = {
  'in-stock': { label: 'In Stock', className: 'status-in-stock', dot: 'bg-emerald-500' },
  'low-stock': { label: 'Low Stock', className: 'status-low-stock', dot: 'bg-amber-500' },
  'critical': { label: 'Critical', className: 'status-critical', dot: 'bg-red-500' },
  'out-of-stock': { label: 'Out of Stock', className: 'status-out-of-stock', dot: 'bg-gray-400' },
  'on-order': { label: 'On Order', className: 'status-on-order', dot: 'bg-blue-500' },
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${config.className} ${size === 'sm' ? 'text-[11px] px-2.5 py-1' : 'text-xs px-3 py-1.5'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}
