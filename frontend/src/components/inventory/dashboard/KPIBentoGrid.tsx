import React from 'react';
import {
  Package, AlertTriangle, XCircle, Truck, DollarSign,
  TrendingDown, TrendingUp, Minus, Loader2,
} from 'lucide-react';
import { useInventory } from '../InventoryContext';

interface KPICardProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  sub: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  highlight?: boolean;
  alert?: boolean;
  colSpan?: string;
  delay?: number;
}

function KPICard({
  icon: Icon, iconBg, iconColor, label, value, sub,
  trend, trendValue, highlight, alert, colSpan = '', delay = 0,
}: KPICardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400';
  const trendBg = trend === 'up' ? 'bg-emerald-50' : trend === 'down' ? 'bg-red-50' : 'bg-gray-50';

  return (
    <div
      className={`glass-card glass-card-hover rounded-2xl p-5 relative overflow-hidden
        ${highlight ? 'border-blue-200/80 bg-gradient-to-br from-blue-50/90 to-blue-100/40' : ''}
        ${alert ? 'border-red-200/60 bg-gradient-to-br from-red-50/60 to-orange-50/30' : ''}
        ${colSpan} card-enter`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {highlight && <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-blue-100/40 blur-2xl pointer-events-none" />}
      {alert && <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-red-100/40 blur-2xl pointer-events-none" />}

      <div className="flex items-start justify-between mb-4 relative">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg} shadow-sm`}>
          <Icon size={20} className={iconColor} />
        </div>
        {trendValue && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${trendBg} ${trendColor}`}>
            <TrendIcon size={11} />
            {trendValue}
          </div>
        )}
      </div>

      <div className="relative">
        <div className={`text-3xl font-extrabold font-tabular mb-1 ${highlight ? 'gradient-text' : alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">{label}</div>
        <div className="text-sm text-gray-500 font-medium">{sub}</div>
      </div>
    </div>
  );
}

export default function KPIBentoGrid() {
  const { items, suppliers, loading } = useInventory();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  const totalItems = items.length;
  const lowStock = items.filter((i) => i.status === 'low-stock').length;
  const critical = items.filter((i) => i.status === 'critical').length;
  const outOfStock = items.filter((i) => i.status === 'out-of-stock').length;
  const totalSuppliers = suppliers.filter((s) => s.status === 'active').length;
  const stockValue = items.reduce((acc, i) => acc + i.quantity * i.costPerUnit, 0);
  const alertCount = lowStock + critical + outOfStock;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="sm:col-span-2 lg:col-span-2">
        <KPICard icon={Package} iconBg="bg-gradient-to-br from-blue-600 to-blue-700" iconColor="text-white" label="Total SKUs" value={totalItems} sub={`Across ${new Set(items.map(i => i.category)).size} categories`} trend="up" trendValue={totalItems > 0 ? 'Live data' : 'No items'} highlight delay={0} />
      </div>
      <KPICard icon={AlertTriangle} iconBg="bg-amber-50 border border-amber-100" iconColor="text-amber-500" label="Low Stock" value={lowStock} sub="Below reorder threshold" trend={lowStock > 0 ? 'down' : 'neutral'} trendValue={lowStock > 0 ? 'needs order' : 'all good'} delay={80} />
      <KPICard icon={XCircle} iconBg="bg-red-50 border border-red-100" iconColor="text-red-500" label="Critical / OOS" value={critical + outOfStock} sub={`${critical} critical · ${outOfStock} out`} trend={critical + outOfStock > 0 ? 'down' : 'neutral'} trendValue={critical + outOfStock > 0 ? 'urgent' : 'clear'} alert={critical + outOfStock > 0} delay={120} />
      <KPICard icon={Truck} iconBg="bg-emerald-50 border border-emerald-100" iconColor="text-emerald-600" label="Active Suppliers" value={totalSuppliers} sub={`of ${suppliers.length} total suppliers`} trend="neutral" trendValue="stable" delay={160} />
      <div className="sm:col-span-2 lg:col-span-3">
        <KPICard icon={DollarSign} iconBg="bg-gradient-to-br from-emerald-400 to-teal-500" iconColor="text-white" label="Total Stock Value" value={`₱${stockValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub={`${alertCount} items need restocking action`} trend="up" trendValue="Live calculated" delay={200} />
      </div>
    </div>
  );
}
