import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useInventory, type ItemCategory } from '../InventoryContext';

const CATEGORY_COLORS: Record<string, string> = {
  'Cleaning Chemicals': '#2563EB',
  'Waxes & Polishes': '#F59E0B',
  'Tools & Equipment': '#10B981',
  'Consumables': '#F97316',
  'Accessories': '#64748B',
  'Pads & Sponges': '#EF4444',
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-xl px-4 py-3 shadow-glass text-sm">
      <p className="font-bold text-gray-800 mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="text-gray-500">{p.name}</span>
          <span className="font-semibold text-gray-800 font-tabular">{p.value} units</span>
        </div>
      ))}
    </div>
  );
}

export default function StockByCategoryChart() {
  const { items, loading } = useInventory();
  const data = React.useMemo(() => {
    // Dynamically get all unique categories that exist in current items
    const dynamicCats = Array.from(new Set(items.map(i => i.category))).filter(Boolean);
    
    return dynamicCats.map(cat => {
      const ci = items.filter(i => i.category === cat);
      return { 
        category: cat, 
        current: ci.reduce((s, i) => s + i.quantity, 0), 
        capacity: ci.reduce((s, i) => s + i.maxQuantity, 0) 
      };
    }).filter(d => d.capacity > 0);
  }, [items]);

  if (loading || !data.length) return <div className="glass-card rounded-2xl p-6 h-full flex items-center justify-center"><p className="text-sm text-gray-400">Loading chart...</p></div>;

  return (
    <div className="glass-card glass-card-hover rounded-2xl p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div><h3 className="text-base font-bold text-gray-900">Stock Levels by Category</h3><p className="text-xs text-gray-400 mt-0.5">Current vs. max capacity</p></div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={4} barCategoryGap="30%">
          <defs>{data.map(e => <linearGradient key={e.category} id={`g-${e.category}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CATEGORY_COLORS[e.category]||'#2563EB'} stopOpacity={0.9}/><stop offset="100%" stopColor={CATEGORY_COLORS[e.category]||'#2563EB'} stopOpacity={0.6}/></linearGradient>)}</defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
          <XAxis dataKey="category" tick={{fontSize:12,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={40}/>
          <Tooltip content={<CustomTooltip/>}/>
          <Bar dataKey="capacity" name="Capacity" radius={[6,6,0,0]}>{data.map(e=><Cell key={e.category} fill="#e8f0fe"/>)}</Bar>
          <Bar dataKey="current" name="Current" radius={[6,6,0,0]}>{data.map(e=><Cell key={e.category} fill={`url(#g-${e.category})`}/>)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
