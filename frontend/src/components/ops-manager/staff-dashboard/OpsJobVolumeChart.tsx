import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import type { OpsJob } from '../ops-types';

interface Props {
  jobs: OpsJob[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl px-4 py-3 text-[12px]" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.10)' }}>
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={`tt-${entry.dataKey}`} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
          <span className="text-gray-500 capitalize">{entry.name}:</span>
          <span className="font-semibold text-gray-800 tabular-nums ml-auto pl-4">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function OpsJobVolumeChart({ jobs }: Props) {
  const chartData = useMemo(() => {
    // Group jobs by day (last 7 days)
    const now = new Date();
    const days: { day: string; total: number; completed: number; delayed: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      const dateStr = d.toISOString().split('T')[0];

      const dayJobs = jobs.filter(j => {
        try {
          const jobDate = j._booking?.date || j.createdAt?.split('T')[0];
          return jobDate === dateStr;
        } catch { return false; }
      });

      days.push({
        day: dayLabel,
        total: dayJobs.length,
        completed: dayJobs.filter(j => j.status === 'Completed').length,
        delayed: dayJobs.filter(j => j.status === 'Delayed').length,
      });
    }

    return days;
  }, [jobs]);

  const totalJobs = chartData.reduce((s, d) => s + d.total, 0);

  return (
    <div className="ops-card p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Job Volume — Last 7 Days</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Total dispatched vs completed vs delayed</p>
        </div>
        <span className="text-[11px] text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.05)' }}>
          {totalJobs} total
        </span>
      </div>
      {totalJobs === 0 ? (
        <div className="flex items-center justify-center h-[220px]">
          <p className="text-[13px] text-gray-400">No job data for the last 7 days</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barGap={2} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(79,70,229,0.04)' }} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#9CA3AF', paddingTop: 12 }}
              iconType="circle"
              iconSize={6}
            />
            <Bar dataKey="total" name="Dispatched" fill="#C7D2FE" radius={[4, 4, 0, 0]} />
            <Bar dataKey="completed" name="Completed" fill="#4F46E5" radius={[4, 4, 0, 0]} />
            <Bar dataKey="delayed" name="Delayed" fill="#FCA5A5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
