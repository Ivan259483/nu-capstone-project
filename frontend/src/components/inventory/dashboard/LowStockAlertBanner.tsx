import React, { useState } from 'react';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import { useInventory } from '../InventoryContext';

interface LowStockAlertBannerProps {
  onNavigateItems?: () => void;
}

export default function LowStockAlertBanner({ onNavigateItems }: LowStockAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { items, loading } = useInventory();

  if (loading) return null;

  const criticalItems = items?.filter(
    (i) => i?.status === 'critical' || i?.status === 'out-of-stock'
  );

  if (dismissed || criticalItems?.length === 0) return null;

  return (
    <div className="slide-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-50 via-orange-50 to-red-50 border border-red-200/60 px-5 py-4 shadow-[0_4px_16px_rgba(239,68,68,0.08)]">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-red-500 pulse-red" />
      <div className="flex items-center gap-4 pl-6">
        <div className="flex items-center gap-2 flex-shrink-0">
          <AlertTriangle size={18} className="text-red-500" />
          <span className="text-sm font-bold text-red-700">{criticalItems?.length} items need immediate attention</span>
        </div>
        <div className="flex-1 flex items-center gap-2 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            {criticalItems?.slice(0, 4)?.map((item) => (
              <span key={`alert-chip-${item?.id}`} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-white/80 border border-red-200 text-red-700 shadow-sm">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item?.status === 'out-of-stock' ? 'bg-gray-400' : 'bg-red-500'}`} />
                {item?.name?.length > 22 ? item?.name?.slice(0, 22) + '…' : item?.name}
                <span className="text-red-400 font-tabular">{item?.quantity} left</span>
              </span>
            ))}
            {criticalItems?.length > 4 && (
              <span className="text-xs text-red-500 font-semibold">+{criticalItems?.length - 4} more</span>
            )}
          </div>
        </div>
        <button onClick={onNavigateItems} className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 bg-white/80 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-white transition-all duration-150 flex-shrink-0">
          View All <ChevronRight size={13} />
        </button>
        <button onClick={() => setDismissed(true)} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100/60 transition-all duration-150 flex-shrink-0" aria-label="Dismiss alert"><X size={16} /></button>
      </div>
    </div>
  );
}
