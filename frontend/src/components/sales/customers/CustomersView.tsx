import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Mail,
  Phone,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingBag,
  UserRoundCheck,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import SalesStatCard from '@/components/sales/ui/SalesStatCard';
import { SALES_ACCENTS, hashToSalesAccent } from '@/components/sales/ui/salesTheme';
import type { CustomerAnalyticsRow, ReportRange } from '@/types/salesAnalytics';
import {
  buildCustomerActivityQuery,
  buildCustomerDetailEndpoints,
  CUSTOMER_LIFETIME_VALUE_LABEL,
  DEFAULT_CUSTOMER_ACTIVITY_RANGE,
} from '@/lib/salesAnalyticsContracts';

type CustomerSummary = {
  totalCustomers: number;
  activeCustomers: number;
  returningCustomers: number;
  verifiedCustomerSpend: number;
  averageCustomerSpend: number;
  spendingCustomers: number;
};

type BookingRow = {
  id: string;
  bookingId: string;
  services: string[];
  serviceTotal: number;
  appointmentDate: string | null;
  approvedAt: string | null;
  bookingStatus: string;
  amountPaid: number;
  outstandingBalance: number;
  lastVisit: string | null;
};

type LedgerRow = {
  transactionId: string;
  transactionType: string;
  amountSubmitted: number;
  amountVerified: number;
  signedAmount: number;
  method: string;
  paymentStatus: string;
  bookingStatus: string;
  effectiveAt: string | null;
  submittedAt: string | null;
  bookingId: string;
};

const peso = (value: number) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : '—';
const titleCase = (value?: string | null) => String(value || '—').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

function DetailDrawer({ customerKey, onClose }: { customerKey: string; onClose: () => void }) {
  const [overview, setOverview] = useState<CustomerAnalyticsRow | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [tab, setTab] = useState<'overview' | 'bookings' | 'transactions'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const endpoints = buildCustomerDetailEndpoints(customerKey);
    setLoading(true);
    Promise.all([
      api.get(endpoints.overview, { signal: controller.signal }),
      api.get(endpoints.bookings, { params: { page: 1, limit: 50 }, signal: controller.signal }),
      api.get(endpoints.transactions, { params: { page: 1, limit: 50 }, signal: controller.signal }),
    ]).then(([overviewResponse, bookingResponse, transactionResponse]) => {
      setOverview(overviewResponse.data?.data || null);
      setBookings(Array.isArray(bookingResponse.data?.data) ? bookingResponse.data.data : []);
      setTransactions(Array.isArray(transactionResponse.data?.data) ? transactionResponse.data.data : []);
    }).catch((error) => {
      if (error?.code !== 'ERR_CANCELED') console.error('Failed to load customer detail:', error);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [customerKey]);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex justify-end bg-slate-950/25 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside
        className="h-full w-full max-w-2xl overflow-hidden bg-slate-50 shadow-[-24px_0_60px_-30px_rgba(15,23,42,0.5)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-full flex-col">
          <header className="border-b border-slate-200 bg-white px-5 py-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18} /></button>
              <div className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: hashToSalesAccent(overview?.name || customerKey) }}>
                {overview ? initials(overview.name) : '—'}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-slate-900">{overview?.name || 'Customer report'}</h2>
                <p className="truncate text-xs text-slate-500">{overview?.email || overview?.phone || 'Historical service record'}</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1">
              {(['overview', 'bookings', 'transactions'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === item ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {titleCase(item)}
                </button>
              ))}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>
            ) : !overview ? (
              <p className="py-20 text-center text-sm text-slate-500">Customer report is unavailable.</p>
            ) : tab === 'overview' ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ['Verified Spend', peso(overview.totalSpent)],
                    ['Outstanding', peso(overview.outstandingBalance)],
                    ['Confirmed Orders', overview.confirmedOrders],
                    ['Completed Services', overview.completedServices],
                    ['Cancelled Bookings', overview.cancelledBookings],
                    ['Last Visit', dateLabel(overview.lastVisit)],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-2 text-sm font-bold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Overview</h3>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <p className="flex items-center gap-2 text-slate-600"><Mail size={14} className="text-slate-400" />{overview.email || 'No email recorded'}</p>
                    <p className="flex items-center gap-2 text-slate-600"><Phone size={14} className="text-slate-400" />{overview.phone || 'No phone recorded'}</p>
                    <p className="flex items-center gap-2 text-slate-600"><UserRoundCheck size={14} className="text-slate-400" />{titleCase(overview.status)} · {overview.returning ? 'Returning' : 'New / one booking'}</p>
                    <p className="flex items-center gap-2 text-slate-600"><RotateCcw size={14} className="text-slate-400" />{peso(overview.refunds)} refunded</p>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Vehicles and service history</h3>
                    <span className="text-xs text-slate-400">{overview.vehicles.length} vehicle{overview.vehicles.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="space-y-3">
                    {overview.vehicles.map((vehicle, index) => (
                      <div key={vehicle.id || `${vehicle.plate}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Car size={17} /></div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-900">{vehicle.plate || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{[vehicle.year, vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' · ') || 'Vehicle details unavailable'}</p>
                          </div>
                        </div>
                        {vehicle.serviceHistory.length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                            {vehicle.serviceHistory.slice(0, 5).map((history) => (
                              <div key={`${history.bookingId}-${history.date}`} className="flex items-center justify-between gap-3 text-xs">
                                <span className="truncate font-medium text-slate-600">{history.service}</span>
                                <span className="shrink-0 text-slate-400">{dateLabel(history.date)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {!overview.vehicles.length && <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-400">No vehicle record available.</p>}
                  </div>
                </section>
              </div>
            ) : tab === 'bookings' ? (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <div key={booking.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] font-semibold text-blue-700">{booking.bookingId}</p>
                        <p className="mt-1 truncate text-sm font-bold text-slate-900">{booking.services.join(', ') || 'Service'}</p>
                        <p className="mt-1 text-xs text-slate-500">Appointment {booking.appointmentDate || 'not recorded'} · {titleCase(booking.bookingStatus)}</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-slate-900">{peso(booking.serviceTotal)}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                      <div><p className="text-slate-400">Verified paid</p><p className="mt-1 font-bold text-emerald-700">{peso(booking.amountPaid)}</p></div>
                      <div><p className="text-slate-400">Remaining</p><p className="mt-1 font-bold text-amber-700">{peso(booking.outstandingBalance)}</p></div>
                    </div>
                  </div>
                ))}
                {!bookings.length && <p className="py-20 text-center text-sm text-slate-400">No booking history.</p>}
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <div key={transaction.transactionId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[11px] font-semibold text-blue-700">{transaction.transactionId}</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{titleCase(transaction.transactionType)}</p>
                        <p className="mt-1 text-xs text-slate-500">{titleCase(transaction.method)} · {titleCase(transaction.paymentStatus)} · Booking {titleCase(transaction.bookingStatus)}</p>
                      </div>
                      <p className={`text-sm font-bold ${transaction.signedAmount < 0 ? 'text-rose-600' : transaction.signedAmount > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {peso(transaction.signedAmount || transaction.amountSubmitted)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{transaction.bookingId}</span>
                      <span>{dateLabel(transaction.effectiveAt || transaction.submittedAt)}</span>
                    </div>
                  </div>
                ))}
                {!transactions.length && <p className="py-20 text-center text-sm text-slate-400">No ledger transactions.</p>}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

const ranges: Array<{ value: ReportRange; label: string }> = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

export default function CustomersView() {
  const [rows, setRows] = useState<CustomerAnalyticsRow[]>([]);
  const [summary, setSummary] = useState<CustomerSummary>({
    totalCustomers: 0, activeCustomers: 0, returningCustomers: 0,
    verifiedCustomerSpend: 0, averageCustomerSpend: 0, spendingCustomers: 0,
  });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [range, setRange] = useState<ReportRange>(DEFAULT_CUSTOMER_ACTIVITY_RANGE);
  const [customDraft, setCustomDraft] = useState({ from: '', to: '' });
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sort, setSort] = useState('lastVisit');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchDraft.trim()); setPagination((value) => ({ ...value, page: 1 })); }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const params = useMemo(() => buildCustomerActivityQuery({
    range,
    custom,
    search,
    status,
    sort,
    direction,
    page: pagination.page,
    limit: pagination.limit,
  }), [custom, direction, pagination.limit, pagination.page, range, search, sort, status]);
  const ready = range !== 'custom' || Boolean(custom.from && custom.to);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    api.get('/sales-analytics/customers', { params, signal: controller.signal, meta: { suppressCancelLog: true } } as any)
      .then((response) => {
        if (!response.data?.success) return;
        setRows(Array.isArray(response.data.data) ? response.data.data : []);
        setSummary(response.data.summary || summary);
        setPagination((value) => ({ ...value, ...(response.data.pagination || {}) }));
      })
      .catch((error) => { if (error?.code !== 'ERR_CANCELED') console.error('Failed to load customer analytics:', error); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // summary is intentionally excluded; it is response state, not a query input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, ready, refreshToken]);

  useEffect(() => {
    const socket = getSharedSocket();
    const invalidate = (payload?: any) => {
      if (!payload?.collection || ['payments', 'orders', 'users', 'vehicles'].includes(payload.collection)) setRefreshToken((value) => value + 1);
    };
    socket.on('db_change', invalidate);
    socket.on('ledger:changed', invalidate);
    return () => { socket.off('db_change', invalidate); socket.off('ledger:changed', invalidate); };
  }, []);

  const applySort = (field: string) => {
    if (sort === field) setDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setDirection(field === 'name' ? 'asc' : 'desc'); }
    setPagination((value) => ({ ...value, page: 1 }));
  };

  return (
    <div className="page-enter space-y-6 pb-8 text-slate-900">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Customers</h1>
        <p className="mt-1 text-sm text-slate-500">Lifetime customer value with a separate business-activity window.</p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Total Customers', String(summary.totalCustomers), 'Accounts and historical records', Users, SALES_ACCENTS.blue],
          ['Active Customers', String(summary.activeCustomers), `${range === 'all' ? 'All-time' : range.toUpperCase()} activity definition`, UserRoundCheck, SALES_ACCENTS.green],
          ['Returning', String(summary.returningCustomers), 'More than one confirmed order', ShoppingBag, SALES_ACCENTS.purple],
          ['Verified Spend', peso(summary.verifiedCustomerSpend), CUSTOMER_LIFETIME_VALUE_LABEL, WalletCards, SALES_ACCENTS.orange],
          ['Average Spend', peso(summary.averageCustomerSpend), `${summary.spendingCustomers} paying customers`, ReceiptText, SALES_ACCENTS.teal],
        ].map(([title, metric, label, Icon, accent]) => (
          <SalesStatCard key={String(title)} title={String(title)} metric={loading ? '—' : String(metric)} label={String(label)} icon={React.createElement(Icon as typeof Users, { size: 17 })} accent={String(accent)} />
        ))}
      </section>

      <div className="rounded-3xl border border-slate-200/70 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-64 flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search customer, contact, vehicle…" className="input-base w-full rounded-xl py-2.5 pl-10" />
          </div>
          <select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPagination((value) => ({ ...value, page: 1 })); }} className="input-base rounded-xl py-2.5 text-sm">
            <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {ranges.map((option) => (
              <button key={option.value} type="button" onClick={() => { setRange(option.value); setPagination((value) => ({ ...value, page: 1 })); }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${range === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {option.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input aria-label="Customer activity from date" type="date" value={customDraft.from} onChange={(event) => setCustomDraft((value) => ({ ...value, from: event.target.value }))} className="input-base rounded-xl py-2 text-xs" />
              <input aria-label="Customer activity to date" type="date" value={customDraft.to} onChange={(event) => setCustomDraft((value) => ({ ...value, to: event.target.value }))} className="input-base rounded-xl py-2 text-xs" />
              <button type="button" disabled={!customDraft.from || !customDraft.to} onClick={() => setCustom(customDraft)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Apply</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                {[
                  ['Customer', 'name'], ['Contact', ''], ['Vehicles', ''], ['Confirmed Orders', 'confirmedOrders'],
                  ['Total Spent', 'totalSpent'], ['Outstanding Balance', 'outstandingBalance'], ['Last Visit', 'lastVisit'], ['Status', 'status'], ['View Details', ''],
                ].map(([label, field]) => (
                  <th key={label} className="px-4 py-3.5 first:pl-5 last:pr-5">
                    <button type="button" disabled={!field} onClick={() => field && applySort(field)} className="inline-flex items-center gap-1 disabled:cursor-default">
                      {label}{field && <ChevronsUpDown size={12} />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-20 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="py-20 text-center text-sm text-slate-400">No customers match these filters.</td></tr>
              ) : rows.map((customer) => (
                <tr key={customer.customerKey} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="py-3.5 pl-5 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: hashToSalesAccent(customer.name) }}>{initials(customer.name)}</div>
                      <div className="min-w-0"><p className="max-w-48 truncate font-semibold text-slate-900">{customer.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{customer.recordType === 'account' ? 'Customer account' : 'Historical record'}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><p className="max-w-48 truncate text-xs text-slate-700">{customer.email || '—'}</p><p className="mt-1 text-[11px] text-slate-400">{customer.phone || 'No phone'}</p></td>
                  <td className="px-4 py-3.5"><p className="font-semibold text-slate-800">{customer.vehicles.length}</p><p className="mt-1 max-w-36 truncate text-[11px] text-slate-400">{customer.vehicles.map((vehicle) => vehicle.plate || vehicle.model).filter(Boolean).join(', ') || 'No vehicle'}</p></td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums text-slate-800">{customer.confirmedOrders}</td>
                  <td className="px-4 py-3.5 font-bold tabular-nums text-emerald-700">{peso(customer.totalSpent)}</td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums text-amber-700">{peso(customer.outstandingBalance)}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-600">{dateLabel(customer.lastVisit)}</td>
                  <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${customer.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{titleCase(customer.status)}</span></td>
                  <td className="pl-4 pr-5 py-3.5"><button type="button" onClick={() => setSelectedCustomerKey(customer.customerKey)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Open <ChevronRight size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 text-xs text-slate-500">
          <span>{pagination.total.toLocaleString('en-PH')} customer records · Lifetime values, {range === 'all' ? 'all-time' : range.toUpperCase()} activity</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={pagination.page <= 1} onClick={() => setPagination((value) => ({ ...value, page: value.page - 1 }))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span>Page {pagination.page} of {pagination.pages}</span>
            <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPagination((value) => ({ ...value, page: value.page + 1 }))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {selectedCustomerKey && <DetailDrawer customerKey={selectedCustomerKey} onClose={() => setSelectedCustomerKey(null)} />}
    </div>
  );
}
