import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';

// Backend integration point: fetch from /api/analytics/hourly?date=today
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { transactions: number } }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border-0 rounded-xl shadow-modal px-4 py-3 text-sm">
      <p className="font-semibold text-slate-900 mb-1">{label}</p>
      <p className="text-blue-700 font-bold font-tabular">₱{payload[0].value.toLocaleString()}</p>
      <p className="text-slate-500 text-xs">{payload[0].payload.transactions} transaction{payload[0].payload.transactions !== 1 ? 's' : ''}</p>
    </div>
  );
};

export default function HourlySalesChart() {
  const { hourlySales: HOURLY_SALES, kpis } = useSalesContext();
  const roll = kpis.usingLast24hFallback === true;
  const maxHour = HOURLY_SALES.reduce((a, b) => (a.revenue > b.revenue ? a : b), HOURLY_SALES[0] || { hour: '—', revenue: 0 });
  const isEmpty = HOURLY_SALES.length === 0 || maxHour.revenue === 0;

  return (
    <div className="card-base p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Hourly Revenue</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {roll ? 'Revenue by hour (Manila) — last 24h activity' : "Today's sales by hour"}
          </p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-700" />
            <span className="text-slate-500">Revenue</span>
            <span className="ml-2 font-semibold text-slate-700">Peak: {maxHour.hour}</span>
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-[220px] text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <span className="text-slate-400 text-lg">📊</span>
          </div>
          <p className="text-sm font-semibold text-slate-600">No sales data yet</p>
          <p className="text-xs text-slate-400 mt-1">Hourly revenue will appear once transactions are recorded</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={HOURLY_SALES} barSize={28} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} tickFormatter={(v) => v === 0 ? '₱0' : `₱${(v / 1000).toFixed(0)}k`} width={44} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9', radius: 4 } as any} />
            <Bar dataKey="revenue" radius={[5, 5, 0, 0]}>
              {HOURLY_SALES.map((entry, i) => (
                <Cell key={`hourly-cell-${i}`} fill={entry.revenue === maxHour.revenue ? '#0F52BA' : entry.revenue === 0 ? '#e2e8f0' : '#93c5fd'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
