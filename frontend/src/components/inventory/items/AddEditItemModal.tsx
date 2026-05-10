import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Package } from 'lucide-react';
import Modal from '@/components/inventory/ui/Modal';
import type { InventoryItem, ItemCategory, ItemStatus } from '@/components/inventory/InventoryContext';
import { useInventory } from '@/components/inventory/InventoryContext';

interface FormValues {
  name: string; sku: string; category: ItemCategory; quantity: number; maxQuantity: number; minStock: number; unit: string; costPerUnit: number; supplierId: string; notes: string;
}

interface AddEditItemModalProps { open: boolean; item: InventoryItem | null; onClose: () => void; onSave: (item: InventoryItem) => void; }

const CATEGORIES: ItemCategory[] = ['Chemicals', 'Microfiber', 'Equipment', 'Consumables', 'Packaging'];
const UNITS = ['bottles', 'liters', 'pieces', 'tubs', 'rolls', 'boxes', 'units', 'packs', 'sets', 'bags'];

function deriveStatus(qty: number, minStock: number): ItemStatus {
  if (qty === 0) return 'out-of-stock';
  if (qty <= minStock * 0.5) return 'critical';
  if (qty <= minStock) return 'low-stock';
  return 'in-stock';
}

export default function AddEditItemModal({ open, item, onClose, onSave }: AddEditItemModalProps) {
  const { suppliers } = useInventory();
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', sku: '', category: 'Chemicals', quantity: 0, maxQuantity: 50, minStock: 10, unit: 'bottles', costPerUnit: 0, supplierId: suppliers.length > 0 ? suppliers[0].id : '', notes: '' },
  });

  useEffect(() => {
    if (item) reset({ name: item.name, sku: item.sku, category: item.category, quantity: item.quantity, maxQuantity: item.maxQuantity, minStock: item.minStock, unit: item.unit, costPerUnit: item.costPerUnit, supplierId: item.supplierId, notes: item.notes });
    else reset({ name: '', sku: '', category: 'Chemicals', quantity: 0, maxQuantity: 50, minStock: 10, unit: 'bottles', costPerUnit: 0, supplierId: suppliers.length > 0 ? suppliers[0].id : '', notes: '' });
  }, [item, open, reset]);

  const watchedQty = watch('quantity');
  const watchedMin = watch('minStock');
  const watchedSupplier = watch('supplierId');
  const selectedSupplier = suppliers.find((s) => s.id === watchedSupplier);
  const currentPct = watchedQty && watchedMin ? Math.round((Number(watchedQty) / (watch('maxQuantity') || 50)) * 100) : 0;

  function onSubmit(data: FormValues) {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const supplierObj = suppliers.find((s) => s.id === data.supplierId);
        const newItem: InventoryItem = { id: item?.id ?? `item-${Date.now()}`, ...data, supplierName: supplierObj?.name ?? '', status: deriveStatus(Number(data.quantity), Number(data.minStock)), lastRestocked: item?.lastRestocked ?? new Date().toISOString().split('T')[0] };
        onSave(newItem); resolve();
      }, 600);
    });
  }

  const inputClass = (hasError: boolean) => `w-full text-sm font-medium text-gray-800 bg-white border rounded-xl px-3 py-2.5 outline-none transition-all duration-200 placeholder-gray-300 ${hasError ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100' : 'border-gray-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-100'}`;
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 tracking-wide';
  const helperClass = 'text-xs text-gray-400 mt-1';
  const errorClass = 'text-xs text-red-500 font-medium mt-1';

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit Inventory Item' : 'Add New Item'} subtitle={item ? `Editing ${item.name}` : 'Add a new product to your inventory'} size="xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="px-6 py-5 space-y-6">
          {item && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100/80">
              <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-gray-600">Current Stock Level</span><span className="text-xs font-bold text-gray-800 font-tabular">{currentPct}% capacity</span></div>
              <div className="h-2 bg-white/60 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${currentPct === 0 ? 'bg-gray-300' : currentPct <= 20 ? 'bg-gradient-to-r from-red-500 to-red-400' : currentPct <= 40 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'}`} style={{ width: `${currentPct}%` }} /></div>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center"><Package size={12} className="text-white" /></div><h3 className="text-sm font-bold text-gray-800">Basic Information</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={labelClass} htmlFor="item-name">Product Name</label><input id="item-name" type="text" placeholder="e.g. Iron Remover Spray 500ml" className={inputClass(!!errors.name)} {...register('name', { required: 'Product name is required', minLength: { value: 3, message: 'Name must be at least 3 characters' } })} />{errors.name && <p className={errorClass}>{errors.name.message}</p>}</div>
              <div><label className={labelClass} htmlFor="item-sku">SKU Code</label><input id="item-sku" type="text" placeholder="e.g. CHM-IR-001" className={inputClass(!!errors.sku)} {...register('sku', { required: 'SKU is required', pattern: { value: /^[A-Z]{2,4}-[A-Z]{2,4}-\d{3}$/i, message: 'Format: CAT-TYPE-000' } })} />{errors.sku ? <p className={errorClass}>{errors.sku.message}</p> : <p className={helperClass}>Format: CAT-TYPE-000</p>}</div>
              <div><label className={labelClass} htmlFor="item-category">Category</label><select id="item-category" className={inputClass(!!errors.category)} {...register('category', { required: 'Category is required' })}>{CATEGORIES.map((cat) => <option key={`cat-opt-${cat}`} value={cat}>{cat}</option>)}</select>{errors.category && <p className={errorClass}>{errors.category.message}</p>}</div>
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center"><span className="text-white text-[10px] font-bold">QTY</span></div><h3 className="text-sm font-bold text-gray-800">Stock Configuration</h3></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><label className={labelClass} htmlFor="item-qty">Current Qty</label><input id="item-qty" type="number" min="0" className={inputClass(!!errors.quantity)} {...register('quantity', { required: 'Required', min: { value: 0, message: 'Cannot be negative' }, valueAsNumber: true })} />{errors.quantity && <p className={errorClass}>{errors.quantity.message}</p>}</div>
              <div><label className={labelClass} htmlFor="item-max">Max Capacity</label><input id="item-max" type="number" min="1" className={inputClass(!!errors.maxQuantity)} {...register('maxQuantity', { required: 'Required', min: { value: 1, message: 'Must be at least 1' }, valueAsNumber: true })} />{errors.maxQuantity && <p className={errorClass}>{errors.maxQuantity.message}</p>}</div>
              <div><label className={labelClass} htmlFor="item-min">Reorder Point</label><input id="item-min" type="number" min="1" className={inputClass(!!errors.minStock)} {...register('minStock', { required: 'Required', min: { value: 1, message: 'Must be at least 1' }, valueAsNumber: true })} /><p className={helperClass}>Alert triggers below this</p>{errors.minStock && <p className={errorClass}>{errors.minStock.message}</p>}</div>
              <div><label className={labelClass} htmlFor="item-unit">Unit of Measure</label><select id="item-unit" className={inputClass(!!errors.unit)} {...register('unit', { required: 'Required' })}>{UNITS.map((u) => <option key={`unit-opt-${u}`} value={u}>{u}</option>)}</select>{errors.unit && <p className={errorClass}>{errors.unit.message}</p>}</div>
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center"><span className="text-white text-[10px] font-bold">₱</span></div><h3 className="text-sm font-bold text-gray-800">Pricing & Supplier</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelClass} htmlFor="item-cost">Cost per Unit (PHP)</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">₱</span><input id="item-cost" type="number" step="0.01" min="0" className={`${inputClass(!!errors.costPerUnit)} pl-7`} {...register('costPerUnit', { required: 'Cost is required', min: { value: 0, message: 'Cannot be negative' }, valueAsNumber: true })} /></div>{errors.costPerUnit && <p className={errorClass}>{errors.costPerUnit.message}</p>}</div>
              <div><label className={labelClass} htmlFor="item-supplier">Supplier</label><select id="item-supplier" className={inputClass(!!errors.supplierId)} {...register('supplierId', { required: 'Supplier is required' })}>{suppliers.map((s) => <option key={`sup-opt-${s.id}`} value={s.id}>{s.name}</option>)}</select>{selectedSupplier && <p className={helperClass}>Lead time: {selectedSupplier.leadTimeDays} day{selectedSupplier.leadTimeDays !== 1 ? 's' : ''} · {selectedSupplier.paymentTerms}</p>}{errors.supplierId && <p className={errorClass}>{errors.supplierId.message}</p>}</div>
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div><label className={labelClass} htmlFor="item-notes">Notes</label><textarea id="item-notes" rows={3} placeholder="Usage notes, storage requirements..." className={`${inputClass(false)} resize-none`} {...register('notes')} /><p className={helperClass}>Optional — visible to staff during stock operations</p></div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/40">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-all duration-150 active:scale-95">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all duration-150 active:scale-95 shadow-md flex items-center gap-2 min-w-[120px] justify-center disabled:opacity-70">{isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : item ? 'Save Changes' : 'Add to Inventory'}</button>
        </div>
      </form>
    </Modal>
  );
}
