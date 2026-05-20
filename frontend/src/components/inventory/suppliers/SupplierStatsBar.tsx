import React from 'react';
import { Truck, Star, Clock, Package } from 'lucide-react';
import type { Supplier } from '@/components/inventory/InventoryContext';

interface SupplierStatsBarProps { suppliers: Supplier[]; }

export default function SupplierStatsBar({ suppliers }: SupplierStatsBarProps) {
  const activeCount = suppliers.filter(s => s.status === 'active').length;
  const avgRating = suppliers.length > 0 ? (suppliers.reduce((a, s) => a + s.rating, 0) / suppliers.length).toFixed(1) : '0.0';
  const avgLeadTime = suppliers.length > 0 ? Math.round(suppliers.reduce((a, s) => a + s.leadTimeDays, 0) / suppliers.length) : 0;
  const totalItems = suppliers.reduce((a, s) => a + s.itemCount, 0);

  const stats = [
    { key: 'stat-active', icon: Truck, iconBg: 'bg-blue-50 border border-blue-100', iconColor: 'text-blue-600', value: activeCount, label: 'Active Suppliers', sub: `of ${suppliers.length} total` },
    { key: 'stat-rating', icon: Star, iconBg: 'bg-amber-50 border border-amber-100', iconColor: 'text-amber-500', value: avgRating, label: 'Avg. Rating', sub: 'across all suppliers' },
    { key: 'stat-lead', icon: Clock, iconBg: 'bg-orange-50 border border-orange-100', iconColor: 'text-orange-600', value: `${avgLeadTime}d`, label: 'Avg. Lead Time', sub: 'days to delivery' },
    { key: 'stat-items', icon: Package, iconBg: 'bg-emerald-50 border border-emerald-100', iconColor: 'text-emerald-600', value: totalItems, label: 'Items Sourced', sub: 'total SKUs linked' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div key={stat.key} className="glass-card glass-card-hover rounded-2xl p-4 card-enter" style={{ animationDelay: `${idx * 60}ms` }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.iconBg}`}><Icon size={18} className={stat.iconColor} /></div>
              <div className="min-w-0">
                <div className="text-xl font-extrabold text-gray-900 font-tabular leading-tight">{stat.value}</div>
                <div className="text-xs font-semibold text-gray-500 truncate">{stat.label}</div>
                <div className="text-[10px] text-gray-400 truncate">{stat.sub}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
