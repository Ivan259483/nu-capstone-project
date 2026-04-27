import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useInventory } from '../InventoryContext';

const STATUS_CONFIG = [
  { key: 'in-stock', label: 'In Stock', color: '#10b981' },
  { key: 'low-stock', label: 'Low Stock', color: '#f59e0b' },
  { key: 'critical', label: 'Critical', color: '#ef4444' },
  { key: 'out-of-stock', label: 'Out of Stock', color: '#9ca3af' },
  { key: 'on-order', label: 'On Order', color: '#2563EB' },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass-card rounded-xl px-3 py-2 shadow-glass text-sm">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: payload[0].payload.color }} />
        <span className="font-semibold text-gray-800">{payload[0].name}</span>
      </div>
      <p className="text-gray-500 mt-0.5">{payload[0].value} items</p>
    </div>
  );
}

export default function StatusDistributionChart() {
  const { items, loading } = useInventory();
  const counts = STATUS_CONFIG.map((s) => ({ ...s, value: items.filter((i) => i.status === s.key).length })).filter((s) => s.value > 0);
  const total = items.length;

  if (loading || total === 0) {
    return (
      <div className="glass-card glass-card-hover rounded-2xl p-6 h-full flex flex-col items-center justify-center">
        <p className="text-sm text-gray-400">Loading stock data...</p>
      </div>
    );
  }

  return (
    <div className="glass-card glass-card-hover rounded-2xl p-6 h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-base font-bold text-gray-900">Stock Status Distribution</h3>
        <p className="text-xs text-gray-400 font-medium mt-0.5">{total} total SKUs tracked</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={counts} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="label">
              {counts.map((entry) => (<Cell key={`cell-${entry.key}`} fill={entry.color} stroke="white" strokeWidth={2} />))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="relative -mt-2">
          <div className="text-center">
            <div className="text-2xl font-extrabold text-gray-900 font-tabular">{total}</div>
            <div className="text-xs text-gray-400 font-medium">Total Items</div>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {counts.map((entry) => (
          <div key={`legend-${entry.key}`} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              <span className="text-xs font-medium text-gray-600">{entry.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-800 font-tabular">{entry.value}</span>
              <span className="text-xs text-gray-400 font-tabular w-8 text-right">{Math.round((entry.value / total) * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
