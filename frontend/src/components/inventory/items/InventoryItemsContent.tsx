import React, { useState, useMemo } from 'react';
import { Plus, Search, Filter, Download, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, Edit2, Eye, CheckSquare, Square, X, SlidersHorizontal } from 'lucide-react';
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
    if (activeCategory !== 'All') result = result.filter((i) => i.category === activeCategory);
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
    CATEGORIES.slice(1).forEach((cat) => { counts[cat] = items.filter((i) => i.category === cat).length; });
    return counts;
  }, [items]);


  const pageStart = filtered.length === 0 ? 0 : (page - 1) * perPage + 1;
  const pageEnd = Math.min(page * perPage, filtered.length);
  const restockCount = items.filter((i) => i.status === 'critical' || i.status === 'out-of-stock').length;

  return (
    <>
      <div className={`inv-items-page space-y-5 w-full min-w-0${embedded ? ' inv-items-page--embedded' : ''}`}>
        <div className="flex w-full items-center gap-4 flex-wrap justify-between">
          <div className={embedded ? 'min-w-0' : undefined}>
            {!embedded ? (
              <>
                <h2 className="text-lg font-bold text-gray-900">{filtered.length} items{activeCategory !== 'All' && <span className="text-gray-400 font-medium"> in {activeCategory}</span>}</h2>
                <p className="text-xs text-gray-400 font-medium mt-0.5">{restockCount} items need restocking</p>
              </>
            ) : (
              <p className="text-sm font-medium text-gray-500">
                <span className="font-semibold text-gray-800">{filtered.length}</span> items
                {restockCount > 0 ? <span className="text-amber-600"> · {restockCount} need restock</span> : null}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 active:scale-95 shadow-sm"><Download size={15} /><span className="hidden sm:inline">Export CSV</span></button>
            <button onClick={() => { setEditingItem(null); setAddEditOpen(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all duration-150 active:scale-95 shadow-md glow-blue"><Plus size={16} />Add Item</button>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button key={`cat-tab-${cat}`} onClick={() => { setActiveCategory(cat); setPage(1); }} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0 ${activeCategory === cat ? 'gradient-primary text-white shadow-md' : 'text-gray-500 bg-white border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'}`}>
              {cat}<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeCategory === cat ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{categoryCounts[cat]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-300 focus-within:shadow-sm transition-all duration-200">
            <Search size={15} className="text-gray-400 flex-shrink-0" />
            <input type="text" placeholder="Search by name, SKU, or supplier..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400" />
            {search && <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>}
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 focus-within:border-blue-300 transition-all duration-200">
            <Filter size={14} className="text-gray-400 flex-shrink-0" />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="text-sm text-gray-600 bg-transparent outline-none font-medium cursor-pointer">
              {STATUS_FILTER_OPTIONS.map((opt) => <option key={`status-opt-${opt.value}`} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 font-medium"><SlidersHorizontal size={13} /><span className="hidden sm:inline">{filtered.length} results</span></div>
        </div>

        <div className="inv-items-table-card w-full rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.035)', boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 16px rgba(0,0,0,0.015)' }}>
          <div className="inv-items-table-scroll w-full overflow-x-auto">
            <table className="inv-items-table w-full table-fixed">
              <colgroup>
                <col style={{ width: 44 }} />
                <col />
                <col style={{ width: '11%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: 108 }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'rgba(248,250,253,0.65)' }}>
                  <th className="w-10 px-4 py-3.5"><button onClick={toggleSelectAll} className="text-gray-300 hover:text-blue-600 transition-colors">{selectedIds.size === paginated.length && paginated.length > 0 ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}</button></th>
                  {([{ key: 'name', label: 'Item Name' }, { key: 'category', label: 'Category' }, { key: 'quantity', label: 'Stock Level' }, { key: 'status', label: 'Status' }, { key: 'costPerUnit', label: 'Unit Cost' }, { key: 'supplierName', label: 'Supplier' }, { key: 'lastRestocked', label: 'Last Restock' }] as Array<{ key: SortField | 'supplierName'; label: string }>).map((col) => (
                    <th key={`th-${col.key}`} className="px-4 py-3.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer group hover:text-gray-600 transition-colors select-none whitespace-nowrap" onClick={() => { if (['name', 'quantity', 'status', 'category', 'costPerUnit', 'lastRestocked'].includes(col.key)) toggleSort(col.key as SortField); }}>
                      <div className="flex items-center gap-1">{col.label}{['name', 'quantity', 'status', 'category', 'costPerUnit', 'lastRestocked'].includes(col.key) && <SortIcon field={col.key as SortField} />}</div>
                    </th>
                  ))}
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
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
                  <tr key={item.id} className={`transition-all duration-200 group ${selectedIds.has(item.id) ? 'bg-blue-50/40' : 'bg-white'} hover:bg-slate-50/60`}>
                    <td className="px-4 py-3.5 w-10"><button onClick={() => toggleSelect(item.id)} className="text-gray-300 hover:text-blue-600 transition-colors">{selectedIds.has(item.id) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}</button></td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="block truncate text-sm font-semibold text-gray-800">{item.name}</span>
                        <span className="text-[11px] text-gray-400 font-mono">{item.sku}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><span className="text-[11px] font-medium text-gray-500 bg-gray-50/80 px-2.5 py-1 rounded-md">{item.category}</span></td>
                    <td className="px-4 py-3.5">
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
                              <span className="text-sm font-bold text-gray-800 font-tabular cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleInlineQtyEdit(item)} title="Click to edit quantity">{item.quantity}<span className="text-xs font-normal text-gray-400 ml-1">{item.unit}</span></span>
                              <span className="text-[10px] text-gray-400 font-tabular">/{item.maxQuantity}</span>
                            </div>
                            <StockProgressBar current={item.quantity} max={item.maxQuantity} minStock={item.minStock} height="h-1.5" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={item.status} size="sm" /></td>
                    <td className="px-4 py-3.5"><span className="text-sm font-semibold text-gray-700 font-tabular">₱{item.costPerUnit.toFixed(2)}</span></td>
                    <td className="px-4 py-3.5"><span className="block truncate text-xs font-medium text-gray-500">{item.supplierName || '—'}</span></td>
                    <td className="px-4 py-3.5"><span className="text-xs text-gray-400 font-medium font-tabular">{new Date(item.lastRestocked).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></td>
                    <td className="px-4 py-3.5">
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
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)', background: 'rgba(248,250,253,0.5)' }}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span>
                  Showing <strong className="text-gray-700 font-tabular">{pageStart}–{pageEnd}</strong> of{' '}
                  <strong className="text-gray-700 font-tabular">{filtered.length}</strong> items
                </span>
                <span className="hidden text-gray-300 sm:inline">·</span>
                <label className="flex items-center gap-1.5">
                  <span>Per page</span>
                  <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none cursor-pointer">
                    {[10, 20, 50].map((n) => <option key={`per-page-${n}`} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-white hover:border hover:border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all">← Prev</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                  <button key={`page-${p}`} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${page === p ? 'gradient-primary text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:border hover:border-gray-200'}`}>{p}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-white hover:border hover:border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Next →</button>
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
