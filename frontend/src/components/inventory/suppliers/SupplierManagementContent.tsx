import React, { useState, useMemo } from 'react';
import { Plus, Search, X, Grid3X3, List } from 'lucide-react';
import { toast } from 'sonner';
import type { Supplier } from '@/components/inventory/InventoryContext';
import { useInventory } from '@/components/inventory/InventoryContext';
import SupplierCard from './SupplierCard';
import SupplierListRow from './SupplierListRow';
import AddEditSupplierModal from './AddEditSupplierModal';
import ConfirmModal from '@/components/inventory/ui/ConfirmModal';
import SupplierStatsBar from './SupplierStatsBar';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'active' | 'inactive' | 'on-hold';

export default function SupplierManagementContent() {
  const { suppliers, items, addSupplier, removeSupplier, loading: dataLoading } = useInventory();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filtered = useMemo(() => {
    let result = suppliers;
    if (search.trim()) { const q = search.toLowerCase(); result = result.filter((s) => s.name.toLowerCase().includes(q) || s.contactName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.categories.some((c) => c.toLowerCase().includes(q))); }
    if (statusFilter !== 'all') result = result.filter((s) => s.status === statusFilter);
    return result;
  }, [suppliers, search, statusFilter]);

  function getSupplierItems(supplierId: string) { return items.filter((i) => i.supplierId === supplierId); }

  async function handleSave(supplier: Supplier) {
    try { if (editingSupplier) { toast.success(`${supplier.name} updated`); } else { await addSupplier(supplier); toast.success(`${supplier.name} added as a supplier`); } } catch (e: any) { toast.error(e.message || 'Failed to save supplier'); }
    setAddEditOpen(false); setEditingSupplier(null);
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    const sup = suppliers.find((s) => s.id === deleteId);
    try { await removeSupplier(deleteId); toast.success(`${sup?.name ?? 'Supplier'} removed`); } catch (e: any) { toast.error(e.message || 'Failed to remove supplier'); }
    setDeleteLoading(false); setDeleteId(null);
  }

  const statusOptions: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: suppliers.length },
    { value: 'active', label: 'Active', count: suppliers.filter((s) => s.status === 'active').length },
    { value: 'inactive', label: 'Inactive', count: suppliers.filter((s) => s.status === 'inactive').length },
    { value: 'on-hold', label: 'On Hold', count: suppliers.filter((s) => s.status === 'on-hold').length },
  ];

  return (
    <>
      <div className="space-y-6">
        <SupplierStatsBar suppliers={suppliers} />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div><h2 className="text-lg font-bold text-gray-900">{filtered.length} supplier{filtered.length !== 1 ? 's' : ''}</h2><p className="text-xs text-gray-400 font-medium mt-0.5">{suppliers.filter((s) => s.status === 'active').length} active · {suppliers.filter((s) => s.status === 'on-hold').length} on hold</p></div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 gap-0.5">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all duration-150 ${viewMode === 'grid' ? 'gradient-primary text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} aria-label="Grid view"><Grid3X3 size={15} /></button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all duration-150 ${viewMode === 'list' ? 'gradient-primary text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} aria-label="List view"><List size={15} /></button>
            </div>
            <button onClick={() => { setEditingSupplier(null); setAddEditOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all duration-150 active:scale-95 shadow-md glow-blue"><Plus size={16} />Add Supplier</button>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-300 focus-within:shadow-sm transition-all duration-200">
            <Search size={15} className="text-gray-400 flex-shrink-0" />
            <input type="text" placeholder="Search by name, contact, category..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400" />
            {search && <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>}
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
            {statusOptions.map((opt) => (
              <button key={`status-tab-${opt.value}`} onClick={() => setStatusFilter(opt.value)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${statusFilter === opt.value ? 'gradient-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {opt.label}<span className={`text-[10px] px-1 py-0.5 rounded-full font-bold ${statusFilter === opt.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{opt.count}</span>
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center"><Search size={28} className="text-gray-300" /></div>
            <p className="text-base font-bold text-gray-500">No suppliers found</p>
            <p className="text-sm text-gray-400 max-w-xs">{dataLoading ? 'Loading supplier data...' : 'No suppliers match your criteria.'}</p>
            <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="text-sm font-semibold text-blue-600 hover:underline">Clear filters</button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
            {filtered.map((supplier, idx) => <SupplierCard key={supplier.id} supplier={supplier} linkedItems={getSupplierItems(supplier.id)} delay={idx * 50} onEdit={() => { setEditingSupplier(supplier); setAddEditOpen(true); }} onDelete={() => setDeleteId(supplier.id)} />)}
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead><tr className="border-b border-gray-100 bg-gray-50/60">{['Supplier', 'Contact', 'Categories', 'Rating', 'Lead Time', 'Items', 'Status', 'Actions'].map((col) => <th key={`sup-th-${col}`} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{col}</th>)}</tr></thead>
                <tbody>{filtered.map((supplier, idx) => <SupplierListRow key={supplier.id} supplier={supplier} linkedItemCount={getSupplierItems(supplier.id).length} isEven={idx % 2 === 0} onEdit={() => { setEditingSupplier(supplier); setAddEditOpen(true); }} onDelete={() => setDeleteId(supplier.id)} />)}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <AddEditSupplierModal open={addEditOpen} supplier={editingSupplier} onClose={() => { setAddEditOpen(false); setEditingSupplier(null); }} onSave={handleSave} />
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} loading={deleteLoading} title="Remove supplier?" description="This will remove the supplier from your records." confirmLabel="Remove Supplier" />
    </>
  );
}
