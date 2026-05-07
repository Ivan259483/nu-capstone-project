import React from 'react';
import { TrendingUp, CreditCard, Clock, CheckCircle2, Sparkles, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatPeso } from '@/lib/salesData';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';

const pctChange = (current: number, prev: number) =>
  prev === 0 ? 0 : Math.round(((current - prev) / prev) * 100);

export default function KPIBentoGrid() {
  const { kpis: KPI_DATA } = useSalesContext();
  const roll = KPI_DATA.usingLast24hFallback === true;

  const targetSales = 60000;
  const targetAchievedPct = Math.min(100, Math.round((KPI_DATA.totalSalesToday / targetSales) * 100));
  const topServicePct = KPI_DATA.totalSalesToday > 0 ? Math.round((KPI_DATA.topServiceRevenue / KPI_DATA.totalSalesToday) * 100) : 0;

  const salesChange = pctChange(KPI_DATA.totalSalesToday, KPI_DATA.totalSalesYesterday);
  const txnChange = pctChange(KPI_DATA.transactionCount, KPI_DATA.transactionCountYesterday);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

      {/* Hero: Total Sales Today */}
      <div className="sm:col-span-2 lg:col-span-2 bg-gradient-to-br from-blue-700 to-blue-900 rounded-xl p-6 text-white shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white" />
          <div className="absolute -bottom-12 -left-4 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-white/20">
                <TrendingUp size={18} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-blue-100 uppercase tracking-wide">
                {roll ? 'Sales (last 24 hours)' : 'Total Sales Today'}
              </span>
            </div>
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${salesChange >= 0 ? 'bg-emerald-400/20 text-emerald-200' : 'bg-red-400/20 text-red-200'}`}>
              {salesChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(salesChange)}% {roll ? 'vs prior 24h' : 'vs yesterday'}
            </div>
          </div>
          <div className="text-4xl font-bold text-white mb-1">{formatPeso(KPI_DATA.totalSalesToday)}</div>
          {roll && (
            <p className="text-[11px] text-blue-200/90 mb-1">
              No Manila‑dated orders today — showing rolling 24h activity.
            </p>
          )}
          <p className="text-sm text-blue-200">
            Target: ₱{targetSales.toLocaleString()} — <span className="font-semibold text-white">{targetAchievedPct}% achieved</span>
          </p>
          <div className="mt-4 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${targetAchievedPct}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[11px] text-blue-200">₱0</span>
            <span className="text-[11px] text-blue-200">₱{targetSales.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Transactions Count */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-lg bg-slate-100">
            <CreditCard size={16} className="text-slate-600" />
          </div>
          <div className={`flex items-center gap-1 text-xs font-semibold ${txnChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {txnChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(txnChange)}%
          </div>
        </div>
        <div className="text-3xl font-bold text-slate-900 mb-1">{KPI_DATA.transactionCount}</div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Transactions</p>
        <p className="text-xs text-slate-400 mt-2">
          {roll
            ? `${KPI_DATA.transactionCountYesterday} orders in prior 24h`
            : `${KPI_DATA.transactionCountYesterday} yesterday`}
        </p>
      </div>

      {/* Avg Transaction Value */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-lg bg-purple-50">
            <TrendingUp size={16} className="text-purple-600" />
          </div>
          <span className="text-xs font-medium text-slate-400">per job</span>
        </div>
        <div className="text-3xl font-bold text-slate-900 mb-1">{formatPeso(KPI_DATA.avgTransactionValue)}</div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg. Transaction Value</p>
        <p className="text-xs text-slate-400 mt-2">
          {roll ? 'Based on last 24h window' : "Based on today's transactions"}
        </p>
      </div>

      {/* Pending Payments */}
      <div className="bg-amber-50/50 rounded-xl border border-amber-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-lg bg-amber-100">
            <Clock size={16} className="text-amber-600" />
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            {KPI_DATA.pendingCount} pending
          </span>
        </div>
        <div className="text-3xl font-bold text-amber-700 mb-1">{formatPeso(KPI_DATA.pendingPayments)}</div>
        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Pending Payments</p>
        <p className="text-xs text-amber-600/70 mt-2">Awaiting bank transfer confirmation</p>
      </div>

      {/* Completed Payments */}
      <div className="bg-emerald-50/30 rounded-xl border border-emerald-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-lg bg-emerald-100">
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <span className="text-xs font-semibold text-emerald-700">{KPI_DATA.completedCount} jobs</span>
        </div>
        <div className="text-3xl font-bold text-emerald-700 mb-1">{formatPeso(KPI_DATA.completedPayments)}</div>
        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Completed Payments</p>
        <p className="text-xs text-emerald-600/70 mt-2">All receipts issued</p>
      </div>

      {/* Top Service Today */}
      <div className="sm:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-lg bg-blue-50">
            <Sparkles size={16} className="text-blue-700" />
          </div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Top Service Today</span>
        </div>
        <div className="text-lg font-bold text-slate-900 mb-1 truncate">{KPI_DATA.topServiceToday}</div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-2xl font-bold text-blue-700">{formatPeso(KPI_DATA.topServiceRevenue)}</span>
          <span className="text-xs text-slate-400">revenue from this service today</span>
        </div>
        <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full transition-all duration-700" style={{ width: `${topServicePct}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{topServicePct}% of today's total revenue</p>
      </div>

    </div>
  );
}
