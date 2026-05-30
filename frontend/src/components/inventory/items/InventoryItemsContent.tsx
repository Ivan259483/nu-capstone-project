import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Edit2,
  Eye,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
  Square,
  CheckSquare,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { InventoryItem, ItemCategory, ItemStatus } from '@/components/inventory/InventoryContext';
import { useInventory } from '@/components/inventory/InventoryContext';
import StatusBadge from '@/components/inventory/ui/StatusBadge';
import StockProgressBar from '@/components/inventory/ui/StockProgressBar';
import { TableRowSkeleton } from '@/components/inventory/ui/LoadingSkeleton';
import ConfirmModal from '@/components/inventory/ui/ConfirmModal';
import AddEditItemModal from './AddEditItemModal';
import BulkActionBar from './BulkActionBar';

const CATEGORIES: Array<'All' | ItemCategory> = ['All', 'Chemicals', 'Microfiber', 'Equipment', 'Consumables', 'Packaging'];
type SortField = 'name' | 'quantity' | 'status' | 'category' | 'costPerUnit' | 'lastRestocked';
type SortDir = 'asc' | 'desc';

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'in-stock', label: 'In Stock' },
  { value: 'low-stock', label: 'Low Stock' },
  { value: 'critical', label: 'Critical' },
  { value: 'out-of-stock', label: 'Out of Stock' },
  { value: 'on-order', label: 'On Order' },
];

const CATEGORY_TONE_CLASS: Record<ItemCategory, string> = {
  Chemicals: 'inv-category-badge--chemicals',
  Microfiber: 'inv-category-badge--microfiber',
  Equipment: 'inv-category-badge--equipment',
  Consumables: 'inv-category-badge--consumables',
  Packaging: 'inv-category-badge--packaging',
};

function getCategoryToneClass(category: string) {
  const exact = CATEGORY_TONE_CLASS[category as ItemCategory];
  if (exact) return exact;
  const normalized = category.toLowerCase();
  if (normalized.includes('chemical') || normalized.includes('clean')) return CATEGORY_TONE_CLASS.Chemicals;
  if (normalized.includes('microfiber') || normalized.includes('cloth') || normalized.includes('towel')) return CATEGORY_TONE_CLASS.Microfiber;
  if (normalized.includes('equipment') || normalized.includes('tool')) return CATEGORY_TONE_CLASS.Equipment;
  if (normalized.includes('packag') || normalized.includes('box')) return CATEGORY_TONE_CLASS.Packaging;
  return CATEGORY_TONE_CLASS.Consumables;
}

function itemMatchesCategory(category: string, selected: 'All' | ItemCategory) {
  if (selected === 'All' || category === selected) return true;
  const normalized = category.toLowerCase();
  if (selected === 'Chemicals') return normalized.includes('chemical') || normalized.includes('clean');
  if (selected === 'Microfiber') return normalized.includes('microfiber') || normalized.includes('cloth') || normalized.includes('towel');
  if (selected === 'Equipment') return normalized.includes('equipment') || normalized.includes('tool');
  if (selected === 'Packaging') return normalized.includes('packag') || normalized.includes('box');
  return normalized.includes('consumable') || normalized.includes('wax') || normalized.includes('polish') || normalized.includes('accessor');
}

export default function InventoryItemsContent({ embedded = false }: { embedded?: boolean }) {
  const { items, loading: dataLoading, editItem, removeItem, addItem, refreshItems } = useInventory();
  const [activeCategory, setActiveCategory] = useState<'All' | ItemCategory>('All');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState('');
  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filtered = useMemo(() => {
    let result = items;
    if (activeCategory !== 'All') result = result.filter((i) => itemMatchesCategory(i.category, activeCategory));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || i.supplierName.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') result = result.filter((i) => i.status === statusFilter);
    result = [...result].sort((a, b) => {
      let av: string | number = a[sortField] as string | number;
      let bv: string | number = b[sortField] as string | number;
      if (sortField === 'quantity' || sortField === 'costPerUnit') { av = Number(av); bv = Number(bv); }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [items, activeCategory, search, statusFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  }
  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown size={13} className="text-gray-300 group-hover:text-gray-400" />;
    return sortDir === 'asc' ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;
  }
  function toggleSelect(id: string) { setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function toggleSelectAll() { if (selectedIds.size === paginated.length) setSelectedIds(new Set()); else setSelectedIds(new Set(paginated.map((i) => i.id))); }
  function handleInlineQtyEdit(item: InventoryItem) { setEditingQtyId(item.id); setEditingQtyValue(String(item.quantity)); }
  async function handleInlineQtySave(item: InventoryItem) {
    const newQty = parseInt(editingQtyValue, 10);
    if (isNaN(newQty) || newQty < 0) { toast.error('Invalid quantity value'); setEditingQtyId(null); return; }
    try { await editItem(item.id, { quantity: newQty }); toast.success(`Quantity updated to ${newQty} units`, { icon: '✓' }); } catch (e: any) { toast.error(e.message || 'Failed to update quantity'); }
    setEditingQtyId(null);
  }
  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try { await removeItem(deleteId); toast.success('Item deleted from inventory'); } catch (e: any) { toast.error(e.message || 'Failed to delete item'); }
    setDeleteLoading(false); setDeleteId(null);
  }
  async function handleBulkDeduct() {
    try { for (const id of selectedIds) { const item = items.find((i) => i.id === id); if (item) await editItem(id, { quantity: Math.max(0, item.quantity - 1) }); } await refreshItems(); toast.success(`Deducted 1 unit from ${selectedIds.size} items`); } catch (e: any) { toast.error(e.message || 'Bulk deduct failed'); }
    setSelectedIds(new Set());
  }
  async function handleBulkDelete() {
    try { for (const id of selectedIds) await removeItem(id); toast.success(`${selectedIds.size} items removed from inventory`); } catch (e: any) { toast.error(e.message || 'Bulk delete failed'); }
    setSelectedIds(new Set());
  }
  async function handleSaveItem(item: InventoryItem) {
    try { if (editingItem) { await editItem(item.id, item); toast.success('Item updated successfully'); } else { await addItem(item); toast.success('New item added to inventory'); } } catch (e: any) { toast.error(e.message || 'Failed to save item'); }
    setAddEditOpen(false); setEditingItem(null);
  }

  function handleExportCSV() {
    const headers = ['SKU', 'Name', 'Category', 'Quantity', 'Unit', 'Min Stock', 'Max Stock', 'Unit Cost (PHP)', 'Status', 'Supplier', 'Last Restocked'];
    const rows = filtered.map((i) => [
      i.sku, i.name, i.category, i.quantity, i.unit, i.minStock, i.maxQuantity,
      i.costPerUnit.toFixed(2), i.status, i.supplierName || '',
      new Date(i.lastRestocked).toLocaleDateString('en-US'),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} items to CSV`);
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: items.length };
    CATEGORIES.slice(1).forEach((cat) => { counts[cat] = items.filter((i) => itemMatchesCategory(i.category, cat)).length; });
    return counts;
  }, [items]);

  const totalInventoryValue = useMemo(() => items.reduce((sum, item) => sum + (item.quantity * item.costPerUnit), 0), [items]);
  const formattedInventoryValue = useMemo(
    () => `₱${totalInventoryValue.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`,
    [totalInventoryValue],
  );
  const compactInventoryValue = useMemo(() => {
    const absValue = Math.abs(totalInventoryValue);
    if (absValue >= 1_000_000) return `₱${(totalInventoryValue / 1_000_000).toLocaleString('en-PH', { maximumFractionDigits: 1 })}M`;
    if (absValue >= 100_000) return `₱${(totalInventoryValue / 1_000).toLocaleString('en-PH', { maximumFractionDigits: 1 })}K`;
    return formattedInventoryValue;
  }, [formattedInventoryValue, totalInventoryValue]);
  const latestRestockedLabel = useMemo(() => {
    const latest = items.reduce<number | null>((latestTime, item) => {
      const time = new Date(item.lastRestocked).getTime();
      if (Number.isNaN(time)) return latestTime;
      return latestTime == null || time > latestTime ? time : latestTime;
    }, null);
    return latest == null ? 'No restocks yet' : new Date(latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [items]);


  const pageStart = filtered.length === 0 ? 0 : (page - 1) * perPage + 1;
  const pageEnd = Math.min(page * perPage, filtered.length);
  const attentionCount = items.filter((i) => i.status === 'low-stock' || i.status === 'critical' || i.status === 'out-of-stock').length;
  const categoryTotal = CATEGORIES.slice(1).filter((cat) => (categoryCounts[cat] || 0) > 0).length;
  const inventoryMetrics = [
    {
      label: 'Total Items',
      value: items.length.toLocaleString('en-PH'),
      detail: `${categoryTotal} categor${categoryTotal === 1 ? 'y' : 'ies'}`,
      icon: Boxes,
      tone: 'blue',
    },
    {
      label: 'Stock Value',
      value: compactInventoryValue,
      title: formattedInventoryValue,
      detail: 'Current inventory',
      icon: BadgeDollarSign,
      tone: 'emerald',
      valueKind: 'money',
    },
    {
      label: 'Need Restock',
      value: attentionCount.toLocaleString('en-PH'),
      detail: attentionCount > 0 ? 'Review soon' : 'Healthy levels',
      icon: AlertTriangle,
      tone: attentionCount > 0 ? 'amber' : 'emerald',
    },
    {
      label: 'Last Restock',
      value: latestRestockedLabel,
      detail: 'Latest update',
      icon: CalendarClock,
      tone: 'cyan',
    },
  ];

  return (
    <>
      <div className={`inv-items-page space-y-5 w-full min-w-0${embedded ? ' inv-items-page--embedded' : ''}`}>
        <div className="inv-items-header">
          <div className="inv-items-titleblock">
            <span className="inv-eyebrow">Inventory</span>
            <h2>Stock Control</h2>
            <p>
              <span>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
              {activeCategory !== 'All' ? <span> in {activeCategory}</span> : null}
              {attentionCount > 0 ? <span className="inv-attention-text"> · {attentionCount} need restock</span> : null}
            </p>
          </div>
          <div className="inv-items-actions">
            <button onClick={handleExportCSV} className="inv-btn inv-btn--secondary active:scale-95">
              <Download size={16} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button onClick={() => { setEditingItem(null); setAddEditOpen(true); }} className="inv-btn inv-btn--primary active:scale-95">
              <Plus size={16} />
              Add Item
            </button>
          </div>
        </div>

        <div className="inv-metric-grid">
          {inventoryMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className={`inv-metric-card inv-metric-card--${metric.tone}`}>
                <div className="inv-metric-icon"><Icon size={17} /></div>
                <div className="inv-metric-copy">
                  <span>{metric.label}</span>
                  <strong className={metric.valueKind === 'money' ? 'inv-metric-value--money' : undefined} title={metric.title || metric.value}>{metric.value}</strong>
                  <p>{metric.detail}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="inv-category-tabs">
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat] || 0;
            return (
              <button
                key={`cat-tab-${cat}`}
                onClick={() => { setActiveCategory(cat); setPage(1); }}
                className={`inv-category-tab ${activeCategory === cat ? 'is-active' : ''}`}
              >
                <span>{cat}</span>
                {count > 0 && <span className="inv-category-count">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="inv-compact-summary">
          <span className="tabular-nums text-slate-900">{items.length} item{items.length !== 1 ? 's' : ''}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formattedInventoryValue} total value</span>
          <span aria-hidden="true">·</span>
          <span>Last restocked: {latestRestockedLabel}</span>
        </div>

        <div className="inv-control-bar">
          <div className="inv-search-field">
            <Search size={16} />
            <input type="text" placeholder="Search by name, SKU, or supplier..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            {search && <button onClick={() => setSearch('')} className="inv-clear-search" aria-label="Clear search"><X size={14} /></button>}
          </div>
          <div className="inv-select-field">
            <Filter size={15} />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              {STATUS_FILTER_OPTIONS.map((opt) => <option key={`status-opt-${opt.value}`} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="inv-result-count"><SlidersHorizontal size={14} /><span>{filtered.length} results</span></div>
        </div>

        <div className="inv-items-table-card w-full">
          <div className="inv-items-table-scroll w-full overflow-x-auto">
            <table className="inv-items-table w-full table-fixed">
              <colgroup>
                <col style={{ width: 44 }} />
                <col />
                <col style={{ width: '15%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="w-10 px-4 py-3.5"><button onClick={toggleSelectAll} className={`inv-check-button ${selectedIds.size === paginated.length && paginated.length > 0 ? 'is-checked' : ''}`}>{selectedIds.size === paginated.length && paginated.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}</button></th>
                  {([{ key: 'name', label: 'Item Name' }, { key: 'category', label: 'Category' }, { key: 'quantity', label: 'Stock Level' }, { key: 'status', label: 'Status' }, { key: 'costPerUnit', label: 'Unit Cost' }, { key: 'supplierName', label: 'Supplier' }, { key: 'lastRestocked', label: 'Last Restock' }] as Array<{ key: SortField | 'supplierName'; label: string }>).map((col) => (
                    <th key={`th-${col.key}`} className="inv-table-th group" onClick={() => { if (['name', 'quantity', 'status', 'category', 'costPerUnit', 'lastRestocked'].includes(col.key)) toggleSort(col.key as SortField); }}>
                      <div className="flex items-center gap-1">{col.label}{['name', 'quantity', 'status', 'category', 'costPerUnit', 'lastRestocked'].includes(col.key) && <SortIcon field={col.key as SortField} />}</div>
                    </th>
                  ))}
                  <th className="inv-table-th inv-table-th--right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={`skel-${i}`} cols={9} />) : paginated.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center"><Search size={24} className="text-gray-300" /></div>
                      <p className="text-base font-bold text-gray-500">No items found</p>
                      <p className="text-sm text-gray-400 max-w-xs">Try adjusting your search query or filters.</p>
                      <button onClick={() => { setSearch(''); setStatusFilter('all'); setActiveCategory('All'); }} className="text-sm font-semibold text-blue-600 hover:underline mt-1">Clear all filters</button>
                    </div>
                  </td></tr>
                ) : paginated.map((item) => (
                  <tr key={item.id} className={`inv-table-row group ${selectedIds.has(item.id) ? 'is-selected' : ''}`}>
                    <td className="px-4 py-3.5 w-10"><button onClick={() => toggleSelect(item.id)} className={`inv-check-button ${selectedIds.has(item.id) ? 'is-checked' : ''}`}>{selectedIds.has(item.id) ? <CheckSquare size={16} /> : <Square size={16} />}</button></td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="inv-item-name">{item.name}</span>
                        <span className="inv-item-sku">{item.sku}</span>
                      </div>
                    </td>
                    <td className="inv-table-cell--category px-4 py-4"><span className={`inv-category-badge ${getCategoryToneClass(item.category)}`}>{item.category}</span></td>
                    <td className="px-4 py-4">
                      <div className="flex w-full min-w-0 items-center gap-2">
                        {editingQtyId === item.id ? (
                          <div className="flex items-center gap-1">
                            <input type="number" value={editingQtyValue} onChange={(e) => setEditingQtyValue(e.target.value)} className="w-16 text-sm font-semibold text-gray-800 border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-200 font-tabular" onKeyDown={(e) => { if (e.key === 'Enter') handleInlineQtySave(item); if (e.key === 'Escape') setEditingQtyId(null); }} autoFocus />
                            <button onClick={() => handleInlineQtySave(item)} className="text-xs font-bold text-white bg-blue-500 px-2 py-1 rounded-lg hover:bg-blue-600 transition-colors">✓</button>
                            <button onClick={() => setEditingQtyId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1 py-1">✕</button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 w-full">
                            <div className="flex items-center justify-between">
                              <span className="inv-stock-value" onClick={() => handleInlineQtyEdit(item)} title="Click to edit quantity">{item.quantity}<span>{item.unit}</span></span>
                              <span className="inv-stock-max">/{item.maxQuantity}</span>
                            </div>
                            <StockProgressBar current={item.quantity} max={item.maxQuantity} minStock={item.minStock} height="h-1.5" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4"><StatusBadge status={item.status} size="sm" /></td>
                    <td className="px-4 py-4"><span className="inv-money-value">₱{item.costPerUnit.toFixed(2)}</span></td>
                    <td className="px-4 py-4"><span className="inv-supplier-name">{item.supplierName || '—'}</span></td>
                    <td className="px-4 py-4"><span className="inv-date-value">{new Date(item.lastRestocked).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></td>
                    <td className="px-4 py-4">
                      <div className={`flex items-center justify-end gap-0.5 ${embedded ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'} transition-opacity duration-200`}>
                        <button onClick={() => handleInlineQtyEdit(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150" title="Quick edit quantity"><Edit2 size={14} /></button>
                        <button onClick={() => { setEditingItem(item); setAddEditOpen(true); }} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all duration-150" title="Edit item details"><Eye size={14} /></button>
                        <button onClick={() => setDeleteId(item.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="inv-table-footer">
              <div className="inv-table-footer-info">
                <span>
                  Showing <strong className="text-gray-700 font-tabular">{pageStart}–{pageEnd}</strong> of{' '}
                  <strong className="text-gray-700 font-tabular">{filtered.length}</strong> items
                </span>
                <span className="hidden text-gray-300 sm:inline">·</span>
                <label className="flex items-center gap-1.5">
                  <span>Per page</span>
                  <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="inv-per-page-select">
                    {[10, 20, 50].map((n) => <option key={`per-page-${n}`} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <div className="inv-pagination">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="inv-page-btn">← Prev</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                  <button key={`page-${p}`} onClick={() => setPage(p)} className={`inv-page-number ${page === p ? 'is-active' : ''}`}>{p}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="inv-page-btn">Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <BulkActionBar selectedCount={selectedIds.size} onDeduct={handleBulkDeduct} onRestock={async () => {
        try { for (const id of selectedIds) { const item = items.find((i) => i.id === id); if (item) await editItem(id, { quantity: item.maxQuantity }); } await refreshItems(); toast.success(`Restocked ${selectedIds.size} items to max capacity`); } catch (e: any) { toast.error(e.message || 'Bulk restock failed'); }
        setSelectedIds(new Set());
      }} onDelete={handleBulkDelete} onClear={() => setSelectedIds(new Set())} />
      <AddEditItemModal open={addEditOpen} item={editingItem} onClose={() => { setAddEditOpen(false); setEditingItem(null); }} onSave={handleSaveItem} />
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} loading={deleteLoading} title="Delete inventory item?" description="This will permanently remove the item and all its stock history. This action cannot be undone." confirmLabel="Delete Item" />
    </>
  );
}
