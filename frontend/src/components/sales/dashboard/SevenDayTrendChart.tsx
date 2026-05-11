import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';

// Backend integration point: fetch from /api/analytics/trend?days=7

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border-0 rounded-xl shadow-modal px-4 py-3 text-sm">
      <p className="font-semibold text-slate-900 mb-1">{label}</p>
      <p className="text-blue-700 font-bold font-tabular">₱{payload[0].value.toLocaleString()}</p>
    </div>
  );
};

export default function SevenDayTrendChart() {
  const { sevenDaySales: SEVEN_DAY_SALES } = useSalesContext();
  const isEmpty = SEVEN_DAY_SALES.length === 0;

  return (
    <div className="card-base p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">7-Day Sales Trend</h2>
          <p className="text-xs text-slate-500 mt-0.5">Revenue over the last 7 days</p>
        </div>
        {!isEmpty && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50/90 px-2.5 py-1 rounded-full shadow-sm shadow-emerald-900/5">
            Live data
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-[200px] text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <span className="text-slate-400 text-lg">📈</span>
          </div>
          <p className="text-sm font-semibold text-slate-600">No trend data yet</p>
          <p className="text-xs text-slate-400 mt-1">Sales trend will appear after transactions are recorded</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={SEVEN_DAY_SALES} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0F52BA" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#0F52BA" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} width={44} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="natural" dataKey="revenue" stroke="#0F52BA" strokeWidth={2.5} fill="url(#salesGradient)" dot={{ r: 4, fill: '#0F52BA', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#0F52BA', strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
