import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Truck, Star } from 'lucide-react';
import Modal from '@/components/inventory/ui/Modal';
import type { Supplier, ItemCategory } from '@/components/inventory/InventoryContext';

interface FormValues { name: string; contactName: string; email: string; phone: string; website: string; rating: number; leadTimeDays: number; paymentTerms: string; status: 'active' | 'inactive' | 'on-hold'; notes: string; categories: ItemCategory[]; }
interface AddEditSupplierModalProps { open: boolean; supplier: Supplier | null; onClose: () => void; onSave: (supplier: Supplier) => void; }

const ALL_CATEGORIES: ItemCategory[] = ['Chemicals', 'Microfiber', 'Equipment', 'Consumables', 'Packaging'];
const PAYMENT_TERMS = ['Prepaid', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'COD'];

export default function AddEditSupplierModal({ open, supplier, onClose, onSave }: AddEditSupplierModalProps) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', contactName: '', email: '', phone: '', website: '', rating: 3, leadTimeDays: 3, paymentTerms: 'Net 30', status: 'active', notes: '', categories: [] },
  });

  useEffect(() => {
    if (supplier) reset({ name: supplier.name, contactName: supplier.contactName, email: supplier.email, phone: supplier.phone, website: supplier.website, rating: supplier.rating, leadTimeDays: supplier.leadTimeDays, paymentTerms: supplier.paymentTerms, status: supplier.status, notes: supplier.notes, categories: supplier.categories });
    else reset({ name: '', contactName: '', email: '', phone: '', website: '', rating: 3, leadTimeDays: 3, paymentTerms: 'Net 30', status: 'active', notes: '', categories: [] });
  }, [supplier, open, reset]);

  const watchedRating = watch('rating');
  const watchedCategories = watch('categories');
  function toggleCategory(cat: ItemCategory) { const cur = watchedCategories ?? []; if (cur.includes(cat)) setValue('categories', cur.filter(c => c !== cat)); else setValue('categories', [...cur, cat]); }

  function onSubmit(data: FormValues) {
    return new Promise<void>(resolve => { setTimeout(() => {
      const ns: Supplier = { id: supplier?.id ?? `sup-${Date.now()}`, ...data, itemCount: supplier?.itemCount ?? 0, totalOrders: supplier?.totalOrders ?? 0, lastOrderDate: supplier?.lastOrderDate ?? new Date().toISOString().split('T')[0] };
      onSave(ns); resolve();
    }, 600); });
  }

  const inputClass = (err: boolean) => `w-full text-sm font-medium text-gray-800 bg-white border rounded-xl px-3 py-2.5 outline-none transition-all duration-200 placeholder-gray-300 ${err ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100' : 'border-gray-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-100'}`;
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 tracking-wide';
  const errorClass = 'text-xs text-red-500 font-medium mt-1';
  const helperClass = 'text-xs text-gray-400 mt-1';
  const categoryColors: Record<string, string> = { Chemicals: 'border-blue-200 bg-blue-50 text-blue-700', Microfiber: 'border-purple-200 bg-purple-50 text-purple-700', Equipment: 'border-emerald-200 bg-emerald-50 text-emerald-700', Consumables: 'border-amber-200 bg-amber-50 text-amber-700', Packaging: 'border-cyan-200 bg-cyan-50 text-cyan-700' };

  return (
    <Modal open={open} onClose={onClose} title={supplier ? 'Edit Supplier' : 'Add New Supplier'} subtitle={supplier ? `Editing ${supplier.name}` : 'Add a procurement partner'} size="xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="px-6 py-5 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center"><Truck size={12} className="text-white" /></div><h3 className="text-sm font-bold text-gray-800">Company Information</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={labelClass} htmlFor="sup-name">Company Name</label><input id="sup-name" type="text" placeholder="e.g. ProDetail Supply Co." className={inputClass(!!errors.name)} {...register('name', { required: 'Company name is required', minLength: { value: 2, message: 'Too short' } })} />{errors.name && <p className={errorClass}>{errors.name.message}</p>}</div>
              <div><label className={labelClass} htmlFor="sup-contact">Contact Name</label><input id="sup-contact" type="text" placeholder="e.g. Jordan Walsh" className={inputClass(!!errors.contactName)} {...register('contactName', { required: 'Contact name is required' })} />{errors.contactName && <p className={errorClass}>{errors.contactName.message}</p>}</div>
              <div><label className={labelClass} htmlFor="sup-status">Status</label><select id="sup-status" className={inputClass(false)} {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option><option value="on-hold">On Hold</option></select></div>
              <div><label className={labelClass} htmlFor="sup-email">Email Address</label><input id="sup-email" type="email" placeholder="orders@supplier.com" className={inputClass(!!errors.email)} {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } })} />{errors.email && <p className={errorClass}>{errors.email.message}</p>}</div>
              <div><label className={labelClass} htmlFor="sup-phone">Phone Number</label><input id="sup-phone" type="tel" placeholder="+1 (415) 000-0000" className={inputClass(!!errors.phone)} {...register('phone', { required: 'Phone is required' })} />{errors.phone && <p className={errorClass}>{errors.phone.message}</p>}</div>
              <div className="sm:col-span-2"><label className={labelClass} htmlFor="sup-website">Website</label><input id="sup-website" type="text" placeholder="supplier.com" className={inputClass(false)} {...register('website')} /><p className={helperClass}>Without https://</p></div>
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center"><span className="text-white text-[10px] font-bold">$</span></div><h3 className="text-sm font-bold text-gray-800">Supply Terms</h3></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><label className={labelClass} htmlFor="sup-lead">Lead Time (days)</label><input id="sup-lead" type="number" min="1" max="90" className={inputClass(!!errors.leadTimeDays)} {...register('leadTimeDays', { required: 'Required', min: { value: 1, message: 'Min 1 day' }, valueAsNumber: true })} />{errors.leadTimeDays && <p className={errorClass}>{errors.leadTimeDays.message}</p>}</div>
              <div><label className={labelClass} htmlFor="sup-terms">Payment Terms</label><select id="sup-terms" className={inputClass(false)} {...register('paymentTerms')}>{PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div>
                <label className={labelClass}>Supplier Rating</label>
                <div className="flex items-center gap-1 mt-1">{[1,2,3,4,5].map(s => <button key={s} type="button" onClick={() => setValue('rating', s)} className="transition-transform duration-100 hover:scale-110 active:scale-95"><Star size={22} className={s <= watchedRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} /></button>)}<span className="text-sm font-bold text-gray-700 ml-2 font-tabular">{watchedRating}.0</span></div>
                <input type="hidden" {...register('rating', { valueAsNumber: true })} />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <div className="flex items-center gap-2 mb-3"><div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center"><span className="text-white text-[10px] font-bold">C</span></div><h3 className="text-sm font-bold text-gray-800">Product Categories Supplied</h3></div>
            <p className="text-xs text-gray-400 mb-3">Select all categories this supplier provides</p>
            <div className="flex flex-wrap gap-2">{ALL_CATEGORIES.map(cat => { const sel = (watchedCategories ?? []).includes(cat); return (<button key={cat} type="button" onClick={() => toggleCategory(cat)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 active:scale-95 ${sel ? `${categoryColors[cat]} shadow-sm` : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>{sel && <span className="mr-1">✓</span>}{cat}</button>); })}</div>
            {(watchedCategories ?? []).length === 0 && <p className="text-xs text-amber-500 font-medium mt-2">Select at least one category</p>}
          </div>
          <div className="border-t border-gray-100" />
          <div><label className={labelClass} htmlFor="sup-notes">Internal Notes</label><textarea id="sup-notes" rows={3} placeholder="Discount codes, quality notes..." className={`${inputClass(false)} resize-none`} {...register('notes')} /><p className={helperClass}>Private notes — not shared with supplier</p></div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/40">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-all duration-150 active:scale-95">Cancel</button>
          <button type="submit" disabled={isSubmitting || (watchedCategories ?? []).length === 0} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all duration-150 active:scale-95 shadow-md flex items-center gap-2 min-w-[130px] justify-center disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : supplier ? 'Save Changes' : 'Add Supplier'}</button>
        </div>
      </form>
    </Modal>
  );
}
