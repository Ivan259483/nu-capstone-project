import React from 'react';
import { ArrowRight, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { formatPeso } from '@/lib/salesData';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';

// Backend integration point: fetch from /api/transactions?limit=6&sort=desc

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; bg: string }> = {
  completed: {
    icon: <CheckCircle2 size={13} className="text-emerald-500" />,
    bg: 'bg-emerald-50',
  },
  pending: {
    icon: <Clock size={13} className="text-amber-500" />,
    bg: 'bg-amber-50',
  },
  processing: {
    icon: <Clock size={13} className="text-blue-500" />,
    bg: 'bg-blue-50',
  },
  voided: {
    icon: <XCircle size={13} className="text-slate-400" />,
    bg: 'bg-slate-100',
  },
};

const PM_COLORS: Record<string, string> = {
  cash: 'text-emerald-700 bg-emerald-50/90 shadow-sm shadow-emerald-900/5',
  card: 'text-blue-700 bg-blue-50/90 shadow-sm shadow-blue-900/5',
  gcash: 'text-blue-600 bg-blue-50/90 shadow-sm shadow-blue-900/5',
  maya: 'text-green-700 bg-green-50/90 shadow-sm shadow-green-900/5',
  bank_transfer: 'text-slate-600 bg-slate-50/90 shadow-sm shadow-slate-900/5',
};

const PM_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank',
};

interface Props {
  onViewAll?: () => void;
}

export default function RecentTransactionsFeed({ onViewAll }: Props) {
  const { recentTransactions: recent } = useSalesContext();

  return (
    <div className="card-base flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0 bg-slate-50/35">
        <h2 className="text-base font-semibold text-slate-900">Recent Transactions</h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors duration-150"
          >
            View all <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* Rows or empty state */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <span className="text-slate-400 text-xl">🧾</span>
            </div>
            <p className="text-sm font-semibold text-slate-600">No transactions yet</p>
            <p className="text-xs text-slate-400 mt-1">Completed POS transactions will appear here</p>
          </div>
        ) : (
          recent.map((txn) => {
            const status = STATUS_CONFIG[txn.status] ?? STATUS_CONFIG.voided;
            const pmColor = PM_COLORS[txn.paymentMethod] ?? PM_COLORS.cash;
            const amountColor =
              txn.status === 'pending' ? 'text-amber-600' :
                txn.status === 'voided' ? 'text-slate-400' :
                  'text-slate-900';

            return (
              <div
                key={`feed-${txn.id}`}
                className="flex items-center gap-3 px-5 py-3 mx-2 mb-1 rounded-xl hover:bg-slate-50/80 transition-colors duration-150 cursor-default"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${status.bg}`}>
                  {status.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-xs font-semibold text-slate-900 truncate">{txn.customerName}</p>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${pmColor}`}>
                      {PM_LABELS[txn.paymentMethod]}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    {txn.id} · {txn.vehiclePlate}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold font-tabular ${amountColor}`}>{formatPeso(txn.total)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-tabular">
                    {new Date(txn.dateTime).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
