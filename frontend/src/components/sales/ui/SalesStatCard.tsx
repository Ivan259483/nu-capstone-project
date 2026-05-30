import React, { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Trend = {
  value: string;
  direction: 'up' | 'down';
};

type SalesStatCardProps = {
  metric: string;
  label: string;
  trend?: Trend;
  dark?: boolean;
  icon?: ReactNode;
  title?: string;
  accent?: string;
  className?: string;
  labelClassName?: string;
  metricClassName?: string;
};

export default function SalesStatCard({
  metric,
  label,
  trend,
  dark = false,
  icon,
  title,
  accent,
  className,
  labelClassName,
  metricClassName,
}: SalesStatCardProps) {
  const TrendIcon = trend?.direction === 'down' ? ArrowDownRight : ArrowUpRight;

  return (
    <div
      className={cn(
        'relative min-w-0 overflow-hidden rounded-lg px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_48px_-30px_rgba(15,23,42,0.45)] ring-1 transition-[box-shadow,border-color] duration-200',
        dark
          ? 'bg-gray-900 text-white ring-gray-800 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.9)]'
          : 'bg-white text-slate-950 ring-slate-200/80 hover:shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06),0_18px_44px_-28px_rgba(15,23,42,0.45)]',
        className,
      )}
    >
      {accent ? (
        <div
          className={cn('absolute inset-x-0 top-0 h-1', dark ? 'opacity-80' : 'opacity-100')}
          style={{ backgroundColor: accent }}
        />
      ) : null}

      {(title || icon) && (
        <div className={cn('mb-5 flex items-center gap-2 text-sm font-semibold', dark ? 'text-slate-300' : 'text-slate-500')}>
          {icon ? <span className="shrink-0">{icon}</span> : null}
          {title ? <span className="min-w-0 truncate">{title}</span> : null}
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className={cn('truncate text-2xl font-black tracking-normal tabular-nums', dark ? 'text-white' : 'text-slate-950', metricClassName)}>
          {metric}
        </p>
        {trend ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
              trend.direction === 'up'
                ? dark
                  ? 'bg-emerald-400/10 text-emerald-300'
                  : 'bg-emerald-50 text-emerald-600'
                : dark
                  ? 'bg-red-400/10 text-red-300'
                  : 'bg-red-50 text-red-600',
            )}
          >
            <TrendIcon size={13} />
            {trend.value}
          </span>
        ) : null}
      </div>

      <p className={cn('mt-2 truncate text-xs font-medium', dark ? 'text-slate-400' : 'text-slate-400', labelClassName)}>
        {label}
      </p>
    </div>
  );
}
