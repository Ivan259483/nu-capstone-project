import React, { useState, useMemo } from 'react';
import {
  Search, Filter, Download, Eye, Printer, ChevronUp, ChevronDown,
  ChevronsUpDown, Calendar, X, Receipt,
} from 'lucide-react';
import {
  Transaction, TransactionStatus, PaymentMethod,
  formatPeso, getPaymentMethodLabel, formatTransactionStatusLabel,
} from '@/lib/salesData';
import TransactionReceiptModal from './TransactionReceiptModal';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';
import { getPrimaryKpiDayTransactions } from '@/lib/dashboard-time';
import { printDetailedReceipt, receiptFromTransaction } from '@/lib/receipt-document';
import SalesStatCard from '@/components/sales/ui/SalesStatCard';
import { SALES_ACCENTS, hashToSalesAccent } from '@/components/sales/ui/salesTheme';

type SortKey = keyof Transaction | '';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS: { key: string; value: TransactionStatus | 'all'; label: string }[] = [
  { key: 'sf-all', value: 'all', label: 'All Status' },
  { key: 'sf-completed', value: 'completed', label: 'Completed' },
  { key: 'sf-pending', value: 'pending', label: 'Pending' },
  { key: 'sf-processing', value: 'processing', label: 'Processing' },
  { key: 'sf-voided', value: 'voided', label: 'Voided' },
];

const PM_OPTIONS: { key: string; value: Extract<PaymentMethod, 'cash' | 'gcash'>; label: string }[] = [
  { key: 'pm-cash', value: 'cash', label: 'Cash' },
  { key: 'pm-gcash', value: 'gcash', label: 'GCash' },
];

const PM_BADGE_COLORS: Record<string, string> = {
  cash:          'text-emerald-900 bg-gradient-to-b from-emerald-50/95 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_0_0_1px_rgba(167,243,208,0.75),0_1px_2px_rgba(5,95,70,0.05)]',
  card:          'text-indigo-900 bg-gradient-to-b from-indigo-50/95 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_0_0_1px_rgba(199,210,254,0.8),0_1px_2px_rgba(49,46,129,0.06)]',
  gcash:         'text-teal-900 bg-gradient-to-b from-teal-50/95 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_0_0_1px_rgba(153,246,228,0.75),0_1px_2px_rgba(15,118,110,0.05)]',
  maya:          'text-violet-900 bg-gradient-to-b from-violet-50/95 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_0_0_1px_rgba(221,214,254,0.8),0_1px_2px_rgba(76,29,149,0.05)]',
  bank_transfer: 'text-slate-800 bg-gradient-to-b from-slate-50 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(226,232,240,0.95),0_1px_2px_rgba(15,23,42,0.04)]',
};

const statusKey = (status: TransactionStatus, raw?: string) =>
  String(raw || status || '').trim().toLowerCase().replace(/[-\s]+/g, '_');

const STATUS_BADGES: Record<string, { dot: string; className: string }> = {
  approved: {
    dot: SALES_ACCENTS.green,
    className: 'bg-green-50 text-green-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(187,247,208,0.9),0_1px_2px_rgba(22,163,74,0.06)]',
  },
  confirmed: {
    dot: SALES_ACCENTS.green,
    className: 'bg-green-50 text-green-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(187,247,208,0.9),0_1px_2px_rgba(22,163,74,0.06)]',
  },
  completed: {
    dot: SALES_ACCENTS.green,
    className: 'bg-green-50 text-green-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(187,247,208,0.9),0_1px_2px_rgba(22,163,74,0.06)]',
  },
  paid: {
    dot: SALES_ACCENTS.green,
    className: 'bg-green-50 text-green-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(187,247,208,0.9),0_1px_2px_rgba(22,163,74,0.06)]',
  },
  rejected: {
    dot: SALES_ACCENTS.red,
    className: 'bg-red-50 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(254,202,202,0.9),0_1px_2px_rgba(220,38,38,0.06)]',
  },
  cancelled: {
    dot: SALES_ACCENTS.red,
    className: 'bg-red-50 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(254,202,202,0.9),0_1px_2px_rgba(220,38,38,0.06)]',
  },
  voided: {
    dot: SALES_ACCENTS.red,
    className: 'bg-red-50 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(254,202,202,0.9),0_1px_2px_rgba(220,38,38,0.06)]',
  },
  in_progress: {
    dot: SALES_ACCENTS.orange,
    className: 'bg-orange-50 text-orange-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(254,215,170,0.9),0_1px_2px_rgba(249,115,22,0.07)]',
  },
  processing: {
    dot: SALES_ACCENTS.orange,
    className: 'bg-orange-50 text-orange-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(254,215,170,0.9),0_1px_2px_rgba(249,115,22,0.07)]',
  },
  released: {
    dot: SALES_ACCENTS.blue,
    className: 'bg-blue-50 text-blue-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(191,219,254,0.9),0_1px_2px_rgba(37,99,235,0.07)]',
  },
  pending: {
    dot: SALES_ACCENTS.amber,
    className: 'bg-amber-50 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(253,230,138,0.9),0_1px_2px_rgba(217,119,6,0.07)]',
  },
  pending_confirmation: {
    dot: SALES_ACCENTS.amber,
    className: 'bg-amber-50 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(253,230,138,0.9),0_1px_2px_rgba(217,119,6,0.07)]',
  },
};

const getStatusBadge = (txn: Transaction) => {
  const key = statusKey(txn.status, txn.statusRaw);
  return STATUS_BADGES[key] || {
    dot: SALES_ACCENTS.slate,
    className: 'bg-slate-50 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(226,232,240,0.95),0_1px_2px_rgba(15,23,42,0.04)]',
  };
};

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];

export default function TransactionsTable() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'all'>('all');
  const [pmFilter, setPmFilter] = useState<Extract<PaymentMethod, 'cash' | 'gcash'>>('cash');
  const [sortKey, setSortKey] = useState<SortKey>('dateTime');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [receiptTxn, setReceiptTxn] = useState<Transaction | null>(null);

  const { transactions: TRANSACTIONS, isLoading } = useSalesContext();

  const kpiPrimary = useMemo(() => getPrimaryKpiDayTransactions(TRANSACTIONS), [TRANSACTIONS]);
  const { kpiDayTxns, useLast24hFallback } = kpiPrimary;

  const filtered = useMemo(() => {
    let data = [...TRANSACTIONS];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((t) =>
        t.id.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.vehiclePlate.toLowerCase().includes(q) ||
        t.services.some((s) => s.name.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all') data = data.filter((t) => t.status === statusFilter);
    data = data.filter((t) => t.paymentMethod === pmFilter);
    if (sortKey) {
      data.sort((a, b) => {
        const aVal = a[sortKey as keyof Transaction];
        const bVal = b[sortKey as keyof Transaction];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return 0;
      });
    }
    return data;
  }, [TRANSACTIONS, search, statusFilter, pmFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedRows(next);
  };

  const toggleAll = () => {
    if (selectedRows.size === paginated.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(paginated.map((t) => t.id)));
  };

  const exportTransactionsCSV = (txns: Transaction[]) => {
    const headers = ['Transaction ID', 'Customer', 'Vehicle Plate', 'Services', 'Amount', 'Payment Method', 'Status', 'Date', 'Staff'];
    const rows = txns.map(t => [
      `"${t.id}"`, `"${t.customerName}"`, `"${t.vehiclePlate}"`,
      `"${t.services.map(s => s.name).join('; ')}"`,
      t.total.toFixed(2), t.paymentMethod, formatTransactionStatusLabel(t.status, t.statusRaw),
      new Date(t.dateTime).toLocaleString('en-PH'), `"${t.staffName}"`
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkExport = () => {
    const selected = TRANSACTIONS.filter(t => selectedRows.has(t.id));
    exportTransactionsCSV(selected);
    setSelectedRows(new Set());
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="text-slate-400 ml-1 inline-block" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-700 ml-1 inline-block" />
      : <ChevronDown size={12} className="text-blue-700 ml-1 inline-block" />;
  };

  const clearFilters = () => {
    setSearch(''); setStatusFilter('all'); setPmFilter('cash'); setPage(1);
  };

  const hasActiveFilters = search || statusFilter !== 'all' || pmFilter !== 'cash';

  const todayTotal = kpiDayTxns.reduce((s, t) => s + t.total, 0);
  const pendingTotal = TRANSACTIONS.filter((t) => t.status === 'pending').reduce((s, t) => s + t.total, 0);
  const pendingCount = TRANSACTIONS.filter((t) => t.status === 'pending').length;

  return (
    <>
      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          {
            key: 'ts-today',
            title: 'Revenue 24h',
            value: formatPeso(todayTotal),
            sub: `${kpiDayTxns.length} transaction${kpiDayTxns.length !== 1 ? 's' : ''}${useLast24hFallback ? ' · rolling' : ''}`,
            accent: SALES_ACCENTS.orange,
            icon: <Receipt size={17} className="text-slate-500" />,
          },
          { key: 'ts-pending',  title: 'Pending',       value: formatPeso(pendingTotal),      sub: `${pendingCount} awaiting payment`, accent: SALES_ACCENTS.orange, icon: <Calendar size={17} className="text-slate-500" /> },
          { key: 'ts-total',    title: 'Total Records', value: String(TRANSACTIONS.length),   sub: 'All time',                  accent: SALES_ACCENTS.purple, icon: <Receipt size={17} className="text-slate-500" /> },
          { key: 'ts-filtered', title: 'Filtered',      value: String(filtered.length),        sub: 'Current view',              accent: SALES_ACCENTS.teal, icon: <Filter size={17} className="text-slate-500" /> },
        ].map((s) => (
          <SalesStatCard
            key={s.key}
            title={s.title}
            metric={s.value}
            label={s.sub}
            accent={s.accent}
            icon={s.icon}
            className="stat-card-animate"
          />
        ))}
      </div>

      {/* Main table — large radius + soft rim + depth (smooth bordering) */}
      <div className="rounded-3xl border border-slate-200/45 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.85),0_12px_40px_-12px_rgba(15,23,42,0.1),0_4px_16px_-4px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.03] overflow-hidden isolate">
        {/* Toolbar */}
        <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center gap-3 border-b border-slate-100/90 bg-gradient-to-b from-slate-50/90 via-slate-50/40 to-white">
          {/* Search */}
          <div className="relative flex-1 min-w-52 group">
            <Search
              size={16}
              strokeWidth={2.25}
              className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500"
            />
            <input
              type="text"
              placeholder="Search by ID, customer, plate, service…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-11 w-full rounded-full border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 pl-11 pr-4 text-sm font-medium text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_-10px_rgba(15,23,42,0.1)] outline-none transition-[border-color,box-shadow,color] placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300/95 focus:border-blue-400/90 focus:shadow-[inset_0_1px_0_#fff,0_0_0_3px_rgba(59,130,246,0.16),0_10px_32px_-12px_rgba(37,99,235,0.14)]"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as TransactionStatus | 'all'); setPage(1); }}
              className="input-base py-2 pr-8 text-sm appearance-none cursor-pointer min-w-36 rounded-xl border-slate-200/70 shadow-sm shadow-slate-200/20"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Filter size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Payment Method Filter */}
          <div className="relative">
            <select
              value={pmFilter}
              onChange={(e) => { setPmFilter(e.target.value as Extract<PaymentMethod, 'cash' | 'gcash'>); setPage(1); }}
              className="input-base py-2 pr-8 text-sm appearance-none cursor-pointer min-w-40 rounded-xl border-slate-200/70 shadow-sm shadow-slate-200/20"
            >
              {PM_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Date Range (UI only) */}
          <button className="flex items-center gap-2 btn-secondary py-2 rounded-xl border-slate-200/70 shadow-sm shadow-slate-200/15">
            <Calendar size={14} />
            <span>{new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-500 transition-colors duration-150 px-2 py-2"
            >
              <X size={13} />
              Clear filters
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => exportTransactionsCSV(filtered)}
              className="flex items-center gap-2 btn-secondary py-2 rounded-xl border-slate-200/70 shadow-sm shadow-slate-200/15"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedRows.size > 0 && (
          <div className="px-5 sm:px-6 py-3 bg-gradient-to-r from-blue-50/95 via-blue-50/50 to-slate-50/40 border-b border-blue-100/50 flex items-center gap-3 animate-slide-up">
            <span className="text-sm font-semibold text-blue-700">
              {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleBulkExport}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-white/90 border border-blue-200/60 px-3 py-1.5 rounded-lg shadow-sm shadow-blue-900/[0.04] transition-colors duration-150"
            >
              <Download size={12} />
              Export Selected
            </button>
            <button
              onClick={() => console.warn('Bulk void requires manager approval.')}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-white/90 border border-red-200/60 px-3 py-1.5 rounded-lg shadow-sm transition-colors duration-150"
            >
              <X size={12} />
              Void Selected
            </button>
            <button
              onClick={() => setSelectedRows(new Set())}
              className="ml-auto text-xs text-slate-500 hover:text-slate-700"
            >
              Deselect all
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gradient-to-b from-slate-50/95 to-slate-50/60 border-b border-slate-200/50">
                <th className="pl-5 sm:pl-6 pr-2 py-3.5 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === paginated.length && paginated.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                  />
                </th>
                {[
                  { key: 'col-id', label: 'Transaction ID', sortKey: 'id' as SortKey },
                  { key: 'col-customer', label: 'Customer', sortKey: 'customerName' as SortKey },
                  { key: 'col-vehicle', label: 'Vehicle', sortKey: 'vehiclePlate' as SortKey },
                  { key: 'col-services', label: 'Services', sortKey: '' as SortKey },
                  { key: 'col-amount', label: 'Amount', sortKey: 'total' as SortKey },
                  { key: 'col-pm', label: 'Payment', sortKey: 'paymentMethod' as SortKey },
                  { key: 'col-status', label: 'Status', sortKey: 'status' as SortKey },
                  { key: 'col-datetime', label: 'Date & Time', sortKey: 'dateTime' as SortKey },
                  { key: 'col-staff', label: 'Staff', sortKey: 'staffName' as SortKey },
                  { key: 'col-actions', label: '', sortKey: '' as SortKey },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortKey && handleSort(col.sortKey)}
                    className={`px-3 sm:px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap first:pl-2 last:pr-5 sm:last:pr-6 ${col.sortKey ? 'cursor-pointer hover:text-slate-800 select-none transition-colors' : ''}`}
                  >
                    {col.label}
                    {col.sortKey && <SortIcon col={col.sortKey} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin mx-auto" />
                      <p className="text-sm font-semibold text-slate-700">Loading transactions...</p>
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Receipt size={22} className="text-slate-400" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">No transactions found</p>
                      <p className="text-xs text-slate-500">
                        {hasActiveFilters
                          ? 'Try adjusting your search or filter criteria.'
                          : 'Transactions will appear here once payments are processed in POS.'}
                      </p>
                      {hasActiveFilters && (
                        <button onClick={clearFilters} className="btn-secondary text-xs py-1.5 px-3">
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((txn) => {
                  const statusBadge = getStatusBadge(txn);
                  return (
                  <tr
                    key={`txn-row-${txn.id}`}
                    className={`txn-row group border-b border-slate-100/70 last:border-b-0 transition-colors duration-200 ${
                      selectedRows.has(txn.id)
                        ? 'bg-blue-50/55 ring-1 ring-inset ring-blue-100/50'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="pl-5 sm:pl-6 pr-2 py-3.5 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(txn.id)}
                        onChange={() => toggleRow(txn.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                      />
                    </td>

                    {/* Transaction ID — hairline via shadow (smoother than 1px border on curves) */}
                    <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap align-middle">
                      <span className="inline-flex items-center font-mono text-[11px] font-semibold text-blue-900 tracking-tight antialiased bg-gradient-to-b from-sky-50 to-blue-50/90 px-3 py-1.5 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(37,99,235,0.04),0_0_0_1px_rgba(186,230,253,0.85),0_1px_3px_rgba(30,58,138,0.07)]">
                        {txn.id}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap align-middle">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white ring-2 ring-white shadow-sm"
                          style={{ backgroundColor: hashToSalesAccent(txn.customerName) }}
                        >
                          {txn.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900 leading-tight">{txn.customerName}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{txn.customerPhone}</p>
                        </div>
                      </div>
                    </td>

                    {/* Vehicle */}
                    <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap align-middle">
                      <p className="text-xs font-bold text-slate-900 font-mono tracking-wide">{txn.vehiclePlate}</p>
                      <p className="text-[10px] text-slate-500 max-w-[140px] truncate mt-0.5">{txn.vehicleInfo}</p>
                    </td>

                    {/* Services */}
                    <td className="px-3 sm:px-4 py-3.5 max-w-[200px] align-middle">
                      <div className="flex flex-col gap-1">
                        {txn.services.length === 0 ? (
                          <span className="inline-flex w-fit text-[10px] font-medium text-slate-500 bg-slate-50/95 px-2 py-0.5 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(226,232,240,0.9)]">
                            —
                          </span>
                        ) : (
                          <>
                            {txn.services.slice(0, 3).map((s, si) => (
                              <span
                                key={`svc-cell-${txn.id}-${si}`}
                                className="inline-flex max-w-full truncate rounded-full bg-slate-50/95 text-slate-700 px-2.5 py-1 text-[10px] font-medium leading-snug antialiased shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_0_0_1px_rgba(226,232,240,0.85),0_1px_2px_rgba(15,23,42,0.04)]"
                                title={s.name}
                              >
                                {s.name}
                              </span>
                            ))}
                            {txn.services.length > 3 && (
                              <span className="text-[10px] font-medium text-slate-400 pl-0.5">+{txn.services.length - 3} more</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap align-middle">
                      <p className={`text-sm font-bold font-tabular ${
                        txn.status === 'voided' ? 'text-slate-400 line-through' :
                        txn.status === 'pending' ? 'text-amber-600' : 'text-slate-900'
                      }`}>
                        {formatPeso(txn.total)}
                      </p>
                      {txn.discount > 0 && (
                        <p className="text-[10px] text-emerald-600">−{formatPeso(txn.discount)} disc.</p>
                      )}
                    </td>

                    {/* Payment Method */}
                    <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap align-middle">
                      <span className={`pm-badge px-2.5 py-1 rounded-full text-[11px] font-medium ${PM_BADGE_COLORS[txn.paymentMethod]}`}>
                        {getPaymentMethodLabel(txn.paymentMethod)}
                      </span>
                    </td>

                    {/* Status — soft edge (no hard border stroke) */}
                    <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap align-middle">
                      <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 antialiased ${statusBadge.className}`}>
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0 ring-2 ring-white"
                          style={{ backgroundColor: statusBadge.dot }}
                        />
                        <span className="text-[11px] font-semibold tracking-tight">
                          {formatTransactionStatusLabel(txn.status, txn.statusRaw)}
                        </span>
                      </div>
                    </td>

                    {/* Date & Time */}
                    <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap align-middle">
                      <p className="text-xs text-slate-700">
                        {new Date(txn.dateTime).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(txn.dateTime).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>

                    {/* Staff */}
                    <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap align-middle">
                      <p className="text-xs text-slate-600">{txn.staffName}</p>
                    </td>

                    {/* Actions */}
                    <td className="pl-2 pr-5 sm:pr-6 py-3.5 whitespace-nowrap align-middle">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          type="button"
                          onClick={() => setReceiptTxn(txn)}
                          className="txn-row-icon-btn rounded-full p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-500/[0.09] active:bg-blue-500/[0.14]"
                          title="View Receipt"
                        >
                          <Eye size={14} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => printDetailedReceipt(receiptFromTransaction(txn))}
                          className="txn-row-icon-btn rounded-full p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-500/[0.08] active:bg-slate-500/[0.12]"
                          title="Print Receipt"
                        >
                          <Printer size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Footer ── */}
        <div className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4 border-t border-slate-100/90 bg-gradient-to-b from-slate-50/50 to-slate-50/20 min-h-[52px]">
          {/* Left: rows-per-page + count */}
          <div className="flex items-center gap-2.5 text-xs text-slate-500 shrink-0">
            <span className="whitespace-nowrap">Rows per page:</span>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="w-16 py-1.5 px-2 text-xs rounded-lg border border-slate-200/90 bg-white text-slate-700 outline-none cursor-pointer transition-[border-color,box-shadow] focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"
            >
              {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                <option key={`ipp-${n}`} value={n}>{n}</option>
              ))}
            </select>
            <span className="whitespace-nowrap text-slate-400">
              {filtered.length === 0
                ? '0'
                : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, filtered.length)}`
              }{' '}of {filtered.length} transactions
            </span>
          </div>

          {/* Right: page nav */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1.5 text-xs rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 text-slate-500 shadow-sm"
            >«</button>

            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 text-slate-600 shadow-sm"
            >‹ Prev</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '...') []>((acc, p, idx, arr) => {
                if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                  acc.push('...');
                }
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-xs text-slate-400">…</span>
                ) : (
                  <button
                    key={`page-${p}`}
                    onClick={() => setPage(p as number)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-150 border shadow-sm ${
                      page === p
                        ? 'bg-blue-700 text-white font-semibold border-blue-700'
                        : 'border-slate-200/80 bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >{p}</button>
                )
              )}

            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 text-slate-600 shadow-sm"
            >Next ›</button>

            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1.5 text-xs rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 text-slate-500 shadow-sm"
            >»</button>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptTxn && (
        <TransactionReceiptModal
          txn={receiptTxn}
          onClose={() => setReceiptTxn(null)}
        />
      )}
    </>
  );
}
