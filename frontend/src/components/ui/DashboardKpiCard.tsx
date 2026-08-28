import React, { useId } from 'react';
import { Activity, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export type DashboardKpiComparison = {
  direction: 'up' | 'down' | 'neutral';
  tone: 'positive' | 'negative' | 'neutral';
  label: string;
};

type DashboardKpiCardProps = {
  title: string;
  value: string;
  valueTitle?: string;
  icon: LucideIcon;
  accentColor: string;
  comparison?: DashboardKpiComparison;
  subtitle: string;
  sparklineData?: number[];
  className?: string;
};

const comparisonToneClasses: Record<DashboardKpiComparison['tone'], string> = {
  positive: 'text-emerald-600',
  negative: 'text-red-600',
  neutral: 'text-slate-500',
};

export default function DashboardKpiCard({
  title,
  value,
  valueTitle,
  icon: Icon,
  accentColor,
  comparison,
  subtitle,
  sparklineData,
  className = '',
}: DashboardKpiCardProps) {
  const gradientId = `dashboard-kpi-${useId().replace(/:/g, '')}`;
  const TrendIcon = comparison?.direction === 'up'
    ? TrendingUp
    : comparison?.direction === 'down'
      ? TrendingDown
      : Activity;
  const chartData = sparklineData?.map((metric) => ({ metric })) ?? [];
  const showSparkline = chartData.length > 1;

  return (
    <article
      className={`relative flex min-h-[164px] min-w-0 flex-col overflow-hidden rounded-[18px] border border-slate-200/70 bg-white px-4 pb-[13px] pt-4 shadow-[0_1px_2px_rgba(15,23,42,0.035),0_10px_28px_-22px_rgba(15,23,42,0.32)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-slate-300/80 hover:shadow-[0_2px_4px_rgba(15,23,42,0.04),0_14px_32px_-22px_rgba(15,23,42,0.34)] ${className}`}
    >
      <span
        className="pointer-events-none absolute inset-x-3 top-0 h-[2px] rounded-b-full"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-12 -right-[34px] h-[125px] w-[125px] rounded-full"
        style={{ backgroundColor: `color-mix(in srgb, ${accentColor} 8%, transparent)` }}
        aria-hidden
      />

      <div className="relative z-[2] mb-[11px] flex min-w-0 items-center gap-[7px]">
        <span
          className="inline-flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[9px]"
          style={{
            backgroundColor: `color-mix(in srgb, ${accentColor} 11%, white)`,
            color: accentColor,
          }}
        >
          <Icon size={16} aria-hidden />
        </span>
        <p className="min-w-0 truncate text-[11px] font-bold leading-[1.2] text-slate-500">
          {title}
        </p>
      </div>

      <div
        className={`grid min-w-0 flex-1 items-end gap-2.5 ${
          showSparkline
            ? 'grid-cols-[minmax(0,1fr)_minmax(64px,0.65fr)]'
            : 'grid-cols-1'
        }`}
      >
        <div className="relative z-[2] min-w-0">
          <strong
            className="block truncate text-[clamp(23px,2vw,30px)] font-extrabold leading-[1.05] tracking-[-0.035em] text-slate-950 tabular-nums"
            title={valueTitle}
          >
            {value}
          </strong>
          {comparison ? (
            <span
              className={`mt-2 inline-flex min-h-[17px] items-center gap-1 text-[10px] font-bold leading-[1.1] ${comparisonToneClasses[comparison.tone]}`}
            >
              <TrendIcon size={12} aria-hidden />
              {comparison.label}
            </span>
          ) : null}
          <p className="mt-[7px] truncate text-[10px] font-semibold leading-[1.3] text-slate-400">
            {subtitle}
          </p>
        </div>

        {showSparkline ? (
          <div className="relative z-[1] mb-0.5 min-w-0 self-end opacity-95" aria-hidden>
            <ResponsiveContainer width="100%" height={48}>
              <AreaChart data={chartData} margin={{ top: 5, right: 1, left: 1, bottom: 1 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="metric"
                  stroke={accentColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <div aria-hidden />}
      </div>
    </article>
  );
}
