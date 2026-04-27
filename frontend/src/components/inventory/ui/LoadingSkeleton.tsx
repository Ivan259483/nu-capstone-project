import React from 'react';

interface SkeletonProps { className?: string; }
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function KPICardSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <Skeleton className="w-16 h-5 rounded-full" />
      </div>
      <Skeleton className="w-20 h-8 rounded-lg mb-2" />
      <Skeleton className="w-32 h-4 rounded" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 7 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={`skel-col-${i}`} className="px-4 py-3">
          <Skeleton className={`h-4 rounded ${i === 0 ? 'w-32' : i === 1 ? 'w-20' : 'w-16'}`} />
        </td>
      ))}
    </tr>
  );
}
