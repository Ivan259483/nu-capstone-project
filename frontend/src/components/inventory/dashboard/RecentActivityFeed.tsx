import React from 'react';
import { PackageMinus, PackagePlus, Mic, RefreshCw } from 'lucide-react';
import { useInventory } from '../InventoryContext';

const typeConfig: Record<string, { icon: React.ElementType; iconBg: string; iconColor: string; label: string; labelColor: string }> = {
  deduct: { icon: PackageMinus, iconBg: 'bg-red-50 border border-red-100', iconColor: 'text-red-500', label: 'Deducted', labelColor: 'text-red-600' },
  restock: { icon: PackagePlus, iconBg: 'bg-emerald-50 border border-emerald-100', iconColor: 'text-emerald-600', label: 'Restocked', labelColor: 'text-emerald-600' },
  adjust: { icon: RefreshCw, iconBg: 'bg-blue-50 border border-blue-100', iconColor: 'text-blue-500', label: 'Adjusted', labelColor: 'text-blue-600' },
  'voice-log': { icon: Mic, iconBg: 'bg-orange-50 border border-orange-100', iconColor: 'text-orange-500', label: 'Voice Log', labelColor: 'text-orange-600' },
};

function formatRelativeTime(timestamp: string) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function RecentActivityFeed() {
  const { activities, loading } = useInventory();

  return (
    <div className="glass-card glass-card-hover rounded-2xl p-6 flex flex-col" style={{ maxHeight: 380, height: '100%' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-gray-900">Recent Activity</h3>
          <p className="text-xs text-gray-400 font-medium mt-0.5">Stock changes & logs</p>
        </div>
        <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">View all →</button>
      </div>
      <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-1">
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-8">Loading activity...</p>
        ) : activities.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">No recent activity recorded yet.</p>
        ) : (
          activities.slice(0, 6).map((activity, idx) => {
            const config = typeConfig[activity.type] || typeConfig.adjust;
            const Icon = config.icon;
            return (
              <div key={activity.id || idx} className="flex items-start gap-3 p-3 rounded-xl hover:bg-blue-50/40 transition-all duration-150 group" style={{ animationDelay: `${idx * 40}ms` }}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.iconBg}`}><Icon size={14} className={config.iconColor} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{activity.itemName.length > 24 ? activity.itemName.slice(0, 24) + '…' : activity.itemName}</p>
                    <span className="text-[10px] text-gray-400 font-medium flex-shrink-0 font-tabular">{formatRelativeTime(activity.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-bold ${config.labelColor}`}>{config.label}</span>
                    <span className="text-[10px] text-gray-400">·</span>
                    <span className="text-[10px] text-gray-500 font-tabular">{activity.type === 'deduct' ? `-${activity.quantity}` : `+${activity.quantity}`} units</span>
                    <span className="text-[10px] text-gray-400">·</span>
                    <span className="text-[10px] text-gray-400 truncate">{activity.performedBy.split(' ')[0]}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate">{activity.note}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
