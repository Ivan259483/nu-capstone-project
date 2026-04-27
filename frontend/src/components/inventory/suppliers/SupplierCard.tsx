import React, { useState } from 'react';
import { Mail, Phone, Globe, Edit2, Trash2, Star, Clock, Package, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { Supplier, InventoryItem } from '@/components/inventory/InventoryContext';

interface SupplierCardProps { supplier: Supplier; linkedItems: InventoryItem[]; delay?: number; onEdit: () => void; onDelete: () => void; }

const statusConfig = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  'on-hold': { label: 'On Hold', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
};
const categoryColors: Record<string, string> = { Chemicals: 'bg-blue-50 text-blue-700 border border-blue-100', Microfiber: 'bg-purple-50 text-purple-700 border border-purple-100', Equipment: 'bg-emerald-50 text-emerald-700 border border-emerald-100', Consumables: 'bg-amber-50 text-amber-700 border border-amber-100', Packaging: 'bg-cyan-50 text-cyan-700 border border-cyan-100' };

function StarRating({ rating }: { rating: number }) {
  return (<div className="flex items-center gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} size={13} className={s <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />)}<span className="text-xs font-bold text-gray-700 ml-1 font-tabular">{rating}.0</span></div>);
}

export default function SupplierCard({ supplier, linkedItems, delay = 0, onEdit, onDelete }: SupplierCardProps) {
  const [showItems, setShowItems] = useState(false);
  const status = statusConfig[supplier.status];
  const initials = supplier.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const avatarGradients = ['from-blue-500 to-purple-600','from-emerald-500 to-teal-600','from-amber-500 to-orange-600','from-pink-500 to-rose-600','from-cyan-500 to-blue-600','from-violet-500 to-purple-600'];
  const avatarGradient = avatarGradients[supplier.id.charCodeAt(supplier.id.length - 1) % avatarGradients.length];

  return (
    <div className="glass-card glass-card-hover rounded-2xl overflow-hidden flex flex-col card-enter" style={{ animationDelay: `${delay}ms` }}>
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center flex-shrink-0 shadow-md`}><span className="text-white text-sm font-extrabold">{initials}</span></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="text-sm font-bold text-gray-900 truncate leading-tight">{supplier.name}</h3><p className="text-xs text-gray-400 font-medium mt-0.5 truncate">{supplier.contactName}</p></div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${status.className}`}>{status.label}</span>
            </div>
          </div>
        </div>
        <StarRating rating={supplier.rating} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50/60 border border-blue-100/60"><Clock size={13} className="text-blue-500 flex-shrink-0" /><div><div className="text-xs font-bold text-gray-800 font-tabular">{supplier.leadTimeDays}d</div><div className="text-[10px] text-gray-400">Lead time</div></div></div>
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100/60"><Package size={13} className="text-emerald-600 flex-shrink-0" /><div><div className="text-xs font-bold text-gray-800 font-tabular">{linkedItems.length}</div><div className="text-[10px] text-gray-400">Items linked</div></div></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {supplier.categories.map(cat => <span key={`chip-${supplier.id}-${cat}`} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${categoryColors[cat] ?? 'bg-gray-100 text-gray-600'}`}>{cat}</span>)}
          <span className="text-[10px] font-medium text-gray-400 px-1.5 py-0.5 rounded-full bg-gray-50 border border-gray-100">{supplier.paymentTerms}</span>
        </div>
        <div className="space-y-1.5">
          <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600 transition-colors group"><Mail size={12} className="text-gray-300 group-hover:text-blue-500 flex-shrink-0" /><span className="truncate">{supplier.email}</span></a>
          <a href={`tel:${supplier.phone}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600 transition-colors group"><Phone size={12} className="text-gray-300 group-hover:text-blue-500 flex-shrink-0" /><span>{supplier.phone}</span></a>
          {supplier.website && <a href={`https://${supplier.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600 transition-colors group"><Globe size={12} className="text-gray-300 group-hover:text-blue-500 flex-shrink-0" /><span className="truncate">{supplier.website}</span><ExternalLink size={10} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0" /></a>}
        </div>
        {supplier.notes && <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">{supplier.notes}</p>}
      </div>
      {linkedItems.length > 0 && (
        <div className="border-t border-gray-100">
          <button onClick={() => setShowItems(!showItems)} className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-gray-500 hover:bg-blue-50/40 hover:text-blue-700 transition-all duration-150"><span>{linkedItems.length} linked item{linkedItems.length !== 1 ? 's' : ''}</span>{showItems ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {showItems && <div className="px-5 pb-4 space-y-1.5">{linkedItems.map(item => (
            <div key={`linked-${supplier.id}-${item.id}`} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50/60 border border-gray-100">
              <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-700 truncate">{item.name}</p><p className="text-[10px] text-gray-400 font-mono">{item.sku}</p></div>
              <div className="flex items-center gap-1.5 flex-shrink-0"><span className="text-[10px] font-bold text-gray-600 font-tabular">{item.quantity}</span><span className="text-[10px] text-gray-400">{item.unit}</span></div>
            </div>
          ))}</div>}
        </div>
      )}
      <div className="mt-auto border-t border-gray-100 flex">
        <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-gray-500 hover:text-blue-600 hover:bg-blue-50/40 transition-all duration-150 border-r border-gray-100"><Edit2 size={13} />Edit</button>
        <button onClick={onDelete} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-gray-500 hover:text-red-500 hover:bg-red-50/40 transition-all duration-150"><Trash2 size={13} />Remove</button>
      </div>
    </div>
  );
}
