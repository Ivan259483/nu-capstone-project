import React, { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users,
  Calendar, Download, BarChart3, PieChart, ArrowUpRight,
  ArrowDownRight, Clock, CreditCard, Wallet, Landmark, Smartphone,
  ChevronDown, Filter,
} from 'lucide-react';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCurrency(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function pctChange(current: number, previous: number): { value: number; isUp: boolean } {
  if (previous === 0) return { value: current > 0 ? 100 : 0, isUp: current > 0 };
  const pct = ((current - previous) / previous) * 100;
  return { value: Math.abs(Math.round(pct)), isUp: pct >= 0 };
}

type DateRange = '7d' | '30d' | '90d' | 'all';

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
function MiniBarChart({ data, color = '#3B82F6' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-32">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-md transition-all duration-500"
            style={{
              height: `${Math.max((d.value / max) * 100, 4)}%`,
              backgroundColor: color,
              opacity: 0.15 + (d.value / max) * 0.85,
              minHeight: '4px',
            }}
          />
          <span className="text-[9px] text-slate-400 whitespace-nowrap">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ data }: { data: { name: string; value: number; pct: number; fill: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let offset = 0;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-slate-100/90 shadow-inner mx-auto mb-2" />
          <p className="text-xs text-slate-400">No data yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-32 h-32 shrink-0">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          const dashArray = `${pct * 2.827} ${282.7 - pct * 2.827}`;
          const dashOffset = -offset * 2.827;
          offset += pct;
          return (
            <circle
              key={i}
              cx="50" cy="50" r="45"
              fill="none"
              stroke={d.fill}
              strokeWidth="10"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              className="transition-all duration-700"
            />
          );
        })}
        <text x="50" y="47" textAnchor="middle" className="fill-slate-900 text-[10px] font-bold">
          {formatCurrency(total)}
        </text>
        <text x="50" y="57" textAnchor="middle" className="fill-slate-400 text-[5px]">Total Revenue</text>
      </svg>
      <div className="space-y-2 flex-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
            <span className="text-xs text-slate-600 flex-1 truncate">{d.name}</span>
            <span className="text-xs font-bold text-slate-800">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Payment Method Icon ───────────────────────────────────────────────────────
const PAYMENT_ICONS: Record<string, typeof CreditCard> = {
  cash: Wallet,
  card: CreditCard,
  gcash: Smartphone,
  maya: Smartphone,
  bank_transfer: Landmark,
};

// ── Main Sales Reports View ───────────────────────────────────────────────────
export default function SalesReportsView() {
  const { transactions, isLoading, kpis, hourlySales, serviceMix, sevenDaySales } = useSalesContext();
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  // Filter transactions by date range
  const rangeFiltered = useMemo(() => {
    const now = new Date();
    let cutoff: Date;
    switch (dateRange) {
      case '7d': cutoff = new Date(now.getTime() - 7 * 86400000); break;
      case '30d': cutoff = new Date(now.getTime() - 30 * 86400000); break;
      case '90d': cutoff = new Date(now.getTime() - 90 * 86400000); break;
      default: cutoff = new Date(0);
    }
    return transactions.filter((t) => new Date(t.analyticsDateTime || t.dateTime) >= cutoff);
  }, [transactions, dateRange]);

  // Previous period for comparison
  const prevFiltered = useMemo(() => {
    const now = new Date();
    let periodMs: number;
    switch (dateRange) {
      case '7d': periodMs = 7 * 86400000; break;
      case '30d': periodMs = 30 * 86400000; break;
      case '90d': periodMs = 90 * 86400000; break;
      default: return [];
    }
    const start = new Date(now.getTime() - 2 * periodMs);
    const end = new Date(now.getTime() - periodMs);
    return transactions.filter((t) => {
      const d = new Date(t.analyticsDateTime || t.dateTime);
      return d >= start && d < end;
    });
  }, [transactions, dateRange]);

  // Revenue KPIs for selected period
  const periodRevenue = rangeFiltered.filter(t => t.status !== 'voided').reduce((s, t) => s + t.total, 0);
  const prevRevenue = prevFiltered.filter(t => t.status !== 'voided').reduce((s, t) => s + t.total, 0);
  const revChange = pctChange(periodRevenue, prevRevenue);
  const periodOrders = rangeFiltered.length;
  const prevOrders = prevFiltered.length;
  const ordersChange = pctChange(periodOrders, prevOrders);
  const periodAvg = periodOrders > 0 ? periodRevenue / periodOrders : 0;
  const prevAvg = prevOrders > 0 ? prevRevenue / prevOrders : 0;
  const avgChange = pctChange(periodAvg, prevAvg);

  // Unique customers
  const uniqueCustomers = new Set(rangeFiltered.map(t => t.customerId)).size;
  const prevUniqueCustomers = new Set(prevFiltered.map(t => t.customerId)).size;
  const custChange = pctChange(uniqueCustomers, prevUniqueCustomers);

  // Payment method breakdown
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    rangeFiltered.filter(t => t.status !== 'voided').forEach(t => {
      const method = t.paymentMethod || 'cash';
      if (!map[method]) map[method] = { count: 0, total: 0 };
      map[method].count += 1;
      map[method].total += t.total;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([method, data]) => ({ method, ...data }));
  }, [rangeFiltered]);

  // Service breakdown
  const serviceBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    rangeFiltered.filter(t => t.status !== 'voided').forEach(t => {
      t.services.forEach(s => {
        const name = s.name || 'Other';
        if (!map[name]) map[name] = { count: 0, revenue: 0 };
        map[name].count += s.qty;
        map[name].revenue += s.price * s.qty;
      });
    });
    return Object.entries(map)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 8);
  }, [rangeFiltered]);

  // Daily revenue for chart
  const dailyRevenue = useMemo(() => {
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 30;
    const result: { label: string; value: number }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const next = new Date(d.getTime() + 86400000);
      const dayRev = rangeFiltered
        .filter(t => t.status !== 'voided')
        .filter(t => {
          const td = new Date(t.dateTime);
          return td >= d && td < next;
        })
        .reduce((sum, t) => sum + t.total, 0);

      // Show every Nth label to avoid crowding
      const step = days <= 7 ? 1 : days <= 30 ? 5 : 10;
      const label = (days - 1 - i) % step === 0 || i === 0
        ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
        : '';
      result.push({ label, value: dayRev });
    }
    return result;
  }, [rangeFiltered, dateRange]);

  // CSV Export
  const handleExport = () => {
    const headers = ['Date', 'Customer', 'Services', 'Payment', 'Status', 'Total'];
    const rows = rangeFiltered.map(t => [
      new Date(t.dateTime).toLocaleDateString('en-PH'),
      t.customerName,
      t.services.map(s => s.name).join('; '),
      t.paymentMethod,
      t.status,
      t.total.toFixed(2),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Revenue analytics & performance insights</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date Range Selector */}
          <div className="flex rounded-xl bg-slate-100/70 p-1 shadow-inner gap-0.5">
            {[
              { key: '7d' as DateRange, label: '7 Days' },
              { key: '30d' as DateRange, label: '30 Days' },
              { key: '90d' as DateRange, label: '90 Days' },
              { key: 'all' as DateRange, label: 'All Time' },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setDateRange(opt.key)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  dateRange === opt.key
                    ? 'bg-white text-blue-700 shadow-[0_1px_3px_rgba(15,23,42,0.1),0_4px_14px_-4px_rgba(15,23,42,0.08)]'
                    : 'text-slate-600 hover:bg-white/60'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-sm font-semibold text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.05),0_10px_28px_-10px_rgba(15,23,42,0.1)] hover:shadow-[0_4px_14px_rgba(15,23,42,0.08),0_14px_36px_-12px_rgba(15,23,42,0.12)] transition-all duration-200"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: formatCurrency(periodRevenue), change: revChange, icon: DollarSign, color: 'bg-blue-50 text-blue-600', cardClass: 'shadow-[0_2px_8px_rgba(59,130,246,0.06),0_12px_32px_-8px_rgba(59,130,246,0.1)]' },
          { label: 'Total Orders', value: periodOrders.toString(), change: ordersChange, icon: ShoppingBag, color: 'bg-emerald-50 text-emerald-600', cardClass: 'shadow-[0_2px_8px_rgba(16,185,129,0.06),0_12px_32px_-8px_rgba(16,185,129,0.1)]' },
          { label: 'Avg. Order Value', value: formatCurrency(periodAvg), change: avgChange, icon: TrendingUp, color: 'bg-violet-50 text-violet-600', cardClass: 'shadow-[0_2px_8px_rgba(139,92,246,0.06),0_12px_32px_-8px_rgba(139,92,246,0.1)]' },
          { label: 'Unique Customers', value: uniqueCustomers.toString(), change: custChange, icon: Users, color: 'bg-amber-50 text-amber-600', cardClass: 'shadow-[0_2px_8px_rgba(245,158,11,0.07),0_12px_32px_-8px_rgba(245,158,11,0.11)]' },
        ].map((kpi) => (
          <div key={kpi.label} className={`bg-white rounded-xl border-0 p-4 ${kpi.cardClass}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</span>
              <div className={`w-8 h-8 rounded-lg ${kpi.color} flex items-center justify-center`}>
                <kpi.icon size={16} />
              </div>
            </div>
            <p className="text-xl font-bold text-slate-900">{isLoading ? '—' : kpi.value}</p>
            {dateRange !== 'all' && (
              <div className={`flex items-center gap-1 mt-1 text-[11px] font-semibold ${kpi.change.isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {kpi.change.isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {kpi.change.value}% vs prev period
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 card-base p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Revenue Trend</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Daily revenue over selected period</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
              <span className="text-[10px] text-slate-500">Revenue</span>
            </div>
          </div>
          {isLoading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : dailyRevenue.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-xs text-slate-400">No data</div>
          ) : (
            <MiniBarChart data={dailyRevenue} color="#3B82F6" />
          )}
        </div>

        {/* Service Mix Donut */}
        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-1">Service Mix</h3>
          <p className="text-[11px] text-slate-400 mb-4">Revenue by service category</p>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <DonutChart data={serviceMix} />
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Breakdown */}
        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-1">Payment Methods</h3>
          <p className="text-[11px] text-slate-400 mb-4">Revenue breakdown by payment method</p>
          {isLoading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : paymentBreakdown.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-xs text-slate-400">No payments recorded</div>
          ) : (
            <div className="space-y-3">
              {paymentBreakdown.map((pm) => {
                const Icon = PAYMENT_ICONS[pm.method] || Wallet;
                const totalPm = paymentBreakdown.reduce((s, p) => s + p.total, 0);
                const pct = totalPm > 0 ? (pm.total / totalPm) * 100 : 0;
                return (
                  <div key={pm.method} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                      <Icon size={15} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700 capitalize">{pm.method.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-bold text-slate-900">{formatCurrency(pm.total)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-slate-400">{pm.count} transaction{pm.count !== 1 ? 's' : ''}</span>
                        <span className="text-[10px] text-slate-400">{Math.round(pct)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Services */}
        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-1">Top Services</h3>
          <p className="text-[11px] text-slate-400 mb-4">Most popular services by revenue</p>
          {isLoading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : serviceBreakdown.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-xs text-slate-400">No services recorded</div>
          ) : (
            <div className="space-y-2.5">
              {serviceBreakdown.map(([name, data], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700 truncate">{name}</span>
                      <span className="text-xs font-bold text-slate-900 ml-2">{formatCurrency(data.revenue)}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{data.count} order{data.count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
