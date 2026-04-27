import React, { useState, useMemo } from 'react';
import {
  Search, Filter, Download, Eye, Printer, ChevronUp, ChevronDown,
  ChevronsUpDown, Calendar, X, Receipt,
} from 'lucide-react';
import {
  Transaction, TransactionStatus, PaymentMethod,
  formatPeso, getPaymentMethodLabel, getStatusColor,
} from '@/lib/salesData';
import TransactionReceiptModal from './TransactionReceiptModal';
import { useSalesContext } from '@/contexts/SalesAnalyticsContext';

type SortKey = keyof Transaction | '';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS: { key: string; value: TransactionStatus | 'all'; label: string }[] = [
  { key: 'sf-all', value: 'all', label: 'All Status' },
  { key: 'sf-completed', value: 'completed', label: 'Completed' },
  { key: 'sf-pending', value: 'pending', label: 'Pending' },
  { key: 'sf-processing', value: 'processing', label: 'Processing' },
  { key: 'sf-voided', value: 'voided', label: 'Voided' },
];

const PM_OPTIONS: { key: string; value: PaymentMethod | 'all'; label: string }[] = [
  { key: 'pm-all', value: 'all', label: 'All Methods' },
  { key: 'pm-cash', value: 'cash', label: 'Cash' },
  { key: 'pm-card', value: 'card', label: 'Card' },
  { key: 'pm-gcash', value: 'gcash', label: 'GCash' },
  { key: 'pm-maya', value: 'maya', label: 'Maya' },
  { key: 'pm-bank', value: 'bank_transfer', label: 'Bank Transfer' },
];

const PM_BADGE_COLORS: Record<string, string> = {
  cash:          'border border-emerald-300 text-emerald-700 bg-white',
  card:          'border border-indigo-300 text-indigo-700 bg-white',
  gcash:         'border border-teal-300 text-teal-700 bg-white',
  maya:          'border border-violet-300 text-violet-700 bg-white',
  bank_transfer: 'border border-slate-400 text-slate-700 bg-slate-50',
};

// Color-coded avatar per customer (consistent by name hash)
const AVATAR_PALETTE = [
  'bg-blue-700   text-white',
  'bg-violet-600 text-white',
  'bg-emerald-600 text-white',
  'bg-cyan-600   text-white',
  'bg-rose-500   text-white',
  'bg-amber-600  text-white',
  'bg-indigo-600 text-white',
  'bg-teal-600   text-white',
  'bg-fuchsia-600 text-white',
  'bg-orange-600 text-white',
];
const getAvatarColor = (name: string) => {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
};

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];

export default function TransactionsTable() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'all'>('all');
  const [pmFilter, setPmFilter] = useState<PaymentMethod | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('dateTime');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [receiptTxn, setReceiptTxn] = useState<Transaction | null>(null);

  const { transactions: TRANSACTIONS, isLoading } = useSalesContext();

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
    if (pmFilter !== 'all') data = data.filter((t) => t.paymentMethod === pmFilter);
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
      t.total.toFixed(2), t.paymentMethod, t.status,
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
    setSearch(''); setStatusFilter('all'); setPmFilter('all'); setPage(1);
  };

  const hasActiveFilters = search || statusFilter !== 'all' || pmFilter !== 'all';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTxns = TRANSACTIONS.filter((t) => new Date(t.dateTime) >= today);
  const todayTotal = todayTxns.reduce((s, t) => s + t.total, 0);
  const pendingTotal = TRANSACTIONS.filter((t) => t.status === 'pending').reduce((s, t) => s + t.total, 0);

  return (
    <>
      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { key: 'ts-today',    label: "Today's Revenue",  value: formatPeso(todayTotal),   sub: `${todayTxns.length} transactions`,                                                         color: 'text-blue-700',  accent: '#1d4ed8' },
          { key: 'ts-pending',  label: 'Pending Amount',    value: formatPeso(pendingTotal),  sub: `${TRANSACTIONS.filter((t) => t.status === 'pending').length} awaiting payment`,            color: 'text-amber-600', accent: '#d97706' },
          { key: 'ts-total',    label: 'Total Records',     value: String(TRANSACTIONS.length), sub: 'All time',                                                                              color: 'text-slate-900', accent: '#94a3b8' },
          { key: 'ts-filtered', label: 'Filtered Results',  value: String(filtered.length),   sub: 'Current view',                                                                            color: 'text-slate-900', accent: '#94a3b8' },
        ].map((s) => (
          <div
            key={s.key}
            className="card-base stat-card-animate px-4 py-3 relative overflow-hidden"
            style={{ borderLeft: `3px solid ${s.accent}` }}
          >
            <p className="metric-label mb-1">{s.label}</p>
            <p className={`text-xl font-bold font-tabular ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Main Table Card */}
      <div className="card-base overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-4 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid rgba(226,232,240,0.4)' }}>
          {/* Search */}
          <div className="relative flex-1 min-w-52">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID, customer, plate, service…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-base pl-8 py-2 text-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as TransactionStatus | 'all'); setPage(1); }}
              className="input-base py-2 pr-8 text-sm appearance-none cursor-pointer min-w-36"
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
              onChange={(e) => { setPmFilter(e.target.value as PaymentMethod | 'all'); setPage(1); }}
              className="input-base py-2 pr-8 text-sm appearance-none cursor-pointer min-w-40"
            >
              {PM_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Date Range (UI only) */}
          <button className="flex items-center gap-2 btn-secondary py-2">
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
              className="flex items-center gap-2 btn-secondary py-2"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedRows.size > 0 && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-center gap-3 animate-slide-up">
            <span className="text-sm font-semibold text-blue-700">
              {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleBulkExport}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-white border border-blue-300 px-3 py-1.5 rounded-lg transition-colors duration-150"
            >
              <Download size={12} />
              Export Selected
            </button>
            <button
              onClick={() => console.warn('Bulk void requires manager approval.')}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-white border border-red-200 px-3 py-1.5 rounded-lg transition-colors duration-150"
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
          <table className="w-full text-sm">
            <thead>
              <tr className="" style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid rgba(226,232,240,0.5)' }}>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === paginated.length && paginated.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4"
                    style={{ borderRadius: '50%' }}
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
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap ${col.sortKey ? 'cursor-pointer hover:text-slate-900 select-none' : ''}`}
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
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin mx-auto" />
                      <p className="text-sm font-semibold text-slate-700">Loading transactions...</p>
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
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
                paginated.map((txn, rowIdx) => (
                  <tr
                    key={`txn-row-${txn.id}`}
                    className={`txn-row group ${
                      selectedRows.has(txn.id) ? 'bg-blue-50/40' : 'bg-white'
                    }`}
                    style={{ borderBottom: '1px solid rgba(226,232,240,0.18)' }}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(txn.id)}
                        onChange={() => toggleRow(txn.id)}
                        className="w-4 h-4"
                      />
                    </td>

                    {/* Transaction ID */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                        {txn.id}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${getAvatarColor(txn.customerName)}`}>
                          {txn.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{txn.customerName}</p>
                          <p className="text-[10px] text-slate-400">{txn.customerPhone}</p>
                        </div>
                      </div>
                    </td>

                    {/* Vehicle */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-xs font-bold text-slate-900 font-mono">{txn.vehiclePlate}</p>
                      <p className="text-[10px] text-slate-500 max-w-[120px] truncate">{txn.vehicleInfo}</p>
                    </td>

                    {/* Services */}
                    <td className="px-4 py-3.5 max-w-[180px]">
                      <div className="space-y-0.5">
                        {txn.services.slice(0, 2).map((s, si) => (
                          <p key={`svc-cell-${txn.id}-${si}`} className="text-[11px] text-slate-700 truncate">
                            {s.name}
                          </p>
                        ))}
                        {txn.services.length > 2 && (
                          <p className="text-[10px] text-slate-400">+{txn.services.length - 2} more</p>
                        )}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
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
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`pm-badge px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${PM_BADGE_COLORS[txn.paymentMethod]}`}>
                        {getPaymentMethodLabel(txn.paymentMethod)}
                      </span>
                    </td>

                    {/* Status — dot + text, no badge background */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          txn.status === 'completed'  ? 'bg-emerald-500' :
                          txn.status === 'pending'    ? 'bg-amber-500'   :
                          txn.status === 'processing' ? 'bg-blue-500'    : 'bg-slate-400'
                        }`} />
                        <span className={`text-xs font-medium ${
                          txn.status === 'voided' ? 'text-slate-400' : 'text-slate-700'
                        }`}>
                          {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
                        </span>
                      </div>
                    </td>

                    {/* Date & Time */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-xs text-slate-700">
                        {new Date(txn.dateTime).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(txn.dateTime).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>

                    {/* Staff */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-xs text-slate-600">{txn.staffName}</p>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          onClick={() => setReceiptTxn(txn)}
                          className="action-btn p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-700 relative group/btn"
                          title="View Receipt"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => console.info(`Printing receipt for ${txn.id}`)}
                          className="action-btn p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 relative group/btn"
                          title="Print Receipt"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Footer ── */}
        <div
          className="px-5 py-3 flex items-center justify-between gap-4"
          style={{ borderTop: '1px solid rgba(226,232,240,0.4)', minHeight: '52px' }}
        >
          {/* Left: rows-per-page + count */}
          <div className="flex items-center gap-2.5 text-xs text-slate-500 shrink-0">
            <span className="whitespace-nowrap">Rows per page:</span>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              style={{
                width: '64px',
                padding: '4px 6px',
                fontSize: '12px',
                border: '1px solid rgba(203,213,225,0.9)',
                borderRadius: '8px',
                background: '#fff',
                color: '#334155',
                outline: 'none',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                appearance: 'auto',          /* keep native chevron — no conflicts */
              }}
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
              className="px-2 py-1.5 text-xs rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 text-slate-500"
              style={{ border: '1px solid rgba(226,232,240,0.7)' }}
            >«</button>

            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 text-slate-600"
              style={{ border: '1px solid rgba(226,232,240,0.7)' }}
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
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-150 ${
                      page === p
                        ? 'bg-blue-700 text-white font-semibold shadow-sm'
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                    style={page === p ? {} : { border: '1px solid rgba(226,232,240,0.7)' }}
                  >{p}</button>
                )
              )}

            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 text-slate-600"
              style={{ border: '1px solid rgba(226,232,240,0.7)' }}
            >Next ›</button>

            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1.5 text-xs rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 text-slate-500"
              style={{ border: '1px solid rgba(226,232,240,0.7)' }}
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
