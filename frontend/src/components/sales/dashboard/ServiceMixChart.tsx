import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';

// Backend integration point: fetch from /api/analytics/service-mix?date=today

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { pct: number } }[] }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-modal px-4 py-3 text-sm">
      <p className="font-semibold text-slate-900">{payload[0].name}</p>
      <p className="text-slate-700 font-bold font-tabular mt-0.5">₱{payload[0].value.toLocaleString()}</p>
      <p className="text-slate-500 text-xs">{payload[0].payload.pct}% of total</p>
    </div>
  );
};

export default function ServiceMixChart() {
  const { serviceMix: SERVICE_MIX } = useSalesContext();
  const isEmpty = SERVICE_MIX.length === 0;

  return (
    <div className="card-base p-6 h-full">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Service Mix</h2>
        <p className="text-xs text-slate-500 mt-0.5">Revenue by category — this week</p>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-[180px] text-center">
          <div className="w-16 h-16 rounded-full border-4 border-dashed border-slate-200 flex items-center justify-center mb-3">
            <span className="text-slate-300 text-2xl">🍩</span>
          </div>
          <p className="text-sm font-semibold text-slate-600">No service data yet</p>
          <p className="text-xs text-slate-400 mt-1">Mix will populate once services are completed</p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={SERVICE_MIX} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value">
                {SERVICE_MIX.map((entry) => (
                  <Cell key={`service-mix-${entry.name}`} fill={entry.fill} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {SERVICE_MIX.map((item) => (
              <div key={`mix-legend-${item.name}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                  <span className="text-xs text-slate-600">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.fill }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 font-tabular w-8 text-right">{item.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
